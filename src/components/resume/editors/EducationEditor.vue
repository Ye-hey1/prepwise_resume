<script setup lang="ts">
import InlineAiRichEditor from '@/components/resume/InlineAiRichEditor.vue'
import { useResumeStore } from '@/stores/resume'
import { ref, reactive } from 'vue'
import { validateDateRange } from '@/utils/dateValidation'

const store = useResumeStore()
const collapsed = ref(false)
const educationTagOptions = ['985', '211', '双一流', '职业培训', '海外院校', '重点本科']

const dateErrors = reactive<Record<string, string>>({})

function validateEntryDates(id: string, start: string, end: string) {
  const result = validateDateRange(start, end)
  if (result.valid) {
    delete dateErrors[id]
  } else {
    dateErrors[id] = result.message ?? '日期格式有误'
  }
}

function buildEducationAiContext(edu: (typeof store.educationList)[number]) {
  const tags = Array.isArray(edu.tags) ? edu.tags : []

  return {
    moduleKey: 'education' as const,
    moduleLabel: '教育经历',
    fieldKey: 'description',
    fieldLabel: '在校经历',
    currentText: edu.description,
    entryId: edu.id,
    entryTitle: [edu.school, edu.major].filter(Boolean).join(' / '),
    entryMeta: {
      学校: edu.school,
      学院: edu.college,
      专业: edu.major,
      学历: edu.degree,
      教育标签: tags.join('、'),
      时间: [edu.startDate, edu.endDate].filter(Boolean).join(' ~ '),
      GPA: edu.gpa,
    },
    targetJob: store.basicInfo.jobTitle?.trim() || '',
  }
}

function isEducationTagSelected(edu: (typeof store.educationList)[number], tag: string): boolean {
  return Array.isArray(edu.tags) && edu.tags.includes(tag)
}

function toggleEducationTag(edu: (typeof store.educationList)[number], tag: string) {
  const tags = Array.isArray(edu.tags) ? edu.tags : []

  if (tags.includes(tag)) {
    edu.tags = tags.filter((item) => item !== tag)
    return
  }
  edu.tags = [...tags, tag]
}
</script>

<template>
  <section class="editor-section">
    <div class="section-header" @click="collapsed = !collapsed">
      <div class="section-toggle">
        <svg class="chevron" :class="{ rotated: !collapsed }" width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M6 4L10 8L6 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <h3>教育经历</h3>
      </div>
    </div>

    <div v-show="!collapsed" class="section-body compact-section-body">
      <div
        v-for="(edu, index) in store.educationList"
        :key="edu.id"
        class="entry-card compact-entry-card"
      >
        <div class="entry-header">
          <span class="entry-index">教育经历 {{ index + 1 }}</span>
          <div
            v-if="store.educationList.length > 1"
            class="entry-actions"
            aria-label="调整教育经历顺序"
          >
            <button
              type="button"
              class="btn-reorder"
              title="上移"
              aria-label="上移教育经历"
              :disabled="index === 0"
              @click.stop="store.moveEducation(edu.id, 'up')"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M8 3.5L4.5 7M8 3.5L11.5 7M8 3.5V12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              class="btn-reorder"
              title="下移"
              aria-label="下移教育经历"
              :disabled="index === store.educationList.length - 1"
              @click.stop="store.moveEducation(edu.id, 'down')"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M8 12.5L4.5 9M8 12.5L11.5 9M8 12.5V3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              class="btn-remove"
              title="删除"
              aria-label="删除教育经历"
              @click.stop="store.removeEducation(edu.id)"
            >
              ✕
            </button>
          </div>
        </div>

        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">学校</label>
            <input v-model="edu.school" type="text" class="form-input" placeholder="请输入学校名称" />
          </div>
          <div class="form-group">
            <label class="form-label">学院</label>
            <input v-model="edu.college" type="text" class="form-input" placeholder="请输入学院/院系" />
          </div>
          <div class="form-group">
            <label class="form-label">专业</label>
            <input v-model="edu.major" type="text" class="form-input" placeholder="请输入专业" />
          </div>
          <div class="form-group">
            <label class="form-label">学历</label>
            <select v-model="edu.degree" class="form-input">
              <option value="">请选择</option>
              <option value="大专">大专</option>
              <option value="本科">本科</option>
              <option value="硕士">硕士</option>
              <option value="博士">博士</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">所在城市</label>
            <input v-model="edu.location" type="text" class="form-input" placeholder="例如：广州" />
          </div>
          <div class="form-group">
            <label class="form-label">开始时间</label>
            <input v-model="edu.startDate" type="month" class="form-input" :class="{ 'has-error': dateErrors[edu.id] }" @blur="validateEntryDates(edu.id, edu.startDate, edu.endDate)" />
          </div>
          <div class="form-group">
            <label class="form-label">结束时间</label>
            <input v-model="edu.endDate" type="month" class="form-input" :class="{ 'has-error': dateErrors[edu.id] }" @blur="validateEntryDates(edu.id, edu.startDate, edu.endDate)" />
            <span v-if="dateErrors[edu.id]" class="form-error">{{ dateErrors[edu.id] }}</span>
          </div>
          <div class="form-group">
            <label class="form-label">学历类型</label>
            <select v-model="edu.type" class="form-input">
              <option value="">请选择</option>
              <option value="全日制">全日制</option>
              <option value="非全日制">非全日制</option>
              <option value="自考">自考</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">GPA</label>
            <input v-model="edu.gpa" type="text" class="form-input" placeholder="例如：3.8/4.0" />
          </div>
        </div>

        <div class="form-group form-group-full">
          <label class="form-label">教育标签</label>
          <div class="tag-picker" aria-label="选择教育标签">
            <button
              v-for="tag in educationTagOptions"
              :key="tag"
              type="button"
              class="tag-option"
              :class="{ active: isEducationTagSelected(edu, tag) }"
              :aria-pressed="isEducationTagSelected(edu, tag)"
              @click="toggleEducationTag(edu, tag)"
            >
              {{ tag }}
            </button>
          </div>
        </div>

        <div class="form-group form-group-full">
          <InlineAiRichEditor
            v-model="edu.description"
            :rows="3"
            label="在校经历"
            placeholder="描述在校期间的重要经历、活动或成就..."
            :context="buildEducationAiContext(edu)"
          />
        </div>
      </div>

      <button class="btn-add compact-add-btn" @click="store.addEducation()">
        <span class="btn-add-icon">+</span>
        添加教育经历
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
  box-shadow: none;
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

.btn-reorder {
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
  box-shadow: none;
}

.form-input::placeholder {
  color: var(--gray-400);
}

.tag-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag-option {
  min-height: 30px;
  padding: 0 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-full);
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    background-color var(--transition-fast),
    border-color var(--transition-fast),
    color var(--transition-fast),
    color var(--transition-fast);
}

.tag-option:hover {
  border-color: var(--primary-300);
  color: var(--primary-600);
  background: var(--primary-50);
}

.tag-option.active {
  border-color: var(--primary-400);
  color: var(--primary-700);
  background: var(--primary-50);
  box-shadow: none;
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
  box-shadow: none;
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
