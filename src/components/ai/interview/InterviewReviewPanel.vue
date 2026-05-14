<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ChatMessage, InterviewReviewData, ScoreBreakdown } from '@/components/ai/interview/types'

const props = defineProps<{
  reviewData: InterviewReviewData
  reviewModulesText: string
  /** 来源标识：从 JD 分析跳转时传入 analysisId */
  sourceAnalysisId?: string | null
}>()

const emit = defineEmits<{
  back: []
  restart: []
  optimize: []
  goToJdAnalysis: []
}>()

const showChatHistory = ref(false)

/** 智能推荐下一步 */
const nextStepRecommendation = computed(() => {
  const score = props.reviewData.scoreBreakdown?.totalScore ?? 0
  const weaknesses = props.reviewData.weaknesses ?? []
  const hasJdSource = Boolean(props.sourceAnalysisId)

  if (score >= 75) {
    return {
      type: 'success' as const,
      title: '表现优秀',
      description: hasJdSource
        ? '你已达到该岗位的面试通过线，可以查看完整闭环报告或继续巩固。'
        : '面试表现不错，建议针对其他目标岗位也做一轮模拟。',
      primaryAction: hasJdSource ? 'jd' : 'restart',
      primaryLabel: hasJdSource ? '查看 JD 闭环进度' : '换个方向再练',
    }
  }

  if (score >= 60) {
    return {
      type: 'warning' as const,
      title: '接近通过线',
      description: weaknesses.length > 0
        ? `重点改进：${weaknesses.slice(0, 2).join('、')}。优化简历后再来一轮效果更好。`
        : '整体表现尚可，建议优化简历中的薄弱模块后重新面试。',
      primaryAction: 'optimize' as const,
      primaryLabel: '去优化简历',
    }
  }

  return {
    type: 'danger' as const,
    title: '需要针对性练习',
    description: weaknesses.length > 0
      ? `核心短板：${weaknesses.slice(0, 2).join('、')}。建议先做专项训练再整体模拟。`
      : '建议回顾面试中暴露的问题，做针对性的专项练习。',
    primaryAction: 'restart' as const,
    primaryLabel: '针对弱项再练',
  }
})

const scoreBreakdown = computed<ScoreBreakdown | null>(() => props.reviewData.scoreBreakdown)
const chatHistory = computed<ChatMessage[]>(() => props.reviewData.chatHistory || [])

const scoreItems = computed(() => {
  if (!scoreBreakdown.value) return []
  return [
    { label: '项目经验', score: scoreBreakdown.value.projectScore, color: '#2b7bb8' },
    { label: '专业技能', score: scoreBreakdown.value.skillScore, color: '#1a8f5e' },
    { label: '工作经历', score: scoreBreakdown.value.workScore, color: '#dd8d3a' },
    { label: '教育背景', score: scoreBreakdown.value.educationScore, color: '#0ea5b7' },
  ]
})

const headlineFindings = computed(() => [
  props.reviewData.weaknesses[0] || '回答结构还需要进一步压缩和聚焦。',
  props.reviewData.strengths[0] || '你已经具备一定的项目表达基础，可以继续强化亮点部分。',
  props.reviewData.followUps[0] || '建议围绕高风险问题做下一轮专项训练。',
].slice(0, 3))

function scoreBarWidth(score: number): string {
  return `${Math.max(0, Math.min(100, score))}%`
}

function scoreLevel(score: number): string {
  if (score >= 80) return '优秀'
  if (score >= 60) return '良好'
  if (score >= 40) return '一般'
  return '待提升'
}
</script>

