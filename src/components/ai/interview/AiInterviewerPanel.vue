<script setup lang="ts">
import { computed, onActivated, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AiConfigDialog from '@/components/ai/AiConfigDialog.vue'
import InterviewDrillPanel from '@/components/ai/interview/InterviewDrillPanel.vue'
import InterviewReviewPanel from '@/components/ai/interview/InterviewReviewPanel.vue'
import InterviewSimulationPanel from '@/components/ai/interview/InterviewSimulationPanel.vue'
import InterviewSourceBadge from '@/components/ai/interview/InterviewSourceBadge.vue'
import JdAnalysisStage from '@/components/ai/interview/JdAnalysisStage.vue'
import PrepConfigDialog from '@/components/ai/interview/PrepConfigDialog.vue'
import ResumePreviewOverlay from '@/components/ai/interview/ResumePreviewOverlay.vue'

import { useInterviewHistory } from '@/composables/useInterviewHistory'
import { useInterviewHint } from '@/composables/useInterviewHint'
import { useInterviewJd } from '@/composables/useInterviewJd'
import { useInterviewSession } from '@/composables/useInterviewSession'
import { useInterviewTimer } from '@/composables/useInterviewTimer'
import { useInterviewVoice } from '@/composables/useInterviewVoice'

import { useAiConfigStore } from '@/stores/aiConfig'
import { useJdAnalysisStore } from '@/stores/jdAnalysis'
import { useLearningProgressStore } from '@/stores/learningProgress'
import { useResumeStore } from '@/stores/resume'
import { useThemeStore } from '@/stores/theme'
import { savedQuestionToDrill } from '@/services/questionAdapter'

import type {
  InterviewReviewData,
  InterviewSessionRecord,
  InterviewWorkflowPhase,
} from '@/components/ai/interview/types'
import type { SavedQuestion } from '@/stores/questionBank'

const timer = useInterviewTimer()
const jd = useInterviewJd()
const hint = useInterviewHint()
const voice = useInterviewVoice()
const history = useInterviewHistory()

const session = useInterviewSession({
  getJdContext: () => jd.jdContext.value,
  getJdStoreContext: () => jd.getJdStoreContext(),
  extractResumeRole: jd.extractResumeRole,
  extractHighlightedProjects: jd.extractHighlightedProjects,
  trimList: jd.trimList,
  splitInputItems: jd.splitInputItems,
  detectDifficulty: jd.detectDifficulty,
  durationMinutes: timer.durationMinutes,
  elapsedSeconds: timer.elapsedSeconds,
  sessionStarted: timer.sessionStarted,
  timerRunning: timer.timerRunning,
  startTimer: timer.startTimer,
  stopTimer: timer.stopTimer,
  resetTimer: timer.resetTimer,
  hintCount: hint.hintCount,
  hintLimit: hint.hintLimit,
  resetHints: hint.resetHints,
  isListening: voice.isListening,
  stopRecording: voice.stopRecording,
})

const resumeStore = useResumeStore()
const aiConfig = useAiConfigStore()
const jdAnalysisStore = useJdAnalysisStore()
const learningProgressStore = useLearningProgressStore()
const themeStore = useThemeStore()
const router = useRouter()
const route = useRoute()

voice.setCallbacks({
  onTranscript: (text) => {
    session.inputText.value = session.inputText.value
      + (session.inputText.value && !session.inputText.value.endsWith(' ') ? ' ' : '')
      + text
  },
  onError: (msg) => {
    session.errorMsg.value = msg
  },
})

const showAiConfig = ref(false)

const phaseItems: Array<{ key: InterviewWorkflowPhase; label: string; icon: string }> = [
  { key: 'analysis', label: '岗位准备', icon: '1' },
  { key: 'simulation', label: '模拟面试', icon: '2' },
  { key: 'training', label: '训练复盘', icon: '3' },
]

const currentPhaseIndex = computed(() =>
  phaseItems.findIndex((item) => item.key === session.workflowPhase.value),
)

const isImmersive = computed(() =>
  session.isSimulationPhase.value,
)

// 进入面试间时强制暗色模式，退出时恢复
let previousTheme: string | null = null
watch(isImmersive, (immersive) => {
  if (immersive) {
    previousTheme = themeStore.preference
    if (themeStore.preference !== 'dark') {
      themeStore.setTheme('dark')
    }
  } else if (previousTheme && previousTheme !== 'dark') {
    themeStore.setTheme(previousTheme as 'light' | 'dark' | 'system')
    previousTheme = null
  }
})

const showWorkspaceSidebar = computed(() => !isImmersive.value)

const modelDisplayName = computed(() =>
  aiConfig.getConfigForFeature('interview').modelName.split('/').pop() || '未配置',
)

const overviewStats = computed(() => [
  {
    label: '当前阶段',
    value: session.phaseTitle.value,
  },
  {
    label: '当前模式',
    value: session.mode.value === 'candidate' ? '你是面试者' : '你是面试官',
  },
  {
    label: '计划时长',
    value: `${timer.durationMinutes.value} 分钟`,
  },
  {
    label: 'AI 模型',
    value: modelDisplayName.value,
  },
])

const contextHeadline = computed(() =>
  jd.jdContext.value.targetRole || '等待岗位解析',
)

const contextDescription = computed(() => {
  if (session.isTrainingPhase.value && trainingTab.value === 'review') {
    return session.reviewData.value.summary || '这轮模拟面试已经生成复盘结论，可以继续训练或优化简历。'
  }

  return jd.jdContext.value.summary
    || jd.jdContext.value.prepSummary
    || '完成岗位解析后，这里会显示一段精炼的岗位摘要。'
})

const contextMetaRows = computed(() => {
  const rows = [
    { label: '岗位', value: jd.jdContext.value.targetRole || '待识别' },
    { label: '级别', value: jd.jdContext.value.seniority || '待识别' },
    { label: '重点', value: jd.jdContext.value.focusAreas.slice(0, 3).join(' / ') || '等待解析' },
  ]

  return rows
})

const workbenchTitle = computed(() => {
  if (session.isTrainingPhase.value) {
    if (trainingTab.value === 'review') {
      return jd.jdContext.value.targetRole
        ? `${jd.jdContext.value.targetRole} 岗位的面试复盘结果`
        : '查看这轮模拟面试的诊断结果'
    }
    return jd.jdContext.value.targetRole
      ? `围绕 ${jd.jdContext.value.targetRole} 岗位做专项训练`
      : '围绕目标岗位做专项训练'
  }

  return jd.jdContext.value.targetRole
    ? `为 ${jd.jdContext.value.targetRole} 岗位建立面试准备方案`
    : '为目标岗位建立面试准备方案'
})

const workbenchSubtitle = computed(() => {
  if (session.isTrainingPhase.value) {
    return trainingTab.value === 'review'
      ? '先看清问题出在哪里，再决定是继续训练、优化简历，还是开启下一轮模拟。'
      : '把高风险追问、项目深挖和表达结构拆成可练习的题目，逐题补强。'
  }

  if (session.canEnterPrep.value) {
    return '岗位重点、匹配缺口和预测问题已经就绪，可以直接进入这轮模拟面试。'
  }
  if (jd.jdDraft.value.trim()) {
    return '把 JD 转成匹配度、技能差距和面试问题，再决定下一步。'
  }
  return '先粘贴 JD 或复用最近一次分析结果，生成一份清晰的备面分析面板。'
})

const workbenchPrimaryActionLabel = computed(() => {
  if (session.isTrainingPhase.value) {
    if (trainingTab.value === 'review') {
      return session.reviewData.value.suggestedResumeModules.length > 0 ? '去优化简历' : '开始新一轮'
    }
    return session.drillQuestions.value.length > 0 ? '重新生成训练题' : '生成专项训练'
  }

  return session.canEnterPrep.value ? '配置这轮面试' : '解析岗位要求'
})

const workbenchPrimaryDisabled = computed(() => {
  if (session.isTrainingPhase.value) {
    return trainingTab.value === 'review'
      ? false
      : session.drillLoading.value
  }

  return session.canEnterPrep.value ? false : jd.jdDraft.value.trim() === '' || jd.isLoading.value
})

const shellStatusLabel = computed(() => {
  if (session.isTrainingPhase.value && trainingTab.value === 'review') return '复盘进行中'
  if (session.isTrainingPhase.value) return '专项训练中'
  if (session.canEnterPrep.value) return '岗位已就绪'
  if (jd.jdDraft.value.trim()) return '等待解析'
  return '等待输入 JD'
})

const recentHistoryRecords = computed(() => history.historyRecords.value.slice(0, 2))

const reviewModulesText = computed(() => {
  const labelMap: Record<string, string> = {
    projectExperience: '项目经历',
    skills: '专业技能',
    workExperience: '工作经历',
    education: '教育经历',
    selfIntro: '个人简介',
  }

  return session.reviewData.value.suggestedResumeModules
    .map((item) => labelMap[item] ?? item)
    .join(' / ') || '暂无'
})

function getResumeModuleLabel(moduleName: string): string {
  const labelMap: Record<string, string> = {
    projectExperience: '项目经历',
    skills: '专业技能',
    workExperience: '工作经历',
    education: '教育经历',
    selfIntro: '个人简介',
  }
  return labelMap[moduleName] ?? moduleName
}

const canGenerateDrill = computed(() =>
  session.canEnterPrep.value && !session.drillLoading.value,
)

const showPrepDialog = ref(false)
const trainingTab = ref<'drill' | 'review'>('drill')

const historyReviewReturnPhase = ref<InterviewWorkflowPhase | null>(null)

function buildHistoryReviewData(record: InterviewSessionRecord): InterviewReviewData {
  if (record.reviewData) {
    return JSON.parse(JSON.stringify(record.reviewData)) as InterviewReviewData
  }

  return {
    summary: record.summary || '历史记录暂无详细评价。',
    strengths: [],
    weaknesses: [],
    followUps: [],
    suggestedResumeModules: [],
    scoreBreakdown: record.totalScore == null
      ? null
      : {
          projectScore: 0,
          skillScore: 0,
          workScore: 0,
          educationScore: 0,
          totalScore: record.totalScore,
          passed: record.passed ?? false,
        },
    chatHistory: [],
  }
}

function handleGoToPhase(phase: InterviewWorkflowPhase) {
  if (phase === 'analysis') {
    session.workflowPhase.value = 'analysis'
    return
  }

  if (phase === 'simulation' && session.canEnterPrep.value) {
    session.workflowPhase.value = 'simulation'
    return
  }

  if (phase === 'training') {
    session.workflowPhase.value = 'training'
    return
  }
}

function handleJdAnalyze() {
  void jd.handleGenerateJdAnalysis().then(() => {
    if (!jd.jdContext.value.jdText.trim()) return
    session.syncPrepConfigFromJd(jd.jdContext.value.jdText)
  })
}

function handleSkipJd() {
  jd.resetJd()
  session.prepConfig.value = session.buildInitialPrepConfig()
  session.prepFocusInput.value = ''
  handleConfirmPrep()
}

function handleReuseStoredJd() {
  if (!jd.handleReuseStoredJd()) return
  session.syncPrepConfigFromJd(jd.jdContext.value.jdText)
  handleConfirmPrep()
}

function handleConfirmPrep() {
  session.handleConfirmPrep()
}

function handleBackToAnalysis() {
  historyReviewReturnPhase.value = null
  session.workflowPhase.value = 'analysis'
}

function handleOpenPrepDialog() {
  showPrepDialog.value = true
}

function handleWorkbenchPrimaryAction() {
  if (session.isTrainingPhase.value) {
    if (trainingTab.value === 'review') {
      if (session.reviewData.value.suggestedResumeModules.length > 0) {
        void handleOptimizeResumeFromReview()
        return
      }
      handleStartNewRound()
      return
    }

    session.handleGenerateDrill()
    return
  }

  if (session.canEnterPrep.value) {
    handleOpenPrepDialog()
    return
  }

  handleJdAnalyze()
}

function handleConfirmPrepDialog() {
  showPrepDialog.value = false
  handleConfirmPrep()
}

function handleBackToSimulation() {
  if (historyReviewReturnPhase.value) {
    session.workflowPhase.value = historyReviewReturnPhase.value
    historyReviewReturnPhase.value = null
    return
  }
  session.workflowPhase.value = 'simulation'
}

function handleOpenReview() {
  historyReviewReturnPhase.value = null
  session.handleOpenReview()
  trainingTab.value = 'review'
  session.workflowPhase.value = 'training'
}

function handleViewHistory(id: string) {
  const record = history.getHistoryRecord(id)
  if (!record) {
    session.errorMsg.value = '未找到对应的面试记录。'
    return
  }

  historyReviewReturnPhase.value = session.workflowPhase.value
  session.reviewData.value = buildHistoryReviewData(record)
  jd.jdContext.value = {
    ...jd.jdContext.value,
    targetRole: record.targetRole || jd.jdContext.value.targetRole,
    summary: record.summary || jd.jdContext.value.summary,
  }
  trainingTab.value = 'review'
  session.workflowPhase.value = 'training'
}

function handleDeleteHistory(id: string) {
  history.deleteHistoryRecord(id)
}

async function handleOptimizeResumeFromReview() {
  const targetModule = session.reviewData.value.suggestedResumeModules[0]
  if (!targetModule) return
  resumeStore.requestScrollToModule(targetModule)
  await router.push({ name: 'resume-editor' })
}

function handleGoToJdAnalysis() {
  router.push({ name: 'jd-analysis' })
}

function handleRequestHint() {
  void hint.requestHint({
    mode: session.mode.value,
    history: session.messages.value.map((item) => ({ role: item.role, content: item.content })),
    resumeSnapshot: session.resumeSnapshot.value,
    durationMinutes: timer.durationMinutes.value,
    elapsedSeconds: timer.elapsedSeconds.value,
    memorySummary: session.memorySummary.value,
    jobContext: session.buildJobContextPayload(),
  })
}

function handleUseOpener(opener: string) {
  if (!opener) return
  session.inputText.value = opener + (session.inputText.value ? `\n${session.inputText.value}` : '')
  hint.dismissHint()
}

/** 快捷操作：换方向/追问/跳过 */
function handleQuickAction(action: 'switch' | 'deeper' | 'skip') {
  const actionMessages: Record<string, string> = {
    switch: '请换一个考察方向提问，不要继续当前话题。',
    deeper: '请针对我刚才的回答继续深入追问，挖掘更多细节。',
    skip: '这个问题我暂时跳过，请直接问下一个问题。',
  }
  const message = actionMessages[action]
  if (message) {
    session.inputText.value = message
    session.handleSend()
  }
}

function handleResetAll() {
  historyReviewReturnPhase.value = null
  session.handleReset()
  clearSessionState()
}

function handleStartNewRound() {
  historyReviewReturnPhase.value = null
  session.resetWorkflow()
  clearSessionState()
}

function handleRestoreConfirm() {
  restoreFromState(pendingRestoreState)
  showRestoreDialog.value = false
  pendingRestoreState = null
}

function handleRestoreCancel() {
  showRestoreDialog.value = false
  pendingRestoreState = null
  clearSessionState()
  session.resetWorkflow()
}

function handleGlobalKeydown(event: KeyboardEvent) {
  if (!event.ctrlKey || event.altKey || event.shiftKey || event.metaKey) return
  if (event.key.toLowerCase() !== 'i') return
  event.preventDefault()
  voice.toggleVoice()
}

const SESSION_STATE_STORAGE_KEY = 'prepwise_ai_interview_state'
const HMR_RESTORE_KEY = 'prepwise_interview_restore_ts'
const QUESTION_BANK_DRILL_SEED_STORAGE_KEY = 'prepwise_question_bank_drill_seed'

function saveSessionState() {
  try {
    const state = {
      workflowPhase: session.workflowPhase.value,
      mode: session.mode.value,
      durationMinutes: timer.durationMinutes.value,
      elapsedSeconds: timer.elapsedSeconds.value,
      sessionStarted: timer.sessionStarted.value,
      messages: session.messages.value,
      memorySummary: session.memorySummary.value,
      finalEvaluation: session.finalEvaluation.value,
      jdDraft: jd.jdDraft.value,
      jdContext: jd.jdContext.value,
      prepConfig: session.prepConfig.value,
      prepFocusInput: session.prepFocusInput.value,
      hintCount: hint.hintCount.value,
      hintLimit: hint.hintLimit.value,
      drillQuestions: session.drillQuestions.value,
      drillSubmitted: session.drillSubmitted.value,
      currentAnalysisId: jd.currentAnalysisId.value,
      currentAnalysisSource: jd.currentAnalysisSource.value,
      reviewData: session.reviewData.value,
    }

    localStorage.setItem(SESSION_STATE_STORAGE_KEY, JSON.stringify(state))
    sessionStorage.setItem(HMR_RESTORE_KEY, Date.now().toString())
  } catch {
    // ignore
  }
}

function loadSessionState() {
  try {
    const raw = localStorage.getItem(SESSION_STATE_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function clearSessionState() {
  localStorage.removeItem(SESSION_STATE_STORAGE_KEY)
}

function restoreDrillSeedFromQuestionBank() {
  const raw = localStorage.getItem(QUESTION_BANK_DRILL_SEED_STORAGE_KEY)
  if (!raw) return false

  localStorage.removeItem(QUESTION_BANK_DRILL_SEED_STORAGE_KEY)

  try {
    const payload = JSON.parse(raw) as {
      createdAt?: number
      questions?: SavedQuestion[]
    }
    const explicitNavigation = route.query.from === 'question-bank'
    const isStale = payload.createdAt ? Date.now() - payload.createdAt > 30 * 60 * 1000 : false
    if (!explicitNavigation && isStale) return false
    if (!Array.isArray(payload.questions) || payload.questions.length === 0) return false

    clearSessionState()
    session.resetWorkflow()
    session.drillQuestions.value = payload.questions.map((question, index) =>
      savedQuestionToDrill(question, index),
    )
    session.drillSubmitted.value = false
    session.errorMsg.value = ''
    trainingTab.value = 'drill'
    historyReviewReturnPhase.value = null
    session.workflowPhase.value = 'training'
    return true
  } catch {
    return false
  }
}

function restoreFromState(state: any) {
  if (!state) return
  if (state.workflowPhase) session.workflowPhase.value = state.workflowPhase
  if (state.mode) session.mode.value = state.mode
  if (state.durationMinutes) timer.durationMinutes.value = state.durationMinutes
  if (state.elapsedSeconds) timer.elapsedSeconds.value = state.elapsedSeconds
  if (state.sessionStarted) timer.sessionStarted.value = state.sessionStarted
  if (state.messages) session.messages.value = state.messages
  if (state.memorySummary) session.memorySummary.value = state.memorySummary
  if (state.finalEvaluation) session.finalEvaluation.value = state.finalEvaluation
  if (state.jdDraft) jd.jdDraft.value = state.jdDraft
  if (state.jdContext) jd.jdContext.value = state.jdContext
  if (state.prepConfig) session.prepConfig.value = state.prepConfig
  if (state.prepFocusInput) session.prepFocusInput.value = state.prepFocusInput
  if (state.hintCount) hint.hintCount.value = state.hintCount
  if (state.hintLimit) hint.hintLimit.value = state.hintLimit
  if (state.drillQuestions) session.drillQuestions.value = state.drillQuestions
  if (state.drillSubmitted) session.drillSubmitted.value = state.drillSubmitted
  if (state.currentAnalysisId) jd.currentAnalysisId.value = state.currentAnalysisId
  if (state.currentAnalysisSource) jd.currentAnalysisSource.value = state.currentAnalysisSource
  if (state.reviewData) session.reviewData.value = state.reviewData

  session.prepConfig.value.hintLimit = hint.hintLimit.value
}

const showRestoreDialog = ref(false)
let pendingRestoreState: any = null

watch([
  () => session.workflowPhase.value,
  () => session.messages.value.length,
  () => timer.elapsedSeconds.value,
  () => session.finalEvaluation.value,
], () => {
  if (timer.sessionStarted.value || session.messages.value.length > 0) {
    saveSessionState()
  }
})

watch(session.workflowPhase, (phase) => {
  if (phase !== 'training') {
    historyReviewReturnPhase.value = null
  }

  if (phase !== 'training' || !session.finalEvaluation.value) return

  const linkedAnalysis = jd.currentAnalysisId.value
    ? jdAnalysisStore.findHistoryItemByAnalysisId(jd.currentAnalysisId.value)
    : null

  const savedRecord = history.persistHistoryRecord({
    date: new Date().toISOString(),
    mode: session.mode.value,
    durationMinutes: timer.durationMinutes.value,
    totalRounds: session.currentRound.value,
    totalScore: session.finalEvaluation.value.totalScore,
    passed: session.finalEvaluation.value.passed,
    targetRole: jd.jdContext.value.targetRole || jd.extractResumeRole(),
    summary: session.finalEvaluation.value.summary || session.reviewData.value.summary || '本轮模拟已结束',
    analysisId: jd.currentAnalysisId.value ?? undefined,
    source: jd.currentAnalysisSource.value,
    companyOrRoleSummary: linkedAnalysis
      ? [linkedAnalysis.company, linkedAnalysis.position].filter(Boolean).join(' / ')
        || linkedAnalysis.position
        || linkedAnalysis.company
        || jd.jdContext.value.targetRole
      : jd.jdContext.value.targetRole || undefined,
    reviewData: JSON.parse(JSON.stringify(session.reviewData.value)),
  })

  // 将面试结果回写到 JD 分析 store，建立双向关联
  if (jd.currentAnalysisId.value) {
    jdAnalysisStore.recordInterviewPractice(jd.currentAnalysisId.value, {
      interviewRecordId: savedRecord.id,
      totalScore: session.finalEvaluation.value.totalScore,
      passed: session.finalEvaluation.value.passed,
      weaknesses: session.reviewData.value.weaknesses,
      suggestedResumeModules: session.reviewData.value.suggestedResumeModules,
    })
  }

  // 记录学习进度（提取维度得分）
  const dimensionScores = learningProgressStore.extractDimensionScores(
    (session.reviewData.value.scoreBreakdown as unknown as Record<string, number>) ?? null,
    session.reviewData.value.weaknesses ?? [],
  )
  const hasAnyScore = Object.values(dimensionScores).some(s => s > 0)
  if (hasAnyScore) {
    learningProgressStore.addRecord({
      analysisId: jd.currentAnalysisId.value ?? '',
      interviewRecordId: savedRecord.id,
      scores: dimensionScores,
      totalScore: session.finalEvaluation.value.totalScore ?? 0,
      weaknesses: session.reviewData.value.weaknesses ?? [],
      strengths: session.reviewData.value.strengths ?? [],
      timestamp: new Date().toISOString(),
    })
  }
})

onMounted(() => {
  history.init()
  window.addEventListener('keydown', handleGlobalKeydown)

  if (restoreDrillSeedFromQuestionBank()) return

  const restoreTs = sessionStorage.getItem(HMR_RESTORE_KEY)
  const saved = loadSessionState()
  if (saved && restoreTs) {
    pendingRestoreState = saved
    showRestoreDialog.value = true
  }
})

onActivated(() => {
  restoreDrillSeedFromQuestionBank()
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
  voice.stopRecording()
})
</script>

<template>
  <section
    class="ai-interviewer-panel"
    :class="[
      `phase-${session.workflowPhase.value}`,
      { 'immersive-mode': isImmersive },
    ]"
  >
    <!-- 全局 Error 提示 -->
    <div v-if="session.errorMsg.value || jd.errorMsg.value" class="global-error-toast">
      <div class="err-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
      </div>
      <div class="err-text">{{ session.errorMsg.value || jd.errorMsg.value }}</div>
      <button class="err-close" @click="session.errorMsg.value = ''; jd.errorMsg.value = ''">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    </div>

    <!-- 非沉浸式工作台 (Dashboard 风格) -->
    <template v-if="!isImmersive">
      <div class="dashboard-layout custom-scroll">
        <!-- 轻量化顶部导航 -->
        <header class="page-topbar">
          <div class="topbar-left">
            <h1 class="topbar-title">面试演练</h1>
            <div class="topbar-divider"></div>
            <div class="topbar-meta">
              <span class="meta-item">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>
                {{ jd.jdContext.value.targetRole || '目标岗位待解析' }}
              </span>
              <span class="meta-dot">·</span>
              <span class="meta-item">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                {{ modelDisplayName }}
              </span>
            </div>
          </div>

          <div class="topbar-right">
            <!-- 扁平化流水线 -->
            <div class="phase-tracker">
              <div
                v-for="(item, idx) in phaseItems"
                :key="item.key"
                class="phase-step"
                :class="{
                  active: session.workflowPhase.value === item.key,
                  done: idx < currentPhaseIndex,
                  clickable: item.key === 'analysis'
                    || (item.key === 'simulation' && session.canEnterPrep.value)
                    || item.key === 'training'
                }"
                @click="handleGoToPhase(item.key)"
              >
                <div class="step-dot">{{ idx < currentPhaseIndex ? '✓' : item.icon }}</div>
                <span class="step-label">{{ item.label }}</span>
                <div v-if="idx < phaseItems.length - 1" class="step-line"></div>
              </div>
            </div>
            

            <button class="topbar-btn ghost" type="button" @click="showPrepDialog = true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
              面试设置
            </button>

            <button
              v-if="session.workflowPhase.value === 'training'"
              class="topbar-btn primary"
              type="button"
              @click="handleStartNewRound"
            >
              开始新一轮
            </button>
          </div>
        </header>

        <!-- 来源标识 -->
        <InterviewSourceBadge
          v-if="jd.currentAnalysisId.value || route.query.from === 'question-bank'"
          :analysis-id="jd.currentAnalysisId.value"
          :source="route.query.from === 'question-bank' ? 'question-bank' : jd.currentAnalysisSource.value"
          @go-back="handleGoToJdAnalysis"
        />

        <!-- 主内容区：Hero Section 卡片风格 -->
        <div class="ds-hero-section iv-stage-wrapper">
          <Transition name="fade-slide" mode="out-in">
            <!-- 阶段 1：解析准备 -->
            <JdAnalysisStage
              v-if="session.isAnalysisPhase.value"
              v-model:jdDraft="jd.jdDraft.value"
              :can-analyze="jd.jdDraft.value.trim() !== '' && !jd.isLoading.value"
              :has-existing-jd="jd.hasStoredJdContext.value"
              :existing-jd-summary="jd.storedJdSummary.value"
              :jd-context="jd.jdContext.value"
              :can-start-interview="session.canEnterPrep.value"
              :history-records="history.historyRecords.value"
              @analyze="handleJdAnalyze"
              @skip="handleSkipJd"
              @reuse-existing="handleReuseStoredJd"
              @start-interview="handleOpenPrepDialog"
              @view-history="handleViewHistory"
              @delete-history="handleDeleteHistory"
            />
            
            <!-- 阶段 3：训练复盘区 -->
            <section v-else-if="session.isTrainingPhase.value" class="iv-training-workbench">
              <header class="training-header">
                <h2>专项训练与复盘</h2>
                <div class="iv-training-tabs">
                  <button
                    class="iv-training-tab"
                    :class="{ active: trainingTab === 'drill' }"
                    type="button"
                    @click="trainingTab = 'drill'"
                  >
                    专项训练
                  </button>
                  <button
                    class="iv-training-tab"
                    :class="{ active: trainingTab === 'review' }"
                    type="button"
                    @click="trainingTab = 'review'"
                  >
                    面试复盘
                  </button>
                </div>
              </header>

              <div class="training-content-wrapper">
                <InterviewDrillPanel
                  v-if="trainingTab === 'drill'"
                  :questions="session.drillQuestions.value"
                  :is-loading="session.drillLoading.value"
                  :error-msg="session.errorMsg.value"
                  :can-start="canGenerateDrill"
                  @generate="session.handleGenerateDrill"
                  @submit="(answers) => session.handleDrillSubmit(answers)"
                  @back="handleBackToAnalysis"
                />

                <InterviewReviewPanel
                  v-else
                  :review-data="session.reviewData.value"
                  :review-modules-text="reviewModulesText"
                  :source-analysis-id="jd.currentAnalysisId.value"
                  @back="handleBackToSimulation"
                  @restart="handleStartNewRound"
                  @optimize="handleOptimizeResumeFromReview"
                  @go-to-jd-analysis="handleGoToJdAnalysis"
                />
              </div>
            </section>
          </Transition>
        </div>
      </div>
    </template>

    <!-- 沉浸式模拟面试工作台 -->
    <template v-else-if="session.isSimulationPhase.value">
      <div class="immersive-container">
        <div class="topbar-trigger-zone"></div>
        <header class="immersive-topbar">
          <div class="topbar-left">
            <div class="topbar-tag">模拟面试</div>
            <span class="topbar-divider">|</span>
          <span class="topbar-position">{{ jd.jdContext.value.targetRole || '未识别岗位' }}</span>
        </div>

        <div class="topbar-center">
          <span class="topbar-timer" :class="{ warning: timer.remainingSeconds.value < 300 && timer.remainingSeconds.value > 0 }">
            {{ timer.timerText.value }}
          </span>
          <span class="topbar-round">第 {{ session.currentRound.value }} 轮</span>
        </div>

        <div class="topbar-right">
          <button class="topbar-action-btn" type="button" @click="session.showResumePreview.value = !session.showResumePreview.value">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            {{ session.showResumePreview.value ? '收起简历' : '查看简历' }}
          </button>
          <button class="topbar-action-btn muted" type="button" @click="handleBackToAnalysis">
            返回准备
          </button>
          <button class="topbar-action-btn primary" type="button" :disabled="!session.canReview.value" @click="handleOpenReview">
            结束并复盘
          </button>
        </div>
      </header>

      <div
        v-if="session.finalEvaluation.value"
        class="final-banner"
        :class="{ pass: session.finalEvaluation.value.passed, fail: !session.finalEvaluation.value.passed }"
      >
        <span class="score-main">综合评分 <strong>{{ session.finalEvaluation.value.totalScore }}</strong> 分</span>
        <span class="score-badge">{{ session.finalEvaluation.value.passed ? '建议通过' : '待提升' }}</span>
        <span class="score-details">
          项目: {{ session.finalEvaluation.value.projectScore }} / 
          技能: {{ session.finalEvaluation.value.skillScore }} / 
          工作: {{ session.finalEvaluation.value.workScore }} / 
          教育: {{ session.finalEvaluation.value.educationScore }}
        </span>
      </div>

      <div class="immersive-workspace">
        <InterviewSimulationPanel
          :embedded="true"
          :mode="session.mode.value"
          :interviewer-model-id="session.prepConfig.value.interviewerModelId"
          :candidate-model-id="session.prepConfig.value.candidateModelId"
          :messages="session.messages.value"
          :is-loading="session.isLoading.value"
          :error-msg="session.errorMsg.value"
          :input-text="session.inputText.value"
          :can-send="session.canSend.value"
          :is-listening="voice.isListening.value"
          :streaming-assistant-message-id="session.streamingAssistantMessageId.value"
          :session-started="timer.sessionStarted.value"
          :timer-text="timer.timerText.value"
          :timer-status-text="timer.timerStatusText.value"
          :current-round="session.currentRound.value"
          :user-turns="session.userTurns.value"
          :assistant-turns="session.assistantTurns.value"
          :can-start="session.canStart.value"
          :can-finish="session.canFinish.value"
          :timer-running="timer.timerRunning.value"
          :hint-data="hint.hintData.value"
          :hint-count="hint.hintCount.value"
          :max-hints="hint.hintLimit.value"
          :is-hinting="hint.isHinting.value"
          :is-tts-playing="session.isTtsPlaying.value"
          @update:input-text="(value) => { session.inputText.value = value }"
          @start="session.handleStart"
          @toggle-pause="session.handleTogglePause"
          @finish="session.handleFinish"
          @reset="handleResetAll"
          @adjust-duration="timer.adjustDuration"
          @send="session.handleSend"
          @toggle-voice="voice.toggleVoice"
          @request-hint="handleRequestHint"
          @dismiss-hint="hint.dismissHint"
          @use-opener="handleUseOpener"
          @quick-action="handleQuickAction"
        />

        <ResumePreviewOverlay
          v-if="session.showResumePreview.value"
          @close="session.showResumePreview.value = false"
        />
      </div>
      </div>
    </template>

    <AiConfigDialog v-if="showAiConfig" @close="showAiConfig = false" />

    <PrepConfigDialog
      v-if="showPrepDialog"
      v-model:prep-config="session.prepConfig.value"
      v-model:prep-focus-input="session.prepFocusInput.value"
      :jd-context="jd.jdContext.value"
      :can-confirm="session.prepConfigValid.value"
      @confirm="handleConfirmPrepDialog"
      @close="showPrepDialog = false"
      @openAiConfig="showAiConfig = true"
    />

    <Teleport to="body">
      <Transition name="restore-fade">
        <div v-if="showRestoreDialog" class="restore-overlay" @click.self="handleRestoreCancel">
          <div class="restore-dialog">
            <div class="restore-icon">
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                <circle cx="20" cy="20" r="18" stroke="currentColor" stroke-width="2" opacity="0.15" />
                <path d="M14 20a6 6 0 0 1 11.3-2.8" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                <path d="M26 17.2V20h-2.8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </div>
            <h3 class="restore-title">发现未完成的模拟面试</h3>
            <p class="restore-desc">检测到上一轮会话未完成，是否恢复之前的面试进度？</p>
            <div class="restore-actions">
              <button
                class="restore-btn restore-btn--cancel"
                @click="handleRestoreCancel"
              >
                放弃进度
              </button>
              <button
                class="restore-btn restore-btn--confirm"
                @click="handleRestoreConfirm"
              >
                继续面试
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </section>
</template>

<style scoped>
@import '@/assets/interview-tokens.css';

/* 全局布局 */
.ai-interviewer-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  width: 100%;
  height: 100%;
  background: var(--bg-card);
  color: var(--text-primary);
  overflow: hidden;
  position: relative;
}

.dashboard-layout {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow-y: auto;
  padding: 32px 40px 24px;
  min-height: 0;
  gap: 24px;
}

/* 轻量化无边框顶部 */
.page-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 0 24px 0;
  flex-shrink: 0;
  margin-bottom: -10px;
}

