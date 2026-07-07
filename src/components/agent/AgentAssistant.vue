<script setup lang="ts">
import MarkdownIt from 'markdown-it'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import VrmAvatar from '@/components/ai/interview/VrmAvatar.vue'
import { buildAgentAssistantContext, type AgentAssistantContextSnapshot } from '@/composables/useAgentAssistantContext'
import { ALL_VRM_MODELS, type VrmModelInfo } from '@/config/vrmModels'
import {
  generateResumeChangeProposals,
  loadStoredResumeChangeProposals,
  saveStoredResumeChangeProposals,
  type ResumeChangeProposal,
} from '@/services/agentResumeProposals'
import { streamAgentCompanyIntelReport } from '@/services/agentCompanyIntelReport'
import {
  generateAgentTrainingQuestions,
  type AgentTrainingQuestionCard,
} from '@/services/agentTrainingQuestions'
import {
  confirmAgentToolInvocation,
  rejectAgentToolInvocation,
} from '@/services/agentToolRuntime'
import {
  createApplyResumeProposalInvocation,
  createRejectResumeProposalInvocation,
  createRevertResumeProposalInvocation,
  registerResumeAgentTools,
} from '@/services/agentResumeTools'
import { registerJdAgentTools, runJdMatchSummaryTool } from '@/services/agentJdTools'
import type { JdMatchSummary } from '@/services/agentJdMatchSummary'
import { generateCompanyIntel } from '@/services/jdService'
import { getAgentPersonaByModelId, type AgentPersona } from '@/services/agentPersonas'
import { routeAgentReActTurn, type AgentReActDecision } from '@/services/agentReActRuntime'
import {
  appendAgentSessionEvent,
  clearAgentSessionEvents,
  getAgentSessionCursor,
  replayAgentSessionEventsAfter,
  type AgentSessionEvent,
} from '@/services/agentSessionEvents'
import { useAiConfigStore } from '@/stores/aiConfig'
import { useJdAnalysisStore } from '@/stores/jdAnalysis'
import { useQuestionBankStore, type SavedQuestion } from '@/stores/questionBank'
import { streamAIRequest } from '@/services/stream'
import { toast } from '@/utils/toast'

type AgentMessageRole = 'user' | 'assistant'
type AgentMessageStatus = 'thinking' | 'tooling' | 'streaming' | 'done' | 'error'

interface AgentMessage {
  id: string
  role: AgentMessageRole
  content: string
  createdAt: string
  streaming?: boolean
  status?: AgentMessageStatus
  statusText?: string
  startedAt?: number
  firstChunkAt?: number
  completedAt?: number
}

interface AgentLauncherPosition {
  x: number
  y: number
}

interface AgentLauncherSize {
  width: number
  height: number
}

interface AgentLauncherDragState {
  pointerId: number
  startX: number
  startY: number
  originX: number
  originY: number
  moved: boolean
}

type AgentBodyAction =
  | 'idle'
  | 'thinking_nod'
  | 'soft_shake'
  | 'relaxed_wave'
  | 'gentle_pace'
  | 'folded_arms'
  | 'presenting_gesture'
  | 'arm_explain'

interface AgentAvatarMotionDirective {
  body_action?: AgentBodyAction
  emotion?: Partial<Record<'smile' | 'sad' | 'angry' | 'surprised' | 'browUp' | 'browDown' | 'relaxed', number>>
  expression?: Record<string, number>
  eye_target?: { x?: number; y?: number }
  transition_ms?: number
}

type AgentBubbleTone = 'role' | 'observe' | 'move' | 'dock' | 'module'
type AgentBubbleEvent = 'ready' | 'hover' | 'dragStart' | 'dock' | 'roleChange' | 'panelClose' | 'moduleChange'

interface AgentBubbleCue {
  text: string
  tone: AgentBubbleTone
  holdMs?: number
  motion?: AgentAvatarMotionDirective
}

interface TrainingQuestionDraft extends AgentTrainingQuestionCard {
  selected: boolean
  status: 'pending' | 'saved'
}

const emit = defineEmits<{
  (e: 'open-config'): void
}>()

const aiConfigStore = useAiConfigStore()
const jdStore = useJdAnalysisStore()
const questionBankStore = useQuestionBankStore()
const route = useRoute()
const isOpen = ref(false)
const messages = ref<AgentMessage[]>([])
const inputText = ref('')
const isStreaming = ref(false)
const errorText = ref('')
const proposalRequest = ref('')
const isGeneratingProposals = ref(false)
const proposals = ref<ResumeChangeProposal[]>([])
const replayedEvents = ref<AgentSessionEvent[]>([])
const sessionCursor = ref(0)
const jdMatchSummary = ref<JdMatchSummary | null>(null)
const isBuildingJdSummary = ref(false)
const isBuildingCompanyIntelReport = ref(false)
const isBuildingTrainingQuestions = ref(false)
const isSavingTrainingQuestions = ref(false)
const trainingQuestionDrafts = ref<TrainingQuestionDraft[]>([])
const contextSnapshot = ref<AgentAssistantContextSnapshot>(buildAgentAssistantContext())
const messagesRef = ref<HTMLElement | null>(null)
const agentModelSelectRef = ref<HTMLElement | null>(null)
const avatarMotionDirective = ref<AgentAvatarMotionDirective | null>(null)
const agentPointerEyeTarget = ref<{ x: number; y: number } | null>(null)
const messageStatusNow = ref(Date.now())
const agentBubbleText = ref('')
const agentBubbleTone = ref<AgentBubbleTone>('role')
const isAgentBubbleVisible = ref(false)
const isAgentBubbleTyping = ref(false)
const isAgentModelMenuOpen = ref(false)
let abortController: AbortController | null = null
let launcherDragState: AgentLauncherDragState | null = null
let previousBodyUserSelect = ''
let avatarMotionResetTimer: number | undefined
let messagePersistTimer: number | undefined
let agentBubbleTimer: number | undefined
let agentBubbleTypingTimer: number | undefined
let messageStatusTimer: number | undefined

const LAUNCHER_POSITION_STORAGE_KEY = 'prepwise-agent-launcher-position'
const AGENT_MODEL_STORAGE_KEY = 'prepwise-agent-vrm-model-id'
const AGENT_CHAT_MESSAGES_STORAGE_KEY = 'prepwise-agent-chat-messages'
const MAX_STORED_CHAT_MESSAGES = 80
const MAX_STORED_CHAT_MESSAGE_CHARS = 30_000
const MESSAGE_REVEAL_INTERVAL_MS = 18
const MESSAGE_REVEAL_MAX_STEPS = 120
const AGENT_BUBBLE_TYPE_INTERVAL_MS = 24
const AGENT_BUBBLE_MAX_REVEAL_STEPS = 54
const AGENT_BODY_ACTIONS: readonly AgentBodyAction[] = [
  'idle',
  'thinking_nod',
  'soft_shake',
  'relaxed_wave',
  'gentle_pace',
  'folded_arms',
  'presenting_gesture',
  'arm_explain',
]
const LAUNCHER_DESKTOP_SIZE: AgentLauncherSize = { width: 166, height: 244 }
const LAUNCHER_MOBILE_SIZE: AgentLauncherSize = { width: 126, height: 188 }
const LAUNCHER_MARGIN = 14
const LAUNCHER_DEFAULT_OFFSET = 22
const PANEL_WIDTH = 460
const PANEL_HEIGHT = 640
const PANEL_GAP = 4
let suppressLauncherClick = false

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: false,
})

const activeConfig = computed(() => aiConfigStore.getConfigForFeature('default'))
const hasAiConfig = computed(() => Boolean(
  activeConfig.value.apiUrl
  && activeConfig.value.modelName
  && (activeConfig.value.providerId === 'ollama' || activeConfig.value.apiToken),
))

const selectedAgentModelId = ref(readStoredAgentModelId())
const selectedAgentModel = computed(() => (
  ALL_VRM_MODELS.find(model => model.id === selectedAgentModelId.value)
  ?? ALL_VRM_MODELS[0]
))
const selectedAgentPersona = computed(() => getAgentPersonaByModelId(selectedAgentModel.value?.id))
const supportsTrainingQuestions = computed(() => selectedAgentPersona.value.routing.questionTrainingSkillId === 'personalized_question_set')
const quickPrompts = computed(() => selectedAgentPersona.value.buildQuickPrompts(contextSnapshot.value))
const contextHeadline = computed(() => contextSnapshot.value.headline || '全局求职上下文')
const inputPlaceholder = computed(() => hasAiConfig.value
  ? selectedAgentPersona.value.inputPlaceholder
  : '请先配置默认 AI 模型')
const pendingProposalCount = computed(() => proposals.value.filter((proposal) => proposal.status === 'pending').length)
const processedProposalCount = computed(() => proposals.value.filter((proposal) => proposal.status !== 'pending').length)
const storedProposalCount = computed(() => proposals.value.length)
const jdSummaryTopGaps = computed(() => jdMatchSummary.value?.gaps.slice(0, 3) ?? [])
const jdSummaryFactGaps = computed(() => jdMatchSummary.value?.factGaps.slice(0, 3) ?? [])
const pendingTrainingQuestions = computed(() => trainingQuestionDrafts.value.filter(question => question.status === 'pending'))
const selectedTrainingQuestions = computed(() => pendingTrainingQuestions.value.filter(question => question.selected))
const savedTrainingQuestionCount = computed(() => trainingQuestionDrafts.value.filter(question => question.status === 'saved').length)
const allTrainingQuestionsSelected = computed(() => (
  pendingTrainingQuestions.value.length > 0
  && pendingTrainingQuestions.value.every(question => question.selected)
))
const isAgentTaskRunning = computed(() => (
  isGeneratingProposals.value
  || isBuildingJdSummary.value
  || isBuildingCompanyIntelReport.value
  || isBuildingTrainingQuestions.value
  || isSavingTrainingQuestions.value
))
const layoutVersion = ref(0)
const agentAvatarState = computed<'idle' | 'speaking' | 'thinking'>(() => {
  if (isStreaming.value) return 'speaking'
  if (isGeneratingProposals.value || isBuildingJdSummary.value || isBuildingCompanyIntelReport.value || isBuildingTrainingQuestions.value) return 'thinking'
  return 'idle'
})
const floatingAvatarMotionDirective = computed<AgentAvatarMotionDirective | null>(() => {
  const directive = avatarMotionDirective.value
  const eyeTarget = agentPointerEyeTarget.value
  if (!directive && !eyeTarget) return null
  if (!eyeTarget) return directive
  return {
    ...(directive ?? {}),
    eye_target: eyeTarget,
    transition_ms: directive?.transition_ms ?? 220,
  }
})
const streamingAssistantText = computed(() => (
  [...messages.value].reverse().find(message => message.role === 'assistant' && message.streaming)?.content ?? ''
))
const launcherSizeValue = computed(() => {
  layoutVersion.value
  return launcherSize()
})
const launcherPosition = ref<AgentLauncherPosition>(defaultLauncherPosition())
const launcherStyle = computed(() => ({
  left: `${Math.round(launcherPosition.value.x)}px`,
  top: `${Math.round(launcherPosition.value.y)}px`,
  width: `${launcherSizeValue.value.width}px`,
  height: `${launcherSizeValue.value.height}px`,
}))
const agentLauncherClasses = computed(() => ({
  'agent-launcher--open': isOpen.value,
  'agent-launcher--bubble-visible': isAgentBubbleVisible.value,
}))
const agentBubblePlacementClass = computed(() => {
  layoutVersion.value
  if (typeof window === 'undefined') return 'agent-bubble--left'
  const launcher = launcherSize()
  const launcherCenterX = launcherPosition.value.x + launcher.width / 2
  return launcherCenterX > window.innerWidth * 0.58 ? 'agent-bubble--left' : 'agent-bubble--right'
})

function currentModuleLabel(): string {
  const name = String(route.name ?? '')
  if (name === 'workspace-dashboard') {
    const tab = typeof route.query.tab === 'string' ? route.query.tab : 'overview'
    const tabLabels: Record<string, string> = {
      overview: '工作台总览',
      opportunities: '机会列表',
      tracker: '投递追踪',
      analytics: '求职分析',
    }
    return tabLabels[tab] ?? '工作台总览'
  }

  const labels: Record<string, string> = {
    'resume-editor': '简历编辑',
    'resume-import': '简历导入',
    'resume-review': '简历审查',
    'jd-analysis': 'JD 分析',
    'ai-interviewer': 'AI 面试',
    'question-bank': '面试题库',
    'training-center': '训练中心',
    'project-sop': '项目 SOP',
  }
  return labels[name] ?? '当前页面'
}

function hasContextSource(key: string): boolean {
  return Boolean(contextSnapshot.value.sources.find(source => source.key === key)?.available)
}

function activeContextFocus(): string {
  if (!hasAiConfig.value) return 'AI 模型配置'
  if (isGeneratingProposals.value) return '待确认改动提案'
  if (isBuildingJdSummary.value) return 'JD 匹配差距'
  if (isBuildingCompanyIntelReport.value) return '岗位情报'
  if (isBuildingTrainingQuestions.value) return '专项训练题'
  if (pendingProposalCount.value > 0) return `${pendingProposalCount.value} 条待确认提案`
  if (jdSummaryTopGaps.value.length > 0) return 'JD 差距'
  if (hasContextSource('match')) return 'JD 匹配结果'
  if (hasContextSource('review')) return '简历审查任务'
  if (hasContextSource('jd')) return 'JD 要求'
  if (hasContextSource('resume')) return '简历表达'
  return contextHeadline.value || '求职材料'
}

function availableContextLabels(max = 2): string {
  const labels = contextSnapshot.value.sources
    .filter(source => source.available)
    .map(source => source.label)
    .slice(0, max)
  return labels.length ? labels.join('、') : '当前材料'
}

function currentTaskBubbleLine(): string {
  if (!hasAiConfig.value) return '先把默认模型接上，我就能读当前页面。'
  if (isGeneratingProposals.value) return '我在把改动拆成待确认项，不会直接写入。'
  if (isBuildingJdSummary.value) return '我在收 JD 缺口，先看事实够不够。'
  if (isBuildingCompanyIntelReport.value) return '我在查公司和岗位信号，先过滤噪声。'
  if (isBuildingTrainingQuestions.value) return '我在把弱项变成可练的追问。'
  if (isSavingTrainingQuestions.value) return '正在把选中的题放进题库。'
  if (isStreaming.value) return '我边读上下文边输出，重点会压短一点。'
  if (pendingProposalCount.value > 0) return `有 ${pendingProposalCount.value} 条提案等你确认。`
  if (jdSummaryTopGaps.value.length > 0) return `我先盯住 ${jdSummaryTopGaps.value[0]?.requirement ?? '最高优先级缺口'}。`
  return ''
}

function compactBubbleText(text: string, maxLength = 34): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  const breakAt = Math.max(
    normalized.lastIndexOf('，', maxLength),
    normalized.lastIndexOf('、', maxLength),
    normalized.lastIndexOf('；', maxLength),
  )
  const end = breakAt >= 12 ? breakAt : maxLength
  return `${normalized.slice(0, end).trim()}...`
}

function moduleBubbleLines(): string[] {
  const name = String(route.name ?? '')
  const tab = typeof route.query.tab === 'string' ? route.query.tab : 'overview'
  if (name === 'resume-editor') {
    return hasContextSource('review')
      ? ['我在简历页，先按审查任务看证据和表达。', '这里适合微调，不急着大改。']
      : ['我在简历页，先看事实是不是够硬。', '经历别堆满，先抓能证明能力的句子。']
  }
  if (name === 'resume-review') {
    return ['我在审查页，先挑影响最大的修改点。', '这页看问题优先级，别被小措辞带跑。']
  }
  if (name === 'resume-import') {
    return ['导入后我会先看字段有没有丢。', '先把结构对齐，再谈润色。']
  }
  if (name === 'jd-analysis') {
    return hasContextSource('match')
      ? ['我在 JD 页，先看缺口能不能被简历事实补上。', '匹配分只是表面，关键看证据链。']
      : ['贴 JD 后，我先拆硬要求和加分项。', '这页我会先找岗位真正要筛的人。']
  }
  if (name === 'ai-interviewer') {
    return hasContextSource('interviews')
      ? ['我在面试页，先看上一轮暴露的弱项。', '这轮别求全，先把追问答稳。']
      : ['我在面试页，先帮你把开场和追问节奏稳住。', '面试区我会更关注表达顺序。']
  }
  if (name === 'question-bank') {
    return hasContextSource('questions')
      ? ['题库这边，先挑低掌握题练。', '我会把题目按弱项重新排一下。']
      : ['题库还空，我可以先从 JD 生成一组追问。', '先建题，再做训练节奏。']
  }
  if (name === 'training-center') {
    return ['训练中心里，我会把错题归到能力维度。', '先练最容易丢分的那一类。']
  }
  if (name === 'project-sop') {
    return ['项目 SOP 这里，先把背景、动作、结果串起来。', '我会盯项目叙事是不是能经得起追问。']
  }
  if (name === 'workspace-dashboard' && tab === 'tracker') {
    return ['我在投递追踪页，先看下一步动作有没有断。', '这里适合按优先级清掉卡点。']
  }
  if (name === 'workspace-dashboard' && tab === 'analytics') {
    return ['我在求职分析页，先看转化掉在哪一段。', '数据先看趋势，不急着下结论。']
  }
  if (name === 'workspace-dashboard' && tab === 'opportunities') {
    return ['我在机会列表页，先帮你比优先级。', '机会多时，先筛值得投入的。']
  }
  return hasContextSource('tracker')
    ? ['我在总览页，先看今天最该推进哪一步。', '我会从投递、JD、训练里找最近的卡点。']
    : ['我在总览页，先等你放进更多求职材料。', '这里会汇总你的简历、JD 和训练进度。']
}

