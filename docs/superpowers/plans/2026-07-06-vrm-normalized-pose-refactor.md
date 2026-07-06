# VRM Normalized Pose Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the VRM avatar module so procedural gestures, head movement, and gaze use the `@pixiv/three-vrm` normalized humanoid path by default while preserving the current interview and floating Agent avatar behavior.

**Architecture:** Extract Three.js/VRM lifecycle into a runtime utility, add a pose adapter that converts existing procedural motion frames into `VRMPose` objects for `humanoid.setNormalizedPose()`, then reconnect `VrmAvatar.vue` to those focused utilities. Keep the current public component contract, lip-sync behavior, expression behavior, model registry, and hidden `avatar_motion` directive schema unchanged.

**Tech Stack:** Vue 3, TypeScript, Three.js, `@pixiv/three-vrm`, existing Vite/Vue type-check and build scripts.

---

## Preconditions

- Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` before implementation.
- The repository currently has unrelated dirty files. Do not revert them. Stage and commit only the files touched by this VRM refactor.
- The implementation is based on `docs/superpowers/specs/2026-07-06-vrm-normalized-pose-refactor-design.md`.
- This repo has no dedicated unit test runner. Use TypeScript checks, Vite build, and browser smoke verification.
- Do not add dependencies.

## File Structure

Create:

- `src/utils/vrmRuntime.ts`  
  Owns scene, camera, renderer, clock, lighting, model loading, fitting, resize, render, and disposal.

- `src/utils/vrmPoseAdapter.ts`  
  Detects model capabilities, converts procedural frames to `VRMPose`, applies normalized humanoid pose, applies root offset, applies gaze via `vrm.lookAt` or expression fallback, and keeps a legacy raw-bone fallback for validation.

Modify:

- `src/components/ai/interview/VrmAvatar.vue`  
  Keep props, emits, exposed methods, template, loading UI, drag/drop, watchers, lip sync, expression smoothing, and directive handling. Replace direct scene/model/raw-bone management with `VrmRuntime` and `VrmPoseAdapter`.

- `src/utils/vrmProceduralMotion.ts`  
  Keep the existing action vocabulary and frame shape. Update comments and exported intent naming only if needed by the adapter. Avoid retuning the whole motion library in this pass.

Do not modify:

- `src/components/agent/AgentAssistant.vue`
- `src/components/ai/interview/InterviewSimulationPanel.vue`
- `src/config/vrmModels.ts`
- `src/utils/lipSync.ts`

Those files are callers or stable support modules for this pass.

---

### Task 1: Add VRM Runtime Utility

**Files:**
- Create: `src/utils/vrmRuntime.ts`

- [ ] **Step 1: Create the runtime file**

Create `src/utils/vrmRuntime.ts` with this implementation:

```ts
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { VRM, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm'

export type VrmAvatarVariant = 'interview' | 'floating-agent'

export interface VrmRuntimeLoadOptions {
  url: string
  variant: VrmAvatarVariant
  needsSceneFlip: boolean
}

export interface VrmRuntimeLoadResult {
  vrm: VRM
  basePosition: THREE.Vector3
}

export class VrmRuntime {
  readonly scene = new THREE.Scene()
  readonly clock = new THREE.Clock()

  private camera: THREE.PerspectiveCamera | null = null
  private renderer: THREE.WebGLRenderer | null = null
  private currentVrm: VRM | null = null

  get vrm(): VRM | null {
    return this.currentVrm
  }

  get activeCamera(): THREE.PerspectiveCamera | null {
    return this.camera
  }

  init(canvas: HTMLCanvasElement, container: HTMLElement, variant: VrmAvatarVariant): void {
    const { width, height } = this.measure(container)
    this.scene.clear()
    this.camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 25)
    this.configureCamera(variant)

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(width, height)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.1
    this.addLights()
  }

  resize(container: HTMLElement): void {
    if (!this.camera || !this.renderer) return
    const { width, height } = this.measure(container)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
  }

  render(): void {
    if (!this.camera || !this.renderer) return
    this.renderer.render(this.scene, this.camera)
  }

  async loadModel(options: VrmRuntimeLoadOptions): Promise<VrmRuntimeLoadResult> {
    const loader = new GLTFLoader()
    loader.register(parser => new VRMLoaderPlugin(parser))

    const gltf = await loader.loadAsync(encodeURI(options.url))
    const loadedVrm = gltf.userData.vrm as VRM | undefined
    if (!loadedVrm) throw new Error('文件不是有效的 VRM 模型')

    this.disposeCurrentVrm()
    VRMUtils.removeUnnecessaryVertices(gltf.scene)
    VRMUtils.removeUnnecessaryJoints(gltf.scene)

    const basePosition = this.fitModel(loadedVrm, options.variant, options.needsSceneFlip)
    this.scene.add(loadedVrm.scene)
    loadedVrm.update(0)
    this.currentVrm = loadedVrm

    return { vrm: loadedVrm, basePosition }
  }

  dispose(): void {
    this.disposeCurrentVrm()
    this.renderer?.dispose()
    this.renderer = null
    this.camera = null
    this.scene.clear()
  }

  private disposeCurrentVrm(): void {
    if (!this.currentVrm) return
    this.scene.remove(this.currentVrm.scene)
    VRMUtils.deepDispose(this.currentVrm.scene)
    this.currentVrm = null
  }

  private measure(container: HTMLElement): { width: number; height: number } {
    return {
      width: Math.max(container.clientWidth, 100),
      height: Math.max(container.clientHeight, 100),
    }
  }

  private configureCamera(variant: VrmAvatarVariant): void {
    if (!this.camera) return
    if (variant === 'floating-agent') {
      this.camera.position.set(0, 0.82, 2.7)
      this.camera.lookAt(0, 0.78, 0)
      return
    }
    this.camera.position.set(0, 1.35, 1.0)
    this.camera.lookAt(0, 1.25, 0)
  }

  private addLights(): void {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.7))

    const mainLight = new THREE.DirectionalLight(0xffffff, 1.0)
    mainLight.position.set(1, 2, 2)
    this.scene.add(mainLight)

    const rimLightLeft = new THREE.DirectionalLight(0xe0e7ff, 0.8)
    rimLightLeft.position.set(-2, 1, -2)
    this.scene.add(rimLightLeft)

    const fillLight = new THREE.PointLight(0xfff5e6, 0.6, 5)
    fillLight.position.set(0, 0, 1)
    this.scene.add(fillLight)
  }

  private fitModel(vrm: VRM, variant: VrmAvatarVariant, needsSceneFlip: boolean): THREE.Vector3 {
    const box = new THREE.Box3().setFromObject(vrm.scene)
    const size = box.getSize(new THREE.Vector3())
    const targetHeight = variant === 'floating-agent' ? 1.55 : 1.4
    const scale = targetHeight / Math.max(size.y, 0.001)
    vrm.scene.scale.setScalar(scale)
    vrm.scene.rotation.y = needsSceneFlip ? Math.PI : 0

    if (variant === 'floating-agent') {
      const fittedBox = new THREE.Box3().setFromObject(vrm.scene)
      const fittedCenter = fittedBox.getCenter(new THREE.Vector3())
      vrm.scene.position.x -= fittedCenter.x
      vrm.scene.position.y += 0.78 - fittedCenter.y
    } else {
      vrm.scene.position.y = 0
    }

    return vrm.scene.position.clone()
  }
}
```

- [ ] **Step 2: Run type check**

Run:

```bash
npm run type-check
```

Expected: TypeScript may fail because `VrmAvatar.vue` has not been rewired yet, but `src/utils/vrmRuntime.ts` should not report import, type, or syntax errors. If the only failures are unrelated pre-existing app errors, record them before continuing.

- [ ] **Step 3: Commit the runtime utility**

Run:

```bash
git add src/utils/vrmRuntime.ts
git commit -m "Extract VRM runtime ownership" -m "Constraint: Preserve current component API while moving Three.js and VRM lifecycle code behind a focused utility." -m "Confidence: medium" -m "Scope-risk: narrow" -m "Directive: Keep model fitting values aligned with the previous VrmAvatar implementation until browser smoke proves a visual adjustment is needed." -m "Tested: npm run type-check checked for new runtime module type errors." -m "Not-tested: Component is not rewired to use this utility yet."
```

---

### Task 2: Add Normalized Pose Adapter

**Files:**
- Create: `src/utils/vrmPoseAdapter.ts`

- [ ] **Step 1: Create the adapter file**

Create `src/utils/vrmPoseAdapter.ts` with this implementation:

```ts
import * as THREE from 'three'
import type { VRM } from '@pixiv/three-vrm'
import type { VRMHumanBoneName, VRMPose } from '@pixiv/three-vrm-core'
import type { VrmProceduralMotionFrame } from '@/utils/vrmProceduralMotion'

