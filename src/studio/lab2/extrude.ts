// @ts-nocheck
/**
 * Безопасное выдавливание с фаской.
 *
 * ExtrudeGeometry двигает вершины фаски по биссектрисе, не зная о соседних контурах: в узких зазорах
 * (штрихи знака «S» внутри отверстия шарнира, контрформы букв, острые засечки) смещённые контуры
 * схлопываются или выворачиваются — отсюда «рваные» грани, вырожденные треугольники и рёбра без пары.
 *
 * Здесь смещение каждой вершины ограничено расстоянием до ближайшей границы по лучу (с запасом),
 * сглажено вдоль контура, а развернувшиеся рёбра откатываются. Плоские крышки — исходный (уже чистый)
 * контур, поэтому грани сходятся вершина в вершину: сетка замкнутая, без T-стыков.
 */
import * as THREE from 'three';
import type { Poly } from './polyfix';

export interface ExtrudeOpts { depth: number; bevelThickness: number; bevelSize: number; segments: number }

const cross = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx;

function signedArea(r: { x: number; y: number }[]) {
  let a = 0;
  for (let i = 0, n = r.length; i < n; i++) { const p = r[i], q = r[(i + 1) % n]; a += p.x * q.y - q.x * p.y; }
  return a / 2;
}

/** убираем повторы и точки на одной прямой, ориентация: внешний CCW, дыры CW (материал всегда слева) */
function prepRing(ring: { x: number; y: number }[], ccw: boolean, eps: number) {
  let r = ring.filter((p, i) => { const q = ring[(i + ring.length - 1) % ring.length]; return Math.hypot(p.x - q.x, p.y - q.y) > eps; });
  if (r.length < 3) return null;
  if ((signedArea(r) > 0) !== ccw) r = r.slice().reverse();
  return r;
}

