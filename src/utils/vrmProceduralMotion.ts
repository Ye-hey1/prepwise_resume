import * as THREE from 'three'
import type { VRMHumanBoneName } from '@pixiv/three-vrm-core'

export type VrmBodyAction =
  | 'idle'
  | 'thinking_nod'
  | 'soft_shake'
  | 'relaxed_wave'
  | 'gentle_pace'
  | 'folded_arms'
  | 'presenting_gesture'
  | 'arm_explain'
export type VrmAvatarRuntimeState = 'idle' | 'speaking' | 'thinking'

export interface VrmProceduralMotionInput {
  delta: number
  elapsed: number
  avatarState: VrmAvatarRuntimeState
  lookTargetX: number
  lookTargetY: number
  variant?: 'interview' | 'floating-agent'
  flippedBones?: boolean
}

export interface VrmProceduralMotionFrame {
  /** Additive local rotations relative to the VRM normalized humanoid rest pose. */
  boneOffsets: Map<VRMHumanBoneName, THREE.Quaternion>
  /** Smoothed gaze target in normalized screen-space coordinates. */
  eyeLook: { x: number; y: number }
  /** Scene-level root drift applied after pose generation. */
  rootOffset: THREE.Vector3
}

interface OscillatorChannel {
  period: number
  phase: number
  amplitude: number
  secondaryPeriod: number
  secondaryPhase: number
  secondaryAmplitude: number
}

interface SpringVec3 {
  value: THREE.Vector3
  velocity: THREE.Vector3
}

interface SpringScalar {
  value: number
  velocity: number
}

interface WanderVec3 {
  current: SpringVec3
  target: THREE.Vector3
  nextAt: number
  response: number
}

type PoseLayer = Map<VRMHumanBoneName, THREE.Quaternion>
type HandSide = 'left' | 'right'

const DEG = Math.PI / 180
const TAU = Math.PI * 2
const FLOATING_HAND_MICRO_SCALE = 0.46
const FLOATING_PALM_FOREARM_YAW = 0.6 * DEG
const FLOATING_PALM_FOREARM_ROLL = 0.8 * DEG
const FLOATING_PALM_HAND_PITCH = 1.6 * DEG
const FLOATING_PALM_HAND_YAW = 8 * DEG
const FLOATING_PALM_HAND_ROLL = 2.6 * DEG
const FLOATING_RELAXED_FINGER_CURL = 0.36 * DEG

export const STANDARD_VRM_PROCEDURAL_BONES: readonly VRMHumanBoneName[] = [
  'hips',
  'spine',
  'chest',
  'upperChest',
  'neck',
  'head',
  'leftShoulder',
  'leftUpperArm',
  'leftLowerArm',
  'leftHand',
  'rightShoulder',
  'rightUpperArm',
  'rightLowerArm',
  'rightHand',
  'leftUpperLeg',
  'leftLowerLeg',
  'leftFoot',
  'leftToes',
  'rightUpperLeg',
  'rightLowerLeg',
  'rightFoot',
  'rightToes',
  'leftThumbMetacarpal',
  'leftThumbProximal',
  'leftThumbDistal',
  'leftIndexProximal',
  'leftIndexIntermediate',
  'leftIndexDistal',
  'leftMiddleProximal',
  'leftMiddleIntermediate',
  'leftMiddleDistal',
  'leftRingProximal',
  'leftRingIntermediate',
  'leftRingDistal',
  'leftLittleProximal',
  'leftLittleIntermediate',
  'leftLittleDistal',
  'rightThumbMetacarpal',
  'rightThumbProximal',
  'rightThumbDistal',
  'rightIndexProximal',
  'rightIndexIntermediate',
  'rightIndexDistal',
  'rightMiddleProximal',
  'rightMiddleIntermediate',
  'rightMiddleDistal',
  'rightRingProximal',
  'rightRingIntermediate',
  'rightRingDistal',
  'rightLittleProximal',
  'rightLittleIntermediate',
  'rightLittleDistal',
]

const FINGER_PROXIMAL_BONES: readonly VRMHumanBoneName[] = [
  'leftThumbProximal',
  'leftIndexProximal',
  'leftMiddleProximal',
  'leftRingProximal',
  'leftLittleProximal',
  'rightThumbProximal',
  'rightIndexProximal',
  'rightMiddleProximal',
  'rightRingProximal',
  'rightLittleProximal',
]

const FINGER_INTERMEDIATE_BONES: readonly VRMHumanBoneName[] = [
  'leftIndexIntermediate',
  'leftMiddleIntermediate',
  'leftRingIntermediate',
  'leftLittleIntermediate',
  'rightIndexIntermediate',
  'rightMiddleIntermediate',
  'rightRingIntermediate',
  'rightLittleIntermediate',
]

interface FingerMicroConfig {
  bone: VRMHumanBoneName
  amplitude: number
  sharedWeight: number
  response: number
}

interface FingerMicroState extends FingerMicroConfig {
  spring: SpringScalar
  target: number
  nextAt: number
  phase: number
}

interface HandMicroSideState {
  upperArm: SpringVec3
  forearm: SpringVec3
  wrist: SpringVec3
  sharedFingerCurl: SpringScalar
  sharedFingerTarget: number
  nextSharedFingerAt: number
  upperRelax: OscillatorChannel
  forearmRelax: OscillatorChannel
  wristFlip: OscillatorChannel
  wristTwist: OscillatorChannel
  fingerFlutter: OscillatorChannel
  drift: OscillatorChannel
  phaseOffset: number
  fingerStates: FingerMicroState[]
}

const LEFT_FINGER_MICRO_CONFIGS: readonly FingerMicroConfig[] = [
  { bone: 'leftThumbMetacarpal', amplitude: 0.32 * DEG, sharedWeight: 0.35, response: 5.2 },
  { bone: 'leftThumbProximal', amplitude: 0.45 * DEG, sharedWeight: 0.42, response: 5.0 },
  { bone: 'leftThumbDistal', amplitude: 0.32 * DEG, sharedWeight: 0.3, response: 4.8 },
  { bone: 'leftIndexProximal', amplitude: 0.72 * DEG, sharedWeight: 0.72, response: 4.6 },
  { bone: 'leftIndexIntermediate', amplitude: 0.58 * DEG, sharedWeight: 0.55, response: 4.4 },
  { bone: 'leftIndexDistal', amplitude: 0.38 * DEG, sharedWeight: 0.32, response: 4.2 },
  { bone: 'leftMiddleProximal', amplitude: 0.76 * DEG, sharedWeight: 0.78, response: 4.5 },
  { bone: 'leftMiddleIntermediate', amplitude: 0.6 * DEG, sharedWeight: 0.58, response: 4.3 },
  { bone: 'leftMiddleDistal', amplitude: 0.4 * DEG, sharedWeight: 0.34, response: 4.1 },
  { bone: 'leftRingProximal', amplitude: 0.68 * DEG, sharedWeight: 0.64, response: 4.35 },
  { bone: 'leftRingIntermediate', amplitude: 0.54 * DEG, sharedWeight: 0.48, response: 4.15 },
  { bone: 'leftRingDistal', amplitude: 0.36 * DEG, sharedWeight: 0.3, response: 4.0 },
  { bone: 'leftLittleProximal', amplitude: 0.6 * DEG, sharedWeight: 0.52, response: 4.2 },
  { bone: 'leftLittleIntermediate', amplitude: 0.48 * DEG, sharedWeight: 0.42, response: 4.0 },
  { bone: 'leftLittleDistal', amplitude: 0.32 * DEG, sharedWeight: 0.26, response: 3.9 },
]

