<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { CoachingMessage } from '@/components/ai/interview/types'
import { COACHING_STAGES } from '@/components/ai/interview/types'

const props = defineProps<{
  messages: CoachingMessage[]
  isLoading: boolean
  errorMsg: string
  roundIndex: number
  totalRounds: number
  paused: boolean
  finished: boolean
  finalSummary: string
  techniqueSummary: Array<{ technique: string; description: string; example: string }>
  timerText: string
  sessionStarted: boolean
  stageLabel?: string
  stageRoundIndex?: number
  stageRoundTotal?: number
  waitingNextStage?: boolean
  /** 当前阶段索引 0-3 */
  currentStageIdx?: number
  /** 选择的模式 full 或单轮 */
  coachingStage?: string
}>()

const emit = defineEmits<{
  (e: 'start'): void
  (e: 'pause'): void
  (e: 'next'): void
  (e: 'nextStage'): void
  (e: 'finish'): void
  (e: 'reset'): void
  (e: 'saveToBank', question: string, answer: string, techniques: string[]): void
}>()

const chatListRef = ref<HTMLElement | null>(null)
const showSummary = ref(false)
const savedMessageIds = ref<Set<string>>(new Set())

// ── P0-1: "我来试试"功能 ──
const tryItMsgId = ref<string | null>(null)
const tryItUserAnswer = ref('')
const hiddenAnswerIds = ref<Set<string>>(new Set())

// ── P1-4: 笔记面板 ──
const showNotes = ref(false)
const notesByQuestion = ref<Record<number, string>>({})

watch(() => props.messages.length, () => {
  nextTick(() => {
    if (chatListRef.value) {
      chatListRef.value.scrollTo({ top: chatListRef.value.scrollHeight, behavior: 'smooth' })
    }
  })
})

watch(() => props.finished, (val) => {
  if (val) showSummary.value = true
})

const progressPercent = computed(() => {
  const total = props.stageRoundTotal || props.totalRounds
  const current = props.stageRoundIndex || props.roundIndex
  if (total <= 0) return 0
  return Math.min(100, Math.round((current / total) * 100))
})

const stageRoundDisplay = computed(() => {
  const current = props.stageRoundIndex || props.roundIndex
  const total = props.stageRoundTotal || props.totalRounds
  return `${current} / ${total}`
})

const statusText = computed(() => {
  if (!props.sessionStarted) return '准备开始'
  if (props.finished) return '观摩结束'
  if (props.waitingNextStage) return '等待下一轮'
  if (props.paused) return '已暂停'
  if (props.isLoading) return '生成中'
  return '进行中'
})

// ── P0-3: 轮次进度指示器 ──
const stageProgress = computed(() => {
  if (props.coachingStage && props.coachingStage !== 'full') {
    // 单轮模式不显示多阶段进度
    return null
  }
  const currentIdx = props.currentStageIdx || 0
  return COACHING_STAGES.map((stage, idx) => ({
    label: stage.label.replace(' ', ''),
    active: idx === currentIdx,
    done: idx < currentIdx,
  }))
})

/** 计算当前面试官消息是第几个问题 */
function getInterviewerIndex(msgIdx: number): number {
  let count = 0
  for (let i = 0; i <= msgIdx; i++) {
    if (props.messages[i]?.role === 'interviewer') count++
  }
  return count
}

// ── P0-2: 关键句高亮 ──
const HIGHLIGHT_PATTERNS = [
  { pattern: /(\d+%|\d+倍|\d+万|\d+亿|提升\d+|降低\d+|节省\d+|增长\d+)/g, class: 'hl-data' },
  { pattern: /(从0到1|核心指标|量化|ROI|转化率|准确率|效率)/g, class: 'hl-metric' },
  { pattern: /(STAR|先总后分|背景→|结果→|方案对比|取舍)/g, class: 'hl-technique' },
]

function highlightText(text: string): string {
  let result = text.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  for (const { pattern, class: cls } of HIGHLIGHT_PATTERNS) {
    result = result.replace(pattern, `<mark class="${cls}">$1</mark>`)
  }
  return result
}

