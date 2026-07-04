<script setup lang="ts">
import { computed } from 'vue'
import { useInterviewQuizStore, QUESTION_TAG_INFO, type QuestionTag } from '@/stores/interviewQuiz'

const props = defineProps<{
  sessionId: string
}>()

const emit = defineEmits<{
  'review': [sessionId: string]
  'restart': [sessionId: string]
  'new': []
}>()

const quizStore = useInterviewQuizStore()

const currentSession = computed(() => {
  return quizStore.sessions.find(s => s.id === props.sessionId)
})

// 会话统计
const sessionStats = computed(() => {
  if (!currentSession.value) return null

  const answers = Array.from(currentSession.value.answers.values())
  const total = answers.length
  const correct = answers.filter(a => a.isCorrect).length
  const wrong = answers.filter(a => !a.isCorrect && a.status !== 'skipped').length
  const skipped = answers.filter(a => a.status === 'skipped').length
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0

  // 总用时
  const totalTime = answers.reduce((sum, a) => sum + a.timeSpent, 0)
  const avgTime = total > 0 ? Math.round(totalTime / total) : 0

  return { total, correct, wrong, skipped, accuracy, avgTime }
})

// 按标签统计
const tagStats = computed(() => {
  if (!currentSession.value) return []

  const stats: Partial<Record<QuestionTag, { correct: number; wrong: number; skipped: number; total: number }>> = {}

  for (const [questionId, answer] of currentSession.value.answers) {
    const question = quizStore.getQuestion(questionId)
    if (!question) continue

    for (const tag of question.tags) {
      const stat = stats[tag] ?? { correct: 0, wrong: 0, skipped: 0, total: 0 }
      stats[tag] = stat

      stat.total++
      if (answer.status === 'correct') stat.correct++
      else if (answer.status === 'wrong') stat.wrong++
      else stat.skipped++
    }
  }

  return Object.entries(stats)
    .map(([tagId, data]) => {
      const typedTagId = tagId as QuestionTag
      return {
        tagId: typedTagId,
        ...data,
        accuracy: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
        info: QUESTION_TAG_INFO[typedTagId],
      }
    })
    .sort((a, b) => b.total - a.total)
})

// 薄弱知识点（正确率 < 60% 且至少 3 题）
const weakTags = computed(() => {
  return tagStats.value.filter(t => t.total >= 3 && t.accuracy < 60)
})

// 优势知识点（正确率 > 80% 且至少 3 题）
const strongTags = computed(() => {
  return tagStats.value.filter(t => t.total >= 3 && t.accuracy > 80)
})

// 评级
const grade = computed(() => {
  const acc = sessionStats.value?.accuracy || 0
  if (acc >= 90) return { label: '优秀', color: '#10b981', emoji: '🌟' }
  if (acc >= 80) return { label: '良好', color: '#3b82f6', emoji: '👍' }
  if (acc >= 60) return { label: '及格', color: '#f59e0b', emoji: '😐' }
  return { label: '需加强', color: '#ef4444', emoji: '💪' }
})

// 格式化时间
function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}秒`
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}分${secs}秒`
}