const RIGHT_FINGER_MICRO_CONFIGS: readonly FingerMicroConfig[] = [
  { bone: 'rightThumbMetacarpal', amplitude: 0.3 * DEG, sharedWeight: 0.35, response: 5.0 },
  { bone: 'rightThumbProximal', amplitude: 0.42 * DEG, sharedWeight: 0.42, response: 4.85 },
  { bone: 'rightThumbDistal', amplitude: 0.3 * DEG, sharedWeight: 0.3, response: 4.65 },
  { bone: 'rightIndexProximal', amplitude: 0.68 * DEG, sharedWeight: 0.68, response: 4.5 },
  { bone: 'rightIndexIntermediate', amplitude: 0.54 * DEG, sharedWeight: 0.52, response: 4.3 },
  { bone: 'rightIndexDistal', amplitude: 0.36 * DEG, sharedWeight: 0.3, response: 4.1 },
  { bone: 'rightMiddleProximal', amplitude: 0.72 * DEG, sharedWeight: 0.74, response: 4.4 },
  { bone: 'rightMiddleIntermediate', amplitude: 0.58 * DEG, sharedWeight: 0.55, response: 4.2 },
  { bone: 'rightMiddleDistal', amplitude: 0.38 * DEG, sharedWeight: 0.32, response: 4.0 },
  { bone: 'rightRingProximal', amplitude: 0.64 * DEG, sharedWeight: 0.6, response: 4.25 },
  { bone: 'rightRingIntermediate', amplitude: 0.52 * DEG, sharedWeight: 0.46, response: 4.05 },
  { bone: 'rightRingDistal', amplitude: 0.34 * DEG, sharedWeight: 0.28, response: 3.95 },
  { bone: 'rightLittleProximal', amplitude: 0.56 * DEG, sharedWeight: 0.48, response: 4.1 },
  { bone: 'rightLittleIntermediate', amplitude: 0.44 * DEG, sharedWeight: 0.38, response: 3.95 },
  { bone: 'rightLittleDistal', amplitude: 0.3 * DEG, sharedWeight: 0.24, response: 3.85 },
]

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0))
}

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function easeInOut(value: number): number {
  const t = clamp(value, 0, 1)
  return t * t * (3 - 2 * t)
}

function oscillatorValue(channel: OscillatorChannel, elapsed: number): number {
  const primary = Math.sin((elapsed / channel.period) * TAU + channel.phase) * channel.amplitude
  const secondary = Math.sin((elapsed / channel.secondaryPeriod) * TAU + channel.secondaryPhase) * channel.secondaryAmplitude
  return primary + secondary
}

function createOscillator(periodMin: number, periodMax: number, ampMin: number, ampMax: number): OscillatorChannel {
  const period = randomRange(periodMin, periodMax)
  return {
    period,
    phase: randomRange(0, TAU),
    amplitude: randomRange(ampMin, ampMax),
    secondaryPeriod: period * randomRange(1.7, 2.8),
    secondaryPhase: randomRange(0, TAU),
    secondaryAmplitude: randomRange(ampMin, ampMax) * 0.35,
  }
}

function createSpringVec3(): SpringVec3 {
  return {
    value: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
  }
}

function createSpringScalar(): SpringScalar {
  return {
    value: 0,
    velocity: 0,
  }
}

function createWander(response: number): WanderVec3 {
  return {
    current: createSpringVec3(),
    target: new THREE.Vector3(),
    nextAt: 0,
    response,
  }
}

function resetSpring(spring: SpringVec3) {
  spring.value.set(0, 0, 0)
  spring.velocity.set(0, 0, 0)
}

function resetScalarSpring(spring: SpringScalar) {
  spring.value = 0
  spring.velocity = 0
}

function springTo(spring: SpringVec3, target: THREE.Vector3, delta: number, response: number, damping = 0.86) {
  const dt = clamp(delta, 0, 1 / 30)
  const omega = Math.max(0.001, response)
  const displacement = target.clone().sub(spring.value)
  const acceleration = displacement
    .multiplyScalar(omega * omega)
    .addScaledVector(spring.velocity, -2 * damping * omega)

  spring.velocity.addScaledVector(acceleration, dt)
  spring.value.addScaledVector(spring.velocity, dt)
}

function springScalarTo(spring: SpringScalar, target: number, delta: number, response: number, damping = 0.86) {
  const dt = clamp(delta, 0, 1 / 30)
  const omega = Math.max(0.001, response)
  const displacement = target - spring.value
  const acceleration = displacement * omega * omega - 2 * damping * omega * spring.velocity

  spring.velocity += acceleration * dt
  spring.value += spring.velocity * dt
}

function updateWander(wander: WanderVec3, elapsed: number, delta: number, maxPitch: number, maxYaw: number, maxRoll: number) {
  if (elapsed >= wander.nextAt) {
    wander.target.set(
      randomRange(-maxPitch, maxPitch),
      randomRange(-maxYaw, maxYaw),
      randomRange(-maxRoll, maxRoll),
    )
    wander.nextAt = elapsed + randomRange(1.4, 4.6)
  }
  springTo(wander.current, wander.target, delta, wander.response, 0.92)
}

function quatFromEuler(pitch: number, yaw: number, roll: number): THREE.Quaternion {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, roll, 'XYZ'))
}

function addPose(layer: PoseLayer, bone: VRMHumanBoneName, pitch: number, yaw: number, roll: number) {
  const offset = quatFromEuler(pitch, yaw, roll)
  const existing = layer.get(bone)
  layer.set(bone, existing ? existing.clone().multiply(offset) : offset)
}

function addFloatingPalmInwardPose(layer: PoseLayer, sideSign: number, intensity = 1) {
  const amount = clamp(intensity, 0, 1)
  const forearmYaw = FLOATING_PALM_FOREARM_YAW * amount
  const forearmRoll = FLOATING_PALM_FOREARM_ROLL * amount
  const handPitch = FLOATING_PALM_HAND_PITCH * amount
  const handYaw = FLOATING_PALM_HAND_YAW * amount
  const handRoll = FLOATING_PALM_HAND_ROLL * amount
  const fingerCurl = FLOATING_RELAXED_FINGER_CURL * amount

  addPose(layer, 'leftLowerArm', 0, -sideSign * forearmYaw, sideSign * forearmRoll)
  addPose(layer, 'rightLowerArm', 0, sideSign * forearmYaw, -sideSign * forearmRoll)
  addPose(layer, 'leftHand', handPitch, -sideSign * handYaw, sideSign * handRoll)
  addPose(layer, 'rightHand', handPitch, sideSign * handYaw, -sideSign * handRoll)
  FINGER_PROXIMAL_BONES.forEach((bone) => addPose(layer, bone, fingerCurl, 0, 0))
  FINGER_INTERMEDIATE_BONES.forEach((bone) => addPose(layer, bone, fingerCurl * 0.72, 0, 0))
}

