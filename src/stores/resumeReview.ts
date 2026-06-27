import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import type { ResumeReviewResult } from '@/services/resumeReview'

export interface ResumeReviewHistoryItem {
  id: string
  generatedAt: string
  targetRole: string
  roleFamily: ResumeReviewResult['roleFamily']
  resumeSignature: string
  jdSignature: string
  result: ResumeReviewResult
}

interface ResumeReviewStorageData {
  latestResult?: ResumeReviewResult | null
  history?: ResumeReviewHistoryItem[]
  activeReviewId?: string
}

interface ReviewSignatures {
  resumeSignature: string
  jdSignature: string
}

const STORAGE_KEY = 'prepwise-resume-review'
const MAX_HISTORY_ITEMS = 12

function simpleHash(value: string): string {
  let hash = 5381
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(i)
  }
  return (hash >>> 0).toString(36)
}

export function buildReviewSignature(prefix: string, value: unknown): string {
  try {
    return `${prefix}_${simpleHash(JSON.stringify(value ?? {}))}`
  } catch {
    return `${prefix}_${simpleHash(String(value ?? ''))}`
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object')
}

function normalizeResult(raw: unknown): ResumeReviewResult | null {
  if (!isRecord(raw)) return null
  return raw as unknown as ResumeReviewResult
}

function normalizeHistoryItem(raw: unknown): ResumeReviewHistoryItem | null {
  if (!isRecord(raw)) return null

  const result = normalizeResult(raw.result)
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id : ''
  if (!id || !result) return null

  return {
    id,
    generatedAt: typeof raw.generatedAt === 'string' ? raw.generatedAt : result.generatedAt,
    targetRole: typeof raw.targetRole === 'string' ? raw.targetRole : result.targetRole,
    roleFamily: result.roleFamily,
    resumeSignature: typeof raw.resumeSignature === 'string' ? raw.resumeSignature : '',
    jdSignature: typeof raw.jdSignature === 'string' ? raw.jdSignature : '',
    result,
  }
}

function normalizeStorageData(raw: unknown): ResumeReviewStorageData {
  if (!isRecord(raw)) return {
    latestResult: null,
    history: [],
    activeReviewId: '',
  }

  const history = Array.isArray(raw.history)
    ? raw.history
      .map((item) => normalizeHistoryItem(item))
      .filter((item): item is ResumeReviewHistoryItem => Boolean(item))
      .slice(0, MAX_HISTORY_ITEMS)
    : []

  const latestResult = normalizeResult(raw.latestResult)
  const activeReviewId = typeof raw.activeReviewId === 'string' ? raw.activeReviewId : ''

  return {
    latestResult,
    history,
    activeReviewId: history.some((item) => item.id === activeReviewId) ? activeReviewId : '',
  }
}

function createReviewHistoryId(result: ResumeReviewResult, signatures: ReviewSignatures): string {
  if (result.id?.trim()) return result.id
  return buildReviewSignature('review', {
    generatedAt: result.generatedAt,
    targetRole: result.targetRole,
    resumeSignature: signatures.resumeSignature,
    jdSignature: signatures.jdSignature,
  })
}

export const useResumeReviewStore = defineStore('resumeReview', () => {
  const latestResult = ref<ResumeReviewResult | null>(null)
  const history = ref<ResumeReviewHistoryItem[]>([])
  const isLoading = ref(false)
  const errorMsg = ref('')
  const activeReviewId = ref('')

  const hasHistory = computed(() => history.value.length > 0)

  function saveToStorage() {
    if (typeof localStorage === 'undefined') return

    const data: ResumeReviewStorageData = {
      latestResult: latestResult.value,
      history: history.value,
      activeReviewId: activeReviewId.value,
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }

  function loadFromStorage() {
    if (typeof localStorage === 'undefined') return

    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return

      const data = normalizeStorageData(JSON.parse(raw))
      latestResult.value = data.latestResult ?? null
      history.value = data.history ?? []
      activeReviewId.value = data.activeReviewId ?? ''
    } catch (error) {
      console.warn('Failed to load resume review data from localStorage', error)
      latestResult.value = null
      history.value = []
      activeReviewId.value = ''
    }
  }

  function setLoading(value: boolean) {
    isLoading.value = value
    if (value) {
      errorMsg.value = ''
    }
  }

  function setError(message: string) {
    errorMsg.value = message
    isLoading.value = false
  }

  function saveResult(result: ResumeReviewResult, signatures: ReviewSignatures) {
    latestResult.value = result
    isLoading.value = false
    errorMsg.value = ''

    const id = createReviewHistoryId(result, signatures)
    activeReviewId.value = id

    const item: ResumeReviewHistoryItem = {
      id,
      generatedAt: result.generatedAt,
      targetRole: result.targetRole,
      roleFamily: result.roleFamily,
      resumeSignature: signatures.resumeSignature,
      jdSignature: signatures.jdSignature,
      result,
    }

    history.value = [
      item,
      ...history.value.filter((entry) => entry.id !== id),
    ].slice(0, MAX_HISTORY_ITEMS)
  }

  function openHistoryItem(id: string) {
    const item = history.value.find((entry) => entry.id === id)
    if (!item) return

    latestResult.value = item.result
    activeReviewId.value = item.id
  }

  function clearError() {
    errorMsg.value = ''
  }

  loadFromStorage()

  watch(
    [latestResult, history, activeReviewId],
    () => {
      saveToStorage()
    },
    { deep: true },
  )

  return {
    latestResult,
    history,
    isLoading,
    errorMsg,
    activeReviewId,
    hasHistory,
    setLoading,
    setError,
    saveResult,
    openHistoryItem,
    clearError,
  }
})
