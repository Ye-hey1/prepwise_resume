<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import plaintext from 'highlight.js/lib/languages/plaintext'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import 'highlight.js/styles/github.css'
import type { InterviewMode, InterviewHintResult } from '@/services/interviewService'
import type { ChatMessage } from '@/components/ai/interview/types'
import VrmAvatar from '@/components/ai/interview/VrmAvatar.vue'
import { INTERVIEWER_MODELS, CANDIDATE_MODELS, type VrmModelInfo } from '@/config/vrmModels'
import interviewBgUrl from '@/assets/images/interview-bg.png'

hljs.registerLanguage('bash', bash)
hljs.registerLanguage('shell', bash)
hljs.registerLanguage('sh', bash)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('js', javascript)
hljs.registerLanguage('json', json)
hljs.registerLanguage('plaintext', plaintext)
hljs.registerLanguage('text', plaintext)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('ts', typescript)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('xml', xml)

const props = withDefaults(defineProps<{
  embedded?: boolean
  mode: InterviewMode
  /** 面试官模型 ID */
  interviewerModelId: string
  /** 候选人模型 ID */
  candidateModelId: string
  messages: ChatMessage[]
  isLoading: boolean
  errorMsg: string
  inputText: string
  canSend: boolean
  isListening: boolean
  streamingAssistantMessageId: string | null
  sessionStarted: boolean
  timerText: string
  timerStatusText: string
  currentRound: number
  userTurns: number
  assistantTurns: number
  canStart: boolean
  canFinish: boolean
  timerRunning: boolean
  /** 答题思路结构化数据 */
  hintData: InterviewHintResult | null
  hintCount: number
  maxHints: number
  isHinting: boolean
  /** TTS 音频是否正在播放 */
  isTtsPlaying: boolean
}>(), {
  embedded: false,
})

const emit = defineEmits<{
  (e: 'update:inputText', value: string): void
  (e: 'start'): void
  (e: 'togglePause'): void
  (e: 'finish'): void
  (e: 'reset'): void
  (e: 'adjustDuration', delta: number): void
  (e: 'send'): void
  (e: 'toggleVoice'): void
  (e: 'requestHint'): void
  (e: 'dismissHint'): void
  (e: 'useOpener', opener: string): void
  (e: 'quickAction', action: 'switch' | 'deeper' | 'skip'): void
}>()

const chatListRef = ref<HTMLElement | null>(null)
const aiAvatarRef = ref<InstanceType<typeof VrmAvatar> | null>(null)
const userAvatarRef = ref<InstanceType<typeof VrmAvatar> | null>(null)
const isReferenceVisible = ref(false)
const referenceCountdown = ref(10)
const referenceVariant = ref<"30s" | "60s">("30s")
const avatarPanelCollapsed = ref(false)
let referenceAutoHideTimer: ReturnType<typeof setTimeout> | null = null
let referenceCountdownTimer: ReturnType<typeof setInterval> | null = null

const referenceProgressWidth = computed(() => `${Math.max(0, Math.min(100, (referenceCountdown.value / 10) * 100))}%`)
const hintTypeLabel = computed(() => {
  switch (props.hintData?.questionType) {
    case 'opening':
      return '自我介绍'
    case 'project':
      return '项目深挖'
    case 'behavior':
      return '行为场景'
    case 'knowledge':
      return '知识原理'
    default:
      return '通用题'
  }
})
const starGuideLabel = computed(() => props.hintData?.questionType === 'opening' ? '表达节奏提醒' : 'STAR 结构引导')
const hasSplitReferenceAnswers = computed(() =>
  props.hintData?.questionType === 'opening'
  && (!!props.hintData.referenceAnswer30s || !!props.hintData.referenceAnswer60s)
)
const activeReferenceText = computed(() => {
  if (!props.hintData) return ''
  if (!hasSplitReferenceAnswers.value) return props.hintData.referenceAnswer
  return referenceVariant.value === '60s'
    ? (props.hintData.referenceAnswer60s || props.hintData.referenceAnswer30s)
    : (props.hintData.referenceAnswer30s || props.hintData.referenceAnswer60s)
})

function clearReferenceAutoHideTimer() {
  if (!referenceAutoHideTimer) return
  clearTimeout(referenceAutoHideTimer)
  referenceAutoHideTimer = null
}

function clearReferenceCountdownTimer() {
  if (!referenceCountdownTimer) return
  clearInterval(referenceCountdownTimer)
  referenceCountdownTimer = null
}

function hideReferenceAnswer() {
  isReferenceVisible.value = false
  referenceCountdown.value = 10
  clearReferenceAutoHideTimer()
  clearReferenceCountdownTimer()
}

function selectReferenceVariant(nextVariant: '30s' | '60s') {
  referenceVariant.value = nextVariant
}

function toggleReferenceAnswer() {
  if (!activeReferenceText.value) return
  if (isReferenceVisible.value) {
    hideReferenceAnswer()
    return
  }

  isReferenceVisible.value = true
  referenceCountdown.value = 10
  clearReferenceAutoHideTimer()
  clearReferenceCountdownTimer()
  referenceCountdownTimer = setInterval(() => {
    referenceCountdown.value = Math.max(0, referenceCountdown.value - 1)
    if (referenceCountdown.value <= 0) {
      clearReferenceCountdownTimer()
    }
  }, 1000)
  referenceAutoHideTimer = setTimeout(() => {
    isReferenceVisible.value = false
    referenceCountdown.value = 10
    referenceAutoHideTimer = null
    clearReferenceCountdownTimer()
  }, 10_000)
}

// ═══ 模型 URL 解析 ═══
const interviewerModel = computed<VrmModelInfo | undefined>(() =>
  INTERVIEWER_MODELS.find(m => m.id === props.interviewerModelId)
)
const candidateModel = computed<VrmModelInfo | undefined>(() =>
  CANDIDATE_MODELS.find(m => m.id === props.candidateModelId)
)

/** AI 对应的模型 */
const aiModel = computed(() =>
  props.mode === 'candidate' ? interviewerModel.value : candidateModel.value
)
/** 用户对应的模型 */
const userModel = computed(() =>
  props.mode === 'candidate' ? candidateModel.value : interviewerModel.value
)

/** AI 是否正在流式输出文字 */
const isAiSpeaking = computed(() =>
  !!props.streamingAssistantMessageId && !!streamingAssistantMessageText.value
)

/** 获取当前正在流式输出的文字内容 */
const streamingAssistantMessageText = computed(() => {
  if (!props.streamingAssistantMessageId) return ''
  const msg = props.messages.find(m => m.id === props.streamingAssistantMessageId)
  return msg?.content ?? ''
})
const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: false,
  highlight: function (str: string, lang: string) {
    if (lang && hljs.getLanguage(lang)) {
      try { return hljs.highlight(str, { language: lang }).value } catch (__) {}
    }
    return ''
  }
})

