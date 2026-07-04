<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useInterviewQuizStore, QUESTION_TAG_INFO, type QuestionDifficulty } from '@/stores/interviewQuiz'

const props = defineProps<{
  sessionId?: string
}>()

const emit = defineEmits<{
  'complete': []
  'exit': []
}>()

const quizStore = useInterviewQuizStore()

// 计时器
const timer = ref(0)
const timerInterval = ref<number | null>(null)

// 当前题目
const currentQuestion = computed(() => {
  if (!quizStore.currentSession) return null
  return quizStore.currentSession.questions[quizStore.currentQuestionIndex] || null
})

// 用户答案
const selectedAnswer = ref<string>('')

// 是否已回答当前题
const hasAnswered = computed(() => {
  if (!currentQuestion.value || !quizStore.currentSession) return false
  return quizStore.currentSession.answers.has(currentQuestion.value.id)
})

// 当前题目的答案记录
const currentAnswer = computed(() => {
  if (!currentQuestion.value || !quizStore.currentSession) return null
  return quizStore.currentSession.answers.get(currentQuestion.value.id) || null
})

// 题目进度
const progress = computed(() => {
  if (!quizStore.currentSession) return 0
  const total = quizStore.currentSession.questions.length
  const current = quizStore.currentQuestionIndex + 1
  return total > 0 ? Math.round((current / total) * 100) : 0
})

// 难度样式
function getDifficultyClass(difficulty: QuestionDifficulty): string {
  switch (difficulty) {
    case 'easy': return 'diff-easy'
    case 'medium': return 'diff-medium'
    case 'hard': return 'diff-hard'
    default: return ''
  }
}

function getDifficultyLabel(difficulty: QuestionDifficulty): string {
  switch (difficulty) {
    case 'easy': return '简单'
    case 'medium': return '中等'
    case 'hard': return '困难'
    default: return ''
  }
}

// 选择答案
function selectAnswer(optionId: string) {
  if (hasAnswered.value) return
  selectedAnswer.value = optionId
}

// 提交答案
function submitAnswer() {
  if (!currentQuestion.value || !selectedAnswer.value) return

  const timeSpent = timer.value
  quizStore.submitAnswer(currentQuestion.value.id, selectedAnswer.value, timeSpent)

  // 重置计时器
  timer.value = 0
  selectedAnswer.value = ''
}

// 跳过题目
function skipQuestion() {
  if (!currentQuestion.value) return
  quizStore.skipQuestion(currentQuestion.value.id)
  timer.value = 0
  selectedAnswer.value = ''
}

// 下一题
function goToNext() {
  if (!quizStore.currentSession) return

  if (quizStore.currentQuestionIndex < quizStore.currentSession.questions.length - 1) {
    quizStore.nextQuestion()
    startTimer()
  } else {
    // 完成会话
    completeSession()
  }
}

// 上一题
function goToPrevious() {
  quizStore.previousQuestion()
  // 如果上一题已回答，恢复答案显示
  if (currentAnswer.value) {
    selectedAnswer.value = Array.isArray(currentAnswer.value.userAnswer)
      ? currentAnswer.value.userAnswer[0] ?? ''
      : String(currentAnswer.value.userAnswer)
  }
}

// 完成会话
function completeSession() {
  quizStore.completeSession()
  stopTimer()
  emit('complete')
}

// 退出
function exitSession() {
  if (confirm('确定要退出当前自测吗？进度将被保存。')) {
    stopTimer()
    emit('exit')
  }
}

// 计时器
function startTimer() {
  stopTimer()
  timerInterval.value = window.setInterval(() => {
    timer.value++
  }, 1000)
}