export interface VrmPoseAdapterOptions {
  useLegacyRawBoneFallback?: boolean
  devDiagnostics?: boolean
}

export interface VrmPoseAdapterApplyOptions {
  basePosition: THREE.Vector3
  proceduralBones: readonly VRMHumanBoneName[]
}

const LOOK_DISTANCE = 2.2

export class VrmPoseAdapter {
  private availableBones = new Set<VRMHumanBoneName>()
  private rawRestPoses = new Map<VRMHumanBoneName, THREE.Quaternion>()
  private warnedMissingBones = new Set<VRMHumanBoneName>()

  constructor(private readonly options: VrmPoseAdapterOptions = {}) {}

  attach(vrm: VRM, bones: readonly VRMHumanBoneName[]): void {
    this.availableBones.clear()
    this.rawRestPoses.clear()
    this.warnedMissingBones.clear()

    for (const bone of bones) {
      if (vrm.humanoid.getNormalizedBoneNode(bone)) {
        this.availableBones.add(bone)
      }
      const raw = vrm.humanoid.getRawBoneNode(bone)
      if (raw) {
        this.rawRestPoses.set(bone, raw.quaternion.clone())
      }
    }
  }

  applyFrame(vrm: VRM, frame: VrmProceduralMotionFrame, applyOptions: VrmPoseAdapterApplyOptions): void {
    const pose = this.toNormalizedPose(frame)
    try {
      vrm.humanoid.resetNormalizedPose()
      vrm.humanoid.setNormalizedPose(pose)
    } catch (error) {
      this.warn('setNormalizedPose failed; falling back to legacy raw bone application for this frame.', error)
      if (this.options.useLegacyRawBoneFallback) {
        this.applyLegacyRawBones(vrm, frame)
      }
    }

    vrm.scene.position.copy(applyOptions.basePosition).add(frame.rootOffset)
  }

