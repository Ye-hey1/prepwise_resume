<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import { useApplicationTrackerStore, type ApplicationStatus } from '@/stores/applicationTracker'
import { useJdAnalysisStore } from '@/stores/jdAnalysis'
import { useLearningProgressStore, SKILL_DIMENSIONS } from '@/stores/learningProgress'
import { useOptimizeHistoryStore } from '@/stores/optimizeHistory'
import { useQuestionBankStore } from '@/stores/questionBank'
import { useResumeReviewStore } from '@/stores/resumeReview'
import { useResumeStore } from '@/stores/resume'
import { useResumeVersionsStore } from '@/stores/resumeVersions'
import type { InterviewSessionRecord } from '@/components/ai/interview/types'

defineOptions({ name: 'WorkspaceDashboardView' })

const resumeStore = useResumeStore()
const versionsStore = useResumeVersionsStore()
const jdStore = useJdAnalysisStore()
const trackerStore = useApplicationTrackerStore()
const reviewStore = useResumeReviewStore()
const questionStore = useQuestionBankStore()
const learningStore = useLearningProgressStore()
const optimizeStore = useOptimizeHistoryStore()

const INTERVIEW_HISTORY_STORAGE_KEY = 'prepwise_interview_history'

type DashboardTone = 'ready' | 'active' | 'warning' | 'pending'
type SignalTone = 'critical' | 'warning' | 'neutral'
type SignalSource = 'JD' | '审查' | '面试' | '题库' | '投递' | '优化'

interface DashboardLinkItem {
  title: string
  desc: string
  route: RouteLocationRaw
}

interface PipelineStep {
  key: string
  title: string
  desc: string
  metric: string
  action: string
  tone: DashboardTone
  route: RouteLocationRaw
}

interface WorkspaceSignal {
  id: string
  source: SignalSource
  title: string
  desc: string
  metric: string
  tone: SignalTone
  at: string
  route: RouteLocationRaw
}