// 操作
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
        <span class="grade-emoji">{{ grade.emoji }}</span>
        <span class="grade-label">{{ grade.label }}</span>
      </div>
      <div class="accuracy-score">
        <span class="score-value">{{ sessionStats.accuracy }}%</span>
        <span class="score-label">正确率</span>
      </div>
    </div>

    <!-- 核心统计 -->
    <div class="core-stats">
      <div class="stat-card">
        <span class="stat-icon">📝</span>
        <div class="stat-content">
          <span class="stat-value">{{ sessionStats.total }}</span>
          <span class="stat-label">总题数</span>
        </div>
      </div>
      <div class="stat-card correct">
        <span class="stat-icon">✓</span>
        <div class="stat-content">
          <span class="stat-value">{{ sessionStats.correct }}</span>
          <span class="stat-label">正确</span>
        </div>
      </div>
      <div class="stat-card wrong">
        <span class="stat-icon">✗</span>
        <div class="stat-content">
          <span class="stat-value">{{ sessionStats.wrong }}</span>
          <span class="stat-label">错误</span>
        </div>
      </div>
      <div class="stat-card skipped">
        <span class="stat-icon">⊘</span>
        <div class="stat-content">
          <span class="stat-value">{{ sessionStats.skipped }}</span>
          <span class="stat-label">跳过</span>
        </div>
      </div>
      <div class="stat-card time">
        <span class="stat-icon">⏱</span>
        <div class="stat-content">
          <span class="stat-value">{{ formatTime(sessionStats.avgTime) }}</span>
          <span class="stat-label">平均用时</span>
        </div>
      </div>
    </div>

    <!-- 知识点分析 -->
    <div class="tag-analysis">
      <h3 class="section-title">📊 知识点分析</h3>

      <!-- 薄弱知识点 -->
      <div v-if="weakTags.length > 0" class="analysis-section weak">
        <div class="section-header">
          <span class="section-label">薄弱知识点</span>
          <span class="section-desc">需要重点复习</span>
        </div>
        <div class="tag-list">
          <div
            v-for="tag in weakTags"
            :key="tag.tagId"
            class="tag-item"
            :style="{ '--tag-color': tag.info?.color || '#999' }"
          >
            <span class="tag-icon">{{ tag.info?.icon }}</span>
            <span class="tag-name">{{ tag.info?.name }}</span>
            <span class="tag-stats">{{ tag.correct }}/{{ tag.total }} ({{ tag.accuracy }}%)</span>
            <div class="tag-bar">
              <div class="tag-bar-fill correct" :style="{ width: (tag.correct / tag.total * 100) + '%' }"></div>
              <div class="tag-bar-fill wrong" :style="{ width: (tag.wrong / tag.total * 100) + '%' }"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- 优势知识点 -->
      <div v-if="strongTags.length > 0" class="analysis-section strong">
        <div class="section-header">
          <span class="section-label">优势知识点</span>
          <span class="section-desc">继续保持</span>
        </div>
        <div class="tag-list">
          <div
            v-for="tag in strongTags"
            :key="tag.tagId"
            class="tag-item"
            :style="{ '--tag-color': tag.info?.color || '#999' }"
          >
            <span class="tag-icon">{{ tag.info?.icon }}</span>
            <span class="tag-name">{{ tag.info?.name }}</span>
            <span class="tag-stats">{{ tag.correct }}/{{ tag.total }} ({{ tag.accuracy }}%)</span>
            <div class="tag-bar">
              <div class="tag-bar-fill correct" :style="{ width: (tag.correct / tag.total * 100) + '%' }"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- 所有知识点详情 -->
      <div class="analysis-section all-tags">
        <div class="section-header">
          <span class="section-label">详细统计</span>
        </div>
        <div class="tag-grid">
          <div
            v-for="tag in tagStats"
            :key="tag.tagId"
            class="tag-card"
            :style="{ '--tag-color': tag.info?.color || '#999' }"
          >
            <div class="tag-card-header">
              <span class="tag-card-icon">{{ tag.info?.icon }}</span>
              <span class="tag-card-name">{{ tag.info?.name }}</span>
            </div>
            <div class="tag-card-stats">
              <div class="tag-stat-item">
                <span class="tag-stat-label">正确率</span>
                <span class="tag-stat-value" :class="{ high: tag.accuracy >= 80, medium: tag.accuracy >= 60 && tag.accuracy < 80, low: tag.accuracy < 60 }">
                  {{ tag.accuracy }}%
                </span>
              </div>
              <div class="tag-stat-item">
                <span class="tag-stat-label">题目</span>
                <span class="tag-stat-value">{{ tag.total }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 操作按钮 -->
    <div class="result-actions">
      <button type="button" class="btn-review" @click="reviewSession">
        <span class="btn-icon">📖</span>
        查看解析
      </button>
      <button type="button" class="btn-restart" @click="restartSession">
        <span class="btn-icon">🔄</span>
        重新测试
      </button>
      <button type="button" class="btn-new" @click="startNew">
        <span class="btn-icon">➕</span>
        新的自测
      </button>
    </div>
  </div>

  <!-- 空状态 -->
  <div v-else class="empty-state">
    <span class="empty-icon">📊</span>
    <p>未找到测试结果</p>
  </div>
</template>

<style scoped>
.quiz-result-panel {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 24px;
  max-width: 800px;
  margin: 0 auto;
}

.result-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
  padding: 24px;
  background: var(--bg-card);
  border-radius: 16px;
}

.grade-badge {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 24px;
  background: color-mix(in srgb, var(--grade-color) 15%, transparent);
  border: 2px solid var(--grade-color);
  border-radius: 12px;
}

.grade-emoji {
  font-size: 32px;
}

.grade-label {
  font-size: 18px;
  font-weight: 700;
  color: var(--grade-color);
}

