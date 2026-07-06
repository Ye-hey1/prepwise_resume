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