  applyLook(vrm: VRM, eyeLook: { x: number; y: number }): boolean {
    if (!vrm.lookAt) return false

    const origin = vrm.lookAt.getLookAtWorldPosition(new THREE.Vector3())
    const target = new THREE.Vector3(
      eyeLook.x * 0.42,
      eyeLook.y * 0.3,
      LOOK_DISTANCE,
    )
    target.applyQuaternion(vrm.scene.quaternion)
    target.add(origin)
    vrm.lookAt.lookAt(target)
    return true
  }

  toNormalizedPose(frame: VrmProceduralMotionFrame): VRMPose {
    const pose: VRMPose = {}
    for (const [boneName, offsetQuat] of frame.boneOffsets) {
      if (!this.availableBones.has(boneName)) {
        this.warnMissingBone(boneName)
        continue
      }
      pose[boneName] = {
        rotation: [offsetQuat.x, offsetQuat.y, offsetQuat.z, offsetQuat.w],
      }
    }
    return pose
  }

  private applyLegacyRawBones(vrm: VRM, frame: VrmProceduralMotionFrame): void {
    for (const [boneName, offsetQuat] of frame.boneOffsets) {
      const rawBone = vrm.humanoid.getRawBoneNode(boneName)
      const baseQuat = this.rawRestPoses.get(boneName)
      if (!rawBone || !baseQuat) continue
      rawBone.quaternion.copy(baseQuat).multiply(offsetQuat)
    }
  }

