/**
 * 技术自测 Store（基于「我的题库」的自我评估训练）
 *
 * 从 questionBankStore 抽题，用户对每道题自评 会/部分/不会，
 * 自评结果回写题库 mastery_level，形成「自测 → 弱项 → 复练」闭环。
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useQuestionBankStore } from '@/stores/questionBank'

/** 难度桶（题库 difficulty 1-5 的归类） */
export type DifficultyBucket = 'easy' | 'medium' | 'hard'

/** 自评等级 */
export type SelfRating = 'known' | 'partial' | 'unknown'

/** 自测题目（从题库 SavedQuestion 映射而来的快照） */
export interface QuizQuestion {
  id: string
  content: string
  category: string
  tags: string[]
  difficulty: number
  referenceAnswer: string
  intent: string
  framework: string
}

/** 答题记录 */
export interface AnswerRecord {
  questionId: string
  rating: SelfRating
  /** 兼容语义：known→correct，partial/unknown→wrong，跳过→skipped */
  status: 'correct' | 'wrong' | 'skipped'
  answeredAt: string
  timeSpent: number
}

/** 自测会话 */
export interface QuizSession {
  id: string
  name: string
  questions: QuizQuestion[]
  answers: Map<string, AnswerRecord>
  startedAt: string
  completedAt?: string
  config: QuizSessionConfig
}

type SerializedQuizSession = Omit<QuizSession, 'answers'> & {
  answers: [string, AnswerRecord][]
}

/** 自测配置 */
export interface QuizSessionConfig {
  categories?: string[]
  tags?: string[]
  difficultyBuckets?: DifficultyBucket[]
  questionCount: number
  randomOrder: boolean
  showAnswer: boolean
}

/** 统计数据 */
export interface QuizStatistics {
  totalAnswered: number
  knownCount: number
  partialCount: number
  unknownCount: number
  masteryRate: number
  avgTimeSpent: number
  weakCategories: string[]
  strongCategories: string[]
}

const SESSIONS_STORAGE_KEY = 'prepwise-quiz-sessions-v2'

/** 难度数值(1-5) → 桶 */
export function difficultyToBucket(d: number): DifficultyBucket {
  if (d <= 2) return 'easy'
  if (d === 3) return 'medium'
  return 'hard'
}

/** 自评 → 题库掌握度 */
export function ratingToMastery(rating: SelfRating): number {
  if (rating === 'known') return 4
  if (rating === 'partial') return 2
  return 1
}

