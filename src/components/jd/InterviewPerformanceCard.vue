<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  practiceCount: number
  lastInterviewScore: number | null
  lastInterviewPassed: boolean | null
  lastWeaknesses: string[]
  lastSuggestedResumeModules: string[]
  lastPracticedAt: string
  /** 多轮面试的分数趋势 */
  scoreTrend: Array<{ date: string; score: number; passed: boolean }>
}>()

const emit = defineEmits<{
  (e: 'startInterview'): void
  (e: 'viewDetails'): void
  (e: 'optimizeResume'): void
}>()

const scoreColor = computed(() => {
  if (props.lastInterviewScore == null) return 'var(--text-muted)'
  if (props.lastInterviewScore >= 75) return 'var(--accent-green)'
  if (props.lastInterviewScore >= 50) return '#e8a838'
  return 'var(--accent-red)'
})

const scoreLabel = computed(() => {
  if (props.lastInterviewScore == null) return '待评估'
  if (props.lastInterviewScore >= 75) return '通过'
  return '未通过'
})

const formattedDate = computed(() => {
  if (!props.lastPracticedAt) return ''
  try {
    return new Date(props.lastPracticedAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return props.lastPracticedAt
  }
})

const maxTrendScore = computed(() =>
  Math.max(...props.scoreTrend.map((t) => t.score), 100),
)
</script>

<template>
  <article class="perf-card">
    <div class="perf-header">
      <div class="perf-title-box">
        <h3>面试表现追踪</h3>
        <span class="perf-badge">INTERVIEW TRACKER</span>
      </div>
    </div>

    <div class="perf-body">
      <!-- 分数徽章 -->
      <div class="perf-score-section">
        <div class="score-ring" :style="{ '--score-color': scoreColor }">
          <span class="score-value">{{ lastInterviewScore ?? '--' }}</span>
        </div>
        <div class="score-meta">
          <span class="score-status" :style="{ color: scoreColor }">{{ scoreLabel }}</span>
          <span v-if="formattedDate" class="score-date">最近练习：{{ formattedDate }}</span>
          <span class="score-count">共练习 {{ practiceCount }} 次</span>
        </div>
      </div>

      <!-- 分数趋势条形图 -->
      <div v-if="scoreTrend.length > 1" class="perf-trend">
        <span class="trend-label">分数趋势</span>
        <div class="trend-bars">
          <div
            v-for="(t, i) in scoreTrend"
            :key="i"
            class="trend-bar"
            :class="{ passed: t.passed }"
            :style="{ height: `${Math.max((t.score / maxTrendScore) * 100, 8)}%` }"
            :title="`${t.score}分`"
          >
            <span class="trend-score">{{ t.score }}</span>
          </div>
        </div>
      </div>

      <!-- 弱项列表 -->
      <div v-if="lastWeaknesses.length" class="perf-weaknesses">
        <span class="weak-label">暴露的薄弱点</span>
        <ul class="weak-list">
          <li v-for="(w, i) in lastWeaknesses.slice(0, 4)" :key="i">{{ w }}</li>
        </ul>
        <p v-if="lastWeaknesses.length > 4" class="weak-more">
          还有 {{ lastWeaknesses.length - 4 }} 项...
        </p>
      </div>

      <!-- 操作按钮 -->
      <div class="perf-actions">
        <button class="btn-action primary" @click="emit('startInterview')">
          再来一轮
        </button>
        <button
          v-if="lastWeaknesses.length"
          class="btn-action"
          @click="emit('optimizeResume')"
        >
          优化简历
        </button>
        <button class="btn-action ghost" @click="emit('viewDetails')">
          查看详情
        </button>
      </div>
    </div>
  </article>
</template>

<style scoped>
.perf-card {
  padding: 18px;
  border-radius: 14px;
  border: 1px solid var(--border-color);
  background: var(--bg-card-muted);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.perf-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.perf-title-box {
  display: flex;
  align-items: center;
  gap: 8px;
}

.perf-title-box h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 800;
  color: var(--text-primary);
}

.perf-badge {
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  background: var(--bg-card);
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid var(--border-color);
}

.perf-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* 分数区域 */
.perf-score-section {
  display: flex;
  align-items: center;
  gap: 16px;
}

.score-ring {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: 3px solid var(--score-color, var(--text-muted));
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.score-value {
  font-size: 18px;
  font-weight: 800;
  color: var(--score-color, var(--text-muted));
}

.score-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.score-status {
  font-size: 14px;
  font-weight: 800;
}

.score-date,
.score-count {
  font-size: 11px;
  color: var(--text-muted);
}

/* 趋势图 */
.perf-trend {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.trend-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-muted);
}

.trend-bars {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  height: 48px;
}

.trend-bar {
  flex: 1;
  min-height: 4px;
  border-radius: 3px 3px 0 0;
  background: var(--accent-red);
  opacity: 0.7;
  position: relative;
  max-width: 28px;
}

.trend-bar.passed {
  background: var(--accent-green);
}

.trend-score {
  position: absolute;
  top: -14px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 9px;
  font-weight: 700;
  color: var(--text-muted);
  white-space: nowrap;
}

/* 弱项 */
.perf-weaknesses {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.weak-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-muted);
}

.weak-list {
  margin: 0;
  padding-left: 16px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.weak-list li {
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-secondary);
}

.weak-list li::marker {
  color: var(--accent-red);
}

.weak-more {
  margin: 2px 0 0;
  font-size: 11px;
  color: var(--text-muted);
}

/* 操作按钮 */
.perf-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.btn-action {
  min-height: 32px;
  padding: 0 14px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-action:hover {
  border-color: var(--primary-500);
  color: var(--primary-500);
}

.btn-action.primary {
  background: linear-gradient(135deg, var(--primary-500), var(--primary-600));
  color: var(--text-inverse);
  border-color: transparent;
}

.btn-action.primary:hover {
  opacity: 0.9;
  color: var(--text-inverse);
}

.btn-action.ghost {
  background: transparent;
  border-color: transparent;
}

.btn-action.ghost:hover {
  border-color: var(--border-color);
}
</style>
