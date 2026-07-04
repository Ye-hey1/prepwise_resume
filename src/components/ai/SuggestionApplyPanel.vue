<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ResumeAssistantApplyItem } from '@/services/types/resumeAssistant'
import DiffView from '@/components/common/DiffView.vue'

const props = defineProps<{
  items: ResumeAssistantApplyItem[]
  busy?: boolean
  error?: string
}>()

const emit = defineEmits<{
  applyItem: [item: ResumeAssistantApplyItem]
  applyAll: []
  dismissItem: [id: string]
  refresh: []
}>()

const selectedCategory = ref<string>('all')
const selectedSeverity = ref<string>('all')

const categories = [
  { id: 'all', label: '全部' },
  { id: 'grammar', label: '语法' },
  { id: 'content', label: '内容' },
  { id: 'structure', label: '结构' },
  { id: 'formatting', label: '格式' },
]

const severities = [
  { id: 'all', label: '全部优先级' },
  { id: 'high', label: '高' },
  { id: 'medium', label: '中' },
  { id: 'low', label: '低' },
]

const filteredItems = computed(() => {
  return props.items.filter(item => {
    if (selectedCategory.value !== 'all' && item.category !== selectedCategory.value) return false
    if (selectedSeverity.value !== 'all' && item.severity !== selectedSeverity.value) return false
    return !item.applied
  })
})

const stats = computed(() => {
  const total = props.items.length
  const applied = props.items.filter(i => i.applied).length
  const pending = total - applied
  const bySeverity = {
    high: props.items.filter(i => i.severity === 'high' && !i.applied).length,
    medium: props.items.filter(i => i.severity === 'medium' && !i.applied).length,
    low: props.items.filter(i => i.severity === 'low' && !i.applied).length,
  }
  return { total, applied, pending, bySeverity }
})

function applyItem(item: ResumeAssistantApplyItem) {
  emit('applyItem', item)
}

function applyAll() {
  emit('applyAll')
}

function dismissItem(id: string) {
  emit('dismissItem', id)
}

function getSeverityColor(severity?: string) {
  switch (severity) {
    case 'high': return 'var(--accent-red)'
    case 'medium': return 'var(--accent-orange)'
    case 'low': return 'var(--accent-blue-500)'
    default: return 'var(--text-muted)'
  }
}

function getCategoryIcon(category?: string) {
  switch (category) {
    case 'grammar': return '📝'
    case 'content': return '💡'
    case 'structure': return '🏗️'
    case 'formatting': return '✨'
    default: return '📋'
  }
}
</script>

<template>
  <div class="suggestion-apply-panel">
    <div class="panel-header">
      <div class="header-title">
        <h3>AI 优化建议</h3>
        <span class="stats-badge">{{ stats.pending }} 条待处理</span>
      </div>
      <div class="header-actions">
        <button
          v-if="stats.pending > 0"
          type="button"
          class="apply-all-btn"
          @click="applyAll"
        >
          全部应用 ({{ stats.pending }})
        </button>
        <button
          type="button"
          class="refresh-btn"
          :disabled="busy"
          @click="emit('refresh')"
        >
          {{ busy ? '分析中...' : '重新分析' }}
        </button>
      </div>
    </div>

    <div class="filter-bar">
      <div class="filter-group">
        <span class="filter-label">分类：</span>
        <button
          v-for="cat in categories"
          :key="cat.id"
          type="button"
          class="filter-chip"
          :class="{ active: selectedCategory === cat.id }"
          @click="selectedCategory = cat.id"
        >
          {{ cat.label }}
        </button>
      </div>
      <div class="filter-group">
        <span class="filter-label">优先级：</span>
        <button
          v-for="sev in severities"
          :key="sev.id"
          type="button"
          class="filter-chip severity"
          :class="{ active: selectedSeverity === sev.id }"
          @click="selectedSeverity = sev.id"
        >
          {{ sev.label }}
        </button>
      </div>
    </div>

    <div v-if="error" class="error-banner">{{ error }}</div>

    <div v-if="busy" class="loading-state">
      <div class="spinner"></div>
      <p>AI 正在分析您的简历...</p>
    </div>

    <div v-else-if="filteredItems.length === 0" class="empty-state">
      <div class="empty-icon">🎉</div>
      <p>{{ items.length === 0 ? '点击"重新分析"获取 AI 优化建议' : '所有建议已处理完毕' }}</p>
    </div>

    <div v-else class="suggestion-list">
      <div
        v-for="item in filteredItems"
        :key="item.id"
        class="suggestion-card"
        :class="{ applied: item.applied }"
      >
        <div class="card-header">
          <div class="card-meta">
            <span class="category-icon">{{ getCategoryIcon(item.category) }}</span>
            <span
              class="severity-badge"
              :style="{ color: getSeverityColor(item.severity) }"
            >
              {{ item.severity === 'high' ? '高' : item.severity === 'medium' ? '中' : '低' }}
            </span>
          </div>
          <button
            type="button"
            class="dismiss-btn"
            @click="dismissItem(item.id)"
          >
            忽略
          </button>
        </div>

        <div class="card-body">
          <DiffView
            :original="item.original"
            :suggested="item.suggested"
          />

          <div class="reason-section">
            <span class="reason-label">💡 原因：</span>
            <p class="reason-text">{{ item.reason }}</p>
          </div>
        </div>

        <div class="card-actions">
          <button
            type="button"
            class="apply-btn"
            @click="applyItem(item)"
          >
            应用此修改
          </button>
          <button
            type="button"
            class="skip-btn"
            @click="dismissItem(item.id)"
          >
            跳过
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.suggestion-apply-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  background: var(--bg-card);
  border-radius: 16px;
  max-height: 700px;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-color);
}