function isFilled(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

function formatDateTime(value: string | number | null | undefined): string {
  if (!value) return '暂无'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '暂无'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function loadInterviewRecords(): InterviewSessionRecord[] {
  try {
    const raw = localStorage.getItem(INTERVIEW_HISTORY_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item): item is InterviewSessionRecord => Boolean(item && typeof item === 'object' && typeof item.id === 'string'))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  } catch {
    return []
  }
}

function getApplicationStatusLabel(status: ApplicationStatus): string {
  if (status === 'watching') return '关注中'
  if (status === 'ready') return '待投递'
  if (status === 'applied') return '已投递'
  if (status === 'interviewing') return '面试中'
  if (status === 'offer') return 'Offer'
  return '已结束'
}

function calculateJdCoverage(item: typeof jdStore.history[number]): number {
  let score = 0
  if (item.matchResult) score += 25
  if (item.overview) score += 15
  if (item.prepInsight) score += 20
  if (item.suggestions.length) score += 15
  if (item.interviewQuestions.length) score += 15
  if ((item.practiceCount ?? 0) > 0 || (item.linkedInterviewRecordIds?.length ?? 0) > 0) score += 10
  return Math.min(100, score)
}

function getSignalTime(value: string): number {
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : 0
}

onMounted(() => {
  void questionStore.fetchQuestions()
})

const interviewRecords = computed(() => loadInterviewRecords())
const latestInterview = computed(() => interviewRecords.value[0] ?? null)

const resumeFilledModules = computed(() => {
  let count = 0
  if (isFilled(resumeStore.basicInfo.name) || isFilled(resumeStore.basicInfo.jobTitle)) count += 1
  if (resumeStore.educationList.some((item) => isFilled(item.school) || isFilled(item.major))) count += 1
  if (isFilled(resumeStore.skills)) count += 1
  if (resumeStore.workList.some((item) => isFilled(item.company) || isFilled(item.description))) count += 1
  if (resumeStore.projectList.some((item) => isFilled(item.name) || isFilled(item.mainWork))) count += 1
  if (resumeStore.personalWorkList.some((item) => isFilled(item.name) || isFilled(item.description))) count += 1
  if (resumeStore.awardList.some((item) => isFilled(item.name))) count += 1
  if (isFilled(resumeStore.selfIntro)) count += 1
  return count
})

const resumeCompletion = computed(() => Math.round((resumeFilledModules.value / 8) * 100))
const visibleModuleCount = computed(() => resumeStore.modules.filter((item) => item.visible).length)

const latestJdItem = computed(() => jdStore.history[0] ?? null)
const latestReview = computed(() => reviewStore.latestResult)
const pendingHighPriorityTasks = computed(() => latestReview.value?.tasks.filter((item) => item.priority === 'high').length ?? 0)
const unappliedOptimizations = computed(() => optimizeStore.items.filter((item) => !item.applied).length)
const pendingOptimizations = computed(() => optimizeStore.items.filter((item) => !item.applied))

const averageLearningScore = computed(() => {
  const scores = Object.values(learningStore.currentScores).filter((score) => score > 0)
  if (!scores.length) return 0
  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
})

const weakDimensionLabels = computed(() =>
  learningStore.weakDimensions
    .map((key) => SKILL_DIMENSIONS.find((item) => item.key === key)?.label)
    .filter((item): item is string => Boolean(item))
    .slice(0, 3),
)

const targetJobCards = computed(() =>
  jdStore.history.slice(0, 6).map((item) => {
    const tracker = trackerStore.getTrackerItem(item.id)
    const matchScore = item.matchResult?.score.total ?? null
    const gapCount = item.matchResult?.gaps.length ?? 0
    const highRiskCount = item.prepInsight?.highRiskFollowUps.length ?? 0
    const coverage = calculateJdCoverage(item)
    const riskLevel = matchScore == null || matchScore < 60 || gapCount + highRiskCount >= 4
      ? 'high'
      : matchScore < 75 || gapCount + highRiskCount > 0
        ? 'medium'
        : 'low'

    return {
      id: item.id,
      title: item.position || '未命名岗位',
      company: item.company || '未填写公司',
      score: matchScore,
      coverage,
      riskLevel,
      status: tracker.status,
      suggestions: item.suggestions.length,
      questions: item.interviewQuestions.length,
      practiceCount: item.practiceCount ?? item.linkedInterviewRecordIds?.length ?? 0,
      updatedAt: item.updatedAt,
      route: { name: 'jd-analysis' } satisfies RouteLocationRaw,
    }
  }),
)

const averageJdCoverage = computed(() => {
  if (!targetJobCards.value.length) return 0
  return Math.round(targetJobCards.value.reduce((sum, item) => sum + item.coverage, 0) / targetJobCards.value.length)
})

const highPriorityReviewSignals = computed(() =>
  reviewStore.history.flatMap((item) =>
    item.result.tasks
      .filter((task) => task.priority === 'high')
      .map((task) => ({
        ...task,
        reviewId: item.id,
        generatedAt: item.generatedAt,
        targetRole: item.targetRole,
      })),
  ),
)

const workspaceSignals = computed<WorkspaceSignal[]>(() => {
  const jdSignals: WorkspaceSignal[] = jdStore.history.flatMap((item) => {
    const tracker = trackerStore.getTrackerItem(item.id)
    const matchScore = item.matchResult?.score.total ?? null
    const gapCount = item.matchResult?.gaps.length ?? 0
    const highRiskCount = item.prepInsight?.highRiskFollowUps.length ?? 0
    const signals: WorkspaceSignal[] = []

    if (matchScore == null) {
      signals.push({
        id: `jd-missing-${item.id}`,
        source: 'JD',
        title: item.company || item.position || '岗位画像待补齐',
        desc: '该岗位还缺少完整匹配结果，建议重新打开 JD 分析补齐画像。',
        metric: '待匹配',
        tone: 'warning',
        at: item.updatedAt,
        route: { name: 'jd-analysis' },
      })
    } else if (matchScore < 60) {
      signals.push({
        id: `jd-low-${item.id}`,
        source: 'JD',
        title: `${item.company || '目标公司'} · ${item.position || '目标岗位'}`,
        desc: `匹配分 ${matchScore}，存在 ${gapCount} 个岗位缺口，需要优先处理硬性要求。`,
        metric: `${matchScore} 分`,
        tone: 'critical',
        at: item.updatedAt,
        route: { name: 'jd-analysis' },
      })
    }

    if (highRiskCount > 0) {
      signals.push({
        id: `jd-risk-${item.id}`,
        source: 'JD',
        title: `${item.company || '目标公司'} · 高风险追问`,
        desc: `该岗位有 ${highRiskCount} 道高风险追问，建议进入训练中心专项练习。`,
        metric: `${highRiskCount} 道`,
        tone: highRiskCount >= 3 ? 'critical' : 'warning',
        at: item.updatedAt,
        route: { name: 'training-center' },
      })
    }

    if (tracker.status === 'interviewing') {
      signals.push({
        id: `app-interview-${item.id}`,
        source: '投递',
        title: `${item.company || '目标公司'} · 面试中`,
        desc: '该岗位已进入面试阶段，建议优先处理追问、题包和最近复盘。',
        metric: '面试中',
        tone: 'warning',
        at: item.updatedAt,
        route: { name: 'application-tracker' },
      })
    }

    return signals
  })

  const reviewSignals: WorkspaceSignal[] = highPriorityReviewSignals.value.slice(0, 6).map((task) => ({
    id: `review-${task.reviewId}-${task.id}`,
    source: '审查',
    title: task.title || task.targetRole || '高优先级审查任务',
    desc: task.suggestion || task.reason,
    metric: '高优先级',
    tone: task.missingHardRequirement ? 'critical' : 'warning',
    at: task.generatedAt,
    route: { name: 'resume-review' },
  }))

  const interviewSignals: WorkspaceSignal[] = interviewRecords.value.slice(0, 4).flatMap((item) => {
    const weakness = item.reviewData?.weaknesses?.[0]
    if (!weakness) return []
    return [{
      id: `interview-${item.id}`,
      source: '面试' as const,
      title: item.targetRole || '模拟面试复盘',
      desc: weakness,
      metric: item.totalScore == null ? '待评分' : `${item.totalScore} 分`,
      tone: item.totalScore != null && item.totalScore < 70 ? 'critical' : 'warning',
      at: item.date,
      route: { name: 'training-center' },
    }]
  })

  const questionSignals: WorkspaceSignal[] = questionStore.questions
    .filter((item) => (item.mastery_level ?? 0) <= 1)
    .slice(0, 4)
    .map((item) => ({
      id: `question-${item.id ?? item.content}`,
      source: '题库',
      title: item.content,
      desc: item.focus_area || item.intent || item.category || '该题掌握度较低，建议加入专项训练。',
      metric: `掌握 ${item.mastery_level ?? 0}`,
      tone: 'warning',
      at: item.created_at ?? '',
      route: { name: 'question-bank' },
    }))

  const optimizeSignals: WorkspaceSignal[] = pendingOptimizations.value.slice(0, 4).map((item) => ({
    id: `opt-${item.id}`,
    source: '优化',
    title: `${item.moduleLabel} 待应用`,
    desc: item.suggestions || '存在未应用的 AI 优化记录。',
    metric: '未应用',
    tone: 'neutral',
    at: item.timestamp,
    route: { name: 'resume-editor' },
  }))

  return [
    ...jdSignals,
    ...reviewSignals,
    ...interviewSignals,
    ...questionSignals,
    ...optimizeSignals,
  ]
    .sort((a, b) => {
      const toneRank: Record<SignalTone, number> = { critical: 0, warning: 1, neutral: 2 }
      return toneRank[a.tone] - toneRank[b.tone] || getSignalTime(b.at) - getSignalTime(a.at)
    })
    .slice(0, 12)
})

const criticalSignalCount = computed(() => workspaceSignals.value.filter((item) => item.tone === 'critical').length)

const dashboardStats = computed(() => [
  {
    label: '简历完整度',
    value: `${resumeCompletion.value}%`,
    note: `${resumeFilledModules.value}/8 个模块已有内容`,
  },
  {
    label: '岗位分析',
    value: `${jdStore.history.length}`,
    note: latestJdItem.value ? `最近：${latestJdItem.value.company || latestJdItem.value.position || '未命名岗位'}` : '暂无 JD 记录',
  },
  {
    label: '待处理信号',
    value: `${workspaceSignals.value.length}`,
    note: criticalSignalCount.value ? `${criticalSignalCount.value} 个高风险` : '暂无高风险信号',
  },
  {
    label: '准备覆盖',
    value: averageJdCoverage.value ? `${averageJdCoverage.value}%` : '--',
    note: latestInterview.value?.totalScore != null ? `最近面试 ${latestInterview.value.totalScore} 分` : '暂无评分记录',
  },
])

const nextAction = computed(() => {
  if (resumeCompletion.value < 50) {
    return {
      title: '先补齐简历主干',
      desc: '完善基本信息、技能、项目或工作经历后，后续 JD 匹配和面试追问会更稳定。',
      route: { name: 'resume-editor' },
      label: '继续编辑',
    }
  }
  if (!latestReview.value) {
    return {
      title: '跑一次简历审查',
      desc: '先拿到完整度、表达证据和岗位匹配的优先任务，再决定如何改写。',
      route: { name: 'resume-review' },
      label: '开始审查',
    }
  }
  if (!latestJdItem.value) {
    return {
      title: '绑定一个目标 JD',
      desc: '把简历放到真实岗位要求里看，能更快发现硬性缺口和面试风险。',
      route: { name: 'jd-analysis' },
      label: '分析 JD',
    }
  }
  if (!latestInterview.value) {
    return {
      title: '用最新 JD 做模拟面试',
      desc: '基于岗位要求和简历证据练习高风险追问，训练结果会反哺优化建议。',
      route: { name: 'training-center' },
      label: '制定训练',
    }
  }
  return {
    title: '处理优化建议',
    desc: '优先应用高优先级审查任务和 JD 定向建议，形成下一版投递简历。',
    route: { name: 'resume-review' },
    label: '查看任务',
  }
})

const recentActivities = computed(() => {
  const items = [
    ...jdStore.history.slice(0, 3).map((item) => ({
      id: `jd-${item.id}`,
      title: item.company || item.position || '岗位分析',
      desc: item.matchResult ? `匹配分 ${item.matchResult.score.total}` : 'JD 分析记录',
      at: item.updatedAt,
      route: { name: 'jd-analysis' },
    })),
    ...reviewStore.history.slice(0, 2).map((item) => ({
      id: `review-${item.id}`,
      title: item.targetRole || '简历审查',
      desc: `审查分 ${item.result.overallScore}`,
      at: item.generatedAt,
      route: { name: 'resume-review' },
    })),
    ...interviewRecords.value.slice(0, 2).map((item) => ({
      id: `interview-${item.id}`,
      title: item.targetRole || '模拟面试',
      desc: item.totalScore == null ? '面试记录' : `得分 ${item.totalScore}`,
      at: item.date,
      route: { name: 'ai-interviewer' },
    })),
  ]

  return items
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 6)
})

