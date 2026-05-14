<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import type { JdPrepInsight } from '@/services/types/jd'

interface PracticeQuestion {
  id: string
  category: string
  difficulty: '初级' | '中级' | '高级'
  question: string
  reason: string
  answerStructure: string
  sampleAnswer: string
  highlights: string[]
  pitfalls: string[]
}

const props = defineProps<{
  prepInsight: JdPrepInsight | null
  isLoading: boolean
}>()

const practiceQuestions = computed<PracticeQuestion[]>(() => {
  if (!props.prepInsight) return []

  const result: PracticeQuestion[] = []

  for (const [index, item] of props.prepInsight.highRiskFollowUps.entries()) {
    result.push({
      id: `risk-${index}`,
      category: '高风险追问',
      difficulty: '高级',
      question: item.question,
      reason: item.riskReason,
      answerStructure: '先确认事实，再讲关键动作，最后补结果和复盘。',
      sampleAnswer: item.suggestion || '先把真实经历讲清楚，再主动补齐背景、动作和结果。',
      highlights: [
        '回答时紧贴真实经历，不额外虚构细节。',
        '优先给出你亲自负责的动作和决策。',
        '如果有结果指标，尽量量化。',
      ],
      pitfalls: [
        '只讲结论，不讲过程。',
        '把团队成果说成个人独立完成。',
        '细节被追问时前后说法不一致。',
      ],
    })
  }

  for (const [groupIndex, group] of props.prepInsight.likelyQuestionGroups.entries()) {
    for (const [questionIndex, question] of group.questions.entries()) {
      result.push({
        id: `group-${groupIndex}-${questionIndex}`,
        category: group.title,
        difficulty: '中级',
        question,
        reason: group.intent || '这是岗位高频追问方向，适合提前组织稳定回答结构。',
        answerStructure: '先亮观点，再拆 2-3 个维度，最后落到你做过的事情。',
        sampleAnswer: `可以围绕「背景、动作、结果、复盘」来展开这类问题，重点把你和岗位要求最相关的经验先说出来。`,
        highlights: [
          '先把和 JD 最相关的能力说在前面。',
          '尽量把回答挂到具体项目或工作经历上。',
          '结尾补一句方法论或复盘，拉高成熟度。',
        ],
        pitfalls: [
          '空谈概念，没有经历支撑。',
          '回答太散，没有主线。',
          '没有把话题引回岗位价值。',
        ],
      })
    }
  }

  return result
})

const currentQuestion = ref<PracticeQuestion | null>(null)
const showAnswer = ref(false)
const timer = ref(60)
const isTimerRunning = ref(false)
let timerId: ReturnType<typeof setInterval> | null = null

function resetTimer() {
  if (timerId) {
    clearInterval(timerId)
    timerId = null
  }
  timer.value = 60
  isTimerRunning.value = false
}

function startTimer() {
  if (isTimerRunning.value) return
  isTimerRunning.value = true
  timerId = setInterval(() => {
    if (timer.value <= 1) {
      resetTimer()
      return
    }
    timer.value -= 1
  }, 1000)
}

function drawQuestion() {
  if (!practiceQuestions.value.length) return
  const pool = practiceQuestions.value
  const next = pool[Math.floor(Math.random() * pool.length)] ?? pool[0] ?? null
  currentQuestion.value = next
  showAnswer.value = false
  resetTimer()
}

watch(practiceQuestions, (questions) => {
  if (!questions.length) {
    currentQuestion.value = null
    return
  }

  if (!currentQuestion.value) {
    currentQuestion.value = questions[0] ?? null
  }
}, { immediate: true })

onUnmounted(() => {
  resetTimer()
})
</script>

