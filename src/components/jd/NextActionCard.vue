<script setup lang="ts">
import type { LoopNextAction } from '@/composables/useJdInterviewLoop'

defineProps<{
  nextAction: LoopNextAction | null
  progress: number
  scoreImprovement: number | null
}>()

const emit = defineEmits<{
  (e: 'action'): void
}>()

function phaseLabel(phase: string): string {
  const map: Record<string, string> = {
    'jd-input': 'JD 输入',
    'analysis': '分析中',
    'match-review': '匹配审查',
    'interview-prep': '面试准备',
    'interview-done': '面试完成',
    'weakness-analysis': '弱项分析',
    'resume-optimize': '简历优化',
    're-match': '重新匹配',
    'loop-complete': '循环达标',
  }
  return map[phase] ?? phase
}
</script>

<template>
  <div v-if="nextAction" class="next-action-card">
    <div class="nac-header">
      <span class="nac-phase">{{ phaseLabel(nextAction.phase) }}</span>
      <span class="nac-progress">{{ progress }}%</span>
    </div>
    <div class="nac-bar">
      <div class="nac-bar-fill" :style="{ width: `${progress}%` }"></div>
    </div>
    <p class="nac-label">{{ nextAction.label }}</p>
    <div class="nac-footer">
      <button class="nac-btn" @click="emit('action')">
        去完成
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
      </button>
      <span v-if="scoreImprovement != null" class="nac-score-delta" :class="scoreImprovement > 0 ? 'up' : 'down'">
        {{ scoreImprovement > 0 ? '+' : '' }}{{ scoreImprovement }} 分
      </span>
    </div>
  </div>
</template>

<style scoped>
.next-action-card {
  padding: 14px 16px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--primary-500) 24%, var(--border-color));
  background: linear-gradient(135deg,
    color-mix(in srgb, var(--primary-500) 4%, var(--bg-card-muted)),
    var(--bg-card-muted)
  );
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.nac-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.nac-phase {
  font-size: 11px;
  font-weight: 800;
  color: var(--primary-500);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.nac-progress {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-muted);
}

.nac-bar {
  height: 4px;
  border-radius: 2px;
  background: var(--bg-card);
  overflow: hidden;
}

.nac-bar-fill {
  height: 100%;
  border-radius: 2px;
  background: linear-gradient(90deg, var(--primary-500), var(--primary-600));
  transition: width 0.3s ease;
}

.nac-label {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.5;
}

.nac-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.nac-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 30px;
  padding: 0 14px;
  border: none;
  border-radius: 8px;
  background: linear-gradient(135deg, var(--primary-500), var(--primary-600));
  color: var(--text-inverse);
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.nac-btn:hover { opacity: 0.9; }

.nac-score-delta {
  font-size: 13px;
  font-weight: 800;
}

.nac-score-delta.up { color: var(--accent-green); }
.nac-score-delta.down { color: var(--accent-red); }
</style>
