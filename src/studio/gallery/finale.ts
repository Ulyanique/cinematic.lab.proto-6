import * as THREE from 'three'
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js'
import { buildLogoParts } from '../lab2/logo'
import { makeGold } from '../lab2/gold'

const rand = (a: number, b: number) => a + Math.random() * (b - a)

function randDir() {
  const u = Math.random() * 2 - 1
  const a = Math.random() * Math.PI * 2
  const s = Math.sqrt(1 - u * u)
  return new THREE.Vector3(s * Math.cos(a), s * Math.sin(a), u)
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
const easeOutBack = (x: number) => {
  const c1 = 1.70158, c3 = c1 + 1
  const y = clamp01(x) - 1
  return 1 + c3 * y * y * y + c1 * y * y
}

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

    // ── лого интро: 3D-эмблема из того же SVG, что и в интро ──
    const parts = buildLogoParts({ svg: '', size: 3.2, depth: 140, bevel: 22 })
    const bb = new THREE.Box3()
    for (const p of parts) {
      p.geometry.computeBoundingBox()
      bb.union(p.geometry.boundingBox!)
    }
    const C = bb.getCenter(new THREE.Vector3())
    const size = bb.getSize(new THREE.Vector3())
    // Ширина эмблемы ~9.5 world units: в финале камера в 42 единицах, fov 50.
    this.logoScale = 9.5 / Math.max(size.x, 0.001)
    const h = size.y * this.logoScale
    this.logoRoot = new THREE.Group()
    const inner = new THREE.Group()
    inner.position.set(-C.x, -C.y, 0)
    this.logoRoot.add(inner)
    // vWorldP.y у золота приходит в мировых координатах: группа финала стоит на
    // FIN_Y, поэтому градиент задаём относительно этой высоты, иначе эмблема
    // всегда получает «верхний» цвет.
    const FIN_Y = 1000 // engine.ts: const FIN_Y = 1000
    this.goldMats = []
    for (const p of parts) {
      const mat = makeGold({ gradBot: FIN_Y - h * 0.55, gradTop: FIN_Y + h * 0.55, env: 2.1, roughness: 0.27 })
      const u = mat.userData.u
      if (u) {
        u.uCenter.value.set(0, 0, 0)
        u.uDir.value.copy(p.dir)
        u.uExtent.value = Math.abs(p.dir.x) > 0.5 ? p.size.x : p.size.y
        u.uReveal.value = 0
      }
      this.goldMats.push(mat)
      const geo = p.geometry.clone()
      geo.translate(-p.center.x, -p.center.y, -p.center.z)
      const m = new THREE.Mesh(geo, mat)
      m.position.copy(p.center)
      m.position.z += p.z
      inner.add(m)
    }
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

    // логотип интро: быстрый сбор с перелётом и мягкий «выход» к камере
    const assemble = clamp01(t / 1.35)
    const e = easeOutBack(assemble)
    // uReveal: 0 → лого «прорезается» из черноты, 1 — полностью вырезано;
    // без этого золото с uReveal=0 отбрасывает все фрагменты и невидимо.
    for (const m of this.goldMats) {
      const u = (m as THREE.MeshPhysicalMaterial).userData.u
      if (u) {
        u.uReveal.value = 1
        u.uFlash.value = Math.exp(-t * 0.9) * 1.5
      }
    }
    this.logoRoot.scale.setScalar(Math.max(0.001, this.logoScale * e))
    const settle = 1 - assemble
    this.logoRoot.position.z = -6 * (1 - assemble) + Math.sin(now * 0.6) * 0.12 * assemble
    this.logoRoot.rotation.y = settle * -1.1 + Math.sin(now * 0.45 + 0.6) * 0.08 * assemble
    this.logoRoot.rotation.x = settle * 0.35

    this.light.intensity = 9000 * Math.exp(-t * 1.1) + 650

    for (const d of this.debris) {
      const r = (d.speed * (1 - Math.exp(-t * 0.9))) / 0.9 + 1.5
      d.m.position.copy(d.dir).multiplyScalar(r)
      d.m.rotation.set(d.axis.x * t * d.spin, d.axis.y * t * d.spin, d.axis.z * t * d.spin)
      const sc = Math.min(1, t * 3) * (1 - THREE.MathUtils.smoothstep(t, 2, 4.8))
      d.m.scale.setScalar(sc)
    }
  }
}
