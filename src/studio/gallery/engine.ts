import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { MEDIA, FLASH_T, END_T, CLIP_T0, CLIP_DT, PANEL_BEFORE, PANEL_AFTER, clipCenter } from './config'
import { MediaSlot } from './media'
import { clipMediaTime, continuousCameraTime, finaleDim, lightOrbit, lightPanelIndex, lightVisibility, panelMote } from './timeline'
import { Finale } from './finale'
import { dotTexture, glowTexture, starTexture } from './textures'

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

// ── движение камеры вдоль кривой ──
const V = 4
const gT = (t: number) => (t <= 0 ? 0 : t < 2 ? (t * t) / 4 : t - 1)
const S = (t: number) => V * gT(t)

// Непрерывная траектория: замедление у медиа без остановки камеры.
const cameraTime = (t: number) => continuousCameraTime(t, CLIP_T0, clipCenter(MEDIA.length - 1), CLIP_DT, FLASH_T)

const FLOOR_Y = -4
const PANEL_W = 11.6
const PANEL_H = 6.525
const PANEL_DIST = 11.5
const FIN_Y = 1000

type Pose = { p: THREE.Vector3; r: THREE.Vector3; u: THREE.Vector3 }

interface Panel {
  root: THREE.Group
  fly: THREE.Group
  mat: THREE.ShaderMaterial
  slot: MediaSlot
  side: number
  roll: number
  tc: number
  pos: THREE.Vector3
  flare: THREE.Sprite
  frameMat: THREE.MeshStandardMaterial
  edgeMat: LineMaterial
  motes: THREE.Points
}

export class GalleryEngine {
  private container: HTMLElement
  private renderer: THREE.WebGLRenderer
  private composer: EffectComposer
  private bloom: UnrealBloomPass
  private finalPass: ShaderPass
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(52, 1, 0.1, 3000)
  private corridor = new THREE.Group()
  private finale: Finale
  private lineMats: LineMaterial[] = []
  private panels: Panel[] = []
  private slots: MediaSlot[] = []
  private raf = 0
  private startedAt = 0
  private pr = 1

  // кривая
  private curveLen = 0
  private table: Pose[] = []
  private tableStep = 0.5
  private sStar = 0

  // комета
  private trails: { geo: LineSegmentsGeometry; line: LineSegments2 }[] = []
  private cometLight: THREE.PointLight
  private cometHead: THREE.Sprite
  private cometGlow: THREE.Sprite
  private trailParticles: THREE.Points
  private particleSeeds: { phase: number; spread: number; tangent: number; strand: number; twinkle: number }[] = []
  private starSprite: THREE.Sprite
  private starGlow: THREE.Sprite
  private starLight: THREE.PointLight
  private camLight: THREE.PointLight
  private panelLight: THREE.PointLight

  time = 0
  playing = false
  onFrame?: (t: number) => void
  onEnd?: () => void
  onVideoError?: (message: string) => void
  private disposed = false
  private exporting = false
  private previewingVideo = false
  private timeBeforeExport = 0
  private playingBeforeExport = false
  private videoTimesBeforeExport: (number | undefined)[] = []

  /** Ручной режим: без собственного RAF-цикла — кадр рисует адаптер студии
   *  через renderAt(t), поэтому предпросмотр и экспорт идут одним путём. */
  private manual = false