const quickActions = [
  {
    title: '导入简历',
    desc: '从 PDF / Word / 图片解析已有简历',
    route: { name: 'resume-import' },
  },
  {
    title: '编辑简历',
    desc: '调整内容、模板和导出格式',
    route: { name: 'resume-editor' },
  },
  {
    title: 'JD 分析',
    desc: '匹配岗位要求并生成备面重点',
    route: { name: 'jd-analysis' },
  },
  {
    title: '投递追踪',
    desc: '维护目标岗位状态和下一步动作',
    route: { name: 'application-tracker' },
  },
  {
    title: '训练中心',
    desc: '按 JD 风险生成专项训练计划',
    route: { name: 'training-center' },
  },
  {
    title: 'AI 面试',
    desc: '按岗位进行模拟问答和复盘',
    route: { name: 'ai-interviewer' },
  },
] satisfies DashboardLinkItem[]

const pipelineSteps = computed<PipelineStep[]>(() => [
  {
    key: 'resume',
    title: '简历资产',
    desc: versionsStore.activeVersion?.name ?? '默认简历',
    metric: `${resumeCompletion.value}% 完整`,
    action: resumeCompletion.value >= 70 ? '继续维护' : '补齐主干',
    tone: resumeCompletion.value >= 70 ? 'ready' : 'active',
    route: { name: 'resume-editor' },
  },
  {
    key: 'jd',
    title: '岗位画像',
    desc: latestJdItem.value ? `${latestJdItem.value.company || '目标公司'} · ${latestJdItem.value.position || '目标岗位'}` : '还未绑定目标 JD',
    metric: latestJdItem.value?.matchResult ? `${latestJdItem.value.matchResult.score.total} 匹配` : `${jdStore.history.length} 份 JD`,
    action: latestJdItem.value ? '查看匹配' : '分析 JD',
    tone: latestJdItem.value ? 'ready' : resumeCompletion.value >= 50 ? 'active' : 'pending',
    route: { name: 'jd-analysis' },
  },
  {
    key: 'review',
    title: '简历审查',
    desc: latestReview.value ? `${pendingHighPriorityTasks.value} 个高优先级任务` : '等待生成审查结果',
    metric: latestReview.value ? `${latestReview.value.overallScore} 分` : '--',
    action: latestReview.value ? '处理任务' : '开始审查',
    tone: pendingHighPriorityTasks.value > 0 ? 'warning' : latestReview.value ? 'ready' : 'pending',
    route: { name: 'resume-review' },
  },
  {
    key: 'interview',
    title: '训练中心',
    desc: latestInterview.value ? latestInterview.value.targetRole || '最近模拟面试' : '还没有训练记录',
    metric: latestInterview.value?.totalScore != null ? `${latestInterview.value.totalScore} 分` : `${interviewRecords.value.length} 次`,
    action: latestInterview.value ? '复盘训练' : '制定计划',
    tone: latestInterview.value ? 'ready' : latestJdItem.value ? 'active' : 'pending',
    route: { name: 'training-center' },
  },
  {
    key: 'question-bank',
    title: '题库沉淀',
    desc: questionStore.stats.total ? `${questionStore.stats.categories} 个分类` : '等待沉淀面试题',
    metric: `${questionStore.stats.total} 道题`,
    action: '进入题库',
    tone: questionStore.stats.total ? 'ready' : latestInterview.value ? 'active' : 'pending',
    route: { name: 'question-bank' },
  },
])

