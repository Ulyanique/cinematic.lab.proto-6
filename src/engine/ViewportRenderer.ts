import * as THREE from 'three'
import type { EvaluatedComposition, EvaluatedLayer } from '../core/evaluator'

export class ViewportRenderer {
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private layerMeshes = new Map<string, THREE.Mesh>()
  private container: HTMLElement

  constructor(container: HTMLElement) {
    this.container = container
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(container.clientWidth || 640, container.clientHeight || 360)
    container.appendChild(this.renderer.domElement)

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color('#09090b')
    this.scene.fog = new THREE.Fog('#09090b', 18, 65)

    this.camera = new THREE.PerspectiveCamera(
      45,
      (container.clientWidth || 640) / (container.clientHeight || 360),
      0.1,
      200,
    )
    this.camera.position.set(0, 0.5, 8)

    const ambient = new THREE.AmbientLight(0xffffff, 0.7)
    this.scene.add(ambient)

    const dir = new THREE.DirectionalLight(0xffd27d, 1.4)
    dir.position.set(4, 8, 10)
    this.scene.add(dir)

    const grid = new THREE.GridHelper(120, 40, 0x854d0e, 0x27272a)
    grid.position.y = -3.2
    this.scene.add(grid)
  }

  resize(): void {
    const w = this.container.clientWidth || 640
    const h = this.container.clientHeight || 360
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
  }

  private getOrCreateMesh(layer: EvaluatedLayer): THREE.Mesh {
    let mesh = this.layerMeshes.get(layer.id)
    if (!mesh) {
      const geo = new THREE.PlaneGeometry(5.6, 3.15)
      const mat = new THREE.MeshStandardMaterial({
        color: layer.type === '3d-panel' ? 0xd97706 : 0x0284c7,
        metalness: 0.35,
        roughness: 0.4,
        transparent: true,
        side: THREE.DoubleSide,
      })
      mesh = new THREE.Mesh(geo, mat)
      this.scene.add(mesh)
      this.layerMeshes.set(layer.id, mesh)
    }
    return mesh
  }

  render(evaluated: EvaluatedComposition, selectedLayerId: string | null): void {
    const activeIds = new Set<string>()
    let focusZ = 0
    let hasFocus = false

    for (const layer of evaluated.layers) {
      if (!layer.active) continue
      activeIds.add(layer.id)
      const mesh = this.getOrCreateMesh(layer)
      mesh.visible = true
      mesh.position.set(
        layer.transform.position[0],
        layer.transform.position[1],
        layer.transform.position[2],
      )
      mesh.rotation.set(
        layer.transform.rotation[0],
        layer.transform.rotation[1],
        layer.transform.rotation[2],
      )
      mesh.scale.set(layer.transform.scale[0], layer.transform.scale[1], layer.transform.scale[2])
      const mat = mesh.material as THREE.MeshStandardMaterial
      mat.opacity = layer.transform.opacity
      mat.emissive.setHex(layer.id === selectedLayerId ? 0x78350f : 0x000000)

      const mediaUrl = typeof layer.data?.mediaUrl === 'string' ? layer.data.mediaUrl : undefined
      const mediaKind = layer.data?.mediaKind === 'video' ? 'video' : 'image'
      if (mediaUrl) {
        let cached = this.mediaCache.get(layer.id)
        if (!cached || cached.url !== mediaUrl) {
          if (cached) cached.texture.dispose()
          if (mediaKind === 'video') {
            const video = document.createElement('video')
            video.src = mediaUrl
            video.muted = true
            video.playsInline = true
            video.loop = true
            const texture = new THREE.VideoTexture(video)
            texture.colorSpace = THREE.SRGBColorSpace
            cached = { url: mediaUrl, texture, video }
          } else {
            const texture = new THREE.TextureLoader().load(mediaUrl)
            texture.colorSpace = THREE.SRGBColorSpace
            cached = { url: mediaUrl, texture }
          }
          this.mediaCache.set(layer.id, cached)
          mat.map = cached.texture
          mat.color.setHex(0xffffff)
          mat.needsUpdate = true
        }
        if (cached.video && Number.isFinite(cached.video.duration) && cached.video.duration > 0) {
          const target = layer.mediaTime % cached.video.duration
          if (Math.abs(cached.video.currentTime - target) > 0.15) {
            cached.video.currentTime = target
          }
        }
      }

      if (!hasFocus) {
        focusZ = layer.transform.position[2]
        hasFocus = true
      }
    }

    for (const [id, mesh] of this.layerMeshes) {
      if (!activeIds.has(id)) {
        mesh.visible = false
      }
    }

    if (hasFocus) {
      this.camera.position.z += (focusZ + 8 - this.camera.position.z) * 0.15
    }

    this.renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    this.mediaCache.forEach((c) => c.texture.dispose())
    this.mediaCache.clear()
    this.layerMeshes.forEach((mesh) => {
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
    })
    this.layerMeshes.clear()
    this.renderer.dispose()
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement)
    }
  }
}
