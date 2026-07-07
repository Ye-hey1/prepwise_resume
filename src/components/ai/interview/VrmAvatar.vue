<script setup lang="ts">
/**
 * VrmAvatar - 3D 虚拟形象组件（v3 重写版）
 * 核心策略：诊断 + 多路径覆盖 + 自然动画
 */
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import * as THREE from 'three'
import type { VRM } from '@pixiv/three-vrm'
import type { VRMHumanBoneName } from '@pixiv/three-vrm-core'
import { LipSyncPlayer, inferExpression, type Viseme, type ExpressionPreset } from '@/utils/lipSync'
import {
  STANDARD_VRM_PROCEDURAL_BONES,
  VrmProceduralMotionController,
  type VrmBodyAction,
} from '@/utils/vrmProceduralMotion'
import { VrmRuntime } from '@/utils/vrmRuntime'
import { VrmPoseAdapter } from '@/utils/vrmPoseAdapter'
import { ALL_VRM_MODELS } from '@/config/vrmModels'

type AvatarBodyAction = VrmBodyAction
type AvatarExpressionKey =
  | 'blink'
  | 'blinkLeft'
  | 'blinkRight'
  | 'lookLeft'
  | 'lookRight'
  | 'lookUp'
  | 'lookDown'
  | 'aa'
  | 'ih'
  | 'ou'
  | 'ee'
  | 'oh'
  | 'happy'
  | 'angry'
  | 'sad'
  | 'surprised'
  | 'relaxed'
  | 'neutral'
  | 'smile'
  | 'browUp'
  | 'browDown'
  | 'mouthA'
  | 'mouthI'
  | 'mouthU'
  | 'mouthE'
  | 'mouthO'

interface AvatarMotionDirective {
  body_action?: AvatarBodyAction
  emotion?: Partial<Record<'smile' | 'sad' | 'angry' | 'surprised' | 'browUp' | 'browDown' | 'relaxed', number>>
  expression?: Partial<Record<AvatarExpressionKey | string, number>>
  eye_target?: { x?: number; y?: number }
  transition_ms?: number
}

const props = withDefaults(defineProps<{
  modelUrl?: string
  isSpeaking?: boolean
  streamingText?: string
  avatarStateOverride?: 'idle' | 'speaking' | 'thinking' | null
  variant?: 'interview' | 'floating-agent'
  showStatus?: boolean
  motionDirective?: AvatarMotionDirective | null
}>(), {
  modelUrl: '',
  isSpeaking: false,
  streamingText: '',
  avatarStateOverride: null,
  variant: 'interview',
  showStatus: true,
  motionDirective: null,
})

const emit = defineEmits<{
  (e: 'model-loaded'): void
  (e: 'model-error', error: string): void
  (e: 'lip-sync-state', state: 'playing' | 'idle'): void
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)
const isModelLoaded = ref(false)
const isModelLoading = ref(false)
const modelLoadError = ref('')
const avatarState = ref<'idle' | 'speaking' | 'thinking'>('idle')
const showDropZone = ref(false)
/** 当前模型的骨骼轴是否需要翻转补偿（逐模型配置） */
const useFlippedBones = ref(false)

const currentExpressionWeights = new Map<string, number>()
const targetExpressionWeights = new Map<string, number>()
const persistentExpressionWeights = new Map<string, number>()
const supportedExpressionNames = new Set<string>()
const proceduralMotion = new VrmProceduralMotionController()
const runtime = new VrmRuntime()
const poseAdapter = new VrmPoseAdapter({
  useLegacyRawBoneFallback: true,
  devDiagnostics: import.meta.env.DEV,
})

let vrm: VRM | null = null
let animationFrameId = 0
let currentExpression: ExpressionPreset = 'neutral'
let resizeObserver: ResizeObserver | null = null
let loadedModelUrl = ''
let modelBasePosition = new THREE.Vector3()
let targetBodyAction: AvatarBodyAction = 'idle'
let ambientBodyAction: AvatarBodyAction = 'gentle_pace'
let nextAmbientActionAt = 0
let expressionTransitionMs = 220
let blinkWeightTarget = 0
let blinkNextAt = 0
let blinkStartAt = 0
let blinkClosedAt = 0
let blinkOpenAt = 0
let blinkEndAt = 0

