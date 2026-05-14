<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAiConfigStore } from '@/stores/aiConfig'
import { useJdAnalysisStore } from '@/stores/jdAnalysis'
import { useQuestionBankStore, type SavedQuestion } from '@/stores/questionBank'
import { generateInterviewBank } from '@/services/jd/interviewBank'
import { formatResumeForAI } from '@/services/jdService'
import { useResumeStore } from '@/stores/resume'
import type { InterviewQuestion } from '@/services/jd/interviewBank'
import type { JDData } from '@/services/types/jd'

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved', count: number): void
}>()

const aiConfig = useAiConfigStore()
const jdStore = useJdAnalysisStore()
const qbStore = useQuestionBankStore()
const resumeStore = useResumeStore()

const jdText = ref(jdStore.jdText || '')
const isGenerating = ref(false)
const isSaving = ref(false)
const errorMsg = ref('')
const generatedQuestions = ref<InterviewQuestion[]>([])
const selectedIds = ref<Set<string>>(new Set())

const hasExistingJd = computed(() => jdStore.jdText.trim().length > 0)

const canGenerate = computed(() =>
  jdText.value.trim().length > 0 && aiConfig.isConfigured && !isGenerating.value,
)

const allSelected = computed(() =>
  generatedQuestions.value.length > 0 &&
  generatedQuestions.value.every((q) => selectedIds.value.has(q.id)),
)

function toggleAll() {
  if (allSelected.value) {
    selectedIds.value = new Set()
  } else {
    selectedIds.value = new Set(generatedQuestions.value.map((q) => q.id))
  }
}

