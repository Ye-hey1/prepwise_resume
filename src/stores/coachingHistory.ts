import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase, hasSupabaseConfig } from '@/lib/supabaseClient'
import type { CoachingRecord } from '@/components/ai/interview/types'

const LOCAL_STORAGE_KEY = 'prepwise-coaching-history'

function loadFromLocal(): CoachingRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY)
    if (!raw) return []
    const data = JSON.parse(raw)
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

function saveToLocal(records: CoachingRecord[]) {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(records))
}

export const useCoachingHistoryStore = defineStore('coachingHistory', () => {
  const records = ref<CoachingRecord[]>([])
  const isLoading = ref(false)
  const isLocalMode = ref(false)

  const latestRecord = computed(() => records.value[0] || null)

  // ── 初始化 / 加载 ──

  async function init() {
    if (!supabase || !hasSupabaseConfig) {
      isLocalMode.value = true
      records.value = loadFromLocal()
      return
    }

    isLoading.value = true
    try {
      const { data, error } = await supabase
        .from('coaching_history')
        .select('*')
        .order('date', { ascending: false })
        .limit(20)

      if (error) throw error
      records.value = (data || []).map(normalizeRow)
    } catch (err) {
      console.warn('[CoachingHistory] Supabase 不可用，降级到本地存储:', err)
      isLocalMode.value = true
      records.value = loadFromLocal()
    } finally {
      isLoading.value = false
    }
  }

  // ── 保存记录 ──

  async function saveRecord(record: CoachingRecord) {
    // 本地模式
    if (isLocalMode.value || !supabase) {
      records.value.unshift(record)
      if (records.value.length > 20) records.value = records.value.slice(0, 20)
      saveToLocal(records.value)
      return
    }

    try {
      const payload = {
        id: record.id,
        date: record.date,
        target_role: record.targetRole,
        total_rounds: record.totalRounds,
        rounds: record.rounds,
        technique_summary: record.techniqueSummary,
        final_summary: record.finalSummary,
      }

      const { error } = await supabase.from('coaching_history').insert([payload])
      if (error) throw error

      records.value.unshift(record)
      if (records.value.length > 20) records.value = records.value.slice(0, 20)
    } catch (err) {
      console.warn('[CoachingHistory] 云端保存失败，降级到本地:', err)
      isLocalMode.value = true
      records.value.unshift(record)
      if (records.value.length > 20) records.value = records.value.slice(0, 20)
      saveToLocal(records.value)
    }
  }

  // ── 获取指定记录 ──

  function getRecord(id: string): CoachingRecord | null {
    return records.value.find(r => r.id === id) || null
  }

  // ── 删除记录 ──

  async function deleteRecord(id: string) {
    if (isLocalMode.value || !supabase) {
      records.value = records.value.filter(r => r.id !== id)
      saveToLocal(records.value)
      return
    }

    try {
      const { error } = await supabase.from('coaching_history').delete().eq('id', id)
      if (error) throw error
      records.value = records.value.filter(r => r.id !== id)
    } catch (err) {
      console.warn('[CoachingHistory] 云端删除失败:', err)
      records.value = records.value.filter(r => r.id !== id)
      saveToLocal(records.value)
    }
  }

  // ── 工具函数 ──

  /** 将 Supabase 行数据转为前端类型 */
  function normalizeRow(row: any): CoachingRecord {
    return {
      id: row.id,
      date: row.date,
      targetRole: row.target_role || '',
      totalRounds: row.total_rounds || 0,
      rounds: Array.isArray(row.rounds) ? row.rounds : [],
      techniqueSummary: Array.isArray(row.technique_summary) ? row.technique_summary : [],
      finalSummary: row.final_summary || '',
    }
  }

  return {
    records,
    isLoading,
    isLocalMode,
    latestRecord,
    init,
    saveRecord,
    getRecord,
    deleteRecord,
  }
})