function stopTimer() {
  if (timerInterval.value !== null) {
    clearInterval(timerInterval.value)
    timerInterval.value = null
  }
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// 初始化
onMounted(() => {
  if (props.sessionId) {
    quizStore.loadSession(props.sessionId)
  }
  startTimer()
})

onUnmounted(() => {
  stopTimer()
})

// 监听题目变化
watch(() => quizStore.currentQuestionIndex, () => {
  if (!hasAnswered.value) {
    selectedAnswer.value = ''
    timer.value = 0
  }
})
</script>

<template>
  <div class="quiz-session-view">
    <!-- 顶部状态栏 -->
    <div class="session-header">
      <div class="header-left">
        <h3 v-if="quizStore.currentSession">{{ quizStore.currentSession.name }}</h3>
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: progress + '%' }"></div>
        </div>
        <span class="progress-text">
          {{ quizStore.currentQuestionIndex + 1 }} / {{ quizStore.currentSession?.questions.length || 0 }}
        </span>
      </div>
      <div class="header-right">
        <div class="timer">
          <span class="timer-icon">⏱</span>
          <span class="timer-value">{{ formatTime(timer) }}</span>
        </div>
        <div v-if="quizStore.sessionStats" class="stats-mini">
          <span class="stat correct">{{ quizStore.sessionStats.correct }}</span>
          <span class="stat wrong">{{ quizStore.sessionStats.wrong }}</span>
        </div>
        <button type="button" class="btn-exit" @click="exitSession">退出</button>
      </div>
    </div>

    <!-- 题目内容 -->
    <div v-if="currentQuestion" class="question-content">
      <!-- 题目标签 -->
      <div class="question-tags">
        <span
          v-for="tag in currentQuestion.tags"
          :key="tag"
          class="tag-badge"
          :style="{ '--tag-color': QUESTION_TAG_INFO[tag]?.color || '#999' }"
        >
          {{ QUESTION_TAG_INFO[tag]?.icon }} {{ QUESTION_TAG_INFO[tag]?.name }}
        </span>
        <span class="difficulty-badge" :class="getDifficultyClass(currentQuestion.difficulty)">
          {{ getDifficultyLabel(currentQuestion.difficulty) }}
        </span>
      </div>

      <!-- 题目问题 -->
      <h2 class="question-text">{{ currentQuestion.question }}</h2>

      <!-- 选择题选项 -->
      <div v-if="currentQuestion.type === 'multiple-choice'" class="options-list">
        <div
          v-for="option in currentQuestion.options"
          :key="option.id"
          class="option-item"
          :class="{
            selected: selectedAnswer === option.id,
            correct: hasAnswered && currentAnswer && option.isCorrect,
            wrong: hasAnswered && currentAnswer && selectedAnswer === option.id && !option.isCorrect,
            disabled: hasAnswered
          }"
          @click="selectAnswer(option.id)"
        >
          <div class="option-marker">
            <span v-if="hasAnswered && option.isCorrect">✓</span>
            <span v-else-if="hasAnswered && selectedAnswer === option.id && !option.isCorrect">✗</span>
            <span v-else>{{ option.id.toUpperCase() }}</span>
          </div>
          <div class="option-text">{{ option.text }}</div>
        </div>
      </div>

      <!-- 答案解析 -->
      <div v-if="quizStore.showExplanation && hasAnswered" class="explanation-panel">
        <div class="explanation-header">
          <span class="explanation-icon">{{ currentAnswer?.isCorrect ? '✓' : '✗' }}</span>
          <span class="explanation-title">
            {{ currentAnswer?.isCorrect ? '回答正确！' : '回答错误' }}
          </span>
          <span class="explanation-time">
            用时：{{ formatTime(currentAnswer?.timeSpent || 0) }}
          </span>
        </div>
        <div class="explanation-content">
          <p><strong>正确答案：</strong>{{ currentQuestion.answer }}</p>
          <p><strong>详细解析：</strong>{{ currentQuestion.explanation }}</p>
          <div v-if="currentQuestion.resources?.length" class="explanation-resources">
            <span class="resource-label">扩展阅读：</span>
            <a
              v-for="resource in currentQuestion.resources"
              :key="resource"
              :href="resource"
              target="_blank"
              class="resource-link"
            >
              {{ resource }}
            </a>
          </div>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else class="empty-state">
      <span class="empty-icon">📝</span>
      <p>没有可显示的题目</p>
    </div>

    <!-- 底部操作栏 -->
    <div class="session-footer">
      <div class="footer-left">
        <button
          type="button"
          class="btn-nav"
          :disabled="quizStore.currentQuestionIndex === 0"
          @click="goToPrevious"
        >
          ← 上一题
        </button>
      </div>
      <div class="footer-center">
        <template v-if="!hasAnswered">
          <button
            type="button"
            class="btn-skip"
            @click="skipQuestion"
          >
            跳过
          </button>
          <button
            type="button"
            class="btn-submit"
            :disabled="!selectedAnswer"
            @click="submitAnswer"
          >
            提交答案
          </button>
        </template>
        <template v-else>
          <button
            v-if="quizStore.currentQuestionIndex < (quizStore.currentSession?.questions.length || 0) - 1"
            type="button"
            class="btn-next"
            @click="goToNext"
          >
            下一题 →
          </button>
          <button
            v-else
            type="button"
            class="btn-complete"
            @click="completeSession"
          >
            完成自测
          </button>
        </template>
      </div>
      <div class="footer-right">
        <button
          type="button"
          class="btn-nav"
          :disabled="quizStore.currentQuestionIndex >= (quizStore.currentSession?.questions.length || 0) - 1"
          @click="goToNext"
        >
          下一题 →
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.quiz-session-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  max-height: 100vh;
  background: var(--bg-primary);
}

.session-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-color);
  gap: 24px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 1;
}

.header-left h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  white-space: nowrap;
}

.progress-bar {
  width: 200px;
  height: 6px;
  background: var(--bg-card-muted);
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--accent-blue-500);
  border-radius: 3px;
  transition: width 0.3s ease;
}

.progress-text {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.timer {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--bg-card-muted);
  border-radius: 8px;
}

.timer-icon {
  font-size: 14px;
}

.timer-value {
  font-size: 14px;
  font-weight: 700;
  font-family: monospace;
  color: var(--accent-blue-500);
}

.stats-mini {
  display: flex;
  gap: 8px;
}

.stat {
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 700;
}

.stat.correct {
  background: color-mix(in srgb, var(--accent-green) 20%, transparent);
  color: var(--accent-green);
}