.header-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-title h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}

.stats-badge {
  padding: 4px 10px;
  background: var(--accent-blue-500);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  border-radius: 999px;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.apply-all-btn,
.refresh-btn {
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.apply-all-btn {
  background: var(--accent-green);
  color: #fff;
  border: none;
}

.apply-all-btn:hover {
  background: var(--accent-green-dark, #1a8f5a);
}

.refresh-btn {
  background: var(--bg-card-muted);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
}

.refresh-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.filter-bar {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

.filter-chip {
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  background: var(--bg-card-muted);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.filter-chip:hover {
  border-color: var(--accent-blue-500);
  color: var(--accent-blue-500);
}

.filter-chip.active {
  background: var(--accent-blue-500);
  color: #fff;
  border-color: var(--accent-blue-500);
}

.filter-chip.severity.active {
  background: var(--accent-orange);
  border-color: var(--accent-orange);
}

.error-banner {
  padding: 12px;
  background: color-mix(in srgb, var(--accent-red) 10%, var(--bg-card));
  border: 1px solid color-mix(in srgb, var(--accent-red) 30%, var(--bg-card));
  border-radius: 8px;
  color: var(--accent-red);
  font-size: 13px;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  gap: 16px;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border-color);
  border-top-color: var(--accent-blue-500);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-state p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  gap: 12px;
}

.empty-icon {
  font-size: 48px;
}

.empty-state p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.suggestion-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  padding-right: 4px;
}

.suggestion-list::-webkit-scrollbar {
  width: 6px;
}

.suggestion-list::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 3px;
}

.suggestion-card {
  padding: 16px;
  background: var(--bg-card-muted);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  transition: all 0.2s ease;
}

.suggestion-card.applied {
  opacity: 0.6;
  background: color-mix(in srgb, var(--accent-green) 5%, var(--bg-card-muted));
  border-color: var(--accent-green);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.card-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.category-icon {
  font-size: 16px;
}

.severity-badge {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}

.dismiss-btn {
  padding: 4px 8px;
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
  transition: color 0.2s ease;
}

.dismiss-btn:hover {
  color: var(--text-secondary);
}

.card-body {
  margin-bottom: 12px;
}

.reason-section {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  padding: 10px;
  background: color-mix(in srgb, var(--accent-blue-500) 8%, var(--bg-card));
  border-radius: 8px;
}

.reason-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--accent-blue-600);
  white-space: nowrap;
}

.reason-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-primary);
}

.card-actions {
  display: flex;
  gap: 8px;
}

.apply-btn,
.skip-btn {
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.apply-btn {
  background: var(--accent-blue-500);
  color: #fff;
  border: none;
  flex: 1;
}

.apply-btn:hover {
  background: var(--accent-blue-600);
}

.skip-btn {
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
}

.skip-btn:hover {
  border-color: var(--text-muted);
  color: var(--text-primary);
}

@media (max-width: 768px) {
  .suggestion-apply-panel {
    padding: 16px;
    max-height: none;
  }

  .panel-header {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }

  .header-actions {
    justify-content: stretch;
  }

  .apply-all-btn,
  .refresh-btn {
    flex: 1;
  }

  .filter-bar {
    flex-direction: column;
    gap: 8px;
  }
}
</style>