export function extrudePolys(polys: Poly[], o: ExtrudeOpts): THREE.BufferGeometry {
  const pos: number[] = [];
  const D = o.depth, bt = Math.max(0, o.bevelThickness), bs = Math.max(0, o.bevelSize);
  const S = bt > 1e-9 && bs > 1e-9 ? Math.max(1, o.segments) : 0;

  // все контуры детали (для расчёта зазоров нужны и соседние острова)
  let ext = 0;
  const all: { r: { x: number; y: number }[]; ccw: boolean; poly: number }[] = [];
  polys.forEach((p, pi) => {
    for (const q of p.outer) ext = Math.max(ext, Math.abs(q.x), Math.abs(q.y));
  });
  const eps = Math.max(1e-9, ext * 3e-6);
  polys.forEach((p, pi) => {
    const outer = prepRing(p.outer, true, eps);
    if (!outer) return;
    all.push({ r: outer, ccw: true, poly: pi, kind: 'o' });
    for (const h of p.holes) { const hr = prepRing(h, false, eps); if (hr) all.push({ r: hr, ccw: false, poly: pi, kind: 'h' }); }
  });

  // сегменты для лучей
  const segs: number[] = []; // ax, ay, bx, by, ring, idx
  all.forEach((R, ri) => {
    const n = R.r.length;
    for (let i = 0; i < n; i++) { const a = R.r[i], b = R.r[(i + 1) % n]; segs.push(a.x, a.y, b.x, b.y, ri, i); }
  });
  const nSeg = segs.length / 6;

  // смещения вершин
  all.forEach((R, ri) => {
    const r = R.r, n = r.length;
    const mx = new Float64Array(n), my = new Float64Array(n), dm = new Float64Array(n).fill(bs);
    const len = new Float64Array(n);
    const nx = new Float64Array(n), ny = new Float64Array(n); // нормаль ребра i→i+1 (наружу от материала)
    for (let i = 0; i < n; i++) {
      const a = r[i], b = r[(i + 1) % n];
      const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1e-12;
      len[i] = l; nx[i] = dy / l; ny[i] = -dx / l;
    }
    for (let i = 0; i < n; i++) {
      const p = (i + n - 1) % n;
      let ux = nx[p] + nx[i], uy = ny[p] + ny[i];
      const k = 1 + nx[p] * nx[i] + ny[p] * ny[i];
      let f = 1 / Math.max(k, 0.16); // предел миттера ≈ 2.5
      mx[i] = ux * f; my[i] = uy * f;
      if (!S) continue;
      // луч вдоль смещения: до ближайшей границы, не считая двух рёбер при вершине
      const ml = Math.hypot(mx[i], my[i]) || 1;
      const ex = mx[i] / ml, ey = my[i] / ml;
      let hit = Infinity;
      const vx = r[i].x, vy = r[i].y;
      for (let j = 0; j < nSeg; j++) {
        const o6 = j * 6;
        if (segs[o6 + 4] === ri && (segs[o6 + 5] === i || segs[o6 + 5] === p)) continue;
        const ax = segs[o6], ay = segs[o6 + 1], bx = segs[o6 + 2], by = segs[o6 + 3];
        const exx = bx - ax, eyy = by - ay;
        const den = cross(ex, ey, exx, eyy);
        if (Math.abs(den) < 1e-14) continue;
        const wx = ax - vx, wy = ay - vy;
        const t = cross(wx, wy, exx, eyy) / den;
        if (t <= 1e-12 || t >= hit) continue;
        const s = cross(wx, wy, ex, ey) / den;
        if (s < -1e-9 || s > 1 + 1e-9) continue;
        hit = t;
      }
      dm[i] = Math.min(bs, (0.42 * hit) / ml);
    }
    if (S) {
      // сглаживание вдоль контура и откат развернувшихся рёбер
      const lip = () => { for (let pass = 0; pass < 2; pass++) { for (let i = 0; i < n; i++) { const j = (i + 1) % n; dm[j] = Math.min(dm[j], dm[i] + 0.9 * len[i]); } for (let i = n - 1; i >= 0; i--) { const j = (i + 1) % n; dm[i] = Math.min(dm[i], dm[j] + 0.9 * len[i]); } } };
      lip();
      // профиль фаски вдоль контура сглаживаем (без этого на кромке рябь от разных лучей), с запасом от пересечений
      const raw = Float64Array.from(dm);
      const tmp = new Float64Array(n);
      const passes = Math.min(24, Math.max(4, Math.round(n / 40)));
      for (let pass = 0; pass < passes; pass++) {
        for (let i = 0; i < n; i++) tmp[i] = (dm[(i + n - 1) % n] + 2 * dm[i] + dm[(i + 1) % n]) / 4;
        dm.set(tmp);
      }
      for (let i = 0; i < n; i++) dm[i] = Math.min(dm[i], raw[i] * 1.25);
      lip();
      for (let it = 0; it < 10; it++) {
        let bad = false;
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          const ax = r[i].x + mx[i] * dm[i], ay = r[i].y + my[i] * dm[i], bx = r[j].x + mx[j] * dm[j], by = r[j].y + my[j] * dm[j];
          const dot = (bx - ax) * (r[j].x - r[i].x) + (by - ay) * (r[j].y - r[i].y);
          if (dot < 0.25 * len[i] * len[i]) { dm[i] *= 0.6; dm[j] *= 0.6; bad = true; }
        }
        if (!bad) break;
        lip();
      }
    }
    R.mx = mx; R.my = my; R.dm = dm; R.nx = nx; R.ny = ny;
  });

  // слои фаски: спереди → сзади
  const layers: { z: number; f: number; zdir: number }[] = [];
  if (S) {
    for (let k = 0; k <= S; k++) { const a = (k / S) * Math.PI / 2; layers.push({ z: D / 2 + bt * Math.cos(a), f: Math.sin(a), zdir: 1 }); }
    for (let k = S; k >= 0; k--) { const a = (k / S) * Math.PI / 2; layers.push({ z: -D / 2 - bt * Math.cos(a), f: Math.sin(a), zdir: -1 }); }
  } else {
    layers.push({ z: D / 2, f: 0, zdir: 1 }, { z: -D / 2, f: 0, zdir: -1 });
  }
  const zFront = layers[0].z, zBack = layers[layers.length - 1].z;

  const vtx = (R: any, i: number, L: { z: number; f: number }) => [R.r[i].x + R.mx[i] * R.dm[i] * L.f, R.r[i].y + R.my[i] * R.dm[i] * L.f, L.z];
  const tri = (a: number[], b: number[], c: number[], keep = false) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    const q = cx * cx + cy * cy + cz * cz;
    if (q === 0) return; // вырожденный (сливеры крышек оставляем: иначе в сетке остаются щели)
    pos.push(...a, ...b, ...c);
  };

  // стенки: материал слева от обхода, наружу (dy,-dx), слои идут спереди назад
  all.forEach((R) => {
    const n = R.r.length;
    for (let l = 0; l < layers.length - 1; l++) {
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const A = vtx(R, i, layers[l]), B = vtx(R, j, layers[l]), C = vtx(R, j, layers[l + 1]), E = vtx(R, i, layers[l + 1]);
        tri(A, C, B); tri(A, E, C);
      }
    }
  });

  // крышки: триангуляция исходных контуров
  polys.forEach((p, pi) => {
    const rs = all.filter((R) => R.poly === pi);
    if (!rs.length || rs[0].kind !== 'o') return;
    const outer = rs[0].r.map((q) => new THREE.Vector2(q.x, q.y));
    const holes = rs.slice(1).map((R) => R.r.map((q) => new THREE.Vector2(q.x, q.y)));
    const flat = [...outer, ...holes.flat()];
    let faces: number[][] = [];
    try { faces = THREE.ShapeUtils.triangulateShape(outer, holes); } catch { faces = []; }
    for (const f of faces) {
      const a = flat[f[0]], b = flat[f[1]], c = flat[f[2]];
      const ar = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      const [i0, i1, i2] = ar >= 0 ? [f[0], f[1], f[2]] : [f[0], f[2], f[1]];
      const P = (i: number, z: number) => [flat[i].x, flat[i].y, z];
      tri(P(i0, zFront), P(i1, zFront), P(i2, zFront), true); // +z
      tri(P(i0, zBack), P(i2, zBack), P(i1, zBack), true); // -z
    }
  });

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
