/**
 * Общая сборка золотой эмблемы интро: одна точка правды для Intro (лаб-2)
 * и финала видеогалереи. Возвращает детали, готовые меши (геометрия уже
 * центрирована в своей детали), материалы и общий bbox.
 */
import * as THREE from 'three'
import { buildLogoParts } from './logo'
import { makeGold } from './gold'

export interface EmblemOptions {
  /** SVG-текст эмблемы; пустая строка — встроенный логотип. */
  svg?: string
  size: number
  depth: number
  bevel: number
  /** Параметры для makeGold (gradBot/gradTop задаются В МИРОВЫХ координатах — после сборки). */
  gold?: Record<string, unknown>
  /** false — меши создаются скрытыми (интро делает видимыми по анимации). */
  visible?: boolean
}

export function buildEmblem(opts: EmblemOptions) {
  const parts = buildLogoParts({ svg: opts.svg ?? '', size: opts.size, depth: opts.depth, bevel: opts.bevel })
  const bb = new THREE.Box3()
  for (const p of parts) {
    p.geometry.computeBoundingBox()
    bb.union(p.geometry.boundingBox!)
  }
  const center = bb.getCenter(new THREE.Vector3())
  const size = bb.getSize(new THREE.Vector3())
  const meshes: THREE.Mesh[] = []
  const materials: ReturnType<typeof makeGold>[] = []
  for (const p of parts) {
    const mat = makeGold({ ...(opts.gold ?? {}) })
    const u = mat.userData.u
    if (u) {
      u.uCenter.value.set(0, 0, 0)
      u.uDir.value.copy(p.dir)
      u.uExtent.value = Math.abs(p.dir.x) > 0.5 ? p.size.x : p.size.y
    }
    const geo = p.geometry.clone()
    geo.translate(-p.center.x, -p.center.y, -p.center.z)
    const m = new THREE.Mesh(geo, mat)
    m.position.copy(p.center)
    m.position.z += p.z
    m.visible = opts.visible ?? true
    meshes.push(m)
    materials.push(mat)
  }
  return { parts, meshes, materials, bb, center, size }
}
