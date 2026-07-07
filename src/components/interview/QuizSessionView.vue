<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useInterviewQuizStore, type SelfRating } from '@/stores/interviewQuiz'

const props = defineProps<{
  sessionId?: string
}>()

const emit = defineEmits<{
  'complete': []
  'exit': []
}>()

const quizStore = useInterviewQuizStore()

const timer = ref(0)
const timerInterval = ref<number | null>(null)
const nextQuestionTimer = ref<number | null>(null)
const showReference = ref(false)

const currentQuestion = computed(() => quizStore.currentQuestion)
const currentAnswer = computed(() => quizStore.currentAnswer)
const hasAnswered = computed(() => !!currentAnswer.value)

const progress = computed(() => {
  if (!quizStore.currentSession) return 0
  const total = quizStore.currentSession.questions.length
  const answered = quizStore.currentSession.answers.size
  return total > 0 ? Math.round((answered / total) * 100) : 0
})

function diffLabel(d: number): string {
  if (d <= 2) return '简单'
  if (d === 3) return '中等'
  return '困难'
}

function diffClass(d: number): string {
  if (d <= 2) return 'diff-easy'
  if (d === 3) return 'diff-medium'
  return 'diff-hard'
}

function ratingLabel(r?: SelfRating): string {
  if (r === 'known') return '会'
  if (r === 'partial') return '部分会'
  if (r === 'unknown') return '不会'
  return ''
}

function rateQuestion(rating: SelfRating) {
  if (!currentQuestion.value || hasAnswered.value) return
  quizStore.rateAnswer(currentQuestion.value.id, rating, timer.value)
  timer.value = 0
  // 自评后自动进入下一题
  clearNextQuestionTimer()
  nextQuestionTimer.value = window.setTimeout(() => {
    nextQuestionTimer.value = null
    goToNext()
  }, 220)
}

function skipQuestion() {
  if (!currentQuestion.value) return
  quizStore.skipQuestion(currentQuestion.value.id)
  timer.value = 0
  goToNext()
}

function goToNext() {
  clearNextQuestionTimer()
  if (!quizStore.currentSession) return
  if (quizStore.currentQuestionIndex < quizStore.currentSession.questions.length - 1) {
    quizStore.nextQuestion()
    showReference.value = false
    startTimer()
  } else {
    completeSession()
  }
}

function goToPrevious() {
  clearNextQuestionTimer()
  quizStore.previousQuestion()
  showReference.value = hasAnswered.value
}

function completeSession() {
  clearNextQuestionTimer()
  quizStore.completeSession()
  stopTimer()
  emit('complete')
}

function exitSession() {
  if (confirm('确定要退出当前自测吗？进度将被保存。')) {
    clearNextQuestionTimer()
    stopTimer()
    emit('exit')
  }
}

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

