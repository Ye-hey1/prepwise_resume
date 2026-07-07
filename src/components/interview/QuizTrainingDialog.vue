<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useInterviewQuizStore, type QuizSessionConfig } from '@/stores/interviewQuiz'
import QuizSetupPanel from './QuizSetupPanel.vue'
import QuizSessionView from './QuizSessionView.vue'
import QuizResultPanel from './QuizResultPanel.vue'

defineOptions({ name: 'QuizTrainingDialog' })

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'close': []
}>()

const quizStore = useInterviewQuizStore()

type Step = 'setup' | 'session' | 'result'
const step = ref<Step>('setup')

const currentSessionId = computed(() => quizStore.currentSession?.id ?? '')

// 打开时：若有进行中的会话则续测，否则进入配置
watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    const session = quizStore.currentSession
    if (session && !session.completedAt) {
      step.value = 'session'
    } else {
      step.value = 'setup'
    }
  },
)

function handleStart(config: QuizSessionConfig) {
  if (quizStore.filterQuestions(config).length === 0) {
    // 没有符合条件的题目，留在配置页（设置面板已展示预计题数）
    return
  }
  quizStore.createSession(config)
  step.value = 'session'
}

function handleComplete() {
  step.value = 'result'
}

function handleExit() {
  emit('close')
}

function handleReview() {
  if (currentSessionId.value) {
    quizStore.loadSession(currentSessionId.value)
    step.value = 'session'
  }
}

function handleRestart() {
  if (currentSessionId.value) {
    const session = quizStore.restartSession(currentSessionId.value)
    step.value = session ? 'session' : 'setup'
  }
}

function handleNew() {
  step.value = 'setup'
}

function close() {
  emit('close')
}

const stepTitle = computed(() => {
  if (step.value === 'setup') return '自测训练'
  if (step.value === 'session') return '自测中'
  return '自测结果'
})
</script>

<template>
  <Teleport to="body">
    <Transition name="quiz-dialog">
      <div v-if="open" class="quiz-overlay" @click.self="close">
        <div class="quiz-dialog" role="dialog" aria-modal="true" :aria-label="stepTitle">
          <header class="dialog-header">
            <div class="dialog-title">
              <span class="title-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>
              </span>
              <h2>{{ stepTitle }}</h2>
            </div>
            <button type="button" class="dialog-close" aria-label="关闭" @click="close">
              <svg viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </header>

          <div class="dialog-body">
            <QuizSetupPanel v-if="step === 'setup'" @start="handleStart" />
            <QuizSessionView
              v-else-if="step === 'session'"
              :session-id="currentSessionId || undefined"
              @complete="handleComplete"
              @exit="handleExit"
            />
            <QuizResultPanel
              v-else-if="currentSessionId"
              :session-id="currentSessionId"
              @review="handleReview"
              @restart="handleRestart"
              @new="handleNew"
            />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.quiz-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(17, 24, 40, 0.45);
}

.quiz-dialog {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(960px, 100%);
  max-height: calc(100vh - 48px);
  background: var(--bg-shell);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  box-shadow: none;
  overflow: hidden;
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 22px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-card);
  flex-shrink: 0;
}

.dialog-title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.title-icon {
  display: inline-flex;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: rgba(43, 123, 184, 0.1);
  color: var(--primary-600);
  align-items: center;
  justify-content: center;
}

.title-icon svg {
  width: 16px;
  height: 16px;
}

.title-icon circle {
  stroke: currentColor;
  stroke-width: 1.8;
  fill: none;
}

.dialog-title h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 800;
  color: var(--text-primary);
}

.dialog-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.dialog-close:hover {
  background: var(--bg-card-muted);
  color: var(--accent-red);
}

.dialog-close svg {
  width: 16px;
  height: 16px;
}

.dialog-close path {
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  fill: none;
}

.dialog-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 22px;
}

@media (max-width: 640px) {
  .quiz-overlay {
    padding: 0;
  }

  .quiz-dialog {
    width: 100%;
    max-height: 100vh;
    border-radius: 0;
  }

  .dialog-body {
    padding: 16px;
  }
}

.quiz-dialog-enter-active,
.quiz-dialog-leave-active {
  transition: opacity 0.2s ease;
}

.quiz-dialog-enter-active .quiz-dialog,
.quiz-dialog-leave-active .quiz-dialog {
  transition: transform var(--duration-base) var(--ease-out-expo);
}

.quiz-dialog-enter-from,
.quiz-dialog-leave-to {
  opacity: 0;
}

.quiz-dialog-enter-from .quiz-dialog,
.quiz-dialog-leave-to .quiz-dialog {
  transform: translateY(16px) scale(0.98);
}
</style>