// ── P0-1: "我来试试" ──
function handleTryIt(msgId: string) {
  // 找到该面试官消息后面的候选人回答并隐藏
  const idx = props.messages.findIndex(m => m.id === msgId)
  if (idx < 0) return
  for (let i = idx + 1; i < props.messages.length && i <= idx + 2; i++) {
    if (props.messages[i]?.role === 'candidate') {
      hiddenAnswerIds.value.add(props.messages[i].id)
      break
    }
  }
  tryItMsgId.value = msgId
  tryItUserAnswer.value = ''
}

function handleRevealAnswer(candidateMsgId: string) {
  hiddenAnswerIds.value.delete(candidateMsgId)
  tryItMsgId.value = null
}

// ── P1-4: 笔记 ──
function updateNote(qIndex: number, value: string) {
  notesByQuestion.value[qIndex] = value
}

/** 收藏当前轮次到题库 */
function handleSaveToBank(coachMsg: CoachingMessage) {
  if (savedMessageIds.value.has(coachMsg.id)) return
  const idx = props.messages.findIndex(m => m.id === coachMsg.id)
  if (idx < 2) return
  let question = ''
  let answer = ''
  for (let i = idx - 1; i >= 0; i--) {
    if (!answer && props.messages[i].role === 'candidate') answer = props.messages[i].content
    if (!question && props.messages[i].role === 'interviewer') question = props.messages[i].content
    if (question && answer) break
  }
  if (!question) return
  savedMessageIds.value.add(coachMsg.id)
  emit('saveToBank', question, answer, coachMsg.techniques || [])
}
</script>

