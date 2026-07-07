<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import { useJdAnalysisStore } from '@/stores/jdAnalysis'
import { useResumeReviewStore } from '@/stores/resumeReview'
import { useQuestionBankStore } from '@/stores/questionBank'
import { useLearningProgressStore, SKILL_DIMENSIONS } from '@/stores/learningProgress'
import { useOptimizeHistoryStore } from '@/stores/optimizeHistory'
import { loadInterviewRecords } from '@/composables/useInterviewHistory'

defineOptions({ name: 'AnalyticsTab' })

type SignalTone = 'critical' | 'warning' | 'neutral'
type SignalSource = 'JD' | '审查' | '面试' | '题库' | '优化'

interface WorkspaceSignal {
  id: string
  source: SignalSource
  title: string
  desc: string
  metric: string
  tone: SignalTone
  route: RouteLocationRaw
}

const jdStore = useJdAnalysisStore()
const reviewStore = useResumeReviewStore()
const questionStore = useQuestionBankStore()
const learningStore = useLearningProgressStore()
const optimizeStore = useOptimizeHistoryStore()

const interviewRecords = computed(() => loadInterviewRecords())

const averageLearningScore = computed(() => {
  const scores = Object.values(learningStore.currentScores).filter((s) => s > 0)
  if (!scores.length) return 0
  return Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length)
})

const weakDimensionLabels = computed(() =>
  learningStore.weakDimensions
    .map((key) => SKILL_DIMENSIONS.find((d) => d.key === key)?.label)
    .filter((l): l is string => Boolean(l))
    .slice(0, 4),
)

const pendingOptimizations = computed(() => optimizeStore.items.filter((i) => !i.applied))

const workspaceSignals = computed<WorkspaceSignal[]>(() => {
  const signals: WorkspaceSignal[] = []

  jdStore.history.forEach((item) => {
    const matchScore = item.matchResult?.score.total ?? null
    const highRiskCount = item.prepInsight?.highRiskFollowUps.length ?? 0

    if (matchScore != null && matchScore < 60) {
      signals.push({
        id: `jd-low-${item.id}`,
        source: 'JD',
        title: `${item.company || '目标公司'} - ${item.position || '目标岗位'}`,
        desc: `匹配分 ${matchScore}，存在 ${item.matchResult?.gaps.length ?? 0} 个缺口`,
        metric: `${matchScore} 分`,
        tone: 'critical',
        route: { name: 'jd-analysis' },
      })
    }

    if (highRiskCount > 0) {
      signals.push({
        id: `jd-risk-${item.id}`,
        source: 'JD',
        title: `${item.company || '目标'} 高风险追问`,
        desc: `${highRiskCount} 道高风险追问待训练`,
        metric: `${highRiskCount} 道`,
        tone: highRiskCount >= 3 ? 'critical' : 'warning',
        route: { name: 'training-center' },
      })
    }
  })

  reviewStore.history.forEach((item) => {
    item.result.tasks
      .filter((t) => t.priority === 'high')
      .slice(0, 3)
      .forEach((task) => {
        signals.push({
          id: `review-${item.id}-${task.id}`,
          source: '审查',
          title: task.title || '高优先级任务',
          desc: task.suggestion || task.reason,
          metric: '高优',
          tone: task.missingHardRequirement ? 'critical' : 'warning',
          route: { name: 'resume-review' },
        })
      })
  })

  interviewRecords.value.slice(0, 3).forEach((item) => {
    const weakness = item.reviewData?.weaknesses?.[0]
    if (!weakness) return
    signals.push({
      id: `interview-${item.id}`,
      source: '面试',
      title: item.targetRole || '模拟面试',
      desc: weakness,
      metric: item.totalScore != null ? `${item.totalScore} 分` : '待评',
      tone: item.totalScore != null && item.totalScore < 70 ? 'critical' : 'warning',
      route: { name: 'training-center' },
    })
  })

  questionStore.questions
    .filter((q) => (q.mastery_level ?? 0) <= 1)
    .slice(0, 3)
    .forEach((q) => {
      signals.push({
        id: `q-${q.id ?? q.content}`,
        source: '题库',
        title: q.content,
        desc: q.focus_area || q.category || '掌握度低',
        metric: `掌握 ${q.mastery_level ?? 0}`,
        tone: 'warning',
        route: { name: 'question-bank' },
      })
    })

  pendingOptimizations.value.slice(0, 3).forEach((item) => {
    signals.push({
      id: `opt-${item.id}`,
      source: '优化',
      title: `${item.moduleLabel} 待应用`,
      desc: item.suggestions || '未应用的 AI 优化',
      metric: '未应用',
      tone: 'neutral',
      route: { name: 'resume-editor' },
    })
  })

  const toneRank: Record<SignalTone, number> = { critical: 0, warning: 1, neutral: 2 }
  return signals.sort((a, b) => toneRank[a.tone] - toneRank[b.tone]).slice(0, 12)
})

const criticalCount = computed(() => workspaceSignals.value.filter((s) => s.tone === 'critical').length)
</script>