<template>
  <section class="review-panel">
    <header class="review-header">
      <div class="review-copy">
        <span class="review-kicker">Interview Diagnosis</span>
        <h2 class="review-title">这轮模拟面试的诊断结果</h2>
        <p class="review-desc">先看核心结论，再看证据和改进动作，避免复盘只停留在“知道哪里不对”而没有下一步。</p>
      </div>

      <div class="review-score-hero" v-if="scoreBreakdown">
        <span class="score-label">{{ scoreBreakdown.passed ? '通过' : '未通过' }}</span>
        <div class="score-main">
          <strong>{{ scoreBreakdown.totalScore }}</strong>
          <span>/100</span>
        </div>
      </div>
    </header>

    <div class="finding-grid">
      <article v-for="item in headlineFindings" :key="item" class="finding-card">
        <span class="finding-dot" />
        <p>{{ item }}</p>
      </article>
    </div>

    <section class="review-section score-section" v-if="scoreItems.length">
      <div class="section-head">
        <div>
          <span class="section-eyebrow">Score</span>
          <h3 class="section-title">四个维度的表现分布</h3>
        </div>
        <p class="section-desc">{{ props.reviewData.summary }}</p>
      </div>

      <div class="score-list">
        <div v-for="item in scoreItems" :key="item.label" class="score-row">
          <div class="score-row-head">
            <span>{{ item.label }}</span>
            <strong>{{ item.score }} · {{ scoreLevel(item.score) }}</strong>
          </div>
          <div class="score-track">
            <div class="score-fill" :style="{ width: scoreBarWidth(item.score), background: item.color }" />
          </div>
        </div>
      </div>
    </section>

    <div class="diagnosis-grid">
      <section class="review-section diagnosis-card">
        <div class="section-head">
          <div>
            <span class="section-eyebrow">Strengths</span>
            <h3 class="section-title">回答表现</h3>
          </div>
        </div>
        <ul class="bullet-list positive">
          <li v-for="item in props.reviewData.strengths" :key="item">{{ item }}</li>
          <li v-if="props.reviewData.strengths.length === 0">当前没有提取到明确优势，建议优先补强表达质量。</li>
        </ul>
      </section>

      <section class="review-section diagnosis-card">
        <div class="section-head">
          <div>
            <span class="section-eyebrow">Gaps</span>
            <h3 class="section-title">岗位匹配风险</h3>
          </div>
        </div>
        <ul class="bullet-list warning">
          <li v-for="item in props.reviewData.weaknesses" :key="item">{{ item }}</li>
          <li v-if="props.reviewData.weaknesses.length === 0">当前没有识别到明显短板，可继续用专项训练验证稳定性。</li>
        </ul>
      </section>

      <section class="review-section diagnosis-card">
        <div class="section-head">
          <div>
            <span class="section-eyebrow">Next Step</span>
            <h3 class="section-title">简历联动建议</h3>
          </div>
        </div>
        <div class="module-panel">{{ reviewModulesText }}</div>
        <ul class="bullet-list neutral">
          <li v-for="item in props.reviewData.followUps" :key="item">{{ item }}</li>
          <li v-if="props.reviewData.followUps.length === 0">建议回到专项训练，继续围绕当前岗位做问题深挖。</li>
        </ul>
      </section>
    </div>

    <section v-if="chatHistory.length" class="review-section chat-section">
      <div class="section-head">
        <div>
          <span class="section-eyebrow">Conversation</span>
          <h3 class="section-title">原始问答记录</h3>
        </div>
        <button class="toggle-btn" type="button" @click="showChatHistory = !showChatHistory">
          {{ showChatHistory ? '收起记录' : `展开 ${chatHistory.length} 条记录` }}
        </button>
      </div>

      <div v-if="showChatHistory" class="chat-list">
        <article v-for="item in chatHistory" :key="item.id" class="chat-item" :class="item.role">
          <div class="chat-meta">
            <strong>{{ item.role === 'assistant' ? 'AI 面试官' : '你的回答' }}</strong>
            <span v-if="item.score">{{ item.score.score }}/10</span>
          </div>
          <p>{{ item.content }}</p>
        </article>
      </div>
    </section>

    <!-- 智能推荐下一步 -->
    <section class="next-step-card" :class="`next-step-card--${nextStepRecommendation.type}`">
      <div class="next-step-header">
        <span class="next-step-badge" :class="`badge--${nextStepRecommendation.type}`">
          {{ nextStepRecommendation.title }}
        </span>
        <span class="next-step-score" v-if="scoreBreakdown">{{ scoreBreakdown.totalScore }} 分</span>
      </div>
      <p class="next-step-desc">{{ nextStepRecommendation.description }}</p>
      <div class="next-step-actions">
        <button
          class="next-step-btn primary"
          type="button"
          @click="nextStepRecommendation.primaryAction === 'jd' ? emit('goToJdAnalysis') : nextStepRecommendation.primaryAction === 'optimize' ? emit('optimize') : emit('restart')"
        >
          {{ nextStepRecommendation.primaryLabel }}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
        </button>
        <button
          v-if="sourceAnalysisId"
          class="next-step-btn secondary"
          type="button"
          @click="emit('goToJdAnalysis')"
        >
          返回 JD 分析
        </button>
      </div>
    </section>

    <footer class="review-actions">
      <button class="btn btn-tertiary" type="button" @click="emit('back')">返回面试</button>
      <button class="btn btn-secondary" type="button" :disabled="props.reviewData.suggestedResumeModules.length === 0" @click="emit('optimize')">
        去优化简历
      </button>
      <button class="btn btn-primary" type="button" @click="emit('restart')">开始新一轮</button>
    </footer>
  </section>