function mergeLayer(target: PoseLayer, layer: PoseLayer) {
  for (const [bone, offset] of layer) {
    const existing = target.get(bone)
    target.set(bone, existing ? existing.clone().multiply(offset) : offset.clone())
  }
}

function blendLayers(from: PoseLayer, to: PoseLayer, weight: number): PoseLayer {
  const blended: PoseLayer = new Map()
  const bones = new Set<VRMHumanBoneName>([...from.keys(), ...to.keys()])
  const identity = new THREE.Quaternion()
  const t = easeInOut(weight)
  for (const bone of bones) {
    const a = from.get(bone) ?? identity
    const b = to.get(bone) ?? identity
    blended.set(bone, a.clone().slerp(b, t))
  }
  return blended
}

function composeLayers(layers: readonly PoseLayer[]): PoseLayer {
  const composed: PoseLayer = new Map()
  for (const layer of layers) mergeLayer(composed, layer)
  return composed
}

function createFingerMicroStates(side: HandSide): FingerMicroState[] {
  const configs = side === 'left' ? LEFT_FINGER_MICRO_CONFIGS : RIGHT_FINGER_MICRO_CONFIGS
  return configs.map(config => ({
    ...config,
    spring: createSpringScalar(),
    target: 0,
    nextAt: randomRange(0.15, 2.4),
    phase: randomRange(0, TAU),
  }))
}

function createHandMicroSide(side: HandSide): HandMicroSideState {
  const sidePhase = side === 'left' ? randomRange(0, TAU) : randomRange(Math.PI * 0.55, Math.PI * 1.45)
  return {
    upperArm: createSpringVec3(),
    forearm: createSpringVec3(),
    wrist: createSpringVec3(),
    sharedFingerCurl: createSpringScalar(),
    sharedFingerTarget: 0,
    nextSharedFingerAt: randomRange(0.4, 2.8),
    upperRelax: createOscillator(7.2, 12.5, 0.1 * DEG, 0.34 * DEG),
    forearmRelax: createOscillator(5.8, 10.4, 0.12 * DEG, 0.42 * DEG),
    wristFlip: createOscillator(3.4, 6.6, 0.16 * DEG, 0.56 * DEG),
    wristTwist: createOscillator(4.2, 8.2, 0.18 * DEG, 0.72 * DEG),
    fingerFlutter: createOscillator(1.1, 2.8, 0.05 * DEG, 0.16 * DEG),
    drift: createOscillator(8.5, 14.5, 0.08 * DEG, 0.26 * DEG),
    phaseOffset: sidePhase,
    fingerStates: createFingerMicroStates(side),
  }
}

function blendVectors(from: THREE.Vector3, to: THREE.Vector3, weight: number): THREE.Vector3 {
  return from.clone().lerp(to, easeInOut(weight))
}

function vectorFromScreenLook(x: number, y: number): THREE.Vector3 {
  return new THREE.Vector3(clamp(x, -1, 1), clamp(y, -1, 1), 0)
}

/**
 * VRM full-body procedural motion controller.
 *
 * The controller emits additive local pose intent. Consumers decide how to apply
 * that intent to a loaded VRM. The preferred path is `VRMHumanoid.setNormalizedPose`
 * so gestures transfer through three-vrm's normalized humanoid rig instead of
 * mutating imported raw bones directly.
 */
export class VrmProceduralMotionController {
  private fromAction: VrmBodyAction = 'idle'
  private toAction: VrmBodyAction = 'idle'
  private actionBlend = 1
  private transitionSec = 0.22

  private breathPitch = createOscillator(3.2, 5.2, 0.45 * DEG, 0.85 * DEG)
  private breathRoll = createOscillator(3.8, 5.8, 0.08 * DEG, 0.24 * DEG)
  private balanceYaw = createOscillator(5.8, 9.6, 0.16 * DEG, 0.5 * DEG)
  private balanceRoll = createOscillator(4.8, 8.4, 0.12 * DEG, 0.42 * DEG)
  private headNoisePitch = createOscillator(6.5, 11.5, 0.22 * DEG, 0.65 * DEG)
  private headNoiseYaw = createOscillator(5.4, 10.4, 0.18 * DEG, 0.8 * DEG)

  private hipsLag = createSpringVec3()
  private spineLag = createSpringVec3()
  private chestLag = createSpringVec3()
  private upperChestLag = createSpringVec3()
  private neckLag = createSpringVec3()
  private headLag = createSpringVec3()
  private torsoLookLag = createSpringVec3()
  private chestLookLag = createSpringVec3()
  private neckLookLag = createSpringVec3()
  private headLookLag = createSpringVec3()
  private eyeLookLag = createSpringVec3()

  private hipsWander = createWander(1.8)
  private chestWander = createWander(1.65)
  private headWander = createWander(1.45)
  private leftHandMicro = createHandMicroSide('left')
  private rightHandMicro = createHandMicroSide('right')

  reseed() {
    this.breathPitch = createOscillator(3.2, 5.2, 0.45 * DEG, 0.85 * DEG)
    this.breathRoll = createOscillator(3.8, 5.8, 0.08 * DEG, 0.24 * DEG)
    this.balanceYaw = createOscillator(5.8, 9.6, 0.16 * DEG, 0.5 * DEG)
    this.balanceRoll = createOscillator(4.8, 8.4, 0.12 * DEG, 0.42 * DEG)
    this.headNoisePitch = createOscillator(6.5, 11.5, 0.22 * DEG, 0.65 * DEG)
    this.headNoiseYaw = createOscillator(5.4, 10.4, 0.18 * DEG, 0.8 * DEG)
    this.hipsWander.nextAt = 0
    this.chestWander.nextAt = 0
    this.headWander.nextAt = 0
    this.leftHandMicro = createHandMicroSide('left')
    this.rightHandMicro = createHandMicroSide('right')
  }

  reset() {
    for (const spring of [
      this.hipsLag,
      this.spineLag,
      this.chestLag,
      this.upperChestLag,
      this.neckLag,
      this.headLag,
      this.torsoLookLag,
      this.chestLookLag,
      this.neckLookLag,
      this.headLookLag,
      this.eyeLookLag,
      this.hipsWander.current,
      this.chestWander.current,
      this.headWander.current,
      this.leftHandMicro.upperArm,
      this.leftHandMicro.forearm,
      this.leftHandMicro.wrist,
      this.rightHandMicro.upperArm,
      this.rightHandMicro.forearm,
      this.rightHandMicro.wrist,
    ]) {
      resetSpring(spring)
    }
    resetScalarSpring(this.leftHandMicro.sharedFingerCurl)
    resetScalarSpring(this.rightHandMicro.sharedFingerCurl)
    this.leftHandMicro.fingerStates.forEach(finger => resetScalarSpring(finger.spring))
    this.rightHandMicro.fingerStates.forEach(finger => resetScalarSpring(finger.spring))
    this.fromAction = 'idle'
    this.toAction = 'idle'
    this.actionBlend = 1
    this.reseed()
  }