const activePipelineStep = computed(() => pipelineSteps.value.find((item) => item.tone !== 'ready') ?? pipelineSteps.value[pipelineSteps.value.length - 1])

const currentSnapshotCount = computed(() =>
  versionsStore.activeVersionId ? versionsStore.getSnapshotsForVersion(versionsStore.activeVersionId).length : 0,
)

const resumeAssetCards = computed(() => [
  {
    label: '简历版本',
    value: `${versionsStore.versions.length}`,
    note: versionsStore.activeVersion?.targetJob || resumeStore.basicInfo.jobTitle || '未设置目标岗位',
  },
  {
    label: '当前快照',
    value: `${currentSnapshotCount.value}`,
    note: currentSnapshotCount.value ? '可回滚历史版本' : '建议在大改前保存快照',
  },
  {
    label: 'AI 优化记录',
    value: `${optimizeStore.items.length}`,
    note: unappliedOptimizations.value ? `${unappliedOptimizations.value} 条未应用` : '暂无待应用建议',
  },
])

const interviewLoopCards = computed(() => {
  const latestWeaknesses = latestInterview.value?.reviewData?.weaknesses?.slice(0, 2) ?? []
  const latestFollowUps = latestInterview.value?.reviewData?.followUps?.length ?? 0
  const practiceRecommendations = learningStore.generatePracticeRecommendations().slice(0, 2)

  return [
    {
      title: '能力短板',
      metric: weakDimensionLabels.value.length ? weakDimensionLabels.value.join(' / ') : '待评分',
      desc: latestWeaknesses[0] ?? practiceRecommendations[0]?.suggestion ?? '完成模拟面试后自动归因薄弱维度',
      route: { name: 'training-center' } satisfies RouteLocationRaw,
    },
    {
      title: '追问复盘',
      metric: `${latestFollowUps} 条`,
      desc: latestInterview.value ? latestInterview.value.summary || '查看最近一次面试复盘' : '用目标 JD 生成追问链路',
      route: { name: 'training-center' } satisfies RouteLocationRaw,
    },
    {
      title: '题库练习',
      metric: `${questionStore.stats.mastery.unpracticed} 未练`,
      desc: questionStore.stats.total ? `${questionStore.stats.total} 道题已沉淀` : '从 JD 和面试记录沉淀高频问题',
      route: { name: 'question-bank' } satisfies RouteLocationRaw,
    },
  ]
})
</script>

