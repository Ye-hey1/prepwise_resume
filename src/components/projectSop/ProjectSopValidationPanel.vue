<script setup lang="ts">
import type { ProjectSopValidation } from '@/services/projectSop/types'

defineOptions({ name: 'ProjectSopValidationPanel' })

defineProps<{
  validation: ProjectSopValidation | null
}>()
</script>

<template>
  <section v-if="validation" class="validation-panel" :style="{ '--score-width': `${validation.completeness}%` }">
    <div class="score-row">
      <div>
        <p>档案完整度</p>
        <span>{{ validation.canGenerate ? '可以生成完整资产' : '仍有阻断级缺口' }}</span>
      </div>
      <strong>{{ validation.completeness }}%</strong>
    </div>

    <div class="score-track" aria-hidden="true">
      <span></span>
    </div>

    <div class="issue-counts">
      <span :class="{ danger: validation.blockingIssues.length }">
        必填 {{ validation.blockingIssues.length }}
      </span>
      <span :class="{ warning: validation.warningIssues.length }">
        建议 {{ validation.warningIssues.length }}
      </span>
    </div>

    <div v-if="validation.blockingIssues.length" class="issue-group blocking">
      <h3>生成前必须补齐</h3>
      <p v-for="issue in validation.blockingIssues" :key="issue.field">
        <strong>{{ issue.label }}</strong>
        <span>{{ issue.prompt }}</span>
      </p>
    </div>

    <div v-if="validation.warningIssues.length" class="issue-group warning">
      <h3>可生成，但会出现待补占位</h3>
      <p v-for="issue in validation.warningIssues" :key="issue.field">
        <strong>{{ issue.label }}</strong>
        <span>{{ issue.prompt }}</span>
      </p>
    </div>

    <div v-if="validation.canGenerate && !validation.warningIssues.length" class="ready-state">
      当前档案已经足够完整，可以直接生成。
    </div>
  </section>
</template>

<style scoped>
.validation-panel {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card);
}

.score-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.score-row p {
  margin: 0 0 4px;
  font-size: 0.84rem;
  font-weight: 700;
  color: var(--text-primary);
}

.score-row span {
  font-size: 0.74rem;
  color: var(--text-secondary);
}

.score-row strong {
  font-size: 1.28rem;
  color: var(--primary-600);
}

.score-track {
  height: 7px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--bg-card-muted);
}

.score-track span {
  display: block;
  width: var(--score-width);
  height: 100%;
  border-radius: inherit;
  background: var(--primary-600);
}

.issue-counts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.issue-counts span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 28px;
  border: 1px solid var(--border-color);
  border-radius: 7px;
  background: var(--bg-card-muted);
  color: var(--text-secondary);
  font-size: 0.76rem;
  font-weight: 700;
}

.issue-counts .danger {
  border-color: var(--state-danger-border);
  background: var(--state-danger-bg);
  color: var(--state-danger-text);
}

.issue-counts .warning {
  border-color: var(--state-warning-border);
  background: var(--state-warning-bg);
  color: var(--state-warning-text);
}

.issue-group {
  display: grid;
  gap: 7px;
  padding-top: 10px;
  border-top: 1px solid var(--border-color);
}

.issue-group h3 {
  margin: 0;
  font-size: 0.78rem;
  color: var(--text-primary);
}

.issue-group p {
  display: grid;
  gap: 3px;
  margin: 0;
  padding: 8px 9px;
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
}

.issue-group strong {
  font-size: 0.75rem;
  color: var(--text-primary);
}

.issue-group span {
  font-size: 0.76rem;
  line-height: 1.42;
  color: var(--text-secondary);
}

.blocking p {
  border: 1px solid var(--state-danger-border);
  background: var(--state-danger-bg);
}

.warning p {
  border: 1px solid var(--state-warning-border);
  background: var(--state-warning-bg);
}

.ready-state {
  padding: 10px;
  border: 1px solid var(--state-success-border);
  border-radius: 8px;
  background: var(--state-success-bg);
  color: var(--state-success-text);
  font-size: 0.8rem;
  font-weight: 700;
  line-height: 1.5;
}
</style>