  setTransitionMs(ms: number | undefined) {
    if (typeof ms !== 'number' || !Number.isFinite(ms)) return
    this.transitionSec = clamp(ms, 150, 300) / 1000
  }

  setBaseAction(action: VrmBodyAction) {
    if (this.toAction === action) return
    this.fromAction = this.actionBlend >= 1 ? this.toAction : this.fromAction
    this.toAction = action
    this.actionBlend = 0
  }

  update(input: VrmProceduralMotionInput): VrmProceduralMotionFrame {
    const delta = clamp(input.delta, 0, 1 / 30)
    this.actionBlend = Math.min(1, this.actionBlend + delta / this.transitionSec)
    if (this.actionBlend >= 1) this.fromAction = this.toAction

    const microLayer = this.buildPhysiologyLayer(input, delta)
    const fromAction = this.buildBaseActionLayer(input, this.fromAction)
    const toAction = this.buildBaseActionLayer(input, this.toAction)
    const actionLayer = blendLayers(fromAction, toAction, this.actionBlend)
    const interactionLayer = this.buildInteractionLayer(input, delta)
    const rootOffset = blendVectors(
      this.buildRootOffset(input, this.fromAction),
      this.buildRootOffset(input, this.toAction),
      this.actionBlend,
    )

    return {
      boneOffsets: composeLayers([microLayer, actionLayer, interactionLayer]),
      eyeLook: {
        x: clamp(this.eyeLookLag.value.x, -1, 1),
        y: clamp(this.eyeLookLag.value.y, -1, 1),
      },
      rootOffset,
    }
  }

  private buildRootOffset(input: VrmProceduralMotionInput, action: VrmBodyAction): THREE.Vector3 {
    const t = input.elapsed
    const scale = input.variant === 'floating-agent' ? 1.1 : 1
    const effectiveAction = input.avatarState === 'thinking' && action === 'idle' ? 'thinking_nod' : action

    if (effectiveAction === 'gentle_pace') {
      const stride = Math.sin(t * 0.72)
      const footfall = Math.sin(t * 1.44)
      return new THREE.Vector3(
        stride * (input.variant === 'floating-agent' ? 0.024 : 0.045) * scale,
        (1 - Math.cos(t * 1.44)) * (input.variant === 'floating-agent' ? 0.0008 : 0.0045) * scale
          + Math.max(0, footfall) * (input.variant === 'floating-agent' ? 0.0005 : 0.0025) * scale,
        0,
      )
    }

    if (input.variant === 'floating-agent' && effectiveAction === 'idle') {
      return new THREE.Vector3(Math.sin(t * 0.34) * 0.01, Math.sin(t * 0.78) * 0.002, 0)
    }

    return new THREE.Vector3()
  }

  private buildPhysiologyLayer(input: VrmProceduralMotionInput, delta: number): PoseLayer {
    const layer: PoseLayer = new Map()
    const t = input.elapsed
    const scale = input.variant === 'floating-agent' ? 1.18 : 1

    updateWander(this.hipsWander, t, delta, 0.12 * DEG * scale, 0.2 * DEG * scale, 0.22 * DEG * scale)
    updateWander(this.chestWander, t, delta, 0.16 * DEG * scale, 0.22 * DEG * scale, 0.16 * DEG * scale)
    updateWander(this.headWander, t, delta, 0.22 * DEG * scale, 0.32 * DEG * scale, 0.16 * DEG * scale)

    const breath = oscillatorValue(this.breathPitch, t) * scale
    const breathRoll = oscillatorValue(this.breathRoll, t) * scale
    const rootTarget = new THREE.Vector3(
      oscillatorValue(this.balanceRoll, t) * 0.22 * scale,
      oscillatorValue(this.balanceYaw, t) * scale,
      oscillatorValue(this.balanceRoll, t) * scale,
    ).add(this.hipsWander.current.value)

    // 躯干 -> 胸腔 -> 脖子 -> 头部：每一级用弹簧追上一级，形成自然惯性延迟。
    springTo(this.hipsLag, rootTarget, delta, 5.6, 0.92)
    springTo(
      this.spineLag,
      new THREE.Vector3(breath * 0.55, this.hipsLag.value.y * 0.42, this.hipsLag.value.z * 0.34),
      delta,
      4.55,
      0.9,
    )
    springTo(
      this.chestLag,
      new THREE.Vector3(breath * 0.75, this.spineLag.value.y * 0.62, this.spineLag.value.z * 0.44 + breathRoll)
        .add(this.chestWander.current.value),
      delta,
      3.8,
      0.88,
    )
    springTo(
      this.upperChestLag,
      new THREE.Vector3(breath * 0.62, this.chestLag.value.y * 0.76, this.chestLag.value.z * 0.58),
      delta,
      3.35,
      0.88,
    )
    springTo(
      this.neckLag,
      new THREE.Vector3(
        this.upperChestLag.value.x * 0.35 + oscillatorValue(this.headNoisePitch, t) * 0.28 * scale,
        this.upperChestLag.value.y * 0.34 + oscillatorValue(this.headNoiseYaw, t) * 0.18 * scale,
        this.upperChestLag.value.z * 0.22,
      ),
      delta,
      2.95,
      0.86,
    )
    springTo(
      this.headLag,
      new THREE.Vector3(
        this.neckLag.value.x * 0.58 + oscillatorValue(this.headNoisePitch, t) * 0.62 * scale,
        this.neckLag.value.y * 0.54 + oscillatorValue(this.headNoiseYaw, t) * 0.56 * scale,
        this.neckLag.value.z * 0.36,
      ).add(this.headWander.current.value),
      delta,
      2.45,
      0.84,
    )

    addPose(layer, 'hips', this.hipsLag.value.x, this.hipsLag.value.y, this.hipsLag.value.z)
    addPose(layer, 'spine', this.spineLag.value.x, this.spineLag.value.y, this.spineLag.value.z)
    addPose(layer, 'chest', this.chestLag.value.x, this.chestLag.value.y, this.chestLag.value.z)
    addPose(layer, 'upperChest', this.upperChestLag.value.x, this.upperChestLag.value.y, this.upperChestLag.value.z)
    addPose(layer, 'neck', this.neckLag.value.x, this.neckLag.value.y, this.neckLag.value.z)
    addPose(layer, 'head', this.headLag.value.x, this.headLag.value.y, this.headLag.value.z)

    addPose(layer, 'leftShoulder', breath * 0.1, 0, 0.05 * DEG + breathRoll * 0.48)
    addPose(layer, 'rightShoulder', breath * 0.08, 0, -0.05 * DEG - breathRoll * 0.44)

    const balance = this.hipsLag.value.z
    addPose(layer, 'leftUpperLeg', -balance * 0.18, 0, -balance * 0.18)
    addPose(layer, 'rightUpperLeg', balance * 0.18, 0, -balance * 0.18)
    addPose(layer, 'leftLowerLeg', balance * 0.08, 0, 0)
    addPose(layer, 'rightLowerLeg', -balance * 0.08, 0, 0)
    addPose(layer, 'leftFoot', -balance * 0.06, 0, balance * 0.1)
    addPose(layer, 'rightFoot', balance * 0.06, 0, balance * 0.1)

    this.applyHandMicroMotion(layer, input, delta, 'left', this.leftHandMicro, breath, this.chestLag.value, this.hipsLag.value)
    this.applyHandMicroMotion(layer, input, delta, 'right', this.rightHandMicro, breath, this.chestLag.value, this.hipsLag.value)

    return layer
  }

