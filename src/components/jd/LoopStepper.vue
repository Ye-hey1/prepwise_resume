<script setup lang="ts">
/**
 * 闭环进度步骤条
 * 水平展示 JD分析→面试→弱项分析→简历优化→重新匹配 的闭环进度
 */
import type { LoopPhase } from '@/composables/useJdInterviewLoop'

const props = defineProps<{
  currentPhase: LoopPhase
  progress: number
}>()

const emit = defineEmits<{
  (e: 'step-click', phase: LoopPhase): void
}>()

interface StepItem {
  phase: LoopPhase
  label: string
  shortLabel: string
}

const steps: StepItem[] = [
  { phase: 'jd-input', label: 'JD 输入', shortLabel: 'JD' },
  { phase: 'analysis', label: '智能分析', shortLabel: '分析' },
  { phase: 'match-review', label: '匹配审查', shortLabel: '匹配' },
  { phase: 'interview-prep', label: '模拟面试', shortLabel: '面试' },
  { phase: 'weakness-analysis', label: '弱项分析', shortLabel: '弱项' },
  { phase: 'resume-optimize', label: '简历优化', shortLabel: '优化' },
  { phase: 'loop-complete', label: '闭环达标', shortLabel: '达标' },
]

const phaseOrder: LoopPhase[] = [
  'jd-input', 'analysis', 'match-review', 'interview-prep',
  'interview-done', 'weakness-analysis', 'resume-optimize', 're-match', 'loop-complete',
]

function getStepStatus(step: StepItem): 'completed' | 'active' | 'pending' {
  const currentIdx = phaseOrder.indexOf(props.currentPhase)
  const stepIdx = phaseOrder.indexOf(step.phase)

  if (stepIdx < currentIdx) return 'completed'
  if (step.phase === props.currentPhase || (step.phase === 'interview-prep' && props.currentPhase === 'interview-done')) return 'active'
  return 'pending'
}
</script>

<template>
  <div class="loop-stepper">
    <div class="stepper-track">
      <div
        v-for="(step, index) in steps"
        :key="step.phase"
        class="step-item"
        :class="`step--${getStepStatus(step)}`"
        @click="emit('step-click', step.phase)"
      >
        <!-- 连接线 -->
        <div v-if="index > 0" class="step-connector" :class="`connector--${getStepStatus(step)}`" />

        <!-- 节点 -->
        <div class="step-node">
          <div class="node-circle">
            <svg v-if="getStepStatus(step) === 'completed'" viewBox="0 0 24 24" fill="none" width="12" height="12">
              <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <span v-else-if="getStepStatus(step) === 'active'" class="node-pulse" />
            <span v-else class="node-dot" />
          </div>
        </div>

        <!-- 标签 -->
        <span class="step-label">{{ step.shortLabel }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.loop-stepper {
  padding: 12px 16px;
  border-radius: 12px;
  background: var(--bg-card-muted);
  border: 1px solid var(--border-color);
}

.stepper-track {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  position: relative;
}

.step-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  position: relative;
  flex: 1;
  cursor: pointer;
}

.step-item:first-child {
  align-items: flex-start;
}

.step-item:last-child {
  align-items: flex-end;
}

.step-connector {
  position: absolute;
  top: 12px;
  right: 50%;
  left: -50%;
  height: 2px;
  background: var(--border-color);
  z-index: 0;
}

.connector--completed {
  background: var(--accent-green);
}

.connector--active {
  background: linear-gradient(90deg, var(--accent-green), var(--primary-500));
}

.step-node {
  position: relative;
  z-index: 1;
}

.node-circle {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--border-color);
  background: var(--bg-card);
  transition: all 0.2s ease;
}

.step--completed .node-circle {
  border-color: var(--accent-green);
  background: var(--accent-green);
  color: #fff;
}

.step--active .node-circle {
  border-color: var(--primary-500);
  background: var(--bg-card);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--primary-500) 16%, transparent);
}

.step--pending .node-circle {
  border-color: var(--border-color);
  background: var(--bg-card-muted);
}

.node-pulse {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--primary-500);
  animation: pulse 1.5s ease-in-out infinite;
}

.node-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--border-color);
}

.step-label {
  font-size: 10px;
  font-weight: 700;
  color: var(--text-muted);
  white-space: nowrap;
}

.step--completed .step-label {
  color: var(--accent-green);
}

.step--active .step-label {
  color: var(--primary-500);
  font-weight: 800;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.3); opacity: 0.7; }
}

@media (max-width: 640px) {
  .step-label {
    font-size: 9px;
  }

  .node-circle {
    width: 20px;
    height: 20px;
  }
}
</style>