<template>
  <div class="coaching-panel">
    <!-- 顶部信息条 -->
    <header class="coaching-topbar">
      <div class="topbar-left">
        <div class="mode-indicator">
          <span class="mode-dot"></span>
          <span class="mode-label">{{ stageLabel || '观摩学习' }}</span>
        </div>
        <span class="divider-dot"></span>
        <span class="round-label">第 {{ stageRoundDisplay }} 题</span>
      </div>
      <!-- P0-3: 轮次进度指示器 -->
      <div v-if="stageProgress" class="stage-dots">
        <div v-for="(s, idx) in stageProgress" :key="idx" class="stage-dot-item" :class="{ active: s.active, done: s.done }">
          <span class="stage-dot-circle">{{ s.done ? '&#10003;' : idx + 1 }}</span>
          <span class="stage-dot-label">{{ s.label }}</span>
        </div>
      </div>
      <div v-else class="topbar-progress">
        <div class="progress-track">
          <div class="progress-thumb" :style="{ width: progressPercent + '%' }"></div>
        </div>
      </div>
      <div class="topbar-right">
        <button class="topbar-icon-btn" :class="{ active: showNotes }" @click="showNotes = !showNotes" title="笔记">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        </button>
        <span class="timer-mono">{{ timerText }}</span>
        <span class="status-chip" :class="{ running: sessionStarted && !paused && !finished && !waitingNextStage, paused: paused || waitingNextStage, done: finished }">
          {{ statusText }}
        </span>
      </div>
    </header>

    <!-- 对话主体 -->
    <div class="coaching-body" ref="chatListRef">
      <!-- 空状态：开始前 -->
      <div v-if="messages.length === 0 && !isLoading" class="empty-state">
        <div class="empty-visual">
          <div class="empty-ring">
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
            </svg>
          </div>
        </div>
        <h3 class="empty-heading">面试观摩</h3>
        <p class="empty-sub">AI 将同时扮演面试官与候选人，为你演示一场完整的模拟面试。<br/>观察提问逻辑、学习回答技巧，随时暂停回顾。</p>
        <button class="action-start" @click="emit('start')" :disabled="isLoading">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
          开始观摩
        </button>
      </div>

      <!-- 消息流 -->
      <div v-else class="message-stream">
        <template v-for="(msg, msgIdx) in messages" :key="msg.id">
          <!-- 面试官 -->
          <div v-if="msg.role === 'interviewer'" class="msg-block msg-block--interviewer">
            <div class="msg-meta">
              <span class="role-badge role-badge--interviewer">面试官 · Q{{ getInterviewerIndex(msgIdx) }}</span>
              <!-- P0-1: "我来试试"按钮 -->
              <button
                v-if="!tryItMsgId && !hiddenAnswerIds.size"
                class="try-it-btn"
                @click="handleTryIt(msg.id)"
                title="隐藏参考答案，自己先想想"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                我来试试
              </button>
            </div>
            <div class="msg-card msg-card--interviewer">
              <p class="msg-text">{{ msg.content }}</p>
            </div>
            <!-- P0-1: 用户自己的回答输入框 -->
            <div v-if="tryItMsgId === msg.id" class="try-it-area">
              <textarea
                v-model="tryItUserAnswer"
                class="try-it-input"
                placeholder="先自己想想怎么回答这个问题..."
                rows="3"
              ></textarea>
              <button class="try-it-reveal" @click="handleRevealAnswer(messages[msgIdx + 1]?.id || '')">
                查看参考答案
              </button>
            </div>
          </div>

          <!-- 候选人 -->
          <div v-else-if="msg.role === 'candidate'" class="msg-block msg-block--candidate">
            <!-- P0-1: 隐藏状态 -->
            <div v-if="hiddenAnswerIds.has(msg.id)" class="answer-hidden-hint">
              <span>参考答案已隐藏，先自己思考</span>
            </div>
            <template v-else>
              <div class="msg-meta msg-meta--right">
                <span class="role-badge role-badge--candidate">候选人</span>
              </div>
              <div class="msg-card msg-card--candidate">
                <!-- P0-2: 关键句高亮 -->
                <p class="msg-text" v-html="highlightText(msg.content)"></p>
              </div>
            </template>
          </div>

          <!-- 教练点评 -->
          <div v-else-if="msg.role === 'coach'" class="msg-block msg-block--coach">
            <div class="coach-strip">
              <div class="coach-strip-header">
                <div class="coach-icon-wrap">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                    <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                    <path d="M2 17l10 5 10-5"/>
                    <path d="M2 12l10 5 10-5"/>
                  </svg>
                </div>
                <span class="coach-label">技巧解析</span>
                <div class="coach-tags">
                  <span v-for="tag in (msg.techniques || [])" :key="tag" class="coach-tag">{{ tag }}</span>
                </div>
                <button
                  class="bookmark-btn"
                  :class="{ bookmarked: savedMessageIds.has(msg.id) }"
                  :disabled="savedMessageIds.has(msg.id)"
                  @click="handleSaveToBank(msg)"
                  :title="savedMessageIds.has(msg.id) ? '已收藏' : '收藏到题库'"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" :fill="savedMessageIds.has(msg.id) ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2">
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                  </svg>
                </button>
              </div>
              <p class="coach-text">{{ msg.content }}</p>
              <!-- P1-4: 笔记入口 -->
              <div v-if="showNotes" class="inline-note">
                <textarea
                  :value="notesByQuestion[getInterviewerIndex(msgIdx - 2)] || ''"
                  @input="updateNote(getInterviewerIndex(msgIdx - 2), ($event.target as HTMLTextAreaElement).value)"
                  class="inline-note-input"
                  placeholder="记录你的想法..."
                  rows="2"
                ></textarea>
              </div>
            </div>
          </div>
        </template>

        <!-- 加载态 -->
        <div v-if="isLoading" class="msg-block msg-block--loading">
          <div class="typing-indicator">
            <span></span><span></span><span></span>
          </div>
          <span class="typing-label">正在生成下一轮...</span>
        </div>
      </div>
    </div>

    <!-- 错误 -->
    <div v-if="errorMsg" class="error-bar">
      <span class="error-text">{{ errorMsg }}</span>
      <button class="error-retry" @click="emit('next')">重试</button>
    </div>

    <!-- 总结 -->
    <Transition name="slide-up">
      <div v-if="finished && showSummary && (finalSummary || techniqueSummary.length)" class="summary-panel">
        <div class="summary-top">
          <h4 class="summary-title">观摩总结</h4>
          <button class="summary-close" @click="showSummary = false">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <p v-if="finalSummary" class="summary-desc">{{ finalSummary }}</p>
        <div v-if="techniqueSummary.length" class="summary-grid">
          <div v-for="(item, idx) in techniqueSummary" :key="idx" class="summary-card">
            <span class="summary-card-title">{{ item.technique }}</span>
            <span class="summary-card-desc">{{ item.description }}</span>
            <span class="summary-card-example">{{ item.example }}</span>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 底部控制 -->
    <footer v-if="sessionStarted" class="control-bar">
      <div class="control-group">
        <!-- 轮次间等待：显示"进入下一轮"按钮 -->
        <button v-if="waitingNextStage" class="ctl ctl--primary" @click="emit('nextStage')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,4 15,12 5,20"/><rect x="17" y="4" width="3" height="16" rx="1"/></svg>
          进入下一轮
        </button>
        <template v-else>
          <button class="ctl" :class="{ 'ctl--active': paused }" @click="emit('pause')" :disabled="finished">
            <svg v-if="!paused" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
            <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,4 20,12 6,20"/></svg>
            {{ paused ? '继续' : '暂停' }}
          </button>
          <button class="ctl" @click="emit('next')" :disabled="isLoading || finished">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,4 15,12 5,20"/><rect x="17" y="4" width="3" height="16" rx="1"/></svg>
            下一题
          </button>
          <button class="ctl ctl--danger" @click="emit('finish')" :disabled="isLoading || finished">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
            结束观摩
          </button>
        </template>
        <button class="ctl ctl--ghost" @click="emit('reset')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1,4 1,10 7,10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
          重来
        </button>
      </div>
    </footer>
  </div>
