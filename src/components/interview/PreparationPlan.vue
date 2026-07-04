<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useInterviewPlanStore, PREPARATION_PHASES, type PreparationPhase, type TaskStatus } from '@/stores/interviewPlan'

const planStore = useInterviewPlanStore()

const selectedPhase = ref<PreparationPhase | 'all'>('all')
const filterStatus = ref<TaskStatus | 'all'>('all')

const phases = computed(() => [
  { id: 'all' as const, name: '全部阶段', icon: '📋' },
  ...PREPARATION_PHASES,
])

const tasks = computed(() => {
  let filtered = planStore.tasks

  // 按阶段筛选
  if (selectedPhase.value !== 'all') {
    filtered = filtered.filter(t => t.phaseId === selectedPhase.value)
  }

  // 按状态筛选
  if (filterStatus.value !== 'all') {
    filtered = filtered.filter(t => t.status === filterStatus.value)
  }

  // 按阶段顺序排序
  const phaseOrder: Partial<Record<PreparationPhase, number>> = {}
  PREPARATION_PHASES.forEach((p, index) => {
    phaseOrder[p.id] = index
  })

  return filtered.sort((a, b) => {
    const orderA = phaseOrder[a.phaseId] ?? 999
    const orderB = phaseOrder[b.phaseId] ?? 999
    if (orderA !== orderB) return orderA - orderB
    return a.id.localeCompare(b.id)
  })
})

const statusOptions = [
  { id: 'all' as const, label: '全部状态' },
  { id: 'pending' as const, label: '待开始', color: 'var(--text-muted)' },
  { id: 'in-progress' as const, label: '进行中', color: 'var(--accent-blue-500)' },
  { id: 'completed' as const, label: '已完成', color: 'var(--accent-green)' },
  { id: 'skipped' as const, label: '已跳过', color: 'var(--text-muted)' },
]

function getPhaseInfo(phaseId: PreparationPhase) {
  return PREPARATION_PHASES.find(p => p.id === phaseId)
}

function getStatusLabel(status: TaskStatus): string {
  return statusOptions.find(s => s.id === status)?.label || status
}

function getStatusColor(status: TaskStatus): string {
  return statusOptions.find(s => s.id === status)?.color || 'var(--text-muted)'
}

function startTask(taskId: string) {
  planStore.startTask(taskId)
}

function completeTask(taskId: string) {
  planStore.completeTask(taskId)
}

function skipTask(taskId: string) {
  planStore.skipTask(taskId)
}

function resetPlan() {
  if (confirm('确定要重置整个计划吗？所有进度将丢失。')) {
    planStore.resetPlan()
    initializePlan()
  }
}

function initializePlan() {
  planStore.initializePlan()
}

onMounted(() => {
  if (planStore.tasks.length === 0) {
    initializePlan()
  }
})
</script>

