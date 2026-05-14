import { ref } from 'vue'
import type { InterviewSessionRecord } from '@/components/ai/interview/types'

const HISTORY_STORAGE_KEY = 'prepwise_interview_history'
const MAX_HISTORY_RECORDS = 20

/**
 * 面试历史记录 composable
 *
 * 管理 localStorage 中面试记录的 CRUD。
 */
export function useInterviewHistory() {
  const historyRecords = ref<InterviewSessionRecord[]>([])

  function loadHistoryRecords(): InterviewSessionRecord[] {
    try {
      const raw = localStorage.getItem(HISTORY_STORAGE_KEY)
      if (!raw) return []
      return JSON.parse(raw) as InterviewSessionRecord[]
    } catch {
      return []
    }
  }

  function persistHistoryRecord(record: Omit<InterviewSessionRecord, 'id'>): InterviewSessionRecord {
    const fullRecord: InterviewSessionRecord = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      ...record,
    }

    const records = loadHistoryRecords()
    records.unshift(fullRecord)
    if (records.length > MAX_HISTORY_RECORDS) records.length = MAX_HISTORY_RECORDS
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(records))
    historyRecords.value = records

    return fullRecord
  }

  function deleteHistoryRecord(id: string) {
    const records = loadHistoryRecords()
    const filtered = records.filter((record) => record.id !== id)
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(filtered))
    historyRecords.value = filtered
  }

  function getHistoryRecord(id: string): InterviewSessionRecord | null {
    const records = historyRecords.value.length > 0 ? historyRecords.value : loadHistoryRecords()
    return records.find((record) => record.id === id) ?? null
  }

  function init() {
    historyRecords.value = loadHistoryRecords()
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