<template>
  <section class="workspace-dashboard">
    <div class="workspace-scroll">
      <div class="dashboard-shell">
        <header class="dashboard-header">
          <div class="dashboard-title-block">
            <span class="kicker">求职工作台</span>
            <h1>把简历、岗位和面试放在同一条链路里推进</h1>
            <p>
              当前工作台只读取本地已有记录，帮助你判断下一步该补简历、做匹配、练面试还是处理优化任务。
            </p>
          </div>

          <RouterLink class="primary-action" :to="nextAction.route">
            <span>{{ nextAction.label }}</span>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </RouterLink>
        </header>

        <div class="stats-grid">
          <article v-for="item in dashboardStats" :key="item.label" class="stat-card">
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
            <p>{{ item.note }}</p>
          </article>
        </div>

        <div class="dashboard-layout">
          <main class="dashboard-main">
            <section class="next-panel">
              <div>
                <span class="panel-label">推荐下一步</span>
                <h2>{{ nextAction.title }}</h2>
                <p>{{ nextAction.desc }}</p>
              </div>
              <RouterLink class="panel-link" :to="nextAction.route">执行</RouterLink>
            </section>

            <section class="section-card">
              <div class="section-head">
                <div>
                  <span class="panel-label">求职推进链路</span>
                  <h2>从简历到面试的当前进度</h2>
                </div>
              </div>

              <div class="pipeline-list">
                <RouterLink
                  v-for="(item, index) in pipelineSteps"
                  :key="item.key"
                  class="pipeline-step"
                  :class="[`pipeline-step--${item.tone}`, { 'pipeline-step--current': item.key === activePipelineStep?.key }]"
                  :to="item.route"
                  :aria-current="item.key === activePipelineStep?.key ? 'step' : undefined"
                >
                  <span class="step-index">{{ index + 1 }}</span>
                  <div class="step-body">
                    <strong>{{ item.title }}</strong>
                    <span>{{ item.desc }}</span>
                  </div>
                  <div class="step-meta">
                    <b>{{ item.metric }}</b>
                    <em>{{ item.action }}</em>
                  </div>
                </RouterLink>
              </div>
            </section>

            <section class="section-card">
              <div class="section-head">
                <div>
                  <span class="panel-label">快速入口</span>
                  <h2>常用工作流</h2>
                </div>
              </div>

              <div class="quick-grid">
                <RouterLink v-for="item in quickActions" :key="item.title" class="quick-card" :to="item.route">
                  <strong>{{ item.title }}</strong>
                  <span>{{ item.desc }}</span>
                </RouterLink>
              </div>
            </section>

            <section class="section-card signal-card">
              <div class="section-head">
                <div>
                  <span class="panel-label">AI 分析中心</span>
                  <h2>待处理信号</h2>
                </div>
                <div v-if="workspaceSignals.length" class="signal-summary" aria-label="AI 信号概览">
                  <span>{{ criticalSignalCount }} 高风险</span>
                  <strong>{{ workspaceSignals.length }} 条</strong>
                </div>
              </div>

              <div v-if="workspaceSignals.length" class="signal-list">
                <RouterLink
                  v-for="signal in workspaceSignals"
                  :key="signal.id"
                  class="signal-item"
                  :class="`signal-item--${signal.tone}`"
                  :to="signal.route"
                >
                  <span class="signal-source">{{ signal.source }}</span>
                  <div class="signal-body">
                    <strong>{{ signal.title }}</strong>
                    <p>{{ signal.desc }}</p>
                  </div>
                  <div class="signal-meta">
                    <b>{{ signal.metric }}</b>
                    <time>{{ formatDateTime(signal.at) }}</time>
                  </div>
                </RouterLink>
              </div>

              <div v-else class="empty-block">
                暂无待处理信号。完成 JD 分析、简历审查或模拟面试后，工作台会自动聚合风险与机会点。
              </div>
            </section>

            <section class="section-card">
              <div class="section-head">
                <div>
                  <span class="panel-label">目标岗位准备池</span>
                  <h2>JD、建议、投递和训练记录</h2>
                </div>
                <RouterLink :to="{ name: 'application-tracker' }">追踪</RouterLink>
              </div>

              <div v-if="targetJobCards.length" class="job-grid">
                <RouterLink v-for="item in targetJobCards" :key="item.id" class="job-card" :to="item.route">
                  <div class="job-card-head">
                    <div>
                      <strong>{{ item.title }}</strong>
                      <span>{{ item.company }}</span>
                    </div>
                    <em :class="`risk-${item.riskLevel}`">{{ item.riskLevel === 'high' ? '高风险' : item.riskLevel === 'medium' ? '待补齐' : '稳定' }}</em>
                  </div>
                  <dl>
                    <div>
                      <dt>匹配</dt>
                      <dd>{{ item.score ?? '--' }}</dd>
                    </div>
                    <div>
                      <dt>覆盖</dt>
                      <dd>{{ item.coverage }}%</dd>
                    </div>
                    <div>
                      <dt>建议</dt>
                      <dd>{{ item.suggestions }}</dd>
                    </div>
                    <div>
                      <dt>题目</dt>
                      <dd>{{ item.questions }}</dd>
                    </div>
                    <div>
                      <dt>训练</dt>
                      <dd>{{ item.practiceCount }}</dd>
                    </div>
                    <div>
                      <dt>状态</dt>
                      <dd>{{ getApplicationStatusLabel(item.status) }}</dd>
                    </div>
                  </dl>
                  <time>{{ formatDateTime(item.updatedAt) }}</time>
                </RouterLink>
              </div>

              <div v-else class="empty-block">
                暂无目标岗位。先粘贴一份 JD，工作台会把匹配分、优化建议和面试题统一沉淀到这里。
              </div>
            </section>

            <section class="section-card">
              <div class="section-head">
                <div>
                  <span class="panel-label">面试备战闭环</span>
                  <h2>短板、追问和题库</h2>
                </div>
              </div>

              <div class="loop-grid">
                <RouterLink v-for="item in interviewLoopCards" :key="item.title" class="loop-card" :to="item.route">
                  <span>{{ item.title }}</span>
                  <strong>{{ item.metric }}</strong>
                  <p>{{ item.desc }}</p>
                </RouterLink>
              </div>
            </section>

            <section class="section-card">
              <div class="section-head">
                <div>
                  <span class="panel-label">最近动态</span>
                  <h2>分析与训练记录</h2>
                </div>
              </div>

              <div v-if="recentActivities.length" class="activity-list">
                <RouterLink v-for="item in recentActivities" :key="item.id" class="activity-item" :to="item.route">
                  <div>
                    <strong>{{ item.title }}</strong>
                    <span>{{ item.desc }}</span>
                  </div>
                  <time>{{ formatDateTime(item.at) }}</time>
                </RouterLink>
              </div>

              <div v-else class="empty-block">
                暂无分析或训练记录。先导入简历或粘贴目标 JD，工作台会自动沉淀这里。
              </div>
            </section>
          </main>

          <aside class="dashboard-side">
            <section class="side-card">
              <div class="section-head compact">
                <div>
                  <span class="panel-label">简历资产库</span>
                  <h2>{{ versionsStore.activeVersion?.name ?? '默认简历' }}</h2>
                </div>
                <RouterLink :to="{ name: 'resume-editor' }">编辑</RouterLink>
              </div>
              <dl class="meta-list">
                <div>
                  <dt>目标岗位</dt>
                  <dd>{{ resumeStore.basicInfo.jobTitle || versionsStore.activeVersion?.targetJob || '未填写' }}</dd>
                </div>
                <div>
                  <dt>可见模块</dt>
                  <dd>{{ visibleModuleCount }} 个</dd>
                </div>
                <div>
                  <dt>版本数量</dt>
                  <dd>{{ versionsStore.versions.length }} 份</dd>
                </div>
              </dl>
              <div class="asset-grid">
                <div v-for="item in resumeAssetCards" :key="item.label" class="asset-item">
                  <span>{{ item.label }}</span>
                  <strong>{{ item.value }}</strong>
                  <p>{{ item.note }}</p>
                </div>
              </div>
            </section>

            <section class="side-card">
              <div class="section-head compact">
                <div>
                  <span class="panel-label">任务队列</span>
                  <h2>待处理建议</h2>
                </div>
              </div>
              <div class="task-list">
                <RouterLink class="task-item" :to="{ name: 'resume-review' }">
                  <span>审查高优先级任务</span>
                  <strong>{{ pendingHighPriorityTasks }}</strong>
                </RouterLink>
                <RouterLink class="task-item" :to="{ name: 'jd-analysis' }">
                  <span>JD 定向优化建议</span>
                  <strong>{{ latestJdItem?.suggestions.length ?? jdStore.suggestions.length }}</strong>
                </RouterLink>
                <RouterLink class="task-item" :to="{ name: 'resume-editor' }">
                  <span>未应用 AI 优化</span>
                  <strong>{{ unappliedOptimizations }}</strong>
                </RouterLink>
              </div>
            </section>

            <section class="side-card">
              <div class="section-head compact">
                <div>
                  <span class="panel-label">训练状态</span>
                  <h2>能力趋势</h2>
                </div>
              </div>
              <div class="learning-score">
                <strong>{{ averageLearningScore || '--' }}</strong>
                <span>平均能力分</span>
              </div>
              <div v-if="weakDimensionLabels.length" class="chip-row">
                <span v-for="item in weakDimensionLabels" :key="item">{{ item }}</span>
              </div>
              <p v-else class="side-note">完成一次面试评分后，这里会显示薄弱维度。</p>
            </section>

            <section class="side-card">
              <div class="section-head compact">
                <div>
                  <span class="panel-label">题库</span>
                  <h2>{{ questionStore.stats.total }} 道题</h2>
                </div>
                <RouterLink :to="{ name: 'question-bank' }">查看</RouterLink>
              </div>
              <dl class="meta-list">
                <div>
                  <dt>分类</dt>
                  <dd>{{ questionStore.stats.categories }}</dd>
                </div>
                <div>
                  <dt>未练习</dt>
                  <dd>{{ questionStore.stats.mastery.unpracticed }}</dd>
                </div>
              </dl>
            </section>
          </aside>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.workspace-dashboard {
  display: flex;
  flex: 1;
  min-width: 0;
  height: 100%;
  background: var(--bg-app);
}