<template>
  <div class="preparation-plan">
    <div class="plan-header">
      <div class="header-content">
        <h2>面试准备计划</h2>
        <p class="header-desc">系统化 4-8 周准备计划，按真实面试考察优先级编排</p>
      </div>
      <div class="header-stats">
        <div class="stat-item">
          <span class="stat-value">{{ planStore.overallProgress }}%</span>
          <span class="stat-label">总进度</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">{{ planStore.pendingTasksCount }}</span>
          <span class="stat-label">待完成</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">{{ planStore.completedTasksCount }}</span>
          <span class="stat-label">已完成</span>
        </div>
      </div>
    </div>

    <div class="plan-body">
      <!-- 阶段进度条 -->
      <div class="phase-progress-bar">
        <div
          v-for="phase in PREPARATION_PHASES"
          :key="phase.id"
          class="phase-segment"
          :class="{ active: selectedPhase === phase.id || selectedPhase === 'all' }"
          :style="{ '--progress': planStore.phaseProgress[phase.id] + '%', '--color': phase.color }"
          @click="selectedPhase = phase.id"
        >
          <span class="phase-icon">{{ phase.icon }}</span>
          <span class="phase-name">{{ phase.name }}</span>
          <span class="phase-percent">{{ planStore.phaseProgress[phase.id] }}%</span>
        </div>
      </div>

      <!-- 当前推荐阶段 -->
      <div v-if="planStore.recommendedPhase" class="recommended-phase">
        <span class="phase-badge" :style="{ background: planStore.recommendedPhase.color + '20', color: planStore.recommendedPhase.color }">
          {{ planStore.recommendedPhase.icon }} 推荐当前专注
        </span>
        <p>{{ planStore.recommendedPhase.description }}</p>
      </div>

      <!-- 筛选栏 -->
      <div class="filter-bar">
        <div class="filter-group">
          <span class="filter-label">阶段：</span>
          <button
            v-for="phase in phases"
            :key="phase.id"
            type="button"
            class="filter-chip"
            :class="{ active: selectedPhase === phase.id }"
            @click="selectedPhase = phase.id"
          >
            {{ phase.icon }} {{ phase.name }}
          </button>
        </div>
        <div class="filter-group">
          <span class="filter-label">状态：</span>
          <select v-model="filterStatus" class="filter-select">
            <option v-for="opt in statusOptions" :key="opt.id" :value="opt.id">{{ opt.label }}</option>
          </select>
        </div>
      </div>

      <!-- 任务列表 -->
      <div class="task-list">
        <div
          v-for="task in tasks"
          :key="task.id"
          class="task-card"
          :class="`status-${task.status}`"
        >
          <div class="task-header">
            <div class="task-phase">
              <span class="phase-icon">{{ getPhaseInfo(task.phaseId)?.icon }}</span>
              <span class="phase-name">{{ getPhaseInfo(task.phaseId)?.name }}</span>
            </div>
            <div class="task-status">
              <span class="status-badge" :style="{ color: getStatusColor(task.status) }">
                {{ getStatusLabel(task.status) }}
              </span>
            </div>
          </div>

          <div class="task-content">
            <h4 class="task-title">{{ task.title }}</h4>
            <p class="task-desc">{{ task.description }}</p>
            <div v-if="task.resources.length" class="task-resources">
              <span class="resource-label">学习资源：</span>
              <a
                v-for="resource in task.resources"
                :key="resource"
                :href="resource"
                target="_blank"
                class="resource-link"
              >
                {{ resource }}
              </a>
            </div>
            <div class="task-meta">
              <span class="task-hours">⏱ {{ task.estimatedHours }} 小时</span>
              <span v-if="task.completedAt" class="task-completed-at">
                ✓ {{ new Date(task.completedAt).toLocaleDateString() }}
              </span>
            </div>
          </div>

          <div class="task-actions">
            <template v-if="task.status === 'pending'">
              <button type="button" class="btn-start" @click="startTask(task.id)">开始</button>
              <button type="button" class="btn-skip" @click="skipTask(task.id)">跳过</button>
            </template>
            <template v-else-if="task.status === 'in-progress'">
              <button type="button" class="btn-complete" @click="completeTask(task.id)">完成</button>
              <button type="button" class="btn-skip" @click="skipTask(task.id)">跳过</button>
            </template>
            <template v-else-if="task.status === 'completed'">
              <span class="completed-text">✓ 已完成</span>
            </template>
            <template v-else>
              <span class="skipped-text">已跳过</span>
            </template>
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-if="tasks.length === 0" class="empty-state">
        <span class="empty-icon">📝</span>
        <p>当前筛选条件下没有任务</p>
        <button type="button" class="btn-reset" @click="selectedPhase = 'all'; filterStatus = 'all'">查看全部任务</button>
      </div>
    </div>

    <div class="plan-footer">
      <button type="button" class="btn-reset-plan" @click="resetPlan">重置计划</button>
    </div>
  </div>
</template>

<style scoped>
.preparation-plan {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 24px;
  max-width: 1000px;
  margin: 0 auto;
}

