<script setup lang="ts">
import type { ReviewTask } from '@/services/resumeReview'

defineProps<{
  tasks: ReviewTask[]
}>()

const emit = defineEmits<{
  (e: 'open-module', moduleKey: ReviewTask['relatedModuleKey']): void
}>()

const priorityMap: Record<ReviewTask['priority'], { label: string; tone: string }> = {
  high: { label: '高', tone: 'high' },
  medium: { label: '中', tone: 'medium' },
  low: { label: '低', tone: 'low' },
}
</script>

<template>
  <section class="review-action-list">
    <header class="section-head">
      <h3>优化任务</h3>
      <span>{{ tasks.length }} 项</span>
    </header>

    <div v-if="tasks.length" class="task-rows">
      <article v-for="task in tasks" :key="task.id" class="task-row">
        <span class="priority-badge" :class="`tone-${priorityMap[task.priority].tone}`">
          {{ priorityMap[task.priority].label }}
        </span>

        <div class="task-body">
          <h4>{{ task.title }}</h4>
          <p class="task-reason">{{ task.reason }}</p>
          <p class="task-suggestion">{{ task.suggestion }}</p>
        </div>

        <button class="edit-btn" type="button" @click="emit('open-module', task.relatedModuleKey)">
          去修改
        </button>
      </article>
    </div>

    <p v-else class="empty-text">暂无优化任务</p>
  </section>
</template>

<style scoped>
.review-action-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.section-head h3 {
  margin: 0;
  min-width: 0;
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 800;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.section-head span {
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

.task-rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.task-row {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  align-items: start;
  gap: 10px;
  padding: 12px 12px 12px 10px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card-muted);
  min-width: 0;
}

.priority-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card-muted);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 900;
  line-height: 1;
}

.priority-badge.tone-high {
  border-color: rgba(216, 80, 80, 0.26);
  background: rgba(216, 80, 80, 0.08);
  color: var(--accent-red);
}

.priority-badge.tone-medium {
  border-color: rgba(224, 138, 58, 0.28);
  background: rgba(224, 138, 58, 0.08);
  color: var(--accent-orange);
}

.priority-badge.tone-low {
  border-color: rgba(26, 143, 94, 0.22);
  background: rgba(26, 143, 94, 0.08);
  color: var(--accent-green);
}

.task-body {
  min-width: 0;
}

.task-body h4 {
  margin: 0;
  min-width: 0;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 800;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.task-body p {
  margin: 5px 0 0;
  min-width: 0;
  font-size: 12px;
  line-height: 1.65;
  overflow-wrap: anywhere;
}

.task-reason {
  color: var(--text-secondary);
}

.task-suggestion {
  color: var(--text-secondary);
}

.edit-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 76px;
  min-width: 76px;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--border-accent);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--primary-600);
  font-size: 12px;
  font-weight: 850;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
}

.edit-btn:hover {
  background: rgba(43, 123, 184, 0.12);
}

.empty-text {
  margin: 0;
  padding: 22px 12px;
  border: 1px dashed var(--border-color);
  border-radius: 8px;
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 700;
  text-align: center;
}

@media (max-width: 560px) {
  .task-row {
    grid-template-columns: 34px minmax(0, 1fr);
  }

  .edit-btn {
    grid-column: 2;
    justify-self: start;
  }
}
</style>