</template>

<style scoped>
/* ═══════════════════════════════════════════════
   CoachingSimulationPanel — 观摩学习面板
   设计理念：沉浸式阅读体验，清晰的角色区分，
   教练点评作为"旁注"而非主角
   ═══════════════════════════════════════════════ */

.coaching-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-base);
  overflow: hidden;
}

/* ──── 顶部信息条 ──── */
.coaching-topbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 24px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.topbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.mode-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
}
.mode-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--primary-500);
  box-shadow: 0 0 6px rgba(43, 123, 184, 0.4);
}
.mode-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: 0.02em;
}
.divider-dot {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--text-muted);
  opacity: 0.5;
}
.round-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
.topbar-progress {
  flex: 1;
  padding: 0 8px;
}
.progress-track {
  height: 3px;
  background: var(--border-color);
  border-radius: 2px;
  overflow: hidden;
}
.progress-thumb {
  height: 100%;
  background: linear-gradient(90deg, var(--primary-400), var(--primary-600));
  border-radius: 2px;
  transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}
.topbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.timer-mono {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
}
.status-chip {
  padding: 2px 8px;
  border-radius: var(--radius-full);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.03em;
  background: var(--bg-card-muted);
  color: var(--text-muted);
  border: 1px solid var(--border-color);
}
.status-chip.running {
  background: rgba(34, 197, 94, 0.1);
  color: #22c55e;
  border-color: rgba(34, 197, 94, 0.3);
}
.status-chip.paused {
  background: rgba(245, 158, 11, 0.1);
  color: #f59e0b;
  border-color: rgba(245, 158, 11, 0.3);
}
.status-chip.done {
  background: rgba(99, 102, 241, 0.1);
  color: #6366f1;
  border-color: rgba(99, 102, 241, 0.3);
}

