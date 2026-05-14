import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import type { JDData, JDMatchResult, ResumeOverview, JDSuggestion, JdPrepInsight, CompanyIntelData } from '@/services/types/jd'
import type { InterviewQuestion } from '@/services/jd/interviewBank'
import { buildInterviewDrivenSuggestions, mapScoreBreakdownToWeakModules } from '@/services/jd/weaknessMapping'
import type { InterviewSessionRecord } from '@/components/ai/interview/types'

/** 面试历史 localStorage key（与 useInterviewHistory 保持一致） */
const INTERVIEW_HISTORY_STORAGE_KEY = 'prepwise_interview_history'

export type JdAnalysisTabKey = 'input' | 'match' | 'overview' | 'optimize'
export type JdPrepHistoryStatus = 'completed'

export interface JdAnalysisMeta {
  analysisId: string
  jdSignature: string
  resumeSignature: string
  generatedAt: string
  schemaVersion: number
}

export interface JdPrepHistoryItem {
  id: string
  company: string
  position: string
  jdText: string
  jdData: JDData | null
  matchResult: JDMatchResult | null
  overview: ResumeOverview | null
  prepInsight: JdPrepInsight | null
  companyIntel: CompanyIntelData | null
  interviewQuestions: InterviewQuestion[]
  interviewBatchSummary: string
  suggestions: JDSuggestion[]
  analysisMeta: JdAnalysisMeta | null
  practiceCount?: number
  lastPracticedAt?: string
  lastInterviewScore?: number | null
  lastInterviewPassed?: boolean | null
  lastWeaknesses?: string[]
  lastSuggestedResumeModules?: string[]
  linkedInterviewRecordIds?: string[]
  /** 面试练习中表现较差的题目 ID 列表 */
  weakQuestionIds?: string[]
  /** 闭环阶段时间戳记录 */
  loopTimestamps?: Array<{ phase: string; timestamp: string; score?: number | null }>
  createdAt: string
  updatedAt: string
  status: JdPrepHistoryStatus
}

export interface JdInterviewPracticePayload {
  interviewRecordId: string
  practicedAt?: string
  totalScore: number | null
  passed: boolean | null
  weaknesses: string[]
  suggestedResumeModules: string[]
}

interface JdAnalysisStorageData {
  activeTab?: JdAnalysisTabKey
  targetCompany?: string
  targetPosition?: string
  jdText?: string
  jdData?: JDData | null
  matchResult?: JDMatchResult | null
  overview?: ResumeOverview | null
  prepInsight?: JdPrepInsight | null
  companyIntel?: CompanyIntelData | null
  interviewQuestions?: InterviewQuestion[]
  interviewBatchSummary?: string
  suggestions?: JDSuggestion[]
  analysisMeta?: JdAnalysisMeta | null
  history?: JdPrepHistoryItem[]
}

const STORAGE_KEY = 'resume-builder-jd-analysis'
const ANALYSIS_SCHEMA_VERSION = 4
const MAX_HISTORY_ITEMS = 12