const assistantName = computed(() => props.mode === 'candidate' ? 'AI 面试官' : 'AI 候选人')
const pauseButtonLabel = computed(() => props.timerRunning ? '暂停' : '继续')
const isStreamingReply = computed(() => Boolean(props.streamingAssistantMessageId))
const latestAssistantMessage = computed(() =>
  [...props.messages].reverse().find((item) => item.role === 'assistant'),
)
/** 最后一条消息是否来自用户（用于隐藏"当前问题"栏） */
const isLastMessageFromUser = computed(() => {
  if (props.messages.length === 0) return false
  return props.messages[props.messages.length - 1]?.role === 'user'
})
/** 是否显示快捷操作按钮（面试官提问后、用户未回答时） */
const showQuickActions = computed(() => {
  return props.sessionStarted && !props.isLoading && !isLastMessageFromUser.value && props.messages.length > 0
})
const currentQuestion = computed(() => {
  // AI 正在思考/生成时不显示当前问题栏
  if (props.isLoading) return ''
  const content = latestAssistantMessage.value
    ? normalizeAssistantContent(latestAssistantMessage.value.content)
    : ''
  if (!content) return ''
  const compact = content.replace(/\s+/g, ' ').trim()
  if (compact.length <= 100) return compact
  return `${compact.slice(0, 100).trim()}...`
})
const roomStatusLabel = computed(() => {
  if (!props.sessionStarted) return '候场中'
  if (props.isLoading && !props.streamingAssistantMessageId) return '面试官正在追问准备'
  if (props.isListening) return '候选人正在作答'
  if (!props.timerRunning) return '已暂停，等待继续'
  return '正式面试进行中'
})
const roomStageLabel = computed(() => {
  if (!props.sessionStarted) return '入场准备'
  if (props.currentRound <= 1) return '开场破冰'
  if (props.currentRound <= 3) return '经历追问'
  if (props.currentRound <= 5) return '能力评估'
  return '终面总结'
})
const aiStatusLabel = computed(() => {
  if (!props.sessionStarted) return '等待候选人入场'
  if (aiState.value === 'thinking') return '整理追问'
  if (aiState.value === 'speaking') return '主导发问中'
  return '倾听候选人回答'
})
const userStatusLabel = computed(() => {
  if (!props.sessionStarted) return '等待开始'
  if (props.isListening) return '语音作答中'
  if (props.isLoading) return '等待提问'
  if (props.timerRunning) return '准备回答'
  return '暂时离席'
})

/** AI 状态：流式输出时为 speaking，加载中为 thinking，TTS 播放时也为 speaking */
const aiState = computed(() => {
  if (!props.sessionStarted) return 'idle'
  if (props.isLoading && !props.streamingAssistantMessageId) return 'thinking'
  if (isAiSpeaking.value) return 'speaking'
  if (props.isTtsPlaying) return 'speaking'
  return 'idle'
})

/** 用户状态 */
const userState = computed(() => {
  if (!props.sessionStarted) return 'idle'
  if (props.isListening) return 'listening'
  if (props.isLoading) return 'waiting'
  if (props.timerRunning) return 'active'
  return 'idle'
})

function normalizeAssistantContent(content: string): string {
  const text = content?.trim() || ''
  if (!text) return ''
  try {
    const jsonText = (() => {
      if (text.startsWith('{') && text.endsWith('}')) return text
      const first = text.indexOf('{')
      const last = text.lastIndexOf('}')
      if (first >= 0 && last > first) return text.slice(first, last + 1)
      return ''
    })()
    if (!jsonText) return text
    const parsed = JSON.parse(jsonText) as { assistantReply?: unknown }
    if (typeof parsed.assistantReply === 'string' && parsed.assistantReply.trim()) return parsed.assistantReply
  } catch { /* */ }
  return text
}

function renderMarkdown(content: string): string {
  return markdown.render(normalizeAssistantContent(content))
}

function scorePillClass(score: number): string {
  if (score >= 8) return 'pill-green'
  if (score >= 6) return 'pill-yellow'
  if (score >= 4) return 'pill-orange'
  return 'pill-red'
}

function handleInputKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter') return
  if ((event as KeyboardEvent & { isComposing?: boolean }).isComposing) return
  if (event.ctrlKey) return
  event.preventDefault()
  if (props.canSend) emit('send')
}

function scrollToBottom() {
  if (!chatListRef.value) return
  chatListRef.value.scrollTop = chatListRef.value.scrollHeight
}

watch(
  () => [props.messages.length, props.isLoading],
  async () => { await nextTick(); scrollToBottom() }
)

// ═══ TTS 音频播放时，联动 VRM 口型动画 ═══
watch(() => props.isTtsPlaying, (playing) => {
  if (!aiAvatarRef.value) return
  if (playing) {
    const lastMsg = [...props.messages].reverse().find(m => m.role === 'assistant')
    if (lastMsg) aiAvatarRef.value.playLipSync(lastMsg.content)
  } else {
    aiAvatarRef.value.stopLipSync()
  }
})

watch(() => props.hintData, () => {
  referenceVariant.value = '30s'
  hideReferenceAnswer()
})

onUnmounted(() => {
  clearReferenceAutoHideTimer()
  clearReferenceCountdownTimer()
})
</script>

