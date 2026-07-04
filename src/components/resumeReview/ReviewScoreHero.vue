<script setup lang="ts">
import { computed } from 'vue'
import type { ResumeReviewResult } from '@/services/resumeReview'

const props = defineProps<{
  result: ResumeReviewResult | null
  loading: boolean
  jdUnlockHint: boolean
}>()

const verdict = computed(() => {
  if (props.loading) return { label: '审查中', tone: 'info' }
  if (!props.result) return { label: '待审查', tone: 'muted' }

  const map: Record<ResumeReviewResult['verdict'], { label: string; tone: string }> = {
    ready: { label: '可投递', tone: 'success' },
    needs_work: { label: '建议优化后投递', tone: 'warning' },
    high_risk: { label: '高风险', tone: 'danger' },
  }

  return map[props.result.verdict]
})

const roleFamilyLabel = computed(() => {
  if (!props.result) return '--'
  return props.result.roleFamily === 'technical' ? '技术岗' : '通用岗'
})

const metrics = computed(() => [
  {
    label: '通用评分',
    value: props.result ? `${props.result.generalScore}` : '--',
    suffix: props.result ? '分' : '',
  },
  {
    label: 'JD 匹配',
    value: props.result?.jdFitScore != null ? `${props.result.jdFitScore}` : '--',
    suffix: props.result?.jdFitScore != null ? '分' : '',
  },
  {
    label: '岗位类型',
    value: roleFamilyLabel.value,
    suffix: '',
  },
])
</script>

<template>
  <section class="review-score-hero">
    <div class="hero-copy">
      <span class="hero-kicker">综合结果</span>
      <div class="hero-title-row">
        <h2>评分概览</h2>
        <span class="verdict-pill" :class="`tone-${verdict.tone}`">{{ verdict.label }}</span>
      </div>
      <p>评分会结合简历完整度、表达证据、岗位匹配度和可执行优化任务。</p>
    </div>

    <div class="score-block" :class="{ loading }">
      <span class="score-label">综合评分</span>
      <strong>{{ result ? result.overallScore : '--' }}</strong>
      <span class="score-unit">/ 100</span>
    </div>

    <dl class="metric-grid">
      <div v-for="metric in metrics" :key="metric.label" class="metric-cell">
        <dt>{{ metric.label }}</dt>
        <dd>
          <span>{{ metric.value }}</span>
          <small v-if="metric.suffix">{{ metric.suffix }}</small>
        </dd>
      </div>
    </dl>

    <p v-if="jdUnlockHint" class="jd-hint">
      完成 JD 分析后可解锁更精确的岗位匹配评分。
    </p>
  </section>
</template>

<style scoped>
.review-score-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(132px, auto);
  gap: 14px;
  align-items: stretch;
  padding: 16px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
  min-width: 0;
}

.hero-copy {
  min-width: 0;
}

.hero-kicker {
  display: block;
  color: var(--primary-600);
  font-size: 12px;
  font-weight: 800;
  line-height: 1.4;
}

.hero-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  margin-top: 3px;
}

.hero-title-row h2 {
  margin: 0;
  min-width: 0;
  color: var(--text-primary);
  font-size: 22px;
  font-weight: 900;
  line-height: 1.25;
  letter-spacing: -0.01em;
  text-wrap: balance;
  overflow-wrap: anywhere;
}

.hero-copy p,
.jd-hint {
  margin: 6px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.65;
  overflow-wrap: anywhere;
}

.verdict-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  min-width: 64px;
  min-height: 26px;
  padding: 0 10px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card-muted);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 800;
  line-height: 1.2;
  white-space: nowrap;
}

.tone-success {
  border-color: rgba(26, 143, 94, 0.24);
  background: rgba(26, 143, 94, 0.08);
  color: var(--accent-green);
}

.tone-warning {
  border-color: rgba(224, 138, 58, 0.28);
  background: rgba(224, 138, 58, 0.08);
  color: var(--accent-orange);
}

.tone-danger {
  border-color: rgba(216, 80, 80, 0.28);
  background: rgba(216, 80, 80, 0.08);
  color: var(--accent-red);
}

.tone-info {
  border-color: var(--border-accent);
  background: rgba(43, 123, 184, 0.08);
  color: var(--primary-600);
}

.score-block {
  display: grid;
  grid-template-columns: auto auto;
  grid-template-areas:
    "label label"
    "score unit";
  align-items: end;
  align-content: center;
  justify-content: center;
  column-gap: 4px;
  min-width: 132px;
  padding: 12px 14px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card-muted);
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.score-label {
  grid-area: label;
  justify-self: end;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.4;
}

.score-block strong {
  grid-area: score;
  font-size: 44px;
  font-weight: 900;
  line-height: 1;
}

.score-block.loading strong {
  color: var(--primary-600);
}

.score-unit {
  grid-area: unit;
  padding-bottom: 5px;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 800;
}

.metric-grid {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
  min-width: 0;
}

.metric-cell {
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: transparent;
}

.metric-cell dt {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 700;
  line-height: 1.4;
}

.metric-cell dd {
  display: flex;
  align-items: baseline;
  gap: 3px;
  margin: 3px 0 0;
  min-width: 0;
  color: var(--text-primary);
  font-size: 17px;
  font-weight: 850;
  line-height: 1.25;
}

.metric-cell dd span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.metric-cell dd small {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 700;
}

.jd-hint {
  grid-column: 1 / -1;
  margin-top: 0;
  padding-top: 10px;
  border-top: 1px dashed var(--border-color);
  color: var(--primary-600);
  font-weight: 700;
}

@media (max-width: 720px) {
  .review-score-hero {
    grid-template-columns: 1fr;
  }

  .score-block {
    justify-content: start;
  }

  .score-label {
    justify-self: start;
  }

  .metric-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 460px) {
  .hero-title-row {
    align-items: flex-start;
    flex-direction: column;
  }

  .verdict-pill {
    white-space: normal;
    text-align: center;
  }
}
</style>
