<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useQuestionBankStore } from '@/stores/questionBank'
import type { DrillAnswer, DrillQuestion } from '@/components/ai/interview/types'

const props = defineProps<{
  questions: DrillQuestion[]
  isLoading: boolean
  errorMsg: string
  canStart: boolean
}>()

const emit = defineEmits<{
  (e: 'generate'): void
  (e: 'submit', answers: DrillAnswer[]): void
  (e: 'back'): void
}>()

const qbStore = useQuestionBankStore()

const currentIndex = ref(0)
const answers = ref<Record<number, string>>({})
const draftAnswer = ref('')
const showFramework = ref(true)
const revealSample = ref(false)
const submitting = ref(false)
const saveSuccessMarker = ref<Record<number, boolean>>({})
const textareaRef = ref<HTMLTextAreaElement | null>(null)

const totalQ = computed(() => props.questions.length)
const currentQ = computed(() => props.questions[currentIndex.value] ?? null)
const progressPercent = computed(() => totalQ.value > 0 ? ((currentIndex.value + 1) / totalQ.value) * 100 : 0)
const answeredCount = computed(() => Object.values(answers.value).filter((value) => value.trim() !== '').length)
const trainingStatus = computed(() => {
  if (props.isLoading) return '正在生成训练题'
  if (!props.questions.length) return '等待开始训练'
  return answeredCount.value === totalQ.value ? '已完成全部题目' : `已完成 ${answeredCount.value} / ${totalQ.value}`
})

function applyCurrentDraft() {
  if (!currentQ.value) return
  draftAnswer.value = answers.value[currentQ.value.id] || ''
}

function goToQuestion(index: number) {
  currentIndex.value = index
  revealSample.value = false
  nextTick(() => textareaRef.value?.focus())
}

function handlePrev() {
  if (currentIndex.value <= 0) return
  goToQuestion(currentIndex.value - 1)
}

function handleSkip() {
  if (currentIndex.value >= totalQ.value - 1) return
  goToQuestion(currentIndex.value + 1)
}

function persistCurrentAnswer() {
  if (!currentQ.value) return false
  const text = draftAnswer.value.trim()
  if (!text) return false
  answers.value = { ...answers.value, [currentQ.value.id]: text }
  return true
}

function handleSubmitCurrent() {
  if (!persistCurrentAnswer()) return
  if (currentIndex.value < totalQ.value - 1) {
    goToQuestion(currentIndex.value + 1)
    return
  }
  handleFinish()
}

function handleFinish() {
  if (submitting.value) return
  submitting.value = true
  const answerList: DrillAnswer[] = props.questions.map((q) => ({
    questionId: q.id,
    answer: answers.value[q.id] || '',
  }))
  emit('submit', answerList)
}

async function handleCollectQuestion() {
  const q = currentQ.value
  if (!q || saveSuccessMarker.value[q.id] || qbStore.isLoading) return

  const success = await qbStore.addQuestion({
    content: q.question,
    category: q.category,
    tags: [q.focusArea].filter(Boolean),
    reference_answer: q.sampleAnswer || q.referenceAnswer || '',
    user_notes: answers.value[q.id] || '',
    source: '专项训练抽取',
    difficulty: q.difficulty,
    focus_area: q.focusArea,
    intent: q.intent,
    framework: q.framework,
  })

  if (success) {
    saveSuccessMarker.value = { ...saveSuccessMarker.value, [q.id]: true }
  }
}

function handleKeyDown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey || (event as KeyboardEvent & { isComposing?: boolean }).isComposing) return
  event.preventDefault()
  handleSubmitCurrent()
}

watch(currentIndex, applyCurrentDraft)
watch(() => props.questions, () => {
  if (props.questions.length === 0) {
    currentIndex.value = 0
    draftAnswer.value = ''
    return
  }

  if (currentIndex.value >= props.questions.length) {
    currentIndex.value = 0
  }
  applyCurrentDraft()
}, { immediate: true })
</script>

