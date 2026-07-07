<script setup lang="ts">
import { computed } from 'vue'
import { useInterviewQuizStore } from '@/stores/interviewQuiz'

const props = defineProps<{
  sessionId: string
}>()

const emit = defineEmits<{
  'review': [sessionId: string]
  'restart': [sessionId: string]
  'new': []
}>()

const quizStore = useInterviewQuizStore()

const currentSession = computed(() => quizStore.sessions.find((s) => s.id === props.sessionId))

interface SessionStats {
  total: number
  known: number
  partial: number
  unknown: number
  masteryRate: number
  avgTime: number
}

const sessionStats = computed<SessionStats | null>(() => {
  if (!currentSession.value) return null
  const answers = Array.from(currentSession.value.answers.values())
  const total = answers.length
  const known = answers.filter((a) => a.rating === 'known').length
  const partial = answers.filter((a) => a.rating === 'partial').length
  const unknown = answers.filter((a) => a.rating === 'unknown').length
  const totalTime = answers.reduce((sum, a) => sum + a.timeSpent, 0)
  const avgTime = total > 0 ? Math.round(totalTime / total) : 0
  const masteryRate = total > 0 ? Math.round(((known + partial * 0.5) / total) * 100) : 0
  return { total, known, partial, unknown, masteryRate, avgTime }
})

interface CategoryStat {
  category: string
  known: number
  partial: number
  unknown: number
  total: number
  masteryRate: number
}

const categoryStats = computed<CategoryStat[]>(() => {
  const session = currentSession.value
  if (!session) return []
  const stats: Record<string, { known: number; partial: number; unknown: number; total: number }> = {}
  for (const [questionId, answer] of session.answers) {
    const question = session.questions.find((item) => item.id === questionId)
    if (!question) continue
    const category = question.category
    if (!stats[category]) stats[category] = { known: 0, partial: 0, unknown: 0, total: 0 }
    stats[category]!.total++
    stats[category]![answer.rating]++
  }
  return Object.entries(stats)
    .map(([category, data]) => ({
      category,
      ...data,
      masteryRate: data.total > 0 ? Math.round(((data.known + data.partial * 0.5) / data.total) * 100) : 0,
    }))
    .sort((a, b) => a.masteryRate - b.masteryRate)
})

const weakCategories = computed(() => categoryStats.value.filter((c) => c.total >= 2 && c.masteryRate < 60))
const strongCategories = computed(() => categoryStats.value.filter((c) => c.total >= 2 && c.masteryRate >= 80))

const grade = computed(() => {
  const rate = sessionStats.value?.masteryRate ?? 0
  if (rate >= 80) return { label: '优秀', color: '#10b981' }
  if (rate >= 60) return { label: '良好', color: '#3b82f6' }
  if (rate >= 40) return { label: '及格', color: '#f59e0b' }
  return { label: '需加强', color: '#ef4444' }
})