// 鼠标追踪只用于悬浮 Agent；面试场景需要稳定正视镜头。
const targetMouseX = ref(0)
const targetMouseY = ref(0)
const directiveEyeX = ref(0)
const directiveEyeY = ref(0)
const hasDirectiveEyeTarget = ref(false)
let currentMouseX = 0
let currentMouseY = 0

function handleMouseMove(e: MouseEvent) {
  if (props.variant !== 'floating-agent' || !containerRef.value) return

  const rect = containerRef.value.getBoundingClientRect()
  const headX = rect.left + rect.width * 0.5
  const headY = rect.top + rect.height * 0.31
  targetMouseX.value = clampRange((e.clientX - headX) / Math.max(90, rect.width * 0.62), -1, 1)
  targetMouseY.value = clampRange((headY - e.clientY) / Math.max(100, rect.height * 0.54), -1, 1)
}

// ═══ 诊断：记录模型骨骼信息 ═══
let boneDiagLogged = false
const IMPORTANT_BONES = [
  'head', 'neck', 'spine', 'chest', 'upperChest',
  'leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand',
  'rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightHand',
  'hips',
] as const satisfies readonly VRMHumanBoneName[]

function logBoneDiag() {
  if (!vrm || boneDiagLogged) return
  boneDiagLogged = true
  // 仅在开发环境输出骨骼诊断日志
  if (import.meta.env.DEV) {
    console.group('%c[VRM 骨骼诊断]', 'color: #6366f1; font-weight: bold')
    console.log('模型已加载，开始检测骨骼可用性...')
    for (const name of IMPORTANT_BONES) {
      const norm = vrm.humanoid.getNormalizedBoneNode(name)
      const raw = vrm.humanoid.getRawBoneNode(name)
      const status = norm ? '✅' : '❌'
      const rawStatus = raw ? '✅' : '❌'
      console.log(`  ${status} normalized.${name} | ${rawStatus} raw.${name}`)
      if (raw) {
        console.log(`    raw rotation: (${raw.rotation.x.toFixed(3)}, ${raw.rotation.y.toFixed(3)}, ${raw.rotation.z.toFixed(3)})`)
      }
    }
    // 检查弹簧骨骼
    const sbm = (vrm as any).springBoneManager
    if (sbm) {
      const springBones = sbm.springBones || []
      console.log(`弹簧骨骼数量: ${springBones.length}`)
      for (const sb of springBones) {
        const boneName = sb.bone?.name || sb.joint?.bone?.name || '?'
        console.log(`  弹簧骨骼: ${boneName}`)
      }
    } else {
      console.log('无弹簧骨骼管理器')
    }
    console.groupEnd()
  }
}

// ═══ 口型同步 ═══
const lipSyncPlayer = new LipSyncPlayer({
  onVisemeChange(viseme: Viseme | 'neutral', weight: number) {
    const visemes: (Viseme | 'neutral')[] = ['aa', 'ih', 'ou', 'ee', 'oh', 'neutral']
    for (const v of visemes) {
      setExpressionTarget(v, v === viseme ? weight : 0)
    }
  },
  onComplete() {
    emit('lip-sync-state', 'idle')
    if (avatarState.value !== 'thinking') avatarState.value = 'idle'
  },
})

// ═══ 场景初始化 ═══
function initScene() {
  if (!canvasRef.value || !containerRef.value) return
  runtime.init(canvasRef.value, containerRef.value, props.variant)
  animate()
}

function clamp01(value: unknown): number {
  return Math.min(1, Math.max(0, typeof value === 'number' && Number.isFinite(value) ? value : 0))
}

function clampRange(value: unknown, min: number, max: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 0
  return Math.min(max, Math.max(min, n))
}

function lerp(current: number, target: number, factor: number): number {
  return current + (target - current) * factor
}