function pickBubbleLine(lines: string[], event: AgentBubbleEvent): string {
  const usable = lines.map(line => line.trim()).filter(Boolean)
  if (usable.length === 0) return activeContextFocus()
  const salt = event === 'hover' ? 1 : event === 'dock' ? 2 : 0
  const index = (Date.now() + salt) % usable.length
  return usable[index] ?? usable[0]!
}

function agentBubbleCopy(event: AgentBubbleEvent): string {
  const persona = selectedAgentPersona.value
  const taskLine = currentTaskBubbleLine()
  const moduleLabel = currentModuleLabel()

  if (event === 'roleChange') {
    return compactBubbleText(`${persona.name}接手，先看${moduleLabel}。`)
  }
  if (event === 'dragStart') {
    return '我跟着你挪，别挡正文。'
  }
  if (event === 'dock') {
    return compactBubbleText(`放这儿也行，我继续看${moduleLabel}。`)
  }
  if (event === 'panelClose') {
    return '我先收起来，有动作再叫我。'
  }
  if (event === 'hover' && taskLine) {
    return compactBubbleText(taskLine)
  }
  const moduleLine = event === 'moduleChange'
    ? `到${moduleLabel}了，${pickBubbleLine(moduleBubbleLines(), event)}`
    : pickBubbleLine(moduleBubbleLines(), event)
  return compactBubbleText(moduleLine)
}

function agentBubbleToneForEvent(event: AgentBubbleEvent): AgentBubbleTone {
  if (event === 'dragStart') return 'move'
  if (event === 'dock' || event === 'panelClose') return 'dock'
  if (event === 'hover') return 'observe'
  if (event === 'moduleChange') return 'module'
  return 'role'
}

function agentBubbleMotionForEvent(event: AgentBubbleEvent): AgentAvatarMotionDirective {
  if (event === 'dragStart') {
    return {
      body_action: 'idle',
      emotion: { relaxed: 0.2 },
      transition_ms: 220,
    }
  }
  if (event === 'hover') {
    return {
      body_action: 'idle',
      emotion: { browUp: 0.08, relaxed: 0.18 },
      transition_ms: 220,
    }
  }
  if (event === 'roleChange') {
    return {
      body_action: 'presenting_gesture',
      emotion: { browUp: 0.08, relaxed: 0.18 },
      transition_ms: 220,
    }
  }
  if (event === 'ready') {
    return {
      body_action: 'relaxed_wave',
      emotion: { smile: 0.22, relaxed: 0.18 },
      transition_ms: 220,
    }
  }
  return {
    body_action: 'idle',
    emotion: { relaxed: 0.22 },
    transition_ms: 220,
  }
}

function buildAgentBubbleCue(event: AgentBubbleEvent): AgentBubbleCue {
  const holdMsByEvent: Record<AgentBubbleEvent, number> = {
    ready: 4600,
    hover: 3200,
    dragStart: 2600,
    dock: 3200,
    roleChange: 3800,
    panelClose: 3000,
    moduleChange: 5200,
  }
  return {
    text: agentBubbleCopy(event),
    tone: agentBubbleToneForEvent(event),
    holdMs: holdMsByEvent[event],
    motion: agentBubbleMotionForEvent(event),
  }
}
const panelStyle = computed(() => {
  layoutVersion.value
  if (typeof window !== 'undefined' && window.innerWidth <= 640) return undefined
  const viewport = viewportSize()
  const launcher = launcherSize()
  const panelWidth = Math.min(PANEL_WIDTH, Math.max(340, viewport.width - 28))
  const panelHeight = Math.min(PANEL_HEIGHT, Math.max(380, viewport.height - 28))
  const launcherCenterX = launcherPosition.value.x + launcher.width / 2
  const launcherBottom = launcherPosition.value.y + launcher.height
  const panelBottom = Math.min(
    Math.max(launcherBottom - 8, panelHeight + PANEL_GAP),
    viewport.height - PANEL_GAP,
  )
  const preferredLeft = launcherCenterX >= viewport.width / 2
    ? launcherPosition.value.x - panelWidth + 10
    : launcherPosition.value.x + launcher.width - 10
  const preferredTop = panelBottom - panelHeight

  return {
    width: `${Math.round(panelWidth)}px`,
    height: `${Math.round(panelHeight)}px`,
    left: `${Math.round(Math.min(
      Math.max(preferredLeft, PANEL_GAP),
      Math.max(PANEL_GAP, viewport.width - panelWidth - PANEL_GAP),
    ))}px`,
    top: `${Math.round(Math.min(
      Math.max(preferredTop, PANEL_GAP),
      Math.max(PANEL_GAP, viewport.height - panelHeight - PANEL_GAP),
    ))}px`,
  }
})
const panelPlacementClass = computed(() => {
  layoutVersion.value
  if (typeof window === 'undefined' || window.innerWidth <= 640) return 'agent-shell--mobile'
  const viewport = viewportSize()
  const launcher = launcherSize()
  const launcherCenterX = launcherPosition.value.x + launcher.width / 2
  return launcherCenterX >= viewport.width / 2 ? 'agent-shell--from-right' : 'agent-shell--from-left'
})

function viewportSize() {
  if (typeof window === 'undefined') return { width: 1280, height: 720 }
  return {
    width: window.innerWidth || 1280,
    height: window.innerHeight || 720,
  }
}

function launcherSize(): AgentLauncherSize {
  if (typeof window === 'undefined') return LAUNCHER_DESKTOP_SIZE
  return window.innerWidth <= 640 ? LAUNCHER_MOBILE_SIZE : LAUNCHER_DESKTOP_SIZE
}

function defaultLauncherPosition(): AgentLauncherPosition {
  const viewport = viewportSize()
  const size = launcherSize()
  return {
    x: Math.max(LAUNCHER_MARGIN, viewport.width - size.width - LAUNCHER_DEFAULT_OFFSET),
    y: Math.max(LAUNCHER_MARGIN, viewport.height - size.height - LAUNCHER_DEFAULT_OFFSET),
  }
}

function clampLauncherPosition(position: AgentLauncherPosition): AgentLauncherPosition {
  const viewport = viewportSize()
  const size = launcherSize()
  return {
    x: Math.min(
      Math.max(position.x, LAUNCHER_MARGIN),
      Math.max(LAUNCHER_MARGIN, viewport.width - size.width - LAUNCHER_MARGIN),
    ),
    y: Math.min(
      Math.max(position.y, LAUNCHER_MARGIN),
      Math.max(LAUNCHER_MARGIN, viewport.height - size.height - LAUNCHER_MARGIN),
    ),
  }
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function updatePointerEyeTarget(event: PointerEvent) {
  if (typeof window === 'undefined' || event.pointerType === 'touch') return
  const size = launcherSize()
  const headX = launcherPosition.value.x + size.width / 2
  const headY = launcherPosition.value.y + size.height * 0.3
  agentPointerEyeTarget.value = {
    x: clampNumber((event.clientX - headX) / Math.max(120, size.width * 1.15), -1, 1),
    y: clampNumber((headY - event.clientY) / Math.max(120, size.height * 0.85), -1, 1),
  }
}

function clearAgentBubbleTimers() {
  if (agentBubbleTimer !== undefined) {
    window.clearTimeout(agentBubbleTimer)
    agentBubbleTimer = undefined
  }
  if (agentBubbleTypingTimer !== undefined) {
    window.clearTimeout(agentBubbleTypingTimer)
    agentBubbleTypingTimer = undefined
  }
}

function scheduleAgentBubbleHide(holdMs: number) {
  agentBubbleTimer = window.setTimeout(() => {
    isAgentBubbleVisible.value = false
    isAgentBubbleTyping.value = false
    agentBubbleTimer = undefined
  }, holdMs)
}

function revealAgentBubbleText(text: string, holdMs: number) {
  const chars = Array.from(text)
  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (prefersReducedMotion || chars.length <= 4) {
    agentBubbleText.value = text
    isAgentBubbleTyping.value = false
    scheduleAgentBubbleHide(holdMs)
    return
  }

  agentBubbleText.value = ''
  isAgentBubbleTyping.value = true
  const chunkSize = Math.max(1, Math.ceil(chars.length / AGENT_BUBBLE_MAX_REVEAL_STEPS))
  let index = 0
  const tick = () => {
    index = Math.min(chars.length, index + chunkSize)
    agentBubbleText.value = chars.slice(0, index).join('')
    if (index >= chars.length) {
      isAgentBubbleTyping.value = false
      agentBubbleTypingTimer = undefined
      scheduleAgentBubbleHide(holdMs)
      return
    }
    agentBubbleTypingTimer = window.setTimeout(tick, AGENT_BUBBLE_TYPE_INTERVAL_MS)
  }
  tick()
}

function showAgentBubble(cue: AgentBubbleCue) {
  if (typeof window === 'undefined') return
  clearAgentBubbleTimers()
  agentBubbleText.value = cue.text
  agentBubbleTone.value = cue.tone
  isAgentBubbleVisible.value = true
  if (cue.motion) setAvatarMotion(cue.motion, Math.min(cue.holdMs ?? 3000, 3600))
  revealAgentBubbleText(cue.text, cue.holdMs ?? 3200)
}

function hideAgentBubble() {
  isAgentBubbleVisible.value = false
  isAgentBubbleTyping.value = false
  if (typeof window !== 'undefined') {
    clearAgentBubbleTimers()
  }
}

function handleWindowPointerMove(event: PointerEvent) {
  if (event.pointerType && event.pointerType !== 'mouse') return
  updatePointerEyeTarget(event)
}

function handleWindowPointerOut(event: PointerEvent) {
  if (event.relatedTarget !== null) return
  agentPointerEyeTarget.value = null
}

function readStoredAgentModelId(): string {
  if (typeof localStorage === 'undefined') return 'interviewer-fangran'
  const stored = localStorage.getItem(AGENT_MODEL_STORAGE_KEY)
  return stored && ALL_VRM_MODELS.some(model => model.id === stored) ? stored : 'interviewer-fangran'
}

function agentChatMessagesStorageKey(modelId = selectedAgentModelId.value): string {
  return `${AGENT_CHAT_MESSAGES_STORAGE_KEY}:${modelId}`
}

function closeAgentModelMenu() {
  isAgentModelMenuOpen.value = false
}

function toggleAgentModelMenu() {
  isAgentModelMenuOpen.value = !isAgentModelMenuOpen.value
}

function selectAgentModel(model: VrmModelInfo) {
  const previousModelId = selectedAgentModelId.value
  if (model.id === previousModelId) {
    closeAgentModelMenu()
    return
  }

  if (isAgentTaskRunning.value) {
    closeAgentModelMenu()
    toast.info('当前任务完成后再切换角色')
    return
  }
  if (isStreaming.value) stopStreaming()
  persistMessagesNow(previousModelId)
  selectedAgentModelId.value = model.id
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(AGENT_MODEL_STORAGE_KEY, model.id)
  }
  messages.value = readStoredAgentMessages(model.id)
  trainingQuestionDrafts.value = []
  jdMatchSummary.value = null
  errorText.value = ''
  inputText.value = ''
  proposalRequest.value = ''
  closeAgentModelMenu()
  refreshContext()
  showAgentBubble(buildAgentBubbleCue('roleChange'))
  void scrollToBottom()
}

function handleAgentModelDocumentPointerDown(event: PointerEvent) {
  const target = event.target
  if (!(target instanceof Node)) return
  if (!agentModelSelectRef.value?.contains(target)) closeAgentModelMenu()
}

function handleAgentModelKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    closeAgentModelMenu()
    return
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    toggleAgentModelMenu()
  }
}

function readStoredLauncherPosition(): AgentLauncherPosition | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(LAUNCHER_POSITION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<AgentLauncherPosition>
    if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number') return null
    return clampLauncherPosition({ x: parsed.x, y: parsed.y })
  } catch {
    return null
  }
}

function persistLauncherPosition() {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(LAUNCHER_POSITION_STORAGE_KEY, JSON.stringify(launcherPosition.value))
}

function restoreLauncherPosition() {
  launcherPosition.value = readStoredLauncherPosition() ?? defaultLauncherPosition()
}

function handleLauncherResize() {
  layoutVersion.value += 1
  launcherPosition.value = clampLauncherPosition(launcherPosition.value)
  persistLauncherPosition()
}

