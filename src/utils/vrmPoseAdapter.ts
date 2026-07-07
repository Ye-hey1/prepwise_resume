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