function createAnalysisId(): string {
  return `analysis_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function normalizeHistoryItem(raw: unknown): JdPrepHistoryItem | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Partial<JdPrepHistoryItem>
  const id = typeof item.id === 'string' && item.id.trim() ? item.id : ''
  if (!id) return null
  const linkedInterviewRecordIds = Array.isArray(item.linkedInterviewRecordIds)
    ? item.linkedInterviewRecordIds.map((entry) => String(entry).trim()).filter(Boolean)
    : []

  return {
    id,
    company: typeof item.company === 'string' ? item.company : '',
    position: typeof item.position === 'string' ? item.position : '',
    jdText: typeof item.jdText === 'string' ? item.jdText : '',
    jdData: item.jdData ?? null,
    matchResult: item.matchResult ?? null,
    overview: item.overview ?? null,
    prepInsight: item.prepInsight ?? null,
    companyIntel: item.companyIntel ?? null,
    interviewQuestions: Array.isArray(item.interviewQuestions) ? item.interviewQuestions : [],
    interviewBatchSummary: typeof item.interviewBatchSummary === 'string' ? item.interviewBatchSummary : '',
    suggestions: Array.isArray(item.suggestions) ? item.suggestions : [],
    analysisMeta: item.analysisMeta && typeof item.analysisMeta === 'object'
      ? {
          analysisId: typeof item.analysisMeta.analysisId === 'string' && item.analysisMeta.analysisId.trim()
            ? item.analysisMeta.analysisId
            : id,
          jdSignature: typeof item.analysisMeta.jdSignature === 'string' ? item.analysisMeta.jdSignature : '',
          resumeSignature: typeof item.analysisMeta.resumeSignature === 'string' ? item.analysisMeta.resumeSignature : '',
          generatedAt: typeof item.analysisMeta.generatedAt === 'string' ? item.analysisMeta.generatedAt : id,
          schemaVersion: ANALYSIS_SCHEMA_VERSION,
        }
      : null,
    practiceCount: typeof item.practiceCount === 'number' ? item.practiceCount : linkedInterviewRecordIds.length,
    lastPracticedAt: typeof item.lastPracticedAt === 'string' ? item.lastPracticedAt : '',
    lastInterviewScore: typeof item.lastInterviewScore === 'number' ? item.lastInterviewScore : null,
    lastInterviewPassed: typeof item.lastInterviewPassed === 'boolean' ? item.lastInterviewPassed : null,
    lastWeaknesses: Array.isArray(item.lastWeaknesses) ? item.lastWeaknesses.map((entry) => String(entry)) : [],
    lastSuggestedResumeModules: Array.isArray(item.lastSuggestedResumeModules) ? item.lastSuggestedResumeModules.map((entry) => String(entry)) : [],
    linkedInterviewRecordIds,
    weakQuestionIds: Array.isArray(item.weakQuestionIds) ? item.weakQuestionIds.map((entry) => String(entry)) : [],
    loopTimestamps: Array.isArray(item.loopTimestamps) ? item.loopTimestamps : [],
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
    updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date().toISOString(),
    status: 'completed',
  }
}

function migrateStorageData(data: JdAnalysisStorageData): JdAnalysisStorageData {
  const history = Array.isArray(data.history)
    ? data.history
      .map((item) => normalizeHistoryItem(item))
      .filter((item): item is JdPrepHistoryItem => Boolean(item))
      .slice(0, MAX_HISTORY_ITEMS)
    : []

  const analysisMeta = data.analysisMeta && typeof data.analysisMeta === 'object'
    ? {
        analysisId: typeof data.analysisMeta.analysisId === 'string' && data.analysisMeta.analysisId.trim()
          ? data.analysisMeta.analysisId
          : createAnalysisId(),
        jdSignature: typeof data.analysisMeta.jdSignature === 'string' ? data.analysisMeta.jdSignature : '',
        resumeSignature: typeof data.analysisMeta.resumeSignature === 'string' ? data.analysisMeta.resumeSignature : '',
        generatedAt: typeof data.analysisMeta.generatedAt === 'string' ? data.analysisMeta.generatedAt : '',
        schemaVersion: ANALYSIS_SCHEMA_VERSION,
      }
    : null

  return {
    activeTab: data.activeTab ?? 'input',
    targetCompany: typeof data.targetCompany === 'string' ? data.targetCompany : '',
    targetPosition: typeof data.targetPosition === 'string' ? data.targetPosition : '',
    jdText: typeof data.jdText === 'string' ? data.jdText : '',
    jdData: data.jdData ?? null,
    matchResult: data.matchResult ?? null,
    overview: data.overview ?? null,
    prepInsight: data.prepInsight ?? null,
    companyIntel: data.companyIntel ?? null,
    interviewQuestions: Array.isArray(data.interviewQuestions) ? data.interviewQuestions : [],
    interviewBatchSummary: typeof data.interviewBatchSummary === 'string' ? data.interviewBatchSummary : '',
    suggestions: Array.isArray(data.suggestions) ? data.suggestions : [],
    analysisMeta,
    history,
  }
}

export const useJdAnalysisStore = defineStore('jdAnalysis', () => {
  const activeTab = ref<JdAnalysisTabKey>('input')
  const targetCompany = ref('')
  const targetPosition = ref('')
  const jdText = ref('')
  const jdData = ref<JDData | null>(null)
  const matchResult = ref<JDMatchResult | null>(null)
  const overview = ref<ResumeOverview | null>(null)
  const prepInsight = ref<JdPrepInsight | null>(null)
  const companyIntel = ref<CompanyIntelData | null>(null)
  const interviewQuestions = ref<InterviewQuestion[]>([])
  const interviewBatchSummary = ref('')
  const suggestions = ref<JDSuggestion[]>([])
  const analysisMeta = ref<JdAnalysisMeta | null>(null)
  const history = ref<JdPrepHistoryItem[]>([])

  const isLoading = ref(false)
  const loadingLabel = ref('')
  const streamText = ref('')
  const errorMsg = ref('')

  // 鍚勯樁娈电嫭绔?loading / error 鏍囪瘑
  const stageLoading = ref({
    match: false,
    overview: false,
    suggestions: false,
    prepInsight: false,
    companyIntel: false,
  })
  const stageError = ref({
    match: '',
    overview: '',
    suggestions: '',
    prepInsight: '',
    companyIntel: '',
  })

  // 阶段流式预览文本
  const stageStreamText = ref({
    match: '',
    overview: '',
    suggestions: '',
    prepInsight: '',
    companyIntel: '',
  })

  // 阶段开始时间戳（用于已用时间计时）
  const stageStartTime = ref({
    match: 0,
    overview: 0,
    suggestions: 0,
    prepInsight: 0,
    companyIntel: 0,
  })

  // 取消控制器
  const analysisAbortController = ref<AbortController | null>(null)

  const hasRoleSummary = computed(() => Boolean(overview.value?.headline?.trim()))
  const requirementEvidenceCount = computed(() => matchResult.value?.matches.filter((item) => {
    const hasEvidenceList = Array.isArray(item.evidenceList) && item.evidenceList.length > 0
    const hasEvidenceText = Boolean(item.evidence && item.evidence !== '简历中未提及')
    return hasEvidenceList || hasEvidenceText
  }).length ?? 0)
  const requirementRiskCount = computed(() => matchResult.value?.matches.filter((item) => (item.riskGaps?.length ?? 0) > 0).length ?? 0)
  const hasPrepInsight = computed(() => Boolean(prepInsight.value && (
    prepInsight.value.summary
    || prepInsight.value.prepPriorities.length
    || prepInsight.value.recommendedStories.length
    || prepInsight.value.highRiskFollowUps.length
    || prepInsight.value.likelyQuestionGroups.length
  )))
  const hasLikelyQuestionGroups = computed(() => (prepInsight.value?.likelyQuestionGroups.length ?? 0) > 0)
  const hasCompletedAnalysis = computed(() => Boolean(jdData.value))

  const allStagesCompleted = computed(() => Boolean(
    matchResult.value && overview.value && prepInsight.value
  ))

  // 鏄惁鏈変换鎰忛樁娈靛湪 loading
  const isAnyStageLoading = computed(() =>
    Object.values(stageLoading.value).some(v => v)
  )

  function saveToStorage() {
    if (typeof localStorage === 'undefined') return

    const data: JdAnalysisStorageData = {
      activeTab: activeTab.value,
      targetCompany: targetCompany.value,
      targetPosition: targetPosition.value,
      jdText: jdText.value,
      jdData: jdData.value,
      matchResult: matchResult.value,
      overview: overview.value,
      prepInsight: prepInsight.value,
      companyIntel: companyIntel.value,
      interviewQuestions: interviewQuestions.value,
      interviewBatchSummary: interviewBatchSummary.value,
      suggestions: suggestions.value,
      analysisMeta: analysisMeta.value,
      history: history.value,
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }

  function loadFromStorage() {
    if (typeof localStorage === 'undefined') return
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return

    try {
      const parsed = JSON.parse(raw) as JdAnalysisStorageData
      const data = migrateStorageData(parsed)

      activeTab.value = data.activeTab ?? 'input'
      targetCompany.value = data.targetCompany ?? ''
      targetPosition.value = data.targetPosition ?? ''
      jdText.value = data.jdText ?? ''
      jdData.value = data.jdData ?? null
      matchResult.value = data.matchResult ?? null
      overview.value = data.overview ?? null
      prepInsight.value = data.prepInsight ?? null
      companyIntel.value = data.companyIntel ?? null
      interviewQuestions.value = data.interviewQuestions ?? []
      interviewBatchSummary.value = data.interviewBatchSummary ?? ''
      suggestions.value = data.suggestions ?? []
      analysisMeta.value = data.analysisMeta ?? null
      history.value = data.history ?? []
    } catch (error) {
      console.warn('Failed to load JD analysis data from localStorage', error)
    }
  }

  function clearTransientState() {
    isLoading.value = false
    loadingLabel.value = ''
    streamText.value = ''
    errorMsg.value = ''
    stageLoading.value = { match: false, overview: false, suggestions: false, prepInsight: false, companyIntel: false }
    stageError.value = { match: '', overview: '', suggestions: '', prepInsight: '', companyIntel: '' }
    stageStreamText.value = { match: '', overview: '', suggestions: '', prepInsight: '', companyIntel: '' }
    stageStartTime.value = { match: 0, overview: 0, suggestions: 0, prepInsight: 0, companyIntel: 0 }
  }

  function clearStageStreamText() {
    stageStreamText.value = { match: '', overview: '', suggestions: '', prepInsight: '', companyIntel: '' }
    stageStartTime.value = { match: 0, overview: 0, suggestions: 0, prepInsight: 0, companyIntel: 0 }
  }

  function cancelAllStages() {
    analysisAbortController.value?.abort()
    analysisAbortController.value = null
    stageLoading.value = { match: false, overview: false, suggestions: false, prepInsight: false, companyIntel: false }
  }

  function resetAnalysisState() {
    activeTab.value = 'input'
    targetCompany.value = ''
    targetPosition.value = ''
    jdText.value = ''
    jdData.value = null
    matchResult.value = null
    overview.value = null
    prepInsight.value = null
    companyIntel.value = null
    interviewQuestions.value = []
    interviewBatchSummary.value = ''
    suggestions.value = []
    analysisMeta.value = null
    clearTransientState()
    saveToStorage()
  }

  function clearComputedResults() {
    matchResult.value = null
    overview.value = null
    prepInsight.value = null
    companyIntel.value = null
    interviewQuestions.value = []
    interviewBatchSummary.value = ''
    suggestions.value = []
    analysisMeta.value = null
  }

  function findHistoryItemByAnalysisId(targetAnalysisId: string) {
    const normalizedId = targetAnalysisId.trim()
    if (!normalizedId) return null
    return history.value.find((item) => item.analysisMeta?.analysisId === normalizedId || item.id === normalizedId) ?? null
  }

  function markAnalysisMeta(jdSignature: string, resumeSignature: string) {
    const hasSameCurrentSignature = analysisMeta.value?.jdSignature === jdSignature
      && analysisMeta.value?.resumeSignature === resumeSignature
    const existingHistoryItem = history.value.find((item) =>
      item.analysisMeta?.jdSignature === jdSignature
      && item.analysisMeta?.resumeSignature === resumeSignature,
    )
    const existingMeta = hasSameCurrentSignature
      ? analysisMeta.value
      : existingHistoryItem?.analysisMeta ?? null

    analysisMeta.value = {
      analysisId: existingMeta?.analysisId ?? createAnalysisId(),
      jdSignature,
      resumeSignature,
      generatedAt: existingMeta?.generatedAt ?? new Date().toISOString(),
      schemaVersion: ANALYSIS_SCHEMA_VERSION,
    }
  }

  function setLoading(loading: boolean, label = '') {
    isLoading.value = loading
    loadingLabel.value = loading ? label : ''
    if (!loading) {
      streamText.value = ''
    }
  }

  function setError(message: string) {
    errorMsg.value = message
    isLoading.value = false
    loadingLabel.value = ''
  }

  function saveCurrentToHistory() {
    if (!jdText.value.trim()) return

    const now = new Date().toISOString()
    const nextAnalysisMeta: JdAnalysisMeta = analysisMeta.value ?? {
      analysisId: createAnalysisId(),
      jdSignature: '',
      resumeSignature: '',
      generatedAt: now,
      schemaVersion: ANALYSIS_SCHEMA_VERSION,
    }
    const recordId = nextAnalysisMeta.analysisId
    const existing = findHistoryItemByAnalysisId(recordId)
    const nextItem: JdPrepHistoryItem = {
      id: recordId,
      company: targetCompany.value.trim() || jdData.value?.basicInfo.company || '',
      position: targetPosition.value.trim() || jdData.value?.basicInfo.jobTitle || '',
      jdText: jdText.value,
      jdData: jdData.value,
      matchResult: matchResult.value,
      overview: overview.value,
      prepInsight: prepInsight.value,
      companyIntel: companyIntel.value,
      interviewQuestions: [...interviewQuestions.value],
      interviewBatchSummary: interviewBatchSummary.value,
      suggestions: [...suggestions.value],
      analysisMeta: nextAnalysisMeta,
      practiceCount: existing?.practiceCount ?? 0,
      lastPracticedAt: existing?.lastPracticedAt ?? '',
      lastInterviewScore: existing?.lastInterviewScore ?? null,
      lastInterviewPassed: existing?.lastInterviewPassed ?? null,
      lastWeaknesses: [...(existing?.lastWeaknesses ?? [])],
      lastSuggestedResumeModules: [...(existing?.lastSuggestedResumeModules ?? [])],
      linkedInterviewRecordIds: [...(existing?.linkedInterviewRecordIds ?? [])],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      status: 'completed',
    }
    analysisMeta.value = nextAnalysisMeta

    const existingIndex = history.value.findIndex((item) => item.id === recordId || item.analysisMeta?.analysisId === recordId)

    if (existingIndex >= 0) {
      const existingItem = history.value[existingIndex]
      if (!existingItem) return
      history.value.splice(existingIndex, 1)
      history.value.unshift({
        ...existingItem,
        ...nextItem,
        createdAt: existingItem.createdAt,
        updatedAt: now,
      })
    } else {
      history.value.unshift(nextItem)
    }

    if (history.value.length > MAX_HISTORY_ITEMS) {
      history.value.splice(MAX_HISTORY_ITEMS)
    }
  }

  function recordInterviewPractice(analysisId: string, payload: JdInterviewPracticePayload) {
    const item = findHistoryItemByAnalysisId(analysisId)
    if (!item) return

    const existingIndex = history.value.findIndex((entry) => entry.id === item.id)
    if (existingIndex < 0) return

    const practicedAt = payload.practicedAt?.trim() || new Date().toISOString()
    const interviewRecordId = payload.interviewRecordId.trim()
    const linkedInterviewRecordIds = Array.from(new Set([
      ...(item.linkedInterviewRecordIds ?? []),
      interviewRecordId,
    ].filter(Boolean)))

    history.value.splice(existingIndex, 1, {
      ...item,
      practiceCount: Math.max(item.practiceCount ?? 0, linkedInterviewRecordIds.length),
      lastPracticedAt: practicedAt,
      lastInterviewScore: payload.totalScore,
      lastInterviewPassed: payload.passed,
      lastWeaknesses: [...payload.weaknesses],
      lastSuggestedResumeModules: [...payload.suggestedResumeModules],
      linkedInterviewRecordIds,
      loopTimestamps: [
        ...(item.loopTimestamps ?? []),
        { phase: 'interview-done', timestamp: practicedAt, score: payload.totalScore },
      ],
      updatedAt: practicedAt,
    })
  }

  /** 直接读取面试历史 localStorage，不依赖 composable */
  function loadLinkedInterviewRecords(recordIds: string[]): InterviewSessionRecord[] {
    if (!recordIds.length) return []
    try {
      const raw = localStorage.getItem(INTERVIEW_HISTORY_STORAGE_KEY)
      if (!raw) return []
      const all: InterviewSessionRecord[] = JSON.parse(raw)
      if (!Array.isArray(all)) return []
      const idSet = new Set(recordIds)
      return all.filter((r) => idSet.has(r.id))
    } catch {
      return []
    }
  }

  /** 基于面试表现生成针对性优化建议 */
  function generateInterviewDrivenOptimizations(analysisId: string): JDSuggestion[] {
    const item = findHistoryItemByAnalysisId(analysisId)
    if (!item) return []

    const weaknesses = item.lastWeaknesses ?? []
    if (!weaknesses.length) return []

    // 从关联的面试记录中提取评分
    const records = loadLinkedInterviewRecords(item.linkedInterviewRecordIds ?? [])
    const latestRecord = records[0]
    const scoreBreakdown = latestRecord?.reviewData?.scoreBreakdown ?? null
    const weakModules = mapScoreBreakdownToWeakModules(scoreBreakdown)

    const newSuggestions = buildInterviewDrivenSuggestions(
      weaknesses,
      weakModules,
      suggestions.value,
    )

    if (newSuggestions.length > 0) {
      suggestions.value = [...suggestions.value, ...newSuggestions]
      activeTab.value = 'optimize'
    }

    return newSuggestions
  }

  function openHistoryItem(id: string) {
    const item = history.value.find((entry) => entry.id === id)
    if (!item) return

    activeTab.value = 'overview'
    targetCompany.value = item.company
    targetPosition.value = item.position
    jdText.value = item.jdText
    jdData.value = item.jdData
    matchResult.value = item.matchResult
    overview.value = item.overview
    prepInsight.value = item.prepInsight
    companyIntel.value = item.companyIntel ?? null
    interviewQuestions.value = [...(item.interviewQuestions || [])]
    interviewBatchSummary.value = item.interviewBatchSummary || ''
    suggestions.value = [...item.suggestions]
    analysisMeta.value = item.analysisMeta ?? {
      analysisId: item.id,
      jdSignature: '',
      resumeSignature: '',
      generatedAt: item.createdAt,
      schemaVersion: ANALYSIS_SCHEMA_VERSION,
    }
    clearTransientState()
  }

  function deleteHistoryItem(id: string) {
    history.value = history.value.filter((item) => item.id !== id)
  }

  function clearHistory() {
    history.value = []
  }

  loadFromStorage()

  watch(
    [
      activeTab,
      targetCompany,
      targetPosition,
      jdText,
      jdData,
      matchResult,
      overview,
      prepInsight,
      companyIntel,
      interviewQuestions,
      interviewBatchSummary,
      suggestions,
      analysisMeta,
      history,
    ],
    () => {
      saveToStorage()
    },
    { deep: true },
  )

  return {
    activeTab,
    targetCompany,
    targetPosition,
    jdText,
    jdData,
    matchResult,
    overview,
    prepInsight,
    companyIntel,
    interviewQuestions,
    interviewBatchSummary,
    suggestions,
    analysisMeta,
    history,
    isLoading,
    loadingLabel,
    streamText,
    errorMsg,
    stageLoading,
    stageError,
    stageStreamText,
    stageStartTime,
    analysisAbortController,
    hasRoleSummary,
    requirementEvidenceCount,
    requirementRiskCount,
    hasPrepInsight,
    hasLikelyQuestionGroups,
    hasCompletedAnalysis,
    allStagesCompleted,
    isAnyStageLoading,
    saveToStorage,
    loadFromStorage,
    clearTransientState,
    clearStageStreamText,
    cancelAllStages,
    resetAnalysisState,
    clearComputedResults,
    findHistoryItemByAnalysisId,
    markAnalysisMeta,
    setLoading,
    setError,
    saveCurrentToHistory,
    recordInterviewPractice,
    generateInterviewDrivenOptimizations,
    loadLinkedInterviewRecords,
    openHistoryItem,
    deleteHistoryItem,
    clearHistory,
  }
})