/* ──── 对话主体 ──── */
.coaching-body {
  flex: 1;
  overflow-y: auto;
  padding: 28px 32px;
  scroll-behavior: smooth;
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 16px;
  text-align: center;
}
.empty-visual { margin-bottom: 8px; }
.empty-ring {
  width: 88px;
  height: 88px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--primary-50), transparent);
  border: 2px solid var(--border-color);
  color: var(--primary-400);
}
.empty-heading {
  margin: 0;
  font-size: 20px;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: -0.02em;
}
.empty-sub {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.7;
  max-width: 380px;
}
.action-start {
  margin-top: 8px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 11px 28px;
  background: var(--primary-500);
  color: var(--text-inverse);
  border: none;
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 14px rgba(43, 123, 184, 0.3);
}
.action-start:hover:not(:disabled) {
  background: var(--primary-600);
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(43, 123, 184, 0.4);
}
.action-start:disabled { opacity: 0.5; cursor: not-allowed; }

/* ──── 消息流 ──── */
.message-stream {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.msg-block {
  animation: msgEnter 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}
@keyframes msgEnter {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

/* 角色标签 */
.msg-meta { margin-bottom: 6px; }
.msg-meta--right { text-align: right; }
.role-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: var(--radius-full);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
}
.role-badge--interviewer {
  background: rgba(99, 102, 241, 0.1);
  color: #818cf8;
  border: 1px solid rgba(99, 102, 241, 0.2);
}
.role-badge--candidate {
  background: rgba(34, 197, 94, 0.1);
  color: #4ade80;
  border: 1px solid rgba(34, 197, 94, 0.2);
}

/* 消息卡片 */
.msg-card {
  padding: 16px 20px;
  border-radius: 12px;
  line-height: 1.7;
}
.msg-card--interviewer {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-left: 3px solid #818cf8;
  max-width: 85%;
}
.msg-card--candidate {
  background: rgba(34, 197, 94, 0.04);
  border: 1px solid rgba(34, 197, 94, 0.15);
  border-right: 3px solid #4ade80;
  max-width: 85%;
  margin-left: auto;
}
.msg-text {
  margin: 0;
  font-size: 13.5px;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
}

/* ──── 教练点评条 ──── */
.msg-block--coach {
  padding: 0 12px;
}
.coach-strip {
  position: relative;
  padding: 12px 16px;
  background: rgba(251, 191, 36, 0.04);
  border: 1px solid rgba(251, 191, 36, 0.15);
  border-radius: 8px;
  border-left: 3px solid rgba(251, 191, 36, 0.6);
}
.coach-strip-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}
.coach-icon-wrap {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(251, 191, 36, 0.15);
  color: #f59e0b;
  flex-shrink: 0;
}
.coach-label {
  font-size: 11px;
  font-weight: 700;
  color: #d97706;
  letter-spacing: 0.02em;
}
:root[data-theme="dark"] .coach-label { color: #fbbf24; }
.coach-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-left: 8px;
}
.coach-tag {
  padding: 1px 7px;
  background: rgba(251, 191, 36, 0.12);
  border: 1px solid rgba(251, 191, 36, 0.25);
  border-radius: var(--radius-full);
  font-size: 10px;
  font-weight: 600;
  color: #b45309;
}
:root[data-theme="dark"] .coach-tag {
  background: rgba(251, 191, 36, 0.1);
  border-color: rgba(251, 191, 36, 0.2);
  color: #fcd34d;
}
.bookmark-btn {
  margin-left: auto;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: #d97706;
  cursor: pointer;
  opacity: 0.5;
  transition: all 0.15s;
  flex-shrink: 0;
}
.bookmark-btn:hover:not(:disabled) { opacity: 1; background: rgba(251, 191, 36, 0.1); }
.bookmark-btn.bookmarked { opacity: 1; color: #f59e0b; }
:root[data-theme="dark"] .bookmark-btn { color: #fbbf24; }
.coach-text {
  margin: 0;
  font-size: 12.5px;
  color: var(--text-secondary);
  line-height: 1.7;
}

/* ──── 加载态 ──── */
.msg-block--loading {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
}
.typing-indicator {
  display: flex;
  gap: 4px;
  align-items: center;
}
.typing-indicator span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--primary-400);
  animation: typingBounce 1.4s infinite;
}
.typing-indicator span:nth-child(2) { animation-delay: 0.15s; }
.typing-indicator span:nth-child(3) { animation-delay: 0.3s; }
@keyframes typingBounce {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
  30% { transform: translateY(-4px); opacity: 1; }
}
.typing-label {
  font-size: 11px;
  color: var(--text-muted);
}