.workspace-scroll {
  flex: 1;
  min-width: 0;
  overflow: auto;
  padding: 20px;
}

.dashboard-shell {
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 100%;
  min-width: 0;
}

.dashboard-header,
.next-panel,
.section-card,
.side-card,
.stat-card {
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
}

.dashboard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 18px 20px;
}

.dashboard-title-block {
  min-width: 0;
}

.dashboard-title-block h1 {
  margin: 2px 0 0;
  color: var(--text-primary);
  font-size: 24px;
  font-weight: 900;
  line-height: 1.25;
}

.dashboard-title-block p {
  max-width: 78ch;
  margin: 6px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.65;
}

.primary-action,
.panel-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 38px;
  padding: 0 14px;
  border-radius: 8px;
  background: var(--primary-600);
  color: white;
  font-size: 13px;
  font-weight: 850;
  white-space: nowrap;
  transition:
    background-color var(--transition-fast),
    border-color var(--transition-fast),
    color var(--transition-fast);
}

.primary-action:hover,
.primary-action:focus-visible,
.panel-link:hover,
.panel-link:focus-visible {
  background: var(--primary-700);
}

.primary-action:active,
.panel-link:active {
  background: var(--primary-600);
}

.primary-action:focus-visible,
.panel-link:focus-visible,
.quick-card:focus-visible,
.pipeline-step:focus-visible,
.signal-item:focus-visible,
.job-card:focus-visible,
.loop-card:focus-visible,
.activity-item:focus-visible,
.task-item:focus-visible,
.section-head a:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--primary-500) 58%, transparent);
  outline-offset: 2px;
}

.primary-action svg {
  width: 15px;
  height: 15px;
}

