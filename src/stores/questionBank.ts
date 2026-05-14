import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase, hasSupabaseConfig } from '@/lib/supabaseClient'

export interface SavedQuestion {
  id?: string
  content: string
  category: string
  tags: string[]
  reference_answer?: string
  user_notes?: string
  source?: string
  mastery_level?: number
  created_at?: string
  /** 关联的 JD 分析 ID（来源追溯） */
  jd_analysis_id?: string
  /** 关联的面试会话 ID */
  interview_session_id?: string
  /** 难度 1-5 */
  difficulty?: number
  /** 考察领域 */
  focus_area?: string
  /** 面试官考察意图 */
  intent?: string
  /** 推荐答题框架（STAR/PREP等） */
  framework?: string
}

type QuestionRowPayload = Pick<
  SavedQuestion,
  'content' | 'category' | 'tags' | 'reference_answer' | 'user_notes' | 'source' | 'mastery_level'
>

function normalizeQuestionForDatabase(question: SavedQuestion): QuestionRowPayload {
  return {
    content: question.content.trim(),
    category: question.category?.trim() || '未分类',
    tags: Array.isArray(question.tags) ? question.tags : [],
    reference_answer: question.reference_answer ?? '',
    user_notes: question.user_notes ?? '',
    source: question.source ?? '',
    mastery_level: question.mastery_level ?? 0,
  }
}

function normalizeQuestionUpdate(payload: Partial<SavedQuestion>): Partial<QuestionRowPayload> {
  const next: Partial<QuestionRowPayload> = {}

  if (payload.content !== undefined) next.content = payload.content.trim()
  if (payload.category !== undefined) next.category = payload.category.trim() || '未分类'
  if (payload.tags !== undefined) next.tags = Array.isArray(payload.tags) ? payload.tags : []
  if (payload.reference_answer !== undefined) next.reference_answer = payload.reference_answer
  if (payload.user_notes !== undefined) next.user_notes = payload.user_notes
  if (payload.source !== undefined) next.source = payload.source
  if (payload.mastery_level !== undefined) next.mastery_level = payload.mastery_level

  return next
}

// ── localStorage 本地存储后备方案 ──

const LOCAL_STORAGE_KEY = 'prepwise-question-bank'

