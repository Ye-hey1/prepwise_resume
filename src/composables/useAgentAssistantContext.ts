import { SKILL_DIMENSIONS, useLearningProgressStore } from '@/stores/learningProgress'
import { APPLICATION_STATUS_OPTIONS, useApplicationTrackerStore } from '@/stores/applicationTracker'
import { useInterviewHistory } from '@/composables/useInterviewHistory'
import { useJdAnalysisStore } from '@/stores/jdAnalysis'
import { useQuestionBankStore, type SavedQuestion } from '@/stores/questionBank'
import { useResumeReviewStore } from '@/stores/resumeReview'
import { useResumeStore } from '@/stores/resume'

export interface AgentContextSource {
  key: string
  label: string
  count: number
  available: boolean
}

export interface AgentAssistantContextSnapshot {
  generatedAt: string
  headline: string
  contextText: string
  sources: AgentContextSource[]
  suggestedPrompts: string[]
}

const LOCAL_QUESTION_STORAGE_KEY = 'prepwise-question-bank'
const MAX_CONTEXT_CHARS = 14_000

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value
  return `${value.slice(0, Math.max(0, maxLength - 18)).trim()}... [已截断]`
}

function joinList(items: string[], maxItems = 6): string {
  const cleaned = items.map(cleanText).filter(Boolean)
  if (cleaned.length === 0) return '无'
  const visible = cleaned.slice(0, maxItems)
  const suffix = cleaned.length > visible.length ? ` 等 ${cleaned.length} 项` : ''
  return `${visible.join('、')}${suffix}`
}

function compactLines(lines: Array<string | false | null | undefined>): string[] {
  return lines.filter((line): line is string => Boolean(line && line.trim()))
}

function section(title: string, lines: Array<string | false | null | undefined>): string {
  const body = compactLines(lines)
  if (body.length === 0) return ''
  return [`## ${title}`, ...body].join('\n')
}

function countFilled(values: unknown[]): number {
  return values.filter((value) => cleanText(value).length > 0).length
}

function topFrequencies(items: string[], maxItems = 10): string {
  const counts = new Map<string, number>()
  items
    .map(cleanText)
    .filter(Boolean)
    .forEach((item) => counts.set(item, (counts.get(item) ?? 0) + 1))

  const ranked = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, maxItems)
    .map(([item, count]) => `${item}(${count})`)

  return ranked.length ? ranked.join('、') : '无'
}

function hasAnyText(record: Record<string, unknown>): boolean {
  return Object.values(record).some((value) => {
    if (Array.isArray(value)) return value.some((item) => cleanText(item).length > 0)
    return cleanText(value).length > 0
  })
}

function readLocalQuestions(): SavedQuestion[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(LOCAL_QUESTION_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed as SavedQuestion[] : []
  } catch {
    return []
  }
}

function latestNonEmpty<T>(items: T[]): T | null {
  return items.length > 0 ? items[0] ?? null : null
}

