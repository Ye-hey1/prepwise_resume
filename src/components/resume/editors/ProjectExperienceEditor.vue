<script setup lang="ts">
import InlineAiRichEditor from '@/components/resume/InlineAiRichEditor.vue'
import { useResumeStore } from '@/stores/resume'
import { ref, reactive } from 'vue'
import { validateDateRange } from '@/utils/dateValidation'

const store = useResumeStore()
const collapsed = ref(false)

const dateErrors = reactive<Record<number, string>>({})

function validateEntryDates(index: number, start: string, end: string) {
  const result = validateDateRange(start, end)
  if (result.valid) {
    delete dateErrors[index]
  } else {
    dateErrors[index] = result.message ?? '日期格式有误'
  }
}

function buildProjectAiContext(
  proj: (typeof store.projectList)[number],
  fieldKey: 'introduction' | 'mainWork',
) {
  const fieldLabel = fieldKey === 'introduction' ? '项目介绍' : '主要工作'
  return {
    moduleKey: 'projectExperience' as const,
    moduleLabel: '项目经历',
    fieldKey,
    fieldLabel,
    currentText: proj[fieldKey],
    entryId: proj.id,
    entryTitle: [proj.name, proj.role].filter(Boolean).join(' / '),
    entryMeta: {
      项目名称: proj.name,
      角色: proj.role,
      时间: [proj.startDate, proj.endDate].filter(Boolean).join(' ~ '),
      链接: proj.link,
      项目介绍: fieldKey === 'mainWork' ? proj.introduction : '',
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
        <h3>项目经历</h3>
      </div>
    </div>

    <div v-show="!collapsed" class="section-body">
      <div
        v-for="(proj, index) in store.projectList"
        :key="proj.id"
        class="entry-card"
      >
        <div class="entry-header">
          <span class="entry-index">项目经历 {{ index + 1 }}</span>
          <button
            v-if="store.projectList.length > 1"
            class="btn-remove"
            @click="store.removeProject(proj.id)"
          >
            ✕
          </button>
        </div>

        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">项目名称</label>
            <input v-model="proj.name" type="text" class="form-input" placeholder="请输入项目名称" />
          </div>
          <div class="form-group">
            <label class="form-label">担任角色</label>
            <input v-model="proj.role" type="text" class="form-input" placeholder="例如：后端开发" />
          </div>
          <div class="form-group">
            <label class="form-label">开始时间</label>
            <input v-model="proj.startDate" type="month" class="form-input" :class="{ 'has-error': dateErrors[index] }" @blur="validateEntryDates(index, proj.startDate, proj.endDate)" />
          </div>
          <div class="form-group">
            <label class="form-label">结束时间</label>
            <input v-model="proj.endDate" type="month" class="form-input" :class="{ 'has-error': dateErrors[index] }" @blur="validateEntryDates(index, proj.startDate, proj.endDate)" />
            <span v-if="dateErrors[index]" class="form-error">{{ dateErrors[index] }}</span>
          </div>
          <div class="form-group span-2">
            <label class="form-label">项目链接</label>
            <input v-model="proj.link" type="text" class="form-input" placeholder="例如：https://www.example.com" />
          </div>
        </div>

        <div class="form-group form-group-full">
          <InlineAiRichEditor
            v-model="proj.introduction"
            :rows="3"
            label="项目介绍"
            placeholder="描述项目背景、技术栈、主要功能..."
            :context="buildProjectAiContext(proj, 'introduction')"
          />
        </div>
        <div class="form-group form-group-full">
          <InlineAiRichEditor
            v-model="proj.mainWork"
            :rows="5"
            label="主要工作"
            placeholder="描述你的职责、技术亮点和成果..."
            :context="buildProjectAiContext(proj, 'mainWork')"
          />
        </div>
      </div>

      <button class="btn-add" @click="store.addProject()">
        <span class="btn-add-icon">+</span>
        添加项目经历
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
  transition: box-shadow var(--transition-base);
}

.editor-section:hover {
  box-shadow: var(--shadow-sm);
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

.btn-remove {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: var(--gray-200);
  color: var(--gray-500);
  border-radius: 50%;
  cursor: pointer;
  font-size: 0.7rem;
  transition: all var(--transition-fast);
}

.btn-remove:hover {
  background: var(--accent-red);
  color: white;
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
  box-shadow: 0 0 0 3px var(--primary-50);
}

.form-input::placeholder {
  color: var(--gray-400);
}

.form-textarea {
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  font-size: 0.88rem;
  color: var(--text-primary);
  background: var(--bg-card);
  transition: all var(--transition-fast);
  outline: none;
  resize: vertical;
  line-height: 1.6;
}

.form-textarea:focus {
  border-color: var(--primary-400);
  box-shadow: 0 0 0 3px var(--primary-50);
}

.form-textarea::placeholder {
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

.form-error {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  color: #e05252;
  line-height: 1.4;
}
</style>
