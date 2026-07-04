import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { DeliveryPlatform } from '@/services/applicationDelivery'

export type ApplicationStatus = 'watching' | 'ready' | 'applied' | 'interviewing' | 'offer' | 'rejected'
export type ApplicationPriority = 'high' | 'medium' | 'low'

export interface ApplicationTrackerItem {
  jdId: string
  status: ApplicationStatus
  priority: ApplicationPriority
  channel: string
  platform: DeliveryPlatform
  jobUrl: string
  resumeVersionId: string
  greeting: string
  lastDeliveryPackageAt: string
  nextAction: string
  note: string
  appliedAt: string
  updatedAt: string
  createdAt: string
}

export interface ApplicationStatusOption {
  key: ApplicationStatus
  label: string
  description: string
}

export interface ApplicationPriorityOption {
  key: ApplicationPriority
  label: string
}

const STORAGE_KEY = 'prepwise-application-tracker'

export const APPLICATION_STATUS_OPTIONS: ApplicationStatusOption[] = [
  { key: 'watching', label: '关注中', description: '岗位已进入目标池，尚未准备投递' },
  { key: 'ready', label: '待投递', description: '简历和 JD 匹配已准备好' },
  { key: 'applied', label: '已投递', description: '已完成投递，等待反馈' },
  { key: 'interviewing', label: '面试中', description: '已经进入面试流程' },
  { key: 'offer', label: 'Offer', description: '收到正向结果' },
  { key: 'rejected', label: '已结束', description: '流程已结束或暂不推进' },
]

export const APPLICATION_PRIORITY_OPTIONS: ApplicationPriorityOption[] = [
  { key: 'high', label: '高' },
  { key: 'medium', label: '中' },
  { key: 'low', label: '低' },
]

function createDefaultTrackerItem(jdId: string): ApplicationTrackerItem {
  const now = new Date().toISOString()

  return {
    jdId,
    status: 'watching',
    priority: 'medium',
    channel: '',
    platform: 'boss',
    jobUrl: '',
    resumeVersionId: '',
    greeting: '',
    lastDeliveryPackageAt: '',
    nextAction: '',
    note: '',
    appliedAt: '',
    updatedAt: now,
    createdAt: now,
  }
}

function normalizeStatus(value: unknown): ApplicationStatus {
  return APPLICATION_STATUS_OPTIONS.some((item) => item.key === value) ? value as ApplicationStatus : 'watching'
}

function normalizePriority(value: unknown): ApplicationPriority {
  return APPLICATION_PRIORITY_OPTIONS.some((item) => item.key === value) ? value as ApplicationPriority : 'medium'
}

function normalizePlatform(value: unknown): DeliveryPlatform {
  return ['boss', 'lagou', 'liepin', 'official', 'referral', 'other'].includes(value as DeliveryPlatform)
    ? value as DeliveryPlatform
    : 'boss'
}

function normalizeTrackerItem(raw: unknown): ApplicationTrackerItem | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Partial<ApplicationTrackerItem>
  const jdId = typeof item.jdId === 'string' ? item.jdId.trim() : ''
  if (!jdId) return null
  const fallback = createDefaultTrackerItem(jdId)

  return {
    jdId,
    status: normalizeStatus(item.status),
    priority: normalizePriority(item.priority),
    channel: typeof item.channel === 'string' ? item.channel : '',
    platform: normalizePlatform(item.platform),
    jobUrl: typeof item.jobUrl === 'string' ? item.jobUrl : '',
    resumeVersionId: typeof item.resumeVersionId === 'string' ? item.resumeVersionId : '',
    greeting: typeof item.greeting === 'string' ? item.greeting : '',
    lastDeliveryPackageAt: typeof item.lastDeliveryPackageAt === 'string' ? item.lastDeliveryPackageAt : '',
    nextAction: typeof item.nextAction === 'string' ? item.nextAction : '',
    note: typeof item.note === 'string' ? item.note : '',
    appliedAt: typeof item.appliedAt === 'string' ? item.appliedAt : '',
    updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : fallback.updatedAt,
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : fallback.createdAt,
  }
}

export const useApplicationTrackerStore = defineStore('applicationTracker', () => {
  const items = ref<ApplicationTrackerItem[]>([])

  const itemMap = computed(() => new Map(items.value.map((item) => [item.jdId, item])))

  function saveToStorage() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.value))
  }

  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return
      items.value = parsed
        .map((item) => normalizeTrackerItem(item))
        .filter((item): item is ApplicationTrackerItem => Boolean(item))
    } catch {
      console.warn('[ApplicationTracker] 加载失败')
    }
  }

  function getTrackerItem(jdId: string): ApplicationTrackerItem {
    return itemMap.value.get(jdId) ?? createDefaultTrackerItem(jdId)
  }

  function upsertTrackerItem(jdId: string, patch: Partial<Omit<ApplicationTrackerItem, 'jdId' | 'createdAt' | 'updatedAt'>>) {
    const normalizedId = jdId.trim()
    if (!normalizedId) return

    const existingIndex = items.value.findIndex((item) => item.jdId === normalizedId)
    const current = existingIndex >= 0 ? items.value[existingIndex]! : createDefaultTrackerItem(normalizedId)
    const nextStatus = patch.status !== undefined ? normalizeStatus(patch.status) : current.status
    const now = new Date().toISOString()

    const next: ApplicationTrackerItem = {
      ...current,
      ...patch,
      jdId: normalizedId,
      status: nextStatus,
      priority: patch.priority !== undefined ? normalizePriority(patch.priority) : current.priority,
      appliedAt: patch.appliedAt ?? (nextStatus === 'applied' && !current.appliedAt ? now : current.appliedAt),
      updatedAt: now,
    }

    if (existingIndex >= 0) {
      items.value.splice(existingIndex, 1, next)
    } else {
      items.value.unshift(next)
    }

    saveToStorage()
  }

  function removeTrackerItem(jdId: string) {
    items.value = items.value.filter((item) => item.jdId !== jdId)
    saveToStorage()
  }

  loadFromStorage()

  return {
    items,
    itemMap,
    getTrackerItem,
    upsertTrackerItem,
    removeTrackerItem,
  }
})
