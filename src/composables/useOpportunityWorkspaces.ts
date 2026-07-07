import { computed } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import type { InterviewSessionRecord } from '@/components/ai/interview/types'
import { useApplicationTrackerStore, type ApplicationTrackerItem } from '@/stores/applicationTracker'
import { useJdAnalysisStore, type JdPrepHistoryItem } from '@/stores/jdAnalysis'
import { useLearningProgressStore } from '@/stores/learningProgress'
import { useQuestionBankStore } from '@/stores/questionBank'
import { useResumeReviewStore } from '@/stores/resumeReview'
import { useResumeStore } from '@/stores/resume'
import { useResumeVersionsStore, type ResumeVersion } from '@/stores/resumeVersions'
import { loadInterviewRecords } from '@/composables/useInterviewHistory'
import {
  buildDeliveryPackage,
  type DeliveryPackage,
  type DeliveryResumeSnapshot,
} from '@/services/applicationDelivery'

export type OpportunityStageKey = 'jd' | 'resume' | 'review' | 'interview' | 'delivery'
export type OpportunityTone = 'ready' | 'active' | 'warning' | 'blocked' | 'pending'

export interface OpportunityLoopStep {
  key: OpportunityStageKey
  label: string
  state: OpportunityTone
  metric: string
  action: string
  route: RouteLocationRaw
}

export interface OpportunitySignal {
  id: string
  tone: 'critical' | 'warning' | 'neutral'
  title: string
  detail: string
  route: RouteLocationRaw
}

export interface OpportunityWorkspace {
  id: string
  title: string
  company: string
  updatedAt: string
  jd: JdPrepHistoryItem
  tracker: ApplicationTrackerItem
  resumeVersion: ResumeVersion | null
  deliveryPackage: DeliveryPackage
  linkedInterviews: InterviewSessionRecord[]
  questionCount: number
  weakQuestionCount: number
  learningRecordCount: number
  readinessScore: number
  readinessTone: OpportunityTone
  nextAction: {
    label: string
    detail: string
    route: RouteLocationRaw
  }
  loopSteps: OpportunityLoopStep[]
  signals: OpportunitySignal[]
}

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

function buildResumeSnapshot(resumeStore: ReturnType<typeof useResumeStore>): DeliveryResumeSnapshot {
  return {
    name: resumeStore.basicInfo.name,
    phone: resumeStore.basicInfo.phone,
    email: resumeStore.basicInfo.email,
    jobTitle: resumeStore.basicInfo.jobTitle,
    expectedLocation: resumeStore.basicInfo.expectedLocation || resumeStore.basicInfo.currentCity || resumeStore.basicInfo.location,
    expectedSalary: resumeStore.basicInfo.expectedSalary,
    skills: resumeStore.skills,
    workHighlights: resumeStore.workList
      .map((item) => [item.position, item.description].filter(Boolean).join('：'))
      .filter(Boolean),
    projectHighlights: resumeStore.projectList
      .map((item) => [item.name, item.mainWork || item.introduction].filter(Boolean).join('：'))
      .filter(Boolean),
  }
}

function calculateResumeCompletion(resumeStore: ReturnType<typeof useResumeStore>): number {
  let count = 0
  if (hasText(resumeStore.basicInfo.name) || hasText(resumeStore.basicInfo.jobTitle)) count += 1
  if (resumeStore.educationList.some((item) => hasText(item.school) || hasText(item.major))) count += 1
  if (hasText(resumeStore.skills)) count += 1
  if (resumeStore.workList.some((item) => hasText(item.company) || hasText(item.description))) count += 1
  if (resumeStore.projectList.some((item) => hasText(item.name) || hasText(item.mainWork))) count += 1
  if (resumeStore.personalWorkList.some((item) => hasText(item.name) || hasText(item.description))) count += 1
  if (resumeStore.awardList.some((item) => hasText(item.name))) count += 1
  if (hasText(resumeStore.selfIntro)) count += 1
  return Math.round((count / 8) * 100)
}

function stepTone(completed: boolean, warning: boolean, active: boolean): OpportunityTone {
  if (warning) return 'warning'
  if (completed) return 'ready'
  if (active) return 'active'
  return 'pending'
}

function readinessTone(score: number): OpportunityTone {
  if (score >= 86) return 'ready'
  if (score >= 70) return 'active'
  if (score >= 50) return 'warning'
  return 'blocked'
}