function easeOutCubic(value: number): number {
  const t = clampRange(value, 0, 1)
  return 1 - Math.pow(1 - t, 3)
}

function easeInOutCubic(value: number): number {
  const t = clampRange(value, 0, 1)
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function expressionAliases(name: string): string[] {
  const normalized = name.trim()
  const map: Record<string, string[]> = {
    blink: ['blink'],
    blinkLeft: ['blinkLeft'],
    blinkRight: ['blinkRight'],
    lookLeft: ['lookLeft'],
    lookRight: ['lookRight'],
    lookUp: ['lookUp'],
    lookDown: ['lookDown'],
    mouthA: ['aa'],
    mouthI: ['ih'],
    mouthU: ['ou'],
    mouthE: ['ee'],
    mouthO: ['oh'],
    smile: ['happy', 'relaxed'],
    browUp: ['surprised'],
    browDown: ['angry'],
    sad: ['sad'],
    angry: ['angry'],
    surprised: ['surprised'],
    relaxed: ['relaxed'],
    happy: ['happy'],
    neutral: ['neutral'],
  }
  return map[normalized] ?? [normalized]
}

function setExpressionTarget(name: string, weight: number) {
  const value = clamp01(weight)
  for (const alias of expressionAliases(name)) {
    if (alias === 'neutral') continue
    if (supportedExpressionNames.size > 0 && !supportedExpressionNames.has(alias)) continue
    targetExpressionWeights.set(alias, value)
  }
}

function setPersistentExpressionTarget(name: string, weight: number) {
  const value = clamp01(weight)
  for (const alias of expressionAliases(name)) {
    if (alias === 'neutral') continue
    if (supportedExpressionNames.size > 0 && !supportedExpressionNames.has(alias)) continue
    persistentExpressionWeights.set(alias, value)
  }
}

function clearExpressionTargets(names: string[]) {
  for (const name of names) {
    for (const alias of expressionAliases(name)) persistentExpressionWeights.set(alias, 0)
  }
}

function resetExpressionState() {
  currentExpressionWeights.clear()
  targetExpressionWeights.clear()
  persistentExpressionWeights.clear()
  supportedExpressionNames.clear()
}

function scheduleNextBlink(now: number) {
  blinkNextAt = now + 2.2 + Math.random() * 2.6
  blinkStartAt = 0
  blinkClosedAt = 0
  blinkOpenAt = 0
  blinkEndAt = 0
  blinkWeightTarget = 0
}

function beginBlink(now: number) {
  blinkStartAt = now
  blinkClosedAt = now + 0.035 + Math.random() * 0.018
  blinkOpenAt = blinkClosedAt + 0.026 + Math.random() * 0.026
  blinkEndAt = blinkOpenAt + 0.09 + Math.random() * 0.035
}

function updateBlinkTarget(now: number) {
  if (blinkEndAt > 0) {
    if (now < blinkClosedAt) {
      blinkWeightTarget = easeOutCubic((now - blinkStartAt) / Math.max(0.001, blinkClosedAt - blinkStartAt))
      return
    }
    if (now < blinkOpenAt) {
      blinkWeightTarget = 1
      return
    }
    if (now < blinkEndAt) {
      blinkWeightTarget = 1 - easeInOutCubic((now - blinkOpenAt) / Math.max(0.001, blinkEndAt - blinkOpenAt))
      return
    }
    blinkEndAt = 0
    blinkWeightTarget = 0
    scheduleNextBlink(now)
    return
  }
  if (now >= blinkNextAt) {
    beginBlink(now)
  }
}

function blinkExpressionNames(): string[] {
  if (supportedExpressionNames.size === 0 || supportedExpressionNames.has('blink')) return ['blink']
  const sideBlinks = ['blinkLeft', 'blinkRight'].filter(name => supportedExpressionNames.has(name))
  return sideBlinks.length > 0 ? sideBlinks : ['blink']
}

function updateExpressionWeights(delta: number, now: number) {
  if (!vrm?.expressionManager) return
  updateBlinkTarget(now)
  const blinkNames = new Set(blinkExpressionNames())
  const directedBlink = [...blinkNames].reduce((max, name) => Math.max(
    max,
    persistentExpressionWeights.get(name) ?? 0,
    targetExpressionWeights.get(name) ?? 0,
  ), 0)
  const blinkWeight = Math.max(blinkWeightTarget, directedBlink)

  const factor = 1 - Math.exp(-delta / Math.max(0.001, expressionTransitionMs / 1000))
  const names = new Set([...currentExpressionWeights.keys(), ...persistentExpressionWeights.keys(), ...targetExpressionWeights.keys()])
  for (const name of names) {
    if (blinkNames.has(name)) continue
    const current = currentExpressionWeights.get(name) ?? 0
    const target = Math.max(persistentExpressionWeights.get(name) ?? 0, targetExpressionWeights.get(name) ?? 0)
    const next = lerp(current, target, factor)
    currentExpressionWeights.set(name, next)
    vrm.expressionManager.setValue(name, next < 0.001 ? 0 : next)
  }
  for (const name of blinkNames) {
    currentExpressionWeights.set(name, blinkWeight)
    vrm.expressionManager.setValue(name, blinkWeight < 0.001 ? 0 : blinkWeight)
  }
}

function updateEyeTargetsFromExpressions(x: number, y: number) {
  const left = Math.max(0, -x)
  const right = Math.max(0, x)
  const up = Math.max(0, y)
  const down = Math.max(0, -y)
  setExpressionTarget('lookLeft', Math.min(left, 1) * 0.55)
  setExpressionTarget('lookRight', Math.min(right, 1) * 0.55)
  setExpressionTarget('lookUp', Math.min(up, 1) * 0.42)
  setExpressionTarget('lookDown', Math.min(down, 1) * 0.42)
}

function requestBodyAction(action: AvatarBodyAction) {
  if (targetBodyAction === action) return
  targetBodyAction = action
  proceduralMotion.setBaseAction(action)
}

function pickAmbientBodyAction(): AvatarBodyAction {
  const roll = Math.random()
  if (roll < 0.64) return 'gentle_pace'
  return 'idle'
}

function scheduleNextAmbientAction(elapsed: number) {
  nextAmbientActionAt = elapsed + 4.8 + Math.random() * 4.8
}

function updateImplicitBodyAction(elapsed = runtime.clock.getElapsedTime()) {
  if (props.motionDirective?.body_action) return

  if (avatarState.value === 'speaking') {
    requestBodyAction('arm_explain')
    return
  }

  if (avatarState.value === 'thinking') {
    requestBodyAction('thinking_nod')
    return
  }

  if (props.variant !== 'floating-agent') {
    requestBodyAction('idle')
    return
  }

  if (elapsed >= nextAmbientActionAt) {
    ambientBodyAction = pickAmbientBodyAction()
    scheduleNextAmbientAction(elapsed)
  }
  requestBodyAction(ambientBodyAction)
}

// ═══ 分层程序化骨骼动画：组件只应用 controller 输出的相对 offset，不覆盖内部三层混合逻辑 ═══
// ═══ 渲染循环 ═══
let diagFrameCount = 0
function animate() {
  animationFrameId = requestAnimationFrame(animate)
  const delta = runtime.clock.getDelta()
  const t = runtime.clock.getElapsedTime()

  if (!vrm) {
    runtime.render()
    return
  }

  const state = avatarState.value

  // ═══ 诊断：前 5 帧打印骨骼状态 ═══
  diagFrameCount++
  if (import.meta.env.DEV && diagFrameCount <= 5) {
    const lArm = vrm.humanoid.getNormalizedBoneNode('leftUpperArm')
    const lArmRaw = vrm.humanoid.getRawBoneNode('leftUpperArm')
    console.log(`[帧${diagFrameCount}] state=${state}`, {
      normLeftArm: lArm ? `rot=(${lArm.rotation.x.toFixed(3)},${lArm.rotation.y.toFixed(3)},${lArm.rotation.z.toFixed(3)})` : 'NULL',
      rawLeftArm: lArmRaw ? `rot=(${lArmRaw.rotation.x.toFixed(3)},${lArmRaw.rotation.y.toFixed(3)},${lArmRaw.rotation.z.toFixed(3)})` : 'NULL',
    })
  }

  // ═══ 平滑更新视线参数：面试场景默认正视镜头，只响应显式动作指令；悬浮 Agent 才跟随鼠标。═══
  const mouseLookEnabled = props.variant === 'floating-agent'
  const desiredLookX = hasDirectiveEyeTarget.value ? directiveEyeX.value : mouseLookEnabled ? targetMouseX.value : 0
  const desiredLookY = hasDirectiveEyeTarget.value ? directiveEyeY.value : mouseLookEnabled ? targetMouseY.value : 0
  if (!hasDirectiveEyeTarget.value && !mouseLookEnabled) {
    currentMouseX = 0
    currentMouseY = 0
  } else {
    const lookResponse = mouseLookEnabled ? 0.38 : 0.16
    currentMouseX += (desiredLookX - currentMouseX) * lookResponse
    currentMouseY += (desiredLookY - currentMouseY) * lookResponse
  }
  updateImplicitBodyAction(t)
  const motionFrame = proceduralMotion.update({
    delta,
    elapsed: t,
    avatarState: state,
    lookTargetX: currentMouseX,
    lookTargetY: currentMouseY,
    variant: props.variant,
    flippedBones: useFlippedBones.value,
  })

  // ═══ 计算本帧目标姿态与表情视线：骨骼由 controller 叠加，眼球 BlendShape 使用同一套缓动视线 ═══
  for (const name of ['lookLeft', 'lookRight', 'lookUp', 'lookDown']) {
    for (const alias of expressionAliases(name)) targetExpressionWeights.set(alias, 0)
  }

  // ═══ VRM 引擎更新：姿态优先写入 normalized humanoid，再由 three-vrm 转换到 raw skeleton。═══
  poseAdapter.applyFrame(vrm, motionFrame, {
    basePosition: modelBasePosition,
  })
  const lookApplied = poseAdapter.applyLook(vrm, motionFrame.eyeLook)
  if (!lookApplied) {
    updateEyeTargetsFromExpressions(motionFrame.eyeLook.x, motionFrame.eyeLook.y)
  }
  updateExpressionWeights(delta, t)
  vrm.update(delta)

  runtime.render()
}

// ═══ 加载 VRM 模型 ═══
async function loadModel(url: string) {
  if (!url || isModelLoading.value) return
  if (url === loadedModelUrl && isModelLoaded.value) return

  isModelLoading.value = true
  modelLoadError.value = ''
  boneDiagLogged = false
  diagFrameCount = 0
  lastStreamLength = 0

  try {
    // URL 编码处理中文文件名
    const encodedUrl = encodeURI(url)
    console.log('[VRM] 加载模型:', encodedUrl)

    // 确定模型信息（用于场景旋转和骨骼补偿判断）
    const modelInfo = ALL_VRM_MODELS.find(m => encodeURI(m.url) === encodedUrl || m.url === url)
    useFlippedBones.value = modelInfo?.flippedSkeleton === true

    // 场景旋转：根据模型配置决定是否需要 180° 翻转
    // 默认需要翻转（needsSceneFlip 未设置或为 true），部分模型（男候选人）不需要
    const needsFlip = modelInfo?.needsSceneFlip !== false
    const result = await runtime.loadModel({
      url,
      variant: props.variant,
      needsSceneFlip: needsFlip,
    })

    vrm = result.vrm
    modelBasePosition = result.basePosition.clone()
    poseAdapter.attach(result.vrm, STANDARD_VRM_PROCEDURAL_BONES)
    resetExpressionState()

    for (const expression of result.vrm.expressionManager?.expressions ?? []) {
      if (expression.name) supportedExpressionNames.add(expression.name)
    }
    for (const preset of ['aa', 'ih', 'ou', 'ee', 'oh', 'blink', 'blinkLeft', 'blinkRight', 'happy', 'angry', 'sad', 'surprised', 'relaxed', 'lookLeft', 'lookRight', 'lookUp', 'lookDown']) {
      if (result.vrm.expressionManager?.getExpression(preset)) supportedExpressionNames.add(preset)
    }
    proceduralMotion.reset()
    scheduleNextBlink(runtime.clock.getElapsedTime())
    applyMotionDirective(props.motionDirective)
    isModelLoaded.value = true
    loadedModelUrl = url
    emit('model-loaded')

    // 打印骨骼诊断
    logBoneDiag()

    startBlinkAnimation()
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '模型加载失败'
    modelLoadError.value = message
    isModelLoaded.value = false
    loadedModelUrl = ''
    emit('model-error', message)
  } finally {
    isModelLoading.value = false
  }
}

// ═══ 眨眼 ═══
function startBlinkAnimation() {
  scheduleNextBlink(runtime.clock.getElapsedTime())
}

// ═══ 表情控制 ═══
function setExpression(preset: ExpressionPreset, weight = 1.0) {
  for (const p of ['happy', 'angry', 'sad', 'surprised', 'relaxed'] as ExpressionPreset[]) {
    setPersistentExpressionTarget(p, p === preset ? weight : 0)
  }
  currentExpression = preset
}

function applyMotionDirective(directive: AvatarMotionDirective | null | undefined) {
  clearExpressionTargets(['happy', 'angry', 'sad', 'surprised', 'relaxed', 'smile', 'browUp', 'browDown'])
  if (!directive) {
    expressionTransitionMs = 220
    proceduralMotion.setTransitionMs(expressionTransitionMs)
    directiveEyeX.value = 0
    directiveEyeY.value = 0
    hasDirectiveEyeTarget.value = false
    updateImplicitBodyAction()
    return
  }

  expressionTransitionMs = clampRange(directive.transition_ms, 150, 300) || 220
  proceduralMotion.setTransitionMs(expressionTransitionMs)
  if (directive.body_action) requestBodyAction(directive.body_action)

  const emotion = directive.emotion ?? {}
  if (typeof emotion.smile === 'number') setPersistentExpressionTarget('smile', emotion.smile)
  if (typeof emotion.sad === 'number') setPersistentExpressionTarget('sad', emotion.sad)
  if (typeof emotion.angry === 'number') setPersistentExpressionTarget('angry', emotion.angry)
  if (typeof emotion.surprised === 'number') setPersistentExpressionTarget('surprised', emotion.surprised)
  if (typeof emotion.browUp === 'number') setPersistentExpressionTarget('browUp', emotion.browUp)
  if (typeof emotion.browDown === 'number') setPersistentExpressionTarget('browDown', emotion.browDown)
  if (typeof emotion.relaxed === 'number') setPersistentExpressionTarget('relaxed', emotion.relaxed)

  for (const [name, value] of Object.entries(directive.expression ?? {})) {
    setPersistentExpressionTarget(name, clamp01(value))
  }

  hasDirectiveEyeTarget.value = Boolean(directive.eye_target)
  directiveEyeX.value = hasDirectiveEyeTarget.value ? clampRange(directive.eye_target?.x, -1, 1) : 0
  directiveEyeY.value = hasDirectiveEyeTarget.value ? clampRange(directive.eye_target?.y, -1, 1) : 0
}

function playLipSync(text: string) {
  if (!vrm) return
  avatarState.value = 'speaking'
  emit('lip-sync-state', 'playing')
  setExpression(inferExpression(text))
  if (/问题|为什么|如何|怎么|请说明|请解释|what|why|how|explain|describe/i.test(text)) {
    setPersistentExpressionTarget('browDown', 0.18)
  }
  lipSyncPlayer.play(text)
}

function stopLipSync() {
  lipSyncPlayer.stop()
  avatarState.value = 'idle'
  setExpression('neutral')
  updateImplicitBodyAction()
}

function setThinking() {
  avatarState.value = 'thinking'
  setExpression('neutral')
  setPersistentExpressionTarget('browDown', 0.24)
  requestBodyAction(props.motionDirective?.body_action ?? 'thinking_nod')
  lipSyncPlayer.stop()
}

function setIdle() {
  avatarState.value = 'idle'
  setExpression('relaxed', 0.3)
  if (props.motionDirective?.body_action) requestBodyAction(props.motionDirective.body_action)
  else updateImplicitBodyAction()
  lipSyncPlayer.stop()
}

// ═══ 拖拽 ═══
async function handleFileDrop(event: DragEvent) {
  event.preventDefault()
  showDropZone.value = false
  const file = event.dataTransfer?.files[0]
  if (!file) return
  if (!file.name.endsWith('.vrm')) {
    modelLoadError.value = '请拖入 .vrm 格式的模型文件'
    return
  }
  await loadModel(URL.createObjectURL(file))
}

function handleDragOver(event: DragEvent) {
  event.preventDefault()
  showDropZone.value = true
}

function handleDragLeave() { showDropZone.value = false }

// ═══ 监听 ═══
watch(() => props.isSpeaking, (speaking) => {
  if (!speaking) setTimeout(() => { if (!props.isSpeaking) stopLipSync() }, 500)
})

let lastStreamLength = 0
watch(() => props.streamingText, (text) => {
  if (!text || !props.isSpeaking || !vrm) return
  if (text.length > lastStreamLength) {
    const newChars = text.slice(lastStreamLength)
    lastStreamLength = text.length
    if (newChars.length > 0) {
      avatarState.value = 'speaking'
      setExpression(inferExpression(text))
      if (/问题|为什么|如何|怎么|请说明|请解释|what|why|how|explain|describe/i.test(text)) {
        setPersistentExpressionTarget('browDown', 0.16)
      }
      lipSyncPlayer.play(newChars)
    }
  }
})

watch(() => props.isSpeaking, (speaking) => { if (!speaking) lastStreamLength = 0 })

watch(() => props.avatarStateOverride, (state) => {
  if (state === 'thinking') setThinking()
  else if (state === 'idle') setIdle()
  else if (state === 'speaking') {
    avatarState.value = 'speaking'
    requestBodyAction(props.motionDirective?.body_action ?? 'arm_explain')
  }
  else if (!props.isSpeaking) setIdle()
})

watch(() => props.motionDirective, directive => applyMotionDirective(directive), { deep: true })

watch(() => props.modelUrl, async (url) => {
  if (url) await loadModel(url)
})

// ═══ 尺寸自适应（ResizeObserver） ═══
function handleResize() {
  if (!containerRef.value) return
  runtime.resize(containerRef.value)
}

// ═══ 生命周期 ═══
onMounted(async () => {
  await nextTick()
  initScene()

  // ResizeObserver 处理容器尺寸变化（比 window resize 更精准）
  if (containerRef.value) {
    resizeObserver = new ResizeObserver(() => handleResize())
    resizeObserver.observe(containerRef.value)
  }

  window.addEventListener('resize', handleResize)
  if (props.variant === 'floating-agent') window.addEventListener('mousemove', handleMouseMove)

  if (props.modelUrl) await loadModel(props.modelUrl)
})

onUnmounted(() => {
  if (animationFrameId) cancelAnimationFrame(animationFrameId)
  lipSyncPlayer.destroy()
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('mousemove', handleMouseMove)
  if (resizeObserver) resizeObserver.disconnect()
  runtime.dispose()
  vrm = null
})

defineExpose({ playLipSync, stopLipSync, setExpression, setThinking, setIdle, loadModel, applyMotionDirective, isModelLoaded })
</script>

<template>
  <div
    ref="containerRef"
    class="vrm-avatar"
    :class="`vrm-avatar--${variant}`"
    @drop="handleFileDrop"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
  >
    <canvas v-show="isModelLoaded" ref="canvasRef" class="vrm-canvas" />

    <div v-if="isModelLoading" class="vrm-overlay">
      <div class="loading-spinner" />
      <p class="loading-text">加载 3D 形象中...</p>
    </div>

    <div v-if="!isModelLoaded && !isModelLoading" class="vrm-placeholder">
      <div v-if="showDropZone" class="drop-zone active"><p>释放以加载 VRM 模型</p></div>
      <div v-else class="placeholder-content">
        <svg width="60" height="60" viewBox="0 0 80 80" class="placeholder-icon">
          <circle cx="40" cy="40" r="36" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.2" />
          <circle cx="40" cy="32" r="12" fill="currentColor" opacity="0.15" />
          <path d="M20 58 Q20 46 40 46 Q60 46 60 58" fill="currentColor" opacity="0.1" />
        </svg>
        <p class="placeholder-title">3D 虚拟形象</p>
        <p class="placeholder-hint">拖入 .vrm 模型文件</p>
      </div>
    </div>

    <div v-if="modelLoadError && !isModelLoaded" class="vrm-error">
      <p>{{ modelLoadError }}</p>
    </div>

    <div v-if="showStatus && isModelLoaded" class="vrm-status">
      <span class="status-dot" :class="avatarState" />
    </div>
  </div>
</template>

<style scoped>
.vrm-avatar {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: 12px;
  /* 真实的现代办公/面试室场景背景 */
  background: url('@/assets/images/interview-bg.png') center / cover no-repeat;
  box-shadow: inset 0 0 60px rgba(0,0,0,0.4);
}

.vrm-avatar--floating-agent {
  overflow: visible;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.vrm-avatar--floating-agent .vrm-overlay,
.vrm-avatar--floating-agent .vrm-placeholder {
  inset: auto 12px 18px;
  min-height: 96px;
  border-radius: 16px;
  background: rgba(15, 23, 42, 0.72);
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.18);
}

.vrm-canvas { width: 100% !important; height: 100% !important; display: block; }
.vrm-overlay {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  background: rgba(10, 15, 25, 0.7); 
  backdrop-filter: blur(8px);
  z-index: 2;
}
.loading-spinner {
  width: 32px; height: 32px;
  border: 3px solid rgba(255,255,255,0.1); border-top-color: #6366f1;
  border-radius: 50%; animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.loading-text { margin-top: 10px; font-size: 11px; color: rgba(255, 255, 255, 0.7); font-weight: 600; }
.vrm-placeholder {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center; z-index: 1;
}
.placeholder-content { display: flex; flex-direction: column; align-items: center; gap: 8px; color: rgba(255, 255, 255, 0.4); }
.placeholder-icon { opacity: 0.6; }
.placeholder-title { margin: 0; font-size: 14px; font-weight: 700; color: rgba(255, 255, 255, 0.7); }
.placeholder-hint { margin: 0; font-size: 11px; text-align: center; line-height: 1.5; color: rgba(255, 255, 255, 0.4); }
.drop-zone {
  position: absolute; inset: 6px;
  display: flex; align-items: center; justify-content: center;
  border: 2px dashed rgba(255,255,255,0.3); border-radius: 10px;
  background: rgba(0,0,0,0.3); color: #fff; font-size: 12px; font-weight: 600;
}
.vrm-error {
  position: absolute; bottom: 6px; left: 6px; right: 6px;
  padding: 6px 8px; border-radius: 6px; background: rgba(220, 38, 38, 0.85);
  color: #fff; font-size: 11px; text-align: center; z-index: 3; font-weight: 500;
}
.vrm-status { position: absolute; bottom: 6px; right: 6px; z-index: 2; }
.status-dot {
  display: block; width: 7px; height: 7px; border-radius: 50%;
  background: rgba(255,255,255,0.2); transition: all 0.3s;
}
.status-dot.speaking { background: #6366f1; box-shadow: 0 0 6px rgba(99,102,241,0.5); animation: pulse-dot 1.5s ease infinite; }
.status-dot.thinking { background: #f59e0b; animation: pulse-dot 1s ease infinite; }
@keyframes pulse-dot { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
</style>