<template>
  <section class="drill-panel">
    <header class="drill-header">
      <div class="drill-header-copy">
        <span class="drill-kicker">Targeted Practice</span>
        <h2 class="drill-title">专项训练工作区</h2>
        <p class="drill-desc">把高风险追问拆成一题一练，逐步补强项目表达、知识深度和回答结构。</p>
      </div>

      <div class="drill-header-stats">
        <div class="header-stat">
          <span class="header-stat-label">训练状态</span>
          <strong>{{ trainingStatus }}</strong>
        </div>
        <div class="header-stat">
          <span class="header-stat-label">当前题目</span>
          <strong>{{ totalQ > 0 ? `${currentIndex + 1} / ${totalQ}` : '未开始' }}</strong>
        </div>
      </div>
    </header>

    <div v-if="!questions.length" class="drill-empty">
      <div class="empty-main">
        <span class="empty-badge">Ready</span>
        <h3>先生成一组针对当前岗位的训练题</h3>
        <p>系统会结合岗位 JD、简历重点和已有面试记录，为你生成更适合本轮准备的训练题。</p>
        <div class="empty-actions">
          <button class="btn btn-secondary" type="button" @click="emit('back')">返回岗位准备</button>
          <button class="btn btn-primary" :disabled="!canStart || isLoading" type="button" @click="emit('generate')">
            {{ isLoading ? '生成中...' : '生成专项训练' }}
          </button>
        </div>
        <p v-if="errorMsg" class="empty-error">{{ errorMsg }}</p>
      </div>
    </div>

    <div v-else class="drill-workspace">
      <aside class="drill-sidebar">
        <section class="sidebar-card">
          <div class="sidebar-head">
            <span class="sidebar-label">训练进度</span>
            <span class="sidebar-value">{{ answeredCount }}/{{ totalQ }}</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" :style="{ width: `${progressPercent}%` }" />
          </div>
          <p class="sidebar-text">先完成全部题目，再统一交给系统做这一轮训练复盘。</p>
        </section>

        <section class="sidebar-card">
          <div class="sidebar-head">
            <span class="sidebar-label">题目列表</span>
            <button class="mini-btn" type="button" :disabled="isLoading" @click="emit('generate')">重新生成</button>
          </div>
          <div class="question-list">
            <button
              v-for="(question, idx) in questions"
              :key="question.id"
              class="question-chip"
              :class="{ active: idx === currentIndex, done: !!answers[question.id]?.trim() }"
              type="button"
              @click="goToQuestion(idx)"
            >
              <span class="chip-index">{{ String(idx + 1).padStart(2, '0') }}</span>
              <span class="chip-copy">
                <strong>{{ question.category }}</strong>
                <span>{{ question.focusArea }}</span>
              </span>
            </button>
          </div>
        </section>

        <section class="sidebar-card" v-if="currentQ">
          <div class="sidebar-head">
            <span class="sidebar-label">当前题目属性</span>
          </div>
          <div class="meta-list">
            <div class="meta-row">
              <span>类型</span>
              <strong>{{ currentQ.category }}</strong>
            </div>
            <div class="meta-row">
              <span>聚焦点</span>
              <strong>{{ currentQ.focusArea }}</strong>
            </div>
            <div class="meta-row">
              <span>难度</span>
              <strong>{{ currentQ.difficulty }}/5</strong>
            </div>
          </div>
        </section>
      </aside>

      <main class="drill-main" v-if="currentQ">
        <section class="main-card question-card">
          <div class="question-topline">
            <div class="question-tags">
              <span class="tag tag-blue">{{ currentQ.category }}</span>
              <span class="tag tag-cyan">{{ currentQ.focusArea }}</span>
            </div>
            <button
              class="collect-btn"
              :class="{ saved: saveSuccessMarker[currentQ.id] }"
              :disabled="saveSuccessMarker[currentQ.id] || qbStore.isLoading"
              type="button"
              @click="handleCollectQuestion"
            >
              {{ saveSuccessMarker[currentQ.id] ? '已收藏' : '收藏到题库' }}
            </button>
          </div>

          <h3 class="question-title">{{ currentQ.question }}</h3>

          <div class="question-grid">
            <article class="hint-card">
              <div class="hint-head">
                <span class="hint-label">面试官为什么问这个问题</span>
                <button class="mini-btn" type="button" @click="showFramework = !showFramework">
                  {{ showFramework ? '收起' : '展开' }}
                </button>
              </div>
              <div v-if="showFramework" class="hint-body">
                <p>{{ currentQ.intent || '优先考察你的表达结构、项目取舍和面对追问时的思路完整度。' }}</p>
                <p v-if="currentQ.framework"><strong>建议框架：</strong>{{ currentQ.framework }}</p>
                <ul v-if="currentQ.thinkingPoints?.length" class="thinking-list">
                  <li v-for="point in currentQ.thinkingPoints" :key="point">{{ point }}</li>
                </ul>
              </div>
            </article>

            <article class="hint-card">
              <div class="hint-head">
                <span class="hint-label">参考答案</span>
                <button class="mini-btn" type="button" @click="revealSample = !revealSample">
                  {{ revealSample ? '隐藏' : '查看' }}
                </button>
              </div>
              <p v-if="revealSample" class="sample-answer">
                {{ currentQ.sampleAnswer || currentQ.referenceAnswer || '当前题目暂无参考答案，建议先用自己的结构化思路作答。' }}
              </p>
              <p v-else class="sample-placeholder">先独立作答，再查看参考答案，训练收益会更高。</p>
            </article>
          </div>
        </section>

        <section class="main-card answer-card">
          <div class="answer-head">
            <div>
              <span class="hint-label">你的作答</span>
              <h4>先给完整回答，再决定是否进入下一题</h4>
            </div>
            <span class="answer-count">{{ draftAnswer.length }} 字</span>
          </div>

          <textarea
            ref="textareaRef"
            v-model="draftAnswer"
            class="answer-textarea"
            placeholder="建议按“背景 -> 关键动作 -> 结果 -> 复盘”组织回答。按 Enter 提交当前题，Shift + Enter 换行。"
            @keydown="handleKeyDown"
          />

          <div class="answer-actions">
            <div class="action-left">
              <button class="btn btn-tertiary" type="button" :disabled="currentIndex === 0" @click="handlePrev">上一题</button>
              <button class="btn btn-tertiary" type="button" :disabled="currentIndex >= totalQ - 1" @click="handleSkip">先跳过</button>
            </div>
            <div class="action-right">
              <button class="btn btn-secondary" type="button" @click="persistCurrentAnswer()">暂存回答</button>
              <button class="btn btn-primary" type="button" :disabled="!draftAnswer.trim()" @click="handleSubmitCurrent">
                {{ currentIndex === totalQ - 1 ? '完成并生成复盘' : '提交并进入下一题' }}
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  </section>
</template>

