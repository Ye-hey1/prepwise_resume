<script setup lang="ts">
import { computed, ref } from 'vue'
import type { JdPrepHistoryItem } from '@/stores/jdAnalysis'

type SortKey = 'time' | 'company' | 'matchScore' | 'practiceCount'

const props = defineProps<{
  items: JdPrepHistoryItem[]
  activeId?: string
}>()

const emit = defineEmits<{
  (e: 'open', id: string): void
  (e: 'delete', id: string): void
  (e: 'clear'): void
}>()

const searchQuery = ref('')
const sortKey = ref<SortKey>('time')

const sortOptions: Array<{ key: SortKey; label: string }> = [
  { key: 'time', label: '时间' },
  { key: 'company', label: '公司' },
  { key: 'matchScore', label: '匹配分' },
  { key: 'practiceCount', label: '演练' },
]

const sortedItems = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  let list = [...props.items]

  // 搜索过滤
  if (q) {
    list = list.filter((item) => {
      const fields = [
        item.company,
        item.position,
        item.jdText,
        item.jdData?.basicInfo?.jobTitle,
        item.jdData?.basicInfo?.company,
      ].filter(Boolean)
      return fields.some((f) => f!.toLowerCase().includes(q))
    })
  }

  // 排序
  list.sort((a, b) => {
    switch (sortKey.value) {
      case 'company':
        return (a.company || '').localeCompare(b.company || '', 'zh-CN')
      case 'matchScore': {
        const sa = a.matchResult?.score?.total ?? -1
        const sb = b.matchResult?.score?.total ?? -1
        return sb - sa
      }
      case 'practiceCount': {
        const pa = a.practiceCount ?? 0
        const pb = b.practiceCount ?? 0
        return pb - pa
      }
      default:
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    }
  })

  return list
})

function formatTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
}

function buildTitle(item: JdPrepHistoryItem): string {
  return item.position || item.jdData?.basicInfo.jobTitle || '未命名岗位'
}

function buildSubtitle(item: JdPrepHistoryItem): string {
  return item.company || item.jdData?.basicInfo.company || '未填写公司'
}

function buildExcerpt(item: JdPrepHistoryItem): string {
  const raw = item.prepInsight?.summary || item.overview?.headline || item.matchResult?.summary || item.jdText
  return raw.length > 56 ? `${raw.slice(0, 56)}...` : raw
}

function buildPracticeMeta(item: JdPrepHistoryItem): string {
  const practiceCount = item.practiceCount ?? 0
  const score = typeof item.lastInterviewScore === 'number' ? `最近得分 ${item.lastInterviewScore}` : ''
  if (practiceCount <= 0) return '未进行面试演练'
  return [`已演练 ${practiceCount} 次`, score].filter(Boolean).join(' · ')
}
</script>

<template>
  <section class="history-panel">
    <!-- 面板外壳（Double-Bezel） -->
    <div class="panel-shell">
      <div class="history-header">
        <div class="header-left">
          <span class="kicker-pill">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            分析记录
          </span>
          <h3 class="history-title">分析历史</h3>
        </div>
        <button v-if="sortedItems.length" class="clear-btn" type="button" @click="emit('clear')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
          清空
        </button>
      </div>

      <!-- 搜索排序工具栏 -->
      <div v-if="props.items.length" class="search-sort-bar">
        <div class="search-wrap">
          <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <input
            v-model="searchQuery"
            type="text"
            class="search-input"
            placeholder="搜索公司、岗位..."
          />
          <button v-if="searchQuery" class="search-clear" type="button" @click="searchQuery = ''">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="sort-chips">
          <button
            v-for="opt in sortOptions"
            :key="opt.key"
            class="sort-chip"
            :class="{ active: sortKey === opt.key }"
            type="button"
            @click="sortKey = opt.key"
          >{{ opt.label }}</button>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-if="!sortedItems.length" class="empty-state">
        <div class="empty-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg>
        </div>
        <p>{{ searchQuery ? '没有找到匹配的分析记录' : '完成一次 Prep 分析后，这里会自动保留最近历史，方便继续查看和复用。' }}</p>
      </div>

      <!-- 历史列表 -->
      <div v-else class="history-list">
        <article
          v-for="(item, index) in sortedItems"
          :key="item.id"
          class="history-item"
          :class="{ active: activeId === item.id }"
          :style="{ '--stagger': index }"
        >
          <button class="history-main" type="button" @click="emit('open', item.id)">
            <div class="title-row">
              <strong>{{ buildTitle(item) }}</strong>
              <span class="time-chip">{{ formatTime(item.updatedAt) }}</span>
            </div>
            <p class="sub-line">{{ buildSubtitle(item) }}</p>
            <p class="excerpt">{{ buildExcerpt(item) }}</p>
            <p class="practice-line">{{ buildPracticeMeta(item) }}</p>
          </button>
          <button class="delete-btn" type="button" title="删除此记录" @click="emit('delete', item.id)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
          </button>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
