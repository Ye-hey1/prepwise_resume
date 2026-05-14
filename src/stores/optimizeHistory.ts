/**
 * AI 优化历史记录 Store
 * 持久化每次优化的结果，支持回溯和重新应用
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface OptimizeHistoryItem {
  id: string
  moduleKey: string
  moduleLabel: string
  fieldKey?: string
  version: string
  originalText: string
  optimizedText: string
  suggestions: string
  timestamp: string
  applied: boolean
}

const STORAGE_KEY = 'prepwise-optimize-history'
const MAX_HISTORY_ITEMS = 50

export const useOptimizeHistoryStore = defineStore('optimizeHistory', () => {
  const items = ref<OptimizeHistoryItem[]>([])

  const recentItems = computed(() => items.value.slice(0, 20))

  function addRecord(record: Omit<OptimizeHistoryItem, 'id' | 'timestamp'>) {
    const id = `opt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    items.value.unshift({
      ...record,
      id,
      timestamp: new Date().toISOString(),
    })

    if (items.value.length > MAX_HISTORY_ITEMS) {
      items.value.splice(MAX_HISTORY_ITEMS)
    }

    saveToStorage()
  }

  function markApplied(id: string) {
    const item = items.value.find(i => i.id === id)
    if (item) {
      item.applied = true
      saveToStorage()
    }
  }

  function getHistoryForModule(moduleKey: string): OptimizeHistoryItem[] {
    return items.value.filter(i => i.moduleKey === moduleKey)
  }

  function deleteRecord(id: string) {
    items.value = items.value.filter(i => i.id !== id)
    saveToStorage()
  }

  function clearAll() {
    items.value = []
    saveToStorage()
  }

  function saveToStorage() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.value))
  }

  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        items.value = JSON.parse(raw)
      }
    } catch {
      console.warn('[OptimizeHistory] 加载失败')
    }
  }

  loadFromStorage()

  return {
    items,
    recentItems,
    addRecord,
    markApplied,
    getHistoryForModule,
    deleteRecord,
    clearAll,
  }
})
