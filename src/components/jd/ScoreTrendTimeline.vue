<script setup lang="ts">
/**
 * 面试评分趋势时间线
 * 展示历次面试练习的得分变化
 */
import { computed } from 'vue'
import { useLearningProgressStore } from '@/stores/learningProgress'

const props = withDefaults(defineProps<{
  width?: number
  height?: number
  maxPoints?: number
}>(), {
  width: 400,
  height: 160,
  maxPoints: 10,
})

const progressStore = useLearningProgressStore()

const trendData = computed(() => {
  const data = progressStore.totalScoreTrend.slice(-props.maxPoints)
  return data
})

const hasData = computed(() => trendData.value.length >= 2)

/** SVG 路径和区域 */
const chartPadding = { top: 20, right: 20, bottom: 30, left: 36 }
const chartWidth = computed(() => props.width - chartPadding.left - chartPadding.right)
const chartHeight = computed(() => props.height - chartPadding.top - chartPadding.bottom)

const points = computed(() => {
  if (trendData.value.length === 0) return []

  const maxScore = 100
  const minScore = 0

  return trendData.value.map((point, index) => {
    const x = chartPadding.left + (index / Math.max(trendData.value.length - 1, 1)) * chartWidth.value
    const y = chartPadding.top + (1 - (point.score - minScore) / (maxScore - minScore)) * chartHeight.value
    return { x, y, score: point.score, timestamp: point.timestamp }
  })
})

const linePath = computed(() => {
  if (points.value.length < 2) return ''
  return points.value.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
})

const areaPath = computed(() => {
  if (points.value.length < 2) return ''
  const baseline = chartPadding.top + chartHeight.value
  const first = points.value[0]!
  const last = points.value[points.value.length - 1]!
  return `${linePath.value} L ${last.x} ${baseline} L ${first.x} ${baseline} Z`
})

/** Y 轴刻度 */
const yTicks = [0, 25, 50, 75, 100]

function getYPosition(score: number): number {
  return chartPadding.top + (1 - score / 100) * chartHeight.value
}

/** 格式化日期 */
function formatDate(timestamp: string): string {
  const date = new Date(timestamp)
  return `${date.getMonth() + 1}/${date.getDate()}`
}

/** 得分变化趋势 */
const scoreTrend = computed(() => {
  if (trendData.value.length < 2) return null
  const first = trendData.value[0]!.score
  const last = trendData.value[trendData.value.length - 1]!.score
  const diff = last - first
  return {
    direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'stable',
    value: Math.abs(diff),
    percentage: first > 0 ? Math.round((diff / first) * 100) : 0,
  }
})
</script>

<template>
  <div class="score-trend">
    <div class="trend-header">
      <span class="trend-title">面试得分趋势</span>
      <span v-if="scoreTrend" class="trend-badge" :class="`trend-badge--${scoreTrend.direction}`">
        <template v-if="scoreTrend.direction === 'up'">+{{ scoreTrend.value }}分</template>
        <template v-else-if="scoreTrend.direction === 'down'">-{{ scoreTrend.value }}分</template>
        <template v-else>持平</template>
      </span>
    </div>

    <svg
      v-if="hasData"
      :width="width"
      :height="height"
      :viewBox="`0 0 ${width} ${height}`"
      class="trend-chart"
    >
      <!-- Y 轴刻度线 -->
      <g class="y-axis">
        <template v-for="tick in yTicks" :key="tick">
          <line
            :x1="chartPadding.left"
            :y1="getYPosition(tick)"
            :x2="width - chartPadding.right"
            :y2="getYPosition(tick)"
            class="grid-line"
          />
          <text
            :x="chartPadding.left - 6"
            :y="getYPosition(tick)"
            class="y-label"
            text-anchor="end"
            dominant-baseline="middle"
          >
            {{ tick }}
          </text>
        </template>
      </g>

      <!-- 面积 -->
      <path :d="areaPath" class="trend-area" />

      <!-- 线条 -->
      <path :d="linePath" class="trend-line" />

      <!-- 数据点 -->
      <g v-for="(point, i) in points" :key="i">
        <circle
          :cx="point.x"
          :cy="point.y"
          r="4"
          class="trend-point"
        />
        <!-- X 轴日期标签（间隔显示） -->
        <text
          v-if="i === 0 || i === points.length - 1 || i % 2 === 0"
          :x="point.x"
          :y="height - 8"
          class="x-label"
          text-anchor="middle"
        >
          {{ formatDate(point.timestamp) }}
        </text>
      </g>
    </svg>

    <!-- 空状态 -->
    <div v-else class="trend-empty">
      <p>完成 2 次以上面试练习后展示趋势图</p>
    </div>
  </div>
</template>

<style scoped>
.score-trend {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.trend-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.trend-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
}

.trend-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 10px;
}

.trend-badge--up {
  background: color-mix(in srgb, var(--accent-green) 12%, transparent);
  color: var(--accent-green);
}

.trend-badge--down {
  background: color-mix(in srgb, var(--accent-red) 12%, transparent);
  color: var(--accent-red);
}

.trend-badge--stable {
  background: color-mix(in srgb, var(--accent-info) 12%, transparent);
  color: var(--accent-info);
}

.trend-chart {
  display: block;
  width: 100%;
  height: auto;
}

.grid-line {
  stroke: var(--border-color, rgba(100, 120, 150, 0.12));
  stroke-width: 0.6;
  stroke-dasharray: 3 3;
}

.y-label {
  font-size: 10px;
  fill: var(--text-muted, #8496ad);
}

.x-label {
  font-size: 10px;
  fill: var(--text-muted, #8496ad);
}

.trend-area {
  fill: rgba(43, 123, 184, 0.08);
}

.trend-line {
  fill: none;
  stroke: var(--accent-info, #2b7bb8);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.trend-point {
  fill: var(--accent-info, #2b7bb8);
  stroke: #fff;
  stroke-width: 2;
}

.trend-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100px;
  border: 1px dashed var(--border-color);
  border-radius: 12px;
}

.trend-empty p {
  font-size: 12px;
  color: var(--text-muted);
}
</style>
