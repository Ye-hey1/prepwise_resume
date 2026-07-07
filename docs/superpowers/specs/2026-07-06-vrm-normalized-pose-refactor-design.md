# VRM Normalized Pose Refactor Design

## Summary

Refactor the VRM avatar module so the existing procedural actions are applied through the `@pixiv/three-vrm` normalized humanoid path instead of post-`vrm.update()` raw-bone overrides.

The user-facing behavior stays the same: interview avatars, floating Agent avatar, model switching, drag-and-drop VRM loading, streaming lip sync, TTS lip sync, expression control, mouse gaze, and hidden `avatar_motion` directives all keep their current public contract.

## Context

The current VRM stack is concentrated in:

- `src/components/ai/interview/VrmAvatar.vue`
- `src/utils/vrmProceduralMotion.ts`
- `src/utils/lipSync.ts`
- `src/config/vrmModels.ts`

`VrmAvatar.vue` currently owns scene setup, renderer lifecycle, VRM loading, model fitting, expression state, mouse gaze, lip sync, procedural motion application, and component watchers. The procedural controller outputs additive quaternion offsets. The component calls `vrm.update(delta)`, then writes those offsets directly onto raw humanoid bones using a captured raw rest pose.

That approach can create lively motion, but it makes precision fragile. Different VRM files can differ in facing direction, rest pose, and local bone axes. A single Euler pitch/yaw/roll recipe applied to raw bones therefore needs per-model compensation, which is why `needsSceneFlip` and `flippedSkeleton` exist in the model registry.

## Reference Basis

The refactor follows the public `@pixiv/three-vrm` model:

- Use `GLTFLoader` plus `VRMLoaderPlugin` to load VRM files.
- Use `VRM.update(delta)` in the render loop to update humanoid, expressions, lookAt, constraints, spring bones, and materials.
- Use `VRMHumanoid.setNormalizedPose()` for model-normalized humanoid poses.
- Use `VRM.lookAt` when available for gaze; fall back to expression look presets when unavailable.
- Use `VRMExpressionManager.setValue()` for expressions and visemes.

Primary references:

- https://github.com/pixiv/three-vrm
- https://pixiv.github.io/three-vrm/docs/modules/three-vrm.html
- Local installed package types under `node_modules/@pixiv/three-vrm-core/types`.

## Goals

- Improve gesture direction accuracy for arms, hands, and authored body actions.
- Improve head and gaze accuracy for mouse tracking, thinking, speaking, nodding, and shaking.
- Improve consistency across the current male and female VRM models without changing the visible feature set.
- Reduce the size and responsibility of `VrmAvatar.vue`.
- Preserve the current procedural motion vocabulary and all caller-facing props, emits, exposed methods, and `avatar_motion` JSON schema.
- Keep the migration reversible with a fallback path while validating normalized pose behavior.

## Non-Goals

- Do not introduce new visual features or new public avatar controls.
- Do not replace the current procedural action vocabulary with VRMA or external animation assets.
- Do not change lip-sync timing or text-to-viseme heuristics beyond keeping them compatible with the new runtime.
- Do not change interview or Agent business flows.
- Do not add new dependencies.

## Proposed Architecture

### Component Shell

`VrmAvatar.vue` remains the public Vue component. It should keep:

- Props: `modelUrl`, `isSpeaking`, `streamingText`, `avatarStateOverride`, `variant`, `showStatus`, `motionDirective`.
- Emits: `model-loaded`, `model-error`, `lip-sync-state`.
- Exposed methods: `playLipSync`, `stopLipSync`, `setExpression`, `setThinking`, `setIdle`, `loadModel`, `applyMotionDirective`, `isModelLoaded`.
- Template, loading state, drop zone, and status UI.

The component should delegate renderer, VRM lifecycle, pose application, and expression application to smaller utilities.

### Runtime Layer

Add `src/utils/vrmRuntime.ts`.

Responsibilities:

- Create and own `THREE.Scene`, `PerspectiveCamera`, `WebGLRenderer`, and `THREE.Clock`.
- Configure lighting and camera based on `variant`.
- Load VRM models with `GLTFLoader` and `VRMLoaderPlugin`.
- Fit and position models using the existing interview and floating-agent framing.
- Dispose previous VRM scenes and renderer resources safely.
- Resize renderer and camera from container dimensions.
- Expose a small runtime API: `init`, `loadModel`, `resize`, `render`, `dispose`, and current `vrm`.

This keeps the Vue file focused on reactive state and event wiring.

### Pose Adapter Layer

Add `src/utils/vrmPoseAdapter.ts`.

Responsibilities:

- Detect available humanoid bones for the loaded VRM.
- Convert procedural action output into a `VRMPose` suitable for `vrm.humanoid.setNormalizedPose()`.
- Apply only bones present on the current model.
- Prefer normalized humanoid application over raw-bone mutation.
- Apply root offset separately to `vrm.scene.position`.
- Apply gaze through `vrm.lookAt` when available.
- Fall back to `lookLeft`, `lookRight`, `lookUp`, and `lookDown` expression presets if `vrm.lookAt` is unavailable.
- Provide a local fallback switch that can temporarily re-enable the legacy raw-bone path during validation.

The adapter is the main boundary that makes model-specific differences explicit and testable.

### Motion Controller

Keep `src/utils/vrmProceduralMotion.ts`, but narrow its role.

It should continue to:

- Define `VrmBodyAction`.
- Hold the existing action vocabulary: `idle`, `thinking_nod`, `soft_shake`, `relaxed_wave`, `gentle_pace`, `folded_arms`, `presenting_gesture`, `arm_explain`.
- Generate layered procedural motion from avatar state, elapsed time, look target, variant, and model profile.
- Preserve micro-motion, breathing, speaking emphasis, and action transitions.