  private warnMissingBone(boneName: VRMHumanBoneName): void {
    if (!this.options.devDiagnostics || this.warnedMissingBones.has(boneName)) return
    this.warnedMissingBones.add(boneName)
    console.warn(`[VRM] normalized bone missing, skipped: ${boneName}`)
  }

  private warn(message: string, detail?: unknown): void {
    if (!this.options.devDiagnostics) return
    if (detail === undefined) {
      console.warn(`[VRM] ${message}`)
      return
    }
    console.warn(`[VRM] ${message}`, detail)
  }
}
```

- [ ] **Step 2: Run type check**

Run:

```bash
npm run type-check
```

Expected: `src/utils/vrmPoseAdapter.ts` should type-check. If failures mention `rotation` tuple compatibility, import `VRMPoseTransform` from `@pixiv/three-vrm-core` and type the local object as `VRMPoseTransform`.

- [ ] **Step 3: Commit the adapter**

Run:

```bash
git add src/utils/vrmPoseAdapter.ts
git commit -m "Route VRM motion through normalized pose adapter" -m "Constraint: Keep legacy raw-bone application available only as a validation fallback while normalized pose becomes the default path." -m "Rejected: Remove raw fallback immediately | Browser smoke across all registered models has not happened yet." -m "Confidence: medium" -m "Scope-risk: moderate" -m "Directive: Do not tune gesture amplitudes in this adapter; keep calibration in the procedural motion controller." -m "Tested: npm run type-check checked adapter imports and pose typing." -m "Not-tested: Adapter has not been connected to VrmAvatar yet."
```

---

### Task 3: Clarify Procedural Motion Output As Pose Intent

**Files:**
- Modify: `src/utils/vrmProceduralMotion.ts`

- [ ] **Step 1: Update frame comments without changing behavior**

In `src/utils/vrmProceduralMotion.ts`, update the `VrmProceduralMotionFrame` comments and the class comment so future edits treat `boneOffsets` as normalized pose intent:

```ts
export interface VrmProceduralMotionFrame {
  /** Additive local rotations relative to the VRM normalized humanoid rest pose. */
  boneOffsets: Map<VRMHumanBoneName, THREE.Quaternion>
  /** Smoothed gaze target in normalized screen-space coordinates. */
  eyeLook: { x: number; y: number }
  /** Scene-level root drift applied after pose generation. */
  rootOffset: THREE.Vector3
}
```

Replace the existing class-level paragraph that says the controller targets raw control with this wording:

```ts
/**
 * VRM full-body procedural motion controller.
 *
 * The controller emits additive local pose intent. Consumers decide how to apply
 * that intent to a loaded VRM. The preferred path is `VRMHumanoid.setNormalizedPose`
 * so gestures transfer through three-vrm's normalized humanoid rig instead of
 * mutating imported raw bones directly.
 */
```

- [ ] **Step 2: Keep the public action type unchanged**

Confirm the `VrmBodyAction` union still contains exactly:

```ts
export type VrmBodyAction =
  | 'idle'
  | 'thinking_nod'
  | 'soft_shake'
  | 'relaxed_wave'
  | 'gentle_pace'
  | 'folded_arms'
  | 'presenting_gesture'
  | 'arm_explain'