/* ──── 错误条 ──── */
.error-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 8px 24px;
  background: rgba(239, 68, 68, 0.06);
  border-top: 1px solid rgba(239, 68, 68, 0.15);
  flex-shrink: 0;
}
.error-text { font-size: 12px; color: #ef4444; }
.error-retry {
  padding: 3px 10px;
  background: #ef4444;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

/* ──── 总结面板 ──── */
.summary-panel {
  padding: 16px 24px;
  background: var(--bg-card);
  border-top: 1px solid var(--border-color);
  max-height: 220px;
  overflow-y: auto;
  flex-shrink: 0;
}
.slide-up-enter-active { transition: all 0.3s ease; }
.slide-up-leave-active { transition: all 0.2s ease; }
.slide-up-enter-from { transform: translateY(20px); opacity: 0; }
.slide-up-leave-to { transform: translateY(10px); opacity: 0; }
.summary-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.summary-title {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
}
.summary-close {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--text-muted);
  cursor: pointer;
}
.summary-close:hover { background: var(--bg-hover); color: var(--text-primary); }
.summary-desc {
  margin: 0 0 12px;
  font-size: 12.5px;
  color: var(--text-secondary);
  line-height: 1.6;
}
.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 8px;
}
.summary-card {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px 12px;
  background: var(--bg-card-muted);
  border: 1px solid var(--border-color);
  border-radius: 8px;
}
.summary-card-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--primary-500);
}
.summary-card-desc {
  font-size: 11px;
  color: var(--text-secondary);
  line-height: 1.5;
}
.summary-card-example {
  font-size: 10.5px;
  color: var(--text-muted);
  font-style: italic;
  line-height: 1.4;
}

/* ──── 底部控制栏 ──── */
.control-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
  padding: 12px 24px;
  background: var(--bg-card);
  border-top: 1px solid var(--border-color);
  flex-shrink: 0;
}
.control-group {
  display: flex;
  align-items: center;
  flex-direction: row;
  flex-wrap: nowrap;
  gap: 8px;
}
.ctl {
  display: inline-flex;
  align-items: center;
  flex-direction: row;
  gap: 5px;
  padding: 7px 14px;
  background: var(--bg-card-muted);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.ctl:hover:not(:disabled) {
  border-color: var(--primary-400);
  color: var(--primary-500);
  background: rgba(43, 123, 184, 0.05);
}
.ctl:disabled { opacity: 0.35; cursor: not-allowed; }
.ctl--active {
  border-color: #f59e0b;
  color: #d97706;
  background: rgba(245, 158, 11, 0.08);
}
.ctl--primary {
  background: var(--primary-500);
  border-color: var(--primary-500);
  color: var(--text-inverse);
}
.ctl--primary:hover:not(:disabled) {
  background: var(--primary-600);
  border-color: var(--primary-600);
  color: var(--text-inverse);
}
.ctl--danger:hover:not(:disabled) {
  border-color: #ef4444;
  color: #ef4444;
  background: rgba(239, 68, 68, 0.05);
}
.ctl--ghost {
  background: transparent;
  border-color: transparent;
  color: var(--text-muted);
}
.ctl--ghost:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--text-secondary);
  border-color: transparent;
}

