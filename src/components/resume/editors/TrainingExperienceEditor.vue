<script setup lang="ts">
import InlineAiRichEditor from '@/components/resume/InlineAiRichEditor.vue'
import { useResumeStore } from '@/stores/resume'
import { validateDateRange } from '@/utils/dateValidation'
import { reactive, ref } from 'vue'

const store = useResumeStore()
const collapsed = ref(false)
const dateErrors = reactive<Record<string, string>>({})

type TrainingTextField = 'description' | 'outcome'

function validateEntryDates(id: string, start: string, end: string) {
  const result = validateDateRange(start, end)
  if (result.valid) {
    delete dateErrors[id]
    return
  }
  dateErrors[id] = result.message ?? '日期格式有误'
}

function buildTrainingAiContext(
  training: (typeof store.trainingList)[number],
  fieldKey: TrainingTextField,
) {
  return {
    moduleKey: 'trainingExperience' as const,
    moduleLabel: '培训经历',
    fieldKey,
    fieldLabel: fieldKey === 'description' ? '培训内容' : '成果收获',
    currentText: training[fieldKey],
    entryId: training.id,
    entryTitle: [training.institution, training.course].filter(Boolean).join(' / '),
    entryMeta: {
      培训机构: training.institution,
      课程名称: training.course,
      证书资质: training.credential,
      时间: [training.startDate, training.endDate].filter(Boolean).join(' ~ '),
      地点: training.location,
      培训内容: fieldKey === 'outcome' ? training.description : '',
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
        <h3>培训经历</h3>
      </div>
    </div>

    <div v-show="!collapsed" class="section-body compact-section-body">
      <div
        v-for="(training, index) in store.trainingList"
        :key="training.id"
        class="entry-card compact-entry-card"
      >
        <div class="entry-header">
          <span class="entry-index">培训经历 {{ index + 1 }}</span>
          <div
            v-if="store.trainingList.length > 1"
            class="entry-actions"
            aria-label="调整培训经历顺序"
          >
            <button
              type="button"
              class="btn-reorder"
              title="上移"
              aria-label="上移培训经历"
              :disabled="index === 0"
              @click.stop="store.moveTraining(training.id, 'up')"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M8 3.5L4.5 7M8 3.5L11.5 7M8 3.5V12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              class="btn-reorder"
              title="下移"
              aria-label="下移培训经历"
              :disabled="index === store.trainingList.length - 1"
              @click.stop="store.moveTraining(training.id, 'down')"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M8 12.5L4.5 9M8 12.5L11.5 9M8 12.5V3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              class="btn-remove"
              title="删除"
              aria-label="删除培训经历"
              @click.stop="store.removeTraining(training.id)"
            >
              x
            </button>
          </div>
        </div>

        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">培训机构</label>
            <input v-model="training.institution" type="text" class="form-input" placeholder="例如：Coursera / 极客时间 / 内部培训" />
          </div>
          <div class="form-group">
            <label class="form-label">课程名称</label>
            <input v-model="training.course" type="text" class="form-input" placeholder="例如：系统设计训练营" />
          </div>
          <div class="form-group">
            <label class="form-label">证书 / 资质</label>
            <input v-model="training.credential" type="text" class="form-input" placeholder="例如：认证证书 / 结业证书" />
          </div>
          <div class="form-group">
            <label class="form-label">地点 / 形式</label>
            <input v-model="training.location" type="text" class="form-input" placeholder="例如：线上 / 上海" />
          </div>
          <div class="form-group">
            <label class="form-label">开始时间</label>
            <input v-model="training.startDate" type="month" class="form-input" :class="{ 'has-error': dateErrors[training.id] }" @blur="validateEntryDates(training.id, training.startDate, training.endDate)" />
          </div>
          <div class="form-group">
            <label class="form-label">结束时间</label>
            <input v-model="training.endDate" type="month" class="form-input" :class="{ 'has-error': dateErrors[training.id] }" @blur="validateEntryDates(training.id, training.startDate, training.endDate)" />
            <span v-if="dateErrors[training.id]" class="form-error">{{ dateErrors[training.id] }}</span>
          </div>
        </div>

        <div class="form-group form-group-full">
          <InlineAiRichEditor
            v-model="training.description"
            :rows="3"
            label="培训内容"
            placeholder="描述课程主题、学习内容、训练项目或核心模块..."
            :context="buildTrainingAiContext(training, 'description')"
          />
        </div>
        <div class="form-group form-group-full">
          <InlineAiRichEditor
            v-model="training.outcome"
            :rows="2"
            label="成果收获"
            placeholder="描述证书、作品、考核结果或对目标岗位有帮助的能力提升..."
            :context="buildTrainingAiContext(training, 'outcome')"
          />
        </div>
      </div>

      <button class="btn-add compact-add-btn" @click="store.addTraining()">
        <span class="btn-add-icon">+</span>
        添加培训经历
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

.form-error {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  color: #e05252;
  line-height: 1.4;
}
</style>
