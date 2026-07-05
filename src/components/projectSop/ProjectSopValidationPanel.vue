<script setup lang="ts">
import type { ProjectSopValidation } from '@/services/projectSop/types'

defineOptions({ name: 'ProjectSopValidationPanel' })

defineProps<{
  validation: ProjectSopValidation | null
}>()
</script>

<template>
  <section v-if="validation" class="validation-panel">
    <div class="score-row">
      <div>
        <p>档案完整度</p>
        <span>{{ validation.canGenerate ? '可以生成完整资产' : '仍有阻断级缺口' }}</span>
      </div>
      <strong>{{ validation.completeness }}%</strong>
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
  </section>
</template>

<style scoped>
.validation-panel {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
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
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--text-primary);
}

.score-row span {
  font-size: 0.78rem;
  color: var(--text-secondary);
}

.score-row strong {
  font-size: 1.45rem;
  color: var(--primary-600);
}

.issue-group {
  display: grid;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}

.issue-group h3 {
  margin: 0;
  font-size: 0.84rem;
  color: var(--text-primary);
}

.issue-group p {
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 9px 10px;
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
}

.issue-group strong {
  font-size: 0.78rem;
  color: var(--text-primary);
}

.issue-group span {
  font-size: 0.8rem;
  line-height: 1.45;
  color: var(--text-secondary);
}

.blocking p {
  border-left: 3px solid var(--danger-500, #ef4444);
}

.warning p {
  border-left: 3px solid var(--warning-500, #f59e0b);
}
</style>