.topbar-left {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.topbar-title {
  font-size: 24px;
  font-weight: 900;
  color: var(--text-primary);
  margin: 0;
  letter-spacing: 0.02em;
}

.topbar-divider {
  width: 1.5px;
  height: 18px;
  background: var(--border-color);
  border-radius: 2px;
  opacity: 0.6;
}

.topbar-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 600;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.meta-dot {
  opacity: 0.4;
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

/* 扁平化阶段流水线 */
.phase-tracker {
  display: flex;
  align-items: center;
  padding: 0;
  background: transparent;
  border: none;
  margin-right: 12px;
}

.phase-step {
  display: flex;
  align-items: center;
  gap: 6px;
  opacity: 0.45;
  transition: all 0.2s ease;
}

.phase-step.clickable { cursor: pointer; }
.phase-step.clickable:hover { opacity: 0.8; }
.phase-step.active { opacity: 1; }
.phase-step.done { opacity: 0.8; }

.step-dot {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-color);
  font-size: 10px;
  font-weight: 800;
  background: var(--bg-card);
}
.phase-step.active .step-dot {
  background: var(--primary-500);
  border-color: var(--primary-500);
  color: #fff;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.25);
}
.phase-step.done .step-dot {
  color: var(--primary-500);
  border-color: var(--primary-500);
}

.step-label {
  font-size: 13px;
  font-weight: 700;
}

.step-line {
  width: 18px;
  height: 1.5px;
  background: var(--border-color);
  margin: 0 8px;
}
.phase-step.done .step-line {
  background: var(--primary-500);
}

/* 顶部按钮 */
.topbar-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 38px;
  padding: 0 18px;
  border-radius: 10px;
  font-size: 13.5px;
  font-weight: 700;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.topbar-btn.primary {
  background: var(--primary-500);
  color: #fff;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.25);
}
.topbar-btn.primary:disabled {
  opacity: 0.5; cursor: not-allowed; box-shadow: none;
}
.topbar-btn.primary:not(:disabled):hover {
  background: var(--primary-600);
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(59, 130, 246, 0.35);
}

.topbar-btn.ghost {
  background: transparent;
  border: 1px solid rgba(43, 123, 184, 0.15);
  color: var(--text-secondary);
}
.topbar-btn.ghost:hover {
  background: rgba(43, 123, 184, 0.05);
  color: var(--text-primary);
  border-color: rgba(43, 123, 184, 0.25);
}

/* 主容器舞台 */
.iv-stage-wrapper {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* 训练复盘 Header */
.iv-training-workbench {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.training-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.training-header h2 {
  font-size: 24px;
  font-weight: 800;
  color: var(--text-primary);
  margin: 0;
}

.iv-training-tabs {
  display: inline-flex;
  background: var(--bg-card-muted);
  border-radius: 12px;
  padding: 4px;
  border: 1px solid var(--border-color);
}

.iv-training-tab {
  height: 36px;
  padding: 0 24px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}

.iv-training-tab.active {
  background: var(--bg-card);
  color: var(--primary-500);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

/* 沉浸式 Topbar */
.immersive-mode {
  background: var(--bg-card);
}

.immersive-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 24px;
  background: rgba(14, 18, 25, 0.9);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(140, 165, 195, 0.08);
  flex-shrink: 0;
  z-index: 20;
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  opacity: 0;
  transform: translateY(-4px);
  transition: opacity 0.2s ease, transform 0.2s ease;
  pointer-events: none;
}

.immersive-container {
  display: flex;
  flex-direction: column;
  flex: 1;
  position: relative;
  overflow: hidden;
}

/* 顶部热区：一个透明的触发层 */
.topbar-trigger-zone {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 12px;
  z-index: 19;
}

/* 鼠标进入热区或 topbar 本身时显示 */
.topbar-trigger-zone:hover ~ .immersive-topbar,
.immersive-topbar:hover {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}

.immersive-workspace {
  position: relative;
  flex: 1;
  display: flex;
  overflow: hidden;
}

.topbar-left, .topbar-center, .topbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.topbar-tag {
  background: var(--primary-50);
  color: var(--primary-600);
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.1em;
  border: 1px solid var(--primary-100);
}

.topbar-role-badge {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
}

.topbar-divider { color: var(--border-color); }
.topbar-position { font-size: 13px; color: var(--text-secondary); font-weight: 600; }

.topbar-timer {
  font-size: 16px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  background: var(--bg-card-muted);
  padding: 6px 14px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
}
.topbar-timer.warning {
  color: var(--accent-orange);
  background: color-mix(in srgb, var(--accent-orange) 10%, var(--bg-card));
  border-color: color-mix(in srgb, var(--accent-orange) 30%, var(--border-color));
}

.topbar-round {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 700;
  padding: 6px 12px;
  background: var(--bg-card-muted);
  border-radius: 8px;
}

.topbar-action-btn {
  display: flex;
  align-items: center;
  height: 38px;
  padding: 0 16px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}

.topbar-action-btn:hover:not(:disabled) {
  background: var(--bg-card-muted);
  color: var(--text-primary);
}

.topbar-action-btn.primary {
  background: var(--primary-500);
  color: #fff;
  border-color: var(--primary-500);
}
.topbar-action-btn.primary:hover:not(:disabled) {
  background: var(--primary-600);
  transform: translateY(-1px);
}

.immersive-workspace {
  flex: 1;
  min-height: 0;
  display: flex;
  position: relative;
  overflow: hidden;
}

.immersive-workspace > :first-child {
  flex: 1;
  min-height: 0;
}

/* Error Banner */
.global-error-toast {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 16px auto;
  max-width: 600px;
  background: color-mix(in srgb, var(--accent-red) 8%, var(--bg-card));
  border: 1px solid color-mix(in srgb, var(--accent-red) 24%, var(--border-color));
  color: var(--accent-red);
  padding: 12px 16px;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(220, 38, 38, 0.1);
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
}
.err-icon svg, .err-close svg {
  width: 18px; height: 18px;
}
.err-close {
  background: none; border: none; color: inherit; cursor: pointer; padding: 4px; opacity: 0.7; margin-left: auto;
}
.err-close:hover { opacity: 1; }

/* 沉浸模式分数栏 */
.final-banner {
  display: flex;
  align-items: center;
  gap: 16px;
  margin: 16px 24px 0;
  padding: 16px 20px;
  border-radius: 16px;
  background: var(--bg-card-muted);
  border: 1px solid var(--border-color);
}
.final-banner.pass {
  background: rgba(16, 185, 129, 0.05);
  border-color: rgba(16, 185, 129, 0.2);
}
.final-banner.fail {
  background: rgba(239, 68, 68, 0.05);
  border-color: rgba(239, 68, 68, 0.2);
}

.score-main { font-size: 16px; color: var(--text-primary); font-weight: 600; }
.score-main strong { font-size: 20px; font-weight: 900; }
.score-badge {
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 800;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
}
.final-banner.pass .score-badge { color: #059669; border-color: #059669; }
.final-banner.fail .score-badge { color: #dc2626; border-color: #dc2626; }

.score-details {
  margin-left: auto;
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 600;
}

/* 恢复弹窗 */
.restore-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.4);
  backdrop-filter: blur(8px);
}

.restore-dialog {
  width: 420px;
  padding: 32px;
  border-radius: 24px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.2);
  text-align: center;
}

.restore-icon {
  width: 64px;
  height: 64px;
  margin: 0 auto 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--primary-50);
  color: var(--primary-500);
}

.restore-title {
  margin: 0 0 12px;
  font-size: 20px;
  font-weight: 800;
  color: var(--text-primary);
}

.restore-desc {
  margin: 0 0 28px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-secondary);
}

.restore-actions {
  display: flex;
  gap: 12px;
}

.restore-btn {
  flex: 1;
  height: 44px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.2s;
}

.restore-btn--cancel {
  background: var(--bg-card-muted);
  border-color: var(--border-color);
  color: var(--text-secondary);
}
.restore-btn--cancel:hover { background: #e2e8f0; }

.restore-btn--confirm {
  background: var(--primary-500);
  color: #fff;
}
.restore-btn--confirm:hover { background: var(--primary-600); transform: translateY(-1px); }

/* 动画过渡 */
.restore-fade-enter-active,
.restore-fade-leave-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.restore-fade-enter-from { opacity: 0; transform: scale(0.95); }
.restore-fade-leave-to { opacity: 0; transform: scale(1.02); }

.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.fade-slide-enter-from { opacity: 0; transform: translateY(10px); }
.fade-slide-leave-to { opacity: 0; transform: translateY(-10px); }
</style>