function buildSignals(input: {
  jd: JdPrepHistoryItem
  deliveryPackage: DeliveryPackage
  highPriorityReviewTasks: number
  linkedInterviews: InterviewSessionRecord[]
  weakQuestionCount: number
}): OpportunitySignal[] {
  const signals: OpportunitySignal[] = []
  const matchScore = input.jd.matchResult?.score.total ?? null
  const highRiskIds = input.jd.artifacts?.candidateFitGraph?.highRiskRequirementIds ?? []

  if (matchScore != null && matchScore < 60) {
    signals.push({
      id: `${input.jd.id}-match-low`,
      tone: 'critical',
      title: '岗位匹配偏低',
      detail: `当前匹配分 ${matchScore}，建议先处理硬性缺口。`,
      route: { name: 'jd-analysis' },
    })
  }

  if (highRiskIds.length > 0) {
    signals.push({
      id: `${input.jd.id}-fit-risk`,
      tone: highRiskIds.length >= 3 ? 'critical' : 'warning',
      title: '高风险岗位要求',
      detail: `${highRiskIds.length} 项高优先级要求证据不足或存在风险。`,
      route: { name: 'jd-analysis' },
    })
  }

  if (input.highPriorityReviewTasks > 0) {
    signals.push({
      id: `${input.jd.id}-review-tasks`,
      tone: 'warning',
      title: '简历审查待办',
      detail: `${input.highPriorityReviewTasks} 项高优先级审查任务待处理。`,
      route: { name: 'resume-review' },
    })
  }

  if (input.weakQuestionCount > 0) {
    signals.push({
      id: `${input.jd.id}-question-weak`,
      tone: 'warning',
      title: '题库掌握偏弱',
      detail: `${input.weakQuestionCount} 道关联题目仍未掌握。`,
      route: { name: 'question-bank' },
    })
  }

  const latestInterview = input.linkedInterviews[0]
  if (latestInterview?.totalScore != null && latestInterview.totalScore < 70) {
    signals.push({
      id: `${input.jd.id}-interview-low`,
      tone: 'critical',
      title: '模拟面试表现偏低',
      detail: `最近一次面试 ${latestInterview.totalScore} 分，建议回到专项训练。`,
      route: { name: 'training-center' },
    })
  }

  if (input.deliveryPackage.readinessState === 'blocked') {
    signals.push({
      id: `${input.jd.id}-delivery-blocked`,
      tone: 'critical',
      title: '投递准备存在阻塞',
      detail: input.deliveryPackage.nextAction,
      route: { name: 'workspace-dashboard', query: { tab: 'tracker' } },
    })
  }

  return signals.slice(0, 5)
}

function buildOpportunity(input: {
  jd: JdPrepHistoryItem
  tracker: ApplicationTrackerItem
  resumeVersion: ResumeVersion | null
  deliveryPackage: DeliveryPackage
  resumeCompletion: number
  hasReviewResult: boolean
  highPriorityReviewTasks: number
  linkedInterviews: InterviewSessionRecord[]
  questionCount: number
  weakQuestionCount: number
  learningRecordCount: number
}): OpportunityWorkspace {
  const matchScore = input.jd.matchResult?.score.total ?? 0
  const hasReview = input.hasReviewResult && input.highPriorityReviewTasks === 0
  const hasInterviewPractice = input.linkedInterviews.length > 0 || (input.jd.practiceCount ?? 0) > 0
  const deliveryReadyScore = input.deliveryPackage.readinessScore
  const readinessScore = Math.round(
    (matchScore * 0.28)
    + (input.resumeCompletion * 0.18)
    + (deliveryReadyScore * 0.22)
    + ((input.jd.interviewQuestions.length ? 82 : 30) * 0.12)
    + ((hasInterviewPractice ? 88 : 35) * 0.12)
    + ((input.highPriorityReviewTasks === 0 ? 85 : 48) * 0.08),
  )

  const loopSteps: OpportunityLoopStep[] = [
    {
      key: 'jd',
      label: '岗位画像',
      state: stepTone(Boolean(input.jd.matchResult), matchScore < 60 && matchScore > 0, true),
      metric: input.jd.matchResult ? `${matchScore} 分` : '待匹配',
      action: input.jd.artifacts?.candidateFitGraph?.coverage.length
        ? `${input.jd.artifacts.candidateFitGraph.coverage.length} 条要求已映射`
        : '继续生成匹配图',
      route: { name: 'jd-analysis' },
    },
    {
      key: 'resume',
      label: '简历版本',
      state: stepTone(Boolean(input.resumeVersion), input.resumeCompletion < 60, true),
      metric: input.resumeVersion?.name || '当前简历',
      action: `${input.resumeCompletion}% 完整度`,
      route: { name: 'resume-editor' },
    },
    {
      key: 'review',
      label: '简历审查',
      state: stepTone(hasReview, input.highPriorityReviewTasks > 0, Boolean(input.resumeVersion)),
      metric: input.hasReviewResult
        ? input.highPriorityReviewTasks > 0 ? `${input.highPriorityReviewTasks} 高优` : '已检查'
        : '待审查',
      action: input.hasReviewResult
        ? input.highPriorityReviewTasks > 0 ? '先处理审查任务' : '质量可进入下一步'
        : '先跑一次简历审查',
      route: { name: 'resume-review' },
    },
    {
      key: 'interview',
      label: '面试训练',
      state: stepTone(hasInterviewPractice, input.jd.interviewQuestions.length === 0, Boolean(input.jd.matchResult)),
      metric: hasInterviewPractice ? `${input.linkedInterviews.length || input.jd.practiceCount} 次` : `${input.jd.interviewQuestions.length} 题`,
      action: hasInterviewPractice ? '已形成复盘' : '生成题包并练习',
      route: { name: 'training-center' },
    },
    {
      key: 'delivery',
      label: '投递推进',
      state: input.deliveryPackage.readinessState === 'ready'
        ? 'ready'
        : input.deliveryPackage.readinessState === 'blocked'
          ? 'blocked'
          : 'warning',
      metric: `${deliveryReadyScore}%`,
      action: input.deliveryPackage.nextAction,
      route: { name: 'workspace-dashboard', query: { tab: 'tracker' } },
    },
  ]

  const firstBlockedOrWarning = loopSteps.find(step => step.state === 'blocked' || step.state === 'warning')
  const nextAction = firstBlockedOrWarning
    ? {
        label: firstBlockedOrWarning.label,
        detail: firstBlockedOrWarning.action,
        route: firstBlockedOrWarning.route,
      }
    : {
        label: '进入投递',
        detail: input.deliveryPackage.nextAction,
        route: { name: 'workspace-dashboard', query: { tab: 'tracker' } } as RouteLocationRaw,
      }

  return {
    id: input.jd.id,
    title: input.jd.position || input.jd.jdData?.basicInfo.jobTitle || '未命名岗位',
    company: input.jd.company || input.jd.jdData?.basicInfo.company || '未填写公司',
    updatedAt: input.jd.updatedAt,
    jd: input.jd,
    tracker: input.tracker,
    resumeVersion: input.resumeVersion,
    deliveryPackage: input.deliveryPackage,
    linkedInterviews: input.linkedInterviews,
    questionCount: input.questionCount,
    weakQuestionCount: input.weakQuestionCount,
    learningRecordCount: input.learningRecordCount,
    readinessScore,
    readinessTone: readinessTone(readinessScore),
    nextAction,
    loopSteps,
    signals: buildSignals({
      jd: input.jd,
      deliveryPackage: input.deliveryPackage,
      highPriorityReviewTasks: input.highPriorityReviewTasks,
      linkedInterviews: input.linkedInterviews,
      weakQuestionCount: input.weakQuestionCount,
    }),
  }
}