  private applyHandMicroMotion(
    layer: PoseLayer,
    input: VrmProceduralMotionInput,
    delta: number,
    side: HandSide,
    state: HandMicroSideState,
    breath: number,
    chestMotion: THREE.Vector3,
    hipsMotion: THREE.Vector3,
  ) {
    const t = input.elapsed + state.phaseOffset
    const isFloatingAgent = input.variant === 'floating-agent'
    const scale = isFloatingAgent ? FLOATING_HAND_MICRO_SCALE : 1
    const sideSign = side === 'left' ? 1 : -1

    if (input.elapsed >= state.nextSharedFingerAt) {
      state.sharedFingerTarget = randomRange(0.04, 0.42)
      state.nextSharedFingerAt = input.elapsed + randomRange(1.8, 5.2)
    } else if (state.nextSharedFingerAt - input.elapsed < 0.95) {
      state.sharedFingerTarget *= 0.985
    }

    springScalarTo(state.sharedFingerCurl, state.sharedFingerTarget, delta, 3.2, 0.92)

    const upperTarget = new THREE.Vector3(
      oscillatorValue(state.upperRelax, t) * 0.42 * scale + breath * 0.055,
      chestMotion.y * 0.16 + oscillatorValue(state.drift, t + 0.3) * 0.22 * scale,
      sideSign * (oscillatorValue(state.upperRelax, t + 0.7) * 0.62 * scale + chestMotion.z * 0.18),
    )
    const forearmTarget = new THREE.Vector3(
      upperTarget.x * 0.55 + oscillatorValue(state.forearmRelax, t + 0.42) * 0.75 * scale,
      upperTarget.y * 0.45 + hipsMotion.y * 0.05,
      upperTarget.z * 0.52 + sideSign * oscillatorValue(state.forearmRelax, t + 1.1) * 0.48 * scale,
    )
    const wristTarget = new THREE.Vector3(
      forearmTarget.x * 0.42 + oscillatorValue(state.wristFlip, t + 0.28) * 0.86 * scale,
      forearmTarget.y * 0.34 + sideSign * oscillatorValue(state.wristTwist, t + 0.9) * 0.58 * scale,
      forearmTarget.z * 0.38 + sideSign * oscillatorValue(state.wristTwist, t + 1.6) * 0.92 * scale,
    )
    if (isFloatingAgent) {
      wristTarget.x = clamp(wristTarget.x, -0.36 * DEG, 0.36 * DEG)
      wristTarget.y = clamp(wristTarget.y, -0.42 * DEG, 0.42 * DEG)
      wristTarget.z = clamp(wristTarget.z, -0.44 * DEG, 0.44 * DEG)
    }

    // 上臂 -> 前臂 -> 手腕多级弹簧延迟：手会跟随呼吸和重心，但比躯干慢半拍。
    springTo(state.upperArm, upperTarget, delta, 2.25, 0.9)
    springTo(state.forearm, forearmTarget, delta, 1.95, 0.88)
    springTo(state.wrist, wristTarget, delta, 1.72, 0.86)

    const upperArmBone: VRMHumanBoneName = side === 'left' ? 'leftUpperArm' : 'rightUpperArm'
    const forearmBone: VRMHumanBoneName = side === 'left' ? 'leftLowerArm' : 'rightLowerArm'
    const handBone: VRMHumanBoneName = side === 'left' ? 'leftHand' : 'rightHand'

    addPose(layer, upperArmBone, state.upperArm.value.x, state.upperArm.value.y, state.upperArm.value.z)
    addPose(layer, forearmBone, state.forearm.value.x, state.forearm.value.y, state.forearm.value.z)
    addPose(layer, handBone, state.wrist.value.x, state.wrist.value.y, state.wrist.value.z)

    state.fingerStates.forEach((finger, index) => {
      if (input.elapsed >= finger.nextAt) {
        finger.target = randomRange(0.06, 0.55)
        finger.nextAt = input.elapsed + randomRange(1.2, 4.8) + index * 0.035
      } else if (finger.nextAt - input.elapsed < 0.7) {
        finger.target *= 0.98
      }

      springScalarTo(finger.spring, finger.target, delta, finger.response, 0.9)
      const flutter = Math.max(0, oscillatorValue(state.fingerFlutter, t + finger.phase))
      const curl = (
        state.sharedFingerCurl.value * finger.sharedWeight
        + finger.spring.value
        + flutter
      ) * finger.amplitude

      addPose(layer, finger.bone, curl, 0, 0)
    })
  }