function clearNextQuestionTimer() {
  if (nextQuestionTimer.value !== null) {
    clearTimeout(nextQuestionTimer.value)
    nextQuestionTimer.value = null
  }
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

onMounted(() => {
  if (props.sessionId) {
    quizStore.loadSession(props.sessionId)
  }
  startTimer()
})

onUnmounted(() => {
  clearNextQuestionTimer()
  stopTimer()
})

watch(() => quizStore.currentQuestionIndex, () => {
  showReference.value = hasAnswered.value
  if (!hasAnswered.value) timer.value = 0
})
</script>

<template>
  <div class="quiz-session-view">
    <!-- 顶部状态栏 -->
    <div class="session-header">
      <div class="header-left">
        <h3 v-if="quizStore.currentSession">{{ quizStore.currentSession.name }}</h3>
        <div class="progress-bar">
          <div class="progress-fill" :style="{ transform: `scaleX(${progress / 100})` }"></div>
        </div>
        <span class="progress-text">
          {{ quizStore.currentSession?.answers.size || 0 }} / {{ quizStore.currentSession?.questions.length || 0 }}
        </span>
      </div>
      <div class="header-right">
        <div class="timer">
          <span class="timer-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg></span>
          <span class="timer-value">{{ formatTime(timer) }}</span>
        </div>
        <div v-if="quizStore.sessionStats" class="stats-mini">
          <span class="stat known" title="会">会 {{ quizStore.sessionStats.known }}</span>
          <span class="stat unknown" title="不会">不会 {{ quizStore.sessionStats.unknown }}</span>
        </div>
        <button type="button" class="btn-exit" @click="exitSession">退出</button>
      </div>
    </div>

    <!-- 题目内容 -->
    <div v-if="currentQuestion" class="question-content">
      <div class="question-tags">
        <span class="category-badge">{{ currentQuestion.category }}</span>
        <span v-for="tag in currentQuestion.tags" :key="tag" class="tag-badge">{{ tag }}</span>
        <span class="difficulty-badge" :class="diffClass(currentQuestion.difficulty)">{{ diffLabel(currentQuestion.difficulty) }}</span>
      </div>

      <p v-if="currentQuestion.intent" class="question-intent">考察意图：{{ currentQuestion.intent }}</p>

      <h2 class="question-text">{{ currentQuestion.content }}</h2>

      <!-- 参考答案折叠 -->
      <button
        v-if="!showReference && !hasAnswered"
        type="button"
        class="btn-reveal"
        @click="showReference = true"
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
        先想一想，再查看参考答案
      </button>

      <div v-if="showReference || hasAnswered" class="reference-panel">
        <div class="reference-label">参考答案</div>
        <p class="reference-text">{{ currentQuestion.referenceAnswer || '该题暂无参考答案，可结合自身经验自评。' }}</p>
        <p v-if="currentQuestion.framework" class="reference-framework">
          <strong>建议框架：</strong>{{ currentQuestion.framework }}
        </p>
      </div>

      <!-- 自评按钮（未答时） -->
      <div v-if="!hasAnswered" class="rating-actions">
        <span class="rating-hint">对照参考答案后，自评这道题的掌握程度</span>
        <div class="rating-buttons">
          <button type="button" class="rate-btn rate-known" @click="rateQuestion('known')">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>
            会
          </button>
          <button type="button" class="rate-btn rate-partial" @click="rateQuestion('partial')">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12" /></svg>
            部分会
          </button>
          <button type="button" class="rate-btn rate-unknown" @click="rateQuestion('unknown')">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
            不会
          </button>
        </div>
      </div>

      <!-- 已评标记 -->
      <div v-else class="rated-mark" :class="`rated-${currentAnswer?.rating}`">
        你将本题评为：<strong>{{ ratingLabel(currentAnswer?.rating) }}</strong>
        <span class="rated-time">用时 {{ formatTime(currentAnswer?.timeSpent || 0) }}</span>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else class="empty-state">
      <span class="empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg></span>
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
          上一题
        </button>
      </div>
      <div class="footer-center">
        <button v-if="!hasAnswered" type="button" class="btn-skip" @click="skipQuestion">跳过</button>
        <button
          v-else-if="quizStore.currentQuestionIndex < (quizStore.currentSession?.questions.length || 0) - 1"
          type="button"
          class="btn-next"
          @click="goToNext"
        >
          下一题
        </button>
        <button v-else type="button" class="btn-complete" @click="completeSession">
          完成自测
        </button>
      </div>
      <div class="footer-right" />
    </div>
  </div>
</template>

<style scoped>
.quiz-session-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 420px;
  gap: 18px;
}

.session-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 18px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
}

.header-left {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  flex: 1;
}

.session-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 800;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.progress-bar {
  height: 6px;
  border-radius: 3px;
  background: var(--bg-card-muted);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--primary-600);
  border-radius: 3px;
  transition: transform var(--duration-base) var(--ease-out-quart);
  transform-origin: left center;
}