It should stop assuming it is producing final raw-bone quaternions. Its output should be treated as normalized pose intent consumed by `vrmPoseAdapter`.

### Expression And Lip Sync

Keep `src/utils/lipSync.ts` behavior unchanged.

Move expression smoothing out of the large component if it can be done cleanly during implementation, but keep:

- `aa`, `ih`, `ou`, `ee`, `oh` viseme targets.
- Blink scheduling.
- Persistent emotional expression targets.
- Directive-driven emotion and expression weights.
- `inferExpression(text)` behavior.

Expressions still write through `vrm.expressionManager.setValue()`.

## Data Flow

1. `InterviewSimulationPanel` or `AgentAssistant` passes the same props to `VrmAvatar`.
2. `VrmAvatar` updates avatar state from speaking, streaming text, explicit overrides, and motion directives.
3. `VrmProceduralMotionController.update()` returns a procedural motion frame.
4. `vrmPoseAdapter` converts the frame into normalized humanoid pose plus root offset and gaze.
5. Runtime applies the normalized pose, expressions, lookAt, `vrm.update(delta)`, root offset, and render.
6. Existing emits and exposed methods report the same state to callers.

The exact update order should be validated in implementation, but the target order is:

1. Build action, gaze, expression, and lip-sync targets.
2. Reset or overwrite the normalized pose for the frame.
3. Apply normalized pose through `setNormalizedPose`.
4. Apply expression targets.
5. Apply lookAt target or expression gaze fallback.
6. Call `vrm.update(delta)`.
7. Apply scene root offset and render.

## Why This Should Improve Precision

Raw-bone overrides are tied to each model's imported skeleton. They are useful as an escape hatch, but they bypass the normalized humanoid abstraction. Small axis differences then become visible as wrong hand direction, inverted head pitch, or inconsistent left/right motion.

`setNormalizedPose()` accepts local transforms relative to the normalized T-pose. That gives the motion layer a model-normalized target and lets `three-vrm` transfer the pose to the raw skeleton. This should reduce the need for model-specific flags and make the same gesture library behave more consistently across the current VRM set.

## Compatibility

The refactor must preserve:

- Existing model registry fields.
- Interview page dual-avatar layout.
- Floating Agent launcher avatar.
- Drag-and-drop local `.vrm` loading.
- TTS and streaming-text lip sync.
- Mouse gaze tracking.
- `avatarStateOverride`.
- `motionDirective`.
- Hidden `avatar_motion` comment parsing in `AgentAssistant`.
- Current model-loaded and model-error events.

`needsSceneFlip` may still be needed for scene-facing direction. `flippedSkeleton` should become less important for normalized pose application, but keep it until browser validation proves it can be retired.

## Error Handling

- If a model lacks a bone, skip that bone for the frame.
- If `setNormalizedPose()` fails unexpectedly, log a development diagnostic and use the legacy raw-bone fallback for that frame or model.
- If `vrm.lookAt` is missing, use expression gaze fallback.
- If an expression name is unsupported, ignore it after capability detection.
- If model loading fails, keep the existing `model-error` emit behavior.
- Dispose the previous VRM before replacing it to avoid leaked scenes and stale expression state.

## Testing Plan

### Static Checks

- Run `npm run type-check`.
- Run `npm run build-only` or full `npm run build`.

### Focused Code Checks

- Verify `vrmPoseAdapter` converts representative action frames into valid `VRMPose` objects.
- Verify missing bones are skipped without throwing.
- Verify expression aliases only target supported expression names.
- Verify runtime dispose can be called repeatedly.

### Browser Smoke

In the existing app:

- Load each current registered VRM model.
- Switch between interviewer and candidate models.
- Trigger `idle`, `thinking_nod`, `soft_shake`, `folded_arms`, `presenting_gesture`, and `arm_explain`.
- Verify head pitch/yaw follows the cursor in both interview and floating-agent variants.
- Verify streaming text still drives mouth visemes.
- Verify TTS playback still starts and stops lip sync.
- Verify hidden `avatar_motion` directives still change body action, emotion, gaze, and transition speed.

Acceptance focus:

- Arms move in the expected left/right and forward/back direction.
- Head nod and shake do not invert across model groups.
- Same action looks broadly consistent across all current VRM files.
- Existing UI behavior and public component contract do not change.

## Migration Plan

1. Extract renderer and model lifecycle from `VrmAvatar.vue` into `vrmRuntime.ts` without changing behavior.
2. Add `vrmPoseAdapter.ts` with normalized pose application and a legacy raw fallback.
3. Route procedural motion through the adapter.
4. Keep expression and lip-sync behavior stable while moving only mechanical state if needed.
5. Run type/build checks.
6. Run browser smoke across the current model set.
7. Remove or reduce legacy raw fallback only after visual verification passes.

## Risks

- `setNormalizedPose()` may require pose quaternions tuned relative to normalized T-pose, so existing raw-bone offsets may need small calibration.
- Some gestures such as folded arms may still need model-profile tuning because VRM humanoid normalization does not solve body proportions.
- `vrm.lookAt` behavior differs between models that use bone lookAt and expression lookAt, so fallback logic must remain.
- Existing dirty workspace changes include VRM files and adjacent Agent work, so implementation must stage and commit only files touched by this task.

## Stop Condition

The design is complete when a future implementation keeps all current avatar features working, applies procedural pose through normalized humanoid APIs by default, passes type/build checks, and browser smoke confirms A/B/C: hand gesture direction, head/gaze direction, and cross-model consistency.