  private buildBaseActionLayer(input: VrmProceduralMotionInput, action: VrmBodyAction): PoseLayer {
    const layer: PoseLayer = new Map()
    const t = input.elapsed
    const isFloatingAgent = input.variant === 'floating-agent'
    const scale = isFloatingAgent ? 1.02 : 1
    const flipped = input.flippedBones === true
    const upperBaseX = flipped ? (isFloatingAgent ? -0.02 : -0.1) : (isFloatingAgent ? 0.02 : 0.1)
    const leftUpperBaseZ = flipped ? (isFloatingAgent ? -1.34 : -1.25) : (isFloatingAgent ? 1.34 : 1.25)
    const rightUpperBaseZ = flipped ? (isFloatingAgent ? 1.34 : 1.25) : (isFloatingAgent ? -1.34 : -1.25)
    const lowerBaseX = flipped ? (isFloatingAgent ? 1.11 : 1.5) : (isFloatingAgent ? -1.11 : -1.5)
    const leftLowerBaseZ = flipped ? (isFloatingAgent ? -0.28 : -0.4) : (isFloatingAgent ? 0.28 : 0.4)
    const rightLowerBaseZ = flipped ? (isFloatingAgent ? 0.28 : 0.4) : (isFloatingAgent ? -0.28 : -0.4)
    const effectiveAction = input.avatarState === 'thinking' && action === 'idle' ? 'thinking_nod' : action
    const sideSign = flipped ? -1 : 1

    addPose(layer, 'leftUpperArm', upperBaseX, 0, leftUpperBaseZ)
    addPose(layer, 'rightUpperArm', upperBaseX, 0, rightUpperBaseZ)
    addPose(layer, 'leftLowerArm', lowerBaseX, 0, leftLowerBaseZ)
    addPose(layer, 'rightLowerArm', lowerBaseX, 0, rightLowerBaseZ)
    if (isFloatingAgent) {
      addPose(layer, 'leftShoulder', -0.12 * DEG, 0, sideSign * 0.24 * DEG)
      addPose(layer, 'rightShoulder', -0.12 * DEG, 0, -sideSign * 0.24 * DEG)
      addFloatingPalmInwardPose(layer, sideSign)
    }

    if (effectiveAction === 'thinking_nod') {
      addPose(layer, 'head', (-1.8 * DEG + Math.sin(t * 1.45) * 1.55 * DEG) * scale, 2.4 * DEG, 1.1 * DEG)
      addPose(layer, 'neck', (-0.8 * DEG + Math.sin(t * 1.28) * 0.7 * DEG) * scale, 0.9 * DEG, 0.3 * DEG)
      addPose(layer, 'chest', -0.35 * DEG, 0.5 * DEG, 0)
      addPose(layer, 'rightHand', -0.7 * DEG + Math.sin(t * 1.1) * 0.35 * DEG, 0, 0.7 * DEG)
    } else if (effectiveAction === 'soft_shake') {
      addPose(layer, 'head', 0, Math.sin(t * 2.05) * 3.6 * DEG * scale, 0)
      addPose(layer, 'neck', 0, Math.sin(t * 2.05 + 0.38) * 1.25 * DEG * scale, 0)
      addPose(layer, 'upperChest', 0, Math.sin(t * 1.2) * 0.32 * DEG, 0)
    } else if (effectiveAction === 'relaxed_wave') {
      if (isFloatingAgent) {
        addPose(layer, 'head', Math.sin(t * 0.7) * 0.42 * DEG, Math.sin(t * 0.58) * 0.58 * DEG, 0)
        addPose(layer, 'rightUpperArm', 2.6 * DEG, sideSign * 1.1 * DEG, sideSign * 3.6 * DEG)
        addPose(layer, 'rightLowerArm', 4.8 * DEG + Math.sin(t * 2.1) * 1.4 * DEG, 0, sideSign * 1.8 * DEG)
        addPose(layer, 'rightHand', Math.sin(t * 2.6) * 0.7 * DEG, 0, sideSign * Math.sin(t * 2.15) * 1.3 * DEG)
        return layer
      }
      addPose(layer, 'head', Math.sin(t * 0.75) * 0.7 * DEG, Math.sin(t * 0.58) * 1.1 * DEG, 0)
      addPose(layer, 'rightUpperArm', 6.8 * DEG, 3.2 * DEG, 8.5 * DEG)
      addPose(layer, 'rightLowerArm', 10 * DEG + Math.sin(t * 2.25) * 5.2 * DEG, 0, Math.sin(t * 2.25) * 2.4 * DEG)
      addPose(layer, 'rightHand', Math.sin(t * 3.0) * 1.4 * DEG, 0, Math.sin(t * 3.0) * 3.2 * DEG)
    } else if (effectiveAction === 'gentle_pace') {
      if (isFloatingAgent) {
        const stride = Math.sin(t * 1.44)
        const elbow = Math.sin(t * 1.44 + 0.35)
        const sway = Math.sin(t * 0.72)
        addPose(layer, 'hips', 0, sway * 0.18 * DEG, sway * 0.26 * DEG)
        addPose(layer, 'chest', 0.08 * DEG, -sway * 0.12 * DEG, -sway * 0.14 * DEG)
        addPose(layer, 'head', Math.sin(t * 0.9) * 0.18 * DEG, -sway * 0.18 * DEG, 0)
        addPose(layer, 'leftUpperLeg', stride * 0.72 * DEG, 0, -sway * 0.18 * DEG)
        addPose(layer, 'rightUpperLeg', -stride * 0.72 * DEG, 0, -sway * 0.18 * DEG)
        addPose(layer, 'leftShoulder', 0, 0, sideSign * stride * 0.24 * DEG)
        addPose(layer, 'rightShoulder', 0, 0, -sideSign * stride * 0.22 * DEG)
        addPose(layer, 'leftUpperArm', -stride * 3.8 * DEG, -sideSign * stride * 0.85 * DEG, sideSign * stride * 1.25 * DEG)
        addPose(layer, 'rightUpperArm', stride * 3.5 * DEG, sideSign * stride * 0.78 * DEG, -sideSign * stride * 1.15 * DEG)
        addPose(layer, 'leftLowerArm', elbow * 1.65 * DEG, 0, -sideSign * Math.abs(stride) * 0.62 * DEG)
        addPose(layer, 'rightLowerArm', -elbow * 1.5 * DEG, 0, sideSign * Math.abs(stride) * 0.56 * DEG)
        addPose(layer, 'leftHand', Math.sin(t * 1.2) * 0.56 * DEG, 0, sideSign * Math.sin(t * 1.1) * 0.78 * DEG)
        addPose(layer, 'rightHand', Math.cos(t * 1.15) * 0.5 * DEG, 0, -sideSign * Math.sin(t * 1.05) * 0.7 * DEG)
        return layer
      }
      const stride = Math.sin(t * 1.44)
      const sway = Math.sin(t * 0.72)
      addPose(layer, 'hips', 0, sway * 0.65 * DEG * scale, sway * 1.15 * DEG * scale)
      addPose(layer, 'spine', 0.18 * DEG, -sway * 0.22 * DEG, -sway * 0.34 * DEG)
      addPose(layer, 'chest', 0.22 * DEG, -sway * 0.36 * DEG, -sway * 0.42 * DEG)
      addPose(layer, 'head', Math.sin(t * 0.9) * 0.35 * DEG, -sway * 0.5 * DEG, -sway * 0.2 * DEG)
      addPose(layer, 'leftUpperLeg', stride * 1.85 * DEG * scale, 0, -sway * 0.5 * DEG)
      addPose(layer, 'rightUpperLeg', -stride * 1.85 * DEG * scale, 0, -sway * 0.5 * DEG)
      addPose(layer, 'leftLowerLeg', Math.max(0, -stride) * 1.35 * DEG * scale, 0, 0)
      addPose(layer, 'rightLowerLeg', Math.max(0, stride) * 1.35 * DEG * scale, 0, 0)
      addPose(layer, 'leftFoot', -Math.max(0, stride) * 0.65 * DEG, 0, sway * 0.25 * DEG)
      addPose(layer, 'rightFoot', -Math.max(0, -stride) * 0.65 * DEG, 0, sway * 0.25 * DEG)
      addPose(layer, 'leftUpperArm', -stride * 1.15 * DEG, 0, sideSign * stride * 0.95 * DEG)
      addPose(layer, 'rightUpperArm', stride * 1.05 * DEG, 0, -sideSign * stride * 0.85 * DEG)
      addPose(layer, 'leftLowerArm', Math.sin(t * 1.44 + 0.5) * 0.8 * DEG, 0, -sideSign * Math.abs(stride) * 0.5 * DEG)
      addPose(layer, 'rightLowerArm', -Math.sin(t * 1.44 + 0.35) * 0.72 * DEG, 0, sideSign * Math.abs(stride) * 0.45 * DEG)
    } else if (effectiveAction === 'folded_arms') {
      if (isFloatingAgent) {
        const settle = Math.sin(t * 0.82) * 0.18 * DEG
        addPose(layer, 'chest', -0.22 * DEG, 0, sideSign * 0.08 * DEG)
        addPose(layer, 'head', -0.08 * DEG + settle * 0.2, Math.sin(t * 0.42) * 0.18 * DEG, 0)
        addPose(layer, 'leftShoulder', 0.3 * DEG, sideSign * 0.2 * DEG, -sideSign * 0.7 * DEG)
        addPose(layer, 'rightShoulder', 0.3 * DEG, -sideSign * 0.2 * DEG, sideSign * 0.7 * DEG)
        addPose(layer, 'leftUpperArm', -2.2 * DEG + settle, sideSign * 1.4 * DEG, -sideSign * 5.2 * DEG)
        addPose(layer, 'rightUpperArm', -2.0 * DEG - settle, -sideSign * 1.4 * DEG, sideSign * 5.0 * DEG)
        addPose(layer, 'leftLowerArm', 5.8 * DEG, sideSign * 0.9 * DEG, -sideSign * 5.8 * DEG)
        addPose(layer, 'rightLowerArm', 5.6 * DEG, -sideSign * 0.9 * DEG, sideSign * 5.6 * DEG)
        addPose(layer, 'leftHand', settle, 0, sideSign * 1.1 * DEG)
        addPose(layer, 'rightHand', -settle, 0, -sideSign * 1.0 * DEG)
        return layer
      }
      const settle = Math.sin(t * 0.88) * 0.45 * DEG
      addPose(layer, 'chest', -0.85 * DEG, 0, sideSign * 0.18 * DEG)
      addPose(layer, 'upperChest', -0.5 * DEG, 0, -sideSign * 0.22 * DEG)
      addPose(layer, 'head', -0.25 * DEG + settle * 0.18, Math.sin(t * 0.42) * 0.42 * DEG, -sideSign * 0.16 * DEG)
      addPose(layer, 'leftShoulder', 1.4 * DEG, sideSign * 0.8 * DEG, -sideSign * 2.6 * DEG)
      addPose(layer, 'rightShoulder', 1.2 * DEG, -sideSign * 0.8 * DEG, sideSign * 2.4 * DEG)
      addPose(layer, 'leftUpperArm', -7.5 * DEG + settle, sideSign * 5.5 * DEG, -sideSign * 18 * DEG)
      addPose(layer, 'rightUpperArm', -6.8 * DEG - settle * 0.8, -sideSign * 5.1 * DEG, sideSign * 17.2 * DEG)
      addPose(layer, 'leftLowerArm', 25 * DEG, sideSign * 3.5 * DEG, -sideSign * 20 * DEG)
      addPose(layer, 'rightLowerArm', 24 * DEG, -sideSign * 3.2 * DEG, sideSign * 19 * DEG)
      addPose(layer, 'leftHand', -2.5 * DEG, sideSign * 1.8 * DEG, -sideSign * 6.5 * DEG)
      addPose(layer, 'rightHand', -2.2 * DEG, -sideSign * 1.6 * DEG, sideSign * 6 * DEG)
      FINGER_PROXIMAL_BONES.forEach((bone) => addPose(layer, bone, 2.6 * DEG, 0, 0))
      FINGER_INTERMEDIATE_BONES.forEach((bone) => addPose(layer, bone, 2.2 * DEG, 0, 0))
    } else if (effectiveAction === 'presenting_gesture') {
      if (isFloatingAgent) {
        const cue = Math.sin(t * 1.35) * 0.32 * DEG
        addPose(layer, 'chest', -0.08 * DEG, -sideSign * 0.24 * DEG, 0.08 * DEG)
        addPose(layer, 'head', Math.sin(t * 0.72) * 0.2 * DEG, -sideSign * 0.3 * DEG, 0)
        addPose(layer, 'rightShoulder', 0.2 * DEG, 0, sideSign * 0.5 * DEG)
        addPose(layer, 'rightUpperArm', 2.6 * DEG + cue * 0.2, sideSign * 1.2 * DEG, sideSign * 3.2 * DEG)
        addPose(layer, 'rightLowerArm', 5.2 * DEG + cue, 0, sideSign * (1.4 * DEG + cue * 0.35))
        addPose(layer, 'rightHand', 0.55 * DEG + cue, 0, sideSign * (1.3 * DEG + cue * 0.5))
        addPose(layer, 'rightIndexProximal', -0.28 * DEG, 0, 0)
        return layer
      }
      const cue = Math.sin(t * 1.55) * 1.2 * DEG
      addPose(layer, 'chest', -0.15 * DEG, -sideSign * 0.8 * DEG, 0.2 * DEG)
      addPose(layer, 'head', Math.sin(t * 0.72) * 0.42 * DEG, -sideSign * 0.9 * DEG, 0)
      addPose(layer, 'leftUpperArm', 0.8 * DEG, 0, sideSign * 1.6 * DEG)
      addPose(layer, 'leftLowerArm', 2.2 * DEG, 0, sideSign * 1.2 * DEG)
      addPose(layer, 'rightShoulder', 0.8 * DEG, 0, sideSign * 1.2 * DEG)
      addPose(layer, 'rightUpperArm', 8.5 * DEG + cue * 0.2, sideSign * 4.6 * DEG, sideSign * 9.4 * DEG)
      addPose(layer, 'rightLowerArm', 16.5 * DEG + cue, 0, sideSign * (3.8 * DEG + cue * 0.35))
      addPose(layer, 'rightHand', 3.2 * DEG + Math.sin(t * 2.4) * 0.75 * DEG, 0, sideSign * 5.8 * DEG)
      addPose(layer, 'rightIndexProximal', -1.8 * DEG, 0, 0)
      addPose(layer, 'rightMiddleProximal', -1.2 * DEG, 0, 0)
    } else if (effectiveAction === 'arm_explain') {
      if (isFloatingAgent) {
        const explain = Math.sin(t * 1.48)
        const alternate = Math.sin(t * 1.48 + Math.PI * 0.72)
        addPose(layer, 'chest', Math.sin(t * 0.62) * 0.12 * DEG, explain * 0.12 * DEG, 0)
        addPose(layer, 'head', Math.sin(t * 1.0) * 0.22 * DEG, explain * 0.18 * DEG, 0)
        addPose(layer, 'leftUpperArm', 1.1 * DEG + explain * 0.42 * DEG, 0, sideSign * (1.4 * DEG + alternate * 0.42 * DEG))
        addPose(layer, 'rightUpperArm', 1.2 * DEG + alternate * 0.44 * DEG, 0, -sideSign * (1.3 * DEG + explain * 0.4 * DEG))
        addPose(layer, 'leftLowerArm', 2.5 * DEG + alternate * 1.2 * DEG, 0, sideSign * (0.9 * DEG + explain * 0.5 * DEG))
        addPose(layer, 'rightLowerArm', 2.8 * DEG + explain * 1.25 * DEG, 0, -sideSign * (0.85 * DEG + alternate * 0.48 * DEG))
        addPose(layer, 'leftHand', alternate * 0.46 * DEG, 0, sideSign * explain * 0.75 * DEG)
        addPose(layer, 'rightHand', explain * 0.52 * DEG, 0, -sideSign * alternate * 0.72 * DEG)
        return layer
      }
      const explain = Math.sin(t * 1.95)
      const alternate = Math.sin(t * 1.95 + Math.PI * 0.72)
      addPose(layer, 'chest', Math.sin(t * 0.62) * 0.32 * DEG, explain * 0.38 * DEG, explain * 0.18 * DEG)
      addPose(layer, 'head', Math.sin(t * 1.08) * 0.46 * DEG, explain * 0.52 * DEG, 0)
      addPose(layer, 'leftUpperArm', 2.8 * DEG + explain * 1.4 * DEG, 0, sideSign * (3.8 * DEG + alternate * 1.2 * DEG))
      addPose(layer, 'rightUpperArm', 3.4 * DEG + alternate * 1.5 * DEG, 0, -sideSign * (3.2 * DEG + explain * 1.1 * DEG))
      addPose(layer, 'leftLowerArm', 6.8 * DEG + alternate * 4.2 * DEG, 0, sideSign * (2.2 * DEG + explain * 1.5 * DEG))
      addPose(layer, 'rightLowerArm', 7.4 * DEG + explain * 4.4 * DEG, 0, -sideSign * (2.0 * DEG + alternate * 1.4 * DEG))
      addPose(layer, 'leftHand', Math.sin(t * 2.65) * 1.3 * DEG, 0, sideSign * Math.sin(t * 2.12) * 2.3 * DEG)
      addPose(layer, 'rightHand', Math.sin(t * 2.42 + 0.4) * 1.35 * DEG, 0, -sideSign * Math.sin(t * 2.26) * 2.1 * DEG)
    } else {
      const floatingShift = input.variant === 'floating-agent' ? Math.sin(t * 0.48) * 0.52 * DEG : 0
      addPose(layer, 'hips', 0, 0, floatingShift * 0.36)
      addPose(layer, 'chest', 0, -floatingShift * 0.18, -floatingShift * 0.32)
      addPose(layer, 'leftUpperLeg', 0, 0, -floatingShift * 0.16)
      addPose(layer, 'rightUpperLeg', 0, 0, -floatingShift * 0.16)
      addPose(layer, 'leftUpperArm', Math.sin(t * 0.78) * 0.45 * DEG, 0, Math.sin(t * 0.8) * 0.48 * DEG + floatingShift * 0.28)
      addPose(layer, 'rightUpperArm', Math.sin(t * 0.84) * 0.38 * DEG, 0, -Math.sin(t * 0.92) * 0.44 * DEG - floatingShift * 0.24)
      addPose(layer, 'leftLowerArm', 0, 0, Math.sin(t * 1.12) * 0.5 * DEG)
      addPose(layer, 'rightLowerArm', 0, 0, Math.cos(t * 1.18) * 0.45 * DEG)
    }

    return layer
  }