/* ──── P0-3: 轮次进度指示器 ──── */
.stage-dots {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  justify-content: center;
}
.stage-dot-item {
  display: flex;
  align-items: center;
  gap: 4px;
}
.stage-dot-item::after {
  content: '';
  width: 20px;
  height: 1px;
  background: var(--border-color);
}
.stage-dot-item:last-child::after { display: none; }
.stage-dot-circle {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: 700;
  background: var(--bg-card-muted);
  color: var(--text-muted);
  border: 1px solid var(--border-color);
}
.stage-dot-item.active .stage-dot-circle {
  background: var(--primary-500);
  color: var(--text-inverse);
  border-color: var(--primary-500);
}
.stage-dot-item.done .stage-dot-circle {
  background: #22c55e;
  color: white;
  border-color: #22c55e;
}
.stage-dot-item.done::after { background: #22c55e; }
.stage-dot-item.active::after { background: var(--primary-400); }
.stage-dot-label {
  font-size: 9px;
  font-weight: 600;
  color: var(--text-muted);
}
.stage-dot-item.active .stage-dot-label { color: var(--primary-500); }
.stage-dot-item.done .stage-dot-label { color: #22c55e; }

/* ──── P0-1: "我来试试" ──── */
.try-it-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 8px;
  padding: 2px 8px;
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s;
}
.try-it-btn:hover {
  border-color: var(--primary-400);
  color: var(--primary-500);
  background: rgba(43, 123, 184, 0.05);
}
.try-it-area {
  margin-top: 10px;
  padding: 12px;
  background: var(--bg-card-muted);
  border: 1px dashed var(--primary-300);
  border-radius: 8px;
  max-width: 85%;
}
.try-it-input {
  width: 100%;
  padding: 8px 10px;
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 12.5px;
  color: var(--text-primary);
  resize: none;
  outline: none;
  font-family: inherit;
  line-height: 1.6;
}
.try-it-input:focus { border-color: var(--primary-400); }
.try-it-reveal {
  margin-top: 8px;
  padding: 5px 12px;
  background: var(--primary-500);
  color: var(--text-inverse);
  border: none;
  border-radius: 5px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}
.try-it-reveal:hover { background: var(--primary-600); }
.answer-hidden-hint {
  padding: 12px 16px;
  background: var(--bg-card-muted);
  border: 1px dashed var(--border-color);
  border-radius: 8px;
  text-align: center;
  max-width: 85%;
  margin-left: auto;
}
.answer-hidden-hint span {
  font-size: 12px;
  color: var(--text-muted);
  font-style: italic;
}

/* ──── P0-2: 关键句高亮 ──── */
:deep(.hl-data) {
  background: rgba(56, 189, 148, 0.08);
  color: #38bd94;
  padding: 0 3px;
  border-radius: 3px;
  border-bottom: 1px dashed rgba(56, 189, 148, 0.4);
}
:root[data-theme="dark"] :deep(.hl-data) {
  background: rgba(56, 189, 148, 0.06);
  color: #6ee7b7;
  border-bottom-color: rgba(110, 231, 183, 0.3);
}
:deep(.hl-metric) {
  background: rgba(139, 152, 227, 0.08);
  color: #8b98e3;
  padding: 0 3px;
  border-radius: 3px;
  border-bottom: 1px dashed rgba(139, 152, 227, 0.3);
}
:root[data-theme="dark"] :deep(.hl-metric) {
  background: rgba(139, 152, 227, 0.06);
  color: #b4bef5;
  border-bottom-color: rgba(180, 190, 245, 0.25);
}
:deep(.hl-technique) {
  background: rgba(217, 175, 106, 0.08);
  color: #d9af6a;
  padding: 0 3px;
  border-radius: 3px;
  border-bottom: 1px dashed rgba(217, 175, 106, 0.3);
}
:root[data-theme="dark"] :deep(.hl-technique) {
  background: rgba(217, 175, 106, 0.06);
  color: #e8c88a;
  border-bottom-color: rgba(232, 200, 138, 0.25);
}

/* ──── P1-4: 笔记 ──── */
.topbar-icon-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 5px;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s;
}
.topbar-icon-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
.topbar-icon-btn.active {
  background: rgba(43, 123, 184, 0.1);
  color: var(--primary-500);
  border-color: rgba(43, 123, 184, 0.2);
}
.inline-note {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed rgba(251, 191, 36, 0.2);
}
.inline-note-input {
  width: 100%;
  padding: 6px 10px;
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: 5px;
  font-size: 11.5px;
  color: var(--text-primary);
  resize: none;
  outline: none;
  font-family: inherit;
  line-height: 1.5;
}
.inline-note-input:focus { border-color: var(--primary-400); }
.inline-note-input::placeholder { color: var(--text-muted); }
</style>