export const useInterviewQuizStore = defineStore('interviewQuiz', () => {
  const currentSession = ref<QuizSession | null>(null)
  const sessions = ref<QuizSession[]>([])
  const currentQuestionIndex = ref(0)
  const showExplanation = ref(false)

  /** 题库中可自测的题目（映射自 questionBankStore） */
  const allQuestions = computed<QuizQuestion[]>(() => {
    const qb = useQuestionBankStore()
    return qb.questions
      .filter((q) => q.id && q.content?.trim())
      .map((q) => ({
        id: q.id!,
        content: q.content,
        category: q.category || '未分类',
        tags: q.tags || [],
        difficulty: q.difficulty ?? 3,
        referenceAnswer: q.reference_answer || '',
        intent: q.intent || q.focus_area || '',
        framework: q.framework || '',
      }))
  })

  /** 题库出现的领域（distinct category） */
  const availableCategories = computed(() => {
    const set = new Set<string>()
    allQuestions.value.forEach((q) => set.add(q.category))
    return Array.from(set).sort()
  })

  /** 题库出现的标签（distinct tags） */
  const availableTags = computed(() => {
    const set = new Set<string>()
    allQuestions.value.forEach((q) => q.tags.forEach((t) => t && set.add(t)))
    return Array.from(set).sort()
  })

  /** 当前会话进度 */
  const sessionProgress = computed(() => {
    if (!currentSession.value) return 0
    const total = currentSession.value.questions.length
    const answered = currentSession.value.answers.size
    return total > 0 ? Math.round((answered / total) * 100) : 0
  })

  /** 当前会话统计 */
  const sessionStats = computed(() => {
    if (!currentSession.value) return null
    const answers = Array.from(currentSession.value.answers.values())
    const known = answers.filter((a) => a.rating === 'known').length
    const partial = answers.filter((a) => a.rating === 'partial').length
    const unknown = answers.filter((a) => a.rating === 'unknown').length
    const totalTime = answers.reduce((sum, a) => sum + a.timeSpent, 0)
    const avgTime = answers.length > 0 ? Math.round(totalTime / answers.length) : 0
    const masteryRate = answers.length > 0
      ? Math.round(((known + partial * 0.5) / answers.length) * 100)
      : 0
    return { total: answers.length, known, partial, unknown, masteryRate, avgTime }
  })

  /** 全局统计（所有会话） */
  const globalStats = computed<QuizStatistics>(() => {
    const allAnswers = sessions.value.flatMap((s) => Array.from(s.answers.values()))
    const totalAnswered = allAnswers.length
    const knownCount = allAnswers.filter((a) => a.rating === 'known').length
    const partialCount = allAnswers.filter((a) => a.rating === 'partial').length
    const unknownCount = allAnswers.filter((a) => a.rating === 'unknown').length
    const masteryRate = totalAnswered > 0
      ? Math.round(((knownCount + partialCount * 0.5) / totalAnswered) * 100)
      : 0
    const avgTimeSpent = totalAnswered > 0
      ? Math.round(allAnswers.reduce((sum, a) => sum + a.timeSpent, 0) / totalAnswered)
      : 0

    // 按领域统计掌握度
    const catStats: Record<string, { known: number; total: number }> = {}
    for (const session of sessions.value) {
      for (const answer of session.answers.values()) {
        const q = session.questions.find((item) => item.id === answer.questionId)
        if (!q) continue
        const cat = q.category
        if (!catStats[cat]) catStats[cat] = { known: 0, total: 0 }
        catStats[cat]!.total++
        if (answer.rating === 'known') catStats[cat]!.known++
      }
    }
    const weakCategories: string[] = []
    const strongCategories: string[] = []
    for (const [cat, s] of Object.entries(catStats)) {
      if (s.total < 2) continue
      const rate = s.known / s.total
      if (rate < 0.5) weakCategories.push(cat)
      else if (rate > 0.8) strongCategories.push(cat)
    }

    return {
      totalAnswered,
      knownCount,
      partialCount,
      unknownCount,
      masteryRate,
      avgTimeSpent,
      weakCategories,
      strongCategories,
    }
  })

  /** 当前题目 */
  const currentQuestion = computed(() => {
    if (!currentSession.value) return null
    return currentSession.value.questions[currentQuestionIndex.value] ?? null
  })

  /** 当前题目的答题记录 */
  const currentAnswer = computed(() => {
    if (!currentSession.value || !currentQuestion.value) return null
    return currentSession.value.answers.get(currentQuestion.value.id) ?? null
  })

  /** 从当前 session 取题 */
  function getQuestion(id: string): QuizQuestion | undefined {
    return currentSession.value?.questions.find((q) => q.id === id)
  }

  /** 按配置筛选题目（数据源：题库） */
  function filterQuestions(config: QuizSessionConfig): QuizQuestion[] {
    let pool = [...allQuestions.value]

    if (config.categories?.length) {
      pool = pool.filter((q) => config.categories!.includes(q.category))
    }
    if (config.tags?.length) {
      pool = pool.filter((q) => q.tags.some((t) => config.tags!.includes(t)))
    }
    if (config.difficultyBuckets?.length) {
      pool = pool.filter((q) => config.difficultyBuckets!.includes(difficultyToBucket(q.difficulty)))
    }
    if (config.randomOrder) {
      pool = pool.sort(() => Math.random() - 0.5)
    }
    return pool.slice(0, config.questionCount)
  }

  function cloneConfig(config: QuizSessionConfig): QuizSessionConfig {
    return {
      ...config,
      categories: config.categories ? [...config.categories] : undefined,
      tags: config.tags ? [...config.tags] : undefined,
      difficultyBuckets: config.difficultyBuckets ? [...config.difficultyBuckets] : undefined,
    }
  }

  function cloneQuestion(question: QuizQuestion): QuizQuestion {
    return {
      ...question,
      tags: [...question.tags],
    }
  }

  function createSessionFromQuestions(
    config: QuizSessionConfig,
    questions: QuizQuestion[],
    name?: string,
  ): QuizSession {
    const session: QuizSession = {
      id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: name || generateSessionName(config),
      questions: questions.map(cloneQuestion),
      answers: new Map(),
      startedAt: new Date().toISOString(),
      config: cloneConfig(config),
    }
    currentSession.value = session
    currentQuestionIndex.value = 0
    showExplanation.value = false
    sessions.value.push(session)
    saveSessions()
    return session
  }

  /** 创建自测会话 */
  function createSession(config: QuizSessionConfig, name?: string): QuizSession {
    const questions = filterQuestions(config)
    return createSessionFromQuestions(config, questions, name)
  }

  function generateSessionName(config: QuizSessionConfig): string {
    const parts: string[] = []
    if (config.categories?.length) parts.push(config.categories.join('、'))
    if (config.tags?.length) parts.push(config.tags.join('、'))
    if (config.difficultyBuckets?.length) {
      const map: Record<DifficultyBucket, string> = { easy: '简单', medium: '中等', hard: '困难' }
      parts.push(config.difficultyBuckets.map((d) => map[d]).join('、'))
    }
    parts.push(`${config.questionCount}题`)
    return parts.join(' - ') || '自定义自测'
  }

  /** 自评并回写题库掌握度（闭环） */
  function rateAnswer(questionId: string, rating: SelfRating, timeSpent: number): void {
    if (!currentSession.value) return
    currentSession.value.answers.set(questionId, {
      questionId,
      rating,
      status: rating === 'known' ? 'correct' : 'wrong',
      answeredAt: new Date().toISOString(),
      timeSpent,
    })
    saveSessions()
    // 回写题库掌握度，让自测反哺弱项
    const qb = useQuestionBankStore()
    void qb.updateMastery(questionId, ratingToMastery(rating))
    if (currentSession.value.config.showAnswer) {
      showExplanation.value = true
    }
  }

  /** 跳过题目 */
  function skipQuestion(questionId: string): void {
    if (!currentSession.value) return
    currentSession.value.answers.set(questionId, {
      questionId,
      rating: 'unknown',
      status: 'skipped',
      answeredAt: new Date().toISOString(),
      timeSpent: 0,
    })
    saveSessions()
  }

  function nextQuestion(): void {
    if (!currentSession.value) return
    if (currentQuestionIndex.value < currentSession.value.questions.length - 1) {
      currentQuestionIndex.value++
      showExplanation.value = false
    }
  }

  function previousQuestion(): void {
    if (currentQuestionIndex.value > 0) currentQuestionIndex.value--
  }

  function completeSession(): void {
    if (!currentSession.value) return
    currentSession.value.completedAt = new Date().toISOString()
    saveSessions()
  }

  function deleteSession(sessionId: string): void {
    const index = sessions.value.findIndex((s) => s.id === sessionId)
    if (index > -1) {
      sessions.value.splice(index, 1)
      if (currentSession.value?.id === sessionId) currentSession.value = null
      saveSessions()
    }
  }

  function loadSession(sessionId: string): void {
    const session = sessions.value.find((s) => s.id === sessionId)
    if (session) {
      currentSession.value = session
      const firstUnanswered = session.questions.findIndex((q) => !session.answers.has(q.id))
      currentQuestionIndex.value = firstUnanswered >= 0
        ? firstUnanswered
        : Math.max(0, session.questions.length - 1)
      showExplanation.value = false
    }
  }

  function restartSession(sessionId: string): QuizSession | null {
    const session = sessions.value.find((s) => s.id === sessionId)
    if (!session || session.questions.length === 0) return null
    return createSessionFromQuestions(session.config, session.questions, `${session.name} (重试)`)
  }

  function saveSessions() {
    const serializable = sessions.value.map((s) => ({
      ...s,
      answers: Array.from(s.answers.entries()),
    }))
    localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(serializable))
  }

  function loadSessions() {
    try {
      const raw = localStorage.getItem(SESSIONS_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as SerializedQuizSession[]
      sessions.value = parsed.map((s) => ({ ...s, answers: new Map(s.answers) }))
    } catch {
      console.warn('[InterviewQuiz] 加载会话失败')
    }
  }

  loadSessions()

  return {
    // State
    currentSession,
    sessions,
    currentQuestionIndex,
    showExplanation,
    // Computed
    allQuestions,
    availableCategories,
    availableTags,
    sessionProgress,
    sessionStats,
    globalStats,
    currentQuestion,
    currentAnswer,
    // Actions
    getQuestion,
    filterQuestions,
    createSession,
    rateAnswer,
    skipQuestion,
    nextQuestion,
    previousQuestion,
    completeSession,
    deleteSession,
    loadSession,
    restartSession,
  }
})