</template>

<style scoped>
.review-panel {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.review-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding: 28px;
  border-radius: 24px;
  border: 1px solid var(--border-color);
  background: var(--bg-elevated);
  box-shadow: var(--shadow-md);
}

.review-copy {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 760px;
}

.review-kicker,
.section-eyebrow {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--primary-500);
}

.review-title,
.section-title {
  margin: 0;
  color: var(--text-primary);
}

.review-title {
  font-size: 28px;
  line-height: 1.15;
}

.review-desc,
.section-desc,
.finding-card p,
.chat-item p {
  margin: 0;
  color: var(--text-secondary);
  line-height: 1.75;
}

.review-score-hero {
  min-width: 180px;
  padding: 20px;
  border-radius: 22px;
  background: color-mix(in srgb, var(--primary-500) 8%, var(--bg-card));
  border: 1px solid var(--border-accent);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.score-label {
  width: fit-content;
  min-height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--primary-500) 12%, var(--bg-card-muted));
  color: var(--primary-600);
  display: inline-flex;
  align-items: center;
  font-size: 12px;
  font-weight: 800;
}

.score-main {
  display: flex;
  align-items: baseline;
  gap: 6px;
  color: var(--text-primary);
}

.score-main strong {
  font-size: 42px;
  line-height: 1;
}

.finding-grid,
.diagnosis-grid {
  display: grid;
  gap: 18px;
}

.finding-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.finding-card,
.review-section {
  border-radius: 22px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  box-shadow: var(--shadow-sm);
}

.finding-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 18px;
}

.finding-dot {
  width: 10px;
  height: 10px;
  margin-top: 8px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--primary-500), var(--accent-info));
  flex-shrink: 0;
}

.review-section {
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.section-desc {
  max-width: 360px;
}

.score-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.score-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.score-row-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--text-secondary);
}

.score-row-head strong {
  color: var(--text-primary);
}

.score-track {
  width: 100%;
  height: 10px;
  border-radius: 999px;
  background: rgba(43, 123, 184, 0.08);
  overflow: hidden;
}

.score-fill {
  height: 100%;
  border-radius: inherit;
}

.diagnosis-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.bullet-list {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  color: var(--text-secondary);
}

.bullet-list.positive li::marker {
  color: var(--accent-green);
}

.bullet-list.warning li::marker {
  color: var(--accent-orange);
}

.bullet-list.neutral li::marker {
  color: var(--primary-500);
}

.module-panel {
  padding: 14px 16px;
  border-radius: 18px;
  background: color-mix(in srgb, var(--primary-500) 8%, var(--bg-card-muted));
  color: var(--primary-600);
  font-weight: 700;
}