<template>
  <section class="studio" :style="{ '--interview-room-bg': `url(${interviewBgUrl})` }">
    <!-- ════════ 顶部控制栏 ════════ -->
    <header v-if="!props.embedded" class="studio-topbar">
      <div class="topbar-section">
        <button v-if="canStart" type="button" class="tb-btn tb-primary" :disabled="isLoading" @click="emit('start')">
          <span class="tb-icon">▶</span> 开始面试
        </button>
        <button v-else type="button" class="tb-btn tb-default" :disabled="isLoading" @click="emit('togglePause')">
          {{ pauseButtonLabel }}
        </button>
        <button type="button" class="tb-btn tb-danger" :disabled="!canFinish" @click="emit('finish')">结束并评分</button>
        <button type="button" class="tb-btn tb-ghost" :disabled="isLoading" @click="emit('reset')">重置</button>
      </div>

      <div class="topbar-center">
        <div class="timer-display" :class="{ warning: sessionStarted && timerRunning && timerText.startsWith('0') }">
          <span class="timer-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></span>
          <span class="timer-val">{{ timerText }}</span>
        </div>
        <span class="round-badge">Round {{ currentRound }}</span>
      </div>

      <div class="topbar-section">
        <button type="button" class="tb-mini" @click="emit('adjustDuration', -5)">-5m</button>
        <span class="tb-duration">{{ timerStatusText }}</span>
        <button type="button" class="tb-mini" @click="emit('adjustDuration', 5)">+5m</button>
      </div>
    </header>

    <div v-if="errorMsg" class="studio-error">
      <span class="error-dot" />
      {{ errorMsg }}
    </div>

    <!-- ════════ 主体：聊天 + 角色形象 ════════ -->
    <div class="studio-body">
      <!-- 聊天区域 -->
      <div class="chat-stage">
        <div class="meeting-shell" :class="{ 'with-question': Boolean(currentQuestion) }">
          <div class="meeting-strip">
            <div class="meeting-strip-left">
              <span class="meeting-pill" :class="{ rec: sessionStarted }">
                <span class="meeting-rec-dot" :class="{ active: sessionStarted }"></span>
                {{ sessionStarted ? 'LIVE' : '待机' }}
              </span>
              <span class="meeting-pill">{{ roomStageLabel }}</span>
              <span class="meeting-pill subtle">{{ roomStatusLabel }}</span>
            </div>
            <div v-if="props.embedded" class="meeting-strip-right">
              <button v-if="canStart" type="button" class="meeting-action primary compact" :disabled="isLoading" @click="emit('start')">
                <svg class="action-icon" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M8 6.5v11l8-5.5-8-5.5z" />
                </svg>
                <span class="action-label">开始</span>
              </button>
              <button v-else type="button" class="meeting-action compact" :disabled="isLoading" @click="emit('togglePause')">
                <svg v-if="pauseButtonLabel === '暂停'" class="action-icon" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M8 6h3v12H8zM13 6h3v12h-3z" />
                </svg>
                <svg v-else class="action-icon" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M8 6.5v11l8-5.5-8-5.5z" />
                </svg>
                <span class="action-label">{{ pauseButtonLabel }}</span>
              </button>
              <button type="button" class="meeting-action compact" :disabled="!canFinish" @click="emit('finish')">
                <svg class="action-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M6 4h9l-1.2 5H18l-3 4-1.2-4H9z" />
                  <path d="M6 20h12" />
                </svg>
                <span class="action-label">评分</span>
              </button>
              <button type="button" class="meeting-action compact" :disabled="isLoading" @click="emit('reset')">
                <svg class="action-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M3 12a9 9 0 1 0 3-6.7" />
                  <path d="M3 4v5h5" />
                </svg>
                <span class="action-label">重置</span>
              </button>
              <button type="button" class="meeting-action compact mini" @click="emit('adjustDuration', -5)">
                <svg class="action-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
                  <path d="M5 12h14" />
                </svg>
                <span class="action-label">5m</span>
              </button>
              <button type="button" class="meeting-action compact mini" @click="emit('adjustDuration', 5)">
                <svg class="action-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
                  <path d="M5 12h14" />
                  <path d="M12 5v14" />
                </svg>
                <span class="action-label">5m</span>
              </button>
            </div>
            <div v-else class="meeting-strip-right">
              <span class="meeting-mini">{{ timerText }}</span>
              <span class="meeting-mini">{{ timerStatusText }}</span>
            </div>
          </div>

          <div v-if="currentQuestion && !isLastMessageFromUser" class="question-bar">
            <span class="question-bar-label">当前问题</span>
            <p class="question-bar-text">{{ currentQuestion }}</p>
          </div>
        </div>

        <div ref="chatListRef" class="chat-scroll">
          <div v-if="messages.length === 0" class="chat-empty">
            <div class="orb-container">
              <div class="orb-ring ring-1"></div>
              <div class="orb-ring ring-2"></div>
              <button class="orb-core" @click="emit('start')" title="开始面试">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" class="orb-icon" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
              </button>
            </div>
            <p class="empty-title">点击开始面试</p>
            <p class="empty-sub">目标岗位语料已就绪，点击中央按钮进入沉浸式模拟现场</p>
          </div>

          <template v-for="item in messages" :key="item.id">
            <!-- 用户消息 -->
            <div v-if="item.role === 'user'" class="msg msg-user">
              <div class="msg-bubble user-bubble">
                <p>{{ item.content }}</p>
              </div>
            </div>

            <!-- AI 消息 -->
            <div v-else class="msg msg-ai">
              <div class="ai-label-row">
                <span class="ai-dot" :class="{ active: !isLoading || streamingAssistantMessageId === item.id }" />
                <span class="ai-name">{{ assistantName }}</span>
              </div>
              <div class="msg-bubble ai-bubble">
                <div class="md-content" v-safe-html:md="renderMarkdown(item.content)" />
                <span v-if="props.streamingAssistantMessageId === item.id" class="cursor-blink">▌</span>
              </div>
              <span v-if="item.score" class="score-pill" :class="scorePillClass(item.score.score)">
                {{ item.score.score }}/10 · {{ item.score.comment }}
              </span>
            </div>
          </template>

          <!-- AI 思考中 -->
          <div v-if="isLoading && !isStreamingReply" class="msg msg-ai">
            <div class="ai-label-row">
              <span class="ai-dot thinking" />
              <span class="ai-name">{{ assistantName }}</span>
            </div>
            <div class="msg-bubble ai-bubble thinking-bubble">
              <span class="think-dot" />
              <span class="think-dot" />
              <span class="think-dot" />
            </div>
          </div>
        </div>

        <!-- 快捷操作按钮 -->
        <div v-if="showQuickActions" class="quick-actions-bar">
          <button type="button" class="quick-action-btn" @click="emit('quickAction', 'switch')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            换个方向
          </button>
          <button type="button" class="quick-action-btn" @click="emit('quickAction', 'deeper')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>
            追问这个
          </button>
          <button type="button" class="quick-action-btn" @click="emit('quickAction', 'skip')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            跳过
          </button>
        </div>

        <!-- 输入区域 -->
        <form class="chat-input-area" @submit.prevent="emit('send')">
          <textarea
            :value="inputText"
            class="chat-textarea"
            rows="2"
            :placeholder="isListening ? '正在录音...' : '输入你的回答，Enter 发送...'"
            :disabled="isLoading"
            @input="emit('update:inputText', ($event.target as HTMLTextAreaElement).value)"
            @keydown="handleInputKeydown"
          />
          <div class="input-toolbar">
            <button type="button" class="tool-btn" :class="{ active: isListening }" :disabled="!sessionStarted || isLoading" @click="emit('toggleVoice')" title="语音输入">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
            </button>
            <button type="button" class="tool-btn hint-tool" :class="{ 'hint-loading': props.isHinting }" :disabled="!sessionStarted || isLoading || props.isHinting || props.hintCount >= props.maxHints" @click="emit('requestHint')" :title="props.hintCount >= props.maxHints ? `思路提示已用完 (${props.maxHints}/${props.maxHints})` : `答题思路 (${props.hintCount}/${props.maxHints})`">
              <svg v-if="!props.isHinting" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>
              <span v-else class="hint-spinner"></span>
            </button>
            <button type="submit" class="send-btn" :disabled="!canSend">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </div>
        </form>
      </div>

      <Teleport to="body">
        <Transition name="hint-slide">
          <div v-if="props.hintData" class="hint-modal-overlay" @click.self="emit('dismissHint')">
            <div class="hint-card">
              <div class="hint-card-header">
                <div class="hint-card-title-wrap">
                  <span class="hint-card-title">答题思路提示</span>
                  <p class="hint-card-subtitle">围绕当前问题整理回答顺序，先稳住结构，再决定细节展开。</p>
                </div>
                <span class="hint-usage">已用 {{ hintCount }}/{{ maxHints }}</span>
                <button class="hint-close-btn" @click="emit('dismissHint')">×</button>
              </div>
              <div class="hint-card-body">
                <div class="hint-hero">
                  <div class="hint-question-panel">
                    <div class="hint-panel-label">当前问题</div>
                    <p class="hint-question-text">{{ props.hintData.questionSummary }}</p>
                  </div>
                  <div class="hint-meta-panel">
                    <div class="hint-meta-item">
                      <span class="hint-meta-label">题型</span>
                      <span class="hint-type-chip">{{ hintTypeLabel }}</span>
                    </div>
                    <div class="hint-meta-item">
                      <span class="hint-meta-label">考察点</span>
                      <p class="hint-meta-value">{{ props.hintData.questionIntent }}</p>
                    </div>
                  </div>
                </div>

                <div class="hint-section" v-if="props.hintData.answerFramework.length">
                  <div class="hint-section-label">推荐答题结构</div>
                  <div class="hint-framework-list">
                    <div v-for="(item, index) in props.hintData.answerFramework" :key="`${index}-${item}`" class="hint-framework-item">
                      <span class="hint-framework-index">{{ index + 1 }}</span>
                      <span class="hint-framework-text">{{ item }}</span>
                    </div>
                  </div>
                </div>

                <div class="hint-section">
                  <div class="hint-section-label">核心思路</div>
                  <ul class="hint-bullets">
                    <li v-for="(b, i) in props.hintData.bullets" :key="i">{{ b }}</li>
                  </ul>
                </div>
                <div class="hint-section" v-if="props.hintData.opener">
                  <div class="hint-section-label">推荐开场句</div>
                  <div class="hint-opener-row">
                    <span class="hint-opener-text">「{{ props.hintData.opener }}」</span>
                    <button class="hint-use-btn" @click="emit('useOpener', props.hintData.opener)">引用</button>
                  </div>
                </div>
                <div class="hint-section" v-if="props.hintData.starGuide">
                  <div class="hint-section-label">{{ starGuideLabel }}</div>
                  <p class="hint-star-text">{{ props.hintData.starGuide }}</p>
                </div>
                <div class="hint-section" v-if="activeReferenceText">
                  <div class="hint-reference-head">
                    <div class="hint-reference-head-left">
                      <div class="hint-section-label">参考回答</div>
                      <div v-if="hasSplitReferenceAnswers" class="hint-reference-tabs">
                        <button
                          type="button"
                          class="hint-reference-tab"
                          :class="{ active: referenceVariant === '30s' }"
                          @click="selectReferenceVariant('30s')"
                        >
                          30 秒版
                        </button>
                        <button
                          type="button"
                          class="hint-reference-tab"
                          :class="{ active: referenceVariant === '60s' }"
                          @click="selectReferenceVariant('60s')"
                        >
                          60 秒版
                        </button>
                      </div>
                    </div>
                    <button class="hint-toggle-btn" type="button" @click="toggleReferenceAnswer">
                      {{ isReferenceVisible ? `剩余 ${referenceCountdown}s` : '展开 10 秒' }}
                    </button>
                  </div>
                  <p v-if="!isReferenceVisible" class="hint-reference-placeholder">
                    默认隐藏。点击"展开 10 秒"可短暂查看参考表达，系统会自动收起，避免过度依赖。
                  </p>
                  <Transition name="hint-fade">
                    <div v-if="isReferenceVisible" class="hint-reference-card">
                      <div class="hint-reference-status">
                        <span class="hint-reference-badge">参考答案展示中</span>
                        <span class="hint-reference-timer">{{ referenceCountdown }}s</span>
                      </div>
                      <div class="hint-reference-progress">
                        <span class="hint-reference-progress-bar" :style="{ width: referenceProgressWidth }"></span>
                      </div>
                      <p class="hint-reference-text">{{ activeReferenceText }}</p>
                      <p class="hint-reference-tip">内容将在 10 秒后自动隐藏，请优先理解表达结构，而不是逐字照读。</p>
                    </div>
                  </Transition>
                </div>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>

      <!-- ════════ 右侧双 3D 虚拟形象面板 ════════ -->
      <aside class="avatar-panel" :class="{ collapsed: avatarPanelCollapsed }">
        <button type="button" class="avatar-collapse-toggle" @click="avatarPanelCollapsed = !avatarPanelCollapsed" :title="avatarPanelCollapsed ? '展开头像' : '收起头像'">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <!-- AI 角色 3D 形象 -->
        <div class="avatar-stage interviewer-stage" :class="aiState">
          <div class="role-badge">AI 面试官</div>
          <div class="seat-caption">
            <span class="seat-caption-status">{{ aiStatusLabel }}</span>
          </div>
          <VrmAvatar
            ref="aiAvatarRef"
            :model-url="aiModel?.url"
            :is-speaking="isAiSpeaking"
            :streaming-text="streamingAssistantMessageText"
            :avatar-state-override="aiState === 'thinking' ? 'thinking' : null"
          />
          <div class="avatar-status-tag">
            <span class="status-indicator" :class="aiState" />
            <span class="status-label">{{ aiModel?.name ?? assistantName }}</span>
          </div>
        </div>

        <div class="avatar-divider" />

        <!-- 用户角色 3D 形象 -->
        <div class="avatar-stage user-stage" :class="userState">
          <div class="role-badge">候选人</div>
          <div class="seat-caption">
            <span class="seat-caption-status user">{{ userStatusLabel }}</span>
          </div>
          <VrmAvatar
            ref="userAvatarRef"
            :model-url="userModel?.url"
            :is-speaking="false"
          />
          <div class="avatar-status-tag">
            <span class="status-indicator user-indicator" :class="userState" />
            <span class="status-label">{{ userModel?.name ?? '你' }}</span>
          </div>
        </div>

        <!-- 对抗统计 -->
        <div class="avatar-stats">
          <div class="stat-item">
            <span class="stat-val">{{ assistantTurns }}</span>
            <span class="stat-label">AI 发言</span>
          </div>
          <div class="stat-divider" />
          <div class="stat-item">
            <span class="stat-val">{{ userTurns }}</span>
            <span class="stat-label">我的回答</span>
          </div>
          <div class="stat-divider" />
          <div class="stat-item">
            <span class="stat-val">{{ currentRound }}</span>
            <span class="stat-label">当前轮次</span>
          </div>
        </div>
      </aside>
    </div>
  </section>