.primary-action path {
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.stat-card {
  min-width: 0;
  padding: 14px;
}

.stat-card span,
.panel-label {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 850;
  line-height: 1.35;
}

.stat-card strong {
  display: block;
  margin-top: 5px;
  color: var(--text-primary);
  font-size: 26px;
  font-weight: 900;
  line-height: 1;
}

.stat-card p {
  margin-top: 8px;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.dashboard-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 14px;
  align-items: start;
}

.dashboard-main,
.dashboard-side {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.next-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px;
  background: linear-gradient(180deg, rgba(43, 123, 184, 0.08), rgba(43, 123, 184, 0.03)), var(--bg-card);
}

.next-panel h2,
.section-head h2 {
  margin: 3px 0 0;
  color: var(--text-primary);
  font-size: 17px;
  font-weight: 900;
  line-height: 1.3;
}

.next-panel p {
  max-width: 78ch;
  margin: 7px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.7;
}

.section-card,
.side-card {
  padding: 16px;
}

.section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  margin-bottom: 12px;
}

.section-head.compact {
  align-items: center;
}

.section-head a {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 30px;
  padding: 0 9px;
  border-radius: 8px;
  color: var(--primary-600);
  font-size: 12px;
  font-weight: 850;
  transition:
    background-color var(--transition-fast),
    color var(--transition-fast);
}

.section-head a:hover {
  background: color-mix(in srgb, var(--primary-500) 8%, var(--bg-card));
  color: var(--primary-700);
}

.quick-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.quick-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
  min-height: 92px;
  padding: 13px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card-muted);
  color: inherit;
  transition:
    background-color var(--transition-fast),
    border-color var(--transition-fast);
}

.quick-card:hover {
  border-color: color-mix(in srgb, var(--primary-500) 28%, var(--border-color));
  background: color-mix(in srgb, var(--primary-500) 6%, var(--bg-card));
}

.quick-card::after {
  position: absolute;
  right: 12px;
  bottom: 10px;
  color: var(--primary-600);
  font-size: 14px;
  font-weight: 900;
  opacity: 0;
  content: ">";
  transition: opacity var(--transition-fast);
}

.quick-card:hover::after,
.quick-card:focus-visible::after {
  opacity: 1;
}

.quick-card strong,
.activity-item strong,
.task-item span {
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 850;
  line-height: 1.4;
}

.quick-card span,
.activity-item span,
.side-note {
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.55;
}

.pipeline-list {
  display: grid;
  gap: 8px;
}

.pipeline-step {
  position: relative;
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 11px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card-muted);
  color: inherit;
  transition:
    background-color var(--transition-fast),
    border-color var(--transition-fast);
}

.pipeline-step:hover {
  border-color: color-mix(in srgb, var(--primary-500) 24%, var(--border-color));
  background: color-mix(in srgb, var(--primary-500) 5%, var(--bg-card));
}

.pipeline-step--current {
  border-color: var(--border-accent);
  background: color-mix(in srgb, var(--accent-info) 7%, var(--bg-card));
}

.pipeline-step--current::before {
  position: absolute;
  inset: 10px auto 10px 0;
  width: 3px;
  border-radius: 999px;
  background: var(--primary-600);
  content: "";
}

.step-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 900;
}

.pipeline-step--ready .step-index {
  background: color-mix(in srgb, var(--accent-green) 12%, var(--bg-card));
  color: var(--accent-green);
}

.pipeline-step--active .step-index {
  background: color-mix(in srgb, var(--accent-info) 12%, var(--bg-card));
  color: var(--accent-info);
}

.pipeline-step--warning .step-index {
  background: color-mix(in srgb, var(--accent-orange) 12%, var(--bg-card));
  color: var(--accent-orange);
}

.step-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.step-body strong,
.job-card strong,
.loop-card strong,
.asset-item strong {
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 900;
  line-height: 1.35;
}

.step-body span,
.job-card span,
.loop-card p,
.asset-item p {
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.step-body strong,
.step-body span,
.job-card strong,
.job-card span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.signal-list {
  display: grid;
  gap: 8px;
}

.signal-card {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--primary-500) 5%, transparent), transparent 54%),
    var(--bg-card);
}

.signal-summary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
}

.signal-summary span,
.signal-summary strong {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 900;
  line-height: 1;
}

.signal-summary span {
  background: color-mix(in srgb, var(--accent-red) 9%, var(--bg-card));
  color: var(--accent-red);
}

.signal-summary strong {
  background: color-mix(in srgb, var(--primary-500) 9%, var(--bg-card));
  color: var(--primary-600);
}

.signal-item {
  display: grid;
  grid-template-columns: 62px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 11px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card-muted);
  color: inherit;
  transition:
    background-color var(--transition-fast),
    border-color var(--transition-fast);
}

.signal-item--critical {
  border-color: color-mix(in srgb, var(--accent-red) 30%, var(--border-color));
  background: color-mix(in srgb, var(--accent-red) 6%, var(--bg-card));
}

.signal-item--warning {
  border-color: color-mix(in srgb, var(--accent-orange) 28%, var(--border-color));
  background: color-mix(in srgb, var(--accent-orange) 6%, var(--bg-card));
}

.signal-item:hover {
  border-color: color-mix(in srgb, var(--primary-500) 28%, var(--border-color));
  background: color-mix(in srgb, var(--primary-500) 5%, var(--bg-card));
}

.signal-item--critical:hover {
  border-color: color-mix(in srgb, var(--accent-red) 42%, var(--border-color));
  background: color-mix(in srgb, var(--accent-red) 8%, var(--bg-card));
}

.signal-item--warning:hover {
  border-color: color-mix(in srgb, var(--accent-orange) 40%, var(--border-color));
  background: color-mix(in srgb, var(--accent-orange) 8%, var(--bg-card));
}

