import { ref } from 'vue'
import type { InterviewSessionRecord } from '@/components/ai/interview/types'
import { useJdAnalysisStore } from '@/stores/jdAnalysis'
import { useLearningProgressStore } from '@/stores/learningProgress'

const HISTORY_STORAGE_KEY = 'prepwise_interview_history'
const MAX_HISTORY_RECORDS = 20

/** 读取全部面试历史记录（纯函数，可在组件/composable/store 中复用，避免重复 localStorage 解析） */
export function loadInterviewRecords(): InterviewSessionRecord[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (item): item is InterviewSessionRecord =>
          Boolean(item && typeof item === 'object' && typeof item.id === 'string'),
      )
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  } catch {
    return []
  }
}

/**
 * 面试历史记录 composable
 *
 * 管理 localStorage 中面试记录的 CRUD。
 */
export function useInterviewHistory() {
  const historyRecords = ref<InterviewSessionRecord[]>([])

  function loadHistoryRecords(): InterviewSessionRecord[] {
    return loadInterviewRecords()
  }

  function persistHistoryRecord(record: Omit<InterviewSessionRecord, 'id'>): InterviewSessionRecord {
    const fullRecord: InterviewSessionRecord = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      ...record,
    }

    const records = loadInterviewRecords()
    records.unshift(fullRecord)
    if (records.length > MAX_HISTORY_RECORDS) records.length = MAX_HISTORY_RECORDS
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(records))
    historyRecords.value = records

    return fullRecord
  }

  function deleteHistoryRecord(id: string) {
    const records = loadInterviewRecords()
    const filtered = records.filter((record) => record.id !== id)
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(filtered))
    historyRecords.value = filtered

    // 回写关联数据，避免悬空引用：JD 的 linkedInterviewRecordIds + 学习进度评估
    try {
      const jdStore = useJdAnalysisStore()
      jdStore.removeLinkedInterviewRecord(id)
      const learningStore = useLearningProgressStore()
      learningStore.deleteByInterviewRecordId(id)
    } catch {
      // Pinia 未激活（非组件上下文）时跳过回写
    }
  }

  function getHistoryRecord(id: string): InterviewSessionRecord | null {
    const records = historyRecords.value.length > 0 ? historyRecords.value : loadInterviewRecords()
    return records.find((record) => record.id === id) ?? null
  }

  function init() {
    historyRecords.value = loadInterviewRecords()
  }

  return {
    historyRecords,
    init,
    loadHistoryRecords,
    persistHistoryRecord,
    deleteHistoryRecord,
    getHistoryRecord,
  }
}