  private buildInteractionLayer(input: VrmProceduralMotionInput, delta: number): PoseLayer {
    const layer: PoseLayer = new Map()
    const t = input.elapsed
    const isFloatingAgent = input.variant === 'floating-agent'
    const scale = isFloatingAgent ? 1.08 : 1
    const softGlance = 0
    const desiredEye = vectorFromScreenLook(input.lookTargetX + softGlance, input.lookTargetY)

    springTo(this.eyeLookLag, desiredEye, delta, isFloatingAgent ? 18.5 : 8.2, 0.91)
    springTo(this.torsoLookLag, this.eyeLookLag.value, delta, 4.35, 0.9)
    springTo(this.chestLookLag, this.torsoLookLag.value, delta, 3.55, 0.88)
    const neckTarget = isFloatingAgent ? this.eyeLookLag.value : this.chestLookLag.value
    const headTarget = isFloatingAgent ? this.eyeLookLag.value : this.neckLookLag.value
    springTo(this.neckLookLag, neckTarget, delta, isFloatingAgent ? 8.8 : 2.95, 0.9)
    springTo(this.headLookLag, headTarget, delta, isFloatingAgent ? 10.6 : 2.45, 0.88)

    const torsoPitch = isFloatingAgent ? 0.006 : 0.012
    const torsoYaw = isFloatingAgent ? 0.008 : 0.018
    const chestPitch = isFloatingAgent ? 0.012 : 0.024
    const chestYaw = isFloatingAgent ? 0.018 : 0.04
    const upperChestPitch = isFloatingAgent ? 0.018 : 0.032
    const upperChestYaw = isFloatingAgent ? 0.028 : 0.055
    const neckPitch = isFloatingAgent ? 0.08 : 0.11
    const neckYaw = isFloatingAgent ? 0.095 : 0.16
    const headPitch = isFloatingAgent ? 0.17 : 0.23
    const headYaw = isFloatingAgent ? 0.2 : 0.32
    const pitchSign = input.flippedBones === true ? -1 : 1

    // 两组 VRM 的头颈 pitch 轴相反：flippedSkeleton 模型需要反向补偿，yaw 仍保持统一。
    // 浮动角色需要明显的头颈追踪；页面内面试形象仍保持克制。
    addPose(layer, 'spine', pitchSign * this.torsoLookLag.value.y * torsoPitch * scale, this.torsoLookLag.value.x * torsoYaw * scale, 0)
    addPose(layer, 'chest', pitchSign * this.chestLookLag.value.y * chestPitch * scale, this.chestLookLag.value.x * chestYaw * scale, 0)
    addPose(layer, 'upperChest', pitchSign * this.chestLookLag.value.y * upperChestPitch * scale, this.chestLookLag.value.x * upperChestYaw * scale, 0)
    addPose(layer, 'neck', pitchSign * this.neckLookLag.value.y * neckPitch * scale, this.neckLookLag.value.x * neckYaw * scale, 0)
    addPose(layer, 'head', pitchSign * this.headLookLag.value.y * headPitch * scale, this.headLookLag.value.x * headYaw * scale, -this.headLookLag.value.x * 0.024 * scale)

    if (input.avatarState === 'speaking') {
      const nod = Math.sin(t * 2.85) * 1.15 * DEG + Math.sin(t * 5.15) * 0.28 * DEG
      const emphasis = Math.sin(t * 1.72) * 0.42 * DEG
      addPose(layer, 'head', nod * scale, emphasis * scale, Math.sin(t * 1.35) * 0.42 * DEG * scale)
      addPose(layer, 'neck', nod * 0.32 * scale, emphasis * 0.28 * scale, 0)
      addPose(layer, 'chest', nod * 0.12, emphasis * 0.18, 0)
      addPose(layer, 'leftHand', Math.sin(t * 2.1) * 0.72 * DEG, 0, Math.sin(t * 1.65) * 0.82 * DEG)
      addPose(layer, 'rightHand', Math.sin(t * 1.82) * 0.62 * DEG, 0, -Math.sin(t * 1.45) * 0.72 * DEG)
    }

    return layer
  }
}