function createMessageId(role: AgentMessageRole): string {
  return `${role}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function defaultMessageStatusText(status: AgentMessageStatus): string {
  if (status === 'thinking') return '思考中'
  if (status === 'tooling') return '处理上下文'
  if (status === 'streaming') return '正在输出'
  if (status === 'error') return '未完成'
  return '已输出'
}

function createAssistantMessage(status: AgentMessageStatus = 'thinking', statusText?: string): AgentMessage {
  const now = Date.now()
  return {
    id: createMessageId('assistant'),
    role: 'assistant',
    content: '',
    createdAt: new Date(now).toISOString(),
    streaming: status !== 'done' && status !== 'error',
    status,
    statusText: statusText ?? defaultMessageStatusText(status),
    startedAt: now,
  }
}

function isActiveAssistantStatus(message: AgentMessage): boolean {
  return message.role === 'assistant'
    && (message.streaming === true || message.status === 'thinking' || message.status === 'tooling' || message.status === 'streaming')
}

function syncMessageStatusTicker() {
  if (typeof window === 'undefined') return
  const shouldTick = messages.value.some(isActiveAssistantStatus)
  if (shouldTick && messageStatusTimer === undefined) {
    messageStatusNow.value = Date.now()
    messageStatusTimer = window.setInterval(() => {
      messageStatusNow.value = Date.now()
      if (!messages.value.some(isActiveAssistantStatus) && messageStatusTimer !== undefined) {
        window.clearInterval(messageStatusTimer)
        messageStatusTimer = undefined
      }
    }, 1000)
    return
  }
  if (!shouldTick && messageStatusTimer !== undefined) {
    window.clearInterval(messageStatusTimer)
    messageStatusTimer = undefined
  }
}

function markAssistantMessageStatus(message: AgentMessage, status: AgentMessageStatus, statusText?: string) {
  const now = Date.now()
  message.status = status
  message.statusText = statusText ?? defaultMessageStatusText(status)
  if (!message.startedAt) message.startedAt = now
  if (status === 'streaming' && !message.firstChunkAt) message.firstChunkAt = now
  if (status === 'done' || status === 'error') {
    message.completedAt = now
    message.streaming = false
  } else {
    message.completedAt = undefined
    message.streaming = true
  }
  messageStatusNow.value = now
  syncMessageStatusTicker()
}

function messageElapsedMs(message: AgentMessage): number {
  const fallbackStart = Date.parse(message.createdAt)
  const start = message.startedAt ?? (Number.isFinite(fallbackStart) ? fallbackStart : messageStatusNow.value)
  const end = message.completedAt ?? messageStatusNow.value
  return Math.max(0, end - start)
}

function formatStatusDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  if (seconds <= 0) return '<1 秒'
  if (seconds < 60) return `${seconds} 秒`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return rest > 0 ? `${minutes} 分 ${rest} 秒` : `${minutes} 分`
}

function messageStatusLabel(message: AgentMessage): string {
  if (message.role !== 'assistant') return ''
  const status = message.status ?? (message.streaming ? 'streaming' : undefined)
  if (!status) return ''
  if (status === 'done' && !message.startedAt && !message.completedAt) return ''
  if (status === 'done') {
    const latestAssistantMessage = [...messages.value].reverse().find(item => item.role === 'assistant')
    if (latestAssistantMessage?.id !== message.id) return ''
  }
  const label = message.statusText?.trim() || defaultMessageStatusText(status)
  return `${label} · ${formatStatusDuration(messageElapsedMs(message))}`
}

function messageStatusClass(message: AgentMessage): string {
  return `message-status--${message.status ?? (message.streaming ? 'streaming' : 'done')}`
}

function waitForReveal(ms: number, signal?: AbortSignal): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('请求已取消', 'AbortError'))
      return
    }
    let timer: number | undefined
    const cleanup = () => {
      if (timer !== undefined) window.clearTimeout(timer)
      signal?.removeEventListener('abort', handleAbort)
    }
    const handleAbort = () => {
      cleanup()
      reject(new DOMException('请求已取消', 'AbortError'))
    }
    timer = window.setTimeout(() => {
      cleanup()
      resolve()
    }, ms)
    signal?.addEventListener('abort', handleAbort, { once: true })
  })
}

interface RevealAssistantMessageOptions {
  statusText?: string
  doneStatusText?: string
  finalStatus?: Extract<AgentMessageStatus, 'done' | 'error'>
  intervalMs?: number
  maxSteps?: number
  signal?: AbortSignal
}

async function revealAssistantMessage(
  message: AgentMessage,
  finalContent: string,
  options: RevealAssistantMessageOptions = {},
) {
  const text = finalContent.trim()
  const finalStatus = options.finalStatus ?? 'done'
  markAssistantMessageStatus(message, 'streaming', options.statusText ?? '正在输出')

  const prefersReducedMotion = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (!text || typeof window === 'undefined' || prefersReducedMotion) {
    message.content = text
    markAssistantMessageStatus(
      message,
      finalStatus,
      options.doneStatusText ?? defaultMessageStatusText(finalStatus),
    )
    void scrollToBottom()
    return
  }

  message.content = ''
  const chars = Array.from(text)
  const chunkSize = Math.max(2, Math.ceil(chars.length / (options.maxSteps ?? MESSAGE_REVEAL_MAX_STEPS)))
  for (let index = 0; index < chars.length; index += chunkSize) {
    if (options.signal?.aborted) throw new DOMException('请求已取消', 'AbortError')
    if (!message.streaming) {
      syncMessageStatusTicker()
      return
    }
    message.content = chars.slice(0, index + chunkSize).join('')
    void scrollToBottom()
    if (index + chunkSize < chars.length) {
      await waitForReveal(options.intervalMs ?? MESSAGE_REVEAL_INTERVAL_MS, options.signal)
    }
  }

  message.content = text
  markAssistantMessageStatus(
    message,
    finalStatus,
    options.doneStatusText ?? defaultMessageStatusText(finalStatus),
  )
  void scrollToBottom()
}

function truncateStoredMessageContent(content: string): string {
  return content.length > MAX_STORED_CHAT_MESSAGE_CHARS
    ? `${content.slice(0, MAX_STORED_CHAT_MESSAGE_CHARS)}\n\n[内容较长，已截断保存]`
    : content
}

function normalizeStoredAgentMessage(raw: unknown): AgentMessage | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Partial<AgentMessage>
  const role = item.role === 'user' || item.role === 'assistant' ? item.role : null
  if (!role || !item.id || typeof item.content !== 'string' || !item.createdAt) return null

  return {
    id: String(item.id),
    role,
    content: truncateStoredMessageContent(item.content),
    createdAt: String(item.createdAt),
    streaming: false,
  }
}

function readStoredAgentMessages(modelId = selectedAgentModelId.value): AgentMessage[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(agentChatMessagesStorageKey(modelId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(item => normalizeStoredAgentMessage(item))
      .filter((item): item is AgentMessage => Boolean(item))
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
      .slice(-MAX_STORED_CHAT_MESSAGES)
  } catch {
    return []
  }
}

function writeStoredAgentMessages(items: AgentMessage[], modelId = selectedAgentModelId.value) {
  if (typeof localStorage === 'undefined') return
  const storageKey = agentChatMessagesStorageKey(modelId)
  const safeMessages = items
    .filter(message => message.role === 'user' || message.role === 'assistant')
    .filter(message => message.content.trim() || message.streaming)
    .slice(-MAX_STORED_CHAT_MESSAGES)
    .map(message => ({
      id: message.id,
      role: message.role,
      content: truncateStoredMessageContent(message.content),
      createdAt: message.createdAt,
    }))

  try {
    if (safeMessages.length === 0) {
      localStorage.removeItem(storageKey)
    } else {
      localStorage.setItem(storageKey, JSON.stringify(safeMessages))
    }
  } catch {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify(safeMessages.slice(-Math.floor(MAX_STORED_CHAT_MESSAGES / 2))),
      )
    } catch {
      localStorage.removeItem(storageKey)
    }
  }
}

function persistMessagesNow(modelId = selectedAgentModelId.value) {
  if (messagePersistTimer !== undefined && typeof window !== 'undefined') {
    window.clearTimeout(messagePersistTimer)
    messagePersistTimer = undefined
  }
  writeStoredAgentMessages(messages.value, modelId)
}

function schedulePersistMessages() {
  if (typeof window === 'undefined') {
    persistMessagesNow()
    return
  }
  if (messagePersistTimer !== undefined) window.clearTimeout(messagePersistTimer)
  messagePersistTimer = window.setTimeout(() => {
    messagePersistTimer = undefined
    writeStoredAgentMessages(messages.value)
  }, 250)
}

function loadPersistedMessages() {
  if (messages.value.length > 0) return
  const storedMessages = readStoredAgentMessages()
  if (storedMessages.length === 0) return
  messages.value = storedMessages
}

function clearPersistedMessages() {
  if (messagePersistTimer !== undefined && typeof window !== 'undefined') {
    window.clearTimeout(messagePersistTimer)
    messagePersistTimer = undefined
  }
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(agentChatMessagesStorageKey())
}

function sortProposals(items: ResumeChangeProposal[]): ResumeChangeProposal[] {
  return [...items].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
}

function persistProposals() {
  saveStoredResumeChangeProposals(proposals.value)
}

function loadPersistedProposals() {
  const stored = loadStoredResumeChangeProposals()
  if (stored.length === 0) return
  const existingIds = new Set(proposals.value.map((proposal) => proposal.id))
  proposals.value = sortProposals([
    ...proposals.value,
    ...stored.filter((proposal) => !existingIds.has(proposal.id)),
  ])
}

function replaySessionEvents(cursor = sessionCursor.value) {
  const replay = replayAgentSessionEventsAfter(cursor)
  if (cursor === 0) {
    replayedEvents.value = replay.events
  } else if (replay.events.length > 0) {
    const existingIds = new Set(replayedEvents.value.map((event) => event.id))
    replayedEvents.value = [
      ...replayedEvents.value,
      ...replay.events.filter((event) => !existingIds.has(event.id)),
    ]
  }
  sessionCursor.value = replay.nextCursor || getAgentSessionCursor()
}

function refreshContext() {
  contextSnapshot.value = buildAgentAssistantContext()
  replaySessionEvents()
}

function openPanel() {
  hideAgentBubble()
  refreshContext()
  loadPersistedProposals()
  isOpen.value = true
  void scrollToBottom()
}

function closePanel() {
  isOpen.value = false
  showAgentBubble(buildAgentBubbleCue('panelClose'))
}

function handleLauncherPointerDown(event: PointerEvent) {
  if (event.button !== 0) return
  event.preventDefault()
  previousBodyUserSelect = document.body.style.userSelect
  document.body.style.userSelect = 'none'
  launcherDragState = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    originX: launcherPosition.value.x,
    originY: launcherPosition.value.y,
    moved: false,
  }
  window.addEventListener('pointermove', handleLauncherPointerMove)
  window.addEventListener('pointerup', handleLauncherPointerUp)
  window.addEventListener('pointercancel', handleLauncherPointerCancel)
}

function handleLauncherClick() {
  if (suppressLauncherClick) {
    suppressLauncherClick = false
    return
  }
  openPanel()
}

function handleLauncherPointerEnter() {
  if (isOpen.value || launcherDragState) return
  showAgentBubble(buildAgentBubbleCue('hover'))
}

function handleLauncherFocus() {
  if (isOpen.value || launcherDragState) return
  showAgentBubble(buildAgentBubbleCue('hover'))
}

function handleLauncherPointerMove(event: PointerEvent) {
  if (!launcherDragState || launcherDragState.pointerId !== event.pointerId) return
  event.preventDefault()
  const deltaX = event.clientX - launcherDragState.startX
  const deltaY = event.clientY - launcherDragState.startY
  if (!launcherDragState.moved && Math.hypot(deltaX, deltaY) > 4) {
    launcherDragState.moved = true
    showAgentBubble(buildAgentBubbleCue('dragStart'))
  }
  launcherPosition.value = clampLauncherPosition({
    x: launcherDragState.originX + deltaX,
    y: launcherDragState.originY + deltaY,
  })
}

function handleLauncherPointerUp(event: PointerEvent) {
  if (!launcherDragState || launcherDragState.pointerId !== event.pointerId) return
  document.body.style.userSelect = previousBodyUserSelect
  const wasDragged = launcherDragState.moved
  launcherDragState = null
  suppressLauncherClick = wasDragged
  persistLauncherPosition()
  if (wasDragged) showAgentBubble(buildAgentBubbleCue('dock'))
  window.removeEventListener('pointermove', handleLauncherPointerMove)
  window.removeEventListener('pointerup', handleLauncherPointerUp)
  window.removeEventListener('pointercancel', handleLauncherPointerCancel)
}

function handleLauncherPointerCancel(event: PointerEvent) {
  if (!launcherDragState || launcherDragState.pointerId !== event.pointerId) return
  document.body.style.userSelect = previousBodyUserSelect
  launcherDragState = null
  suppressLauncherClick = false
  persistLauncherPosition()
  window.removeEventListener('pointermove', handleLauncherPointerMove)
  window.removeEventListener('pointerup', handleLauncherPointerUp)
  window.removeEventListener('pointercancel', handleLauncherPointerCancel)
}

function renderMessage(content: string): string {
  return markdown.render(content)
}

function clampAvatarNumber(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.min(max, Math.max(min, value))
}

function normalizeFloatingAgentBodyAction(action: AgentBodyAction): AgentBodyAction {
  return AGENT_BODY_ACTIONS.includes(action) ? action : 'idle'
}

function setAvatarMotion(directive: AgentAvatarMotionDirective | null, holdMs = 2800) {
  if (avatarMotionResetTimer !== undefined && typeof window !== 'undefined') {
    window.clearTimeout(avatarMotionResetTimer)
    avatarMotionResetTimer = undefined
  }
  avatarMotionDirective.value = directive
    ? {
        ...directive,
        body_action: directive.body_action
          ? normalizeFloatingAgentBodyAction(directive.body_action)
          : undefined,
      }
    : null
  if (!directive?.body_action || holdMs <= 0 || typeof window === 'undefined') return
  avatarMotionResetTimer = window.setTimeout(() => {
    avatarMotionDirective.value = null
    avatarMotionResetTimer = undefined
  }, holdMs)
}

function normalizeAvatarMotionDirective(raw: unknown): AgentAvatarMotionDirective | null {
  if (!raw || typeof raw !== 'object') return null
  const source = raw as Record<string, unknown>
  const next: AgentAvatarMotionDirective = {}
  if (AGENT_BODY_ACTIONS.includes(String(source.body_action) as AgentBodyAction)) {
    next.body_action = source.body_action as AgentBodyAction
  }
  const transition = clampAvatarNumber(source.transition_ms, 150, 300)
  if (transition !== undefined) next.transition_ms = transition

  if (source.eye_target && typeof source.eye_target === 'object') {
    const eye = source.eye_target as Record<string, unknown>
    next.eye_target = {}
    const x = clampAvatarNumber(eye.x, -1, 1)
    const y = clampAvatarNumber(eye.y, -1, 1)
    if (x !== undefined) next.eye_target.x = x
    if (y !== undefined) next.eye_target.y = y
  }

  if (source.emotion && typeof source.emotion === 'object') {
    next.emotion = {}
    for (const key of ['smile', 'sad', 'angry', 'surprised', 'browUp', 'browDown', 'relaxed'] as const) {
      const value = clampAvatarNumber((source.emotion as Record<string, unknown>)[key], 0, 1)
      if (value !== undefined) next.emotion[key] = value
    }
  }

  if (source.expression && typeof source.expression === 'object') {
    next.expression = {}
    for (const [key, rawValue] of Object.entries(source.expression as Record<string, unknown>)) {
      const value = clampAvatarNumber(rawValue, 0, 1)
      if (value !== undefined) next.expression[key] = value
    }
  }

  return Object.keys(next).length > 0 ? next : null
}

function extractAvatarMotionFromText(rawText: string): { text: string; motion: AgentAvatarMotionDirective | null } {
  const pattern = /<!--\s*avatar_motion\s*({[\s\S]*?})\s*-->/gi
  let motion: AgentAvatarMotionDirective | null = null
  const text = rawText.replace(pattern, (_match, jsonText: string) => {
    try {
      motion = normalizeAvatarMotionDirective(JSON.parse(jsonText))
    } catch {
      motion = null
    }
    return ''
  }).trim()
  return { text, motion }
}

function formatTranscript(): string {
  return messages.value
    .slice(-8)
    .map(message => `${message.role === 'user' ? '用户' : '助手'}：${message.content}`)
    .join('\n\n')
}

function buildSystemPrompt(): string {
  const persona = selectedAgentPersona.value
  return [
    '你是 PrepWise 的统一 Agent 助手，服务于求职简历、JD 分析、面试准备、题库训练和投递追踪。',
    '你会根据用户在标题栏选择的智能体切换分析方法、语言节奏和专业侧重点；这些只是内部风格配置，不要在正文中显式说明。',
    `【内部风格配置：${persona.name}｜${persona.title}】`,
    `能力定位：${persona.positioning}`,
    `语言节奏：${persona.languageStyle}`,
    `工作方法：${persona.operatingStyle}`,
    `分析视角：${persona.perspective}`,
    `专业侧重点：${persona.specialties.join('、')}`,
    '可用技能：',
    ...persona.skills.map((skill) => `- ${skill.label}（${skill.execution}）：${skill.description}`),
    persona.systemPrompt,
    '你可以读取下方项目上下文，综合分析并给出具体、可执行的建议。',
    '表达要求：直接进入回答，不要用任何身份声明、角色声明或自我介绍式开场。',
    '角色风格要体现在判断、用词、结构和建议质量里，而不是通过自我介绍或标签化措辞体现。',
    '严格边界：LLM 本身不能直接修改、保存、删除或投递任何数据；涉及写入时只能生成待确认提案，由用户确认后通过工具执行。',
    '当用户要求修改简历时，请输出“待确认改动提案”，每条包含：模块、目标字段、原文摘要、建议改为、理由、风险。不要直接说已经应用。',
    '不要编造简历中没有证据的经历、指标、公司背景或面试表现；缺少事实时先提出一个清晰问题。',
    '回答优先使用中文，保持简洁，按优先级组织。避免空泛鼓励，给出下一步动作。',
    '你可以在回复末尾附加一个隐藏的 VRM 动作控制注释，格式必须是单行：<!-- avatar_motion {"body_action":"idle|thinking_nod|soft_shake|gentle_pace|folded_arms|presenting_gesture|arm_explain","emotion":{"smile":0~1,"sad":0~1,"angry":0~1,"surprised":0~1,"browUp":0~1,"browDown":0~1,"relaxed":0~1},"eye_target":{"x":-1~1,"y":-1~1},"transition_ms":180~300} -->',
    '动作 JSON 只表达当前回答的情绪和小幅姿态，不要在正文中解释这段 JSON。思考建议时用 thinking_nod；拒绝/纠错时用 soft_shake；讲解和总结用 arm_explain 或 presenting_gesture；需要自然停顿时用 idle 或 folded_arms；不要连续输出大幅抬手动作。',
  ].join('\n')
}

function proposalSummaryMessage(nextProposals: ResumeChangeProposal[]): string {
  if (nextProposals.length === 0) {
    return '我没有生成可安全应用的改动提案。可能是当前简历字段为空、请求不够具体，或建议无法基于已有事实成立。'
  }

  return [
    `已生成 ${nextProposals.length} 条待确认改动提案。`,
    '请在下方逐条查看 before/after 和风险提示，确认后才会写入简历。',
  ].join('\n\n')
}

function appendAgentDecisionEvent(
  decision: AgentReActDecision,
  userInput: string,
  messageId?: string,
) {
  appendAgentSessionEvent('agent.decision', {
    action: decision.action,
    toolId: decision.toolId,
    effect: decision.effect,
    confirmationPolicy: decision.confirmationPolicy,
    statusBeforeConfirm: decision.statusBeforeConfirm,
    personaId: selectedAgentPersona.value.id,
    personaSkillId: decision.personaSkillId,
    reason: decision.reason,
    safetyNote: decision.safetyNote,
    userInput,
    messageId,
  })
}

function buildUserMessage(userInput: string): string {
  refreshContext()
  return [
    '【项目上下文快照】',
    contextSnapshot.value.contextText || '暂无可用上下文。',
    jdMatchSummary.value
      ? [
          '',
          '【结构化 JD 匹配摘要】',
          `匹配分：${jdMatchSummary.value.score ?? '--'}`,
          `命中关键词：${jdMatchSummary.value.keywords.matched.join('、') || '无'}`,
          `部分命中：${jdMatchSummary.value.keywords.partial.join('、') || '无'}`,
          `缺失关键词：${jdMatchSummary.value.keywords.missing.join('、') || '无'}`,
          `Top gaps：${jdMatchSummary.value.gaps.map(gap => `${gap.requirement}（${gap.status}/${gap.priority}）`).join('；') || '无'}`,
          `事实缺口：${jdMatchSummary.value.factGaps.map(gap => `${gap.requirement}：${gap.reason}`).join('；') || '无'}`,
          `已确认改动：${jdMatchSummary.value.confirmedChanges.map(change => `${change.moduleLabel}/${change.fieldLabel}`).join('、') || '无'}`,
        ].join('\n')
      : '',
    '',
    '【最近对话】',
    formatTranscript() || '无',
    '',
    '【用户当前问题】',
    userInput,
  ].join('\n')
}

async function scrollToBottom() {
  await nextTick()
  const el = messagesRef.value
  if (!el) return
  el.scrollTop = el.scrollHeight
}

async function sendMessage(text?: string, decision?: AgentReActDecision) {
  const content = (text ?? inputText.value).trim()
  if (!content || isStreaming.value || !hasAiConfig.value) return

  errorText.value = ''
  inputText.value = ''
  setAvatarMotion({
    body_action: 'idle',
    emotion: { relaxed: 0.16 },
    transition_ms: 220,
  }, 0)
  const userMessage: AgentMessage = {
    id: createMessageId('user'),
    role: 'user',
    content,
    createdAt: new Date().toISOString(),
  }
  const assistantMessage = createAssistantMessage('thinking', '思考中')

  messages.value.push(userMessage, assistantMessage)
  syncMessageStatusTicker()
  appendAgentSessionEvent('text.delta', {
    role: 'user',
    text: content,
    messageId: userMessage.id,
  })
  if (decision) appendAgentDecisionEvent(decision, content, userMessage.id)
  isStreaming.value = true
  abortController = new AbortController()
  void scrollToBottom()
  let wasAborted = false

  try {
    await streamAIRequest(
      activeConfig.value,
      buildSystemPrompt(),
      buildUserMessage(content),
      {
        onChunk: (fullText) => {
          const parsed = extractAvatarMotionFromText(fullText)
          if (parsed.text.trim() && assistantMessage.status !== 'streaming') {
            markAssistantMessageStatus(assistantMessage, 'streaming', '正在输出')
          }
          assistantMessage.content = parsed.text
          if (parsed.motion) setAvatarMotion(parsed.motion, 4200)
          void scrollToBottom()
        },
      },
      abortController.signal,
      { timeoutMs: 120_000, maxRetries: 0 },
    )
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      wasAborted = true
      return
    }
    errorText.value = error instanceof Error ? error.message : String(error)
    assistantMessage.content = assistantMessage.content || '这次请求没有成功完成，请稍后重试。'
    markAssistantMessageStatus(assistantMessage, 'error', '未完成')
  } finally {
    const parsedFinal = extractAvatarMotionFromText(assistantMessage.content)
    assistantMessage.content = parsedFinal.text
    if (parsedFinal.motion) setAvatarMotion(parsedFinal.motion, 4200)
    else setAvatarMotion(null)
    if (!wasAborted && assistantMessage.status !== 'error') {
      markAssistantMessageStatus(assistantMessage, 'done', '已输出')
    } else if (wasAborted && assistantMessage.status !== 'done') {
      markAssistantMessageStatus(assistantMessage, 'done', '已停止')
    }
    isStreaming.value = false
    abortController = null
    if (assistantMessage.content.trim()) {
      appendAgentSessionEvent('text.done', {
        role: 'assistant',
        text: assistantMessage.content,
        messageId: assistantMessage.id,
      })
    }
    appendAgentSessionEvent('session.completed', {
      summary: '对话轮次完成',
      messageId: assistantMessage.id,
      action: decision?.action,
    })
    replaySessionEvents()
    void scrollToBottom()
  }
}

interface GenerateProposalOptions {
  request?: string
  userContent?: string
  decision?: AgentReActDecision
}

async function generateProposals(options: GenerateProposalOptions = {}) {
  const request = options.request?.trim()
    || proposalRequest.value.trim()
    || inputText.value.trim()
    || '基于当前上下文生成最值得确认的简历改动提案'
  if (!request || isGeneratingProposals.value || !hasAiConfig.value) return

  refreshContext()
  errorText.value = ''
  proposalRequest.value = ''
  inputText.value = ''
  isGeneratingProposals.value = true
  setAvatarMotion({
    body_action: 'thinking_nod',
    emotion: { browDown: 0.16 },
    eye_target: { x: 0, y: -0.12 },
    transition_ms: 220,
  }, 0)

  const userMessage: AgentMessage = {
    id: createMessageId('user'),
    role: 'user',
    content: options.userContent?.trim() || `生成简历改动提案：${request}`,
    createdAt: new Date().toISOString(),
  }
  const assistantMessage = createAssistantMessage('tooling', '生成待确认提案')
  messages.value.push(userMessage, assistantMessage)
  syncMessageStatusTicker()
  appendAgentSessionEvent('text.delta', {
    role: 'user',
    text: userMessage.content,
    messageId: userMessage.id,
  })
  if (options.decision) appendAgentDecisionEvent(options.decision, request, userMessage.id)
  void scrollToBottom()

  try {
    const nextProposals = await generateResumeChangeProposals(
      activeConfig.value,
      contextSnapshot.value,
      request,
      { personaPrompt: selectedAgentPersona.value.proposalPrompt },
    )
    proposals.value = sortProposals([...nextProposals, ...proposals.value])
    persistProposals()
    await revealAssistantMessage(assistantMessage, proposalSummaryMessage(nextProposals), {
      statusText: '正在输出提案摘要',
    })
    setAvatarMotion({
      body_action: nextProposals.length > 0 ? 'idle' : 'soft_shake',
      emotion: nextProposals.length > 0 ? { smile: 0.42, relaxed: 0.25 } : { sad: 0.18 },
      transition_ms: 240,
    }, 3600)
    appendAgentSessionEvent('text.done', {
      role: 'assistant',
      text: assistantMessage.content,
      messageId: assistantMessage.id,
      proposalCount: nextProposals.length,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    errorText.value = message
    await revealAssistantMessage(assistantMessage, `提案生成失败：${message}`, {
      statusText: '正在输出失败原因',
      finalStatus: 'error',
      doneStatusText: '未完成',
    })
    setAvatarMotion({
      body_action: 'soft_shake',
      emotion: { sad: 0.2, browDown: 0.16 },
      transition_ms: 220,
    }, 3200)
    appendAgentSessionEvent('text.done', {
      role: 'assistant',
      text: assistantMessage.content,
      messageId: assistantMessage.id,
    })
  } finally {
    assistantMessage.streaming = false
    isGeneratingProposals.value = false
    appendAgentSessionEvent('session.completed', {
      summary: '简历提案生成轮次完成',
      messageId: assistantMessage.id,
      action: options.decision?.action,
    })
    replaySessionEvents()
    void scrollToBottom()
  }
}

function cleanAgentText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

function looksLikeInlineJd(value: string): boolean {
  const text = cleanAgentText(value)
  const compact = text.replace(/\s+/g, '')
  if (text.length >= 120) return true
  return (
    /岗位职责|职位描述|任职要求|工作职责|岗位要求|工作内容|responsibilities|requirements/i.test(text)
    || (/(产品经理|工程师|架构师|分析师|设计师|开发|运营|算法|前端|后端|测试)/.test(text)
      && /(负责|熟悉|经验|年以上|对接|落地|能力|要求)/.test(compact))
  )
}

function inferCompanyAndPositionFromText(value: string): { company: string; position: string } {
  const firstLine = cleanAgentText(value).split(/[，,。；;\n]/)[0] ?? ''
  const rolePattern = /((?:AI|AIGC|大模型|智能体|Agent|前端|后端|全栈|Java|数据|算法|产品|项目|运营|设计|测试|架构|技术|业务|商业|增长|安全|云原生|DevOps)?\s*(?:产品经理|工程师|架构师|分析师|设计师|开发|运营|经理|负责人|专家|顾问))/i
  const match = firstLine.match(rolePattern)
  if (!match || typeof match.index !== 'number') return { company: '', position: '' }

  const company = firstLine.slice(0, match.index)
    .replace(/招聘|岗位|职位|JD|jd|的$/g, '')
    .trim()
  const position = firstLine.slice(match.index).trim()
  return { company, position }
}

function resolveCompanyIntelRequest(userInput: string): { company: string; position: string; jdText: string } {
  const parsed = inferCompanyAndPositionFromText(userInput)
  const company = cleanAgentText(jdStore.targetCompany)
    || cleanAgentText(jdStore.jdData?.basicInfo.company)
    || parsed.company
  const position = cleanAgentText(jdStore.targetPosition)
    || cleanAgentText(jdStore.jdData?.basicInfo.jobTitle)
    || parsed.position
  const jdText = looksLikeInlineJd(userInput)
    ? userInput.trim()
    : cleanAgentText(jdStore.jdText)

  return { company, position, jdText }
}

async function buildCompanyIntelReport(sourceRequest?: string, decision?: AgentReActDecision) {
  if (isBuildingCompanyIntelReport.value) return

  const content = (sourceRequest ?? inputText.value).trim()
  if (!content && !jdStore.jdText) return

  refreshContext()
  errorText.value = ''
  inputText.value = ''
  isBuildingCompanyIntelReport.value = true
  abortController = new AbortController()
  setAvatarMotion({
    body_action: 'thinking_nod',
    emotion: { browDown: 0.12, relaxed: 0.18 },
    eye_target: { x: 0.04, y: -0.08 },
    transition_ms: 240,
  }, 0)

  const request = content || '基于当前 JD，生成企业&岗位情报完整报告'
  const userMessage: AgentMessage = {
    id: createMessageId('user'),
    role: 'user',
    content: request,
    createdAt: new Date().toISOString(),
  }
  const assistantMessage = createAssistantMessage('tooling', '识别公司与岗位')

  messages.value.push(userMessage, assistantMessage)
  syncMessageStatusTicker()
  appendAgentSessionEvent('text.delta', {
    role: 'user',
    text: userMessage.content,
    messageId: userMessage.id,
  })
  if (decision) appendAgentDecisionEvent(decision, request, userMessage.id)
  void scrollToBottom()
  let wasAborted = false

  try {
    const { company, position, jdText } = resolveCompanyIntelRequest(request)
    if (!company || !position) {
      throw new Error('请在 JD 中提供公司名称和岗位名称，或先完成 JD 解析后再发起情报搜集。')
    }

    const searchProviders = aiConfigStore.getEnabledSearchProviders()
    if (!searchProviders.length) {
      throw new Error('需要联网搜索渠道才能做企业情报挖掘，请先在 AI 配置中启用 Tavily、Exa、Serper 或 Firecrawl。')
    }

    markAssistantMessageStatus(assistantMessage, 'tooling', `检索 ${company} / ${position}`)
    void scrollToBottom()

    const intelConfig = aiConfigStore.getConfigForFeature('jdCompanyIntel')
    const intel = await generateCompanyIntel(
      intelConfig,
      searchProviders,
      company,
      position,
      jdText,
      {
        onChunk: (text: string) => {
          if (text.trim()) {
            markAssistantMessageStatus(assistantMessage, 'tooling', '整理公开情报')
            assistantMessage.content = text
            void scrollToBottom()
          }
        },
        onDone: () => undefined,
        onError: () => undefined,
      },
      abortController.signal,
    )
    jdStore.companyIntel = intel

    assistantMessage.content = ''
    markAssistantMessageStatus(assistantMessage, 'streaming', '正在输出报告')
    isStreaming.value = true
    await streamAgentCompanyIntelReport(
      intelConfig,
      {
        company,
        position,
        jdText,
        intel,
        personaPrompt: selectedAgentPersona.value.systemPrompt,
      },
      {
        onChunk: (fullText) => {
          const parsed = extractAvatarMotionFromText(fullText)
          if (assistantMessage.status !== 'streaming') {
            markAssistantMessageStatus(assistantMessage, 'streaming', '正在输出报告')
          }
          assistantMessage.content = parsed.text
          if (parsed.motion) setAvatarMotion(parsed.motion, 4200)
          void scrollToBottom()
        },
      },
      abortController.signal,
    )

    const parsedFinal = extractAvatarMotionFromText(assistantMessage.content)
    assistantMessage.content = parsedFinal.text
    if (parsedFinal.motion) setAvatarMotion(parsedFinal.motion, 3600)
    else setAvatarMotion({
      body_action: 'presenting_gesture',
      emotion: { smile: 0.22, relaxed: 0.28 },
      transition_ms: 240,
    }, 3600)

    appendAgentSessionEvent('text.done', {
      role: 'assistant',
      text: assistantMessage.content,
      messageId: assistantMessage.id,
    })
    appendAgentSessionEvent('session.completed', {
      summary: `企业&岗位情报报告已生成：${company} / ${position}`,
      company,
      position,
      messageId: assistantMessage.id,
      action: decision?.action,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      wasAborted = true
      return
    }
    const message = error instanceof Error ? error.message : String(error)
    errorText.value = message
    assistantMessage.content = `企业&岗位情报报告暂时无法完成：${message}`
    markAssistantMessageStatus(assistantMessage, 'error', '未完成')
    setAvatarMotion({
      body_action: 'soft_shake',
      emotion: { sad: 0.16, browDown: 0.14 },
      transition_ms: 220,
    }, 3200)
    appendAgentSessionEvent('text.done', {
      role: 'assistant',
      text: assistantMessage.content,
      messageId: assistantMessage.id,
    })
    appendAgentSessionEvent('session.completed', {
      summary: '企业&岗位情报报告未完成',
      messageId: assistantMessage.id,
      action: decision?.action,
    })
  } finally {
    if (!wasAborted && assistantMessage.status !== 'error') {
      markAssistantMessageStatus(assistantMessage, 'done', '已输出')
    } else if (wasAborted && assistantMessage.status !== 'done') {
      markAssistantMessageStatus(assistantMessage, 'done', '已停止')
    }
    isStreaming.value = false
    isBuildingCompanyIntelReport.value = false
    abortController = null
    replaySessionEvents()
    void scrollToBottom()
  }
}

function trainingQuestionNotes(question: AgentTrainingQuestionCard): string {
  return [
    question.userNotes,
    question.framework && `答题框架：${question.framework}`,
    question.intent && `考察意图：${question.intent}`,
    question.resumeAnchor && `关联简历锚点：${question.resumeAnchor}`,
    question.followUpChain.length > 0 && `追问链：${question.followUpChain.join(' / ')}`,
  ].filter(Boolean).join('\n\n')
}

function trainingQuestionToSavedQuestion(question: TrainingQuestionDraft): SavedQuestion {
  return {
    content: question.content,
    category: question.category || '专项训练',
    tags: question.tags.slice(0, 6),
    reference_answer: question.referenceAnswer,
    user_notes: trainingQuestionNotes(question),
    source: '米娅专项训练',
    source_type: 'ai_generated',
    mastery_level: 0,
    difficulty: question.difficulty,
    focus_area: question.focusArea,
    intent: question.intent,
    framework: question.framework,
    resume_anchor: question.resumeAnchor,
    follow_up_chain: question.followUpChain,
    is_grounded: Boolean(question.resumeAnchor || jdStore.jdText || jdStore.companyIntel),
  }
}

function buildTrainingQuestionSummary(questionCount: number, diagnosis: string[]): string {
  const lines = [
    `已生成 ${questionCount} 道专项训练题。`,
    diagnosis.length
      ? `我会优先让你练：${diagnosis.slice(0, 4).join('；')}`
      : '下方题卡已经带参考答案、答题框架和追问链。',
    '可以先勾选最有价值的题，再保存到面试题库。',
  ]
  return lines.join('\n\n')
}

async function buildTrainingQuestions(sourceRequest?: string, decision?: AgentReActDecision) {
  if (isBuildingTrainingQuestions.value) return

  const content = (sourceRequest ?? inputText.value).trim()
  const request = content || '基于当前上下文生成专项训练题，并给出参考答案'
  if (!request || !hasAiConfig.value) return

  refreshContext()
  errorText.value = ''
  inputText.value = ''
  isBuildingTrainingQuestions.value = true
  abortController = new AbortController()
  setAvatarMotion({
    body_action: 'thinking_nod',
    emotion: { browUp: 0.12, relaxed: 0.22 },
    eye_target: { x: 0.02, y: -0.08 },
    transition_ms: 220,
  }, 0)

  const userMessage: AgentMessage = {
    id: createMessageId('user'),
    role: 'user',
    content: request,
    createdAt: new Date().toISOString(),
  }
  const assistantMessage = createAssistantMessage('tooling', '定位训练重点')

  messages.value.push(userMessage, assistantMessage)
  syncMessageStatusTicker()
  appendAgentSessionEvent('text.delta', {
    role: 'user',
    text: userMessage.content,
    messageId: userMessage.id,
  })
  if (decision) appendAgentDecisionEvent(decision, request, userMessage.id)
  void scrollToBottom()

  try {
    const result = await generateAgentTrainingQuestions(
      activeConfig.value,
      {
        context: contextSnapshot.value,
        request,
        personaPrompt: selectedAgentPersona.value.systemPrompt,
        questionCount: 6,
      },
      abortController.signal,
    )

    trainingQuestionDrafts.value = result.questions.map(question => ({
      ...question,
      selected: true,
      status: 'pending',
    }))
    await revealAssistantMessage(
      assistantMessage,
      buildTrainingQuestionSummary(result.questions.length, result.diagnosis),
      { statusText: '正在输出训练摘要' },
    )
    setAvatarMotion({
      body_action: 'presenting_gesture',
      emotion: { smile: 0.28, relaxed: 0.24 },
      transition_ms: 240,
    }, 3600)
    appendAgentSessionEvent('text.done', {
      role: 'assistant',
      text: assistantMessage.content,
      messageId: assistantMessage.id,
    })
    appendAgentSessionEvent('session.completed', {
      summary: `专项训练题已生成：${result.questions.length} 道`,
      messageId: assistantMessage.id,
      action: decision?.action,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return
    const message = error instanceof Error ? error.message : String(error)
    errorText.value = message
    await revealAssistantMessage(assistantMessage, `专项训练题暂时无法生成：${message}`, {
      statusText: '正在输出失败原因',
      finalStatus: 'error',
      doneStatusText: '未完成',
    })
    setAvatarMotion({
      body_action: 'soft_shake',
      emotion: { sad: 0.16, browDown: 0.12 },
      transition_ms: 220,
    }, 3200)
    appendAgentSessionEvent('text.done', {
      role: 'assistant',
      text: assistantMessage.content,
      messageId: assistantMessage.id,
    })
    appendAgentSessionEvent('session.completed', {
      summary: '专项训练题未完成',
      messageId: assistantMessage.id,
      action: decision?.action,
    })
  } finally {
    assistantMessage.streaming = false
    isBuildingTrainingQuestions.value = false
    abortController = null
    replaySessionEvents()
    void scrollToBottom()
  }
}

function toggleTrainingQuestion(question: TrainingQuestionDraft) {
  if (question.status !== 'pending') return
  question.selected = !question.selected
}

function toggleAllTrainingQuestions() {
  const shouldSelect = !allTrainingQuestionsSelected.value
  pendingTrainingQuestions.value.forEach((question) => {
    question.selected = shouldSelect
  })
}

async function saveSelectedTrainingQuestions() {
  const selected = selectedTrainingQuestions.value
  if (selected.length === 0 || isSavingTrainingQuestions.value) return

  isSavingTrainingQuestions.value = true
  errorText.value = ''
  try {
    const count = await questionBankStore.addQuestionBatch(selected.map(trainingQuestionToSavedQuestion))
    if (count > 0) {
      const selectedIds = new Set(selected.map(question => question.id))
      trainingQuestionDrafts.value = trainingQuestionDrafts.value.map(question => selectedIds.has(question.id)
        ? { ...question, selected: false, status: 'saved' }
        : question)
      toast.success(`已保存 ${count} 道题到面试题库`)
      appendAgentSessionEvent('tool.confirmed', {
        toolId: 'question_bank.save_selected_training_questions',
        title: '保存专项训练题',
        summary: `已保存 ${count} 道题到面试题库`,
      })
    } else {
      throw new Error(questionBankStore.mutationErrorMsg || '保存题目失败')
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    errorText.value = message
    toast.error(message)
  } finally {
    isSavingTrainingQuestions.value = false
    replaySessionEvents()
  }
}

async function buildJdSummary(sourceRequest?: string, decision?: AgentReActDecision) {
  if (isBuildingJdSummary.value) return
  isBuildingJdSummary.value = true
  errorText.value = ''
  inputText.value = ''
  setAvatarMotion({
    body_action: 'thinking_nod',
    emotion: { browDown: 0.22 },
    eye_target: { x: 0.08, y: -0.1 },
    transition_ms: 220,
  }, 0)

  let sourceMessageId: string | undefined
  const normalizedSourceRequest = typeof sourceRequest === 'string' ? sourceRequest.trim() : ''
  const pushedMessages: AgentMessage[] = []

  if (normalizedSourceRequest) {
    const userMessage: AgentMessage = {
      id: createMessageId('user'),
      role: 'user',
      content: normalizedSourceRequest,
      createdAt: new Date().toISOString(),
    }
    sourceMessageId = userMessage.id
    pushedMessages.push(userMessage)
    appendAgentSessionEvent('text.delta', {
      role: 'user',
      text: normalizedSourceRequest,
      messageId: userMessage.id,
    })
    if (decision) appendAgentDecisionEvent(decision, normalizedSourceRequest, userMessage.id)
  }

  const assistantMessage = createAssistantMessage('tooling', '分析 JD 匹配')
  pushedMessages.push(assistantMessage)
  messages.value.push(...pushedMessages)
  syncMessageStatusTicker()
  void scrollToBottom()

  try {
    const result = await runJdMatchSummaryTool()
    if (!result.ok) {
      setAvatarMotion({
        body_action: 'soft_shake',
        emotion: { sad: 0.18, browDown: 0.12 },
        transition_ms: 220,
      }, 3000)
      toast.warning(result.reason)
      await revealAssistantMessage(assistantMessage, `JD 摘要工具暂时无法完成：${result.reason}`, {
        statusText: '正在输出原因',
        finalStatus: 'error',
        doneStatusText: '未完成',
      })
      appendAgentSessionEvent('text.done', {
        role: 'assistant',
        text: assistantMessage.content,
        messageId: assistantMessage.id,
      })
      appendAgentSessionEvent('session.completed', {
        summary: 'JD 匹配摘要未生成',
        messageId: assistantMessage.id,
        sourceMessageId,
        action: decision?.action,
      })
      replaySessionEvents()
      void scrollToBottom()
      return
    }
    jdMatchSummary.value = result.data ?? null
    if (!jdMatchSummary.value) {
      setAvatarMotion({
        body_action: 'soft_shake',
        emotion: { sad: 0.16 },
        transition_ms: 220,
      }, 3000)
      toast.warning('JD 摘要为空')
      await revealAssistantMessage(assistantMessage, '当前 JD 摘要为空，可能还没有完成 JD 匹配分析。', {
        statusText: '正在输出摘要状态',
        finalStatus: 'error',
        doneStatusText: '未生成',
      })
      appendAgentSessionEvent('text.done', {
        role: 'assistant',
        text: assistantMessage.content,
        messageId: assistantMessage.id,
      })
      appendAgentSessionEvent('session.completed', {
        summary: 'JD 匹配摘要为空',
        messageId: assistantMessage.id,
        sourceMessageId,
        action: decision?.action,
      })
      replaySessionEvents()
      void scrollToBottom()
      return
    }

    await revealAssistantMessage(
      assistantMessage,
      [
        `已生成 JD 匹配摘要：匹配分 ${jdMatchSummary.value.score ?? '--'}。`,
        `Top gaps：${jdMatchSummary.value.gaps.slice(0, 3).map(gap => gap.requirement).join('；') || '暂无'}`,
      ].join('\n\n'),
      { statusText: '正在输出 JD 摘要' },
    )
    setAvatarMotion({
      body_action: 'idle',
      emotion: { smile: 0.42, relaxed: 0.24 },
      eye_target: { x: 0, y: 0.08 },
      transition_ms: 240,
    }, 3800)
    appendAgentSessionEvent('text.done', {
      role: 'assistant',
      text: assistantMessage.content,
      messageId: assistantMessage.id,
    })
    appendAgentSessionEvent('session.completed', {
      summary: `JD 匹配摘要已生成：${jdMatchSummary.value.gaps.length} 个 gaps，${jdMatchSummary.value.factGaps.length} 个事实缺口`,
      score: jdMatchSummary.value.score,
      analysisId: jdMatchSummary.value.analysisId,
      messageId: assistantMessage.id,
      sourceMessageId,
      action: decision?.action,
    })
    replaySessionEvents()
    void scrollToBottom()
    toast.success('已生成 JD 匹配摘要')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    errorText.value = message
    await revealAssistantMessage(assistantMessage, `JD 摘要失败：${message}`, {
      statusText: '正在输出失败原因',
      finalStatus: 'error',
      doneStatusText: '未完成',
    })
    setAvatarMotion({
      body_action: 'soft_shake',
      emotion: { sad: 0.22, browDown: 0.18 },
      transition_ms: 220,
    }, 3200)
    appendAgentSessionEvent('text.done', {
      role: 'assistant',
      text: assistantMessage.content,
      messageId: assistantMessage.id,
    })
    appendAgentSessionEvent('session.completed', {
      summary: 'JD 匹配摘要未生成',
      messageId: assistantMessage.id,
      sourceMessageId,
      action: decision?.action,
    })
    replaySessionEvents()
    void scrollToBottom()
    toast.error(`JD 摘要失败：${message}`)
  } finally {
    assistantMessage.streaming = false
    isBuildingJdSummary.value = false
  }
}

async function applyProposal(proposal: ResumeChangeProposal) {
  if (proposal.status !== 'pending') return
  const invocation = createApplyResumeProposalInvocation(proposal)
  const result = await confirmAgentToolInvocation(invocation)
  if (!result.ok) {
    toast.error(`应用失败：${result.reason}`)
    return
  }
  persistProposals()
  refreshContext()
  toast.success(`已应用至「${proposal.moduleLabel}」`)
}

async function rejectProposal(proposal: ResumeChangeProposal) {
  if (proposal.status !== 'pending') return
  const invocation = createRejectResumeProposalInvocation(proposal)
  const result = await confirmAgentToolInvocation(invocation)
  if (!result.ok) {
    toast.error(`拒绝失败：${result.reason}`)
    return
  }
  persistProposals()
  toast.info('已拒绝该改动提案')
}

async function dismissProposal(proposal: ResumeChangeProposal) {
  if (proposal.status !== 'pending') return
  const invocation = createApplyResumeProposalInvocation(proposal)
  rejectAgentToolInvocation(invocation)
  await rejectProposal(proposal)
}

async function revertProposal(proposal: ResumeChangeProposal) {
  if (proposal.status !== 'applied') return
  const invocation = createRevertResumeProposalInvocation(proposal)
  const result = await confirmAgentToolInvocation(invocation)
  if (!result.ok) {
    toast.error(`撤回失败：${result.reason}`)
    return
  }
  persistProposals()
  refreshContext()
  toast.success(`已撤回「${proposal.moduleLabel}」改动`)
}

function clearProcessedProposals() {
  if (processedProposalCount.value === 0) return
  proposals.value = proposals.value.filter((proposal) => proposal.status === 'pending')
  persistProposals()
  toast.info('已清空处理完成的提案')
}

function proposalStatusLabel(proposal: ResumeChangeProposal): string {
  if (proposal.status === 'applied') return '已应用，可撤回'
  if (proposal.status === 'rejected') return '已拒绝'
  if (proposal.revertedAt) return '已撤回'
  return '待确认'
}

function appendBlockedExternalAction(content: string, decision: AgentReActDecision) {
  errorText.value = ''
  inputText.value = ''
  setAvatarMotion({
    body_action: 'soft_shake',
    emotion: { browDown: 0.22, sad: 0.12 },
    transition_ms: 220,
  }, 3200)

  const userMessage: AgentMessage = {
    id: createMessageId('user'),
    role: 'user',
    content,
    createdAt: new Date().toISOString(),
  }
  const assistantMessage: AgentMessage = {
    id: createMessageId('assistant'),
    role: 'assistant',
    content: [
      '我不能直接代表你投递、联系 HR，或把内容发送到外部平台。',
      '我可以先帮你生成 JD 匹配摘要、待确认简历改动提案，或者起草投递沟通文案供你手动发送。',
    ].join('\n\n'),
    createdAt: new Date().toISOString(),
  }

  messages.value.push(userMessage, assistantMessage)
  appendAgentSessionEvent('text.delta', {
    role: 'user',
    text: content,
    messageId: userMessage.id,
  })
  appendAgentDecisionEvent(decision, content, userMessage.id)
  appendAgentSessionEvent('text.done', {
    role: 'assistant',
    text: assistantMessage.content,
    messageId: assistantMessage.id,
  })
  appendAgentSessionEvent('session.completed', {
    summary: '已阻止未授权外部动作',
    action: decision.action,
    messageId: assistantMessage.id,
  })
  replaySessionEvents()
  void scrollToBottom()
}

function clearSessionReplay() {
  clearAgentSessionEvents()
  replayedEvents.value = []
  sessionCursor.value = 0
  toast.info('已清空 Agent 事件回放')
}

function stopStreaming() {
  abortController?.abort()
  abortController = null
  isStreaming.value = false
  const current = messages.value[messages.value.length - 1]
  if (current?.role === 'assistant') {
    markAssistantMessageStatus(current, 'done', current.content.trim() ? '已停止' : '已停止')
  }
}

async function runAgentTurn(text?: string) {
  const content = (text ?? inputText.value).trim()
  if (!content || isStreaming.value || isGeneratingProposals.value || isBuildingJdSummary.value || isBuildingCompanyIntelReport.value || isBuildingTrainingQuestions.value) return

  const decision = routeAgentReActTurn(content, selectedAgentPersona.value)
  if (decision.action === 'blocked_external_action') {
    appendBlockedExternalAction(content, decision)
    return
  }
  if (decision.action === 'resume_proposal') {
    await generateProposals({ request: content, userContent: content, decision })
    return
  }
  if (decision.action === 'jd_summary') {
    await buildJdSummary(content, decision)
    return
  }
  if (decision.action === 'company_intel_report') {
    await buildCompanyIntelReport(content, decision)
    return
  }
  if (decision.action === 'question_training_set') {
    await buildTrainingQuestions(content, decision)
    return
  }

  await sendMessage(content, decision)
}

function handleSubmit() {
  void runAgentTurn()
}

function handleQuickPrompt(prompt: string) {
  void runAgentTurn(prompt)
}

function handleProposalShortcut() {
  proposalRequest.value = '基于当前 JD、简历审查和面试弱项，生成 3 条最值得确认的简历改动提案'
  void generateProposals()
}

function clearConversation() {
  if (isStreaming.value) stopStreaming()
  messages.value = []
  trainingQuestionDrafts.value = []
  clearPersistedMessages()
  errorText.value = ''
  appendAgentSessionEvent('session.completed', {
    summary: '用户清空了当前对话显示',
  })
  replaySessionEvents()
  openPanel()
}

watch(
  messages,
  () => {
    schedulePersistMessages()
  },
  { deep: true },
)

watch(
  () => [route.name, route.query.tab],
  () => {
    refreshContext()
    layoutVersion.value += 1
    if (!isOpen.value && !launcherDragState) {
      showAgentBubble(buildAgentBubbleCue('moduleChange'))
    }
  },
  { flush: 'post' },
)

watch(
  isAgentTaskRunning,
  (running) => {
    if (running && !isOpen.value && !launcherDragState) {
      showAgentBubble(buildAgentBubbleCue('hover'))
    }
  },
)

onBeforeUnmount(() => {
  abortController?.abort()
  persistMessagesNow()
  if (avatarMotionResetTimer !== undefined) {
    window.clearTimeout(avatarMotionResetTimer)
    avatarMotionResetTimer = undefined
  }
  clearAgentBubbleTimers()
  if (messageStatusTimer !== undefined) {
    window.clearInterval(messageStatusTimer)
    messageStatusTimer = undefined
  }
  window.removeEventListener('resize', handleLauncherResize)
  window.removeEventListener('pointermove', handleWindowPointerMove)
  window.removeEventListener('pointerout', handleWindowPointerOut)
  window.removeEventListener('pointermove', handleLauncherPointerMove)
  window.removeEventListener('pointerup', handleLauncherPointerUp)
  window.removeEventListener('pointercancel', handleLauncherPointerCancel)
  document.removeEventListener('pointerdown', handleAgentModelDocumentPointerDown)
})

onMounted(() => {
  restoreLauncherPosition()
  registerResumeAgentTools()
  registerJdAgentTools()
  loadPersistedMessages()
  loadPersistedProposals()
  replaySessionEvents(0)
  window.addEventListener('resize', handleLauncherResize)
  window.addEventListener('pointermove', handleWindowPointerMove, { passive: true })
  window.addEventListener('pointerout', handleWindowPointerOut)
  document.addEventListener('pointerdown', handleAgentModelDocumentPointerDown)
  window.setTimeout(() => showAgentBubble(buildAgentBubbleCue('ready')), 700)
  void scrollToBottom()
})
</script>

<template>
  <Teleport to="body">
    <button
      class="agent-launcher"
      :class="agentLauncherClasses"
      :style="launcherStyle"
      type="button"
      aria-label="打开 Agent 助手"
      @pointerdown="handleLauncherPointerDown"
      @pointerenter="handleLauncherPointerEnter"
      @focus="handleLauncherFocus"
      @click="handleLauncherClick"
    >
      <span class="agent-avatar-stage" aria-hidden="true">
        <VrmAvatar
          v-if="selectedAgentModel"
          :model-url="selectedAgentModel.url"
          variant="floating-agent"
          :show-status="false"
          :is-speaking="isStreaming"
          :streaming-text="streamingAssistantText"
          :avatar-state-override="agentAvatarState"
          :motion-directive="floatingAvatarMotionDirective"
        />
      </span>
      <span class="agent-avatar-ground" aria-hidden="true" />
      <transition name="agent-bubble">
        <span
          v-if="isAgentBubbleVisible"
          class="agent-bubble"
          :class="[agentBubblePlacementClass, `agent-bubble--${agentBubbleTone}`]"
          aria-hidden="true"
        >
          <span class="agent-bubble-text">{{ agentBubbleText }}</span>
          <span v-if="isAgentBubbleTyping" class="agent-bubble-caret" aria-hidden="true" />
        </span>
      </transition>
    </button>

    <transition name="agent-panel">
      <section
        v-if="isOpen"
        class="agent-shell"
        :class="[
          panelPlacementClass,
          selectedAgentModel?.gender === 'female' ? 'agent-shell--female' : 'agent-shell--male',
          { 'agent-shell--active': isStreaming || isGeneratingProposals || isBuildingJdSummary || isBuildingCompanyIntelReport || isBuildingTrainingQuestions },
        ]"
        :style="panelStyle"
        aria-label="Agent 助手面板"
      >
        <header class="agent-header">
          <div class="agent-title-group">
            <div
              ref="agentModelSelectRef"
              class="agent-model-select"
              :class="{ 'agent-model-select--open': isAgentModelMenuOpen }"
            >
              <button
                type="button"
                class="agent-model-trigger"
                aria-haspopup="listbox"
                :aria-expanded="isAgentModelMenuOpen"
                :title="isAgentTaskRunning ? '当前任务完成后可切换角色' : '切换角色'"
                :disabled="isAgentTaskRunning"
                @click="toggleAgentModelMenu"
                @keydown="handleAgentModelKeydown"
              >
                <span class="agent-model-avatar" :class="selectedAgentModel?.gender" aria-hidden="true">
                  {{ selectedAgentModel?.name.slice(0, 1) }}
                </span>
                <span class="agent-model-current">
                  <strong>{{ selectedAgentModel?.name }}</strong>
                  <span>{{ selectedAgentModel?.tag }}</span>
                </span>
                <svg class="agent-model-caret" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m7 10 5 5 5-5" />
                </svg>
              </button>
              <transition name="agent-model-menu">
                <div v-if="isAgentModelMenuOpen" class="agent-model-menu" role="listbox" aria-label="切换 Agent 角色">
                  <button
                    v-for="model in ALL_VRM_MODELS"
                    :key="model.id"
                    type="button"
                    class="agent-model-option"
                    :class="{ 'agent-model-option--active': model.id === selectedAgentModel?.id }"
                    role="option"
                    :aria-selected="model.id === selectedAgentModel?.id"
                    :disabled="isAgentTaskRunning"
                    @click="selectAgentModel(model)"
                  >
                    <span class="agent-model-option-avatar">{{ model.name.slice(0, 1) }}</span>
                    <span class="agent-model-option-copy">
                      <strong>{{ model.name }}</strong>
                      <span>{{ model.tag }}</span>
                    </span>
                    <svg v-if="model.id === selectedAgentModel?.id" class="agent-model-check" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="m5 12 4 4L19 6" />
                    </svg>
                  </button>
                </div>
              </transition>
            </div>
          </div>
          <div class="agent-header-actions">
            <button type="button" class="icon-btn" title="刷新上下文" aria-label="刷新上下文" @click="refreshContext">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M20 11a8 8 0 1 0-2.3 5.7" />
                <path d="M20 4v7h-7" />
              </svg>
            </button>
            <button type="button" class="icon-btn" title="清空对话" aria-label="清空对话" @click="clearConversation">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 7h16" />
                <path d="M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3" />
              </svg>
            </button>
            <button type="button" class="icon-btn" title="清空事件回放" aria-label="清空事件回放" @click="clearSessionReplay">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 5v6l4 2" />
                <path d="M20 12a8 8 0 1 1-2.3-5.7" />
                <path d="M20 4v5h-5" />
              </svg>
            </button>
            <button type="button" class="icon-btn" title="关闭" aria-label="关闭 Agent 助手" @click="closePanel">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </header>

        <div ref="messagesRef" class="agent-messages">
          <div v-if="messages.length === 0" class="agent-empty-state" aria-label="快捷问题">
            <div class="empty-state-copy">
              <span class="empty-state-orb" :class="agentAvatarState">
                {{ selectedAgentModel?.name.slice(0, 1) }}
              </span>
              <h3>{{ selectedAgentPersona.emptyTitle }}</h3>
              <p v-if="hasAiConfig">{{ selectedAgentPersona.emptyDescription }}</p>
              <p v-else>配置默认 AI 模型后，{{ selectedAgentModel?.name }} 就可以接入你的求职上下文。</p>
            </div>
            <template v-if="hasAiConfig">
              <div class="quick-prompt-grid">
                <button
                  v-for="prompt in quickPrompts"
                  :key="prompt"
                  type="button"
                  class="quick-prompt"
                  :disabled="isStreaming || isBuildingTrainingQuestions"
                  @click="handleQuickPrompt(prompt)"
                >
                  <span>{{ prompt }}</span>
                </button>
              </div>
            </template>
            <button v-else type="button" class="empty-config-action" @click="emit('open-config')">
              配置默认 AI 模型
            </button>
          </div>

          <article
            v-for="message in messages"
            :key="message.id"
            class="agent-message"
            :class="`agent-message--${message.role}`"
          >
            <span v-if="message.role === 'assistant'" class="message-avatar" :class="selectedAgentModel?.gender">
              {{ selectedAgentModel?.name.slice(0, 1) }}
            </span>
            <div class="message-stack">
              <div class="message-meta">
                <div class="message-role">{{ message.role === 'user' ? '你' : selectedAgentModel?.name || 'Agent' }}</div>
                <div
                  v-if="messageStatusLabel(message)"
                  class="message-status"
                  :class="messageStatusClass(message)"
                >
                  <span class="message-status-dot" aria-hidden="true" />
                  <span>{{ messageStatusLabel(message) }}</span>
                </div>
              </div>
              <div
                class="message-bubble"
                :class="{ 'message-bubble--pending': message.role === 'assistant' && message.streaming && !message.content }"
                :aria-live="message.role === 'assistant' && message.streaming ? 'polite' : undefined"
              >
                <div v-if="message.content" class="message-content" v-safe-html:md="renderMessage(message.content)" />
                <div v-else-if="message.streaming" class="message-waiting-lines" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
                <span v-if="message.streaming && message.content" class="typing-caret">|</span>
              </div>
            </div>
          </article>
        </div>

        <div v-if="!hasAiConfig && messages.length > 0" class="config-warning">
          <div>
            <strong>默认 AI 模型未配置</strong>
            <span>配置后即可让助手读取全局上下文并回答。</span>
          </div>
          <button type="button" @click="emit('open-config')">去配置</button>
        </div>

        <p v-if="errorText" class="agent-error">{{ errorText }}</p>

        <section v-if="jdMatchSummary" class="jd-summary-card" aria-label="JD 匹配摘要">
          <div class="jd-summary-head">
            <div>
              <h3>JD 匹配摘要</h3>
              <p>{{ jdMatchSummary.company || '目标公司' }} · {{ jdMatchSummary.position || '目标岗位' }}</p>
            </div>
            <strong>{{ jdMatchSummary.score ?? '--' }}</strong>
          </div>
          <div class="jd-keyword-grid">
            <div>
              <span>命中</span>
              <p>{{ jdMatchSummary.keywords.matched.slice(0, 6).join('、') || '无' }}</p>
            </div>
            <div>
              <span>缺失</span>
              <p>{{ jdMatchSummary.keywords.missing.slice(0, 6).join('、') || '无' }}</p>
            </div>
          </div>
          <div v-if="jdSummaryTopGaps.length" class="jd-gap-list">
            <div v-for="gap in jdSummaryTopGaps" :key="gap.id" class="jd-gap-item">
              <strong>{{ gap.requirement }}</strong>
              <span>{{ gap.status }} / {{ gap.priority }}</span>
              <p>{{ gap.action }}</p>
            </div>
          </div>
          <div v-if="jdSummaryFactGaps.length" class="jd-fact-list">
            <span>事实缺口</span>
            <p>{{ jdSummaryFactGaps.map(gap => `${gap.requirement}：${gap.reason}`).join('；') }}</p>
          </div>
        </section>

        <section v-if="trainingQuestionDrafts.length" class="training-question-section" aria-label="专项训练题">
          <div class="proposal-head">
            <div>
              <h3>专项训练题</h3>
              <p>{{ selectedTrainingQuestions.length }} 道已勾选，{{ savedTrainingQuestionCount }} 道已保存</p>
            </div>
            <div class="proposal-head-actions">
              <button type="button" :disabled="pendingTrainingQuestions.length === 0" @click="toggleAllTrainingQuestions">
                {{ allTrainingQuestionsSelected ? '取消全选' : '全选' }}
              </button>
              <button
                type="button"
                :disabled="selectedTrainingQuestions.length === 0 || isSavingTrainingQuestions"
                @click="saveSelectedTrainingQuestions"
              >
                {{ isSavingTrainingQuestions ? '保存中' : `保存 ${selectedTrainingQuestions.length} 道` }}
              </button>
            </div>
          </div>

          <article
            v-for="question in trainingQuestionDrafts"
            :key="question.id"
            class="training-question-card"
            :class="{ 'training-question-card--saved': question.status === 'saved' }"
          >
            <label class="training-question-select">
              <input
                type="checkbox"
                :checked="question.selected"
                :disabled="question.status === 'saved'"
                @change="toggleTrainingQuestion(question)"
              />
              <span>{{ question.status === 'saved' ? '已保存' : '待保存' }}</span>
            </label>
            <div class="training-question-head">
              <div>
                <strong>{{ question.category }}</strong>
                <span>{{ question.focusArea || '综合能力' }} · 难度 {{ question.difficulty }}/5</span>
              </div>
            </div>
            <p class="training-question-content">{{ question.content }}</p>
            <div class="training-question-meta">
              <p v-if="question.intent"><strong>考察</strong>{{ question.intent }}</p>
              <p v-if="question.framework"><strong>框架</strong>{{ question.framework }}</p>
              <p v-if="question.resumeAnchor"><strong>锚点</strong>{{ question.resumeAnchor }}</p>
            </div>
            <details class="training-question-answer">
              <summary>参考答案</summary>
              <p>{{ question.referenceAnswer }}</p>
            </details>
            <div v-if="question.followUpChain.length" class="training-followups">
              <span>追问链</span>
              <ol>
                <li v-for="followUp in question.followUpChain" :key="followUp">{{ followUp }}</li>
              </ol>
            </div>
          </article>
        </section>

        <section v-if="proposals.length" class="proposal-section" aria-label="简历改动提案">
          <div class="proposal-head">
            <div>
              <h3>待确认改动</h3>
              <p>{{ pendingProposalCount }} 条等待处理，{{ storedProposalCount }} 条已保存</p>
            </div>
            <div class="proposal-head-actions">
              <button
                v-if="processedProposalCount"
                type="button"
                :disabled="isGeneratingProposals"
                @click="clearProcessedProposals"
              >
                清空已处理
              </button>
              <button type="button" :disabled="isGeneratingProposals" @click="handleProposalShortcut">
                再生成
              </button>
            </div>
          </div>

          <article
            v-for="proposal in proposals"
            :key="proposal.id"
            class="proposal-card"
            :class="`proposal-card--${proposal.status}`"
          >
            <div class="proposal-card-head">
              <div>
                <strong>{{ proposal.moduleLabel }}</strong>
                <span>{{ proposal.fieldLabel }}</span>
              </div>
              <em>{{ proposalStatusLabel(proposal) }}</em>
            </div>
            <div class="proposal-diff">
              <div class="diff-block diff-block--before">
                <span>当前</span>
                <p>{{ proposal.beforeText }}</p>
              </div>
              <div class="diff-block diff-block--after">
                <span>建议</span>
                <p>{{ proposal.afterText }}</p>
              </div>
            </div>
            <div class="proposal-meta">
              <p><strong>理由</strong>{{ proposal.reason }}</p>
              <p><strong>风险</strong>{{ proposal.risk }}</p>
            </div>
            <div v-if="proposal.status === 'pending'" class="proposal-actions">
              <button type="button" class="proposal-reject" @click="dismissProposal(proposal)">拒绝</button>
              <button type="button" class="proposal-apply" @click="applyProposal(proposal)">确认应用</button>
            </div>
            <div v-else-if="proposal.status === 'applied'" class="proposal-actions">
              <button type="button" class="proposal-revert" @click="revertProposal(proposal)">撤回</button>
            </div>
          </article>
        </section>

        <form class="agent-input-area" @submit.prevent="handleSubmit">
          <div class="composer-surface">
            <textarea
              v-model="inputText"
              :placeholder="inputPlaceholder"
              :disabled="isStreaming || isBuildingTrainingQuestions || !hasAiConfig"
              rows="2"
              @keydown.enter.exact.prevent="handleSubmit"
            />
            <div class="input-actions">
              <div class="input-button-group">
                <button
                  type="button"
                  class="send-btn ghost"
                :disabled="isStreaming || isGeneratingProposals || isBuildingJdSummary || isBuildingCompanyIntelReport || isBuildingTrainingQuestions || !hasAiConfig"
                  @click="generateProposals()"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M8 5h8M8 9h8M8 13h5" />
                    <path d="M5 3.5h14v17l-3-2-3 2-3-2-3 2-2-1.3V3.5Z" />
                  </svg>
                  <span>{{ isGeneratingProposals ? '生成中' : '提案' }}</span>
                </button>
                <button
                  type="button"
                  class="send-btn ghost"
                :disabled="isStreaming || isGeneratingProposals || isBuildingJdSummary || isBuildingCompanyIntelReport || isBuildingTrainingQuestions"
                  @click="buildJdSummary()"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 19V5M4 19h16" />
                    <path d="m8 15 3-4 3 2 4-6" />
                  </svg>
                  <span>{{ isBuildingJdSummary ? '分析中' : 'JD 摘要' }}</span>
                </button>
                <button
                  v-if="supportsTrainingQuestions"
                  type="button"
                  class="send-btn ghost"
                  :disabled="isStreaming || isGeneratingProposals || isBuildingJdSummary || isBuildingCompanyIntelReport || isBuildingTrainingQuestions || !hasAiConfig"
                  @click="buildTrainingQuestions()"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 5.5h14v13H5z" />
                    <path d="M8 9h8M8 12h5M8 15h6" />
                    <path d="m16.5 15.5 1.2 1.2 2-2.4" />
                  </svg>
                  <span>{{ isBuildingTrainingQuestions ? '出题中' : '训练题' }}</span>
                </button>
              </div>
              <button v-if="isStreaming" type="button" class="send-btn stop-btn" @click="stopStreaming">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M8 8h8v8H8Z" />
                </svg>
                <span>停止</span>
              </button>
              <button v-else type="submit" class="send-btn" :disabled="!inputText.trim() || !hasAiConfig || isGeneratingProposals || isBuildingJdSummary || isBuildingCompanyIntelReport || isBuildingTrainingQuestions">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m5 12 14-7-4 14-3-5-7-2Z" />
                  <path d="m12 14 7-9" />
                </svg>
                <span>发送</span>
              </button>
            </div>
          </div>
        </form>
      </section>
    </transition>
  </Teleport>
</template>

<style scoped>
.agent-launcher {
  position: fixed;
  left: 0;
  top: -8px;
  z-index: 1210;
  padding: 0;
  border: none;
  border-radius: 28px;
  background: transparent;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  touch-action: none;
  user-select: none;
  overflow: visible;
  isolation: isolate;
  filter: drop-shadow(0 14px 24px rgba(18, 32, 54, 0.12));
  transition:
    filter 180ms ease,
    opacity 180ms ease;
  will-change: left, top;
}

.agent-launcher:active {
  cursor: grabbing;
}

.agent-launcher--open {
  filter: drop-shadow(0 18px 28px rgba(18, 32, 54, 0.16));
}

.agent-avatar-stage {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 2;
  transform-origin: 50% 70%;
}

.agent-avatar-stage :deep(.vrm-avatar) {
  pointer-events: none;
}

.agent-avatar-ground {
  position: absolute;
  left: 18%;
  right: 18%;
  bottom: 9px;
  height: 20px;
  border-radius: 50%;
  background: radial-gradient(ellipse at center, rgba(28, 48, 76, 0.3), transparent 70%);
  filter: blur(1px);
  pointer-events: none;
  z-index: 1;
  opacity: 0.62;
  transform: scaleX(0.92);
}

.agent-bubble {
  --agent-bubble-accent: #4e9c89;
  --agent-bubble-bg: rgba(255, 255, 255, 0.86);
  --agent-bubble-border: color-mix(in srgb, var(--agent-bubble-accent) 16%, rgba(28, 48, 76, 0.1));
  position: absolute;
  top: 0;
  z-index: 5;
  width: max-content;
  max-width: 196px;
  min-height: 28px;
  padding: 7px 10px 8px;
  border: 1px solid var(--agent-bubble-border);
  border-radius: 14px;
  background: var(--agent-bubble-bg);
  color: #203548;
  box-shadow:
    0 8px 20px rgba(18, 32, 54, 0.08),
    0 1px 5px rgba(18, 32, 54, 0.05),
    inset 0 1px 0 rgba(255, 255, 255, 0.72);
  font-size: 11.5px;
  font-weight: 550;
  line-height: 1.44;
  letter-spacing: 0;
  text-align: left;
  white-space: normal;
  pointer-events: none;
  backdrop-filter: blur(18px) saturate(1.04);
}

.agent-bubble::after {
  content: "";
  position: absolute;
  bottom: 10px;
  width: 9px;
  height: 9px;
  background: var(--agent-bubble-bg);
  border-color: var(--agent-bubble-border);
  border-style: solid;
  box-shadow: 3px 3px 8px rgba(18, 32, 54, 0.035);
}

.agent-bubble--left {
  right: calc(62% + 12px);
  border-bottom-right-radius: 7px;
  transform-origin: calc(100% - 12px) calc(100% - 14px);
}

.agent-bubble--left::after {
  right: -5px;
  border-width: 0 1px 1px 0;
  transform: rotate(-45deg);
}

.agent-bubble--right {
  left: calc(62% + 12px);
  border-bottom-left-radius: 7px;
  transform-origin: 12px calc(100% - 14px);
}

.agent-bubble--right::after {
  left: -5px;
  border-width: 1px 0 0 1px;
  transform: rotate(-45deg);
}

.agent-bubble-text {
  display: inline;
}

.agent-bubble-caret {
  display: inline-block;
  width: 5px;
  height: 1em;
  margin-left: 2px;
  vertical-align: -0.15em;
  border-right: 1.5px solid currentColor;
  opacity: 0.72;
  animation: caretBlink 0.78s steps(2, start) infinite;
}

.agent-bubble--role {
  --agent-bubble-accent: #4e9c89;
  color: #183b36;
}

.agent-bubble--observe {
  --agent-bubble-accent: #1f6f9f;
  color: #1d4f72;
}

.agent-bubble--move {
  --agent-bubble-accent: #c96b5b;
  color: #6a342b;
}

.agent-bubble--dock {
  --agent-bubble-accent: #5c7594;
  color: #26384d;
}

.agent-bubble--module {
  --agent-bubble-accent: #6f8fb2;
  color: #28415a;
}

.agent-bubble-enter-active,
.agent-bubble-leave-active {
  transition:
    opacity 170ms ease,
    transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1),
    filter 170ms ease;
}

.agent-bubble-enter-from,
.agent-bubble-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.94);
  filter: blur(8px);
}

.agent-shell svg,
.agent-mark svg,
.icon-btn svg,
.send-btn svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.9;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.agent-shell {
  --agent-accent: #1f6f9f;
  --agent-accent-strong: #154f76;
  --agent-accent-soft: rgba(31, 111, 159, 0.12);
  --agent-coral: #c96b5b;
  --agent-mint: #4e9c89;
  position: fixed;
  z-index: 1300;
  width: min(460px, calc(100vw - 32px));
  height: min(640px, calc(100dvh - 40px));
  border: 1px solid color-mix(in srgb, var(--agent-accent) 22%, var(--border-color));
  border-radius: 22px;
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.94), rgba(247, 251, 253, 0.97) 52%, rgba(244, 249, 252, 0.96)),
    var(--bg-elevated);
  color: var(--text-primary);
  box-shadow:
    0 24px 70px rgba(18, 32, 54, 0.2),
    0 8px 22px rgba(18, 32, 54, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.72);
  display: flex;
  flex-direction: column;
  overflow: visible;
  isolation: isolate;
  backdrop-filter: blur(22px) saturate(1.18);
}

.agent-shell::before {
  content: "";
  position: absolute;
  bottom: 92px;
  width: 24px;
  height: 24px;
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.96), rgba(244, 249, 252, 0.96));
  border: 1px solid color-mix(in srgb, var(--agent-accent) 20%, var(--border-color));
  box-shadow: 10px 12px 26px rgba(18, 32, 54, 0.08);
  z-index: -1;
}

.agent-shell::after {
  content: "";
  position: absolute;
  bottom: 26px;
  width: 132px;
  height: 132px;
  border-radius: 999px;
  background: radial-gradient(circle, color-mix(in srgb, var(--agent-accent) 18%, transparent), transparent 68%);
  filter: blur(8px);
  opacity: 0.72;
  pointer-events: none;
  z-index: -2;
}

.agent-shell--female {
  --agent-accent: #a74f73;
  --agent-accent-strong: #783a55;
  --agent-accent-soft: rgba(167, 79, 115, 0.13);
  --agent-coral: #c77a52;
  --agent-mint: #508d80;
}

.agent-shell--from-right {
  transform-origin: calc(100% - 36px) calc(100% - 36px);
}

.agent-shell--from-left {
  transform-origin: 36px calc(100% - 36px);
}

.agent-shell--from-left::before {
  left: -12px;
  border-width: 0 0 1px 1px;
  border-bottom-left-radius: 8px;
  transform: rotate(45deg);
}

.agent-shell--from-left::after {
  left: -82px;
}

.agent-shell--from-right::before {
  right: -12px;
  border-width: 1px 1px 0 0;
  border-top-right-radius: 8px;
  transform: rotate(45deg);
}

.agent-shell--from-right::after {
  right: -82px;
}

.agent-shell--mobile {
  transform-origin: 50% 100%;
}

.agent-header {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px 12px;
  border-bottom: 1px solid rgba(31, 111, 159, 0.12);
  border-radius: 22px 22px 0 0;
  background:
    linear-gradient(90deg, rgba(255, 255, 255, 0.82), rgba(255, 255, 255, 0.38)),
    linear-gradient(135deg, color-mix(in srgb, var(--agent-accent-soft) 74%, transparent), transparent 56%);
}

.agent-title-group {
  flex: 0 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0;
}

.agent-mark {
  position: relative;
  width: 38px;
  height: 38px;
  border-radius: 12px;
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.88), rgba(255, 255, 255, 0.42)),
    linear-gradient(145deg, var(--agent-accent-soft), rgba(78, 156, 137, 0.1));
  color: var(--agent-accent-strong);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.74),
    0 10px 24px rgba(18, 32, 54, 0.1);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.agent-mark::after {
  content: "";
  position: absolute;
  inset: 6px auto auto 6px;
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: var(--agent-mint);
  box-shadow: 0 0 0 4px rgba(78, 156, 137, 0.12);
}

.agent-model-select {
  position: relative;
  min-width: 0;
  max-width: 188px;
  flex: 0 1 188px;
}

.agent-model-trigger {
  width: 100%;
  min-width: 0;
  height: 42px;
  padding: 0 8px 0 7px;
  border: none;
  border-radius: 14px;
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.94), rgba(255, 255, 255, 0.62));
  color: var(--agent-accent-strong);
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  cursor: pointer;
  box-shadow:
    0 10px 24px rgba(18, 32, 54, 0.045),
    inset 0 1px 0 rgba(255, 255, 255, 0.84);
  transition:
    border-color var(--duration-fast, 160ms) ease,
    background var(--duration-fast, 160ms) ease,
    box-shadow var(--duration-fast, 160ms) ease;
}

.agent-model-trigger:hover,
.agent-model-select--open .agent-model-trigger {
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.98), rgba(255, 255, 255, 0.7));
  box-shadow:
    0 12px 26px rgba(18, 32, 54, 0.065),
    0 0 0 3px color-mix(in srgb, var(--agent-accent-soft) 64%, transparent),
    inset 0 1px 0 rgba(255, 255, 255, 0.88);
}

.agent-model-trigger:disabled {
  cursor: not-allowed;
  opacity: 0.62;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
}

.agent-model-trigger:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--agent-accent) 38%, transparent);
  outline-offset: 2px;
}

.agent-model-avatar {
  position: relative;
  width: 28px;
  height: 28px;
  border-radius: 10px;
  background:
    radial-gradient(circle at 35% 25%, rgba(255, 255, 255, 0.92), transparent 40%),
    linear-gradient(145deg, color-mix(in srgb, var(--agent-accent) 12%, white), rgba(255, 255, 255, 0.48));
  color: var(--agent-accent-strong);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 950;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.88),
    0 6px 14px rgba(18, 32, 54, 0.07);
}

.agent-model-avatar::after {
  content: "";
  position: absolute;
  top: -3px;
  left: -3px;
  width: 6px;
  height: 6px;
  border: 2px solid rgba(255, 255, 255, 0.92);
  border-radius: 999px;
  background: var(--agent-mint);
  box-shadow: 0 0 0 2px rgba(78, 156, 137, 0.12);
}

.agent-model-current {
  min-width: 0;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  line-height: 1.08;
  text-align: left;
}

.agent-model-current strong {
  max-width: 100%;
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 900;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.agent-model-current span {
  max-width: 100%;
  color: color-mix(in srgb, var(--agent-accent-strong) 74%, var(--text-secondary));
  font-size: 10px;
  font-weight: 760;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.agent-model-caret {
  margin-left: auto;
  flex-shrink: 0;
  color: var(--agent-accent-strong);
  transition: transform var(--duration-fast, 160ms) ease;
}

.agent-model-select--open .agent-model-caret {
  transform: rotate(180deg);
}

.agent-model-menu {
  position: absolute;
  z-index: 16;
  top: calc(100% + 7px);
  left: 0;
  width: min(260px, calc(100vw - 36px));
  max-height: min(392px, calc(100vh - 132px));
  overflow-y: auto;
  padding: 7px;
  border: 1px solid color-mix(in srgb, var(--agent-accent) 18%, var(--border-color));
  border-radius: 12px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(246, 250, 252, 0.96)),
    var(--bg-card);
  box-shadow:
    0 20px 48px rgba(18, 32, 54, 0.16),
    0 8px 18px rgba(18, 32, 54, 0.08);
  backdrop-filter: blur(18px) saturate(1.12);
}

.agent-model-option {
  width: 100%;
  min-height: 44px;
  padding: 6px 7px;
  border: 1px solid transparent;
  border-radius: 9px;
  background: transparent;
  color: var(--text-primary);
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr) 16px;
  align-items: center;
  gap: 8px;
  text-align: left;
  cursor: pointer;
  transition:
    border-color var(--duration-fast, 160ms) ease,
    background var(--duration-fast, 160ms) ease,
    transform var(--duration-fast, 160ms) var(--ease-out-quart, ease-out);
}

.agent-model-option:hover,
.agent-model-option--active {
  border-color: color-mix(in srgb, var(--agent-accent) 18%, transparent);
  background: color-mix(in srgb, var(--agent-accent) 6%, white);
}

.agent-model-option:hover {
  transform: translateY(-1px);
}

.agent-model-option:disabled {
  cursor: not-allowed;
  opacity: 0.62;
  transform: none;
}

.agent-model-option-avatar {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background:
    radial-gradient(circle at 35% 28%, rgba(255, 255, 255, 0.9), transparent 38%),
    linear-gradient(145deg, var(--agent-accent-soft), rgba(78, 156, 137, 0.12));
  color: var(--agent-accent-strong);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 950;
}

.agent-model-option-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.agent-model-option-copy strong {
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 900;
}

.agent-model-option-copy span {
  color: var(--text-secondary);
  font-size: 10.5px;
  font-weight: 720;
  line-height: 1.25;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.agent-model-check {
  color: var(--agent-accent-strong);
  padding: 2px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--agent-accent) 8%, white);
}

.agent-model-menu-enter-active,
.agent-model-menu-leave-active {
  transition:
    opacity 150ms ease,
    transform 180ms var(--ease-out-quart, ease-out);
}

.agent-model-menu-enter-from,
.agent-model-menu-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.98);
}

.agent-header-actions {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
}

.icon-btn {
  width: 30px;
  height: 30px;
  border: 1px solid rgba(31, 111, 159, 0.12);
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.46);
  color: var(--text-secondary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition:
    transform var(--duration-fast, 160ms) var(--ease-out-quart, ease-out),
    border-color var(--duration-fast, 160ms) ease,
    background var(--duration-fast, 160ms) ease,
    color var(--duration-fast, 160ms) ease;
}

.icon-btn:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--agent-accent) 28%, transparent);
  color: var(--agent-accent-strong);
  background: rgba(255, 255, 255, 0.72);
}

.agent-messages {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.32), transparent 24%),
    radial-gradient(circle at 10% 8%, var(--agent-accent-soft), transparent 28%),
    radial-gradient(circle at 92% 86%, rgba(78, 156, 137, 0.09), transparent 24%);
  scrollbar-gutter: stable;
}

.agent-message {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  animation: messageRise 260ms var(--ease-out-quart, ease-out) both;
}

.agent-message--user {
  justify-content: flex-end;
}

.message-stack {
  min-width: 0;
  max-width: calc(100% - 44px);
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.agent-message--user .message-stack {
  align-items: flex-end;
  max-width: 92%;
  margin-left: auto;
}

.message-avatar {
  width: 32px;
  height: 32px;
  margin-top: 20px;
  border-radius: 50%;
  background:
    radial-gradient(circle at 35% 28%, rgba(255, 255, 255, 0.9), transparent 38%),
    linear-gradient(145deg, var(--agent-accent-soft), rgba(78, 156, 137, 0.14));
  color: var(--agent-accent-strong);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 900;
  box-shadow:
    0 12px 28px rgba(18, 32, 54, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.78);
}

.message-avatar.female {
  background:
    radial-gradient(circle at 35% 28%, rgba(255, 255, 255, 0.9), transparent 38%),
    linear-gradient(145deg, rgba(167, 79, 115, 0.16), rgba(201, 122, 82, 0.12));
  color: #8c3f60;
}

.message-meta {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 15px;
}

.agent-message--user .message-meta {
  justify-content: flex-end;
}

.message-role {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 800;
}

.message-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: color-mix(in srgb, var(--agent-accent-strong) 86%, var(--text-secondary));
  font-size: 10px;
  font-weight: 850;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.message-status--done {
  color: var(--text-muted);
  opacity: 0.72;
}

.message-status--error {
  color: var(--state-danger-text, #b73333);
}

.message-status-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 12%, transparent);
}

.message-status--thinking .message-status-dot,
.message-status--tooling .message-status-dot,
.message-status--streaming .message-status-dot {
  animation: statusPulse 1.2s ease-in-out infinite;
}

.message-bubble {
  position: relative;
  padding: 11px 13px;
  border: 1px solid rgba(31, 111, 159, 0.12);
  border-radius: 14px 14px 14px 6px;
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.8), rgba(255, 255, 255, 0.54)),
    var(--bg-card);
  color: var(--text-primary);
  box-shadow:
    0 10px 30px rgba(18, 32, 54, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.74);
}

.message-bubble--pending {
  min-width: 92px;
  padding-block: 12px;
}

.agent-message--user .message-bubble {
  border-color: color-mix(in srgb, var(--agent-accent) 28%, transparent);
  border-radius: 14px 14px 6px 14px;
  background:
    linear-gradient(145deg, color-mix(in srgb, var(--agent-accent) 12%, transparent), rgba(255, 255, 255, 0.76)),
    rgba(255, 255, 255, 0.68);
}

.message-content {
  font-size: 13px;
  line-height: 1.65;
  word-break: break-word;
}

.message-waiting-lines {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 18px;
}

.message-waiting-lines span {
  width: 18px;
  height: 5px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--agent-accent) 34%, rgba(255, 255, 255, 0.88));
  animation: waitingLine 1s ease-in-out infinite;
}

.message-waiting-lines span:nth-child(2) {
  animation-delay: 120ms;
}

.message-waiting-lines span:nth-child(3) {
  animation-delay: 240ms;
}

.message-content :deep(p) {
  margin: 0 0 8px;
}

.message-content :deep(p:last-child),
.message-content :deep(ul:last-child),
.message-content :deep(ol:last-child) {
  margin-bottom: 0;
}

.message-content :deep(ul),
.message-content :deep(ol) {
  margin: 0 0 8px;
  padding-left: 18px;
}

.message-content :deep(li) {
  margin: 3px 0;
}

.message-content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 8px 0;
  font-size: 12px;
}

.message-content :deep(th),
.message-content :deep(td) {
  border: 1px solid var(--border-color);
  padding: 5px 6px;
  text-align: left;
  vertical-align: top;
}

.typing-caret {
  color: var(--agent-accent-strong);
  font-weight: 800;
  animation: caretBlink 0.8s steps(2, start) infinite;
}

.agent-empty-state {
  flex: 1;
  min-height: 320px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 28px 14px 34px;
  text-align: center;
}

.empty-state-copy {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  max-width: 350px;
}

.empty-state-orb {
  width: 48px;
  height: 48px;
  border-radius: 16px;
  background:
    radial-gradient(circle at 32% 25%, rgba(255, 255, 255, 0.9), transparent 38%),
    linear-gradient(145deg, var(--agent-accent-soft), rgba(78, 156, 137, 0.14));
  color: var(--agent-accent-strong);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 17px;
  font-weight: 950;
  box-shadow:
    0 14px 34px rgba(18, 32, 54, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.76);
}

.empty-state-orb.speaking,
.empty-state-orb.thinking {
  animation: softLift 1.8s ease-in-out infinite;
}

.empty-state-copy h3 {
  margin: 0;
  color: var(--text-primary);
  font-size: 17px;
  font-weight: 900;
  line-height: 1.2;
}

.empty-state-copy p {
  max-width: 340px;
  margin: 0;
  color: var(--text-secondary);
  font-size: 12.5px;
  line-height: 1.55;
}

.quick-prompt-grid {
  width: min(100%, 390px);
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.quick-prompt {
  min-height: 54px;
  padding: 10px 12px;
  border: 1px solid rgba(31, 111, 159, 0.14);
  border-radius: 14px;
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.82), rgba(255, 255, 255, 0.56)),
    var(--bg-card);
  color: var(--text-secondary);
  text-align: left;
  font-size: 12.5px;
  font-weight: 750;
  line-height: 1.4;
  cursor: pointer;
  box-shadow:
    0 10px 24px rgba(18, 32, 54, 0.045),
    inset 0 1px 0 rgba(255, 255, 255, 0.68);
  transition:
    transform var(--duration-fast, 160ms) var(--ease-out-quart, ease-out),
    box-shadow var(--duration-fast, 160ms) ease,
    border-color var(--duration-fast, 160ms) ease,
    color var(--duration-fast, 160ms) ease,
    background var(--duration-fast, 160ms) ease;
}

.quick-prompt span {
  display: -webkit-box;
  overflow: hidden;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.quick-prompt:hover:not(:disabled) {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--agent-accent) 28%, transparent);
  color: var(--agent-accent-strong);
  background: color-mix(in srgb, var(--agent-accent) 8%, white);
  box-shadow:
    0 14px 28px rgba(18, 32, 54, 0.07),
    inset 0 1px 0 rgba(255, 255, 255, 0.74);
}

.agent-empty-state .empty-config-action {
  min-width: 168px;
  min-height: 38px;
  padding: 0 16px;
  border: 1px solid;
  border-color: color-mix(in srgb, var(--agent-accent) 34%, transparent);
  border-radius: 999px;
  background:
    linear-gradient(145deg, var(--agent-accent), var(--agent-accent-strong));
  color: #fff;
  font: inherit;
  font-size: 13px;
  font-weight: 850;
  cursor: pointer;
  box-shadow: 0 14px 30px color-mix(in srgb, var(--agent-accent) 24%, transparent);
  transition:
    transform var(--duration-fast, 160ms) var(--ease-out-quart, ease-out),
    box-shadow var(--duration-fast, 160ms) ease;
}

.agent-empty-state .empty-config-action:hover:not(:disabled) {
  transform: translateY(-1px);
  color: #fff;
  background:
    linear-gradient(145deg, var(--agent-accent), var(--agent-accent-strong));
  box-shadow: 0 18px 34px color-mix(in srgb, var(--agent-accent) 30%, transparent);
}

.quick-prompt:disabled,
.agent-empty-state .empty-config-action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.config-warning {
  margin: 12px 16px 0;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid var(--state-warning-border, rgba(224, 138, 58, 0.28));
  background: var(--state-warning-bg, rgba(224, 138, 58, 0.1));
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.config-warning div {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.config-warning strong {
  font-size: 12px;
  color: var(--text-primary);
}

.config-warning span {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.35;
}

.config-warning button {
  flex-shrink: 0;
  height: 32px;
  padding: 0 12px;
  border: none;
  border-radius: 10px;
  background: var(--agent-accent);
  color: #fff;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.agent-error {
  margin: 10px 16px 0;
  padding: 8px 10px;
  border-radius: 10px;
  color: var(--state-danger-text, #b73333);
  background: var(--state-danger-bg, rgba(216, 80, 80, 0.08));
  border: 1px solid var(--state-danger-border, rgba(216, 80, 80, 0.24));
  font-size: 12px;
  line-height: 1.45;
}

.jd-summary-card {
  margin: 10px 16px 0;
  padding: 10px;
  border: 1px solid color-mix(in srgb, var(--agent-accent) 22%, transparent);
  border-radius: 12px;
  background:
    linear-gradient(145deg, color-mix(in srgb, var(--agent-accent) 7%, white), rgba(255, 255, 255, 0.7));
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.jd-summary-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.jd-summary-head h3 {
  margin: 0;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 850;
}

.jd-summary-head p {
  margin: 2px 0 0;
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.35;
}

.jd-summary-head strong {
  flex-shrink: 0;
  color: var(--agent-accent-strong);
  font-size: 24px;
  font-weight: 900;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.jd-keyword-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.jd-keyword-grid div,
.jd-gap-item,
.jd-fact-list {
  padding: 8px;
  border: 1px solid rgba(31, 111, 159, 0.1);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.64);
}

.jd-keyword-grid span,
.jd-fact-list span {
  display: inline-flex;
  margin-bottom: 3px;
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 850;
}

.jd-keyword-grid p,
.jd-fact-list p {
  margin: 0;
  color: var(--text-primary);
  font-size: 11px;
  line-height: 1.45;
}

.jd-gap-list {
  display: grid;
  gap: 6px;
}

.jd-gap-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 4px 8px;
}

.jd-gap-item strong {
  color: var(--text-primary);
  font-size: 11px;
  font-weight: 850;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.jd-gap-item span {
  color: var(--agent-accent-strong);
  font-size: 10px;
  font-weight: 850;
  white-space: nowrap;
}

.jd-gap-item p {
  grid-column: 1 / -1;
  margin: 0;
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.4;
}

.proposal-section {
  max-height: 270px;
  overflow-y: auto;
  margin: 10px 16px 0;
  border: 1px solid rgba(31, 111, 159, 0.12);
  border-radius: 12px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.68), rgba(255, 255, 255, 0.54)),
    var(--bg-card);
  box-shadow: 0 12px 34px rgba(18, 32, 54, 0.08);
}

.training-question-section {
  max-height: 340px;
  overflow-y: auto;
  margin: 10px 16px 0;
  border: 1px solid color-mix(in srgb, var(--agent-accent) 18%, transparent);
  border-radius: 12px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.72), rgba(255, 255, 255, 0.56)),
    var(--bg-card);
  box-shadow: 0 12px 34px rgba(18, 32, 54, 0.08);
}

.proposal-head {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 10px 10px;
  border-bottom: 1px solid rgba(31, 111, 159, 0.1);
  background: rgba(255, 255, 255, 0.86);
  backdrop-filter: blur(14px);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.proposal-head h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 850;
  color: var(--text-primary);
}

.proposal-head p {
  margin: 2px 0 0;
  font-size: 11px;
  color: var(--text-muted);
}

.proposal-head button {
  height: 30px;
  padding: 0 10px;
  border: 1px solid rgba(31, 111, 159, 0.12);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.52);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 750;
  cursor: pointer;
}

.proposal-head button:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--agent-accent) 24%, transparent);
  color: var(--agent-accent-strong);
  background: color-mix(in srgb, var(--agent-accent) 7%, white);
}

.proposal-head button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.proposal-head-actions {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.proposal-card {
  padding: 10px;
  border-bottom: 1px solid rgba(31, 111, 159, 0.1);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.proposal-card:last-child {
  border-bottom: none;
}

.proposal-card--applied {
  background: var(--state-success-bg, rgba(26, 143, 94, 0.08));
}

.proposal-card--rejected {
  opacity: 0.66;
}

.training-question-card {
  position: relative;
  padding: 12px 10px 12px 38px;
  border-bottom: 1px solid rgba(31, 111, 159, 0.1);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.training-question-card:last-child {
  border-bottom: none;
}

.training-question-card--saved {
  background: var(--state-success-bg, rgba(26, 143, 94, 0.08));
}

.training-question-select {
  position: absolute;
  left: 10px;
  top: 13px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 800;
  cursor: pointer;
  writing-mode: vertical-rl;
}

.training-question-select input {
  writing-mode: horizontal-tb;
  accent-color: var(--agent-accent);
}

.training-question-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

.training-question-head div {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.training-question-head strong {
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 900;
}

.training-question-head span {
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.35;
}

.training-question-content {
  margin: 0;
  color: var(--text-primary);
  font-size: 12.5px;
  font-weight: 760;
  line-height: 1.55;
}

.training-question-meta {
  display: grid;
  gap: 5px;
}

.training-question-meta p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.45;
}

.training-question-meta strong,
.training-followups span {
  display: inline-flex;
  margin-right: 6px;
  color: var(--agent-accent-strong);
  font-size: 10px;
  font-weight: 900;
}

.training-question-answer {
  border: 1px solid rgba(31, 111, 159, 0.1);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.58);
  overflow: hidden;
}

.training-question-answer summary {
  padding: 8px 10px;
  color: var(--agent-accent-strong);
  font-size: 11px;
  font-weight: 900;
  cursor: pointer;
}

.training-question-answer p {
  margin: 0;
  padding: 0 10px 10px;
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.55;
}

.training-followups {
  padding: 8px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--agent-accent) 6%, transparent);
}

.training-followups ol {
  margin: 4px 0 0;
  padding-left: 18px;
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.45;
}

.proposal-card-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: flex-start;
}

.proposal-card-head div {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.proposal-card-head strong {
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 850;
}

.proposal-card-head span {
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.35;
}

.proposal-card-head em {
  flex-shrink: 0;
  padding: 3px 6px;
  border-radius: 8px;
  background: var(--agent-accent-soft);
  color: var(--agent-accent-strong);
  font-size: 11px;
  font-style: normal;
  font-weight: 800;
}

.proposal-diff {
  display: grid;
  gap: 8px;
}

.diff-block {
  border: 1px solid rgba(31, 111, 159, 0.1);
  border-radius: 10px;
  padding: 8px;
}

.diff-block--before {
  background: var(--state-danger-bg, rgba(216, 80, 80, 0.06));
}

.diff-block--after {
  background: var(--state-success-bg, rgba(26, 143, 94, 0.08));
}

.diff-block span {
  display: inline-flex;
  margin-bottom: 4px;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 850;
}

.diff-block p {
  margin: 0;
  color: var(--text-primary);
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
}

.proposal-meta {
  display: grid;
  gap: 5px;
}

.proposal-meta p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.45;
}

.proposal-meta strong {
  display: inline-flex;
  margin-right: 6px;
  color: var(--text-primary);
}

.proposal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.proposal-actions button {
  height: 32px;
  padding: 0 12px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.proposal-reject {
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-secondary);
}

.proposal-reject:hover {
  border-color: var(--state-danger-border, rgba(216, 80, 80, 0.24));
  color: var(--state-danger-text, #b73333);
  background: var(--state-danger-bg, rgba(216, 80, 80, 0.08));
}

.proposal-apply {
  border: none;
  background: var(--agent-accent);
  color: #fff;
}

.proposal-apply:hover {
  background: var(--agent-accent-strong);
}

.proposal-revert {
  border: 1px solid color-mix(in srgb, var(--agent-accent) 24%, transparent);
  background: var(--agent-accent-soft);
  color: var(--agent-accent-strong);
}

.proposal-revert:hover {
  background: color-mix(in srgb, var(--agent-accent) 12%, white);
}

.agent-input-area {
  position: relative;
  padding: 12px 16px 14px;
  border-top: 1px solid rgba(31, 111, 159, 0.1);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0.76)),
    color-mix(in srgb, var(--bg-card) 70%, transparent);
}

.composer-surface {
  border: 1px solid color-mix(in srgb, var(--agent-accent) 18%, var(--border-color));
  border-radius: 18px;
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.86), rgba(255, 255, 255, 0.62)),
    var(--bg-card);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.78),
    0 12px 32px rgba(18, 32, 54, 0.07);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition:
    border-color var(--duration-fast, 160ms) ease,
    box-shadow var(--duration-fast, 160ms) ease;
}

.composer-surface:focus-within {
  border-color: color-mix(in srgb, var(--agent-accent) 48%, transparent);
  box-shadow:
    0 0 0 3px var(--agent-accent-soft),
    0 16px 36px rgba(18, 32, 54, 0.09),
    inset 0 1px 0 rgba(255, 255, 255, 0.82);
}

.agent-input-area textarea {
  width: 100%;
  min-height: 62px;
  max-height: 128px;
  resize: none;
  padding: 13px 14px 8px;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  font-size: 13px;
  line-height: 1.5;
}

.agent-input-area textarea:focus {
  outline: none;
}

.agent-input-area textarea:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.input-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 8px 8px 10px;
}

.input-button-group {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  flex-wrap: wrap;
}

.send-btn {
  height: 32px;
  min-width: 74px;
  padding: 0 12px;
  border: none;
  border-radius: 12px;
  background:
    linear-gradient(145deg, var(--agent-accent), var(--agent-accent-strong));
  color: #fff;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  box-shadow: 0 12px 26px color-mix(in srgb, var(--agent-accent) 24%, transparent);
  transition:
    transform var(--duration-fast, 160ms) var(--ease-out-quart, ease-out),
    box-shadow var(--duration-fast, 160ms) ease,
    opacity var(--duration-fast, 160ms) ease;
}

.send-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 16px 32px color-mix(in srgb, var(--agent-accent) 30%, transparent);
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.send-btn.ghost {
  height: 30px;
  min-width: 68px;
  border: 1px solid rgba(31, 111, 159, 0.11);
  background: rgba(255, 255, 255, 0.38);
  color: var(--text-secondary);
  box-shadow: none;
}

.send-btn.ghost:hover {
  border-color: color-mix(in srgb, var(--agent-accent) 24%, transparent);
  color: var(--agent-accent-strong);
  background: color-mix(in srgb, var(--agent-accent) 7%, white);
}

.send-btn.stop-btn {
  background:
    linear-gradient(145deg, #b96a5c, #934e48);
  box-shadow: 0 12px 26px rgba(147, 78, 72, 0.24);
}

.agent-panel-enter-active,
.agent-panel-leave-active {
  transition:
    opacity 220ms var(--ease-out-quart, ease-out),
    transform 320ms cubic-bezier(0.18, 0.92, 0.22, 1),
    filter 220ms ease;
  will-change: opacity, transform, filter;
}

.agent-panel-leave-active {
  transition:
    opacity 170ms ease,
    transform 220ms cubic-bezier(0.4, 0, 0.2, 1),
    filter 170ms ease;
}

.agent-panel-enter-from,
.agent-panel-leave-to {
  opacity: 0;
  transform: translate3d(0, 14px, 0) scale(0.94);
  filter: blur(8px);
}

@keyframes caretBlink {
  to { visibility: hidden; }
}

@keyframes statusPulse {
  0%, 100% {
    opacity: 0.42;
    transform: scale(0.82);
  }
  50% {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes waitingLine {
  0%, 100% {
    opacity: 0.36;
    transform: translateY(1px) scaleX(0.82);
  }
  50% {
    opacity: 0.9;
    transform: translateY(-1px) scaleX(1);
  }
}

@keyframes messageRise {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes softLift {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}

@media (prefers-reduced-motion: reduce) {
  .agent-bubble-enter-active,
  .agent-bubble-leave-active {
    transition: opacity 120ms ease;
  }
}

@media (max-width: 640px) {
  .agent-launcher {
    border-radius: 22px;
  }

  .agent-bubble {
    display: none;
  }

  .agent-shell {
    inset: 0;
    width: 100vw;
    height: 100dvh;
    border-radius: 0;
    border: none;
    overflow: hidden;
  }

  .agent-shell::before,
  .agent-shell::after {
    display: none;
  }

  .agent-header {
    padding: 12px 14px;
    align-items: center;
    gap: 8px;
    border-radius: 0;
  }

  .agent-title-group {
    gap: 8px;
  }

  .agent-mark {
    width: 34px;
    height: 34px;
    border-radius: 11px;
  }

  .agent-header-actions {
    gap: 3px;
  }

  .icon-btn {
    width: 28px;
    height: 28px;
  }

  .agent-model-select {
    flex: 0 1 162px;
    max-width: 162px;
  }

  .agent-model-trigger {
    height: 36px;
    padding: 0 7px;
    border-radius: 12px;
    gap: 7px;
  }

  .agent-model-avatar {
    width: 24px;
    height: 24px;
    border-radius: 8px;
    font-size: 11px;
  }

  .agent-model-current strong {
    font-size: 11.5px;
  }

  .agent-model-current span {
    font-size: 10px;
  }

  .agent-model-menu {
    width: min(252px, calc(100vw - 28px));
    max-height: min(360px, calc(100vh - 124px));
  }

  .agent-model-option {
    min-height: 43px;
  }

  .message-bubble {
    max-width: 100%;
  }

  .message-stack {
    max-width: calc(100% - 40px);
  }

  .agent-empty-state {
    min-height: 0;
    padding: 24px 16px 30px;
  }

  .quick-prompt-grid {
    grid-template-columns: 1fr;
    width: min(100%, 340px);
    gap: 8px;
  }

  .quick-prompt {
    min-height: 44px;
    text-align: center;
  }

  .agent-input-area {
    padding: 12px 16px 14px;
  }

  .agent-input-area textarea {
    min-height: 58px;
  }

  .input-actions {
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .input-button-group {
    width: auto;
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .send-btn {
    min-width: 68px;
    padding: 0 11px;
    flex-shrink: 0;
  }

  .send-btn.ghost {
    min-width: 62px;
  }
}
</style>
