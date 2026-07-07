<script setup lang="ts">
import InlineAiRichEditor from '@/components/resume/InlineAiRichEditor.vue'
import { useResumeStore } from '@/stores/resume'
import { ref } from 'vue'

const store = useResumeStore()
const collapsed = ref(false)

type WorkTextField = 'description' | 'contribution' | 'outcome'

function buildPersonalWorkAiContext(
  work: (typeof store.personalWorkList)[number],
  fieldKey: WorkTextField,
) {
  const fieldLabelMap: Record<WorkTextField, string> = {
    description: '作品简介',
    contribution: '我的贡献',
    outcome: '成果数据',
  }

  return {
    moduleKey: 'personalWorks' as const,
    moduleLabel: '个人作品',
    fieldKey,
    fieldLabel: fieldLabelMap[fieldKey],
    currentText: work[fieldKey],
    entryId: work.id,
    entryTitle: [work.name, work.type].filter(Boolean).join(' / '),
    entryMeta: {
      作品名称: work.name,
      作品类型: work.type,
      链接: work.link,
      技术栈: work.techStack,
      作品简介: fieldKey === 'contribution' || fieldKey === 'outcome' ? work.description : '',
      我的贡献: fieldKey === 'outcome' ? work.contribution : '',
    },
    targetJob: store.basicInfo.jobTitle?.trim() || '',
  }
}
</script>

<template>
  <section class="editor-section">
    <div class="section-header" @click="collapsed = !collapsed">
      <div class="section-toggle">
        <svg class="chevron" :class="{ rotated: !collapsed }" width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M6 4L10 8L6 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <h3>个人作品</h3>
      </div>
    </div>

    <div v-show="!collapsed" class="section-body compact-section-body">
      <div
        v-for="(work, index) in store.personalWorkList"
        :key="work.id"
        class="entry-card compact-entry-card"
      >
        <div class="entry-header">
          <span class="entry-index">个人作品 {{ index + 1 }}</span>
          <div
            v-if="store.personalWorkList.length > 1"
            class="entry-actions"
            aria-label="调整个人作品顺序"
          >
            <button
              type="button"
              class="btn-reorder"
              title="上移"
              aria-label="上移个人作品"
              :disabled="index === 0"
              @click.stop="store.movePersonalWork(work.id, 'up')"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M8 3.5L4.5 7M8 3.5L11.5 7M8 3.5V12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              class="btn-reorder"
              title="下移"
              aria-label="下移个人作品"
              :disabled="index === store.personalWorkList.length - 1"
              @click.stop="store.movePersonalWork(work.id, 'down')"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M8 12.5L4.5 9M8 12.5L11.5 9M8 12.5V3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              class="btn-remove"
              title="删除"
              aria-label="删除个人作品"
              @click.stop="store.removePersonalWork(work.id)"
            >
              x
            </button>
          </div>
        </div>

        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">作品名称</label>
            <input v-model="work.name" type="text" class="form-input" placeholder="例如：个人作品集 / 开源组件库" />
          </div>
          <div class="form-group">
            <label class="form-label">作品类型</label>
            <input v-model="work.type" type="text" class="form-input" placeholder="例如：Web 应用 / 文章 / Demo" />
          </div>
          <div class="form-group span-2">
            <label class="form-label">作品链接</label>
            <input v-model="work.link" type="url" class="form-input" placeholder="例如：https://github.com/example/repo" />
          </div>
          <div class="form-group span-2">
            <label class="form-label">技术栈 / 工具</label>
            <input v-model="work.techStack" type="text" class="form-input" placeholder="例如：Vue 3、Pinia、Vite、Figma" />
          </div>
        </div>

        <div class="form-group form-group-full">
          <InlineAiRichEditor
            v-model="work.description"
            :rows="3"
            label="作品简介"
            placeholder="用一句话说明作品用途、面向对象和核心能力..."
            :context="buildPersonalWorkAiContext(work, 'description')"
          />
        </div>
        <div class="form-group form-group-full">
          <InlineAiRichEditor
            v-model="work.contribution"
            :rows="4"
            label="我的贡献 / 亮点"
            placeholder="描述你负责的部分、关键设计或实现亮点..."
            :context="buildPersonalWorkAiContext(work, 'contribution')"
          />
        </div>
        <div class="form-group form-group-full">
          <InlineAiRichEditor
            v-model="work.outcome"
            :rows="2"
            label="成果数据"
            placeholder="例如：GitHub 120+ Star、日活 500、文章阅读 1.2w..."
            :context="buildPersonalWorkAiContext(work, 'outcome')"
          />
        </div>
      </div>

      <button class="btn-add compact-add-btn" @click="store.addPersonalWork()">
        <span class="btn-add-icon">+</span>
        添加个人作品
      </button>
    </div>
  </section>
</template>

<style scoped>
.editor-section {
  margin-bottom: var(--spacing-lg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  overflow: hidden;
  transition: border-color var(--transition-base);
}

.editor-section:hover {
  border-color: var(--border-color-strong);
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-lg) var(--spacing-xl);
  cursor: pointer;
  user-select: none;
  transition: background var(--transition-fast);
}

.section-header:hover {
  background: var(--gray-50);
}

.section-toggle {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.section-toggle h3 {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-primary);
}

.chevron {
  color: var(--text-secondary);
  transition: transform var(--transition-base);
  transform: rotate(0deg);
}

.chevron.rotated {
  transform: rotate(90deg);
}

.section-body {
  padding: 0 var(--spacing-xl) var(--spacing-xl);
}

.entry-card {
  padding: var(--spacing-lg);
  margin-bottom: var(--spacing-md);
  background: var(--gray-50);
  border-radius: var(--radius-md);
  border: 1px solid var(--gray-100);
}

.entry-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacing-md);
}

.entry-index {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--primary-600);
}

.entry-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.btn-reorder,
.btn-remove {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-secondary);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-reorder:hover:not(:disabled) {
  border-color: var(--primary-300);
  background: var(--primary-50);
  color: var(--primary-600);
}

.btn-reorder:disabled {
  color: var(--gray-400);
  background: var(--gray-100);
  border-color: transparent;
}

.btn-remove {
  font-size: 0.72rem;
  font-weight: 700;
}

.btn-remove:hover {
  border-color: var(--accent-red);
  background: rgba(216, 80, 80, 0.08);
  color: var(--accent-red);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: var(--spacing-md) var(--spacing-lg);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.form-group-full {
  margin-top: var(--spacing-md);
}

.span-2 {
  grid-column: span 2;
}

.form-label {
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--text-secondary);
}

.form-input {
  padding: var(--spacing-sm) var(--spacing-md);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  font-size: 0.88rem;
  color: var(--text-primary);
  background: var(--bg-card);
  transition: all var(--transition-fast);
  outline: none;
}

.form-input:focus {
  border-color: var(--primary-400);
}

.form-input::placeholder {
  color: var(--gray-400);
}

.btn-add {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  width: 100%;
  padding: var(--spacing-md);
  border: 2px dashed var(--primary-200);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--primary-600);
  font-size: 0.88rem;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-add:hover {
  background: var(--primary-50);
  border-color: var(--primary-400);
}

.btn-add-icon {
  font-size: 1.1rem;
  font-weight: 700;
}
</style>
