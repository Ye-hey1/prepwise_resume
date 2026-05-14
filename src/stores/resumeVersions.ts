/**
 * 多简历版本管理 Store
 * 支持多份简历、快照历史、版本切换
 */
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useResumeStore } from './resume'
import { dbPut, dbGet, dbDelete, isIndexedDBAvailable } from '@/utils/storage'
import { toast } from '@/utils/toast'

export interface ResumeVersion {
  id: string
  name: string
  targetJob: string
  createdAt: string
  updatedAt: string
  isActive: boolean
}

export interface ResumeSnapshotItem {
  id: string
  resumeId: string
  label: string
  data: Record<string, unknown>
  createdAt: string
}

const STORAGE_KEY = 'prepwise-resume-versions'
const MAX_SNAPSHOTS_PER_RESUME = 20

let idCounter = 0
function genVersionId(): string {
  return `resume_${Date.now()}_${++idCounter}`
}

function genSnapshotId(): string {
  return `snap_${Date.now()}_${++idCounter}`
}

export const useResumeVersionsStore = defineStore('resumeVersions', () => {
  const versions = ref<ResumeVersion[]>([])
  const snapshots = ref<ResumeSnapshotItem[]>([])
  const activeVersionId = ref<string>('')

  const activeVersion = computed(() =>
    versions.value.find(v => v.id === activeVersionId.value) ?? versions.value[0] ?? null,
  )

  const sortedVersions = computed(() =>
    [...versions.value].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
  )

  function getSnapshotsForVersion(resumeId: string): ResumeSnapshotItem[] {
    return snapshots.value
      .filter(s => s.resumeId === resumeId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }

  /** 创建新简历版本 */
  function createVersion(name: string, targetJob = ''): string {
    const id = genVersionId()
    const now = new Date().toISOString()

    const version: ResumeVersion = {
      id,
      name: name.trim() || '未命名简历',
      targetJob: targetJob.trim(),
      createdAt: now,
      updatedAt: now,
      isActive: false,
    }

    versions.value.push(version)
    saveToStorage()
    return id
  }

  /** 切换活跃简历版本 */
  async function switchVersion(versionId: string) {
    const target = versions.value.find(v => v.id === versionId)
    if (!target) return

    const resumeStore = useResumeStore()

    // 保存当前版本数据
    if (activeVersionId.value) {
      const currentData = resumeStore.exportToJSON()
      await saveVersionData(activeVersionId.value, currentData)
    }

    // 加载目标版本数据
    const targetData = await loadVersionData(versionId)
    if (targetData) {
      resumeStore.clearAllData()
      resumeStore.importData(targetData as Parameters<typeof resumeStore.importData>[0])
    }

    // 更新活跃状态
    versions.value.forEach(v => { v.isActive = v.id === versionId })
    activeVersionId.value = versionId
    saveToStorage()

    toast.success(`已切换到「${target.name}」`)
  }

  /** 重命名版本 */
  function renameVersion(versionId: string, newName: string) {
    const version = versions.value.find(v => v.id === versionId)
    if (!version) return
    version.name = newName.trim() || '未命名简历'
    version.updatedAt = new Date().toISOString()
    saveToStorage()
  }

  /** 删除版本 */
  async function deleteVersion(versionId: string) {
    if (versions.value.length <= 1) {
      toast.warning('至少保留一份简历')
      return
    }

    const index = versions.value.findIndex(v => v.id === versionId)
    if (index < 0) return

    const deletedVersion = versions.value[index]
    versions.value.splice(index, 1)

    // 删除关联快照
    snapshots.value = snapshots.value.filter(s => s.resumeId !== versionId)

    // 如果删除的是当前活跃版本，切换到第一个
    if (activeVersionId.value === versionId && versions.value.length > 0) {
      await switchVersion(versions.value[0]!.id)
    }

    // 清理 IndexedDB
    if (isIndexedDBAvailable()) {
      await dbDelete('resumes', versionId)
    }

    saveToStorage()
    toast.info(`已删除「${deletedVersion?.name ?? ''}」`)
  }

  /** 复制版本 */
  async function duplicateVersion(versionId: string): Promise<string> {
    const source = versions.value.find(v => v.id === versionId)
    if (!source) return ''

    const newId = createVersion(`${source.name} (副本)`, source.targetJob)

    // 复制数据
    const sourceData = await loadVersionData(versionId)
    if (sourceData) {
      await saveVersionData(newId, sourceData)
    }

    toast.success('简历已复制')
    return newId
  }

  /** 创建快照 */
  function createSnapshot(resumeId: string, label?: string): string {
    const resumeStore = useResumeStore()
    const id = genSnapshotId()
    const now = new Date().toISOString()

    const snapshot: ResumeSnapshotItem = {
      id,
      resumeId,
      label: label?.trim() || `快照 ${new Date().toLocaleString('zh-CN')}`,
      data: resumeStore.exportToJSON(),
      createdAt: now,
    }

    snapshots.value.push(snapshot)

    // 限制每个简历的快照数量
    const versionSnapshots = snapshots.value.filter(s => s.resumeId === resumeId)
    if (versionSnapshots.length > MAX_SNAPSHOTS_PER_RESUME) {
      const oldest = versionSnapshots
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        .slice(0, versionSnapshots.length - MAX_SNAPSHOTS_PER_RESUME)
      const oldestIds = new Set(oldest.map(s => s.id))
      snapshots.value = snapshots.value.filter(s => !oldestIds.has(s.id))
    }

    saveToStorage()
    toast.success('快照已保存')
    return id
  }

  /** 恢复快照 */
  function restoreSnapshot(snapshotId: string) {
    const snapshot = snapshots.value.find(s => s.id === snapshotId)
    if (!snapshot) return

    const resumeStore = useResumeStore()

    // 恢复前先创建当前状态的快照
    createSnapshot(snapshot.resumeId, '恢复前自动备份')

    // 恢复数据
    resumeStore.clearAllData()
    resumeStore.importData(snapshot.data as Parameters<typeof resumeStore.importData>[0])

    toast.success(`已恢复到「${snapshot.label}」`)
  }

  /** 删除快照 */
  function deleteSnapshot(snapshotId: string) {
    snapshots.value = snapshots.value.filter(s => s.id !== snapshotId)
    saveToStorage()
  }

  // ── 数据持久化 ──

  async function saveVersionData(versionId: string, data: unknown) {
    if (isIndexedDBAvailable()) {
      await dbPut('resumes', versionId, data)
    }
    // 同时更新 localStorage 中的版本时间戳
    const version = versions.value.find(v => v.id === versionId)
    if (version) {
      version.updatedAt = new Date().toISOString()
    }
  }

  async function loadVersionData(versionId: string): Promise<unknown> {
    if (isIndexedDBAvailable()) {
      return await dbGet('resumes', versionId)
    }
    return null
  }

  function saveToStorage() {
    const data = {
      versions: versions.value,
      snapshots: snapshots.value,
      activeVersionId: activeVersionId.value,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }

  function loadFromStorage() {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      try {
        const data = JSON.parse(raw)
        if (Array.isArray(data.versions)) versions.value = data.versions
        if (Array.isArray(data.snapshots)) snapshots.value = data.snapshots
        if (data.activeVersionId) activeVersionId.value = data.activeVersionId
      } catch {
        console.warn('[ResumeVersions] 加载失败')
      }
    }

    // 确保至少有一个默认版本
    if (versions.value.length === 0) {
      const defaultId = createVersion('默认简历')
      activeVersionId.value = defaultId
      versions.value[0]!.isActive = true
    }

    if (!activeVersionId.value && versions.value.length > 0) {
      activeVersionId.value = versions.value[0]!.id
      versions.value[0]!.isActive = true
    }
  }

  loadFromStorage()

  watch([versions, activeVersionId], () => saveToStorage(), { deep: true })

  return {
    versions,
    snapshots,
    activeVersionId,
    activeVersion,
    sortedVersions,
    getSnapshotsForVersion,
    createVersion,
    switchVersion,
    renameVersion,
    deleteVersion,
    duplicateVersion,
    createSnapshot,
    restoreSnapshot,
    deleteSnapshot,
    saveVersionData,
    loadVersionData,
  }
})