</template>

<style scoped>
/* ═══════════════════════════════════════════
   Immersive Interview Studio - Dark Theme
   ═══════════════════════════════════════════ */

.studio {
  --studio-bg: #0b1120;
  --studio-surface: rgba(16, 24, 40, 0.75);
  --studio-border: rgba(100, 140, 200, 0.15);
  --studio-glow: rgba(43, 123, 184, 0.06);
  --studio-text: #e2e8f0;
  --studio-text-dim: #8899ac;
  --studio-accent: #2b7bb8;
  --studio-user-accent: #059669;
  --studio-ai-accent: #6366f1;

  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: #0b1120;
  color: var(--studio-text);
  font-family: 'Noto Sans SC', system-ui, sans-serif;
  overflow: hidden;
  position: relative;
  background:
    linear-gradient(180deg, rgba(7, 12, 25, 0.78), rgba(8, 14, 26, 0.92)),
    radial-gradient(circle at 16% 14%, rgba(56, 189, 248, 0.12), transparent 28%),
    radial-gradient(circle at 82% 10%, rgba(99, 102, 241, 0.16), transparent 24%),
    var(--interview-room-bg) center center / cover no-repeat,
    linear-gradient(135deg, rgba(15, 23, 42, 0.98), rgba(7, 12, 25, 1) 45%, rgba(10, 18, 36, 0.98));
}

.studio::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.035), transparent 18%),
    radial-gradient(circle at center, rgba(15, 23, 42, 0.12), transparent 36%),
    repeating-linear-gradient(90deg, rgba(148, 163, 184, 0.028) 0 1px, transparent 1px 140px);
  pointer-events: none;
  opacity: 0.75;
}

.studio::after {
  content: '';
  position: absolute;
  inset: auto 0 0 0;
  height: 32%;
  background:
    linear-gradient(180deg, transparent, rgba(11, 17, 32, 0.88) 72%, rgba(8, 12, 22, 0.96)),
    radial-gradient(circle at 50% 18%, rgba(59, 130, 246, 0.08), transparent 34%);
  pointer-events: none;
}

.studio-topbar, .studio-error, .studio-body {
  position: relative;
  z-index: 1;
}

/* ═══ 顶栏 ═══ */
.studio-topbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px;
  background: rgba(12, 18, 32, 0.85);
  border-bottom: 1px solid rgba(100, 140, 200, 0.12);
  gap: 16px;
}

.topbar-section {
  display: flex;
  align-items: center;
  gap: 8px;
}

.topbar-center {
  display: flex;
  align-items: center;
  gap: 12px;
}

.timer-display {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 10px;
  background: rgba(20, 30, 50, 0.6);
  border: 1px solid var(--studio-border);
  font-variant-numeric: tabular-nums;
}

.timer-display.warning {
  border-color: rgba(245, 158, 11, 0.4);
  animation: timer-pulse 2s ease infinite;
}

@keyframes timer-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); }
  50% { box-shadow: 0 0 16px 2px rgba(245, 158, 11, 0.12); }
}