```

Do not rename actions in this task.

- [ ] **Step 3: Run a focused diff check**

Run:

```bash
git diff -- src/utils/vrmProceduralMotion.ts
```

Expected: The diff should contain comments and documentation changes only. If motion constants, action branches, or quaternion math changed, revert those edits before continuing.

- [ ] **Step 4: Commit documentation-only intent clarification**

Run:

```bash
git add src/utils/vrmProceduralMotion.ts
git commit -m "Clarify procedural VRM output as pose intent" -m "Constraint: This step prepares the normalized adapter without retuning the existing action library." -m "Confidence: high" -m "Scope-risk: narrow" -m "Directive: Preserve action names because AgentAssistant and VrmAvatar rely on the current directive vocabulary." -m "Tested: git diff confirmed documentation-only edits in vrmProceduralMotion." -m "Not-tested: No runtime behavior changed in this task."
```

---

### Task 4: Rewire VrmAvatar To Runtime And Adapter

**Files:**
- Modify: `src/components/ai/interview/VrmAvatar.vue`

- [ ] **Step 1: Replace imports**

In `src/components/ai/interview/VrmAvatar.vue`, replace direct loader/runtime imports:

```ts
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, VRM, VRMUtils } from '@pixiv/three-vrm'
```

with:

```ts
import type { VRM } from '@pixiv/three-vrm'
import { VrmRuntime } from '@/utils/vrmRuntime'
import { VrmPoseAdapter } from '@/utils/vrmPoseAdapter'
```

Keep `import * as THREE from 'three'` because expression, mouse, and root state still use Three.js values in this pass.

- [ ] **Step 2: Replace scene lifecycle variables**

Replace:

```ts
let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let renderer: THREE.WebGLRenderer
let vrm: VRM | null = null
let clock: THREE.Clock
```

with:

```ts
const runtime = new VrmRuntime()
const poseAdapter = new VrmPoseAdapter({
  useLegacyRawBoneFallback: true,
  devDiagnostics: import.meta.env.DEV,
})

let vrm: VRM | null = null
```

Keep `modelBasePosition`, `loadedModelUrl`, and expression state variables for now.

- [ ] **Step 3: Replace `initScene`**

Replace the current `initScene()` body with:

```ts
function initScene() {
  if (!canvasRef.value || !containerRef.value) return
  runtime.init(canvasRef.value, containerRef.value, props.variant)
  animate()
}
```

- [ ] **Step 4: Replace render-only branch in `animate`**

In `animate()`, replace:

```ts
const delta = clock.getDelta()
const t = clock.getElapsedTime()

if (!vrm) {
  if (renderer) renderer.render(scene, camera)
  return
}
```

with:

```ts
const delta = runtime.clock.getDelta()
const t = runtime.clock.getElapsedTime()

if (!vrm) {
  runtime.render()
  return
}
```

- [ ] **Step 5: Replace the raw-bone application block**

Replace this block:

```ts
vrm.update(delta)
updateExpressionWeights(delta, t)
vrm.scene.position.copy(modelBasePosition).add(motionFrame.rootOffset)