<style scoped>
.drill-panel {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.drill-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding: 28px;
  border-radius: 24px;
  border: 1px solid var(--border-color);
  background: var(--bg-elevated);
  box-shadow: var(--shadow-md);
}

.drill-header-copy {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 720px;
}

.drill-kicker {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #2b7bb8;
}

.drill-title,
.question-title,
.answer-head h4 {
  margin: 0;
  color: #162134;
}

.drill-title {
  font-size: 28px;
  line-height: 1.15;
}

.drill-desc,
.sidebar-text,
.hint-body p,
.sample-answer,
.sample-placeholder,
.empty-main p {
  margin: 0;
  color: #4d6077;
  line-height: 1.75;
}

.drill-header-stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(150px, 1fr));
  gap: 12px;
  min-width: 320px;
}

.header-stat {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px;
  border-radius: 18px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
}

.header-stat-label,
.sidebar-label,
.hint-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-muted);
}

.drill-empty {
  padding: 28px;
  border-radius: 24px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
}

.empty-main {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 14px;
  max-width: 640px;
}

.empty-main h3 {
  margin: 0;
  font-size: 22px;
  color: #162134;
}

.empty-badge,
.tag {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
}

.empty-badge,
.tag-blue {
  background: rgba(43, 123, 184, 0.08);
  color: #1b6399;
}

.tag-cyan {
  background: rgba(14, 165, 183, 0.1);
  color: #0e8595;
}