function toggleOne(id: string) {
  const next = new Set(selectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedIds.value = next
}

function useExistingJd() {
  jdText.value = jdStore.jdText
}

function buildFallbackJdData(): JDData {
  const pastedJd = jdText.value.trim()
  return {
    basicInfo: {
      jobTitle: '目标岗位',
      company: '',
      location: '',
      jobType: '',
      department: '',
    },
    requirements: {
      degree: '',
      experience: '',
      techStack: [],
      mustHave: [],
      niceToHave: [],
      jobDuties: pastedJd ? [pastedJd] : [],
    },
  }
}

async function handleGenerate() {
  if (!canGenerate.value) return
  isGenerating.value = true
  errorMsg.value = ''
  generatedQuestions.value = []
  selectedIds.value = new Set()

  try {
    const resumeText = formatResumeForAI(
      resumeStore.exportToJSON() as Parameters<typeof formatResumeForAI>[0],
    )

    const batch = await generateInterviewBank(
      aiConfig.getConfigForFeature('jdInterview'),
      jdStore.jdData ?? buildFallbackJdData(),
      resumeText,
      jdStore.matchResult,
      [],
      [],
      {
        onChunk: () => {},
        onDone: () => {},
        onError: () => {},
      },
    )

    generatedQuestions.value = batch.questions
    // 默认全选
    selectedIds.value = new Set(batch.questions.map((q) => q.id))
  } catch (err: any) {
    errorMsg.value = err?.message || '生成题目失败'
  } finally {
    isGenerating.value = false
  }
}

async function handleSaveSelected() {
  if (selectedIds.value.size === 0 || isSaving.value) return
  isSaving.value = true
  errorMsg.value = ''

  const items: SavedQuestion[] = generatedQuestions.value
    .filter((q) => selectedIds.value.has(q.id))
    .map((q) => ({
      content: q.question,
      category: q.category,
      tags: q.keyPoints.slice(0, 5),
      reference_answer: q.sampleAnswer || '',
      user_notes: [q.context, q.answerStructure ? `答题结构：${q.answerStructure}` : '']
        .filter(Boolean)
        .join('\n\n'),
      source: 'JD深挖题',
    }))

  const count = await qbStore.addQuestionBatch(items)
  isSaving.value = false
  if (count > 0) emit('saved', count)
  else errorMsg.value = qbStore.mutationErrorMsg || '保存题目失败，请稍后重试'
}
</script>

<template>
  <div class="dialog-overlay" @click="emit('close')">
    <div class="dialog-window" @click.stop>
      <button class="close-btn" @click="emit('close')">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>

      <h2 class="dialog-title">AI 生成题目</h2>
      <p class="dialog-sub">基于 JD 岗位要求，一键生成针对性面试题</p>

      <div class="dialog-body custom-scroll">
        <!-- JD 输入区 -->
        <div class="section">
          <div class="section-head">
            <span class="section-label">岗位描述 (JD)</span>
            <button v-if="hasExistingJd && !jdText" class="use-existing-btn" @click="useExistingJd">
              使用当前分析中的 JD
            </button>
          </div>
          <textarea
            v-model="jdText"
            class="jd-textarea"
            rows="4"
            placeholder="粘贴目标岗位 JD 文本..."
          />
        </div>

        <button
          class="generate-btn"
          :disabled="!canGenerate"
          @click="handleGenerate"
        >
          {{ isGenerating ? '生成中...' : '生成面试题' }}
        </button>

        <p v-if="errorMsg" class="error-text">{{ errorMsg }}</p>

        <!-- 生成结果 -->
        <div v-if="generatedQuestions.length" class="results">
          <div class="results-head">
            <label class="select-all">
              <input type="checkbox" :checked="allSelected" @change="toggleAll" />
              <span>全选 ({{ selectedIds.size }}/{{ generatedQuestions.length }})</span>
            </label>
          </div>

          <div class="result-list">
            <label
              v-for="q in generatedQuestions"
              :key="q.id"
              class="result-item"
              :class="{ selected: selectedIds.has(q.id) }"
            >
              <input
                type="checkbox"
                :checked="selectedIds.has(q.id)"
                @change="toggleOne(q.id)"
              />
              <div class="result-content">
                <span class="result-category">{{ q.category }}</span>
                <p class="result-question">{{ q.question }}</p>
              </div>
            </label>
          </div>

          <button
            class="save-btn"
            :disabled="selectedIds.size === 0 || isSaving"
            @click="handleSaveSelected"
          >
            {{ isSaving ? '保存中...' : `收藏选中 (${selectedIds.size})` }}
          </button>
        </div>
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
  max-width: 640px;
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

.close-btn:hover { background: var(--accent-red); color: white; }

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

.dialog-body {
  flex: 1;
  overflow-y: auto;
  padding: 0 24px 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.section { display: flex; flex-direction: column; gap: 8px; }

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-label {
  font-size: 12px;
  font-weight: 800;
  color: var(--text-secondary);
}

.use-existing-btn {
  background: none;
  border: 1px dashed var(--primary-500);
  color: var(--primary-500);
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

.jd-textarea {
  width: 100%;
  padding: 12px 14px;
  border: 1.5px solid var(--border-color);
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.6;
  background: var(--bg-card-muted);
  color: var(--text-primary);
  resize: vertical;
  font-family: inherit;
}

.jd-textarea:focus { outline: none; border-color: var(--primary-500); }

.generate-btn {
  min-height: 42px;
  border: none;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--primary-500), var(--primary-600));
  color: var(--text-inverse);
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
  transition: opacity 0.2s;
}

.generate-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.error-text {
  margin: 0;
  font-size: 13px;
  color: var(--accent-red);
}

.results {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.results-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.select-all {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-secondary);
  cursor: pointer;
}

.result-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 300px;
  overflow-y: auto;
}

.result-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border: 1.5px solid var(--border-color);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s;
}

.result-item:hover { border-color: var(--primary-300); }
.result-item.selected { border-color: var(--primary-500); background: color-mix(in srgb, var(--primary-500) 4%, var(--bg-card)); }

.result-content {
  flex: 1;
  min-width: 0;
}

.result-category {
  display: inline-block;
  font-size: 10px;
  font-weight: 800;
  color: var(--primary-500);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 2px;
}

.result-question {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-primary);
}

.save-btn {
  min-height: 40px;
  border: none;
  border-radius: 10px;
  background: linear-gradient(135deg, #10b981, #059669);
  color: white;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
  transition: opacity 0.2s;
}

.save-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.custom-scroll::-webkit-scrollbar { width: 5px; }
.custom-scroll::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 10px; }
</style>