for (const [boneName, offsetQuat] of motionFrame.boneOffsets) {
  const rawBone = vrm.humanoid.getRawBoneNode(boneName)
  const baseQuat = rawRestPoses.get(boneName)
  if (rawBone && baseQuat) {
    const finalQuat = new THREE.Quaternion().copy(baseQuat).multiply(offsetQuat)
    rawBone.quaternion.copy(finalQuat)
  }
}
```

with:

```ts
poseAdapter.applyFrame(vrm, motionFrame, {
  basePosition: modelBasePosition,
  proceduralBones: STANDARD_VRM_PROCEDURAL_BONES,
})
const lookApplied = poseAdapter.applyLook(vrm, motionFrame.eyeLook)
if (!lookApplied) {
  updateEyeTargetsFromExpressions(motionFrame.eyeLook.x, motionFrame.eyeLook.y)
}
updateExpressionWeights(delta, t)
vrm.update(delta)
```

Remove the diagnostic raw-bone logging block that reads `rawLeftArm quaternion` after the old override. Keep higher-level load diagnostics if they still help.

- [ ] **Step 6: Update gaze expression reset placement**

Keep this reset before the adapter call:

```ts
for (const name of ['lookLeft', 'lookRight', 'lookUp', 'lookDown']) {
  for (const alias of expressionAliases(name)) targetExpressionWeights.set(alias, 0)
}
```

Remove the unconditional call that immediately follows it:

```ts
updateEyeTargetsFromExpressions(motionFrame.eyeLook.x, motionFrame.eyeLook.y)
```

The fallback call now lives behind `if (!lookApplied)`.

- [ ] **Step 7: Replace final render call**

Replace:

```ts
renderer.render(scene, camera)
```

with:

```ts
runtime.render()
```

- [ ] **Step 8: Replace `loadModel` internals**

Inside `loadModel(url: string)`, keep the loading guards and error handling. Replace the loader, cleanup, fitting, scene add, initial update, and raw rest pose capture logic with:

```ts
const modelInfo = ALL_VRM_MODELS.find(m => encodeURI(m.url) === encodeURI(url) || m.url === url)
useFlippedBones.value = modelInfo?.flippedSkeleton === true

const result = await runtime.loadModel({
  url,
  variant: props.variant,
  needsSceneFlip: modelInfo?.needsSceneFlip !== false,
})

vrm = result.vrm
modelBasePosition = result.basePosition.clone()
rawRestPoses.clear()
poseAdapter.attach(result.vrm, STANDARD_VRM_PROCEDURAL_BONES)
resetExpressionState()
```

Then keep the existing expression support detection, `proceduralMotion.reset()`, blink scheduling, directive application, loaded state updates, emits, diagnostics, and `startBlinkAnimation()`.

- [ ] **Step 9: Update resize and unmount**

Replace `handleResize()` with:

```ts
function handleResize() {
  if (!containerRef.value) return
  runtime.resize(containerRef.value)
}
```

In `onUnmounted`, replace direct renderer/VRM disposal:

```ts
if (vrm) { VRMUtils.deepDispose(vrm.scene); vrm = null }
if (renderer) renderer.dispose()
```

with:

```ts
runtime.dispose()
vrm = null
```

- [ ] **Step 10: Remove obsolete raw rest pose writes**

If `rawRestPoses` is no longer read in `VrmAvatar.vue` after the fallback moves into `VrmPoseAdapter`, remove this declaration from `VrmAvatar.vue`:

```ts
const rawRestPoses = new Map<VRMHumanBoneName, THREE.Quaternion>()
```

Keep `VRMHumanBoneName` imported only if another diagnostic or type still needs it. If not, remove:

```ts
import type { VRMHumanBoneName } from '@pixiv/three-vrm-core'
```

- [ ] **Step 11: Run type check**

Run:

```bash
npm run type-check
```

Expected: PASS, or fail only on unrelated pre-existing dirty-worktree errors. Any error from `VrmAvatar.vue`, `vrmRuntime.ts`, `vrmPoseAdapter.ts`, or `vrmProceduralMotion.ts` must be fixed before continuing.

- [ ] **Step 12: Commit VrmAvatar rewiring**

Run:

```bash
git add src/components/ai/interview/VrmAvatar.vue src/utils/vrmRuntime.ts src/utils/vrmPoseAdapter.ts src/utils/vrmProceduralMotion.ts
git commit -m "Apply VRM procedural motion through normalized poses" -m "Constraint: Keep VrmAvatar props, emits, exposed methods, lip sync, drag/drop, and avatar_motion behavior stable." -m "Rejected: Rewrite callers for the new runtime | The refactor boundary is internal to the VRM module." -m "Confidence: medium" -m "Scope-risk: moderate" -m "Directive: Browser-smoke all registered VRM models before removing the legacy raw-bone fallback." -m "Tested: npm run type-check passed for changed VRM files or only reported documented unrelated errors." -m "Not-tested: Browser smoke happens in the next task."
```

---

### Task 5: Build And Browser Smoke Verification

**Files:**
- Modify only if fixes are required: `src/components/ai/interview/VrmAvatar.vue`, `src/utils/vrmRuntime.ts`, `src/utils/vrmPoseAdapter.ts`, `src/utils/vrmProceduralMotion.ts`

- [ ] **Step 1: Run production build**

Run:

```bash
npm run build
```

Expected: PASS. If it fails in changed VRM files, fix before continuing. If it fails in unrelated dirty-worktree code, record the failing file and exact error in the final implementation report.

- [ ] **Step 2: Start the app**

Run:

```bash
npm run dev -- --host 127.0.0.1
```

Expected: Vite prints a local URL such as `http://127.0.0.1:5173/`. If port `5173` is occupied, use the next Vite-assigned port.

