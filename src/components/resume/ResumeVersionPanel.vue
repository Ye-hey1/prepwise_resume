<script setup lang="ts">
/**
 * 简历版本管理面板
 * 支持多简历切换、创建、删除、快照管理
 */
import { ref, computed } from 'vue'
import { useResumeVersionsStore } from '@/stores/resumeVersions'

const emit = defineEmits<{
  (e: 'close'): void
}>()

const versionsStore = useResumeVersionsStore()

const activeTab = ref<'versions' | 'snapshots'>('versions')
const showCreateForm = ref(false)
const newVersionName = ref('')
const newVersionJob = ref('')

const currentSnapshots = computed(() =>
  versionsStore.getSnapshotsForVersion(versionsStore.activeVersionId),
)

async function handleCreate() {
  if (!newVersionName.value.trim()) return
  const id = versionsStore.createVersion(newVersionName.value, newVersionJob.value)
  newVersionName.value = ''
  newVersionJob.value = ''
  showCreateForm.value = false
  await versionsStore.switchVersion(id)
}

async function handleSwitch(versionId: string) {
  if (versionId === versionsStore.activeVersionId) return
  await versionsStore.switchVersion(versionId)
}

async function handleDelete(versionId: string) {
  if (!window.confirm('确定删除此简历版本？关联的快照也将被删除。')) return
  await versionsStore.deleteVersion(versionId)
}

async function handleDuplicate(versionId: string) {
  await versionsStore.duplicateVersion(versionId)
}

function handleCreateSnapshot() {
  versionsStore.createSnapshot(versionsStore.activeVersionId)
}

function handleRestoreSnapshot(snapshotId: string) {
  if (!window.confirm('恢复快照将覆盖当前内容（会自动创建备份），是否继续？')) return
  versionsStore.restoreSnapshot(snapshotId)
}

function handleDeleteSnapshot(snapshotId: string) {
  versionsStore.deleteSnapshot(snapshotId)
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<template>
  <div class="version-panel-overlay" @click.self="emit('close')">
    <div class="version-panel">
      <header class="panel-header">
        <h3 class="panel-title">简历版本管理</h3>
        <button class="panel-close" type="button" @click="emit('close')" aria-label="关闭">
          <svg viewBox="0 0 24 24" fill="none"><path d="M6 18L18 6M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
        </button>
      </header>

      <!-- Tab 切换 -->
      <div class="panel-tabs">
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'versions' }"
          @click="activeTab = 'versions'"
        >
          简历列表
        </button>
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'snapshots' }"
          @click="activeTab = 'snapshots'"
        >
          历史快照 ({{ currentSnapshots.length }})
        </button>
      </div>

      <!-- 简历列表 -->
      <div v-if="activeTab === 'versions'" class="panel-body">
        <div class="version-list">
          <div
            v-for="version in versionsStore.sortedVersions"
            :key="version.id"
            class="version-card"
            :class="{ 'version-card--active': version.id === versionsStore.activeVersionId }"
          >
            <div class="version-info" @click="handleSwitch(version.id)">
              <span class="version-name">{{ version.name }}</span>
              <span v-if="version.targetJob" class="version-job">{{ version.targetJob }}</span>
              <span class="version-time">更新于 {{ formatDate(version.updatedAt) }}</span>
            </div>
            <div class="version-actions">
              <button
                class="action-btn"
                title="复制"
                @click.stop="handleDuplicate(version.id)"
              >
                <svg viewBox="0 0 24 24" fill="none"><path d="M8 4H6a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2v-2M16 4h2a2 2 0 012 2v12a2 2 0 01-2 2h-8a2 2 0 01-2-2V6a2 2 0 012-2h8z" stroke="currentColor" stroke-width="1.5" /></svg>
              </button>
              <button
                class="action-btn action-btn--danger"
                title="删除"
                :disabled="versionsStore.versions.length <= 1"
                @click.stop="handleDelete(version.id)"
              >
                <svg viewBox="0 0 24 24" fill="none"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
              </button>
            </div>
          </div>
        </div>

        <!-- 创建新版本 -->
        <div v-if="showCreateForm" class="create-form">
          <input
            v-model="newVersionName"
            class="form-input"
            placeholder="简历名称（如：前端开发-字节）"
            @keyup.enter="handleCreate"
          />
          <input
            v-model="newVersionJob"
            class="form-input"
            placeholder="目标岗位（可选）"
            @keyup.enter="handleCreate"
          />
          <div class="form-actions">
            <button class="btn btn--secondary" @click="showCreateForm = false">取消</button>
            <button class="btn btn--primary" :disabled="!newVersionName.trim()" @click="handleCreate">创建</button>
          </div>
        </div>

        <button
          v-else
          class="add-version-btn"
          @click="showCreateForm = true"
        >
          + 新建简历版本
        </button>
      </div>

      <!-- 快照列表 -->
      <div v-if="activeTab === 'snapshots'" class="panel-body">
        <button class="snapshot-create-btn" @click="handleCreateSnapshot">
          保存当前状态为快照
        </button>

        <div v-if="currentSnapshots.length === 0" class="empty-state">
          <p>暂无快照记录</p>
          <p class="empty-hint">手动保存时会自动创建快照，也可以点击上方按钮手动创建</p>
        </div>

        <div v-else class="snapshot-list">
          <div
            v-for="snapshot in currentSnapshots"
            :key="snapshot.id"
            class="snapshot-card"
          >
            <div class="snapshot-info">
              <span class="snapshot-label">{{ snapshot.label }}</span>
              <span class="snapshot-time">{{ formatDate(snapshot.createdAt) }}</span>
            </div>
            <div class="snapshot-actions">
              <button class="action-btn" title="恢复" @click="handleRestoreSnapshot(snapshot.id)">
                <svg viewBox="0 0 24 24" fill="none"><path d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /><path d="M3 3v5h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
              </button>
              <button class="action-btn action-btn--danger" title="删除" @click="handleDeleteSnapshot(snapshot.id)">
                <svg viewBox="0 0 24 24" fill="none"><path d="M6 18L18 6M6 6l12 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.version-panel-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal, 1000);
  background: var(--bg-overlay, rgba(17, 24, 40, 0.28));
  display: flex;
  align-items: center;
  justify-content: center;
}

