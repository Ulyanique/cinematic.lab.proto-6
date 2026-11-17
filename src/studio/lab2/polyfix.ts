// @ts-nocheck
/**
 * Ремонт полигонов перед выдавливанием.
 *
 * Исходные контуры (SVG из CorelDRAW и глифы шрифтов) часто содержат самопересечения,
 * наложенные друг на друга контуры и правило заливки evenodd. Earcut (внутри ExtrudeGeometry)
 * на таких данных выдаёт «рваные» треугольники, провалы и лишние грани. Здесь любой набор
 * контуров приводится к чистому виду: внешние границы + дыры, без самопересечений.
 */
import * as THREE from 'three';
import ClipperLib from 'clipper-lib';

export interface Pt { x: number; y: number }
export type Poly = { outer: Pt[]; holes: Pt[][] };

const toPaths = (rings: Pt[][], k: number) =>
  rings
    .map((r) => r.map((p) => ({ X: Math.round(p.x * k), Y: Math.round(p.y * k) })))
    .filter((r) => r.length >= 3);

const fromPath = (path: any[], k: number): Pt[] => path.map((p) => ({ x: p.X / k, y: p.Y / k }));
const fillOf = (rule: string) => (rule === 'evenodd' ? ClipperLib.PolyFillType.pftEvenOdd : ClipperLib.PolyFillType.pftNonZero);

/** Выполнить булеву операцию; результат — «плоский» набор контуров с согласованной ориентацией. */
function exec(subj: any[], clip: any[], type: number, subjFill: number, clipFill = ClipperLib.PolyFillType.pftNonZero) {
  const c = new ClipperLib.Clipper();
  c.StrictlySimple = true;
  c.AddPaths(subj, ClipperLib.PolyType.ptSubject, true);
  if (clip.length) c.AddPaths(clip, ClipperLib.PolyType.ptClip, true);
  const sol = new ClipperLib.Paths();
  c.Execute(type, sol, subjFill, clipFill);
  return sol;
}

const area = (path: any[]) => Math.abs(ClipperLib.Clipper.Area(path));

/** Удаляет почти совпадающие и лежащие на одной прямой точки. */
function tidy(paths: any[], dist: number) {
  const out = ClipperLib.Clipper.CleanPolygons(paths, dist) as any[];
  return out.filter((p) => p.length >= 3);
}

