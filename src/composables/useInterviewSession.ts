import { computed, ref, watch } from 'vue'
import { useAiConfigStore } from '@/stores/aiConfig'
import { useResumeStore } from '@/stores/resume'
import {
  requestInterviewTurn,
  generateDrillQuestions,
  evaluateDrillAnswers,
  type FinalEvaluation,
  type InterviewHistoryItem,
  type InterviewMode,
  type InterviewTurnScore,
  type ResumeSnapshot,
  type DrillQuestionRaw,
} from '@/services/interviewService'
import { getModelById } from '@/config/vrmModels'
import type {
  ChatMessage,
  DrillAnswer,
  DrillQuestion,
  InterviewJdContext,
  InterviewPrepConfig,
  InterviewReviewData,
  InterviewWorkflowPhase,
} from '@/components/ai/interview/types'

/**
 * 面试核心会话 composable
 *
 * 管理聊天消息、AI 对话、评分、复盘数据、专项训练、TTS 以及面试准备配置
 */
export function useInterviewSession(deps: {
  getJdContext: () => InterviewJdContext
  getJdStoreContext: () => InterviewJdContext | null
  extractResumeRole: () => string
  extractHighlightedProjects: () => string[]
  trimList: (items: string[]) => string[]
  splitInputItems: (value: string) => string[]
  detectDifficulty: (text: string) => 'junior' | 'mid' | 'senior'
  durationMinutes: { value: number }
  elapsedSeconds: { value: number }
  sessionStarted: { value: boolean }
  timerRunning: { value: boolean }
  startTimer: () => void
  stopTimer: () => void
  resetTimer: () => void
  hintCount: { value: number }
  hintLimit: { value: number }
  resetHints: () => void
  isListening: { value: boolean }
  stopRecording: () => void
}) {
  const aiConfig = useAiConfigStore()
  const resumeStore = useResumeStore()

  // ── 流程状态 ──
  const workflowPhase = ref<InterviewWorkflowPhase>('analysis')
  const mode = ref<InterviewMode>('candidate')
  const isLoading = ref(false)
  const inputText = ref('')
  const showResumePreview = ref(false)

  // ── 聊天状态 ──
  const messages = ref<ChatMessage[]>([])
  const memorySummary = ref('')
  const streamingAssistantMessageId = ref<string | null>(null)
  const finalEvaluation = ref<FinalEvaluation | null>(null)

  // ── TTS ──
  const isTtsPlaying = ref(false)
  let currentAudio: HTMLAudioElement | null = null
  let currentUtterance: SpeechSynthesisUtterance | null = null

  function extractPlainText(raw: string): string {
    const text = raw?.trim() || ''
    if (!text) return ''
    try {
      const jsonStr = text.startsWith('{') && text.endsWith('}')
        ? text
        : (() => {
            const first = text.indexOf('{')
            const last = text.lastIndexOf('}')
            return first >= 0 && last > first ? text.slice(first, last + 1) : ''
          })()
      if (!jsonStr) return text
      const parsed = JSON.parse(jsonStr) as { assistantReply?: unknown }
      if (typeof parsed.assistantReply === 'string' && parsed.assistantReply.trim()) return parsed.assistantReply
    } catch { /* not JSON */ }
    return text
  }

  function cleanTextForTts(raw: string): string {
    return extractPlainText(raw)
      .replace(/```[\s\S]*?```/g, '')
      .replace(/[#*`_~>\[\]()！？。，、；：""''【】（）《》]/g, '')
      .replace(/\n{2,}/g, '。')
      .replace(/\n/g, '，')
      .replace(/\s+/g, ' ')
      .trim()
  }

  function speakWithBrowserTts(text: string, isMale: boolean) {
    const synth = window.speechSynthesis
    if (!synth) return
    synth.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'zh-CN'
    utterance.rate = 1.05
    utterance.pitch = isMale ? 0.9 : 1.15
    const voices = synth.getVoices()
    const zhVoice = voices.find(v => v.lang.startsWith('zh') && (isMale ? v.name.toLowerCase().includes('male') || !v.name.toLowerCase().includes('female') : v.name.toLowerCase().includes('female')))
      || voices.find(v => v.lang.startsWith('zh'))
    if (zhVoice) utterance.voice = zhVoice
    utterance.onstart = () => { isTtsPlaying.value = true }
    utterance.onend = () => { isTtsPlaying.value = false }
    utterance.onerror = () => { isTtsPlaying.value = false }
    currentUtterance = utterance
    synth.speak(utterance)
  }

  async function playAssistantVoice(text: string, voice?: string) {
    stopAssistantVoice()
    const cleaned = cleanTextForTts(text)
    if (!cleaned || cleaned.length < 2) return
    try {
      const config = aiConfig.getConfigForFeature('tts')
      const { generateSpeechUrl } = await import('@/services/audioService')
      const url = await generateSpeechUrl(config, cleaned, undefined, voice)
      const audio = new Audio(url)
      audio.onplay = () => { isTtsPlaying.value = true }
      audio.onended = () => { isTtsPlaying.value = false; URL.revokeObjectURL(audio.src) }
      audio.onerror = () => { isTtsPlaying.value = false }
      currentAudio = audio
      await audio.play()
      return
    } catch (e) {
      console.warn('[TTS] 云端 TTS 不可用，降级到浏览器语音:', (e as Error).message)
    }
    const isMale = ['charles', 'david', 'benjamin', 'alex'].includes(voice ?? '')
    speakWithBrowserTts(cleaned, isMale)
  }

  function stopAssistantVoice() {
    if (currentAudio) { currentAudio.pause(); currentAudio = null }
    if (currentUtterance) { window.speechSynthesis?.cancel(); currentUtterance = null }
    isTtsPlaying.value = false
  }

  const DEFAULT_HINT_LIMIT = 3

  // ── 准备配置 ──
  const prepFocusInput = ref('')
  const prepConfig = ref<InterviewPrepConfig>(buildInitialPrepConfig())

  // ── 复盘数据 ──
  const reviewData = ref<InterviewReviewData>(createEmptyReviewData())

  // ── 专项训练 ──
  const drillQuestions = ref<DrillQuestion[]>([])
  const drillLoading = ref(false)
  const drillSubmitted = ref(false)

  // ── 错误 ──
  const errorMsg = ref('')

  // ═══ 计算属性 ═══

  const assistantTurns = computed(() => messages.value.filter((item) => item.role === 'assistant').length)
  const userTurns = computed(() => messages.value.filter((item) => item.role === 'user').length)
  const currentRound = computed(() => Math.max(assistantTurns.value, userTurns.value))

  const isAnalysisPhase = computed(() => workflowPhase.value === 'analysis')
  const isSimulationPhase = computed(() => workflowPhase.value === 'simulation')
  const isTrainingPhase = computed(() => workflowPhase.value === 'training')

  const canSend = computed(() =>
    isSimulationPhase.value && deps.sessionStarted.value && inputText.value.trim() !== '' && !isLoading.value
  )
  const canStart = computed(() =>
    isSimulationPhase.value && !deps.sessionStarted.value && !isLoading.value
  )
  const canFinish = computed(() =>
    isSimulationPhase.value && deps.sessionStarted.value && !isLoading.value && messages.value.length > 0
  )
  const canEnterPrep = computed(() => deps.getJdContext().jdText.trim() !== '')
  const canReview = computed(() => !!finalEvaluation.value || messages.value.length > 0)

  const phaseTitle = computed(() => phaseItems.find((item) => item.key === workflowPhase.value)?.label || '岗位准备')
  const prepConfigValid = computed(() => prepConfig.value.durationMinutes >= 15 && !isLoading.value)

  const phaseItems: Array<{ key: InterviewWorkflowPhase; label: string }> = [
    { key: 'analysis', label: '岗位准备' },
    { key: 'simulation', label: '模拟面试' },
    { key: 'training', label: '训练复盘' },
  ]

  const resumeSnapshot = computed<ResumeSnapshot>(() => ({
    basicInfo: resumeStore.basicInfo,
    skillsText: resumeStore.skills,
    workList: resumeStore.workList,
    projectList: resumeStore.projectList,
    educationList: resumeStore.educationList,
    selfIntro: resumeStore.selfIntro,
  }))

  // ═══ 工具函数 ═══

  function newMessageId(): string {
    return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  }

  function appendMessage(role: 'assistant' | 'user', content: string, score: InterviewTurnScore | null = null) {
    messages.value.push({ id: newMessageId(), role, content: content.trim(), score })
  }

  function createAssistantDraftMessage(): string {
    const id = newMessageId()
    messages.value.push({ id, role: 'assistant', content: '正在思考中...', score: null })
    return id
  }

  function updateAssistantMessageById(id: string, content: string, score: InterviewTurnScore | null = null) {
    const target = messages.value.find((item) => item.id === id)
    if (!target) return
    target.content = content
    target.score = score
  }

  function removeMessageById(id: string) {
    const index = messages.value.findIndex((item) => item.id === id)
    if (index >= 0) messages.value.splice(index, 1)
  }

  function buildHistory(excludeLastUser = false): InterviewHistoryItem[] {
    const source = excludeLastUser ? messages.value.slice(0, -1) : messages.value
    return source.map((item) => ({ role: item.role, content: item.content }))
  }

  function formatErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message
    return String(error ?? '未知错误')
  }

  function buildJobContextPayload() {
    const activeContext = deps.getJdContext()
    const focusAreas = prepConfig.value.focusAreas.length > 0 ? prepConfig.value.focusAreas : activeContext.focusAreas
    return {
      ...activeContext,
      focusAreas,
      recommendedStories: activeContext.recommendedStories.map((item) => {
        const points = item.talkingPoints.slice(0, 2).join('、')
        return points ? `${item.title}：${points}` : item.title
      }),
      highRiskQuestions: activeContext.highRiskFollowUps.map((item) => item.question),
      customNote: prepConfig.value.customNote,
      difficulty: prepConfig.value.difficulty,
      companyCulture: activeContext.companyCulture,
      interviewStyle: activeContext.interviewStyle,
      techStack: activeContext.techStack,
      competitors: activeContext.competitors,
      reverseQuestions: activeContext.reverseQuestions,
    }
  }

  // ═══ 核心面试操作 ═══

  async function runInterview(command: 'start' | 'continue' | 'finish', userInput?: string) {
    if (isLoading.value) return
    isLoading.value = true
    errorMsg.value = ''
    const draftMessageId = createAssistantDraftMessage()
    streamingAssistantMessageId.value = draftMessageId

    try {
      const response = await requestInterviewTurn({
        config: { ...aiConfig.getConfigForFeature('interview') },
        mode: mode.value,
        command,
        userInput,
        history: buildHistory(command === 'continue'),
        resumeSnapshot: resumeSnapshot.value,
        durationMinutes: deps.durationMinutes.value,
        elapsedSeconds: deps.elapsedSeconds.value,
        memorySummary: memorySummary.value,
        jobContext: buildJobContextPayload(),
        interviewerName: getModelById(prepConfig.value.interviewerModelId)?.name,
        candidateName: resumeSnapshot.value.basicInfo.name || undefined,
        interviewerStyle: prepConfig.value.interviewerStyle || 'balanced',
        followUpDepth: prepConfig.value.followUpDepth || 2,
      }, undefined, {
        onAssistantReplyChunk(text) {
          updateAssistantMessageById(draftMessageId, text)
        },
      })

      updateAssistantMessageById(draftMessageId, response.assistantReply, response.turnScore)
      // 音色优先级：用户在面试设置中指定的 voice > VRM 模型默认的 ttsVoice
      const customVoice = prepConfig.value.voice?.trim()
      const vrmVoice = mode.value === 'candidate'
        ? getModelById(prepConfig.value.interviewerModelId)?.ttsVoice
        : getModelById(prepConfig.value.candidateModelId)?.ttsVoice
      void playAssistantVoice(response.assistantReply, customVoice || vrmVoice)

      if (response.memorySummary) memorySummary.value = response.memorySummary
      if (response.finalEvaluation) {
        finalEvaluation.value = response.finalEvaluation
        reviewData.value = buildReviewFromCurrentSession()
      }
      if (response.nextAction === 'finish' || command === 'finish') {
        deps.stopTimer()
        workflowPhase.value = 'training'
      }
    } catch (error) {
      const draft = messages.value.find((item) => item.id === draftMessageId)
      if (draft && (!draft.content || draft.content.trim() === '' || draft.content === '正在思考中...')) {
        removeMessageById(draftMessageId)
      }
      errorMsg.value = formatErrorMessage(error)
    } finally {
      if (streamingAssistantMessageId.value === draftMessageId) {
        streamingAssistantMessageId.value = null
      }
      isLoading.value = false
    }
  }

  // ═══ 复盘 ═══

  function buildReviewFromCurrentSession(): InterviewReviewData {
    const suggestions: string[] = []
    if (finalEvaluation.value) {
      if (finalEvaluation.value.projectScore < 70) suggestions.push('projectExperience')
      if (finalEvaluation.value.skillScore < 70) suggestions.push('skills')
      if (finalEvaluation.value.workScore < 70) suggestions.push('workExperience')
      if (finalEvaluation.value.educationScore < 70) suggestions.push('education')
      if (suggestions.length === 0) suggestions.push('selfIntro')
    }
    return {
      summary: finalEvaluation.value?.summary || '本轮模拟已结束，建议围绕薄弱项继续查漏补缺。',
      strengths: finalEvaluation.value?.passed
        ? ['回答节奏整体稳定', '核心问题基本能完成作答']
        : ['已完成一轮完整模拟，可据此继续打磨话术'],
      weaknesses: finalEvaluation.value?.improvements?.length
        ? [...finalEvaluation.value.improvements]
        : ['建议补强项目细节、量化结果与追问深度'],
      followUps: messages.value
        .filter((item) => item.role === 'assistant')
        .slice(-3)
        .map((item) => item.content.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .map((item) => item.slice(0, 80)),
      suggestedResumeModules: Array.from(new Set(suggestions)),
      scoreBreakdown: finalEvaluation.value
        ? {
            projectScore: finalEvaluation.value.projectScore,
            skillScore: finalEvaluation.value.skillScore,
            workScore: finalEvaluation.value.workScore,
            educationScore: finalEvaluation.value.educationScore,
            totalScore: finalEvaluation.value.totalScore,
            passed: finalEvaluation.value.passed,
          }
        : null,
      chatHistory: [...messages.value],
    }
  }

  // ═══ 准备配置 ═══

  function buildInitialPrepConfig(): InterviewPrepConfig {
    return {
      mode: 'candidate',
      durationMinutes: 60,
      hintLimit: DEFAULT_HINT_LIMIT,
      difficulty: 'mid',
      focusAreas: [],
      customNote: '',
      interviewerModelId: 'interviewer-fangran',
      candidateModelId: 'candidate-asuka',
    }
  }

  function handleConfirmPrep() {
    prepConfig.value = {
      ...prepConfig.value,
      hintLimit: Math.max(1, Math.min(5, prepConfig.value.hintLimit)),
      focusAreas: deps.trimList(deps.splitInputItems(prepFocusInput.value)),
      customNote: prepConfig.value.customNote.trim(),
    }
    mode.value = prepConfig.value.mode
    deps.durationMinutes.value = prepConfig.value.durationMinutes
    errorMsg.value = ''
    workflowPhase.value = 'simulation'
  }

  function syncPrepConfigFromJd(jdText: string) {
    const difficulty = deps.detectDifficulty(jdText)
    const ctx = deps.getJdContext()
    prepConfig.value = {
      ...prepConfig.value,
      mode: mode.value,
      durationMinutes: deps.durationMinutes.value,
      difficulty,
      focusAreas: ctx.focusAreas,
      customNote: ctx.resumeGaps.length > 0 ? `优先追问这些薄弱项：${ctx.resumeGaps.join(' / ')}` : '',
    }
    prepConfig.value.interviewerModelId ||= 'interviewer-fangran'
    prepConfig.value.candidateModelId ||= 'candidate-asuka'
    prepFocusInput.value = prepConfig.value.focusAreas.join('\n')
  }

  // ═══ 会话控制 ═══

  function handleStart() {
    if (!canStart.value) return
    deps.startTimer()
    finalEvaluation.value = null
    reviewData.value = createEmptyReviewData()
    void runInterview('start')
  }

  function handleTogglePause() {
    stopAssistantVoice()
    deps.timerRunning.value = !deps.timerRunning.value
  }

  function handleFinish() {
    stopAssistantVoice()
    if (!canFinish.value) return
    deps.stopTimer()
    void runInterview('finish')
  }

  function handleReset() {
    stopAssistantVoice()
    deps.stopRecording()
    resetSession()
  }

  function handleSend() {
    stopAssistantVoice()
    const text = inputText.value.trim()
    if (!canSend.value || !text) return
    if (deps.isListening.value) deps.stopRecording()
    appendMessage('user', text)
    inputText.value = ''
    void runInterview('continue', text)
  }

  function handleOpenReview() {
    if (!canReview.value) return
    reviewData.value = buildReviewFromCurrentSession()
    workflowPhase.value = 'training'
  }

  // ═══ 专项训练 ═══

  async function handleGenerateDrill(seedQuestions?: DrillQuestionRaw[]) {
    if (isLoading.value || drillQuestions.value.length > 0) return
    const jdText = deps.getJdContext().jdText.trim()
    if (!jdText && messages.value.length === 0) return
    drillLoading.value = true
    errorMsg.value = ''
    try {
      const questions = await generateDrillQuestions({
        config: { ...aiConfig.getConfigForFeature('interview') },
        mode: mode.value,
        command: 'continue',
        history: buildHistory(),
        resumeSnapshot: resumeSnapshot.value,
        durationMinutes: deps.durationMinutes.value,
        elapsedSeconds: deps.elapsedSeconds.value,
        memorySummary: memorySummary.value,
        jobContext: buildJobContextPayload(),
        userInput: jdText || '通用面试题',
      }, undefined, undefined, seedQuestions)
      drillQuestions.value = questions
      drillSubmitted.value = false
    } catch (error) {
      errorMsg.value = formatErrorMessage(error)
    } finally {
      drillLoading.value = false
    }
  }

  async function handleDrillSubmit(answers: DrillAnswer[]) {
    if (drillSubmitted.value) return
    drillLoading.value = true
    errorMsg.value = ''
    try {
      const result = await evaluateDrillAnswers(
        {
          config: { ...aiConfig.getConfigForFeature('interview') },
          mode: mode.value,
          command: 'continue',
          history: buildHistory(),
          resumeSnapshot: resumeSnapshot.value,
          durationMinutes: deps.durationMinutes.value,
          elapsedSeconds: deps.elapsedSeconds.value,
          memorySummary: memorySummary.value,
          jobContext: buildJobContextPayload(),
        },
        answers,
        drillQuestions.value,
      )
      drillSubmitted.value = true
      return result
    } catch (error) {
      errorMsg.value = formatErrorMessage(error)
      return null
    } finally {
      drillLoading.value = false
    }
  }

  // ═══ 重置 ═══

  function resetSession() {
    stopAssistantVoice()
    messages.value = []
    finalEvaluation.value = null
    memorySummary.value = ''
    errorMsg.value = ''
    deps.resetTimer()
    streamingAssistantMessageId.value = null
    inputText.value = ''
    deps.resetHints()
    drillQuestions.value = []
    drillLoading.value = false
    drillSubmitted.value = false
    reviewData.value = createEmptyReviewData()
  }

  function resetWorkflow() {
    resetSession()
    workflowPhase.value = 'analysis'
    prepConfig.value = buildInitialPrepConfig()
    prepFocusInput.value = ''
  }

  function createEmptyReviewData(): InterviewReviewData {
    return {
      summary: '',
      strengths: [],
      weaknesses: [],
      followUps: [],
      suggestedResumeModules: [],
      scoreBreakdown: null,
      chatHistory: [],
    }
  }

  // ═══ Watchers ═══

  watch(mode, (nextMode) => { prepConfig.value.mode = nextMode })
  watch(() => deps.durationMinutes.value, (v) => { prepConfig.value.durationMinutes = v })
  watch(workflowPhase, (phase) => {
    if (phase !== 'simulation' && phase !== 'training') {
      deps.timerRunning.value = false
      showResumePreview.value = false
      if (deps.isListening.value) deps.stopRecording()
    }
  })
  watch(finalEvaluation, (v) => { if (v) reviewData.value = buildReviewFromCurrentSession() })

  return {
    // state
    workflowPhase, mode, isLoading, inputText, showResumePreview,
    messages, memorySummary, streamingAssistantMessageId, finalEvaluation,
    isTtsPlaying,
    prepFocusInput, prepConfig, reviewData,
    drillQuestions, drillLoading, drillSubmitted,
    errorMsg, phaseItems,
    // computed
    assistantTurns, userTurns, currentRound,
    isAnalysisPhase, isSimulationPhase, isTrainingPhase,
    canSend, canStart, canFinish, canEnterPrep, canReview,
    phaseTitle, prepConfigValid, resumeSnapshot,
    // session actions
    runInterview, handleStart, handleTogglePause, handleFinish,
    handleReset, handleSend, handleOpenReview,
    resetSession, resetWorkflow,
    // prep actions
    handleConfirmPrep, syncPrepConfigFromJd, buildInitialPrepConfig,
    // drill actions
    handleGenerateDrill, handleDrillSubmit,
    // review actions
    buildReviewFromCurrentSession,
    // navigation
    buildJobContextPayload,
    // utils
    newMessageId, appendMessage,
    // TTS
    playAssistantVoice, stopAssistantVoice,
  }
}
