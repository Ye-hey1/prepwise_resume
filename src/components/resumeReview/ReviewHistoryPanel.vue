<script setup lang="ts">
import type { ResumeReviewHistoryItem } from '@/stores/resumeReview'

defineProps<{
  history: ResumeReviewHistoryItem[]
  activeId: string
}>()

const emit = defineEmits<{
  (e: 'open', id: string): void
}>()

function roleFamilyLabel(roleFamily: ResumeReviewHistoryItem['roleFamily']): string {
  return roleFamily === 'technical' ? '技术岗' : '通用岗'
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '时间未知'

  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}
</script>

<template>
  <aside class="review-history-panel">
    <header class="history-head">
      <h3>审查历史</h3>
      <span>{{ history.length }} / 12</span>
    </header>

    <div v-if="history.length" class="history-list">
      <button
        v-for="item in history"
        :key="item.id"
        class="history-item"
        :class="{ active: activeId === item.id }"
        :aria-current="activeId === item.id ? 'true' : undefined"
        type="button"
        @click="emit('open', item.id)"
      >
        <span class="item-time">{{ formatDate(item.generatedAt) }}</span>
        <span class="item-title">{{ item.targetRole || '未命名岗位' }}</span>
        <span class="item-family">{{ roleFamilyLabel(item.roleFamily) }}</span>

        <span class="score-line">
          <span>综合 {{ item.result.overallScore }}</span>
          <span>通用 {{ item.result.generalScore }}</span>
          <span v-if="item.result.jdFitScore != null">JD {{ item.result.jdFitScore }}</span>
        </span>
      </button>
    </div>

    <p v-else class="empty-text">暂无审查历史</p>
  </aside>
</template>

<style scoped>
.review-history-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  min-height: 0;
  height: 100%;
  padding: 14px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
}

.history-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.history-head h3 {
  margin: 0;
  min-width: 0;
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 800;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.history-head span {
  flex: 0 0 auto;
  min-height: 24px;
  padding: 2px 8px;
  border-radius: 8px;
  background: var(--bg-card-muted);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 800;
  line-height: 1.4;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding-right: 2px;
}

.history-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas:
    "time family"
    "title title"
    "scores scores";
  gap: 4px 8px;
  width: 100%;
  min-width: 0;
  padding: 10px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card-muted);
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.history-item.active {
  border-color: var(--border-accent);
  background: rgba(43, 123, 184, 0.1);
}

.item-time {
  grid-area: time;
  min-width: 0;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 750;
  line-height: 1.35;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

.item-title {
  grid-area: title;
  min-width: 0;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 850;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.item-family {
  grid-area: family;
  align-self: start;
  justify-self: end;
  min-height: 22px;
  padding: 2px 7px;
  border: 1px solid var(--border-color);
  border-radius: 7px;
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 800;
  line-height: 1.35;
  white-space: nowrap;
}

.score-line {
  grid-area: scores;
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  min-width: 0;
  margin-top: 2px;
}

.score-line span {
  min-height: 22px;
  padding: 2px 7px;
  border-radius: 7px;
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 800;
  line-height: 1.35;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

.empty-text {
  margin: 0;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px 12px;
  border: 1px dashed var(--border-color);
  border-radius: 8px;
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 700;
  text-align: center;
}

@media (max-width: 520px) {
  .history-item {
    grid-template-columns: 1fr;
    grid-template-areas:
      "time"
      "title"
      "family"
      "scores";
  }

  .item-family {
    justify-self: start;
  }
}
</style>
