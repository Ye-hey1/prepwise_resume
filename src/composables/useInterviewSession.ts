import { computed, ref, watch } from 'vue'
import { useAiConfigStore } from '@/stores/aiConfig'
import { useResumeStore } from '@/stores/resume'
import {
  requestInterviewTurn,
  requestCoachingTurn,
  generateDrillQuestions,
  evaluateDrillAnswers,
  type FinalEvaluation,
  type InterviewHistoryItem,
  type InterviewMode,
  type InterviewTurnScore,
  type ResumeSnapshot,
  type DrillQuestionRaw,
  type CoachingTurnRequest,
} from '@/services/interviewService'
import { getModelById } from '@/config/vrmModels'
import type {
  ChatMessage,
  CoachingMessage,
  CoachingRecord,
  CoachingRoundRecord,
  CoachingStageConfig,
  CoachingStageType,
  CoachingTurnResponse,
  DrillAnswer,
  DrillQuestion,
  InterviewJdContext,
  InterviewPrepConfig,
  InterviewReviewData,
  InterviewWorkflowPhase,
} from '@/components/ai/interview/types'
import { COACHING_STAGES } from '@/components/ai/interview/types'

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

  // ── Coaching 模式 ──
  const coachingMessages = ref<CoachingMessage[]>([])
  const coachingRoundIndex = ref(0)
  const coachingTotalRounds = ref(26)
  const coachingPaused = ref(false)
  const coachingFinished = ref(false)
  const coachingFinalSummary = ref('')
  const coachingTechniqueSummary = ref<Array<{ technique: string; description: string; example: string }>>([])
  const lastCoachingRecord = ref<CoachingRecord | null>(null)
  /** 当前正在进行的轮次阶段索引（0=HR, 1=tech-1, 2=tech-2, 3=final） */
  const coachingCurrentStageIdx = ref(0)
  /** 当前阶段内的题目序号 */
  const coachingStageRoundIndex = ref(0)
  /** 是否处于轮次间等待状态（等待用户手动进入下一轮） */
  const coachingWaitingForNextStage = ref(false)
  let coachingAutoTimer: ReturnType<typeof setTimeout> | null = null

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

  /** 从 coaching 对话中构建复盘数据 */
  function buildCoachingReviewData(): InterviewReviewData {
    // 提取所有技巧标签
    const allTechniques = coachingMessages.value
      .filter(m => m.role === 'coach' && m.techniques?.length)
      .flatMap(m => m.techniques || [])
    const uniqueTechniques = [...new Set(allTechniques)]

    // 提取教练点评作为 strengths
    const coachComments = coachingMessages.value
      .filter(m => m.role === 'coach')
      .map(m => m.content.slice(0, 100))
      .slice(-4)

    // 提取面试官的问题作为 followUps
    const interviewerQuestions = coachingMessages.value
      .filter(m => m.role === 'interviewer')
      .map(m => m.content.slice(0, 80))
      .slice(-3)

    // 将 coaching 消息转换为 ChatMessage 格式用于复盘展示
    const chatHistory: ChatMessage[] = coachingMessages.value
      .filter(m => m.role !== 'coach')
      .map(m => ({
        id: m.id,
        role: m.role === 'interviewer' ? 'assistant' as const : 'user' as const,
        content: m.content,
        score: null,
      }))

    return {
      summary: coachingFinalSummary.value || `本场观摩学习共 ${coachingRoundIndex.value} 轮，涵盖 ${uniqueTechniques.length} 种面试技巧。`,
      strengths: uniqueTechniques.length > 0
        ? [`本场展示了 ${uniqueTechniques.length} 种面试技巧`, ...uniqueTechniques.slice(0, 4).map(t => `技巧：${t}`)]
        : ['已完成一场完整的面试观摩'],
      weaknesses: ['建议结合观摩内容进行实战练习', '尝试用"我来回答"模式检验学习效果'],
      followUps: interviewerQuestions,
      suggestedResumeModules: [],
      scoreBreakdown: null,
      chatHistory,
    }
  }

  /** 从 coaching 消息中构建完整的观摩记录 */
  function buildCoachingRecord(): CoachingRecord {
    const rounds: CoachingRoundRecord[] = []
    const msgs = coachingMessages.value

    // 按轮次分组：每轮 = interviewer + candidate + coach
    for (let i = 0; i < msgs.length; i++) {
      const msg = msgs[i]
      if (msg.role === 'interviewer') {
        const question = msg.content
        let referenceAnswer = ''
        let techniques: string[] = []
        let coachComment = ''

        // 找后续的 candidate 和 coach
        for (let j = i + 1; j < msgs.length && j <= i + 3; j++) {
          if (msgs[j].role === 'candidate') {
            referenceAnswer = msgs[j].content
          } else if (msgs[j].role === 'coach') {
            coachComment = msgs[j].content
            techniques = msgs[j].techniques || []
          } else if (msgs[j].role === 'interviewer') {
            break
          }
        }

        if (question && referenceAnswer) {
          rounds.push({ question, referenceAnswer, techniques, coachComment })
        }
      }
    }

    return {
      id: `coaching_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      date: new Date().toISOString(),
      targetRole: deps.getJdContext().targetRole || '未知岗位',
      totalRounds: rounds.length,
      rounds,
      techniqueSummary: coachingTechniqueSummary.value,
      finalSummary: coachingFinalSummary.value,
    }
  }

  /** 从观摩记录生成 DrillQuestion 种子题目 */
  function coachingRecordToDrillSeeds(record: CoachingRecord): DrillQuestion[] {
    return record.rounds.map((round, idx) => {
      // category 显示问题摘要（截取前 20 字）
      const brief = round.question.replace(/\s+/g, '').slice(0, 20)
      const category = brief.length < round.question.replace(/\s+/g, '').length ? brief + '...' : brief
      const focusArea = inferQuestionCategory(round.question)

      return {
        id: idx + 1,
        question: round.question,
        category,
        focusArea,
        difficulty: 3,
        intent: round.coachComment.slice(0, 80),
        framework: round.techniques.length > 0 ? round.techniques.join(' + ') : 'STAR',
        thinkingPoints: round.techniques,
        sampleAnswer: round.referenceAnswer,
        referenceAnswer: round.referenceAnswer,
      }
    })
  }

  /** 根据问题内容推断分类 */
  function inferQuestionCategory(question: string): string {
    if (/自我介绍|介绍一下|简单介绍/.test(question)) return '自我介绍'
    if (/项目|负责|难点|挑战|架构|优化|落地/.test(question)) return '项目深挖'
    if (/冲突|压力|协作|沟通|失败|复盘|管理/.test(question)) return '行为场景'
    if (/什么是|原理|区别|为什么|如何实现|底层/.test(question)) return '技术原理'
    if (/场景|假设|如果|遇到|怎么处理/.test(question)) return '场景模拟'
    if (/团队|带人|管理|推进|跨部门/.test(question)) return '团队协作'
    if (/业务|用户|价值|指标|增长/.test(question)) return '业务思维'
    return '综合能力'
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
    syncPrepSettings()
    errorMsg.value = ''
    workflowPhase.value = 'simulation'
  }

  /** 只同步设置到内部状态，不跳转阶段 */
  function syncPrepSettings() {
    prepConfig.value = {
      ...prepConfig.value,
      hintLimit: Math.max(1, Math.min(5, prepConfig.value.hintLimit)),
      focusAreas: deps.trimList(deps.splitInputItems(prepFocusInput.value)),
      customNote: prepConfig.value.customNote.trim(),
    }
    mode.value = prepConfig.value.mode
    deps.durationMinutes.value = prepConfig.value.durationMinutes

    // coaching 模式下设置总轮次
    if (prepConfig.value.mode === 'coaching') {
      const selectedStage = prepConfig.value.coachingStage || 'full'
      if (selectedStage === 'full') {
        coachingTotalRounds.value = COACHING_STAGES.reduce((sum, s) => sum + s.roundCount, 0)
      } else {
        const stage = COACHING_STAGES.find(s => s.type === selectedStage)
        coachingTotalRounds.value = stage?.roundCount || 7
      }
    }
  }

  function syncPrepConfigFromJd(jdText: string) {
    const difficulty = deps.detectDifficulty(jdText)
    const ctx = deps.getJdContext()
    prepConfig.value = {
      ...prepConfig.value,
      // 保留用户已设置的 mode，不用当前 mode.value 覆盖
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

  // ═══ Coaching 模式操作 ═══

  function getCoachingDelay(): number {
    const speed = prepConfig.value.coachingSpeed || 'normal'
    switch (speed) {
      case 'fast': return 1000
      case 'slow': return 5000
      default: return 3000
    }
  }

  function buildCoachingPreviousRounds(): string {
    if (coachingMessages.value.length === 0) return ''
    // 取最近 6 条消息作为上下文摘要
    const recent = coachingMessages.value.slice(-6)
    return recent.map(msg => {
      const roleLabel = msg.role === 'interviewer' ? '面试官' : msg.role === 'candidate' ? '候选人' : '教练'
      const content = msg.content.length > 120 ? msg.content.slice(0, 120) + '...' : msg.content
      return `[${roleLabel}] ${content}`
    }).join('\n')
  }

  function newCoachingMessageId(): string {
    return `coaching_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  }

  /** 延迟工具函数 */
  function coachingDelay(ms: number): Promise<void> {
    return new Promise(resolve => {
      coachingAutoTimer = setTimeout(resolve, ms)
    })
  }

  async function runCoachingTurn(command: 'start' | 'continue' | 'finish') {
    if (isLoading.value || coachingFinished.value) return
    isLoading.value = true
    errorMsg.value = ''

    try {
      // 获取当前阶段配置
      const selectedStage = prepConfig.value.coachingStage || 'full'
      const currentStage = selectedStage === 'full'
        ? COACHING_STAGES[coachingCurrentStageIdx.value]
        : COACHING_STAGES.find(s => s.type === selectedStage)

      const response = await requestCoachingTurn({
        config: { ...aiConfig.getConfigForFeature('interview') },
        command,
        roundIndex: coachingRoundIndex.value + 1,
        totalRounds: coachingTotalRounds.value,
        resumeSnapshot: resumeSnapshot.value,
        jobContext: buildJobContextPayload(),
        previousRounds: buildCoachingPreviousRounds(),
        interviewerStyle: prepConfig.value.interviewerStyle || 'balanced',
        followUpDepth: prepConfig.value.followUpDepth || 2,
        stage: currentStage,
        stageRoundIndex: coachingStageRoundIndex.value + 1,
      })

      coachingRoundIndex.value = response.roundIndex || (coachingRoundIndex.value + 1)

      // 如果 AI 只返回了面试官提问但没有候选人回答，说明输出不完整
      // 显示面试官提问后，重新请求补全候选人回答（不计入阶段题数）
      if (response.interviewerQuestion && !response.candidateAnswer) {
        isLoading.value = false
        coachingMessages.value.push({
          id: newCoachingMessageId(),
          role: 'interviewer',
          content: response.interviewerQuestion,
        })
        if (!coachingPaused.value) {
          await coachingDelay(1500)
          if (!coachingPaused.value && !coachingFinished.value) {
            void runCoachingTurn('continue')
          }
        }
        return
      }

      // 回答完整，计入阶段题数
      coachingStageRoundIndex.value++

      // 全流程模式下检查是否当前阶段已完成
      if (selectedStage === 'full' && currentStage && coachingStageRoundIndex.value >= currentStage.roundCount) {
        if (coachingCurrentStageIdx.value < COACHING_STAGES.length - 1) {
          coachingWaitingForNextStage.value = true
          clearCoachingTimer()
          const nextStage = COACHING_STAGES[coachingCurrentStageIdx.value + 1]
          coachingMessages.value.push({
            id: newCoachingMessageId(),
            role: 'coach',
            content: `${currentStage.label} 已完成全部 ${currentStage.roundCount} 题。\n下一轮：【${nextStage.label}】— ${nextStage.interviewerRole}\n考察维度：${nextStage.focusDimensions.join('、')}\n\n请点击下方"进入下一轮"继续。`,
            techniques: ['轮次完成'],
          })
          // 先显示本轮完整内容再结束
        }
      }

      // 单轮模式下检查是否达到题数上限
      if (selectedStage !== 'full' && currentStage && coachingStageRoundIndex.value >= currentStage.roundCount) {
        // 触发结束
        coachingFinished.value = true
        coachingFinalSummary.value = ''
        deps.stopTimer()
        lastCoachingRecord.value = buildCoachingRecord()
        reviewData.value = buildCoachingReviewData()
        // 不立即跳转，先显示本轮内容
      }

      isLoading.value = false

      // 逐步显示：面试官提问 → 停顿 → 候选人回答 → 停顿 → 教练点评
      if (response.interviewerQuestion) {
        coachingMessages.value.push({
          id: newCoachingMessageId(),
          role: 'interviewer',
          content: response.interviewerQuestion,
        })
      }

      // 停顿模拟思考
      if (response.candidateAnswer && !coachingPaused.value) {
        await coachingDelay(1500)
      }

      if (response.candidateAnswer) {
        coachingMessages.value.push({
          id: newCoachingMessageId(),
          role: 'candidate',
          content: response.candidateAnswer,
        })
      }

      // 停顿后显示点评
      if (response.coachComment && !coachingPaused.value) {
        await coachingDelay(1000)
      }

      if (response.coachComment) {
        coachingMessages.value.push({
          id: newCoachingMessageId(),
          role: 'coach',
          content: response.coachComment,
          techniques: response.techniques,
          scoreHighlight: response.techniques.length >= 3 ? 5 : response.techniques.length >= 2 ? 4 : 3,
        })
      }

      // 检查是否结束
      if (response.isFinished) {
        coachingFinished.value = true
        coachingFinalSummary.value = response.finalSummary || ''
        coachingTechniqueSummary.value = response.techniqueSummary || []
        deps.stopTimer()

        // 构建观摩记录
        lastCoachingRecord.value = buildCoachingRecord()

        // 自动构建复盘数据并切换到训练复盘阶段
        reviewData.value = buildCoachingReviewData()
        workflowPhase.value = 'training'
        return
      }

      // 自动推进下一轮（如果没有在等待切换阶段且未结束）
      if (!coachingPaused.value && !coachingWaitingForNextStage.value && !coachingFinished.value) {
        scheduleNextCoachingTurn()
      }
    } catch (error) {
      errorMsg.value = formatErrorMessage(error)
      isLoading.value = false
    }
  }

  function scheduleNextCoachingTurn() {
    clearCoachingTimer()
    if (coachingPaused.value || coachingFinished.value) return
    const delay = getCoachingDelay()
    coachingAutoTimer = setTimeout(() => {
      if (coachingRoundIndex.value >= coachingTotalRounds.value - 1) {
        void runCoachingTurn('finish')
      } else {
        void runCoachingTurn('continue')
      }
    }, delay)
  }

  function clearCoachingTimer() {
    if (coachingAutoTimer) {
      clearTimeout(coachingAutoTimer)
      coachingAutoTimer = null
    }
  }

  function handleCoachingStart() {
    coachingMessages.value = []
    coachingRoundIndex.value = 0
    coachingFinished.value = false
    coachingPaused.value = false
    coachingFinalSummary.value = ''
    coachingTechniqueSummary.value = []
    coachingCurrentStageIdx.value = 0
    coachingStageRoundIndex.value = 0

    // 根据选择的轮次计算总题数
    const selectedStage = prepConfig.value.coachingStage || 'full'
    if (selectedStage === 'full') {
      coachingTotalRounds.value = COACHING_STAGES.reduce((sum, s) => sum + s.roundCount, 0)
    } else {
      const stage = COACHING_STAGES.find(s => s.type === selectedStage)
      coachingTotalRounds.value = stage?.roundCount || 7
      coachingCurrentStageIdx.value = COACHING_STAGES.findIndex(s => s.type === selectedStage)
    }

    deps.startTimer()
    void runCoachingTurn('start')
  }

  function handleCoachingPause() {
    coachingPaused.value = !coachingPaused.value
    if (coachingPaused.value) {
      clearCoachingTimer()
      // 暂停面试计时器
      deps.timerRunning.value = false
    } else {
      // 恢复面试计时器
      deps.timerRunning.value = true
      if (!coachingFinished.value && !isLoading.value) {
        scheduleNextCoachingTurn()
      }
    }
  }

  function handleCoachingNext() {
    clearCoachingTimer()
    if (coachingFinished.value || isLoading.value) return
    if (coachingRoundIndex.value >= coachingTotalRounds.value - 1) {
      void runCoachingTurn('finish')
    } else {
      void runCoachingTurn('continue')
    }
  }

  /** 用户手动进入下一轮面试阶段 */
  function handleCoachingNextStage() {
    if (!coachingWaitingForNextStage.value) return
    coachingWaitingForNextStage.value = false
    coachingCurrentStageIdx.value++
    coachingStageRoundIndex.value = 0
    // 继续下一轮
    void runCoachingTurn('continue')
  }

  function handleCoachingFinish() {
    clearCoachingTimer()
    if (coachingFinished.value || isLoading.value) return
    void runCoachingTurn('finish')
  }

  function handleCoachingReset() {
    clearCoachingTimer()
    coachingMessages.value = []
    coachingRoundIndex.value = 0
    coachingFinished.value = false
    coachingPaused.value = false
    coachingFinalSummary.value = ''
    coachingTechniqueSummary.value = []
    deps.resetTimer()
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
    // coaching reset
    clearCoachingTimer()
    coachingMessages.value = []
    coachingRoundIndex.value = 0
    coachingFinished.value = false
    coachingPaused.value = false
    coachingFinalSummary.value = ''
    coachingTechniqueSummary.value = []
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
    // coaching state
    coachingMessages, coachingRoundIndex, coachingTotalRounds,
    coachingPaused, coachingFinished, coachingFinalSummary, coachingTechniqueSummary,
    lastCoachingRecord, coachingCurrentStageIdx, coachingStageRoundIndex,
    coachingWaitingForNextStage,
    // computed
    assistantTurns, userTurns, currentRound,
    isAnalysisPhase, isSimulationPhase, isTrainingPhase,
    canSend, canStart, canFinish, canEnterPrep, canReview,
    phaseTitle, prepConfigValid, resumeSnapshot,
    // session actions
    runInterview, handleStart, handleTogglePause, handleFinish,
    handleReset, handleSend, handleOpenReview,
    resetSession, resetWorkflow,
    // coaching actions
    handleCoachingStart, handleCoachingPause, handleCoachingNext,
    handleCoachingNextStage, handleCoachingFinish, handleCoachingReset,
    buildCoachingRecord, coachingRecordToDrillSeeds,
    // prep actions
    handleConfirmPrep, syncPrepConfigFromJd, buildInitialPrepConfig, syncPrepSettings,
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