- [ ] **Step 3: Smoke the interview avatar path**

In the browser:

1. Open the AI interview page that renders `InterviewSimulationPanel`.
2. Confirm the AI interviewer VRM loads.
3. Confirm the candidate VRM loads.
4. Start or simulate assistant speaking so streaming text drives visemes.
5. Trigger thinking state and confirm the head nod is not inverted.
6. Move the mouse and confirm the head/gaze direction follows expected left/right and up/down.

Expected: No blank canvas, no console exception from `VrmRuntime`, `VrmPoseAdapter`, or `VrmAvatar`, and both avatars remain framed as before.

- [ ] **Step 4: Smoke the floating Agent path**

In the browser:

1. Open a route where the floating Agent launcher appears.
2. Confirm the selected Agent VRM loads.
3. Send or simulate a response that includes an `avatar_motion` directive with `body_action: "thinking_nod"`.
4. Send or simulate a response that includes `body_action: "arm_explain"`.
5. Send or simulate a response that includes `body_action: "soft_shake"`.
6. Confirm smile, brow, and eye target directives still affect the avatar.

Expected: The floating avatar remains framed in the launcher, gestures move in the expected direction, and directives do not appear in visible chat text.

- [ ] **Step 5: Smoke cross-model consistency**

Use the existing model selector or stored model setting to load these registry IDs:

```ts
[
  'interviewer-fangran',
  'interviewer-luxing',
  'candidate-asuka',
  'candidate-mia',
  'candidate-rayka',
  'candidate-john',
  'candidate-sergey',
]
```

For each model, visually verify:

- `thinking_nod` pitches the head in the same semantic direction.
- `soft_shake` yaws the head in the same semantic direction.
- `arm_explain` moves both arms with no obvious left/right inversion.
- `presenting_gesture` presents with the intended right-side gesture.
- Mouse gaze left/right and up/down is not inverted.

Expected: Minor body-proportion differences are acceptable; inverted head pitch, reversed look direction, or arms folding backward are not acceptable.

- [ ] **Step 6: Fix verification failures**

If a smoke failure is caused by normalized pose timing, adjust the update order in `VrmAvatar.vue` to:

```ts
poseAdapter.applyFrame(vrm, motionFrame, {
  basePosition: modelBasePosition,
  proceduralBones: STANDARD_VRM_PROCEDURAL_BONES,
})
updateExpressionWeights(delta, t)
const lookApplied = poseAdapter.applyLook(vrm, motionFrame.eyeLook)
if (!lookApplied) {
  updateEyeTargetsFromExpressions(motionFrame.eyeLook.x, motionFrame.eyeLook.y)
}
vrm.update(delta)
runtime.render()
```

If a smoke failure is caused by a single action amplitude, adjust only the relevant branch in `src/utils/vrmProceduralMotion.ts`. Keep the action name and caller contract unchanged.

- [ ] **Step 7: Re-run checks after fixes**

