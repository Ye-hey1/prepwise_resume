<script setup lang="ts">
/**
 * 学习进度雷达图
 * 展示各维度掌握度，支持历史对比
 */
import { computed } from 'vue'
import { useLearningProgressStore, SKILL_DIMENSIONS, type SkillDimension } from '@/stores/learningProgress'

const props = withDefaults(defineProps<{
  size?: number
  showLabels?: boolean
}>(), {
  size: 280,
  showLabels: true,
})

const progressStore = useLearningProgressStore()

const center = computed(() => props.size / 2)
const radius = computed(() => (props.size / 2) - 40)
const dimensions = SKILL_DIMENSIONS

/** 计算多边形顶点坐标 */
function getPoint(index: number, value: number): { x: number; y: number } {
  const angle = (Math.PI * 2 * index) / dimensions.length - Math.PI / 2
  const r = (value / 100) * radius.value
  return {
    x: center.value + r * Math.cos(angle),
    y: center.value + r * Math.sin(angle),
  }
}

/** 网格线坐标 */
const gridLevels = [20, 40, 60, 80, 100]

function getGridPolygon(level: number): string {
  return dimensions
    .map((_, i) => {
      const point = getPoint(i, level)
      return `${point.x},${point.y}`
    })
    .join(' ')
}

/** 数据多边形 */
const dataPolygon = computed(() => {
  return dimensions
    .map((dim, i) => {
      const score = progressStore.currentScores[dim.key]
      const point = getPoint(i, score)
      return `${point.x},${point.y}`
    })
    .join(' ')
})

/** 标签位置 */
function getLabelPosition(index: number): { x: number; y: number; anchor: string } {
  const angle = (Math.PI * 2 * index) / dimensions.length - Math.PI / 2
  const labelRadius = radius.value + 24
  const x = center.value + labelRadius * Math.cos(angle)
  const y = center.value + labelRadius * Math.sin(angle)

  let anchor = 'middle'
  if (Math.cos(angle) > 0.3) anchor = 'start'
  else if (Math.cos(angle) < -0.3) anchor = 'end'

  return { x, y, anchor }
}

/** 是否有数据 */
const hasData = computed(() => {
  return Object.values(progressStore.currentScores).some(s => s > 0)
})

/** 得分颜色 */
function getScoreColor(score: number): string {
  if (score >= 80) return 'var(--accent-green)'
  if (score >= 60) return 'var(--accent-info)'
  if (score >= 40) return 'var(--accent-orange)'
  return 'var(--accent-red)'
}
</script>

<template>
  <div class="radar-chart-wrapper">
    <svg
      :width="size"
      :height="size"
      :viewBox="`0 0 ${size} ${size}`"
      class="radar-chart"
    >
      <!-- 网格 -->
      <polygon
        v-for="level in gridLevels"
        :key="level"
        :points="getGridPolygon(level)"
        class="grid-polygon"
        :class="{ 'grid-polygon--outer': level === 100 }"
      />

      <!-- 轴线 -->
      <line
        v-for="(_, i) in dimensions"
        :key="`axis-${i}`"
        :x1="center"
        :y1="center"
        :x2="getPoint(i, 100).x"
        :y2="getPoint(i, 100).y"
        class="axis-line"
      />

      <!-- 数据区域 -->
      <polygon
        v-if="hasData"
        :points="dataPolygon"
        class="data-polygon"
      />

      <!-- 数据点 -->
      <circle
        v-for="(dim, i) in dimensions"
        :key="`point-${dim.key}`"
        :cx="getPoint(i, progressStore.currentScores[dim.key]).x"
        :cy="getPoint(i, progressStore.currentScores[dim.key]).y"
        :r="hasData && progressStore.currentScores[dim.key] > 0 ? 4 : 0"
        class="data-point"
      />

      <!-- 标签 -->
      <template v-if="showLabels">
        <text
          v-for="(dim, i) in dimensions"
          :key="`label-${dim.key}`"
          :x="getLabelPosition(i).x"
          :y="getLabelPosition(i).y"
          :text-anchor="getLabelPosition(i).anchor"
          class="dimension-label"
          dominant-baseline="middle"
        >
          {{ dim.label }}
        </text>
        <!-- 分数 -->
        <text
          v-for="(dim, i) in dimensions"
          :key="`score-${dim.key}`"
          :x="getLabelPosition(i).x"
          :y="getLabelPosition(i).y + 14"
          :text-anchor="getLabelPosition(i).anchor"
          class="dimension-score"
          :style="{ fill: getScoreColor(progressStore.currentScores[dim.key]) }"
          dominant-baseline="middle"
        >
          {{ progressStore.currentScores[dim.key] > 0 ? progressStore.currentScores[dim.key] : '-' }}
        </text>
      </template>
    </svg>

    <!-- 空状态 -->
    <div v-if="!hasData" class="radar-empty">
      <p class="radar-empty-text">完成面试练习后将展示能力雷达图</p>
    </div>
  </div>
</template>

<style scoped>
.radar-chart-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.radar-chart {
  display: block;
}

.grid-polygon {
  fill: none;
  stroke: var(--border-color, rgba(100, 120, 150, 0.16));
  stroke-width: 0.8;
}

.grid-polygon--outer {
  stroke-width: 1.2;
  stroke: var(--border-color-strong, rgba(70, 90, 120, 0.22));
}

.axis-line {
  stroke: var(--border-color, rgba(100, 120, 150, 0.16));
  stroke-width: 0.6;
  stroke-dasharray: 2 3;
}

.data-polygon {
  fill: rgba(43, 123, 184, 0.15);
  stroke: var(--accent-info, #2b7bb8);
  stroke-width: 2;
  transition: all 0.4s ease;
}

.data-point {
  fill: var(--accent-info, #2b7bb8);
  stroke: #fff;
  stroke-width: 2;
  transition: all 0.3s ease;
}

.dimension-label {
  font-size: 11px;
  font-weight: 600;
  fill: var(--text-secondary, #4a5a72);
}

.dimension-score {
  font-size: 12px;
  font-weight: 700;
}

.radar-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.radar-empty-text {
  font-size: 12px;
  color: var(--text-muted, #8496ad);
  text-align: center;
  max-width: 160px;
}
</style>