.version-panel {
  width: 480px;
  max-width: 90vw;
  max-height: 80vh;
  background: var(--bg-elevated, #fff);
  border-radius: var(--radius-xl, 22px);
  box-shadow: var(--shadow-xl);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 12px;
}

.panel-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.panel-close {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.panel-close:hover { color: var(--text-primary); background: var(--bg-hover); }
.panel-close svg { width: 16px; height: 16px; }

.panel-tabs {
  display: flex;
  gap: 4px;
  padding: 0 24px;
  border-bottom: 1px solid var(--border-color);
}

.tab-btn {
  padding: 10px 16px;
  border: none;
  background: transparent;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: all 0.2s ease;
}

.tab-btn:hover { color: var(--text-primary); }
.tab-btn.active { color: var(--accent-info); border-bottom-color: var(--accent-info); }

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 24px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.version-list, .snapshot-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.version-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.version-card:hover { border-color: var(--accent-info); background: var(--bg-hover); }
.version-card--active { border-color: rgba(43, 123, 184, 0.3); background: color-mix(in srgb, var(--accent-info) 6%, transparent); }

.version-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.version-name { font-size: 13px; font-weight: 700; color: var(--text-primary); }
.version-job { font-size: 11px; color: var(--text-secondary); }
.version-time { font-size: 11px; color: var(--text-muted); }

.version-actions, .snapshot-actions {
  display: flex;
  gap: 4px;
}

.action-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.action-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
.action-btn--danger:hover { color: var(--accent-red); }
.action-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.action-btn svg { width: 15px; height: 15px; }

.create-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card-muted);
}

.form-input {
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  font-size: 13px;
  background: var(--bg-input);
  color: var(--text-primary);
  outline: none;
}

.form-input:focus { border-color: var(--accent-info); }

.form-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.btn {
  padding: 6px 14px;
  border: none;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.btn--primary { background: var(--accent-info); color: #fff; }
.btn--primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn--secondary { background: var(--bg-hover); color: var(--text-secondary); }

.add-version-btn {
  width: 100%;
  padding: 12px;
  border: 1px dashed var(--border-color);
  border-radius: 12px;
  background: transparent;
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.add-version-btn:hover { border-color: var(--accent-info); color: var(--accent-info); }

.snapshot-create-btn {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card-muted);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.snapshot-create-btn:hover { border-color: var(--accent-info); color: var(--accent-info); }

.snapshot-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
}

.snapshot-info { display: flex; flex-direction: column; gap: 2px; }
.snapshot-label { font-size: 12px; font-weight: 600; color: var(--text-primary); }
.snapshot-time { font-size: 11px; color: var(--text-muted); }

.empty-state {
  text-align: center;
  padding: 24px;
  color: var(--text-muted);
}

.empty-state p { margin: 0; font-size: 13px; }
.empty-hint { font-size: 11px; margin-top: 4px; }
</style>