function genLocalId(): string {
  return `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function loadLocalQuestions(): SavedQuestion[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY)
    if (!raw) return []
    const data = JSON.parse(raw)
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

function saveLocalQuestions(items: SavedQuestion[]) {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(items))
}

export const useQuestionBankStore = defineStore('questionBank', () => {
  const questions = ref<SavedQuestion[]>([])
  const isLoading = ref(false)
  const errorMsg = ref('')
  const mutationErrorMsg = ref('')
  /** 是否使用本地存储模式（Supabase 不可用时自动切换） */
  const isLocalMode = ref(false)

  // ── 统计信息 ──
  const stats = computed(() => {
    const all = questions.value
    const categories = new Set(all.map((q) => q.category))
    const sources = new Set(all.map((q) => q.source).filter(Boolean))

    // 掌握度分布
    const masteryBuckets = { unpracticed: 0, weak: 0, fair: 0, good: 0, master: 0 }
    for (const q of all) {
      const m = q.mastery_level ?? 0
      if (m === 0) masteryBuckets.unpracticed++
      else if (m <= 1) masteryBuckets.weak++
      else if (m <= 2) masteryBuckets.fair++
      else if (m <= 3) masteryBuckets.good++
      else masteryBuckets.master++
    }

    return {
      total: all.length,
      categories: categories.size,
      sources: sources.size,
      mastery: masteryBuckets,
    }
  })

  // ── 获取所有题目 ──
  async function fetchQuestions(categoryFilter?: string, tagFilter?: string) {
    // 如果 Supabase 未配置或之前已确认不可用，直接使用本地存储
    if (!supabase || !hasSupabaseConfig || isLocalMode.value) {
      loadFromLocal(categoryFilter, tagFilter)
      return
    }

    isLoading.value = true
    errorMsg.value = ''
    try {
      let query = supabase.from('questions').select('*').order('created_at', { ascending: false })

      if (categoryFilter) {
        query = query.eq('category', categoryFilter)
      }
      if (tagFilter) {
        query = query.contains('tags', [tagFilter])
      }

      const { data, error } = await query
      if (error) throw error

      questions.value = data as SavedQuestion[]
    } catch (err: unknown) {
      console.warn('[QuestionBank] Supabase 不可用，回退到本地存储:', err)
      // Supabase 请求失败，自动切换到本地模式
      isLocalMode.value = true
      loadFromLocal(categoryFilter, tagFilter)
    } finally {
      isLoading.value = false
    }
  }

  /** 从 localStorage 加载题目 */
  function loadFromLocal(categoryFilter?: string, tagFilter?: string) {
    isLoading.value = true
    errorMsg.value = ''
    try {
      let items = loadLocalQuestions()

      if (categoryFilter) {
        items = items.filter(q => q.category === categoryFilter)
      }
      if (tagFilter) {
        items = items.filter(q => q.tags?.includes(tagFilter))
      }

      questions.value = items
    } catch (err: unknown) {
      errorMsg.value = '本地题库加载失败'
    } finally {
      isLoading.value = false
    }
  }

  // ── 收藏新题目 ──
  async function addQuestion(q: SavedQuestion) {
    mutationErrorMsg.value = ''

    // 本地模式
    if (isLocalMode.value || !supabase) {
      try {
        const newQuestion: SavedQuestion = {
          ...normalizeQuestionForDatabase(q),
          id: genLocalId(),
          created_at: new Date().toISOString(),
        }
        questions.value.unshift(newQuestion)
        saveLocalQuestions(questions.value)
        return true
      } catch (err: unknown) {
        mutationErrorMsg.value = '保存题目失败'
        return false
      }
    }

    try {
      const payload = normalizeQuestionForDatabase(q)
      const { data, error } = await supabase.from('questions').insert([payload]).select()
      if (error) throw error

      if (data && data.length > 0) {
        questions.value.unshift(data[0] as SavedQuestion)
      }
      return true
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '保存题目失败'
      console.error('添加题目失败:', err)
      mutationErrorMsg.value = message
      return false
    }
  }

  // ── 批量添加题目 ──
  async function addQuestionBatch(items: SavedQuestion[]) {
    if (!items.length) return 0
    mutationErrorMsg.value = ''

    // 本地模式
    if (isLocalMode.value || !supabase) {
      try {
        const newItems = items.map(q => ({
          ...normalizeQuestionForDatabase(q),
          id: genLocalId(),
          created_at: new Date().toISOString(),
        }))
        questions.value = [...newItems, ...questions.value]
        saveLocalQuestions(questions.value)
        return newItems.length
      } catch (err: unknown) {
        mutationErrorMsg.value = '批量保存题目失败'
        return 0
      }
    }

    try {
      const payload = items.map(normalizeQuestionForDatabase)
      const { data, error } = await supabase.from('questions').insert(payload).select()
      if (error) throw error

      if (data && data.length > 0) {
        questions.value = [...(data as SavedQuestion[]), ...questions.value]
      }
      return data?.length ?? 0
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '批量保存题目失败'
      console.error('批量添加失败:', err)
      mutationErrorMsg.value = message
      return 0
    }
  }

  // ── 更新题目 ──
  async function updateQuestion(id: string, payload: Partial<SavedQuestion>) {
    mutationErrorMsg.value = ''

    // 本地模式
    if (isLocalMode.value || !supabase) {
      try {
        const index = questions.value.findIndex(q => q.id === id)
        if (index === -1) return false
        questions.value[index] = { ...questions.value[index], ...payload } as SavedQuestion
        saveLocalQuestions(questions.value)
        return true
      } catch {
        mutationErrorMsg.value = '更新题目失败'
        return false
      }
    }

    const databasePayload = normalizeQuestionUpdate(payload)
    if (Object.keys(databasePayload).length === 0) return true

    try {
      const { data, error } = await supabase
        .from('questions')
        .update(databasePayload)
        .eq('id', id)
        .select()

      if (error) throw error

      if (data && data.length > 0) {
        const index = questions.value.findIndex((item) => item.id === id)
        if (index !== -1) {
          questions.value[index] = { ...questions.value[index], ...data[0] }
        }
      }
      return true
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '更新题目失败'
      console.error('更新题目失败:', err)
      mutationErrorMsg.value = message
      return false
    }
  }

  // ── 更新掌握度 ──
  async function updateMastery(id: string, level: number) {
    const clamped = Math.max(0, Math.min(5, Math.round(level)))
    return updateQuestion(id, { mastery_level: clamped })
  }

  // ── 删除题目 ──
  async function deleteQuestion(id: string) {
    mutationErrorMsg.value = ''

    // 本地模式
    if (isLocalMode.value || !supabase) {
      try {
        questions.value = questions.value.filter(q => q.id !== id)
        saveLocalQuestions(questions.value)
        return true
      } catch {
        mutationErrorMsg.value = '删除题目失败'
        return false
      }
    }

    try {
      const { error } = await supabase.from('questions').delete().eq('id', id)
      if (error) throw error

      questions.value = questions.value.filter((q) => q.id !== id)
      return true
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '删除题目失败'
      console.error('删除题目失败:', err)
      mutationErrorMsg.value = message
      return false
    }
  }

  return {
    questions,
    isLoading,
    isLocalMode,
    errorMsg,
    mutationErrorMsg,
    stats,
    fetchQuestions,
    addQuestion,
    addQuestionBatch,
    updateQuestion,
    updateMastery,
    deleteQuestion,
  }
})