.signal-source {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 30px;
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--primary-600);
  font-size: 11px;
  font-weight: 900;
}

.signal-item--critical .signal-source {
  background: color-mix(in srgb, var(--accent-red) 10%, var(--bg-card));
  color: var(--accent-red);
}

.signal-item--warning .signal-source {
  background: color-mix(in srgb, var(--accent-orange) 10%, var(--bg-card));
  color: var(--accent-orange);
}

.signal-body {
  min-width: 0;
}

.signal-body strong {
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 900;
  line-height: 1.35;
}

.signal-body p {
  margin: 3px 0 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.signal-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
  min-width: 70px;
}

.signal-meta b {
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 900;
  white-space: nowrap;
}

.signal-meta time {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
}

.step-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  min-width: 72px;
}

.step-meta b,
.job-card dd {
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 900;
  line-height: 1.2;
}

.step-meta em {
  color: var(--primary-600);
  font-size: 11px;
  font-style: normal;
  font-weight: 850;
  white-space: nowrap;
}

.job-grid,
.loop-grid,
.asset-grid {
  display: grid;
  gap: 10px;
}

.job-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.loop-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.asset-grid {
  grid-template-columns: 1fr;
  margin-top: 10px;
}

.job-card,
.loop-card,
.asset-item {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card-muted);
  color: inherit;
}

.job-card,
.loop-card,
.activity-item,
.task-item {
  transition:
    background-color var(--transition-fast),
    border-color var(--transition-fast);
}

.job-card:hover,
.loop-card:hover,
.activity-item:hover,
.task-item:hover {
  border-color: color-mix(in srgb, var(--primary-500) 24%, var(--border-color));
  background: color-mix(in srgb, var(--primary-500) 5%, var(--bg-card));
}

.job-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.job-card > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.job-card-head {
  display: flex !important;
  flex-direction: row !important;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.job-card-head > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.job-card-head em {
  flex: 0 0 auto;
  min-height: 24px;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-style: normal;
  font-weight: 900;
}

.risk-high {
  background: color-mix(in srgb, var(--accent-red) 10%, var(--bg-card));
  color: var(--accent-red);
}

.risk-medium {
  background: color-mix(in srgb, var(--accent-orange) 10%, var(--bg-card));
  color: var(--accent-orange);
}

.risk-low {
  background: color-mix(in srgb, var(--accent-green) 10%, var(--bg-card));
  color: var(--accent-green);
}

.job-card dl {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  margin: 0;
}

.job-card dl div {
  min-width: 0;
  padding: 7px 8px;
  border-radius: 8px;
  background: var(--bg-card);
}

.job-card dt,
.job-card time,
.asset-item span {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 850;
  line-height: 1.35;
}

.job-card dd {
  margin: 3px 0 0;
}

.job-card time {
  margin-top: auto;
}

.loop-card {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-height: 116px;
}

.loop-card > span {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 850;
}

.loop-card strong {
  font-size: 18px;
}

.loop-card p,
.asset-item p {
  margin: 0;
}

.asset-item {
  display: grid;
  grid-template-columns: 76px 36px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  padding: 10px;
}

.activity-list,
.task-list,
.meta-list {
  display: grid;
  gap: 8px;
}

.activity-item,
.task-item,
.meta-list div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  padding: 10px;
  border: 1px solid var(--border-color);
  border-radius: 9px;
  background: var(--bg-card-muted);
  color: inherit;
}

.activity-item > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.activity-item strong,
.activity-item span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.activity-item time,
.meta-list dt,
.meta-list dd,
.task-item strong {
  flex: 0 0 auto;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 800;
}

.meta-list {
  margin: 0;
}

.meta-list dt,
.meta-list dd {
  margin: 0;
}

.meta-list dd,
.task-item strong {
  color: var(--text-primary);
}

.empty-block {
  padding: 18px;
  border: 1px dashed var(--border-color-strong);
  border-radius: 10px;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.7;
  background: var(--bg-card-muted);
}

.learning-score {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.learning-score strong {
  color: var(--text-primary);
  font-size: 30px;
  font-weight: 900;
  line-height: 1;
}

.learning-score span {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 750;
}

.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}

.chip-row span {
  min-height: 24px;
  padding: 3px 9px;
  border-radius: 999px;
  background: rgba(224, 138, 58, 0.1);
  color: var(--accent-orange);
  font-size: 11px;
  font-weight: 800;
}

@media (max-width: 1180px) {
  .stats-grid,
  .quick-grid,
  .job-grid,
  .loop-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .dashboard-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .workspace-scroll {
    padding: 64px 12px 12px;
  }

  .dashboard-header,
  .next-panel {
    align-items: stretch;
    flex-direction: column;
  }

  .primary-action,
  .panel-link {
    width: 100%;
  }

  .stats-grid,
  .quick-grid,
  .job-grid,
  .loop-grid {
    grid-template-columns: 1fr;
  }

  .pipeline-step {
    grid-template-columns: 30px minmax(0, 1fr);
  }

  .signal-item {
    grid-template-columns: 1fr;
  }

  .signal-source {
    width: fit-content;
    min-width: 54px;
  }

  .signal-meta {
    align-items: flex-start;
    min-width: 0;
  }

  .step-meta {
    grid-column: 2;
    align-items: flex-start;
    min-width: 0;
  }

  .asset-item {
    grid-template-columns: 72px 32px minmax(0, 1fr);
  }

  .dashboard-title-block h1 {
    font-size: 21px;
  }
}
</style>