.plan-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}

.header-content h2 {
  margin: 0 0 4px;
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
}

.header-desc {
  margin: 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.header-stats {
  display: flex;
  gap: 24px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--accent-blue-500);
}

.stat-label {
  font-size: 12px;
  color: var(--text-muted);
}

.phase-progress-bar {
  display: flex;
  gap: 4px;
  padding: 16px;
  background: var(--bg-card-muted);
  border-radius: 12px;
  overflow-x: auto;
}

.phase-segment {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  min-width: 100px;
  padding: 12px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;
}

.phase-segment:hover {
  border-color: var(--accent-blue-500);
}

.phase-segment.active {
  border-color: var(--accent-blue-500);
  background: color-mix(in srgb, var(--accent-blue-500) 5%, var(--bg-card));
}

.phase-segment::before {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--color, var(--border-color));
  transition: width 0.3s ease;
}

.phase-icon {
  font-size: 20px;
}

.phase-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  text-align: center;
}

.phase-percent {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-secondary);
}

.recommended-phase {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--bg-card-muted);
  border-radius: 10px;
}

.phase-badge {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.recommended-phase p {
  margin: 0;
  font-size: 13px;
  color: var(--text-primary);
}

.filter-bar {
  display: flex;
  align-items: center;
  gap: 24px;
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
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
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

.filter-select {
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 12px;
  cursor: pointer;
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.task-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: var(--bg-card-muted);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  transition: all 0.2s ease;
}

.task-card.status-completed {
  opacity: 0.7;
  background: color-mix(in srgb, var(--accent-green) 5%, var(--bg-card-muted));
}

.task-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.task-phase {
  display: flex;
  align-items: center;
  gap: 6px;
}

.phase-icon {
  font-size: 16px;
}

.phase-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.status-badge {
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  background: var(--bg-elevated);
}

.task-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.task-title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
}

.task-desc {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.task-resources {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.resource-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
}

.resource-link {
  font-size: 12px;
  color: var(--accent-blue-500);
  text-decoration: none;
}

.resource-link:hover {
  text-decoration: underline;
}

.task-meta {
  display: flex;
  gap: 16px;
}

.task-hours {
  font-size: 12px;
  color: var(--text-muted);
}

.task-completed-at {
  font-size: 12px;
  color: var(--accent-green);
}

.task-actions {
  display: flex;
  gap: 8px;
}

.btn-start,
.btn-complete,
.btn-skip,
.btn-reset {
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-start {
  background: var(--accent-blue-500);
  color: #fff;
  border: none;
}

.btn-start:hover {
  background: var(--accent-blue-600);
}

.btn-complete {
  background: var(--accent-green);
  color: #fff;
  border: none;
}

.btn-complete:hover {
  background: var(--accent-green-dark);
}

.btn-skip {
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
}

.btn-skip:hover {
  border-color: var(--text-muted);
  color: var(--text-primary);
}

.completed-text,
.skipped-text {
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 600;
}

.completed-text {
  color: var(--accent-green);
}

.skipped-text {
  color: var(--text-muted);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 48px 24px;
  text-align: center;
}

.empty-icon {
  font-size: 48px;
  opacity: 0.5;
}

.empty-state p {
  margin: 0;
  color: var(--text-secondary);
}

.btn-reset {
  padding: 8px 16px;
  background: var(--accent-blue-500);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.plan-footer {
  display: flex;
  justify-content: flex-end;
}

.btn-reset-plan {
  padding: 10px 20px;
  background: transparent;
  color: var(--text-muted);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.btn-reset-plan:hover {
  border-color: var(--accent-red);
  color: var(--accent-red);
}

@media (max-width: 768px) {
  .preparation-plan {
    padding: 16px;
  }

  .plan-header {
    flex-direction: column;
    align-items: stretch;
  }

  .header-stats {
    justify-content: space-around;
  }

  .phase-progress-bar {
    overflow-x: auto;
  }

  .filter-bar {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }
}
</style>