.timer-icon { display: flex; align-items: center; color: var(--studio-text-dim); }
.timer-val { font-size: 15px; font-weight: 800; color: #e2e8f0; }

.round-badge {
  padding: 4px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 700;
  background: rgba(99, 102, 241, 0.08);
  color: var(--studio-ai-accent);
  border: 1px solid rgba(99, 102, 241, 0.15);
}

/* ═══ 按钮 ═══ */
.tb-btn, .tb-mini {
  border-radius: 10px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid transparent;
  font-family: inherit;
}

.tb-btn {
  padding: 7px 16px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.tb-btn:disabled { opacity: 0.35; cursor: not-allowed; }

.tb-primary {
  background: linear-gradient(135deg, var(--studio-accent), #1a6399);
  color: #fff;
  border-color: transparent;
  box-shadow: 0 4px 16px rgba(43, 123, 184, 0.25);
}
.tb-primary:hover:not(:disabled) { box-shadow: 0 6px 24px rgba(43, 123, 184, 0.35); transform: translateY(-1px); }

.tb-default {
  background: rgba(20, 30, 50, 0.5);
  color: var(--studio-text);
  border-color: var(--studio-border);
}
.tb-default:hover:not(:disabled) { background: rgba(30, 45, 70, 0.6); }

.tb-danger {
  background: rgba(220, 50, 50, 0.06);
  color: #dc2626;
  border-color: rgba(220, 50, 50, 0.2);
}
.tb-danger:hover:not(:disabled) { background: rgba(220, 50, 50, 0.12); }

.tb-ghost {
  background: transparent;
  color: var(--studio-text-dim);
  border-color: var(--studio-border);
}
.tb-ghost:hover:not(:disabled) { color: var(--studio-text); background: rgba(20, 30, 50, 0.4); }

.tb-mini {
  padding: 5px 10px;
  background: rgba(20, 30, 50, 0.45);
  color: var(--studio-text-dim);
  border-color: var(--studio-border);
}
.tb-mini:hover { color: var(--studio-text); background: rgba(30, 45, 70, 0.55); }

.tb-duration { font-size: 11px; color: var(--studio-text-dim); font-weight: 600; }
.tb-icon { font-size: 10px; }

/* ═══ 错误 ═══ */
.studio-error {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: rgba(220, 50, 50, 0.06);
  border-bottom: 1px solid rgba(220, 50, 50, 0.15);
  color: #dc2626;
  font-size: 12px;
  font-weight: 600;
}
.error-dot { width: 6px; height: 6px; border-radius: 50%; background: #ef4444; flex-shrink: 0; }

/* ═══ 主体 ═══ */
.studio-body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 0;
  overflow: hidden;
}

/* ═══════════════════════════════════════
   聊天舞台
   ═══════════════════════════════════════ */
.chat-stage {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background:
    linear-gradient(180deg, rgba(9, 14, 28, 0.46), rgba(8, 14, 26, 0.58)),
    radial-gradient(circle at 20% 18%, rgba(59, 130, 246, 0.05), transparent 24%);
  border-right: 1px solid rgba(100, 140, 200, 0.08);
}

.meeting-shell {
  flex-shrink: 0;
  margin: 14px 20px 0;
  padding: 14px 16px;
  border-radius: 22px;
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.34), rgba(15, 23, 42, 0.22));
  border: 1px solid rgba(148, 163, 184, 0.1);
  backdrop-filter: blur(18px);
  box-shadow: 0 12px 30px rgba(3, 7, 18, 0.16);
}

.meeting-shell.with-question {
  padding-bottom: 12px;
}

.meeting-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0;
}

.meeting-strip-left,
.meeting-strip-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.meeting-strip-right {
  justify-content: flex-end;
}

.meeting-pill,
.meeting-mini {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.32);
  border: 1px solid rgba(148, 163, 184, 0.1);
  backdrop-filter: blur(18px);
  color: #d8e6f5;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.meeting-pill.subtle,
.meeting-mini {
  color: #9eb1c7;
  font-weight: 700;
}

.meeting-pill.rec {
  color: #fda4af;
  border-color: rgba(251, 113, 133, 0.16);
  background: rgba(127, 29, 29, 0.18);
}

.meeting-rec-dot {
  width: 7px;
  height: 7px;
  margin-right: 8px;
  border-radius: 50%;
  background: #6b7a90;
  box-shadow: none;
  transition: background 0.3s ease, box-shadow 0.3s ease;
}

.meeting-rec-dot.active {
  background: #fb7185;
  box-shadow: 0 0 10px rgba(251, 113, 133, 0.45);
  animation: meeting-rec-pulse 1.6s ease-in-out infinite;
}

@keyframes meeting-rec-pulse {
  0%, 100% { opacity: 0.65; transform: scale(0.9); }
  50% { opacity: 1; transform: scale(1.08); }
}

.question-bar {
  margin-top: 14px;
  padding: 12px 14px;
  border-radius: 18px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  background: rgba(255, 255, 255, 0.025);
  border: 1px solid rgba(148, 163, 184, 0.08);
  backdrop-filter: blur(18px);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
}

.meeting-action {
  min-height: 34px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.1);
  background: rgba(15, 23, 42, 0.26);
  color: #d8e6f5;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  backdrop-filter: blur(18px);
  transition: all 0.2s ease;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
}

.meeting-action:hover:not(:disabled) {
  background: rgba(30, 41, 59, 0.34);
  border-color: rgba(148, 163, 184, 0.16);
}

.meeting-action.primary {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.92), rgba(37, 99, 235, 0.88));
  border-color: transparent;
  color: #fff;
  box-shadow: 0 10px 22px rgba(59, 130, 246, 0.24);
}

.meeting-action.primary:hover:not(:disabled) {
  box-shadow: 0 12px 28px rgba(59, 130, 246, 0.3);
}

.meeting-action.compact {
  min-height: 31px;
  padding: 0 11px;
  font-size: 11px;
}

.meeting-action.mini {
  min-width: 54px;
  justify-content: center;
}

.action-icon {
  flex-shrink: 0;
  opacity: 0.9;
}

.action-label {
  line-height: 1;
  letter-spacing: 0.01em;
}

.meeting-action:disabled {
  opacity: 0.38;
  cursor: not-allowed;
}

.question-bar-label {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  min-height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(59, 130, 246, 0.12);
  border: 1px solid rgba(96, 165, 250, 0.14);
  color: #bfdbfe;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.question-bar-text {
  margin: 0;
  flex: 1;
  min-width: 0;
  font-size: 13px;
  line-height: 1.6;
  color: #d9e7f7;
  font-weight: 600;
  /* 限制最多 2 行 */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.chat-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 20px 6px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* 当没有空状态时（有消息），让内容贴近底部 */
.chat-scroll:not(:has(.chat-empty)) {
  justify-content: flex-end;
}

.chat-scroll::-webkit-scrollbar { width: 4px; }
.chat-scroll::-webkit-scrollbar-thumb { background: rgba(100, 116, 139, 0.18); border-radius: 4px; }

/* ═══ 沉浸式空状态开始按钮 ═══ */
.chat-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  padding: 32px 20px 56px;
}

.chat-empty::before {
  content: '';
  position: absolute;
  width: min(56vw, 620px);
  height: min(42vw, 360px);
  border-radius: 32px;
  background:
    linear-gradient(180deg, rgba(15, 23, 42, 0.24), rgba(15, 23, 42, 0.08)),
    radial-gradient(circle at top, rgba(96, 165, 250, 0.1), transparent 42%);
  border: 1px solid rgba(148, 163, 184, 0.08);
  box-shadow: 0 32px 80px rgba(2, 6, 23, 0.24);
  backdrop-filter: blur(8px);
  z-index: 0;
}

.orb-container {
  position: relative;
  width: 140px;
  height: 140px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24px;
  z-index: 1;
}

.orb-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 1px solid rgba(43, 123, 184, 0.25);
  animation: orb-pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

.ring-2 {
  animation-delay: 1.5s;
  border-color: rgba(99, 102, 241, 0.2);
}

@keyframes orb-pulse {
  0% { transform: scale(0.6); opacity: 1; }
  100% { transform: scale(1.6); opacity: 0; border-width: 0.5px; }
}