.toggle-btn,
.btn {
  min-height: 40px;
  padding: 0 16px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 160ms cubic-bezier(0.4, 0, 0.2, 1), background-color 160ms cubic-bezier(0.4, 0, 0.2, 1), border-color 160ms cubic-bezier(0.4, 0, 0.2, 1);
}

.toggle-btn:hover,
.btn:hover:not(:disabled) {
  transform: translateY(-1px);
}

.toggle-btn {
  color: var(--primary-600);
  background: color-mix(in srgb, var(--primary-500) 8%, var(--bg-card));
  border-color: var(--border-accent);
}

.btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.btn-primary {
  color: var(--text-inverse);
  background: linear-gradient(135deg, var(--primary-500), var(--primary-400));
  box-shadow: 0 12px 24px color-mix(in srgb, var(--primary-500) 18%, transparent);
}

.btn-secondary {
  color: var(--primary-600);
  background: color-mix(in srgb, var(--primary-500) 8%, var(--bg-card));
  border-color: var(--border-accent);
}

.btn-tertiary {
  color: var(--text-secondary);
  background: transparent;
  border-color: var(--border-color);
}

.chat-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.chat-item {
  padding: 16px;
  border-radius: 18px;
  border: 1px solid rgba(43, 123, 184, 0.08);
  background: rgba(247, 250, 253, 0.96);
}

.chat-item.user {
  border-color: rgba(14, 165, 183, 0.1);
}

.chat-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.chat-meta strong {
  color: var(--text-primary);
}

.chat-meta span {
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 700;
}

/* 智能推荐下一步 */
.next-step-card {
  padding: 18px 20px;
  border-radius: 14px;
  border: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.next-step-card--success {
  border-color: rgba(26, 143, 94, 0.24);
  background: linear-gradient(135deg, rgba(26, 143, 94, 0.04), transparent);
}

.next-step-card--warning {
  border-color: rgba(224, 138, 58, 0.24);
  background: linear-gradient(135deg, rgba(224, 138, 58, 0.04), transparent);
}

.next-step-card--danger {
  border-color: rgba(216, 80, 80, 0.24);
  background: linear-gradient(135deg, rgba(216, 80, 80, 0.04), transparent);
}

.next-step-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.next-step-badge {
  font-size: 12px;
  font-weight: 800;
  padding: 3px 10px;
  border-radius: 20px;
}

.badge--success { background: rgba(26, 143, 94, 0.12); color: #1a8f5e; }
.badge--warning { background: rgba(224, 138, 58, 0.12); color: #c87a2f; }
.badge--danger { background: rgba(216, 80, 80, 0.12); color: #d85050; }

.next-step-score {
  font-size: 18px;
  font-weight: 800;
  color: var(--text-primary);
}

.next-step-desc {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
}

.next-step-actions {
  display: flex;
  gap: 10px;
  margin-top: 4px;
}

.next-step-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  border: none;
  transition: opacity 0.15s ease;
}

.next-step-btn:hover { opacity: 0.85; }

.next-step-btn.primary {
  background: linear-gradient(135deg, var(--primary-500), var(--primary-600));
  color: #fff;
}

.next-step-btn.secondary {
  background: var(--bg-hover);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
}

.review-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  flex-wrap: wrap;
}

@media (max-width: 1180px) {
  .finding-grid,
  .diagnosis-grid {
    grid-template-columns: 1fr;
  }

  .review-header {
    flex-direction: column;
  }

  .review-score-hero {
    min-width: 0;
    width: 100%;
  }
}

@media (max-width: 780px) {
  .review-header,
  .review-section,
  .finding-card {
    padding: 18px;
  }

  .section-head {
    flex-direction: column;
  }
}

@media (max-width: 640px) {
  .review-actions {
    flex-direction: column;
  }

  .btn,
  .toggle-btn {
    width: 100%;
    justify-content: center;
  }
}
</style>