.accuracy-score {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.score-value {
  font-size: 48px;
  font-weight: 700;
  color: var(--accent-blue-500);
  line-height: 1;
}

.score-label {
  font-size: 14px;
  color: var(--text-secondary);
  margin-top: 4px;
}

.core-stats {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 12px;
}

.stat-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
}

.stat-card.correct {
  border-color: var(--accent-green);
  background: color-mix(in srgb, var(--accent-green) 5%, var(--bg-card));
}

.stat-card.wrong {
  border-color: var(--accent-red);
  background: color-mix(in srgb, var(--accent-red) 5%, var(--bg-card));
}

.stat-card.skipped {
  border-color: var(--text-muted);
  background: color-mix(in srgb, var(--text-muted) 5%, var(--bg-card));
}

.stat-card.time {
  border-color: var(--accent-blue-500);
  background: color-mix(in srgb, var(--accent-blue-500) 5%, var(--bg-card));
}

.stat-icon {
  font-size: 20px;
}

.stat-content {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.stat-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
}

.stat-label {
  font-size: 12px;
  color: var(--text-muted);
}

.tag-analysis {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.section-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
}

.analysis-section {
  padding: 20px;
  background: var(--bg-card);
  border-radius: 12px;
  border: 1px solid var(--border-color);
}

.analysis-section.weak {
  border-color: var(--accent-red);
  background: color-mix(in srgb, var(--accent-red) 3%, var(--bg-card));
}

.analysis-section.strong {
  border-color: var(--accent-green);
  background: color-mix(in srgb, var(--accent-green) 3%, var(--bg-card));
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.section-label {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}

.section-desc {
  font-size: 13px;
  color: var(--text-muted);
}

.tag-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tag-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--bg-card-muted);
  border-radius: 10px;
}

.tag-icon {
  font-size: 20px;
}

.tag-name {
  font-weight: 600;
  color: var(--text-primary);
  min-width: 80px;
}

.tag-stats {
  margin-left: auto;
  font-size: 13px;
  color: var(--text-secondary);
  font-family: monospace;
}

.tag-bar {
  width: 120px;
  height: 6px;
  background: var(--bg-elevated);
  border-radius: 3px;
  overflow: hidden;
  display: flex;
}

.tag-bar-fill.correct {
  background: var(--accent-green);
}

.tag-bar-fill.wrong {
  background: var(--accent-red);
}

.tag-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
}

.tag-card {
  padding: 14px;
  background: var(--bg-card-muted);
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--tag-color) 30%, var(--border-color));
}

.tag-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.tag-card-icon {
  font-size: 18px;
}

.tag-card-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.tag-card-stats {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tag-stat-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.tag-stat-label {
  font-size: 12px;
  color: var(--text-muted);
}

.tag-stat-value {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
}

.tag-stat-value.high {
  color: var(--accent-green);
}

.tag-stat-value.medium {
  color: #f59e0b;
}

.tag-stat-value.low {
  color: var(--accent-red);
}

.result-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.btn-review,
.btn-restart,
.btn-new {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-review {
  background: var(--accent-blue-500);
  color: #fff;
  border: none;
}

.btn-review:hover {
  background: var(--accent-blue-600);
  transform: translateY(-1px);
}

.btn-restart {
  background: transparent;
  color: var(--text-primary);
  border: 1px solid var(--border-color);
}

.btn-restart:hover {
  border-color: var(--accent-blue-500);
  color: var(--accent-blue-500);
}

.btn-new {
  background: var(--accent-green);
  color: #fff;
  border: none;
}

.btn-new:hover {
  background: var(--accent-green-dark);
  transform: translateY(-1px);
}

.btn-icon {
  font-size: 16px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 48px 24px;
  text-align: center;
}

.empty-icon {
  font-size: 48px;
  opacity: 0.5;
}

.empty-state p {
  margin: 0;
  color: var(--text-secondary);
}

@media (max-width: 768px) {
  .quiz-result-panel {
    padding: 16px;
  }

  .result-header {
    flex-direction: column;
    padding: 20px;
  }

  .core-stats {
    grid-template-columns: repeat(3, 1fr);
  }

  .tag-grid {
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  }

  .result-actions {
    flex-direction: column;
  }

  .btn-review,
  .btn-restart,
  .btn-new {
    width: 100%;
    justify-content: center;
  }
}

@media (max-width: 480px) {
  .core-stats {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