Run:

```bash
npm run type-check
npm run build
```

Expected: PASS, or only documented unrelated dirty-worktree failures.

- [ ] **Step 8: Commit verification fixes**

If any fixes were made in Task 5, run:

```bash
git add src/components/ai/interview/VrmAvatar.vue src/utils/vrmRuntime.ts src/utils/vrmPoseAdapter.ts src/utils/vrmProceduralMotion.ts
git commit -m "Stabilize normalized VRM motion smoke results" -m "Constraint: Fix only visual or update-order issues found while smoke-testing the normalized pose adapter." -m "Confidence: medium" -m "Scope-risk: narrow" -m "Directive: Keep the raw fallback until all registered VRM models pass repeated smoke checks." -m "Tested: npm run type-check; npm run build; browser smoke for interview and floating Agent avatars." -m "Not-tested: Automated visual regression is not available in this repo."
```

If no fixes were made, do not create an empty commit.

---

### Task 6: Final Review And Handoff

**Files:**
- Read: `docs/superpowers/specs/2026-07-06-vrm-normalized-pose-refactor-design.md`
- Read: `docs/superpowers/plans/2026-07-06-vrm-normalized-pose-refactor.md`
- Inspect: all files changed by implementation commits

- [ ] **Step 1: Confirm public contract stability**

Run:

```bash
rg -n "defineProps|defineEmits|defineExpose|avatar_motion|body_action|motionDirective|playLipSync|stopLipSync|setThinking|setIdle" src/components/ai/interview/VrmAvatar.vue src/components/agent/AgentAssistant.vue src/components/ai/interview/InterviewSimulationPanel.vue
```

Expected: `VrmAvatar.vue` still exposes the same methods and callers still pass the same props. `AgentAssistant.vue` still owns `avatar_motion` parsing.

- [ ] **Step 2: Confirm only intended files are staged**

Run:

```bash
git status --short
git diff --name-only HEAD
```

Expected: Implementation commits include only:

```text
src/components/ai/interview/VrmAvatar.vue
src/utils/vrmRuntime.ts
src/utils/vrmPoseAdapter.ts
src/utils/vrmProceduralMotion.ts
```

plus this plan file if the plan has not already been committed. Existing unrelated dirty files may still appear in `git status --short`; they must not be staged.

- [ ] **Step 3: Final verification commands**

Run:

```bash
npm run type-check
npm run build
```

Expected: PASS, or clearly documented unrelated failures.

- [ ] **Step 4: Final implementation report**

Report these exact items to the user:

```text
Changed files:
- src/components/ai/interview/VrmAvatar.vue
- src/utils/vrmRuntime.ts
- src/utils/vrmPoseAdapter.ts
- src/utils/vrmProceduralMotion.ts

Verified:
- npm run type-check
- npm run build
- Browser smoke: interview avatars
- Browser smoke: floating Agent avatar
- Browser smoke: all registered VRM models

Behavior preserved:
- VrmAvatar props/emits/exposed methods
- streaming lip sync and TTS lip sync
- avatar_motion hidden directive schema
- drag/drop VRM loading
- model selection callers

Remaining risk:
- Gesture proportions may still need per-action tuning after longer use, but model-axis inversion should be reduced by normalized pose application.
```

If any verification could not run, replace that line with the concrete command and failure reason.

---

## Self-Review Notes

- Spec coverage: Tasks cover runtime extraction, normalized pose adapter, current action vocabulary preservation, component contract preservation, fallback behavior, type/build verification, and browser smoke for A/B/C accuracy.
- Placeholder scan: This plan contains no deferred implementation slots; each code-changing task has exact paths, snippets, commands, and expected outcomes.
- Type consistency: `VrmRuntime`, `VrmPoseAdapter`, `VrmProceduralMotionFrame`, `VrmBodyAction`, and `VrmAvatar` names match existing or newly defined symbols.
