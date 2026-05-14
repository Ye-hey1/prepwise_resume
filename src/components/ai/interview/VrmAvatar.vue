<script setup lang="ts">
/**
 * VrmAvatar - 3D 虚拟形象组件（v3 重写版）
 * 核心策略：诊断 + 多路径覆盖 + 自然动画
 */
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, VRM, VRMUtils } from '@pixiv/three-vrm'
import type { VRMHumanBoneName } from '@pixiv/three-vrm-core'
import { LipSyncPlayer, inferExpression, type Viseme, type ExpressionPreset } from '@/utils/lipSync'
import { ALL_VRM_MODELS } from '@/config/vrmModels'

const props = withDefaults(defineProps<{
  modelUrl?: string
  isSpeaking?: boolean
  streamingText?: string
  avatarStateOverride?: 'idle' | 'speaking' | 'thinking' | null
}>(), {
  modelUrl: '',
  isSpeaking: false,
  streamingText: '',
  avatarStateOverride: null,
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

// 用于记录每个模型原本的静呼吸安全姿势，用来做动作参照绝对原点，防止直接写死绝对向量造成的毁灭级跨越倒退
const rawRestPoses = new Map<string, THREE.Quaternion>()

let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let renderer: THREE.WebGLRenderer
let vrm: VRM | null = null
let clock: THREE.Clock
let animationFrameId = 0
let currentExpression: ExpressionPreset = 'neutral'
let blinkTimer: ReturnType<typeof setInterval> | null = null
let resizeObserver: ResizeObserver | null = null

// 交互式鼠标追踪
const targetMouseX = ref(0)
const targetMouseY = ref(0)
let currentMouseX = 0
let currentMouseY = 0

function handleMouseMove(e: MouseEvent) {
  // 全局鼠标追踪，让虚拟形象的视线总是跟随用户鼠标，增加灵动交互性
  const x = (e.clientX / window.innerWidth) * 2 - 1
  const y = -(e.clientY / window.innerHeight) * 2 + 1
  targetMouseX.value = x
  targetMouseY.value = y
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

// ═══ 口型同步 ═══
const lipSyncPlayer = new LipSyncPlayer({
  onVisemeChange(viseme: Viseme | 'neutral', weight: number) {
    if (!vrm) return
    const expressionManager = vrm.expressionManager
    if (!expressionManager) return
    const visemes: (Viseme | 'neutral')[] = ['aa', 'ih', 'ou', 'ee', 'oh', 'neutral']
    for (const v of visemes) {
      expressionManager.setValue(v, v === viseme ? weight : 0)
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

  const container = containerRef.value
  const width = Math.max(container.clientWidth, 100)
  const height = Math.max(container.clientHeight, 100)

  scene = new THREE.Scene()

  camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 25)
  // 完美的人像构图：让脸部处于画面中央偏上，视角平视略带一点点俯视
  camera.position.set(0, 1.35, 1.0)
  camera.lookAt(0, 1.25, 0)

  renderer = new THREE.WebGLRenderer({
    canvas: canvasRef.value,
    alpha: true,
    antialias: true,
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(width, height)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.1

  // 灵动立体灯光大礼包（适配全新明亮交互式背景）
  // 1. 全局环境光调优，稍微提亮基础色
  scene.add(new THREE.AmbientLight(0xffffff, 0.7))

  // 2. 主光源：模拟柔和的顶斜光照亮面部
  const mainLight = new THREE.DirectionalLight(0xffffff, 1.0)
  mainLight.position.set(1, 2, 2)
  scene.add(mainLight)

  // 3. 轮廓光：让质感更通透
  const rimLightLeft = new THREE.DirectionalLight(0xe0e7ff, 0.8)
  rimLightLeft.position.set(-2, 1, -2)
  scene.add(rimLightLeft)

  // 4. 正前下方微微补光（防黑下巴与显示器反光模拟）
  const fillLight = new THREE.PointLight(0xfff5e6, 0.6, 5)
  fillLight.position.set(0, 0, 1)
  scene.add(fillLight)

  clock = new THREE.Clock()
  animate()
}

// ═══ 欧拉角转四元数辅助 ═══
const _euler = new THREE.Euler()
const _quat = new THREE.Quaternion()
function eulerToQuat(x: number, y: number, z: number): THREE.Quaternion {
  _euler.set(x, y, z)
  _quat.setFromEuler(_euler)
  return _quat.clone()
}

// ═══ 计算当前帧各骨骼目标四元数 ═══
interface PoseTargets {
  [key: string]: THREE.Quaternion | null
}

function computePoseTargets(t: number, state: 'idle' | 'speaking' | 'thinking', mouseX: number, mouseY: number): PoseTargets {
  const targets: PoseTargets = {}

  // ─── 头部与脖子（灵动鼠标跟随交互）───
  const headLookX = mouseY * 0.3
  const headLookY = -mouseX * 0.5
  
  if (state === 'idle') {
    targets.head = eulerToQuat(headLookX + Math.sin(t * 0.5) * 0.03, headLookY + Math.sin(t * 0.7) * 0.05, Math.sin(t * 0.3) * 0.02)
    targets.neck = eulerToQuat(headLookX * 0.4, headLookY * 0.4, 0)
  } else if (state === 'speaking') {
    targets.head = eulerToQuat(headLookX + Math.sin(t * 2.8) * 0.06, headLookY + Math.sin(t * 2.2) * 0.09, Math.sin(t * 1.5) * 0.03)
    targets.neck = eulerToQuat(headLookX * 0.4, headLookY * 0.4, 0)
  } else if (state === 'thinking') {
    targets.head = eulerToQuat(headLookX - 0.08 + Math.sin(t * 0.25) * 0.015, headLookY + 0.12 + Math.sin(t * 0.35) * 0.025, 0.1)
    targets.neck = eulerToQuat(headLookX * 0.4 - 0.05, headLookY * 0.4 + 0.05, 0)
  }

  // ─── 脊椎呼吸 ───
  targets.spine = eulerToQuat(Math.sin(t * 1.2) * 0.012, 0, 0)

  // ─── 胸部 ───
  if (state === 'speaking') {
    targets.chest = eulerToQuat(Math.sin(t * 2.0) * 0.02, Math.sin(t * 1.6) * 0.015, 0)
  }

  // ─── 肩膀微放下 ───
  if (state === 'idle') {
    targets.leftShoulder = eulerToQuat(0, 0, 0.1 + Math.sin(t * 0.4) * 0.01)
    targets.rightShoulder = eulerToQuat(0, 0, -0.1 - Math.sin(t * 0.4 + 1) * 0.01)
  } else if (state === 'speaking') {
    targets.leftShoulder = eulerToQuat(0, 0, 0.1 + Math.sin(t * 0.8) * 0.01)
    targets.rightShoulder = eulerToQuat(0, 0, -0.1 - Math.sin(t * 1.0) * 0.01)
  } else if (state === 'thinking') {
    targets.leftShoulder = eulerToQuat(0, 0, 0.1)
    targets.rightShoulder = eulerToQuat(0, 0, -0.1)
  }

  // ====== 自然原点姿态补偿 ======
  // 部分模型（如男候选人）的骨骼局部轴与标准模型相反，需要翻转补偿
  const flipped = useFlippedBones.value
  const upperBaseX = flipped ? -0.1 : 0.1;
  const lUpperBaseZ = flipped ? -1.25 : 1.25;
  const rUpperBaseZ = flipped ? 1.25 : -1.25;

  // ─── 左上臂 ───
  if (state === 'idle') {
    // 待机时：平缓优雅的呼吸摆动
    targets.leftUpperArm = eulerToQuat(upperBaseX, 0, lUpperBaseZ + Math.sin(t * 0.8) * 0.02)
  } else if (state === 'speaking') {
    // 说话时：更活跃的倾听与微张开动作！配合手腕做解释动作。
    targets.leftUpperArm = eulerToQuat(upperBaseX + Math.sin(t * 2.0) * 0.08, 0, lUpperBaseZ - 0.1 + Math.sin(t * 1.5) * 0.05)
  } else if (state === 'thinking') {
    targets.leftUpperArm = eulerToQuat(upperBaseX, 0, lUpperBaseZ)
  }

  // ─── 右上臂 ───
  if (state === 'idle') {
    //左右稍有错频，使得看起来更像活人
    targets.rightUpperArm = eulerToQuat(upperBaseX, 0, rUpperBaseZ - Math.sin(t * 0.9) * 0.02)
  } else if (state === 'speaking') {
    targets.rightUpperArm = eulerToQuat(upperBaseX + Math.sin(t * 1.7) * 0.05, 0, rUpperBaseZ + 0.05 - Math.sin(t * 1.3) * 0.03)
  } else if (state === 'thinking') {
    targets.rightUpperArm = eulerToQuat(upperBaseX, 0, rUpperBaseZ)
  }

  // ─── 左前臂（模拟在桌前双手操作或交握的姿态） ───
  // 从 T pose 往下掰弯小臂放到电脑桌位置，角度微微向上抬
  const lowerBaseX = flipped ? 1.5 : -1.5;
  const lLowerBaseZ = flipped ? -0.4 : 0.4;
  const rLowerBaseZ = flipped ? 0.4 : -0.4;

  if (state === 'idle') {
    // 待机时仿佛手指正放在鼠标和键盘上微动
    targets.leftLowerArm = eulerToQuat(lowerBaseX, 0, lLowerBaseZ + Math.sin(t * 1.2) * 0.02)
  } else if (state === 'speaking') {
    // 讲话时左手积极参与比划
    targets.leftLowerArm = eulerToQuat(lowerBaseX + 0.3 + Math.sin(t * 2.5) * 0.25, 0, lLowerBaseZ)
  } else if (state === 'thinking') {
    targets.leftLowerArm = eulerToQuat(lowerBaseX, 0, lLowerBaseZ)
  }

  // ─── 右前臂 ───
  if (state === 'idle') {
    targets.rightLowerArm = eulerToQuat(lowerBaseX, 0, rLowerBaseZ + Math.cos(t * 1.5) * 0.02)
  } else if (state === 'speaking') {
    // 讲话时右手微动附和（避免双手同时狂舞）
    targets.rightLowerArm = eulerToQuat(lowerBaseX + 0.1 + Math.sin(t * 1.9) * 0.1, 0, rLowerBaseZ)
  } else if (state === 'thinking') {
    targets.rightLowerArm = eulerToQuat(lowerBaseX, 0, rLowerBaseZ)
  }

  return targets
}

// ═══ （废弃 forceSetRawBone） ═══
// ═══ 渲染循环 ═══
let diagFrameCount = 0
function animate() {
  animationFrameId = requestAnimationFrame(animate)
  const delta = clock.getDelta()
  const t = clock.getElapsedTime()

  if (!vrm) {
    if (renderer) renderer.render(scene, camera)
    return
  }

  const state = avatarState.value

  // ═══ 诊断：前 5 帧打印骨骼状态 ═══
  diagFrameCount++
  if (diagFrameCount <= 5) {
    const lArm = vrm.humanoid.getNormalizedBoneNode('leftUpperArm')
    const lArmRaw = vrm.humanoid.getRawBoneNode('leftUpperArm')
    console.log(`[帧${diagFrameCount}] state=${state}`, {
      normLeftArm: lArm ? `rot=(${lArm.rotation.x.toFixed(3)},${lArm.rotation.y.toFixed(3)},${lArm.rotation.z.toFixed(3)})` : 'NULL',
      rawLeftArm: lArmRaw ? `rot=(${lArmRaw.rotation.x.toFixed(3)},${lArmRaw.rotation.y.toFixed(3)},${lArmRaw.rotation.z.toFixed(3)})` : 'NULL',
    })
  }

  // ═══ 平滑更新鼠标追踪参数 ═══
  currentMouseX += (targetMouseX.value - currentMouseX) * 0.08
  currentMouseY += (targetMouseY.value - currentMouseY) * 0.08

  // ═══ 计算本帧目标姿态 ═══
  const targets = computePoseTargets(t, state, currentMouseX, currentMouseY)

  // ═══ VRM 引擎更新（注意：它会用 Normalized 的设定覆盖 RawBone！所以相对控制一定要在这之后！） ═══
  vrm.update(delta)

  // ═══ 增量补偿法：必须在原生 update 过后劫持绝对控制，施加自然摆动 ═══
  for (const [boneName, offsetQuat] of Object.entries(targets)) {
    if (!offsetQuat) continue
    const rawBone = vrm.humanoid.getRawBoneNode(boneName as VRMHumanBoneName)
    const baseQuat = rawRestPoses.get(boneName)
    if (rawBone && baseQuat) {
      // 提取核心坐骨基准原点，通过 multiply() 叠加自然下坠弯曲和灵动呼吸的弧度差
      const finalQuat = new THREE.Quaternion().copy(baseQuat).multiply(offsetQuat)
      rawBone.quaternion.copy(finalQuat)
    }
  }



  // ═══ 诊断：覆盖后检查 raw bone ═══
  if (diagFrameCount >= 3 && diagFrameCount <= 6) {
    const lArmRaw = vrm.humanoid.getRawBoneNode('leftUpperArm')
    if (lArmRaw) {
      console.log(`[帧${diagFrameCount} 覆盖后] rawLeftArm quaternion: (${lArmRaw.quaternion.x.toFixed(3)}, ${lArmRaw.quaternion.y.toFixed(3)}, ${lArmRaw.quaternion.z.toFixed(3)}, ${lArmRaw.quaternion.w.toFixed(3)})`)
    }
  }

  renderer.render(scene, camera)
}

// ═══ 加载 VRM 模型 ═══
async function loadModel(url: string) {
  if (!url || isModelLoading.value) return

  isModelLoading.value = true
  modelLoadError.value = ''
  boneDiagLogged = false
  diagFrameCount = 0

  try {
    const loader = new GLTFLoader()
    loader.register((parser) => new VRMLoaderPlugin(parser))

    // URL 编码处理中文文件名
    const encodedUrl = encodeURI(url)
    console.log('[VRM] 加载模型:', encodedUrl)
    const gltf = await loader.loadAsync(encodedUrl)
    const loadedVrm = gltf.userData.vrm as VRM | undefined

    if (!loadedVrm) throw new Error('文件不是有效的 VRM 模型')

    // 确定模型信息（用于场景旋转和骨骼补偿判断）
    const modelInfo = ALL_VRM_MODELS.find(m => encodeURI(m.url) === encodedUrl || m.url === url)
    useFlippedBones.value = modelInfo?.flippedSkeleton === true

    // 清理旧模型
    if (vrm) {
      scene.remove(vrm.scene)
      VRMUtils.deepDispose(vrm.scene)
    }

    VRMUtils.removeUnnecessaryVertices(gltf.scene)
    VRMUtils.removeUnnecessaryJoints(gltf.scene)

    // 自动缩放
    const box = new THREE.Box3().setFromObject(loadedVrm.scene)
    const size = box.getSize(new THREE.Vector3())
    const scale = 1.4 / size.y
    loadedVrm.scene.scale.setScalar(scale)

    // 场景旋转：根据模型配置决定是否需要 180° 翻转
    // 默认需要翻转（needsSceneFlip 未设置或为 true），部分模型（男候选人）不需要
    const needsFlip = modelInfo?.needsSceneFlip !== false
    loadedVrm.scene.rotation.y = needsFlip ? Math.PI : 0

    // 确保归零：让人物站在原点，而不是被强行下移，保证镜头构图不出画
    loadedVrm.scene.position.y = 0

    scene.add(loadedVrm.scene)
    
    // 我们必须首先让核心模型进行一次原位骨骼装载和校准，截取其安全的初始锚定
    loadedVrm.update(0)
    rawRestPoses.clear()
    const trackBones: VRMHumanBoneName[] = ['leftShoulder', 'rightShoulder', 'leftUpperArm', 'rightUpperArm', 'leftLowerArm', 'rightLowerArm', 'chest', 'spine']
    for (const b of trackBones) {
      const raw = loadedVrm.humanoid.getRawBoneNode(b)
      if (raw) {
        rawRestPoses.set(b, new THREE.Quaternion().copy(raw.quaternion))
      }
    }

    vrm = loadedVrm
    isModelLoaded.value = true
    emit('model-loaded')

    // 打印骨骼诊断
    logBoneDiag()

    startBlinkAnimation()
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '模型加载失败'
    modelLoadError.value = message
    isModelLoaded.value = false
    emit('model-error', message)
  } finally {
    isModelLoading.value = false
  }
}

// ═══ 眨眼 ═══
function startBlinkAnimation() {
  if (blinkTimer) clearInterval(blinkTimer)
  blinkTimer = setInterval(() => {
    if (!vrm) return
    const expressionManager = vrm.expressionManager
    if (!expressionManager) return
    expressionManager.setValue('blink', 1)
    setTimeout(() => {
      const activeExpressionManager = vrm?.expressionManager
      if (activeExpressionManager) activeExpressionManager.setValue('blink', 0)
    }, 150)
  }, 3000 + Math.random() * 2000)
}

// ═══ 表情控制 ═══
function setExpression(preset: ExpressionPreset, weight = 1.0) {
  if (!vrm) return
  const expressionManager = vrm.expressionManager
  if (!expressionManager) return
  for (const p of ['happy', 'angry', 'sad', 'surprised', 'relaxed'] as ExpressionPreset[]) {
    expressionManager.setValue(p, p === preset ? weight : 0)
  }
  currentExpression = preset
}

function playLipSync(text: string) {
  if (!vrm) return
  avatarState.value = 'speaking'
  emit('lip-sync-state', 'playing')
  setExpression(inferExpression(text))
  lipSyncPlayer.play(text)
}

function stopLipSync() {
  lipSyncPlayer.stop()
  avatarState.value = 'idle'
  setExpression('neutral')
}

function setThinking() {
  avatarState.value = 'thinking'
  setExpression('neutral')
  lipSyncPlayer.stop()
}

function setIdle() {
  avatarState.value = 'idle'
  setExpression('relaxed', 0.3)
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
      lipSyncPlayer.play(newChars)
    }
  }
})

watch(() => props.isSpeaking, (speaking) => { if (!speaking) lastStreamLength = 0 })

watch(() => props.avatarStateOverride, (state) => {
  if (!state) return
  if (state === 'thinking') setThinking()
  else if (state === 'idle') setIdle()
})

// ═══ 尺寸自适应（ResizeObserver） ═══
function handleResize() {
  if (!containerRef.value || !renderer || !camera) return
  const w = Math.max(containerRef.value.clientWidth, 50)
  const h = Math.max(containerRef.value.clientHeight, 50)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h)
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
  window.addEventListener('mousemove', handleMouseMove)

  if (props.modelUrl) await loadModel(props.modelUrl)
})

onUnmounted(() => {
  if (animationFrameId) cancelAnimationFrame(animationFrameId)
  if (blinkTimer) clearInterval(blinkTimer)
  lipSyncPlayer.destroy()
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('mousemove', handleMouseMove)
  if (resizeObserver) resizeObserver.disconnect()
  if (vrm) { VRMUtils.deepDispose(vrm.scene); vrm = null }
  if (renderer) renderer.dispose()
})

defineExpose({ playLipSync, stopLipSync, setExpression, setThinking, setIdle, loadModel, isModelLoaded })
</script>

<template>
  <div ref="containerRef" class="vrm-avatar" @drop="handleFileDrop" @dragover="handleDragOver" @dragleave="handleDragLeave">
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

    <div v-if="isModelLoaded" class="vrm-status">
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