.progress-text {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.timer {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.timer-icon svg {
  width: 16px;
  height: 16px;
}

.timer-icon path,
.timer-icon circle,
.timer-icon polyline {
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  fill: none;
}

.timer-value {
  font-size: 13px;
  font-weight: 800;
}

.stats-mini {
  display: flex;
  gap: 8px;
}

.stats-mini .stat {
  font-size: 12px;
  font-weight: 800;
  padding: 3px 9px;
  border-radius: 6px;
}

.stat.known {
  background: rgba(26, 143, 94, 0.1);
  color: var(--accent-green);
}

.stat.unknown {
  background: rgba(216, 80, 80, 0.1);
  color: var(--accent-red);
}

.btn-exit {
  padding: 6px 14px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.btn-exit:hover {
  background: var(--bg-card-muted);
  color: var(--text-primary);
}

.question-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
  overflow-y: auto;
}

.question-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.category-badge {
  padding: 3px 10px;
  border-radius: 6px;
  background: rgba(43, 123, 184, 0.1);
  color: var(--primary-600);
  font-size: 11px;
  font-weight: 800;
}

.tag-badge {
  padding: 3px 10px;
  border-radius: 6px;
  background: var(--bg-card-muted);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
}

.difficulty-badge {
  padding: 3px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 800;
}

.diff-easy {
  background: rgba(26, 143, 94, 0.1);
  color: var(--accent-green);
}

.diff-medium {
  background: rgba(224, 138, 58, 0.1);
  color: var(--accent-orange);
}

.diff-hard {
  background: rgba(216, 80, 80, 0.1);
  color: var(--accent-red);
}

.question-intent {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.6;
}

.question-text {
  margin: 0;
  font-size: 18px;
  font-weight: 800;
  line-height: 1.6;
  color: var(--text-primary);
}

.btn-reveal {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  align-self: flex-start;
  padding: 10px 18px;
  border: 1px solid var(--primary-500);
  border-radius: 9px;
  background: transparent;
  color: var(--primary-600);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: background-color 0.16s ease, color 0.16s ease;
}

.btn-reveal:hover {
  background: var(--primary-600);
  color: #fff;
}

.btn-reveal svg {
  width: 16px;
  height: 16px;
}

.btn-reveal path,
.btn-reveal circle {
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  fill: none;
}

.reference-panel {
  padding: 16px 18px;
  border: 1px solid var(--state-info-border);
  border-radius: 8px;
  background: var(--state-info-bg);
}

.reference-label {
  color: var(--primary-600);
  font-size: 12px;
  font-weight: 800;
  margin-bottom: 8px;
}

.reference-text {
  margin: 0;
  color: var(--text-primary);
  font-size: 14px;
  line-height: 1.8;
  white-space: pre-wrap;
}

.reference-framework {
  margin: 10px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.6;
}

.reference-framework strong {
  color: var(--text-primary);
}

.rating-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: auto;
  padding-top: 12px;
}

.rating-hint {
  color: var(--text-muted);
  font-size: 13px;
}

.rating-buttons {
  display: flex;
  gap: 10px;
}

.rate-btn {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 14px;
  border: 1px solid;
  border-radius: 10px;
  background: var(--bg-card);
  font-size: 15px;
  font-weight: 800;
  cursor: pointer;
  transition: background-color 0.16s ease, color 0.16s ease, border-color 0.16s ease;
}

.rate-btn svg {
  width: 18px;
  height: 18px;
}

.rate-btn path,
.rate-btn line {
  stroke: currentColor;
  stroke-width: 2.4;
  stroke-linecap: round;
  fill: none;
}

.rate-known {
  border-color: rgba(26, 143, 94, 0.4);
  color: var(--accent-green);
}

.rate-known:hover {
  background: var(--accent-green);
  color: #fff;
}

.rate-partial {
  border-color: rgba(224, 138, 58, 0.4);
  color: var(--accent-orange);
}

.rate-partial:hover {
  background: var(--accent-orange);
  color: #fff;
}

.rate-unknown {
  border-color: rgba(216, 80, 80, 0.4);
  color: var(--accent-red);
}

.rate-unknown:hover {
  background: var(--accent-red);
  color: #fff;
}

.rated-mark {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: auto;
  padding: 12px 16px;
  border-radius: 9px;
  font-size: 14px;
  color: var(--text-secondary);
}

.rated-mark strong {
  font-size: 15px;
  font-weight: 800;
}

.rated-time {
  margin-left: auto;
  color: var(--text-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.rated-known {
  background: rgba(26, 143, 94, 0.08);
}

.rated-known strong {
  color: var(--accent-green);
}

.rated-partial {
  background: rgba(224, 138, 58, 0.08);
}

.rated-partial strong {
  color: var(--accent-orange);
}

.rated-unknown {
  background: rgba(216, 80, 80, 0.08);
}

.rated-unknown strong {
  color: var(--accent-red);
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 48px 24px;
  text-align: center;
}

.empty-icon {
  display: inline-flex;
  width: 48px;
  height: 48px;
  color: var(--primary-500);
  opacity: 0.5;
}

.empty-icon svg {
  width: 100%;
  height: 100%;
}

.empty-icon path,
.empty-icon polyline,
.empty-icon line {
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
  fill: none;
}

.session-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 18px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
}

.footer-left,
.footer-center,
.footer-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.footer-center {
  flex: 1;
  justify-content: center;
}

.btn-nav,
.btn-skip,
.btn-next,
.btn-complete {
  padding: 9px 20px;
  border-radius: 9px;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.btn-nav {
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-secondary);
}

.btn-nav:hover:not(:disabled) {
  background: var(--bg-card-muted);
  color: var(--text-primary);
}

.btn-nav:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-skip {
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-muted);
}

.btn-skip:hover {
  background: var(--bg-card-muted);
}

.btn-next,
.btn-complete {
  border: none;
  background: var(--primary-600);
  color: #fff;
}

.btn-next:hover,
.btn-complete:hover {
  background: var(--primary-700);
}

@media (max-width: 640px) {
  .rating-buttons {
    flex-direction: column;
  }

  .session-footer {
    flex-wrap: wrap;
  }
}
</style>