<template>
  <div class="analytics-tab">
    <div class="analytics-grid">
      <section class="panel learning-panel">
        <div class="panel-head">
          <span class="panel-label">能力趋势</span>
          <RouterLink class="panel-action" :to="{ name: 'training-center' }">训练中心</RouterLink>
        </div>
        <div class="score-display">
          <strong>{{ averageLearningScore || '--' }}</strong>
          <span>平均能力分</span>
        </div>
        <div v-if="weakDimensionLabels.length" class="chip-row">
          <span v-for="label in weakDimensionLabels" :key="label" class="chip chip-warn">{{ label }}</span>
        </div>
        <p v-else class="hint">完成面试评分后显示薄弱维度</p>
      </section>

      <section class="panel question-panel">
        <div class="panel-head">
          <span class="panel-label">题库</span>
          <RouterLink class="panel-action" :to="{ name: 'question-bank' }">查看全部</RouterLink>
        </div>
        <div class="question-stats">
          <div class="stat-item">
            <strong>{{ questionStore.stats.total }}</strong>
            <span>总题数</span>
          </div>
          <div class="stat-item">
            <strong>{{ questionStore.stats.mastery.unpracticed }}</strong>
            <span>未练习</span>
          </div>
          <div class="stat-item">
            <strong>{{ questionStore.stats.categories }}</strong>
            <span>分类</span>
          </div>
        </div>
      </section>

      <section class="panel optimize-panel">
        <div class="panel-head">
          <span class="panel-label">优化队列</span>
          <RouterLink class="panel-action" :to="{ name: 'resume-editor' }">处理</RouterLink>
        </div>
        <div class="optimize-count">
          <strong>{{ pendingOptimizations.length }}</strong>
          <span>条未应用</span>
        </div>
      </section>
    </div>

    <section class="signal-section">
      <div class="panel-head">
        <div class="signal-title-row">
          <span class="panel-label">待处理信号</span>
          <span v-if="criticalCount" class="critical-badge">{{ criticalCount }} 高风险</span>
        </div>
      </div>

      <div v-if="workspaceSignals.length" class="signal-list">
        <RouterLink
          v-for="signal in workspaceSignals"
          :key="signal.id"
          class="signal-row"
          :class="`signal-row--${signal.tone}`"
          :to="signal.route"
        >
          <span class="signal-source">{{ signal.source }}</span>
          <div class="signal-body">
            <strong>{{ signal.title }}</strong>
            <p>{{ signal.desc }}</p>
          </div>
          <b class="signal-metric">{{ signal.metric }}</b>
        </RouterLink>
      </div>

      <div v-else class="empty-state">
        暂无信号。完成 JD 分析或模拟面试后，风险与优化建议会自动聚合到这里。
      </div>
    </section>
  </div>
</template>

<style scoped>
.analytics-tab {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 4px 0;
}

.analytics-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 12px;
}

.panel {
  padding: 16px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card);
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.panel-label {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 800;
}

.panel-action {
  color: var(--primary-600);
  font-size: 11px;
  font-weight: 800;
  text-decoration: none;
  transition: color 0.15s ease;
}

.panel-action:hover {
  color: var(--primary-700);
}

.score-display {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.score-display strong {
  color: var(--text-primary);
  font-size: 32px;
  font-weight: 900;
  line-height: 1;
}

.score-display span {
  color: var(--text-secondary);
  font-size: 12px;
}

.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 10px;
}

.chip {
  padding: 3px 8px;
  border-radius: 5px;
  font-size: 11px;
  font-weight: 700;
}

.chip-warn {
  background: rgba(224, 138, 58, 0.1);
  color: var(--accent-orange);
}

.hint {
  margin-top: 10px;
  color: var(--text-secondary);
  font-size: 12px;
}

.question-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.stat-item {
  text-align: center;
}

.stat-item strong {
  display: block;
  color: var(--text-primary);
  font-size: 20px;
  font-weight: 900;
}

.stat-item span {
  color: var(--text-muted);
  font-size: 11px;
}

.optimize-count {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.optimize-count strong {
  color: var(--text-primary);
  font-size: 28px;
  font-weight: 900;
}

.optimize-count span {
  color: var(--text-secondary);
  font-size: 12px;
}

.signal-section {
  padding: 16px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card);
}

.signal-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.critical-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 99px;
  background: rgba(216, 80, 80, 0.08);
  color: var(--accent-red);
  font-size: 11px;
  font-weight: 800;
}

.signal-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.signal-row {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--bg-card-muted);
  color: inherit;
  text-decoration: none;
  transition: background-color 0.15s ease;
}

.signal-row:hover {
  background: color-mix(in srgb, var(--primary-500) 6%, var(--bg-card-muted));
}

.signal-row--critical {
  background: rgba(216, 80, 80, 0.04);
}

.signal-row--critical:hover {
  background: rgba(216, 80, 80, 0.08);
}

.signal-row--warning {
  background: rgba(224, 138, 58, 0.04);
}

.signal-row--warning:hover {
  background: rgba(224, 138, 58, 0.08);
}

.signal-source {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 26px;
  border-radius: 5px;
  background: var(--bg-card);
  color: var(--primary-600);
  font-size: 10px;
  font-weight: 800;
}

.signal-row--critical .signal-source {
  color: var(--accent-red);
}

.signal-row--warning .signal-source {
  color: var(--accent-orange);
}

.signal-body {
  min-width: 0;
}

.signal-body strong {
  display: block;
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.signal-body p {
  margin: 2px 0 0;
  color: var(--text-secondary);
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.signal-metric {
  color: var(--text-primary);
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
}

.empty-state {
  padding: 24px;
  border: 1px dashed var(--border-color-strong);
  border-radius: 8px;
  color: var(--text-secondary);
  font-size: 13px;
  text-align: center;
  background: var(--bg-card-muted);
}

@media (max-width: 768px) {
  .analytics-grid {
    grid-template-columns: 1fr;
  }

  .signal-row {
    grid-template-columns: 44px minmax(0, 1fr) auto;
  }
}
</style>