.empty-actions,
.action-left,
.action-right,
.answer-actions,
.question-topline,
.question-tags {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.empty-error {
  color: #d35d5d;
  font-weight: 700;
}

.drill-workspace {
  display: grid;
  grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
  gap: 24px;
}

.drill-sidebar,
.drill-main {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.sidebar-card,
.main-card {
  border-radius: 22px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  box-shadow: var(--shadow-sm);
}

.sidebar-card {
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.sidebar-head,
.hint-head,
.answer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.sidebar-value,
.answer-count {
  color: #162134;
  font-weight: 800;
}

.progress-track {
  width: 100%;
  height: 10px;
  border-radius: 999px;
  background: rgba(43, 123, 184, 0.08);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(135deg, #2b7bb8, #7eb4dc);
}

.question-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.question-chip {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 18px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  text-align: left;
  cursor: pointer;
}

.question-chip.active {
  border-color: rgba(43, 123, 184, 0.2);
  background: rgba(43, 123, 184, 0.06);
}

.question-chip.done .chip-index {
  background: rgba(26, 143, 94, 0.12);
  color: #1a8f5e;
}

.chip-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: rgba(43, 123, 184, 0.08);
  color: #1b6399;
  font-size: 12px;
  font-weight: 800;
  flex-shrink: 0;
}

.chip-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.chip-copy strong {
  color: #162134;
}

.chip-copy span {
  color: #7b8ca2;
  font-size: 12px;
}

.meta-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.meta-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: #4d6077;
}

.meta-row strong {
  color: #162134;
}

.main-card {
  padding: 22px;
}

.question-card,
.answer-card {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.question-title {
  font-size: 22px;
  line-height: 1.5;
}

.question-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.hint-card {
  padding: 18px;
  border-radius: 18px;
  background: rgba(242, 247, 251, 0.92);
  border: 1px solid rgba(43, 123, 184, 0.08);
}

.thinking-list {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: #4d6077;
}

.sample-placeholder {
  color: #8b9aae;
}

.answer-textarea {
  min-height: 260px;
  width: 100%;
  resize: vertical;
  border: 1px solid var(--border-color-strong);
  border-radius: 18px;
  background: var(--bg-input);
  padding: 18px;
  color: var(--text-primary);
  line-height: 1.75;
}

.answer-textarea:focus {
  outline: none;
  border-color: rgba(43, 123, 184, 0.35);
  box-shadow: 0 0 0 4px rgba(43, 123, 184, 0.1);
}

.btn,
.mini-btn,
.collect-btn {
  min-height: 40px;
  padding: 0 16px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 160ms cubic-bezier(0.4, 0, 0.2, 1), background-color 160ms cubic-bezier(0.4, 0, 0.2, 1), border-color 160ms cubic-bezier(0.4, 0, 0.2, 1);
}

.btn:hover:not(:disabled),
.mini-btn:hover:not(:disabled),
.collect-btn:hover:not(:disabled) {
  transform: translateY(-1px);
}

.btn:disabled,
.mini-btn:disabled,
.collect-btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.btn-primary {
  color: #fff;
  background: linear-gradient(135deg, #2b7bb8, #4f91d0);
  box-shadow: 0 12px 24px rgba(43, 123, 184, 0.18);
}

.btn-secondary,
.mini-btn,
.collect-btn {
  color: #1b6399;
  background: rgba(43, 123, 184, 0.06);
  border-color: rgba(43, 123, 184, 0.12);
}

.btn-tertiary {
  color: #4d6077;
  background: transparent;
  border-color: rgba(123, 140, 162, 0.18);
}

.collect-btn.saved {
  color: #1a8f5e;
  border-color: rgba(26, 143, 94, 0.14);
  background: rgba(26, 143, 94, 0.08);
}

@media (max-width: 1180px) {
  .drill-workspace {
    grid-template-columns: 1fr;
  }

  .drill-header {
    flex-direction: column;
  }

  .drill-header-stats {
    width: 100%;
    min-width: 0;
  }
}

@media (max-width: 780px) {
  .question-grid {
    grid-template-columns: 1fr;
  }

  .drill-header,
  .drill-empty,
  .main-card,
  .sidebar-card {
    padding: 18px;
  }
}

@media (max-width: 640px) {
  .drill-header-stats {
    grid-template-columns: 1fr;
  }

  .empty-actions,
  .answer-actions,
  .action-left,
  .action-right {
    flex-direction: column;
  }

  .btn,
  .mini-btn,
  .collect-btn {
    width: 100%;
    justify-content: center;
  }
}
</style>