export function buildAgentAssistantContext(): AgentAssistantContextSnapshot {
  const resumeStore = useResumeStore()
  const jdStore = useJdAnalysisStore()
  const reviewStore = useResumeReviewStore()
  const questionStore = useQuestionBankStore()
  const trackerStore = useApplicationTrackerStore()
  const learningStore = useLearningProgressStore()
  const interviewHistory = useInterviewHistory()

  const visibleModules = resumeStore.modules.filter((module) => module.visible)
  const filledEducation = resumeStore.educationList.filter((item) => hasAnyText(item as unknown as Record<string, unknown>))
  const filledWork = resumeStore.workList.filter((item) => hasAnyText(item as unknown as Record<string, unknown>))
  const filledProjects = resumeStore.projectList.filter((item) => hasAnyText(item as unknown as Record<string, unknown>))
  const filledWorks = resumeStore.personalWorkList.filter((item) => hasAnyText(item as unknown as Record<string, unknown>))
  const filledTraining = resumeStore.trainingList.filter((item) => hasAnyText(item as unknown as Record<string, unknown>))
  const filledAwards = resumeStore.awardList.filter((item) => hasAnyText(item as unknown as Record<string, unknown>))
  const filledCustomSections = resumeStore.customSectionList.filter((item) =>
    cleanText(item.title) || item.items.some((entry) => hasAnyText(entry as unknown as Record<string, unknown>)),
  )
  const resumeFilledCount =
    countFilled(Object.values(resumeStore.basicInfo))
    + filledEducation.length
    + (cleanText(resumeStore.skills) ? 1 : 0)
    + filledWork.length
    + filledProjects.length
    + filledWorks.length
    + filledTraining.length
    + filledAwards.length
    + filledCustomSections.length
    + (cleanText(resumeStore.selfIntro) ? 1 : 0)

  const currentJdTitle = cleanText(jdStore.targetPosition)
    || cleanText(jdStore.jdData?.basicInfo.jobTitle)
  const currentCompany = cleanText(jdStore.targetCompany)
    || cleanText(jdStore.jdData?.basicInfo.company)
  const latestJd = latestNonEmpty(jdStore.history)
  const matchGaps = jdStore.matchResult?.gaps ?? []
  const riskyRequirements = jdStore.matchResult?.matches
    .filter((item) => item.status !== 'matched')
    .slice(0, 6)
    .map((item) => `${item.requirement}（${item.status}）：${item.suggestion || item.evidence}`)
    ?? []

  const review = reviewStore.latestResult
  const reviewTasks = review?.tasks.slice(0, 6).map((task) =>
    `${task.priority}｜${task.relatedModuleKey}｜${task.title}：${task.suggestion}`,
  ) ?? []

  const questions = questionStore.questions.length > 0
    ? questionStore.questions
    : readLocalQuestions()
  const weakQuestions = questions
    .filter((item) => (item.mastery_level ?? 0) <= 1)
    .slice(0, 6)
    .map((item) => `${item.category || '未分类'}｜${item.content}`)

  const interviewRecords = interviewHistory.loadHistoryRecords().slice(0, 5)
  const latestInterview = latestNonEmpty(interviewRecords)
  const latestWeaknesses = latestInterview?.reviewData?.weaknesses ?? []
  const latestStrengths = latestInterview?.reviewData?.strengths ?? []

  const scoreLines = SKILL_DIMENSIONS
    .map((dimension) => `${dimension.label}: ${learningStore.currentScores[dimension.key] || 0}`)
    .filter((line) => !line.endsWith(': 0'))
  const weakDimensions = learningStore.weakDimensions
    .map((dimension) => SKILL_DIMENSIONS.find((item) => item.key === dimension)?.label ?? dimension)

  const trackerItems = trackerStore.items
  const activeApplications = trackerItems.filter((item) => !['offer', 'rejected'].includes(item.status))
  const statusLabelMap = new Map(APPLICATION_STATUS_OPTIONS.map((option) => [option.key, option.label]))
  const trackerStatusSummary = APPLICATION_STATUS_OPTIONS
    .map((option) => `${option.label} ${trackerItems.filter((item) => item.status === option.key).length}`)
    .join('，')
  const trackedJdItems = trackerItems
    .map((item) => ({
      tracker: item,
      jd: jdStore.history.find((historyItem) => historyItem.id === item.jdId),
    }))
    .sort((a, b) => Date.parse(b.tracker.updatedAt) - Date.parse(a.tracker.updatedAt))
  const trackedJdRows = trackedJdItems
    .slice(0, 20)
    .map(({ tracker, jd }, index) => {
      const target = [jd?.company, jd?.position].map(cleanText).filter(Boolean).join(' / ') || tracker.jdId
      const score = jd?.matchResult?.score.total
      const techStack = jd?.jdData?.requirements.techStack ?? []
      const gaps = jd?.matchResult?.gaps ?? []
      const weaknesses = jd?.lastWeaknesses ?? []
      return [
        `${index + 1}. ${target}`,
        `状态 ${statusLabelMap.get(tracker.status) ?? tracker.status}`,
        `优先级 ${tracker.priority}`,
        tracker.platform && `平台 ${tracker.platform}`,
        tracker.channel && `渠道 ${tracker.channel}`,
        typeof score === 'number' && `匹配 ${score}/100`,
        techStack.length > 0 && `技术栈 ${joinList(techStack, 8)}`,
        gaps.length > 0 && `缺口 ${joinList(gaps, 4)}`,
        typeof jd?.lastInterviewScore === 'number' && `最近面试 ${jd.lastInterviewScore}`,
        weaknesses.length > 0 && `面试弱项 ${joinList(weaknesses, 3)}`,
        tracker.nextAction && `下一步 ${tracker.nextAction}`,
        tracker.note && `备注 ${truncateText(cleanText(tracker.note), 160)}`,
      ].filter(Boolean).join('；')
    })
  const trackedJdHistory = jdStore.history
  const jdTechTrend = topFrequencies(trackedJdHistory.flatMap((item) => item.jdData?.requirements.techStack ?? []), 12)
  const jdRequirementTrend = topFrequencies(
    trackedJdHistory.flatMap((item) => [
      ...(item.jdData?.requirements.mustHave.map((requirement) => requirement.text) ?? []),
      ...(item.jdData?.requirements.niceToHave.map((requirement) => requirement.text) ?? []),
    ]),
    12,
  )
  const jdGapTrend = topFrequencies(trackedJdHistory.flatMap((item) => item.matchResult?.gaps ?? []), 10)
  const interviewWeaknessTrend = topFrequencies([
    ...trackedJdHistory.flatMap((item) => item.lastWeaknesses ?? []),
    ...latestWeaknesses,
  ], 10)
  const trackerSummary = activeApplications
    .slice(0, 5)
    .map((item) => {
      const jd = jdStore.history.find((historyItem) => historyItem.id === item.jdId)
      const target = [jd?.company, jd?.position].map(cleanText).filter(Boolean).join(' / ') || item.jdId
      return `${target}：${item.status}，优先级 ${item.priority}${item.nextAction ? `，下一步 ${item.nextAction}` : ''}`
    })

  const headline = [
    currentCompany || latestJd?.company || '',
    currentJdTitle || latestJd?.position || resumeStore.basicInfo.jobTitle || '未设置目标岗位',
  ].filter(Boolean).join(' · ')

  const resumeSection = section('当前简历', [
    `目标/姓名：${joinList([resumeStore.basicInfo.name, resumeStore.basicInfo.jobTitle, resumeStore.basicInfo.currentCity])}`,
    `可见模块：${joinList(visibleModules.map((module) => module.label), 12)}`,
    `教育：${joinList(filledEducation.map((item) => [item.school, item.major, item.degree].filter(Boolean).join(' / ')), 4)}`,
    `技能：${truncateText(cleanText(resumeStore.skills), 900) || '无'}`,
    `工作经历：${joinList(filledWork.map((item) => [item.company, item.position, truncateText(cleanText(item.description), 220)].filter(Boolean).join(' / ')), 4)}`,
    `项目经历：${joinList(filledProjects.map((item) => [item.name, item.role, truncateText(cleanText(item.introduction || item.mainWork), 260)].filter(Boolean).join(' / ')), 4)}`,
    cleanText(resumeStore.selfIntro) && `个人简介：${truncateText(cleanText(resumeStore.selfIntro), 600)}`,
  ])

  const jdSection = section('JD 分析与岗位上下文', [
    `当前公司/岗位：${joinList([currentCompany, currentJdTitle])}`,
    jdStore.jdText && `JD 原文摘要：${truncateText(cleanText(jdStore.jdText), 1_200)}`,
    jdStore.jdData && `硬性要求：${joinList([
      jdStore.jdData.requirements.degree,
      jdStore.jdData.requirements.experience,
      ...jdStore.jdData.requirements.mustHave.map((item) => item.text),
    ], 10)}`,
    jdStore.jdData && `技术栈：${joinList(jdStore.jdData.requirements.techStack, 12)}`,
    jdStore.matchResult && `匹配总分：${jdStore.matchResult.score.total}/100；优势：${joinList(jdStore.matchResult.strengths, 5)}；缺口：${joinList(matchGaps, 8)}`,
    riskyRequirements.length > 0 && `风险要求：${riskyRequirements.join('；')}`,
    jdStore.prepInsight && `备面重点：${joinList(jdStore.prepInsight.prepPriorities, 8)}`,
    jdStore.companyIntel && `公司情报：${truncateText(cleanText(`${jdStore.companyIntel.businessScope} ${jdStore.companyIntel.howToReference}`), 800)}`,
    jdStore.suggestions.length > 0 && `JD 优化建议：${jdStore.suggestions.slice(0, 6).map((item) => `${item.priority}｜${item.section}｜${item.reason}`).join('；')}`,
  ])

  const reviewSection = section('简历审查', [
    review && `最近审查：${review.overallScore}/100，结论 ${review.verdict}，目标 ${review.targetRole || '未填写'}`,
    review?.summary && `审查摘要：${truncateText(review.summary, 700)}`,
    reviewTasks.length > 0 && `高价值任务：${reviewTasks.join('；')}`,
  ])

  const practiceSection = section('题库、面试与学习进度', [
    `题库：共 ${questions.length} 题；低掌握题：${weakQuestions.length ? weakQuestions.join('；') : '无'}`,
    latestInterview && `最近面试：${latestInterview.targetRole || '未记录岗位'}，总分 ${latestInterview.totalScore ?? '未评分'}，${latestInterview.passed === null ? '未判定' : latestInterview.passed ? '通过' : '未通过'}`,
    latestStrengths.length > 0 && `面试优势：${joinList(latestStrengths, 5)}`,
    latestWeaknesses.length > 0 && `面试弱项：${joinList(latestWeaknesses, 6)}`,
    scoreLines.length > 0 && `能力维度：${scoreLines.join('；')}`,
    weakDimensions.length > 0 && `薄弱维度：${joinList(weakDimensions, 6)}`,
  ])

  const trackerSection = section('投递追踪', [
    `投递记录：共 ${trackerItems.length} 条，进行中 ${activeApplications.length} 条`,
    trackerItems.length > 0 && `状态分布：${trackerStatusSummary}`,
    trackerSummary.length > 0 && trackerSummary.join('；'),
  ])

  const applicationDatasetSection = section('投递岗位数据集', [
    trackerItems.length > 0 && `投递漏斗样本：${trackerItems.length} 条投递记录；${trackedJdItems.filter((item) => item.jd).length} 条关联 JD 分析；${trackerItems.length > trackedJdRows.length ? `下方展示最近 ${trackedJdRows.length} 条` : '下方展示全部可用记录'}`,
    trackedJdRows.length > 0 && trackedJdRows.join('\n'),
    trackedJdHistory.length > 0 && `JD 技术栈高频：${jdTechTrend}`,
    trackedJdHistory.length > 0 && `JD 任职要求高频：${jdRequirementTrend}`,
    trackedJdHistory.length > 0 && `简历/JD 缺口高频：${jdGapTrend}`,
    interviewWeaknessTrend !== '无' && `面试弱项高频：${interviewWeaknessTrend}`,
  ])

  const contextText = truncateText(
    [resumeSection, jdSection, reviewSection, practiceSection, trackerSection, applicationDatasetSection]
      .filter(Boolean)
      .join('\n\n'),
    MAX_CONTEXT_CHARS,
  )

  const sources: AgentContextSource[] = [
    { key: 'resume', label: '简历', count: resumeFilledCount, available: resumeFilledCount > 0 },
    { key: 'jd', label: 'JD', count: jdStore.jdData ? 1 : 0, available: Boolean(jdStore.jdText || jdStore.jdData) },
    { key: 'match', label: '匹配', count: jdStore.matchResult?.matches.length ?? 0, available: Boolean(jdStore.matchResult) },
    { key: 'review', label: '审查', count: review?.tasks.length ?? 0, available: Boolean(review) },
    { key: 'questions', label: '题库', count: questions.length, available: questions.length > 0 },
    { key: 'interviews', label: '面试', count: interviewRecords.length, available: interviewRecords.length > 0 },
    { key: 'tracker', label: '投递', count: trackerItems.length, available: trackerItems.length > 0 },
  ]

  const suggestedPrompts = [
    jdStore.matchResult
      ? '基于当前 JD 匹配结果，按优先级列出 3 个最该补强的简历点'
      : '先读我的简历，判断现在最缺哪类求职上下文',
    review
      ? '把简历审查任务转成今天可以执行的修改顺序'
      : '帮我从简历里找出最影响可信度的表达问题',
    latestInterview
      ? '结合最近面试表现，安排下一轮训练计划'
      : '根据当前简历和 JD，生成一组面试追问方向',
    '生成一份需要我确认的简历改动提案，不要直接改数据',
  ]

  return {
    generatedAt: new Date().toISOString(),
    headline,
    contextText,
    sources,
    suggestedPrompts,
  }
}