export function useOpportunityWorkspaces() {
  const jdStore = useJdAnalysisStore()
  const trackerStore = useApplicationTrackerStore()
  const resumeStore = useResumeStore()
  const resumeVersionsStore = useResumeVersionsStore()
  const reviewStore = useResumeReviewStore()
  const questionStore = useQuestionBankStore()
  const learningStore = useLearningProgressStore()

  const interviewRecords = computed(() => loadInterviewRecords())
  const resumeSnapshot = computed(() => buildResumeSnapshot(resumeStore))
  const resumeCompletion = computed(() => calculateResumeCompletion(resumeStore))
  const highPriorityReviewTasks = computed(() =>
    reviewStore.latestResult?.tasks.filter(item => item.priority === 'high').length ?? 0
  )

  const opportunities = computed<OpportunityWorkspace[]>(() =>
    jdStore.history.map((jd) => {
      const tracker = trackerStore.getTrackerItem(jd.id)
      const resumeVersion = resumeVersionsStore.versions.find(version => version.id === tracker.resumeVersionId)
        ?? resumeVersionsStore.activeVersion
      const linkedInterviews = interviewRecords.value.filter(record =>
        record.analysisId === jd.id || jd.linkedInterviewRecordIds?.includes(record.id)
      )
      const relatedQuestions = questionStore.questions.filter(question => question.jd_analysis_id === jd.id)
      const weakQuestionCount = relatedQuestions.filter(question => (question.mastery_level ?? 0) <= 1).length
      const learningRecordCount = learningStore.records.filter(record => record.analysisId === jd.id).length
      const deliveryPackage = buildDeliveryPackage({
        jd,
        tracker,
        resume: resumeSnapshot.value,
        review: reviewStore.latestResult,
      })

      return buildOpportunity({
        jd,
        tracker,
        resumeVersion,
        deliveryPackage,
        resumeCompletion: resumeCompletion.value,
        hasReviewResult: Boolean(reviewStore.latestResult),
        highPriorityReviewTasks: highPriorityReviewTasks.value,
        linkedInterviews,
        questionCount: relatedQuestions.length,
        weakQuestionCount,
        learningRecordCount,
      })
    }).sort((a, b) => {
      const toneRank: Record<OpportunityTone, number> = {
        blocked: 0,
        warning: 1,
        active: 2,
        pending: 3,
        ready: 4,
      }
      const toneDiff = toneRank[a.readinessTone] - toneRank[b.readinessTone]
      if (toneDiff !== 0) return toneDiff
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })
  )

  const activeOpportunity = computed(() => opportunities.value[0] ?? null)
  const criticalSignalCount = computed(() =>
    opportunities.value.reduce((sum, item) => sum + item.signals.filter(signal => signal.tone === 'critical').length, 0)
  )

  return {
    opportunities,
    activeOpportunity,
    resumeCompletion,
    criticalSignalCount,
  }
}