.orb-core {
  position: relative;
  z-index: 2;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  border: none;
  background: linear-gradient(135deg, #2b7bb8, #6366f1);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 0 24px rgba(43, 123, 184, 0.35), 0 0 48px rgba(99, 102, 241, 0.12);
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s;
  animation: orb-glow 3s ease-in-out infinite;
}
.orb-core::before {
  content: "";
  position: absolute; inset: -4px; border-radius: 50%;
  background: conic-gradient(from 0deg, transparent, rgba(43, 123, 184, 0.3), transparent, rgba(99, 102, 241, 0.2), transparent);
  animation: orb-spin 6s linear infinite; z-index: -1;
}
@keyframes orb-spin {
  to { transform: rotate(360deg); }
}

@keyframes orb-glow {
  0%, 100% { box-shadow: 0 0 24px rgba(43, 123, 184, 0.35), 0 0 48px rgba(99, 102, 241, 0.1); }
  50% { box-shadow: 0 0 32px rgba(43, 123, 184, 0.5), 0 0 64px rgba(99, 102, 241, 0.18); }
}

.orb-core:hover {
  transform: scale(1.1);
  box-shadow: 0 0 32px rgba(43, 123, 184, 0.5), 0 0 64px rgba(99, 102, 241, 0.15);
}

.orb-core:active {
  transform: scale(0.95);
}

.orb-icon { filter: drop-shadow(0 2px 4px rgba(0,0,0,0.15)); }

.empty-title {
  position: relative;
  z-index: 1;
  font-size: 24px;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: #eef5ff;
  margin: 0 0 10px;
}

.empty-sub {
  position: relative;
  z-index: 1;
  font-size: 14px;
  color: rgba(226, 232, 240, 0.76);
  text-align: center;
  max-width: 420px;
  line-height: 1.75;
}

/* ═══ 消息 ═══ */
.msg { display: flex; flex-direction: column; gap: 4px; animation: msg-in 0.3s ease-out; }

@keyframes msg-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.msg-user { align-items: flex-end; }
.msg-ai { align-items: flex-start; }

.ai-label-row { display: flex; align-items: center; gap: 8px; }

.ai-dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: var(--studio-text-dim);
  transition: background 0.3s;
}
.ai-dot.active { background: var(--studio-ai-accent); box-shadow: 0 0 8px rgba(99, 102, 241, 0.3); }
.ai-dot.thinking { background: #f59e0b; animation: dot-pulse 1s ease infinite; }

@keyframes dot-pulse {
  0%, 100% { opacity: 0.4; } 50% { opacity: 1; }
}

.ai-name { font-size: 11px; font-weight: 700; color: var(--studio-text-dim); letter-spacing: 0.04em; }

.msg-bubble { max-width: 78%; padding: 12px 16px; line-height: 1.7; word-break: break-word; }

.user-bubble {
  border-radius: 18px 18px 4px 18px;
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.18), rgba(99, 102, 241, 0.12));
  border: 1px solid rgba(96, 165, 250, 0.15);
  box-shadow: 0 6px 18px rgba(30, 41, 59, 0.08);
  color: #dfedfb;
  font-size: 14px;
  backdrop-filter: blur(12px);
}

.user-bubble p { margin: 0; white-space: pre-wrap; }

.ai-bubble {
  border-radius: 18px 18px 18px 4px;
  background: rgba(15, 23, 42, 0.26);
  border: 1px solid rgba(148, 163, 184, 0.1);
  border-left: 3px solid rgba(99, 102, 241, 0.4);
  box-shadow: 0 6px 18px rgba(2, 6, 23, 0.14);
  color: var(--studio-text);
  font-size: 14px;
  backdrop-filter: blur(14px);
}

.ai-bubble :deep(p) { margin: 0 0 8px; }
.ai-bubble :deep(p:last-child) { margin-bottom: 0; }
.ai-bubble :deep(ul), .ai-bubble :deep(ol) { margin: 4px 0; padding-left: 18px; }
.ai-bubble :deep(li) { margin-bottom: 3px; }
.ai-bubble :deep(pre) { margin: 8px 0; padding: 10px; border-radius: 10px; background: rgba(10, 16, 28, 0.6); color: #c3d5ed; overflow-x: auto; border: 1px solid rgba(100, 140, 200, 0.12); }
.ai-bubble :deep(code) { font-family: Consolas, 'Courier New', monospace; font-size: 12px; }
.ai-bubble :deep(p code), .ai-bubble :deep(li code) { background: rgba(43, 123, 184, 0.08); padding: 2px 6px; border-radius: 4px; color: #5e9bce; }

/* 思考气泡 */
.thinking-bubble {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 16px 20px;
  background: rgba(16, 24, 40, 0.65);
}

.think-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--studio-ai-accent);
  animation: think-bounce 1.4s ease-in-out infinite;
}
.think-dot:nth-child(2) { animation-delay: 0.2s; }
.think-dot:nth-child(3) { animation-delay: 0.4s; }

@keyframes think-bounce {
  0%, 80%, 100% { opacity: 0.3; transform: scale(0.7); }
  40% { opacity: 1; transform: scale(1.2); }
}

.cursor-blink { color: var(--studio-ai-accent); font-weight: 700; animation: blink 0.9s steps(1) infinite; }
@keyframes blink { 50% { opacity: 0; } }

