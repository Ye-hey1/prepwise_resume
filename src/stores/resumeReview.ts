import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import type {
  ResumeReviewModuleKey,
  ResumeReviewResult,
  ReviewCategory,
  ReviewPriority,
  ReviewTask,
} from '@/services/resumeReview'

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
const MODULE_KEYS: ResumeReviewModuleKey[] = [
  'basicInfo',
  'education',
  'skills',
  'workExperience',
  'projectExperience',
  'awards',
  'selfIntro',
]

function simpleHash(value: string): string {
  let hash = 5381
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(i)
  }
  return (hash >>> 0).toString(36)
}

function stableSerialize(value: unknown, seen = new WeakSet<object>()): string {
  if (value === null) return 'null'

  const valueType = typeof value
  if (valueType === 'string' || valueType === 'number' || valueType === 'boolean') {
    return JSON.stringify(value)
  }
  if (valueType === 'bigint') return JSON.stringify(`${String(value)}n`)
  if (valueType === 'undefined') return '"[Undefined]"'
  if (valueType === 'symbol') return JSON.stringify(String(value))
  if (valueType === 'function') return '"[Function]"'

  if (Array.isArray(value)) {
    if (seen.has(value)) return '"[Circular]"'
    seen.add(value)
    const serialized = `[${value.map((item) => stableSerialize(item, seen)).join(',')}]`
    seen.delete(value)
    return serialized
  }

  if (isRecord(value)) {
    if (seen.has(value)) return '"[Circular]"'
    seen.add(value)
    const serialized = `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key], seen)}`)
      .join(',')}}`
    seen.delete(value)
    return serialized
  }

  return JSON.stringify(String(value))
}

export function buildReviewSignature(prefix: string, value: unknown): string {
  try {
    return `${prefix}_${simpleHash(stableSerialize(value ?? {}))}`
  } catch (error) {
    console.warn('Failed to build stable resume review signature', error)
    return `${prefix}_${simpleHash(String(value ?? ''))}`
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function toText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function toFiniteScore(value: unknown, fallback = 0): number {
  const numberValue = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numberValue)) return fallback
  return Math.min(100, Math.max(0, numberValue))
}

function normalizeRoleFamily(value: unknown): ResumeReviewResult['roleFamily'] {
  return value === 'technical' || value === 'general' ? value : 'general'
}

function normalizeJdContextState(value: unknown): ResumeReviewResult['jdContextState'] {
  return value === 'none' || value === 'raw' || value === 'completed' ? value : 'none'
}

function normalizeVerdict(value: unknown): ResumeReviewResult['verdict'] {
  return value === 'ready' || value === 'needs_work' || value === 'high_risk' ? value : 'needs_work'
}

function normalizePriority(value: unknown): ReviewPriority {
  return value === 'high' || value === 'medium' || value === 'low' ? value : 'medium'
}

function normalizeModuleKey(value: unknown): ResumeReviewModuleKey {
  return MODULE_KEYS.includes(value as ResumeReviewModuleKey) ? value as ResumeReviewModuleKey : 'selfIntro'
}

function normalizeCategory(raw: unknown): ReviewCategory | null {
  if (!isRecord(raw)) return null

  const key = toText(raw.key)
  if (!key) return null

  const max = toFiniteScore(raw.max, 100)
  return {
    key,
    label: toText(raw.label, key),
    score: Math.min(max, toFiniteScore(raw.score)),
    max,
    evidence: toText(raw.evidence),
    deductions: toText(raw.deductions),
    actionableAdvice: toText(raw.actionableAdvice),
    relatedModuleKey: normalizeModuleKey(raw.relatedModuleKey),
    missingHardRequirement: raw.missingHardRequirement === true,
  }
}

function normalizeCategories(raw: unknown): ReviewCategory[] {
  if (!Array.isArray(raw)) return []

  return raw
    .map((item) => normalizeCategory(item))
    .filter((item): item is ReviewCategory => Boolean(item))
}

function normalizeTask(raw: unknown, index: number): ReviewTask | null {
  if (!isRecord(raw)) return null

  const title = toText(raw.title)
  const reason = toText(raw.reason)
  const suggestion = toText(raw.suggestion)
  if (!title && !reason && !suggestion) return null

  return {
    id: toText(raw.id, `task_${index + 1}`),
    priority: normalizePriority(raw.priority),
    title,
    reason,
    suggestion,
    relatedModuleKey: normalizeModuleKey(raw.relatedModuleKey),
    sourceCategoryKey: toText(raw.sourceCategoryKey, 'general'),
    missingHardRequirement: raw.missingHardRequirement === true,
  }
}

function normalizeTasks(raw: unknown): ReviewTask[] {
  if (!Array.isArray(raw)) return []

  return raw
    .map((item, index) => normalizeTask(item, index))
    .filter((item): item is ReviewTask => Boolean(item))
}

function hasMinimumResultShape(raw: Record<string, unknown>): boolean {
  const hasRequiredArrays = Array.isArray(raw.generalCategories)
    && Array.isArray(raw.jdFitCategories)
    && Array.isArray(raw.tasks)
  const hasReviewContent = typeof raw.summary === 'string'
    || typeof raw.overallScore === 'number'
    || typeof raw.generalScore === 'number'
    || Array.isArray(raw.generalCategories)
    || Array.isArray(raw.tasks)

  return hasRequiredArrays && hasReviewContent
}

function normalizeResult(raw: unknown, fallbackId = ''): ResumeReviewResult | null {
  if (!isRecord(raw)) return null

  const id = toText(raw.id, fallbackId).trim()
  if (!id || !hasMinimumResultShape(raw)) return null

  return {
    id,
    generatedAt: toText(raw.generatedAt, new Date().toISOString()),
    targetRole: toText(raw.targetRole),
    roleFamily: normalizeRoleFamily(raw.roleFamily),
    jdContextState: normalizeJdContextState(raw.jdContextState),
    overallScore: toFiniteScore(raw.overallScore),
    generalScore: toFiniteScore(raw.generalScore),
    jdFitScore: typeof raw.jdFitScore === 'number' && Number.isFinite(raw.jdFitScore)
      ? toFiniteScore(raw.jdFitScore)
      : null,
    verdict: normalizeVerdict(raw.verdict),
    summary: toText(raw.summary, '简历审查已完成，请查看下方评分与优化任务。'),
    generalCategories: normalizeCategories(raw.generalCategories),
    jdFitCategories: normalizeCategories(raw.jdFitCategories),
    tasks: normalizeTasks(raw.tasks),
    fairnessNotes: toText(raw.fairnessNotes, '本次审查未使用与岗位能力无关的信息进行评分。'),
  }
}

function normalizeHistoryItem(raw: unknown): ResumeReviewHistoryItem | null {
  if (!isRecord(raw)) return null

  const historyId = typeof raw.id === 'string' && raw.id.trim() ? raw.id : ''
  const result = normalizeResult(raw.result, historyId)
  if (!result) return null
  const id = result.id

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

function reconcileStorageData(data: ResumeReviewStorageData): ResumeReviewStorageData {
  const history = data.history ?? []
  const activeReviewId = data.activeReviewId ?? ''
  const activeHistoryItem = history.find((item) => item.id === activeReviewId)

  if (activeHistoryItem) {
    return {
      latestResult: activeHistoryItem.result,
      history,
      activeReviewId: activeHistoryItem.id,
    }
  }

  const latestResult = data.latestResult ?? null
  const latestId = latestResult?.id?.trim() ?? ''
  const latestHistoryItem = latestId ? history.find((item) => item.id === latestId) : null
  if (latestHistoryItem) {
    return {
      latestResult: latestHistoryItem.result,
      history,
      activeReviewId: latestHistoryItem.id,
    }
  }

  if (latestResult && latestId) {
    return {
      latestResult,
      history,
      activeReviewId: latestId,
    }
  }

  const firstHistoryItem = history[0]
  if (firstHistoryItem) {
    return {
      latestResult: firstHistoryItem.result,
      history,
      activeReviewId: firstHistoryItem.id,
    }
  }

  return {
    latestResult: null,
    history: [],
    activeReviewId: '',
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

  return reconcileStorageData({
    latestResult,
    history,
    activeReviewId,
  })
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

    try {
      const data: ResumeReviewStorageData = {
        latestResult: latestResult.value,
        history: history.value,
        activeReviewId: activeReviewId.value,
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch (error) {
      console.warn('Failed to save resume review data to localStorage', error)
    }
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
    const id = createReviewHistoryId(result, signatures)
    const normalizedResult = {
      ...result,
      id,
    }

    latestResult.value = normalizedResult
    isLoading.value = false
    errorMsg.value = ''
    activeReviewId.value = id

    const item: ResumeReviewHistoryItem = {
      id,
      generatedAt: normalizedResult.generatedAt,
      targetRole: normalizedResult.targetRole,
      roleFamily: normalizedResult.roleFamily,
      resumeSignature: signatures.resumeSignature,
      jdSignature: signatures.jdSignature,
      result: normalizedResult,
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