@keyframes fadeSlideUp {
  from { opacity: 0; transform: translateY(12px); filter: blur(3px); }
  to { opacity: 1; transform: translateY(0); filter: blur(0); }
}

/* ═══ 面板外壳（Double-Bezel） ═══ */
.history-panel {
  padding: 6px;
  border-radius: 22px;
  background: var(--bg-card-muted);
  border: 1px solid var(--border-color);
}

.panel-shell {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  border-radius: 18px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.12);
}

/* ═══ 头部 ═══ */
.history-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.header-left {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.kicker-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 24px;
  padding: 0 10px;
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--primary-500) 6%, var(--bg-card));
  border: 1px solid color-mix(in srgb, var(--primary-500) 12%, transparent);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.1);
  color: var(--primary-600);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  width: fit-content;
}

.kicker-pill svg {
  opacity: 0.6;
}

.history-title {
  margin: 8px 0 0;
  font-size: 17px;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: -0.02em;
}

/* ═══ 清空按钮 ═══ */
.clear-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 30px;
  padding: 0 10px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.clear-btn svg {
  opacity: 0.5;
}

.clear-btn:hover {
  border-color: color-mix(in srgb, var(--accent-red) 25%, transparent);
  color: var(--accent-red);
  background: color-mix(in srgb, var(--accent-red) 4%, var(--bg-card));
}

/* ═══ 空状态 ═══ */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 32px 20px;
  text-align: center;
}

/* ═══ 搜索排序工具栏 ═══ */
.search-sort-bar {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.search-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 10px;
  color: var(--text-muted);
  pointer-events: none;
}

.search-input {
  width: 100%;
  height: 36px;
  padding: 0 32px 0 32px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card-muted);
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s;
}

.search-input::placeholder {
  color: var(--text-muted);
}

.search-input:focus {
  border-color: color-mix(in srgb, var(--primary-500) 40%, var(--border-color));
}

.search-clear {
  position: absolute;
  right: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.search-clear:hover {
  background: var(--bg-hover);
  color: var(--text-secondary);
}

.sort-chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.sort-chip {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.sort-chip:hover {
  border-color: color-mix(in srgb, var(--primary-500) 25%, var(--border-color));
  color: var(--text-secondary);
}

.sort-chip.active {
  background: color-mix(in srgb, var(--primary-500) 10%, var(--bg-card));
  border-color: color-mix(in srgb, var(--primary-500) 24%, transparent);
  color: var(--primary-600);
}

.empty-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 16px;
  background: var(--bg-card-muted);
  border: 1px solid var(--border-color);
  color: var(--text-muted);
}

.empty-state p {
  margin: 0;
  font-size: 13px;
  line-height: 1.75;
  color: var(--text-muted);
  max-width: 32ch;
}

/* ═══ 列表 ═══ */
.history-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* ═══ 历史项（左侧竖线标记 + 悬浮效果） ═══ */
.history-item {
  display: flex;
  gap: 0;
  align-items: stretch;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  animation: fadeSlideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) backwards;
  animation-delay: calc(var(--stagger, 0) * 60ms);
}

.history-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.05);
  border-color: color-mix(in srgb, var(--primary-500) 18%, transparent);
}

.history-item.active {
  border-color: color-mix(in srgb, var(--primary-500) 28%, transparent);
  box-shadow: 0 6px 20px color-mix(in srgb, var(--primary-500) 10%, transparent);
}

/* ═══ 主内容按钮 ═══ */
.history-main {
  flex: 1;
  text-align: left;
  padding: 14px 16px;
  /* 左侧强调竖线 */
  border-left: 3px solid transparent;
  background: transparent;
  border-top: none;
  border-right: none;
  border-bottom: none;
  cursor: pointer;
  transition: border-color 0.2s;
}

.history-item.active .history-main {
  border-left-color: var(--primary-500);
}

.history-item:hover .history-main {
  border-left-color: color-mix(in srgb, var(--primary-500) 40%, transparent);
}

.title-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
}

.title-row strong {
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-primary);
  letter-spacing: -0.01em;
}

.time-chip {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.sub-line {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--primary-600);
  font-weight: 700;
}

.excerpt {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-secondary);
}
.practice-line {
  margin: 8px 0 0;
  font-size: 11px;
  line-height: 1.6;
  color: var(--text-muted);
}

/* ═══ 删除按钮（默认半隐藏，hover 浮出） ═══ */
.delete-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  border: none;
  border-left: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  opacity: 0;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.history-item:hover .delete-btn {
  opacity: 1;
}

.delete-btn:hover {
  background: color-mix(in srgb, var(--accent-red) 6%, var(--bg-card));
  color: var(--accent-red);
}
</style>