/* ═══ 评分 ═══ */
.score-pill {
  display: inline-flex;
  padding: 3px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  margin-top: 4px;
  animation: scorePillIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
@keyframes scorePillIn {
  from { opacity: 0; transform: scale(0.85) translateY(4px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
.pill-green { background: linear-gradient(135deg, rgba(34, 197, 94, 0.12), rgba(6, 182, 212, 0.08)); color: #16a34a; border: 1px solid rgba(34, 197, 94, 0.2); }
.pill-yellow { background: linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(234, 179, 8, 0.06)); color: #d97706; border: 1px solid rgba(245, 158, 11, 0.2); }
.pill-orange { background: linear-gradient(135deg, rgba(251, 146, 60, 0.12), rgba(245, 158, 11, 0.06)); color: #ea580c; border: 1px solid rgba(251, 146, 60, 0.2); }
.pill-red { background: linear-gradient(135deg, rgba(239, 68, 68, 0.12), rgba(251, 146, 60, 0.06)); color: #dc2626; border: 1px solid rgba(239, 68, 68, 0.2); }

/* ═══ 输入区域 ═══ */
.quick-actions-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 20px 8px;
  flex-shrink: 0;
}

.quick-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.15);
  background: rgba(15, 23, 42, 0.3);
  color: rgba(203, 213, 225, 0.8);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  backdrop-filter: blur(8px);
}

.quick-action-btn:hover {
  background: rgba(59, 130, 246, 0.15);
  border-color: rgba(59, 130, 246, 0.3);
  color: rgba(147, 197, 253, 1);
  transform: translateY(-1px);
}

.chat-input-area {
  flex-shrink: 0;
  display: flex;
  align-items: flex-end;
  gap: 14px;
  margin: 0 16px 12px;
  padding: 12px 14px;
  border-radius: 22px;
  background: rgba(15, 23, 42, 0.32);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(148, 163, 184, 0.1);
  position: relative;
  z-index: 10;
  box-shadow: 0 16px 36px rgba(2, 6, 23, 0.18);
}

.chat-input-area::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.03), transparent 35%);
  pointer-events: none;
}

.chat-textarea {
  flex: 1;
  min-height: 42px;
  max-height: 120px;
  padding: 10px 14px;
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.08);
  background: rgba(15, 23, 42, 0.14);
  color: var(--studio-text);
  font-size: 14px;
  font-family: inherit;
  line-height: 1.6;
  resize: vertical;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.chat-textarea::placeholder { color: #546174; }
.chat-textarea:focus {
  border-color: rgba(96, 165, 250, 0.3);
  box-shadow:
    0 0 0 3px rgba(59, 130, 246, 0.08),
    0 0 20px rgba(59, 130, 246, 0.1);
}

.input-toolbar { display: flex; align-items: center; gap: 6px; }

.tool-btn {
  width: 40px; height: 40px;
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.08);
  background: rgba(15, 23, 42, 0.18);
  color: var(--studio-text-dim);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  backdrop-filter: blur(10px);
}
.tool-btn:hover:not(:disabled) { background: rgba(30, 45, 70, 0.3); color: var(--studio-text); border-color: rgba(100, 140, 200, 0.18); transform: translateY(-1px); }
.tool-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.tool-btn.active { border-color: rgba(239, 68, 68, 0.3); color: #ef4444; background: rgba(239, 68, 68, 0.06); }
.tool-btn.hint-tool:hover:not(:disabled) { border-color: rgba(245, 158, 11, 0.3); color: #d97706; }

.send-btn {
  width: 40px; height: 40px;
  border-radius: 14px;
  border: none;
  background: linear-gradient(135deg, #3b82f6, #6366f1);
  color: #fff;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  box-shadow: 0 8px 18px rgba(59, 130, 246, 0.22);
  position: relative; overflow: hidden;
}
.send-btn:hover:not(:disabled) { box-shadow: 0 10px 24px rgba(59, 130, 246, 0.35); transform: translateY(-2px) scale(1.05); }
.send-btn:disabled { opacity: 0.3; cursor: not-allowed; transform: none; box-shadow: none; }
.send-btn::after {
  content: ""; position: absolute; inset: 0; border-radius: inherit;
  background: radial-gradient(circle at center, rgba(255,255,255,0.25) 0%, transparent 70%);
  opacity: 0; transition: opacity 0.3s;
}
.send-btn:hover:not(:disabled)::after { opacity: 1; }

/* ═══ 右侧双 3D 虚拟形象面板（保持暗色以提供 3D 对比度）═══ */
.avatar-panel {
  width: 268px;
  min-width: 0;
  max-width: 300px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  background:
    linear-gradient(180deg, rgba(10, 16, 28, 0.54), rgba(7, 12, 24, 0.68)),
    radial-gradient(circle at top, rgba(99, 102, 241, 0.05), transparent 26%);
  backdrop-filter: blur(16px);
  border-left: 1px solid rgba(255, 255, 255, 0.05);
  overflow-y: auto;
  overflow-x: hidden;
  transition: width 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease, min-width 0.35s ease;
}

.avatar-panel.collapsed {
  width: 0; min-width: 0; max-width: 0; padding: 0;
  border-left-color: transparent; opacity: 0; pointer-events: none;
}

.avatar-collapse-toggle {
  position: absolute; top: 10px; right: -14px; z-index: 20;
  width: 26px; height: 26px; border-radius: 50%;
  border: 1px solid rgba(100, 140, 200, 0.2);
  background: rgba(12, 18, 32, 0.9); color: #8899ac;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: all 0.25s ease; backdrop-filter: blur(12px);
}
.avatar-collapse-toggle:hover { background: rgba(43, 123, 184, 0.15); color: #5e9bce; border-color: rgba(43, 123, 184, 0.3); transform: scale(1.1); }

.avatar-stage {
  flex: 1;
  min-height: 250px;
  position: relative;
  display: flex;
  flex-direction: column;
  border-radius: 22px;
  /* 保持暗色背景以提供 3D 模型对比度 */
  background:
    radial-gradient(ellipse at center, rgba(30, 45, 75, 0.34) 0%, rgba(10, 15, 25, 0.78) 80%),
    linear-gradient(180deg, rgba(8, 12, 20, 0.42), rgba(20, 30, 45, 0.3));
  background-blend-mode: overlay;
  border: 1px solid rgba(148, 163, 184, 0.08);
  transition: border-color 0.4s, box-shadow 0.4s;
  box-shadow: inset 0 0 42px rgba(0, 0, 0, 0.42), 0 16px 30px rgba(2, 6, 23, 0.14);
  overflow: hidden;
  backdrop-filter: blur(16px);
}

.avatar-stage::after {
  content: '';
  position: absolute;
  inset: auto 10% 0 10%;
  height: 52px;
  background: radial-gradient(ellipse at center, rgba(59, 130, 246, 0.16), transparent 72%);
  pointer-events: none;
  opacity: 0.72;
}

.role-badge {
  position: absolute;
  top: 12px;
  left: 12px;
  padding: 5px 10px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.32);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(148, 163, 184, 0.1);
  color: rgba(226, 232, 240, 0.86);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  z-index: 10;
  pointer-events: none;
}

.seat-caption {
  position: absolute;
  right: 12px;
  top: 12px;
  z-index: 10;
  display: flex;
  align-items: flex-end;
  pointer-events: none;
}

.seat-caption-status {
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.18);
  border: 1px solid rgba(148, 163, 184, 0.06);
  color: rgba(226, 232, 240, 0.52);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.02em;
  backdrop-filter: blur(8px);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
}

.seat-caption-status.user {
  background: rgba(15, 23, 42, 0.18);
  border-color: rgba(148, 163, 184, 0.06);
  color: rgba(167, 243, 208, 0.48);
}

.avatar-divider {
  height: 1px;
  margin: 2px 6px;
  background: linear-gradient(90deg, transparent, rgba(100, 140, 200, 0.14), transparent);
}

.avatar-stage.user-stage {
  min-height: 228px;
}

.avatar-stage.speaking {
  border-color: rgba(99, 102, 241, 0.35);
  box-shadow: 0 0 24px rgba(99, 102, 241, 0.12), 0 0 48px rgba(99, 102, 241, 0.05);
}

.avatar-stage.thinking {
  border-color: rgba(245, 158, 11, 0.3);
  box-shadow: 0 0 24px rgba(245, 158, 11, 0.08);
}

.avatar-status-tag {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: rgba(10, 16, 28, 0.22);
  border-top: 1px solid rgba(148, 163, 184, 0.08);
  backdrop-filter: blur(10px);
}

.status-indicator {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #8899ac;
  transition: all 0.3s;
}

.status-indicator.speaking {
  background: #6366f1;
  box-shadow: 0 0 8px rgba(99, 102, 241, 0.5);
  animation: indicator-breathe 2s ease-in-out infinite;
}

.status-indicator.thinking {
  background: #f59e0b;
  animation: dot-pulse 1s ease infinite;
}

@keyframes indicator-breathe {
  0%, 100% { box-shadow: 0 0 6px rgba(99, 102, 241, 0.3); }
  50% { box-shadow: 0 0 12px rgba(99, 102, 241, 0.6); }
}

.status-indicator.paused,
.status-indicator.idle {
  background: #8899ac;
}

.status-label {
  font-size: 11px;
  font-weight: 600;
  color: #8899ac;
}

/* VS 分隔 */
.vs-divider {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  flex-shrink: 0;
}

.vs-line {
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(100, 140, 200, 0.15), transparent);
}

.vs-badge {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(20, 30, 50, 0.65);
  border: 1px solid rgba(100, 140, 200, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: 900;
  color: #8899ac;
  letter-spacing: 0.1em;
  flex-shrink: 0;
}

.user-indicator.listening,
.user-indicator.active {
  background: #10b981;
  box-shadow: 0 0 8px rgba(16, 185, 129, 0.5);
}

.user-stage.speaking,
.user-stage.listening {
  border-color: rgba(16, 185, 129, 0.3);
  box-shadow: 0 0 16px rgba(16, 185, 129, 0.06);
}

.avatar-stats {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0;
  padding: 12px 10px;
  border-radius: 18px;
  background: rgba(15, 23, 42, 0.24);
  border: 1px solid rgba(148, 163, 184, 0.08);
  backdrop-filter: blur(14px);
}

.stat-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.stat-val { font-size: 18px; font-weight: 800; color: #e2e8f0; font-variant-numeric: tabular-nums; }
.stat-label { font-size: 10px; font-weight: 600; color: #8899ac; }
.stat-divider { width: 1px; height: 24px; background: rgba(100, 140, 200, 0.15); }

/* ═══ 答题思路浮窗卡片 - 亮色主题 ═══ */
.hint-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1400;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  background: rgba(8, 12, 20, 0.65);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.hint-card {
  width: min(720px, calc(100vw - 32px));
  max-height: min(78vh, 760px);
  padding: 0;
  border-radius: 20px;
  background: rgba(15, 23, 42, 0.9);
  border: 1px solid rgba(100, 140, 200, 0.14);
  box-shadow:
    0 24px 80px rgba(0, 0, 0, 0.45),
    0 0 0 1px rgba(99, 102, 241, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
  overflow: hidden auto;
  backdrop-filter: blur(28px);
  -webkit-backdrop-filter: blur(28px);
  animation: hint-card-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

@keyframes hint-card-in {
  from { opacity: 0; transform: scale(0.92) translateY(10px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.hint-card-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px 18px 14px;
  border-bottom: 1px solid rgba(100, 140, 200, 0.12);
  background: rgba(30, 45, 70, 0.4);
}

.hint-card-title-wrap {
  flex: 1;
  min-width: 0;
}

.hint-card-title {
  display: block;
  font-size: 16px;
  font-weight: 800;
  color: #e2e8f0;
  letter-spacing: -0.02em;}

.hint-card-subtitle {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: #64748b;
}

.hint-usage {
  font-size: 11px;
  font-weight: 700;
  color: #5e9bce;
  padding: 5px 10px;
  border-radius: 20px;
  background: rgba(43, 123, 184, 0.08);
  border: 1px solid rgba(43, 123, 184, 0.15);
  white-space: nowrap;
}

.hint-close-btn {
  width: 30px;
  height: 30px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--bg-card-muted);
  color: var(--text-muted);
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}
.hint-close-btn:hover { background: #e2e8f0; color: #c3d5ed; }

.hint-card-body {
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  scrollbar-width: thin;
  scrollbar-color: rgba(43, 123, 184, 0.12) transparent;
}

.hint-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(240px, 1fr);
  gap: 14px;
}

.hint-question-panel,
.hint-meta-panel,
.hint-framework-list,
.hint-opener-row,
.hint-star-text,
.hint-reference-card,
.hint-bullets {
  background: rgba(20, 30, 50, 0.5);
  border: 1px solid rgba(100, 140, 200, 0.12);}

.hint-question-panel,
.hint-meta-panel {
  border-radius: 16px;
  padding: 14px;
}

.hint-panel-label,
.hint-meta-label {
  display: inline-flex;
  align-items: center;
  font-size: 10px;
  font-weight: 800;
  color: #5e9bce;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.hint-question-text,
.hint-meta-value {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.7;
  color: #c3d5ed;
}

.hint-meta-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.hint-meta-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.hint-type-chip {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  padding: 5px 10px;
  border-radius: 999px;
  background: rgba(99, 102, 241, 0.08);
  border: 1px solid rgba(99, 102, 241, 0.15);
  color: #93b4fd;
  font-size: 12px;
  font-weight: 800;
}

.hint-section { display: flex; flex-direction: column; gap: 8px; }

.hint-section-label {
  font-size: 10px;
  font-weight: 800;
  color: #5e9bce;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.hint-framework-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border-radius: 16px;
}

.hint-framework-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.hint-framework-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: rgba(43, 123, 184, 0.1);
  color: #5e9bce;
  font-size: 11px;
  font-weight: 800;
}

.hint-framework-text {
  font-size: 13px;
  line-height: 1.65;
  color: #c3d5ed;
}

.hint-bullets {
  margin: 0;
  padding: 12px 12px 12px 30px;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.hint-bullets li {
  font-size: 13px;
  color: #c3d5ed;
  line-height: 1.65;
}

.hint-bullets li::marker { color: #5e9bce; }

.hint-opener-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 16px;
}

.hint-opener-text {
  flex: 1;
  font-size: 13px;
  color: #c3d5ed;
  line-height: 1.65;
}

.hint-use-btn {
  min-height: 34px;
  padding: 0 14px;
  border-radius: 10px;
  border: 1px solid rgba(43, 123, 184, 0.2);
  background: rgba(43, 123, 184, 0.08);
  color: #5e9bce;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}
.hint-use-btn:hover { background: rgba(43, 123, 184, 0.15); transform: translateY(-1px); }

.hint-reference-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.hint-reference-head-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.hint-reference-tabs {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px;
  border-radius: 999px;
  background: var(--bg-card-muted);
  border: 1px solid var(--border-color);
}

.hint-reference-tab {
  min-height: 28px;
  padding: 0 12px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: #64748b;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.18s ease;
}

.hint-reference-tab.active {
  background: var(--bg-card);
  color: var(--primary-500);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06), inset 0 0 0 1px var(--border-accent);
}

.hint-toggle-btn {
  min-height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid rgba(43, 123, 184, 0.2);
  background: rgba(43, 123, 184, 0.06);
  color: #5e9bce;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.2s ease;
}

.hint-toggle-btn:hover {
  background: rgba(43, 123, 184, 0.12);
  transform: translateY(-1px);
}

.hint-reference-placeholder,
.hint-reference-tip {
  margin: 0;
  font-size: 12px;
  line-height: 1.7;
  color: #94a3b8;
}

.hint-reference-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border-radius: 16px;
}

.hint-reference-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.hint-reference-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(43, 123, 184, 0.08);
  border: 1px solid rgba(43, 123, 184, 0.15);
  color: #5e9bce;
  font-size: 11px;
  font-weight: 800;
}

.hint-reference-timer {
  font-size: 12px;
  font-weight: 800;
  color: #d97706;
  font-variant-numeric: tabular-nums;
}

.hint-reference-progress {
  width: 100%;
  height: 6px;
  border-radius: 999px;
  overflow: hidden;
  background: #e2e8f0;
}

.hint-reference-progress-bar {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #2b7bb8, #5e9bce);
  transition: width 1s linear;
}

.hint-reference-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.75;
  color: #c3d5ed;
}

.hint-star-text {
  margin: 0;
  font-size: 13px;
  color: #94a3b8;
  line-height: 1.7;
  padding: 12px 14px;
  border-radius: 16px;
}

/* 动画 */
.hint-slide-enter-active,
.hint-slide-leave-active { transition: opacity 0.25s ease; }
.hint-slide-enter-from,
.hint-slide-leave-to { opacity: 0; }

.hint-fade-enter-active,
.hint-fade-leave-active { transition: all 0.2s ease; }
.hint-fade-enter-from,
.hint-fade-leave-to { opacity: 0; transform: translateY(-4px); }

/* 灯泡按钮加载旋转器 */
.hint-spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid rgba(245, 158, 11, 0.2);
  border-top-color: #d97706;
  border-radius: 50%;
  animation: hint-spin 0.8s linear infinite;
}
@keyframes hint-spin { to { transform: rotate(360deg); } }

.tool-btn.hint-tool.hint-loading {
  border-color: rgba(245, 158, 11, 0.3);
  background: rgba(245, 158, 11, 0.06);
}

/* ═══ 响应式 ═══ */
@media (max-width: 900px) {
  .meeting-strip {
    flex-direction: column;
    align-items: flex-start;
  }

  .avatar-panel { display: none; }
}

@media (max-width: 768px) {
  .studio-topbar { flex-wrap: wrap; gap: 8px; padding: 8px 12px; }
  .topbar-section { flex-wrap: wrap; }
  .meeting-strip { gap: 10px; }
  .meeting-action { flex: 1 1 calc(50% - 8px); justify-content: center; }
  .meeting-action.mini { min-width: 0; }
  .question-bar { padding: 12px 14px; flex-direction: column; }
  .question-bar-text { font-size: 13px; }
  .chat-scroll { padding: 14px; }
  .msg-bubble { max-width: 90%; }
  .chat-input-area { margin: 0 12px 12px; padding: 10px 12px; }
  .hint-modal-overlay { padding: 16px 10px; }
  .hint-card { width: min(100vw - 20px, 720px); max-height: min(82vh, 760px); }
  .hint-card-header { padding: 10px 12px; }
  .hint-card-body { padding: 12px; }
  .hint-hero { grid-template-columns: 1fr; }
  .hint-opener-row,
  .hint-reference-head,
  .hint-reference-head-left { flex-direction: column; align-items: stretch; }
  .hint-use-btn,
  .hint-toggle-btn { width: 100%; justify-content: center; }
  .hint-reference-tabs { width: 100%; }
  .hint-reference-tab { flex: 1; }
}
</style>