function rateClass(rate: number): string {
  if (rate >= 80) return 'high'
  if (rate >= 60) return 'medium'
  return 'low'
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}秒`
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return secs ? `${mins}分${secs}秒` : `${mins}分钟`
}

function reviewSession() {
  emit('review', props.sessionId)
}

function restartSession() {
  emit('restart', props.sessionId)
}

function startNew() {
  emit('new')
}
</script>

<template>
  <div v-if="currentSession && sessionStats" class="quiz-result-panel">
    <!-- 结果头部 -->
    <div class="result-header">
      <div class="grade-badge" :style="{ '--grade-color': grade.color }">
        <span class="grade-label">{{ grade.label }}</span>
      </div>
      <div class="accuracy-score">
        <span class="score-value">{{ sessionStats.masteryRate }}%</span>
        <span class="score-label">掌握率</span>
      </div>
    </div>

    <!-- 核心统计 -->
    <div class="core-stats">
      <div class="stat-card">
        <span class="stat-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg></span>
        <div class="stat-content">
          <span class="stat-value">{{ sessionStats.total }}</span>
          <span class="stat-label">总题数</span>
        </div>
      </div>
      <div class="stat-card correct">
        <span class="stat-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" /></svg></span>
        <div class="stat-content">
          <span class="stat-value">{{ sessionStats.known }}</span>
          <span class="stat-label">会</span>
        </div>
      </div>
      <div class="stat-card partial">
        <span class="stat-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><line x1="5" y1="12" x2="19" y2="12" /></svg></span>
        <div class="stat-content">
          <span class="stat-value">{{ sessionStats.partial }}</span>
          <span class="stat-label">部分会</span>
        </div>
      </div>
      <div class="stat-card wrong">
        <span class="stat-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" /></svg></span>
        <div class="stat-content">
          <span class="stat-value">{{ sessionStats.unknown }}</span>
          <span class="stat-label">不会</span>
        </div>
      </div>
      <div class="stat-card time">
        <span class="stat-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg></span>
        <div class="stat-content">
          <span class="stat-value">{{ formatTime(sessionStats.avgTime) }}</span>
          <span class="stat-label">平均用时</span>
        </div>
      </div>
    </div>

    <!-- 领域分析 -->
    <div v-if="categoryStats.length" class="category-analysis">
      <h3 class="section-title">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
        领域分析
      </h3>

      <!-- 薄弱领域 -->
      <div v-if="weakCategories.length" class="analysis-section weak">
        <div class="section-header">
          <span class="section-label">薄弱领域</span>
          <span class="section-desc">建议重点复习，掌握度已回写题库</span>
        </div>
        <div class="category-list">
          <div v-for="c in weakCategories" :key="c.category" class="category-item">
            <span class="category-name">{{ c.category }}</span>
            <div class="category-bar">
              <div class="bar-known" :style="{ width: (c.known / c.total * 100) + '%' }"></div>
              <div class="bar-partial" :style="{ width: (c.partial / c.total * 100) + '%' }"></div>
            </div>
            <span class="category-rate">{{ c.masteryRate }}%</span>
            <span class="category-count">{{ c.known }}/{{ c.total }}</span>
          </div>
        </div>
      </div>

      <!-- 优势领域 -->
      <div v-if="strongCategories.length" class="analysis-section strong">
        <div class="section-header">
          <span class="section-label">优势领域</span>
          <span class="section-desc">继续保持</span>
        </div>
        <div class="category-list">
          <div v-for="c in strongCategories" :key="c.category" class="category-item">
            <span class="category-name">{{ c.category }}</span>
            <div class="category-bar">
              <div class="bar-known" :style="{ width: (c.known / c.total * 100) + '%' }"></div>
              <div class="bar-partial" :style="{ width: (c.partial / c.total * 100) + '%' }"></div>
            </div>
            <span class="category-rate">{{ c.masteryRate }}%</span>
            <span class="category-count">{{ c.known }}/{{ c.total }}</span>
          </div>
        </div>
      </div>

      <!-- 全部领域 -->
      <div class="analysis-section all">
        <div class="section-header">
          <span class="section-label">全部领域</span>
        </div>
        <div class="category-grid">
          <div v-for="c in categoryStats" :key="c.category" class="category-card">
            <div class="category-card-header">
              <span class="category-card-dot" aria-hidden="true"></span>
              <span class="category-card-name">{{ c.category }}</span>
            </div>
            <div class="category-card-stats">
              <div class="cat-stat-item">
                <span class="cat-stat-label">掌握率</span>
                <span class="cat-stat-value" :class="rateClass(c.masteryRate)">{{ c.masteryRate }}%</span>
              </div>
              <div class="cat-stat-item">
                <span class="cat-stat-label">题数</span>
                <span class="cat-stat-value">{{ c.total }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 操作按钮 -->
    <div class="result-actions">
      <button type="button" class="btn-review" @click="reviewSession">
        <span class="btn-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg></span>
        查看解析
      </button>
      <button type="button" class="btn-restart" @click="restartSession">
        <span class="btn-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M23 4v6h-6" /><path d="M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" /><path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" /></svg></span>
        重新测试
      </button>
      <button type="button" class="btn-new" @click="startNew">
        <span class="btn-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" /></svg></span>
        新的自测
      </button>
    </div>
  </div>

  <!-- 空状态 -->
  <div v-else class="empty-state">
    <span class="empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg></span>
    <p>未找到测试结果</p>
  </div>
</template>

<style scoped>
.quiz-result-panel {
  display: flex;
  flex-direction: column;
  gap: 22px;
  width: 100%;
}

.result-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 28px;
  padding: 24px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
}

.grade-badge {
  display: inline-flex;
  align-items: center;
  padding: 10px 26px;
  background: color-mix(in srgb, var(--grade-color) 12%, transparent);
  border: 1px solid var(--grade-color);
  border-radius: 999px;
}

.grade-label {
  font-size: 18px;
  font-weight: 800;
  color: var(--grade-color);
}

.accuracy-score {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.score-value {
  font-size: 36px;
  font-weight: 900;
  color: var(--primary-600);
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.score-label {
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 700;
  margin-top: 4px;
}

.core-stats {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 10px;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card);
}

.stat-card.correct {
  border-color: rgba(26, 143, 94, 0.3);
  background: rgba(26, 143, 94, 0.04);
}

.stat-card.partial {
  border-color: rgba(224, 138, 58, 0.3);
  background: rgba(224, 138, 58, 0.04);
}

.stat-card.wrong {
  border-color: rgba(216, 80, 80, 0.3);
  background: rgba(216, 80, 80, 0.04);
}

.stat-card.time {
  border-color: var(--border-accent);
  background: rgba(43, 123, 184, 0.04);
}

.stat-card.correct .stat-icon {
  color: var(--accent-green);
}

.stat-card.partial .stat-icon {
  color: var(--accent-orange);
}

.stat-card.wrong .stat-icon {
  color: var(--accent-red);
}

.stat-card.time .stat-icon {
  color: var(--primary-600);
}

.stat-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  flex-shrink: 0;
}

.stat-icon svg {
  width: 18px;
  height: 18px;
}

.stat-icon svg path,
.stat-icon svg circle,
.stat-icon svg line,
.stat-icon svg polyline {
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  fill: none;
}

.stat-content {
  display: flex;
  flex-direction: column;
}

.stat-value {
  font-size: 18px;
  font-weight: 900;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}

.stat-label {
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 700;
}

.category-analysis {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.section-title {
  margin: 0;
  font-size: 17px;
  font-weight: 800;
  color: var(--text-primary);
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.section-title svg {
  width: 18px;
  height: 18px;
  color: var(--primary-600);
}

.section-title line {
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  fill: none;
}

.analysis-section {
  padding: 18px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
}

.analysis-section.weak {
  border-color: rgba(216, 80, 80, 0.25);
  background: rgba(216, 80, 80, 0.03);
}

.analysis-section.strong {
  border-color: rgba(26, 143, 94, 0.25);
  background: rgba(26, 143, 94, 0.03);
}

.section-header {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 14px;
}

.section-label {
  font-size: 14px;
  font-weight: 800;
  color: var(--text-primary);
}

.analysis-section.weak .section-label {
  color: var(--accent-red);
}

.analysis-section.strong .section-label {
  color: var(--accent-green);
}

.section-desc {
  font-size: 12px;
  color: var(--text-muted);
}

.category-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.category-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 9px;
  background: var(--bg-card-muted);
}

.category-name {
  font-weight: 700;
  color: var(--text-primary);
  min-width: 90px;
  font-size: 13px;
}

.category-bar {
  flex: 1;
  height: 8px;
  border-radius: 4px;
  background: var(--bg-card);
  overflow: hidden;
  display: flex;
}

.bar-known {
  background: var(--accent-green);
}

.bar-partial {
  background: var(--accent-orange);
}

.category-rate {
  min-width: 44px;
  text-align: right;
  font-size: 13px;
  font-weight: 800;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.category-count {
  min-width: 44px;
  text-align: right;
  font-size: 12px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.category-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
}

.category-card {
  padding: 14px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card-muted);
}

.category-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.category-card-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--primary-500);
  flex-shrink: 0;
}

.category-card-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
}

.category-card-stats {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cat-stat-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.cat-stat-label {
  font-size: 12px;
  color: var(--text-muted);
}

.cat-stat-value {
  font-size: 14px;
  font-weight: 800;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.cat-stat-value.high {
  color: var(--accent-green);
}

.cat-stat-value.medium {
  color: var(--accent-orange);
}

.cat-stat-value.low {
  color: var(--accent-red);
}

.result-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
  flex-wrap: wrap;
}

.result-actions button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 11px 22px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.btn-icon {
  display: inline-flex;
}

.btn-icon svg {
  width: 16px;
  height: 16px;
}

.btn-icon svg path,
.btn-icon svg circle,
.btn-icon svg line,
.btn-icon svg polyline {
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  fill: none;
}

.btn-review {
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-primary);
}

.btn-review:hover {
  border-color: var(--primary-500);
  color: var(--primary-600);
}

.btn-restart {
  border: 1px solid var(--primary-500);
  background: transparent;
  color: var(--primary-600);
}

.btn-restart:hover {
  background: var(--primary-600);
  color: #fff;
}

.btn-new {
  border: none;
  background: var(--primary-600);
  color: #fff;
}

.btn-new:hover {
  background: var(--primary-700);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 60px 24px;
  text-align: center;
}

.empty-icon {
  display: inline-flex;
  width: 48px;
  height: 48px;
  color: var(--primary-500);
  opacity: 0.5;
}

.empty-icon svg {
  width: 100%;
  height: 100%;
}

.empty-icon line {
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  fill: none;
}

.empty-state p {
  margin: 0;
  color: var(--text-secondary);
}

@media (max-width: 768px) {
  .core-stats {
    grid-template-columns: repeat(2, 1fr);
  }

  .result-actions {
    flex-direction: column;
  }

  .result-actions button {
    width: 100%;
    justify-content: center;
  }
}
</style>
