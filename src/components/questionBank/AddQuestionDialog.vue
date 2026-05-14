<script setup lang="ts">
import { ref, computed } from 'vue'
import { useQuestionBankStore, type SavedQuestion } from '@/stores/questionBank'

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved'): void
}>()

const qbStore = useQuestionBankStore()

const content = ref('')
const category = ref('技术原理')
const customCategory = ref('')
const tagInput = ref('')
const tags = ref<string[]>([])
const referenceAnswer = ref('')
const intent = ref('')
const isSaving = ref(false)
const saveError = ref('')

const categories = [
  '技术原理', '项目实战', '系统设计', '行为面试',
  '技术深挖', '算法', '场景设计', 'HR/谈薪',
  '大模型算法', '大模型应用开发', '产品经理',
]

const effectiveCategory = computed(() =>
  category.value === '__custom__' ? customCategory.value.trim() : category.value,
)

const canSave = computed(() =>
  content.value.trim().length >= 4 && effectiveCategory.value.length >= 2,
)

function addTag() {
  const t = tagInput.value.trim()
  if (t && !tags.value.includes(t) && tags.value.length < 8) {
    tags.value.push(t)
    tagInput.value = ''
  }
}

function removeTag(t: string) {
  tags.value = tags.value.filter((item) => item !== t)
}

function handleTagKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    addTag()
  }
}

async function handleSave() {
  if (!canSave.value || isSaving.value) return
  isSaving.value = true
  saveError.value = ''

  const success = await qbStore.addQuestion({
    content: content.value.trim(),
    category: effectiveCategory.value,
    tags: [...tags.value],
    reference_answer: referenceAnswer.value.trim(),
    user_notes: intent.value.trim() ? `考察意图：${intent.value.trim()}` : '',
    source: '手动添加',
  })

  isSaving.value = false
  if (success) emit('saved')
  else saveError.value = qbStore.mutationErrorMsg || '保存题目失败，请稍后重试'
}
</script>

<template>
  <div class="dialog-overlay" @click="emit('close')">
    <div class="dialog-window" @click.stop>
      <button class="close-btn" @click="emit('close')">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>

      <h2 class="dialog-title">添加题目</h2>
      <p class="dialog-sub">手动录入面试题目，支持自定义分类和标签</p>

      <div class="form-body custom-scroll">
        <label class="field">
          <span class="field-label">题目内容 <span class="required">*</span></span>
          <textarea v-model="content" class="field-textarea" rows="3" placeholder="输入面试题目..." />
        </label>

        <div class="field-row">
          <label class="field flex-1">
            <span class="field-label">分类 <span class="required">*</span></span>
            <select v-model="category" class="field-select">
              <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
              <option value="__custom__">自定义...</option>
            </select>
            <input
              v-if="category === '__custom__'"
              v-model="customCategory"
              class="field-input mt-1"
              placeholder="输入自定义分类名"
            />
          </label>

        </div>

        <label class="field">
          <span class="field-label">标签</span>
          <div class="tags-input">
            <span v-for="t in tags" :key="t" class="tag-chip">
              {{ t }}
              <button class="tag-remove" @click="removeTag(t)">&times;</button>
            </span>
            <input
              v-model="tagInput"
              class="tag-field"
              placeholder="输入标签，回车添加"
              @keydown="handleTagKeydown"
            />
          </div>
        </label>

        <label class="field">
          <span class="field-label">参考答案</span>
          <textarea v-model="referenceAnswer" class="field-textarea" rows="4" placeholder="可选：提供参考答案或答题思路..." />
        </label>

        <label class="field">
          <span class="field-label">考察意图</span>
          <input v-model="intent" class="field-input" placeholder="可选：面试官为什么要问这个问题？" />
        </label>
      </div>

      <div class="dialog-footer">
        <p v-if="saveError" class="save-error">{{ saveError }}</p>
        <button class="btn-cancel" @click="emit('close')">取消</button>
        <button class="btn-save" :disabled="!canSave || isSaving" @click="handleSave">
          {{ isSaving ? '保存中...' : '保存题目' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.dialog-window {
  width: 100%;
  max-width: 560px;
  max-height: 85vh;
  background: var(--bg-card);
  border-radius: 20px;
  border: 1px solid var(--border-color);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  position: relative;
  animation: slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes slide-up {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

.close-btn {
  position: absolute;
  top: 16px;
  right: 16px;
  background: var(--bg-card-muted);
  border: none;
  color: var(--text-secondary);
  width: 32px;
  height: 32px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.close-btn:hover {
  background: var(--accent-red);
  color: white;
}

.dialog-title {
  margin: 0;
  padding: 24px 24px 4px;
  font-size: 20px;
  font-weight: 900;
  color: var(--text-primary);
}

.dialog-sub {
  margin: 0;
  padding: 0 24px 16px;
  font-size: 13px;
  color: var(--text-muted);
}

.form-body {
  flex: 1;
  overflow-y: auto;
  padding: 0 24px 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.field.flex-1 { flex: 1; }
.field.field-sm { min-width: 120px; }

.field-label {
  font-size: 12px;
  font-weight: 800;
  color: var(--text-secondary);
  letter-spacing: 0.02em;
}

.required { color: var(--accent-red); }

.field-input,
.field-select,
.field-textarea {
  width: 100%;
  padding: 10px 14px;
  border: 1.5px solid var(--border-color);
  border-radius: 10px;
  font-size: 14px;
  background: var(--bg-card-muted);
  color: var(--text-primary);
  font-family: inherit;
  transition: border-color 0.2s;
}

.field-input:focus,
.field-select:focus,
.field-textarea:focus {
  outline: none;
  border-color: var(--primary-500);
}

.field-textarea {
  resize: vertical;
  min-height: 60px;
  line-height: 1.6;
}

.mt-1 { margin-top: 4px; }

.difficulty-picker {
  display: flex;
  gap: 4px;
}

.diff-star {
  background: none;
  border: none;
  font-size: 20px;
  color: var(--border-color);
  cursor: pointer;
  transition: color 0.15s;
  padding: 0;
  line-height: 1;
}

.diff-star.active {
  color: #f59e0b;
}

.tags-input {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 12px;
  border: 1.5px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card-muted);
  min-height: 40px;
  align-items: center;
  transition: border-color 0.2s;
}

.tags-input:focus-within {
  border-color: var(--primary-500);
}

.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 8px;
  border-radius: 6px;
  background: var(--primary-500);
  color: white;
  font-size: 12px;
  font-weight: 700;
}

.tag-remove {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  font-size: 14px;
  padding: 0;
  line-height: 1;
}

.tag-field {
  flex: 1;
  min-width: 80px;
  border: none;
  background: transparent;
  font-size: 13px;
  color: var(--text-primary);
  outline: none;
}

.dialog-footer {
  padding: 16px 24px;
  border-top: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.save-error {
  margin: 0 auto 0 0;
  color: var(--accent-red);
  font-size: 12px;
  line-height: 1.4;
}

.btn-cancel,
.btn-save {
  min-height: 38px;
  padding: 0 20px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}

.btn-cancel {
  background: var(--bg-card-muted);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
}

.btn-save {
  background: linear-gradient(135deg, var(--primary-500), var(--primary-600));
  color: var(--text-inverse);
}

.btn-save:disabled { opacity: 0.5; cursor: not-allowed; }

.custom-scroll::-webkit-scrollbar { width: 5px; }
.custom-scroll::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 10px; }
</style>