  constructor(container: HTMLElement, options: { manual?: boolean } = {}) {
    this.manual = Boolean(options.manual)
    this.container = container
    this.pr = Math.min(window.devicePixelRatio || 1, 2)

    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' })
    renderer.setPixelRatio(this.pr)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 0.72
    renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block'
    container.appendChild(renderer.domElement)
    this.renderer = renderer

    this.scene.background = new THREE.Color(0x070402)
    this.scene.fog = new THREE.FogExp2(0x0d0804, 0.0115)
    this.scene.add(this.corridor)

    this.buildEnvironment()
    this.buildCurve()
    const goldMat = this.buildLights()
    this.buildShards()
    this.buildFloor()
    this.buildDust()

    // комета
    const lm = this.makeLineMat(0.9, true)
    // Additive blending makes zero-intensity tail segments transparent, not black.
    lm.transparent = true
    lm.blending = THREE.AdditiveBlending
    lm.depthWrite = false
    lm.fog = false
    for (let j = 0; j < 3; j++) {
      const geo = new LineSegmentsGeometry()
      const n = 90
      geo.setPositions(new Float32Array((n - 1) * 6))
      geo.setColors(new Float32Array((n - 1) * 6))
      const line = new LineSegments2(geo, lm)
      line.frustumCulled = false
      this.corridor.add(line)
      this.trails.push({ geo, line })
    }
    const star = starTexture(12, 5)
    const glow = glowTexture()
    const spriteMat = (map: THREE.Texture) =>
      new THREE.SpriteMaterial({ map, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true })
    this.cometHead = new THREE.Sprite(spriteMat(star))
    this.cometGlow = new THREE.Sprite(spriteMat(glow))
    this.corridor.add(this.cometHead, this.cometGlow)

    const particleCount = 180
    const particleGeometry = new THREE.BufferGeometry()
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(particleCount * 3), 3))
    particleGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(particleCount * 3), 3))
    for (let i = 0; i < particleCount; i++) {
      this.particleSeeds.push({ phase: Math.random(), spread: Math.random(), tangent: rand(-1, 1), strand: i % 3, twinkle: Math.random() * Math.PI * 2 })
    }
    this.trailParticles = new THREE.Points(particleGeometry, new THREE.PointsMaterial({
      map: dotTexture(), size: 0.14, vertexColors: true, blending: THREE.AdditiveBlending,
      transparent: true, depthWrite: false, fog: false, opacity: 0.9,
    }))
    this.trailParticles.frustumCulled = false
    this.corridor.add(this.trailParticles)

    this.cometLight = new THREE.PointLight(0xffb85c, 0, 0, 2)
    this.scene.add(this.cometLight)
    this.camLight = new THREE.PointLight(0xffe2b0, 60, 0, 2)
    this.scene.add(this.camLight)
    this.panelLight = new THREE.PointLight(0xffc070, 0, 0, 2)
    this.scene.add(this.panelLight)

    // звезда в конце коридора
    this.starSprite = new THREE.Sprite(spriteMat(starTexture(16, 9)))
    this.starGlow = new THREE.Sprite(spriteMat(glow))
    this.corridor.add(this.starSprite, this.starGlow)
    this.starLight = new THREE.PointLight(0xffd08a, 0, 0, 2)
    this.scene.add(this.starLight)
    const sp = this.sample(this.sStar).p
    this.starSprite.position.copy(sp)
    this.starGlow.position.copy(sp)
    this.starLight.position.copy(sp)

    this.buildPanels()

    // финал
    this.finale = new Finale(goldMat, this.pr)
    this.finale.group.position.set(0, FIN_Y, 0)
    this.scene.add(this.finale.group)
    const fl = this.finale.light
    fl.position.set(0, 0, 0)

    // пост-обработка
    const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: 4 })
    this.composer = new EffectComposer(renderer, rt)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.5, 0.6, 1.05)
    this.composer.addPass(this.bloom)
    this.finalPass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uTime: { value: 0 },
        uFlash: { value: 0 },
        uFade: { value: 0 },
        uFinaleDim: { value: 0 },
        uAberr: { value: 0.0025 },
        uRes: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse; uniform float uTime, uFlash, uFade, uAberr, uFinaleDim; uniform vec2 uRes;
        varying vec2 vUv;
        float hash(vec2 p){ p = fract(p*vec2(443.897,441.423)); p += dot(p,p.yx+19.19); return fract((p.x+p.y)*p.x); }
        void main(){
          vec2 c = vUv-0.5;
          float r2 = dot(c,c);
          vec2 off = c*r2*uAberr*(1.0+uFlash*3.0);
          vec3 col;
          col.r = texture2D(tDiffuse, vUv+off).r;
          col.g = texture2D(tDiffuse, vUv).g;
          col.b = texture2D(tDiffuse, vUv-off).b;
          // анаморфный горизонтальный блеск ярких мест
          vec3 st = vec3(0.0);
          for(int i=1;i<=6;i++){
            float f = float(i)/6.0;
            vec3 a = texture2D(tDiffuse, vUv+vec2(f*0.09,0.0)).rgb + texture2D(tDiffuse, vUv-vec2(f*0.09,0.0)).rgb;
            st += max(a-1.6, 0.0)*(1.0-f);
          }
          col += st*vec3(1.0,0.72,0.35)*0.05;
          col *= 1.0 - smoothstep(0.28,0.95,length(c*vec2(1.0,0.85))*1.25)*0.62;
          col += uFlash*vec3(1.0,0.93,0.78)*2.6;
          col *= 1.0 - uFinaleDim;
          float n = hash(vUv*uRes + fract(uTime)*91.7);
          col += (n-0.5)*0.012*(1.0-uFinaleDim);
          col *= 1.0-uFade;
          gl_FragColor = vec4(max(col,0.0),1.0);
        }`,
    })
    this.composer.addPass(this.finalPass)
    this.composer.addPass(new OutputPass())

    this.resize()
    window.addEventListener('resize', this.resize)

    // прогрев шейдеров — чтобы не было рывка в момент взрыва
    this.panels.forEach((p) => (p.root.visible = true))
    this.finale.group.visible = true
    renderer.compile(this.scene, this.camera)
    this.finale.group.visible = false
    this.panels.forEach((p) => (p.root.visible = false))

    this.update(0)
    this.loop = this.loop.bind(this)
    if (!this.manual) this.raf = requestAnimationFrame(this.loop)
  }

  /** Холст движка: адаптер копирует его в кадр сцены. */
  get canvas() { return this.renderer.domElement }

  /** Синхронный кадр на время t (предпросмотр и экспорт). */
  renderAt(t: number) {
    if (this.disposed) return
    this.time = Math.max(0, Math.min(END_T, Number.isFinite(t) ? t : 0))
    this.update(this.time)
    this.composer.render()
  }

  /** Играют ли видео слотов в предпросмотре (адаптер ставит по паузе пульта). */
  setPlaying(playing: boolean) { this.playing = playing }

  /** Загрузить файл (видео или фото) в один слот; возвращает успех. */
  async assignSlotFile(index: number, file: Blob): Promise<boolean> {
    const slot = this.slots[index]
    if (!slot || this.disposed) return false
    const kind = file.type.startsWith('video/') ? 'video' : file.type.startsWith('image/') ? 'photo' : null
    if (!kind) return false
    return slot.load(URL.createObjectURL(file), kind, true)
  }

  /** Вернуть слот к плейсхолдеру. */
  clearSlot(index: number) { this.slots[index]?.clear() }

  /** Занят ли слот загруженным файлом. */
  slotFilled(index: number) { return Boolean(this.slots[index]?.userMedia) }

  /** Покадровая подготовка экспорта: перемотать активные видео на кадр t. */
  async prepareExportFrame(t: number) {
    if (this.disposed) throw new Error('Галерея недоступна.')
    const active = this.panels.filter((p) => t > p.tc - PANEL_BEFORE && t < p.tc + PANEL_AFTER && p.slot.video)
    await Promise.all(active.map(async (p) => {
      const video = p.slot.video!
      if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error('Не удалось определить длительность видео в одном из слотов.')
      const target = clipMediaTime(t, p.tc, PANEL_BEFORE, video.duration)
      if (Math.abs(video.currentTime - target) > 0.0001 || video.readyState < 2) {
        await new Promise<void>((resolve, reject) => {
          const timer = window.setTimeout(() => finish(new Error('Не удалось декодировать кадр загруженного видео.')), 15000)
          const finish = (error?: Error) => {
            clearTimeout(timer)
            video.removeEventListener('seeked', onSeeked)
            video.removeEventListener('error', onError)
            error ? reject(error) : resolve()
          }
          const onSeeked = () => finish()
          const onError = () => finish(new Error('Ошибка чтения загруженного видео.'))
          video.addEventListener('seeked', onSeeked, { once: true })
          video.addEventListener('error', onError, { once: true })
          video.currentTime = target
        })
      }
      p.slot.texture.needsUpdate = true
    }))
  }

  // ───────────────────────── построение сцены ─────────────────────────

  private buildEnvironment() {
    const s = new THREE.Scene()
    s.background = new THREE.Color(0x0a0603)
    s.add(new THREE.Mesh(new THREE.BoxGeometry(80, 40, 80), new THREE.MeshBasicMaterial({ color: 0x1b1008, side: THREE.BackSide })))
    const add = (w: number, h: number, pos: [number, number, number], look: [number, number, number], col: number, k: number) => {
      const c = new THREE.Color(col).multiplyScalar(k)
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }))
      m.position.set(...pos)
      m.lookAt(...look)
      s.add(m)
    }
    add(50, 3, [0, 18, 0], [0, 0, 0], 0xfff0cc, 14)
    add(40, 2, [0, 18, 14], [0, 0, 0], 0xffcf88, 9)
    add(3, 26, [-30, 2, -6], [0, 0, 0], 0xffd9a0, 10)
    add(3, 26, [30, 2, 8], [0, 0, 0], 0xffc070, 8)
    add(20, 14, [0, 6, -34], [0, 0, 0], 0xff9c3a, 3.2)
    add(26, 10, [0, 4, 34], [0, 0, 0], 0xffb35a, 2.2)
    add(6, 6, [-14, 10, 20], [0, 0, 0], 0xffffff, 16)
    add(4, 18, [18, 0, -22], [0, 0, 0], 0xfff2d0, 12)
    const pm = new THREE.PMREMGenerator(this.renderer)
    this.scene.environment = pm.fromScene(s, 0.035).texture
    this.scene.environmentIntensity = 0.32
    pm.dispose()
  }

  private buildCurve() {
    const X = [0, 0, 2.5, -3, 3.5, -3.5, 3, -3, 2.5, -2, 1, 0]
    const pts = X.map((x, k) => new THREE.Vector3(x, 3 + 1.2 * Math.sin(k * 1.3), 10 - k * 38))
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal')
    this.curveLen = curve.getLength()
    const N = Math.ceil(this.curveLen / this.tableStep)
    const sp = curve.getSpacedPoints(N)
    const up = new THREE.Vector3(0, 1, 0)
    for (let i = 0; i <= N; i++) {
      const a = sp[Math.max(i - 1, 0)]
      const b = sp[Math.min(i + 1, N)]
      const tan = b.clone().sub(a).normalize()
      const r = new THREE.Vector3().crossVectors(tan, up).normalize()
      const u = new THREE.Vector3().crossVectors(r, tan).normalize()
      this.table.push({ p: sp[i].clone(), r, u })
    }
    this.sStar = S(FLASH_T) + 14
  }

  private poseCam: Pose = { p: new THREE.Vector3(), r: new THREE.Vector3(), u: new THREE.Vector3() }
  private poseTmp: Pose = { p: new THREE.Vector3(), r: new THREE.Vector3(), u: new THREE.Vector3() }
  private sample(s: number, out: Pose = this.poseTmp): Pose {
    const n = this.table.length - 1
    const f = Math.min(Math.max(s / this.tableStep, 0), n - 0.001)
    const i = Math.floor(f)
    const k = f - i
    const a = this.table[i]
    const b = this.table[i + 1]
    out.p.lerpVectors(a.p, b.p, k)
    out.r.lerpVectors(a.r, b.r, k)
    out.u.lerpVectors(a.u, b.u, k)
    return out
  }

  private buildLights() {
    this.scene.add(new THREE.HemisphereLight(0xffd7a0, 0x20120a, 0.18))
    return new THREE.MeshStandardMaterial({ color: 0xd9a441, metalness: 0.9, roughness: 0.3, flatShading: true })
  }

  private makeLineMat(width: number, vertexColors: boolean) {
    const m = new LineMaterial({ color: 0xffffff, linewidth: width, vertexColors, worldUnits: false })
    m.fog = true
    this.lineMats.push(m)
    return m
  }

  private buildShards() {
    const mats = [
      new THREE.MeshStandardMaterial({ color: 0xcf9a3c, metalness: 0.88, roughness: 0.32, flatShading: true }),
      new THREE.MeshStandardMaterial({ color: 0x8a6126, metalness: 0.85, roughness: 0.42, flatShading: true }),
      new THREE.MeshStandardMaterial({ color: 0xe6cb8e, metalness: 0.9, roughness: 0.26, flatShading: true }),
      new THREE.MeshStandardMaterial({ color: 0x3a2a17, metalness: 0.8, roughness: 0.5, flatShading: true }),
    ]
    const pickMat = () => mats[Math.random() < 0.34 ? 0 : Math.random() < 0.45 ? 1 : Math.random() < 0.6 ? 2 : 3]

    const mirror = new THREE.Group()
    mirror.scale.y = -1
    mirror.position.y = 2 * FLOOR_Y

    const linePos: number[] = []
    const lineCol: number[] = []
    const base = new THREE.Color(1.0, 0.8, 0.42)
    const v = new THREE.Vector3()
    const v2 = new THREE.Vector3()

    const addShard = (geo: THREE.BufferGeometry, pos: THREE.Vector3, rot: THREE.Euler) => {
      const m = new THREE.Mesh(geo, pickMat())
      m.position.copy(pos)
      m.rotation.copy(rot)
      m.updateMatrix()
      this.corridor.add(m)
      const mc = new THREE.Mesh(geo, m.material)
      mc.position.copy(pos)
      mc.rotation.copy(rot)
      mirror.add(mc)
      // светящиеся рёбра
      const eg = new THREE.EdgesGeometry(geo, 22)
      const p = eg.getAttribute('position')
      const prob = Math.random() < 0.55 ? 0.13 : 0.04
      for (let i = 0; i < p.count; i += 2) {
        v.fromBufferAttribute(p, i)
        v2.fromBufferAttribute(p, i + 1)
        const len = v.distanceTo(v2)
        if (len < 2.2 || Math.random() > prob) continue
        v.applyMatrix4(m.matrix)
        v2.applyMatrix4(m.matrix)
        const k = 0.45 + Math.pow(Math.random(), 2) * 0.8
        linePos.push(v.x, v.y, v.z, v2.x, v2.y, v2.z)
        lineCol.push(base.r * k, base.g * k, base.b * k, base.r * k, base.g * k, base.b * k)
        // отражение
        const kk = k * 0.38
        linePos.push(v.x, 2 * FLOOR_Y - v.y, v.z, v2.x, 2 * FLOOR_Y - v2.y, v2.z)
        lineCol.push(base.r * kk, base.g * kk, base.b * kk, base.r * kk, base.g * kk, base.b * kk)
      }
      eg.dispose()
    }

    const total = S(FLASH_T) + 70
    const P = new THREE.Vector3()
    // колонны
    for (let n = 0; n < 75; n++) {
      const s = rand(-15, total)
      const side = Math.random() < 0.5 ? -1 : 1
      const d = 23 + Math.pow(Math.random(), 1.3) * 32
      const pose = this.sample(s)
      P.copy(pose.p).addScaledVector(pose.r, side * d)
      P.y = FLOOR_Y - 1.5
      const h = rand(14, 62)
      const pts: THREE.Vector3[] = []
      const lean = new THREE.Vector3(rand(-1, 1) * 9, 0, rand(-1, 1) * 9)
      const rx = rand(2.5, 7.5)
      const rz = rand(2, 6.5)
      const a0 = Math.random() * 6.28
      for (let k = 0; k < 5; k++) {
        const a = a0 + (k / 5) * 6.28 + rand(-0.3, 0.3)
        pts.push(new THREE.Vector3(Math.cos(a) * rx, 0, Math.sin(a) * rz))
      }
      for (let k = 0; k < 4; k++) {
        const a = a0 + (k / 4) * 6.28 + rand(-0.4, 0.4)
        const y = h * rand(0.35, 0.65)
        pts.push(new THREE.Vector3(Math.cos(a) * rx * 0.85 + lean.x * 0.5, y, Math.sin(a) * rz * 0.85 + lean.z * 0.5))
      }
      const tops = 3 + Math.floor(Math.random() * 2)
      for (let k = 0; k < tops; k++) {
        const a = a0 + (k / tops) * 6.28 + rand(-0.5, 0.5)
        pts.push(new THREE.Vector3(Math.cos(a) * rx * rand(0.15, 0.55) + lean.x, h * rand(0.82, 1.04), Math.sin(a) * rz * rand(0.15, 0.55) + lean.z))
      }
      addShard(new ConvexGeometry(pts), P, new THREE.Euler(rand(-0.05, 0.05), Math.random() * 6.28, rand(-0.05, 0.05)))
    }
    // парящие кристаллы
    for (let n = 0; n < 20; n++) {
      const s = rand(-10, total)
      const side = Math.random() < 0.5 ? -1 : 1
      const d = rand(24, 42)
      const pose = this.sample(s)
      P.copy(pose.p).addScaledVector(pose.r, side * d)
      P.y = rand(6, 42)
      const sz = rand(2.5, 8)
      const pts: THREE.Vector3[] = []
      for (let k = 0; k < 9; k++) pts.push(new THREE.Vector3(rand(-1, 1) * sz, rand(-1, 1) * sz * 1.7, rand(-1, 1) * sz))
      addShard(new ConvexGeometry(pts), P, new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6))
    }
    // потолочные «крылья» над трассой
    for (let n = 0; n < 8; n++) {
      const s = rand(0, total)
      const pose = this.sample(s)
      P.copy(pose.p).addScaledVector(pose.r, rand(-10, 10))
      P.y = rand(30, 52)
      const w = rand(10, 24)
      const pts: THREE.Vector3[] = []
      for (let k = 0; k < 8; k++) pts.push(new THREE.Vector3(rand(-1, 1) * w, rand(-1, 1) * 1.4, rand(-1, 1) * w))
      addShard(new ConvexGeometry(pts), P, new THREE.Euler(rand(-0.3, 0.3), Math.random() * 6, rand(-0.3, 0.3)))
    }

    this.corridor.add(mirror)

    const g = new LineSegmentsGeometry()
    g.setPositions(linePos)
    g.setColors(lineCol)
    const lines = new LineSegments2(g, this.makeLineMat(0.8, true))
    lines.frustumCulled = false
    this.corridor.add(lines)
  }

  private buildFloor() {
    const f = new THREE.Mesh(
      new THREE.PlaneGeometry(260, 560),
      new THREE.MeshStandardMaterial({ color: 0x0f0a06, metalness: 0.85, roughness: 0.22, transparent: true, opacity: 0.8, envMapIntensity: 0.7 }),
    )
    f.rotation.x = -Math.PI / 2
    f.position.set(0, FLOOR_Y, -200)
    this.corridor.add(f)

    // Низкополигональные грани лежат на полу, а не парят в воздухе.
    const cols = 18, rows = 38
    const points: THREE.Vector3[][] = []
    for (let z = 0; z <= rows; z++) {
      const row: THREE.Vector3[] = []
      for (let x = 0; x <= cols; x++) {
        const px = -90 + x * (180 / cols) + (x === 0 || x === cols ? 0 : rand(-2.2, 2.2))
        const pz = 40 - z * (290 / rows) + (z === 0 || z === rows ? 0 : rand(-1.8, 1.8))
        row.push(new THREE.Vector3(px, FLOOR_Y + 0.025, pz))
      }
      points.push(row)
    }
    const vertices: number[] = [], colors: number[] = [], edges: number[] = []
    const palette = [0x251a10, 0x352418, 0x49331c, 0x1b1510, 0x5a3e22]
    const addTriangle = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
      const color = new THREE.Color(palette[Math.floor(Math.random() * palette.length)])
      for (const point of [a, b, c]) {
        vertices.push(point.x, point.y, point.z)
        colors.push(color.r, color.g, color.b)
      }
      for (const [p, q] of [[a, b], [b, c], [c, a]]) {
        edges.push(p.x, p.y + 0.008, p.z, q.x, q.y + 0.008, q.z)
      }
    }
    for (let z = 0; z < rows; z++) {
      for (let x = 0; x < cols; x++) {
        const a = points[z][x], b = points[z][x + 1], c = points[z + 1][x], d = points[z + 1][x + 1]
        if ((x + z) % 2) { addTriangle(a, b, c); addTriangle(b, d, c) }
        else { addTriangle(a, b, d); addTriangle(a, d, c) }
      }
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geometry.computeVertexNormals()
    const facets = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
      vertexColors: true, metalness: 0.68, roughness: 0.42, transparent: true, opacity: 0.52, depthWrite: false, side: THREE.DoubleSide,
    }))
    this.corridor.add(facets)
    const edgeGeometry = new THREE.BufferGeometry()
    edgeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(edges, 3))
    const seams = new THREE.LineSegments(edgeGeometry, new THREE.LineBasicMaterial({
      color: 0xc39a60, transparent: true, opacity: 0.12, depthWrite: false,
    }))
    this.corridor.add(seams)
  }

  private buildDust() {
    const N = 550
    const g = new THREE.BufferGeometry()
    const pos = new Float32Array(N * 3)
    const total = S(FLASH_T) + 40
    for (let i = 0; i < N; i++) {
      const pose = this.sample(rand(0, total))
      const p = pose.p.clone().addScaledVector(pose.r, rand(-22, 22))
      p.y = rand(FLOOR_Y + 0.5, 30)
      pos.set([p.x, p.y, p.z], i * 3)
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const pts = new THREE.Points(
      g,
      new THREE.PointsMaterial({ map: dotTexture(), size: 0.06, color: 0xffcf80, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.3 }),
    )
    this.corridor.add(pts)
  }

  private buildPanels() {
    const hw = PANEL_W / 2
    const hh = PANEL_H / 2
    // A simple, undistorted 16:9 canvas keeps both artwork and user media readable.
    const poly: [number, number][] = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]
    const tint = new THREE.Color(0xffc468)
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x8c7552, metalness: 0.85, roughness: 0.42 })
    const flareTex = starTexture(10, 21)

    for (let i = 0; i < MEDIA.length; i++) {
      const cfg = MEDIA[i]
      const slot = new MediaSlot(cfg, i, PANEL_W / PANEL_H)
      this.slots.push(slot)
      const side = i % 2 === 0 ? 1 : -1
      const tc = clipCenter(i)
      const shape = new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(x, y)))

      // медиа-плоскость
      const geo = new THREE.ShapeGeometry(shape)
      const pa = geo.getAttribute('position')
      const uv = geo.getAttribute('uv')
      for (let k = 0; k < pa.count; k++) uv.setXY(k, (pa.getX(k) + hw) / PANEL_W, (pa.getY(k) + hh) / PANEL_H)
      const mat = new THREE.ShaderMaterial({
        transparent: true,
        uniforms: {
          uMap: { value: slot.texture },
          uCrop: { value: slot.crop },
          uReveal: { value: 0 },
          uTime: { value: 0 },
          uSheen: { value: -1 },
          uTint: { value: tint },
          uAlpha: { value: 1 },
        },
        vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
        fragmentShader: /* glsl */ `
          uniform sampler2D uMap; uniform vec4 uCrop; uniform float uReveal, uTime, uSheen; uniform vec3 uTint; uniform float uAlpha;
          varying vec2 vUv;
          void main(){
            vec2 uv = vUv*uCrop.xy + uCrop.zw;
            vec3 tex = texture2D(uMap, uv).rgb;
            float lum = dot(tex, vec3(0.2126,0.7152,0.0722));
            vec3 g = mix(tex, lum*uTint*1.15, 0.08);
            g = pow(max(g,0.0), vec3(1.18))*0.95;
            float gl = smoothstep(1.2,0.0,vUv.x*0.7+(1.0-vUv.y)*0.6);
            g += uTint*gl*0.015;
            float diag = vUv.x*0.6+vUv.y*0.8;
            g += vec3(1.0,0.85,0.55)*smoothstep(0.52,0.6,diag)*smoothstep(0.78,0.6,diag)*0.025;
            float s = vUv.x*0.75+vUv.y*0.55;
            g += vec3(1.0,0.86,0.55)*exp(-pow((s-uSheen)*5.0,2.0))*0.035;
            vec2 q = vUv-0.5; g *= 1.0-dot(q,q)*0.25;
            float a = uReveal*1.9 - (vUv.x*0.75+(1.0-vUv.y)*0.55);
            float mask = smoothstep(0.0,0.3,a);
            float edge = exp(-pow((a-0.03)*14.0,2.0))*step(0.0,a)*(1.0-smoothstep(0.7,1.0,uReveal));
            vec3 col = g*mask + vec3(1.0,0.82,0.45)*edge*0.65;
            gl_FragColor = vec4(col*uAlpha, max(mask*0.97, edge)*uAlpha);
          }`,
      })
      const media = new THREE.Mesh(geo, mat)
      slot.onTexture = (t) => (mat.uniforms.uMap.value = t)

      // рамка (золотой «лист»)
      const pFrameMat = frameMat.clone()
      pFrameMat.transparent = true
      const frame = new THREE.Mesh(
        new THREE.ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.035, bevelSegments: 2 }),
        pFrameMat,
      )
      frame.position.z = -0.45
      frame.scale.set(1.006, 1.01, 1)

      // светящийся контур
      const lp: number[] = []
      for (let k = 0; k < poly.length; k++) {
        const a = poly[k]
        const b = poly[(k + 1) % poly.length]
        lp.push(a[0], a[1], 0.03, b[0], b[1], 0.03)
      }
      const lg = new LineSegmentsGeometry()
      lg.setPositions(lp)
      const lmat = new LineMaterial({ color: 0xffffff, linewidth: 1.0, worldUnits: false })
      lmat.color = new THREE.Color(0.78, 0.66, 0.48).multiplyScalar(0.75)
      lmat.fog = true
      lmat.transparent = true
      this.lineMats.push(lmat)
      const edgeLine = new LineSegments2(lg, lmat)
      edgeLine.frustumCulled = false

      const flare = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: flareTex, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true, opacity: 0 }),
      )
      flare.position.set(side * hw * 0.55, -hh * 0.9, 0.35)
      flare.scale.set(6, 6, 1)

      const moteGeometry = new THREE.BufferGeometry()
      moteGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(112 * 3), 3))
      const motes = new THREE.Points(moteGeometry, new THREE.PointsMaterial({
        map: dotTexture(), color: 0xffd18a, size: 0.095, transparent: true,
        opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      }))
      motes.frustumCulled = false
      const fly = new THREE.Group()
      fly.add(frame, media, edgeLine, flare, motes)
      const root = new THREE.Group()
      root.add(fly)
      root.visible = false

      // позиция/ориентация панели
      const sPanel = S(tc) + PANEL_DIST
      const pose = this.sample(sPanel)
      const pos = pose.p.clone().addScaledVector(pose.r, side * 0.9).addScaledVector(pose.u, (i % 3 === 1 ? 1.2 : -0.3) + 0.6)
      const camPos = this.sample(S(tc)).p.clone()
      camPos.y += 1
      root.position.copy(pos)
      root.lookAt(camPos)
      const roll = (i % 2 ? 1 : -1) * rand(0.01, 0.025)
      root.rotateY(side * 0.16)
      root.rotateZ(roll)
      this.corridor.add(root)
      this.panels.push({ root, fly, mat, slot, side, roll, tc, pos, flare, frameMat: pFrameMat, edgeMat: lmat, motes })
    }
  }

  // ───────────────────────── API ─────────────────────────

  async loadDefaultMedia() {
    const results = await Promise.all(this.slots.map((slot) =>
      slot.cfg.src ? slot.load(slot.cfg.src, slot.cfg.kind) : Promise.resolve(false),
    ))
    return results.filter(Boolean).length
  }

  async assignFiles(files: File[]) {
    let loaded = 0
    let failed = 0
    let skipped = 0
    for (const f of files) {
      const kind = f.type.startsWith('video/') ? 'video' : f.type.startsWith('image/') ? 'photo' : null
      if (!kind) { failed++; continue }
      const slot = this.slots.find((s) => !s.userMedia)
      if (!slot) { skipped++; continue }
      if (await slot.load(URL.createObjectURL(f), kind, true)) loaded++
      else failed++
      if (this.disposed) break
    }
    return { loaded, failed, skipped }
  }

  clearFiles() {
    this.slots.forEach((slot) => slot.clear())
  }

  mediaKind(index: number) {
    return this.slots[index]?.kind
  }

  get userMediaCount() {
    return this.slots.filter((s) => s.userMedia).length
  }

  seek(t: number) {
    this.pause()
    this.time = Math.max(0, Math.min(END_T, Number.isFinite(t) ? t : 0))
    this.panels.forEach((panel) => {
      const video = panel.slot.video
      if (video && Number.isFinite(video.duration) && video.duration > 0) {
        video.currentTime = clipMediaTime(this.time, panel.tc, PANEL_BEFORE, video.duration)
      }
    })
    this.onFrame?.(this.time)
  }

  pause() {
    this.playing = false
    this.slots.forEach((slot) => slot.video?.pause())
  }

  resume() {
    if (this.time >= END_T) this.seek(0)
    this.startedAt = performance.now() - this.time * 1000
    this.playing = true
  }

  start() {
    this.seek(0)
    this.resume()
  }

  // ───────────────────────── цикл ─────────────────────────

  private resize = () => {
    if (this.exporting) return
    const w = this.container.clientWidth || window.innerWidth
    const h = this.container.clientHeight || window.innerHeight
    this.renderer.setSize(w, h, false)
    this.composer.setPixelRatio(this.pr)
    this.composer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.lineMats.forEach((m) => m.resolution.set(w, h))
    const db = this.renderer.getDrawingBufferSize(new THREE.Vector2())
    this.finale.setRes(db.x, db.y)
    this.finalPass.uniforms.uRes.value.set(db.x, db.y)
  }

  private loop(now: number) {
    if (this.disposed) return
    this.raf = requestAnimationFrame(this.loop)
    if (this.exporting || this.previewingVideo) return
    if (this.playing) {
      this.time = Math.max(0, (now - this.startedAt) / 1000)
      if (this.time >= END_T) {
        this.time = END_T
        this.pause()
        this.onEnd?.()
      }
    }
    this.update(this.time)
    this.composer.render()
    this.onFrame?.(this.time)
  }

  setVideoPreview(active: boolean) {
    this.previewingVideo = active
    if (active) this.slots.forEach((slot) => slot.video?.pause())
    else if (this.playing) this.startedAt = performance.now() - this.time * 1000
  }

  beginExport(width: number, height: number) {
    if (this.disposed || this.exporting) throw new Error('Экспорт уже запущен или сцена недоступна.')
    this.timeBeforeExport = this.time
    this.playingBeforeExport = this.playing
    this.videoTimesBeforeExport = this.slots.map((slot) => slot.video?.currentTime)
    this.exporting = true
    this.playing = false
    this.slots.forEach((slot) => slot.video?.pause())
    this.renderer.setPixelRatio(1)
    this.renderer.setSize(width, height, false)
    this.composer.setPixelRatio(1)
    this.composer.setSize(width, height)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.lineMats.forEach((m) => m.resolution.set(width, height))
    this.finale.setPixelRatio(1)
    this.finale.setRes(width, height)
    this.finalPass.uniforms.uRes.value.set(width, height)
  }

  async renderExportFrame(t: number) {
    if (!this.exporting || this.disposed) throw new Error('Экспорт прерван.')
    if (this.renderer.getContext().isContextLost()) throw new Error('Графический контекст потерян. Экспорт прерван.')
    const active = this.panels.filter((p) => t > p.tc - PANEL_BEFORE && t < p.tc + PANEL_AFTER && p.slot.video)
    await Promise.all(active.map(async (p) => {
      const video = p.slot.video!
      if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error('Не удалось определить длительность видео в одном из слотов.')
      const target = clipMediaTime(t, p.tc, PANEL_BEFORE, video.duration)
      if (Math.abs(video.currentTime - target) > 0.0001 || video.readyState < 2) {
        await new Promise<void>((resolve, reject) => {
          const timer = window.setTimeout(() => finish(new Error('Не удалось декодировать кадр загруженного видео.')), 15000)
          const finish = (error?: Error) => {
            clearTimeout(timer)
            video.removeEventListener('seeked', onSeeked)
            video.removeEventListener('error', onError)
            error ? reject(error) : resolve()
          }
          const onSeeked = () => finish()
          const onError = () => finish(new Error('Ошибка чтения загруженного видео.'))
          video.addEventListener('seeked', onSeeked, { once: true })
          video.addEventListener('error', onError, { once: true })
          video.currentTime = target
        })
      }
      p.slot.texture.needsUpdate = true
    }))
    this.time = t
    this.update(t)
    this.composer.render()
    return this.renderer.domElement
  }

  endExport() {
    if (!this.exporting || this.disposed) return
    this.exporting = false
    this.time = this.timeBeforeExport
    this.playing = this.playingBeforeExport
    if (this.playing) this.startedAt = performance.now() - this.time * 1000
    this.slots.forEach((slot, i) => {
      const time = this.videoTimesBeforeExport[i]
      if (slot.video && time !== undefined && Number.isFinite(time)) slot.video.currentTime = time
    })
    this.videoTimesBeforeExport = []
    this.renderer.setPixelRatio(this.pr)
    this.finale.setPixelRatio(this.pr)
    this.resize()
  }

  private cometPos(tau: number, j: number, out: THREE.Vector3) {
    const index = lightPanelIndex(tau, CLIP_T0, CLIP_DT, this.panels.length)
    const panel = this.panels[index]
    const point = lightOrbit(tau, panel.tc, j, PANEL_W, PANEL_H)
    return out.set(point.x, point.y, point.z).applyQuaternion(panel.root.quaternion).add(panel.pos)
  }

  private tmpA = new THREE.Vector3()
  private tmpB = new THREE.Vector3()
  private tmpC = new THREE.Vector3()

  private update(t: number) {
    const inFinale = t >= FLASH_T
    this.corridor.visible = !inFinale
    this.finale.group.visible = inFinale

    // ── вспышка / затухание ──
    let flash = 0
    if (!inFinale) flash = Math.pow(smooth(FLASH_T - 0.8, FLASH_T, t), 3)
    else flash = Math.exp(-(t - FLASH_T) * 3.6)
    const fu = this.finalPass.uniforms
    fu.uFlash.value = flash
    fu.uTime.value = t
    fu.uFinaleDim.value = finaleDim(t, FLASH_T)
    fu.uFade.value = 1 - smooth(0, 1.4, t) * 1 // плавный выход из черного
    this.bloom.strength = 0.22 + flash * 0.8 + (inFinale ? 0.15 * Math.exp(-(t - FLASH_T) * 0.5) : 0)

    const cam = this.camera
    if (!inFinale) {
      // позиция камеры
      const sc = S(cameraTime(t))
      const pose = this.sample(sc, this.poseCam)
      const camPos = this.tmpA.copy(pose.p)
      camPos.y += 1.0
      // Одна непрерывная точка взгляда вдоль траектории вместо рывков к панелям.
      const target = this.tmpB.copy(this.sample(sc + PANEL_DIST + 4).p)
      target.y += 1.0
      const starW = smooth(FLASH_T - 4.0, FLASH_T - 1.0, t)
      target.lerp(this.starSprite.position, starW)
      cam.position.copy(camPos)
      cam.fov = 41 - 4 * starW
      cam.updateProjectionMatrix()
      cam.up.set(0, 1, 0)
      cam.lookAt(target)
      this.camLight.position.copy(camPos).add(this.tmpC.set(0, 2, 0))
      this.camLight.intensity = 22

      this.updateComet(t)
      this.updatePanels(t)
      this.updateStar(t)
    } else {
      const tb = t - FLASH_T
      cam.position.set(Math.sin(tb * 0.35) * 0.9, FIN_Y + Math.cos(tb * 0.3) * 0.4, 42 - 0.4 * tb)
      cam.fov = 50 - 4 * Math.exp(-tb * 1.2)
      cam.updateProjectionMatrix()
      cam.up.set(0, 1, 0)
      cam.lookAt(0, FIN_Y, 0)
      this.cometLight.intensity = 0
      this.starLight.intensity = 0
      this.camLight.intensity = 0
      this.finale.update(tb, t)
    }
  }

  private updateComet(t: number) {
    const head = this.cometPos(t, 0, this.tmpA)
    const fadeIn = lightVisibility(t, CLIP_T0, CLIP_DT, this.panels.length, PANEL_BEFORE, PANEL_AFTER)
    this.cometLight.position.copy(head)
    this.cometLight.intensity = 65 * fadeIn
    this.cometHead.position.copy(head)
    this.cometGlow.position.copy(head)
    const pulse = 1 + 0.12 * Math.sin(t * 17) + 0.05 * Math.sin(t * 41)
    const hs = (1.0 + 1.4 * smooth(0, 1.5, t)) * pulse
    this.cometHead.scale.set(hs * 0.55, hs * 0.55, 1)
    this.cometGlow.scale.set(hs * 0.9, hs * 0.9, 1)
    ;(this.cometHead.material as THREE.SpriteMaterial).opacity = 0.65 * fadeIn
    ;(this.cometGlow.material as THREE.SpriteMaterial).opacity = 0.28 * fadeIn

    const n = 90
    const dtau = 0.022
    const p = this.tmpB
    for (let j = 0; j < 3; j++) {
      const geo = this.trails[j].geo
      const pos = (geo.getAttribute('instanceStart') as THREE.InterleavedBufferAttribute).data
      const col = (geo.getAttribute('instanceColorStart') as THREE.InterleavedBufferAttribute).data
      const pa = pos.array as Float32Array
      const ca = col.array as Float32Array
      let px = 0,
        py = 0,
        pz = 0
      for (let k = 0; k < n; k++) {
        this.cometPos(t - k * dtau, j, p)
        if (k > 0) {
          const o = (k - 1) * 6
          pa[o] = px
          pa[o + 1] = py
          pa[o + 2] = pz
          pa[o + 3] = p.x
          pa[o + 4] = p.y
          pa[o + 5] = p.z
          const prevT = t - (k - 1) * dtau
          const nextT = t - k * dtau
          const prevPanel = lightPanelIndex(prevT, CLIP_T0, CLIP_DT, this.panels.length)
          const samePanel = prevPanel === lightPanelIndex(nextT, CLIP_T0, CLIP_DT, this.panels.length) && prevPanel === lightPanelIndex(t, CLIP_T0, CLIP_DT, this.panels.length)
          const tail = samePanel ? fadeIn * (j === 0 ? 0.9 : 0.5) : 0
          const b0 = Math.pow(1 - (k - 1) / n, 1.8) * tail * lightVisibility(prevT, CLIP_T0, CLIP_DT, this.panels.length, PANEL_BEFORE, PANEL_AFTER)
          const b1 = Math.pow(1 - k / n, 1.8) * tail * lightVisibility(nextT, CLIP_T0, CLIP_DT, this.panels.length, PANEL_BEFORE, PANEL_AFTER)
          ca[o] = 1.0 * b0
          ca[o + 1] = 0.78 * b0
          ca[o + 2] = 0.38 * b0
          ca[o + 3] = 1.0 * b1
          ca[o + 4] = 0.78 * b1
          ca[o + 5] = 0.38 * b1
        }
        px = p.x
        py = p.y
        pz = p.z
      }
      pos.needsUpdate = true
      col.needsUpdate = true
    }

    // Particles are sampled from the same circular path as the tail. Their offset
    // points outwards, keeping the light clear of the card even as it drifts.
    const positions = this.trailParticles.geometry.getAttribute('position') as THREE.BufferAttribute
    const colors = this.trailParticles.geometry.getAttribute('color') as THREE.BufferAttribute
    const currentPanel = lightPanelIndex(t, CLIP_T0, CLIP_DT, this.panels.length)
    const panel = this.panels[currentPanel]
    for (let i = 0; i < this.particleSeeds.length; i++) {
      const seed = this.particleSeeds[i]
      const age = ((t * 0.5 + seed.phase) % 1) * 1.5
      const sampleTime = t - age
      const point = lightOrbit(sampleTime, panel.tc, seed.strand, PANEL_W, PANEL_H)
      const radius = Math.hypot(point.x, point.y)
      const nx = point.x / radius, ny = point.y / radius
      const outward = 0.18 + seed.spread * 0.5 + age * 0.15
      const tangent = seed.tangent * 0.22 * age
      p.set(point.x + nx * outward - ny * tangent, point.y + ny * outward + nx * tangent, point.z + seed.spread * 0.12)
        .applyQuaternion(panel.root.quaternion).add(panel.pos)
      positions.setXYZ(i, p.x, p.y, p.z)
      const samePanel = lightPanelIndex(sampleTime, CLIP_T0, CLIP_DT, this.panels.length) === currentPanel
      const sampleFade = lightVisibility(sampleTime, CLIP_T0, CLIP_DT, this.panels.length, PANEL_BEFORE, PANEL_AFTER)
      const sparkle = 0.55 + 0.45 * Math.sin(t * 5 + seed.twinkle)
      const brightness = samePanel ? fadeIn * sampleFade * Math.pow(1 - age / 1.5, 1.2) * sparkle * 2.2 : 0
      colors.setXYZ(i, brightness, brightness * 0.72, brightness * 0.32)
    }
    positions.needsUpdate = true
    colors.needsUpdate = true
  }

  private updateStar(t: number) {
    const k = smooth(FLASH_T - 4.4, FLASH_T, t)
    const visibility = smooth(clipCenter(MEDIA.length - 1) + PANEL_AFTER, FLASH_T - 1.1, t)
    const sz = 5 + 28 * k * k
    const twinkle = 1 + 0.06 * Math.sin(t * 13)
    this.starSprite.scale.set(sz * 2.2 * twinkle, sz * 2.2 * twinkle, 1)
    this.starGlow.scale.set(sz * 1.8, sz * 1.8, 1)
    ;(this.starSprite.material as THREE.SpriteMaterial).opacity = (0.3 + 0.55 * k) * visibility
    ;(this.starSprite.material as THREE.SpriteMaterial).rotation = t * 0.08
    ;(this.starGlow.material as THREE.SpriteMaterial).opacity = (0.2 + 0.8 * k) * visibility
    this.starLight.intensity = 2500 * k * k * visibility
  }

  private updatePanels(t: number) {
    let lightW = 0
    const lightPos = this.tmpC
    for (let i = 0; i < this.panels.length; i++) {
      const p = this.panels[i]
      const visible = t > p.tc - PANEL_BEFORE && t < p.tc + PANEL_AFTER
      p.root.visible = visible
      if (!this.exporting) {
        const video = p.slot.video
        const target = video ? clipMediaTime(t, p.tc, PANEL_BEFORE, video.duration) : 0
        p.slot.setActive(visible && this.playing, target, () => this.onVideoError?.('Браузер не смог воспроизвести видео. Проверьте поддержку H.264 и попробуйте Chrome или Edge.'))
      }
      p.slot.update(t, visible)
      if (!visible) continue
      const pTime = clamp01((t - (p.tc - PANEL_BEFORE)) / (PANEL_BEFORE + PANEL_AFTER))
      const enter = smooth(p.tc - PANEL_BEFORE, p.tc - PANEL_BEFORE + 1.0, t)
      const exit = smooth(p.tc + 1.15, p.tc + 2.05, t)
      const fly = p.fly
      // Небольшой непрерывный дрейф вместо подлёта и замершего положения.
      fly.position.set(p.side * (pTime - 0.5) * 0.65, 0.1 * Math.sin(t * 0.32 + i), (pTime - 0.5) * 0.55)
      fly.rotation.set(0, p.side * (pTime - 0.5) * 0.035, p.side * (pTime - 0.5) * 0.015)
      const u = p.mat.uniforms
      u.uReveal.value = 1
      u.uSheen.value = ((t - (p.tc - 1.4)) / 2.2) * 1.8 - 0.4
      u.uTime.value = t
      const al = enter * (1 - exit)
      u.uAlpha.value = al
      p.frameMat.opacity = al
      p.edgeMat.opacity = al
      const motePositions = p.motes.geometry.getAttribute('position') as THREE.BufferAttribute
      for (let j = 0; j < motePositions.count; j++) {
        const mote = panelMote(t + i * 2, j, PANEL_W, PANEL_H)
        motePositions.setXYZ(j, mote.x, mote.y, mote.z)
      }
      motePositions.needsUpdate = true
      ;(p.motes.material as THREE.PointsMaterial).opacity = al * 0.8
      ;(p.flare.material as THREE.SpriteMaterial).opacity = 0
      lightW = Math.max(lightW, al)
      lightPos.copy(p.pos)
    }
    this.panelLight.position.copy(lightPos)
    this.panelLight.intensity = 90 * lightW
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    window.removeEventListener('resize', this.resize)
    this.slots.forEach((slot) => slot.dispose())
    const geometries = new Set<THREE.BufferGeometry>()
    const materials = new Set<THREE.Material>()
    const textures = new Set<THREE.Texture>()
    this.scene.traverse((object) => {
      const item = object as THREE.Mesh
      if (item.geometry) geometries.add(item.geometry)
      if (item.material) (Array.isArray(item.material) ? item.material : [item.material]).forEach((material) => materials.add(material))
    })
    materials.forEach((material) => {
      Object.values(material).forEach((value) => { if (value instanceof THREE.Texture) textures.add(value) })
      if (material instanceof THREE.ShaderMaterial) Object.values(material.uniforms).forEach((uniform) => { if (uniform.value instanceof THREE.Texture) textures.add(uniform.value) })
      material.dispose()
    })
    textures.forEach((texture) => texture.dispose())
    geometries.forEach((geometry) => geometry.dispose())
    this.composer.passes.forEach((pass) => pass.dispose())
    this.composer.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}