<template>
  <section class="prep-card">
    <header class="prep-header">
      <div>
        <div class="prep-kicker">MOCK DRILL</div>
        <h2 class="prep-title">备面演练卡</h2>
        <p class="prep-desc">把高风险追问和预测问题组转成练习题，方便你在正式面试前先做一轮口头演练。</p>
      </div>
      <div class="prep-actions">
        <button class="ghost-btn" type="button" :disabled="!practiceQuestions.length" @click="drawQuestion">换一题</button>
        <button class="primary-btn" type="button" :disabled="!practiceQuestions.length || isTimerRunning" @click="startTimer">
          {{ isTimerRunning ? '计时中' : '开始 60 秒' }}
        </button>
      </div>
    </header>

    <div v-if="isLoading && !practiceQuestions.length" class="loading-shell">
      <div class="skeleton-line w-70" />
      <div class="skeleton-line w-50" />
      <div class="skeleton-box" />
    </div>

    <div v-else-if="!practiceQuestions.length" class="empty-shell">
      <p>生成 Prep 洞察后，这里会自动出现高风险追问和预测问题组，供你做模拟演练。</p>
    </div>

    <div v-else-if="currentQuestion" class="question-shell">
      <div class="question-meta">
        <span class="meta-chip">{{ currentQuestion.category }}</span>
        <span class="meta-chip danger">{{ currentQuestion.difficulty }}</span>
        <span class="timer-chip" :class="{ warning: timer <= 10 }">{{ timer }}s</span>
      </div>

      <h3 class="question-title">{{ currentQuestion.question }}</h3>
      <p class="question-reason">{{ currentQuestion.reason }}</p>

      <div class="block">
        <span class="block-label">回答框架</span>
        <p class="block-text">{{ currentQuestion.answerStructure }}</p>
      </div>

      <button class="ghost-btn" type="button" @click="showAnswer = !showAnswer">
        {{ showAnswer ? '隐藏参考答案' : '显示参考答案' }}
      </button>

      <div v-if="showAnswer" class="answer-grid">
        <div class="answer-card focus">
          <span class="block-label">参考回答方向</span>
          <p class="block-text">{{ currentQuestion.sampleAnswer }}</p>
        </div>

        <div class="answer-card">
          <span class="block-label">高分要点</span>
          <ul class="detail-list positive">
            <li v-for="item in currentQuestion.highlights" :key="item">{{ item }}</li>
          </ul>
        </div>

        <div class="answer-card">
          <span class="block-label">易踩坑</span>
          <ul class="detail-list risk">
            <li v-for="item in currentQuestion.pitfalls" :key="item">{{ item }}</li>
          </ul>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.prep-card {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 28px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.84);
  border: 1px solid rgba(255, 255, 255, 0.9);
  box-shadow: 0 10px 40px rgba(15, 23, 42, 0.03);
}

.prep-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.prep-kicker {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(16, 185, 129, 0.08);
  color: #059669;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.12em;
}

.prep-title {
  margin: 10px 0 6px;
  font-size: 22px;
  font-weight: 900;
  color: var(--text-primary);
}

.prep-desc {
  margin: 0;
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-secondary);
}

.prep-actions {
  display: flex;
  gap: 10px;
}

.ghost-btn,
.primary-btn {
  min-height: 40px;
  padding: 0 16px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}

.ghost-btn {
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(255, 255, 255, 0.86);
  color: var(--text-secondary);
}

.primary-btn {
  border: none;
  background: linear-gradient(135deg, var(--primary-500), var(--primary-600));
  color: #fff;
}

.ghost-btn:disabled,
.primary-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.loading-shell,
.empty-shell {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.88);
}

.empty-shell p {
  margin: 0;
  font-size: 13px;
  line-height: 1.8;
  color: var(--text-secondary);
}

.skeleton-line,
.skeleton-box {
  border-radius: 16px;
  background: rgba(148, 163, 184, 0.14);
  animation: pulse 1.5s infinite;
}

.skeleton-line {
  height: 16px;
}

.skeleton-line.w-70 {
  width: 70%;
}

.skeleton-line.w-50 {
  width: 50%;
}

.skeleton-box {
  height: 180px;
}

.question-shell {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.question-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.meta-chip,
.timer-chip {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(59, 130, 246, 0.08);
  color: var(--primary-600);
  font-size: 12px;
  font-weight: 800;
}

.meta-chip.danger {
  background: rgba(239, 68, 68, 0.08);
  color: var(--accent-red);
}

.timer-chip {
  background: rgba(15, 23, 42, 0.06);
  color: var(--text-secondary);
}

.timer-chip.warning {
  background: rgba(239, 68, 68, 0.08);
  color: var(--accent-red);
}

.question-title {
  margin: 0;
  font-size: 20px;
  line-height: 1.5;
  color: var(--text-primary);
}

.question-reason,
.block-text {
  margin: 0;
  font-size: 14px;
  line-height: 1.8;
  color: var(--text-secondary);
}

.block,
.answer-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(148, 163, 184, 0.16);
}

.answer-card.focus {
  background: rgba(239, 246, 255, 0.92);
}

.block-label {
  font-size: 11px;
  font-weight: 800;
  color: var(--text-muted);
  letter-spacing: 0.08em;
}

.answer-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.detail-list {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.detail-list li {
  font-size: 13px;
  line-height: 1.7;
}

.detail-list.positive li {
  color: #047857;
}

.detail-list.risk li {
  color: var(--accent-red);
}

@keyframes pulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}

@media (max-width: 900px) {
  .prep-header {
    flex-direction: column;
  }

  .answer-grid {
    grid-template-columns: 1fr;
  }
}
</style>