.stat.wrong {
  background: color-mix(in srgb, var(--accent-red) 20%, transparent);
  color: var(--accent-red);
}

.btn-exit {
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-exit:hover {
  border-color: var(--text-muted);
  color: var(--text-primary);
}

.question-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.question-tags {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.tag-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: color-mix(in srgb, var(--tag-color) 15%, var(--bg-card));
  border: 1px solid color-mix(in srgb, var(--tag-color) 30%, var(--border-color));
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  color: var(--tag-color);
}

.difficulty-badge {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
}

.diff-easy {
  background: color-mix(in srgb, #10b981 20%, transparent);
  color: #10b981;
}

.diff-medium {
  background: color-mix(in srgb, #f59e0b 20%, transparent);
  color: #f59e0b;
}

.diff-hard {
  background: color-mix(in srgb, #ef4444 20%, transparent);
  color: #ef4444;
}

.question-text {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.5;
}

.options-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.option-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  background: var(--bg-card);
  border: 2px solid var(--border-color);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.option-item:hover:not(.disabled) {
  border-color: var(--accent-blue-500);
  background: color-mix(in srgb, var(--accent-blue-500) 5%, var(--bg-card));
}

.option-item.selected {
  border-color: var(--accent-blue-500);
  background: color-mix(in srgb, var(--accent-blue-500) 10%, var(--bg-card));
}

.option-item.correct {
  border-color: var(--accent-green);
  background: color-mix(in srgb, var(--accent-green) 10%, var(--bg-card));
}

.option-item.wrong {
  border-color: var(--accent-red);
  background: color-mix(in srgb, var(--accent-red) 10%, var(--bg-card));
}

.option-item.disabled {
  cursor: not-allowed;
}

.option-marker {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--bg-elevated);
  font-size: 14px;
  font-weight: 700;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.option-item.correct .option-marker {
  background: var(--accent-green);
  color: #fff;
}

.option-item.wrong .option-marker {
  background: var(--accent-red);
  color: #fff;
}

.option-text {
  flex: 1;
  font-size: 15px;
  color: var(--text-primary);
  line-height: 1.5;
}

.explanation-panel {
  padding: 20px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
}

.explanation-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.explanation-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 18px;
  font-weight: 700;
}

.explanation-panel[data-correct="true"] .explanation-icon {
  background: var(--accent-green);
  color: #fff;
}

.explanation-panel[data-correct="false"] .explanation-icon {
  background: var(--accent-red);
  color: #fff;
}

.explanation-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}

.explanation-time {
  margin-left: auto;
  font-size: 13px;
  color: var(--text-muted);
}

.explanation-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.explanation-content p {
  margin: 0;
  font-size: 14px;
  color: var(--text-primary);
  line-height: 1.6;
}

.explanation-content strong {
  color: var(--text-secondary);
}

.explanation-resources {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.resource-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
}

.resource-link {
  font-size: 13px;
  color: var(--accent-blue-500);
  text-decoration: none;
}

.resource-link:hover {
  text-decoration: underline;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
}

.empty-icon {
  font-size: 48px;
  opacity: 0.5;
}

.empty-state p {
  margin: 0;
  color: var(--text-secondary);
}

.session-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  background: var(--bg-card);
  border-top: 1px solid var(--border-color);
  gap: 24px;
}

.footer-left,
.footer-right {
  display: flex;
  gap: 12px;
}

.footer-center {
  display: flex;
  gap: 12px;
  margin: 0 auto;
}

.btn-nav,
.btn-skip,
.btn-submit,
.btn-next,
.btn-complete {
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-nav {
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
}

.btn-nav:hover:not(:disabled) {
  border-color: var(--text-muted);
  color: var(--text-primary);
}

.btn-nav:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-skip {
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
}

.btn-skip:hover {
  border-color: var(--text-muted);
  color: var(--text-primary);
}

.btn-submit,
.btn-next {
  background: var(--accent-blue-500);
  color: #fff;
  border: none;
}

.btn-submit:hover:not(:disabled),
.btn-next:hover {
  background: var(--accent-blue-600);
  transform: translateY(-1px);
}

.btn-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-complete {
  background: var(--accent-green);
  color: #fff;
  border: none;
  padding: 12px 28px;
}

.btn-complete:hover {
  background: var(--accent-green-dark);
  transform: translateY(-1px);
}

@media (max-width: 768px) {
  .session-header {
    flex-direction: column;
    align-items: stretch;
    padding: 12px 16px;
  }

  .header-left {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  .progress-bar {
    width: 100%;
  }

  .header-right {
    flex-wrap: wrap;
    justify-content: space-between;
  }

  .question-content {
    padding: 16px;
  }

  .question-text {
    font-size: 18px;
  }

  .session-footer {
    flex-direction: column;
    padding: 12px 16px;
  }

  .footer-left,
  .footer-right {
    width: 100%;
    justify-content: center;
  }

  .footer-center {
    width: 100%;
  }

  .btn-nav,
  .btn-skip,
  .btn-submit,
  .btn-next,
  .btn-complete {
    flex: 1;
  }
}
</style>
