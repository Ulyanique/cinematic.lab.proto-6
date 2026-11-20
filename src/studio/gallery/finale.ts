import * as THREE from 'three'
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js'
import { buildEmblem } from '../lab2/emblem'
import { FIN_Y } from './config'
import { mulberry32 } from '../lab5/math'

const buildRng = mulberry32(0x5eed)
const rand = (a: number, b: number) => a + buildRng() * (b - a)

function randDir() {
  const u = buildRng() * 2 - 1
  const a = buildRng() * Math.PI * 2
  const s = Math.sqrt(1 - u * u)
  return new THREE.Vector3(s * Math.cos(a), s * Math.sin(a), u)
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
const easeOutCubic = (x: number) => 1 - Math.pow(1 - clamp01(x), 3)

/**
 * Финал галереи: вспышка распадается на логотип из интро и золотые осколки —
 * без огненного шара, дыма и лучей-стриков. Логотип собирается из «разлёта»
 * (как в интро), осколки продолжают лететь и остывают.
 */
export class Finale {
  group = new THREE.Group()
  light: THREE.PointLight
  private logoRoot: THREE.Group
  private logoScale: number
  private goldMats: THREE.Material[] = []
  private debris: { m: THREE.Mesh; dir: THREE.Vector3; speed: number; axis: THREE.Vector3; spin: number }[] = []

  constructor(goldMat: THREE.Material, _pixelRatio: number) {
    this.group.visible = false

    // ── лого интро: та же 3D-эмблема, что и в интро (общий buildEmblem) ──
    const { meshes, materials, center: C, size } = buildEmblem({
      svg: '', size: 3.2, depth: 140, bevel: 22,
      gold: { env: 2.1, roughness: 0.27 },
    })
    // Ширина эмблемы ~9.5 world units: в финале камера в ~33 единицах, fov 50.
    this.logoScale = 9.5 / Math.max(size.x, 0.001)
    const h = size.y * this.logoScale
    this.logoRoot = new THREE.Group()
    const inner = new THREE.Group()
    inner.position.set(-C.x, -C.y, 0)
    this.logoRoot.add(inner)
    // vWorldP.y у золота приходит в мировых координатах: группа финала стоит на
    // FIN_Y (config.ts), поэтому градиент задаём относительно этой высоты,
    // иначе эмблема всегда получает «верхний» цвет.
    for (const mat of materials) {
      const u = mat.userData.u
      if (u) {
        u.uGradY.value.set(FIN_Y - h * 0.55, FIN_Y + h * 0.55)
        u.uReveal.value = 1
      }
    }
    this.goldMats = materials
    for (const m of meshes) inner.add(m)
    this.logoRoot.scale.setScalar(0.001)
    this.logoRoot.position.z = -6
    this.group.add(this.logoRoot)

    // ── осколки ──
    for (let i = 0; i < 90; i++) {
      const s = rand(0.3, 2.0)
      const pts: THREE.Vector3[] = []
      for (let k = 0; k < 7; k++) pts.push(new THREE.Vector3(rand(-1, 1) * s * 1.6, rand(-1, 1) * s, rand(-1, 1) * s * 0.5))
      const m = new THREE.Mesh(new ConvexGeometry(pts), goldMat)
      this.group.add(m)
      this.debris.push({
        m,
        dir: randDir().multiplyScalar(1),
        speed: rand(6, 45),
        axis: randDir(),
        spin: rand(0.4, 2.4),
      })
    }

    this.light = new THREE.PointLight(0xffc873, 0, 0, 2)
    this.group.add(this.light)
  }

  setPixelRatio(_pixelRatio: number) {
    // Частиц с gl_PointSize больше нет — подгонять нечего.
  }

  setRes(_w: number, _h: number) {
    // Пропорции логотипа и осколков от разрешения не зависят.
  }

  update(tb: number, now: number) {
    const t = Math.max(tb, 0)

    // Появление — как у эмблемы в интро: золото «прорисовывается» послойно
    // (reveal каждого куска со своим сдвигом), без пружинистого перелёта.
    // как в интро (пресет swarm): sine-протяжка reveal по каждой детали со своим
    // стартом; вспышка — короткий выброс в момент, когда деталь «оседает»
    const n = this.goldMats.length
    const DUR = 1.15, STAG = 0.12, LEAD = 0.25
    for (let i = 0; i < n; i++) {
      const m = this.goldMats[i]
      const u = (m as THREE.MeshPhysicalMaterial).userData.u
      if (!u) continue
      const start = LEAD + i * STAG
      const k = clamp01((t - start) / DUR)
      u.uReveal.value = -(Math.cos(Math.PI * k) - 1) / 2
      u.uFlash.value = Math.exp(-Math.pow((t - (start + DUR * 0.9)) * 4.0, 2.0)) * 0.5
    }
    const appear = easeOutCubic(t / 2.1)
    this.logoRoot.scale.setScalar(Math.max(0.001, this.logoScale * (0.86 + 0.14 * appear)))
    this.logoRoot.position.z = -5.5 * (1 - appear) + Math.sin(now * 0.6) * 0.12 * appear
    this.logoRoot.rotation.y = -0.55 * (1 - appear) + Math.sin(now * 0.45 + 0.6) * 0.08 * appear
    this.logoRoot.rotation.x = 0.16 * (1 - appear)

    this.light.intensity = 110 * Math.exp(-t * 1.35) + 24

    for (const d of this.debris) {
      const r = (d.speed * (1 - Math.exp(-t * 0.9))) / 0.9 + 1.5
      d.m.position.copy(d.dir).multiplyScalar(r)
      d.m.rotation.set(d.axis.x * t * d.spin, d.axis.y * t * d.spin, d.axis.z * t * d.spin)
      const sc = Math.min(1, t * 3) * (1 - THREE.MathUtils.smoothstep(t, 2, 4.8))
      d.m.scale.setScalar(sc)
    }
  }
}