/** Морфологическое «открытие»: убирает детали тоньше 2r (иначе фаска выворачивает тонкие перемычки). */
function open(paths: any[], r: number) {
  if (r <= 0 || !paths.length) return paths;
  const down = new ClipperLib.Paths();
  const o1 = new ClipperLib.ClipperOffset(2, Math.max(0.25, r * 0.012));
  o1.AddPaths(paths, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
  o1.Execute(down, -r);
  const up = new ClipperLib.Paths();
  const o2 = new ClipperLib.ClipperOffset(2, Math.max(0.25, r * 0.012));
  o2.AddPaths(down, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
  o2.Execute(up, r);
  return up;
}

/** Плоский набор контуров → дерево «внешний контур + дыры». */
export function pathsToPolys(paths: any[], k: number): Poly[] {
  if (!paths.length) return [];
  const c = new ClipperLib.Clipper();
  c.StrictlySimple = true;
  c.AddPaths(paths, ClipperLib.PolyType.ptSubject, true);
  const tree = new ClipperLib.PolyTree();
  c.Execute(ClipperLib.ClipType.ctUnion, tree, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  const out: Poly[] = [];
  const visit = (node: any) => {
    out.push({ outer: fromPath(node.Contour(), k), holes: node.Childs().map((h: any) => fromPath(h.Contour(), k)) });
    // острова внутри дыр — самостоятельные внешние контуры
    for (const h of node.Childs()) for (const island of h.Childs()) visit(island);
  };
  for (const n of tree.Childs()) visit(n);
  return out;
}

export function polysToShapes(polys: Poly[]): THREE.Shape[] {
  return polys.map(({ outer, holes }) => {
    const s = new THREE.Shape(outer.map((p) => new THREE.Vector2(p.x, p.y)));
    s.holes = holes.map((h) => new THREE.Path(h.map((p) => new THREE.Vector2(p.x, p.y))));
    return s;
  });
}

export interface FixOpts {
  /** множитель перевода координат в целые числа */
  scale: number;
  /** правило заливки исходных контуров */
  rule?: 'evenodd' | 'nonzero';
  /** минимальная площадь острова/дыры (в исходных единицах²) */
  minArea?: number;
  /** радиус «открытия» (в исходных единицах), 0 — выкл. */
  open?: number;
  /** допуск слияния соседних точек (в исходных единицах) */
  weld?: number;
}

/** Контуры одной детали → чистые заготовки (набор путей Clipper). */
export function cleanPaths(rings: Pt[][], o: FixOpts) {
  const k = o.scale;
  let sol = exec(toPaths(rings, k), [], ClipperLib.ClipType.ctUnion, fillOf(o.rule || 'nonzero'));
  sol = tidy(sol, Math.max(1, (o.weld ?? 0) * k));
  if (o.open) sol = open(sol, o.open * k);
  const min = (o.minArea ?? 0) * k * k;
  // убираем только мелкие острова и мелкие дыры (по площади)
  sol = sol.filter((p) => area(p) > min);
  return exec(sol, [], ClipperLib.ClipType.ctUnion, ClipperLib.PolyFillType.pftNonZero);
}

export function pathsToShapes(paths: any[], k: number) {
  return polysToShapes(pathsToPolys(paths, k));
}

/** Глиф/путь → список форм без самопересечений. */
export function fixRings(rings: Pt[][], o: FixOpts): THREE.Shape[] {
  return pathsToShapes(cleanPaths(rings, o), o.scale);
}

/**
 * Детали эмблемы. Сильно перекрывающиеся контуры (части одного знака) склеиваются в одну деталь,
 * у остальных перекрытие вычитается: компланарные грани не мерцают (z-fighting), а число деталей
 * для анимации «сборкой» сохраняется.
 */
export function resolveOverlaps(parts: any[][], k: number, o: { minOverlap: number; minArea: number; open: number }): any[][] {
  const NZ = ClipperLib.PolyFillType.pftNonZero;
  const total = (ps: any[]) => ps.reduce((s: number, q: any) => s + ClipperLib.Clipper.Area(q), 0);
  const done: { paths: any[]; idx: number }[] = [];
  parts.forEach((p, idx) => {
    let cur = p;
    let myIdx = idx;
    for (let i = 0; i < done.length; ) {
      const g = done[i];
      const ov = Math.abs(total(exec(cur, g.paths, ClipperLib.ClipType.ctIntersection, NZ)));
      if (ov <= o.minOverlap * k * k) { i++; continue; }
      const small = Math.min(Math.abs(total(cur)), Math.abs(total(g.paths)));
      if (ov > small * 0.35) {
        cur = exec(cur, g.paths, ClipperLib.ClipType.ctUnion, NZ);
        myIdx = Math.min(myIdx, g.idx);
        done.splice(i, 1);
        i = 0;
      } else {
        let rest = exec(cur, g.paths, ClipperLib.ClipType.ctDifference, NZ);
        if (o.open) rest = open(rest, o.open * k);
        cur = rest.filter((q: any) => area(q) > o.minArea * k * k);
        i++;
      }
    }
    if (cur.length) done.push({ paths: cur, idx: myIdx });
  });
  return done.sort((a, b) => a.idx - b.idx).map((g) => g.paths);
}

export const pathsArea = (paths: any[], k: number) => paths.reduce((s, p) => s + ClipperLib.Clipper.Area(p), 0) / (k * k);

/**
 * После сглаживания по углу нормали вершин у края плоской крышки наклоняются вместе с фаской,
 * и по длинным треугольникам крышки проступают диагональные «швы». Возвращаем крышкам точную нормаль.
 */
export function flattenCaps(geo: THREE.BufferGeometry) {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const nor = geo.attributes.normal as THREE.BufferAttribute;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  const count = geo.index ? geo.index.count : pos.count;
  for (let i = 0; i < count; i += 3) {
    const ia = geo.index ? geo.index.getX(i) : i, ib = geo.index ? geo.index.getX(i + 1) : i + 1, ic = geo.index ? geo.index.getX(i + 2) : i + 2;
    a.fromBufferAttribute(pos, ia); b.fromBufferAttribute(pos, ib); c.fromBufferAttribute(pos, ic);
    n.subVectors(c, b).cross(a.clone().sub(b));
    const len = n.length();
    if (len < 1e-12) continue;
    n.divideScalar(len);
    if (Math.abs(n.z) > 0.9995) {
      nor.setXYZ(ia, 0, 0, Math.sign(n.z)); nor.setXYZ(ib, 0, 0, Math.sign(n.z)); nor.setXYZ(ic, 0, 0, Math.sign(n.z));
    }
  }
  nor.needsUpdate = true;
  return geo;
}
