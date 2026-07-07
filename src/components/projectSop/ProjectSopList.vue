<script setup lang="ts">
import type { ProjectSopDossier, ProjectSopValidation } from '@/services/projectSop/types'

defineOptions({ name: 'ProjectSopList' })

defineProps<{
  dossiers: ProjectSopDossier[]
  activeId: string
  validationById: Record<string, ProjectSopValidation>
}>()

const emit = defineEmits<{
  (e: 'create-blank'): void
  (e: 'import-resume-project'): void
  (e: 'select', id: string): void
  (e: 'duplicate', id: string): void
  (e: 'delete', id: string): void
}>()

function formatDate(value: string): string {
  if (!value) return '未生成'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '未生成'
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}
</script>

<template>
  <aside class="project-sop-list">
    <div class="list-header">
      <div>
        <p class="eyebrow">Project SOP</p>
        <h2>项目档案</h2>
      </div>
      <button type="button" class="icon-btn" title="新建档案" @click="emit('create-blank')">
        +
      </button>
    </div>

    <button
      type="button"
      class="import-btn"
      @click="emit('import-resume-project')"
      @pointerdown.left.prevent="emit('import-resume-project')"
    >
      从简历项目导入
    </button>

    <div v-if="dossiers.length" class="list-items">
      <article
        v-for="dossier in dossiers"
        :key="dossier.id"
        class="dossier-card"
        :class="{ active: dossier.id === activeId }"
      >
        <button type="button" class="dossier-main" @click="emit('select', dossier.id)">
          <span class="dossier-title">{{ dossier.name || '未命名项目' }}</span>
          <span class="dossier-meta">
            {{ dossier.source === 'resume_project' ? '简历导入' : '手动创建' }}
            · 完整度 {{ validationById[dossier.id]?.completeness ?? 0 }}%
          </span>
          <span class="dossier-meta">
            {{ dossier.linkedJdAnalysisId ? '已关联 JD' : '未关联 JD' }}
            · 更新 {{ formatDate(dossier.updatedAt) }}
          </span>
        </button>
        <div class="dossier-actions">
          <button type="button" @click.stop="emit('duplicate', dossier.id)">复制</button>
          <button type="button" class="danger" @click.stop="emit('delete', dossier.id)">删除</button>
        </div>
      </article>
    </div>

    <div v-else class="empty-list">
      <p>还没有项目档案。</p>
      <span>从简历项目导入可以最快开始。</span>
    </div>
  </aside>
</template>

<style scoped>
.project-sop-list {
  position: sticky;
  top: 0;
  width: 100%;
  min-width: 0;
  max-height: calc(100vh - 120px);
  padding: 16px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
  overflow: auto;
}

.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.eyebrow {
  margin: 0 0 4px;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0;
  color: var(--primary-600);
}

h2 {
  margin: 0;
  font-size: 1.1rem;
  color: var(--text-primary);
}

.icon-btn,
.import-btn,
.dossier-actions button {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-elevated);
  color: var(--text-primary);
  cursor: pointer;
  transition: background-color var(--transition-fast), border-color var(--transition-fast);
}

.icon-btn {
  width: 40px;
  height: 40px;
  font-size: 1.2rem;
  line-height: 1;
}

.icon-btn:hover,
.import-btn:hover,
.dossier-actions button:hover {
  border-color: var(--primary-300);
  background: var(--primary-50);
}

.import-btn {
  width: 100%;
  min-height: 42px;
  margin-bottom: 16px;
  border-color: var(--primary-600);
  background: var(--primary-600);
  color: #fff;
  font-weight: 600;
}

.import-btn:hover {
  border-color: var(--primary-700);
  background: var(--primary-700);
}

.list-items {
  display: grid;
  gap: 10px;
}

.dossier-card {
  position: relative;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-elevated);
  overflow: hidden;
  transition: background-color var(--transition-fast), border-color var(--transition-fast);
}

.dossier-card.active {
  border-color: var(--primary-400);
  background: var(--primary-50);
}

.dossier-main {
  width: 100%;
  padding: 14px 14px 10px;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.dossier-title,
.dossier-meta {
  display: block;
}

.dossier-title {
  margin-bottom: 6px;
  font-size: 0.94rem;
  font-weight: 700;
  color: var(--text-primary);
}

.dossier-meta {
  font-size: 0.78rem;
  line-height: 1.55;
  color: var(--text-secondary);
}

.dossier-actions {
  display: flex;
  gap: 8px;
  padding: 0 14px 14px;
}

.dossier-actions button {
  min-height: 32px;
  padding: 0 10px;
  font-size: 0.78rem;
}

.dossier-actions .danger {
  color: var(--danger-600, #c2410c);
}

.empty-list {
  padding: 18px 12px;
  border: 1px dashed var(--border-color);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
}

.empty-list p {
  margin: 0 0 6px;
  color: var(--text-primary);
  font-weight: 600;
}

.empty-list span {
  font-size: 0.82rem;
}

@media (max-width: 1120px) {
  .project-sop-list {
    position: static;
    max-height: none;
  }
}
</style>
