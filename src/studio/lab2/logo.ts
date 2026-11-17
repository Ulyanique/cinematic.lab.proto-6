import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import logoSvg from './logo.svg?raw';
import { cleanPaths, resolveOverlaps, pathsToPolys, flattenCaps } from './polyfix';
import { extrudePolys } from './extrude';

/** Pixel coordinates from the original 1280×720 composition to world units. */
export const P = (x: number, y: number) => new THREE.Vector2((x - 640) / 80, (360 - y) / 80);

export interface LogoPart {
  name: string;
  geometry: THREE.BufferGeometry;
  z: number;
  center: THREE.Vector3;
  size: THREE.Vector3;
  dir: THREE.Vector3;
  /** чистые контуры (внешние и дыры) в системе координат геометрии — для световой «обводки» */
  rings: THREE.Vector3[][];
}

export interface LogoOpts { svg?: string; size: number; depth: number; bevel: number }

/** Ширина встроенного эмблемы в SVG-единицах: глубина и фаска в настройках заданы относительно неё. */
const DESIGN_W = 3937.77;

/** Build the 3D emblem directly from vector artwork (built-in or user-supplied SVG). */
export function buildLogoParts(opts: LogoOpts): LogoPart[] {
  const src = opts.svg && opts.svg.trim().startsWith('<') ? opts.svg : logoSvg;
  let svg;
  try {
    svg = new SVGLoader().parse(src);
  } catch {
    svg = new SVGLoader().parse(logoSvg);
  }
  const vb = /viewBox\s*=\s*["']\s*([-\d.eE]+)[\s,]+([-\d.eE]+)[\s,]+([-\d.eE]+)[\s,]+([-\d.eE]+)/.exec(src);
  const globalEvenOdd = /fill-rule\s*[:=]\s*["']?evenodd/i.test(src);

  // 1. контуры каждого <path> как наборы точек (кривые разворачиваются в ломаные)
  const rawParts: { rings: { x: number; y: number }[][]; rule: 'evenodd' | 'nonzero' }[] = [];
  const bb = new THREE.Box2();
  svg.paths.forEach((path) => {
    const rings = path.subPaths
      .map((sp) => sp.getPoints(24).map((p) => ({ x: p.x, y: p.y })))
      .filter((r) => r.length >= 3);
    if (!rings.length) return;
    rings.forEach((r) => r.forEach((p) => bb.expandByPoint(new THREE.Vector2(p.x, p.y))));
    const fr = (path.userData?.style as any)?.fillRule;
    rawParts.push({ rings, rule: fr === 'evenodd' || (!fr && globalEvenOdd) ? 'evenodd' : 'nonzero' });
  });
  if (!rawParts.length) throw new Error('Не удалось прочитать контуры логотипа SVG');

  const extent = Math.max(1e-6, bb.max.x - bb.min.x, bb.max.y - bb.min.y);
  const ox = vb ? parseFloat(vb[1]) : bb.min.x;
  const oy = vb ? parseFloat(vb[2]) : bb.min.y;
  const w = vb ? parseFloat(vb[3]) : bb.max.x - bb.min.x;
  const rel = (w || extent) / DESIGN_W;
  const depth = opts.depth * rel;
  const bevel = opts.bevel * rel;
  const scale = opts.size / (w || 1);

  // 2. ремонт: самопересечения, evenodd, дыры, слишком тонкие перемычки
  const K = 2_000_000 / extent;
  const cleaned = rawParts
    .map((p) => cleanPaths(p.rings, {
      scale: K, rule: p.rule, weld: extent * 0.0002, minArea: Math.pow(extent * 0.0015, 2), open: bevel > 0.5 ? bevel * 0.3 : 0,
    }))
    .filter((p) => p.length);
  // 3. перекрытия: сильные — склеиваем в одну деталь, слабые — вычитаем (иначе z-fighting)
  const groups = resolveOverlaps(cleaned, K, {
    minOverlap: Math.pow(extent * 0.001, 2),
    minArea: Math.pow(extent * 0.0015, 2),
    open: bevel > 0.5 ? bevel * 0.3 : 0,
  });

  const raws: THREE.BufferGeometry[] = [];
  const ringsOf: { x: number; y: number }[][][] = [];
  groups.forEach((paths) => {
    const polys = pathsToPolys(paths, K);
    if (!polys.length) return;
    // собственный экструдер: фаска не схлопывается в узких зазорах (штрихи «S», перемычки)
    const g = extrudePolys(polys, {
      depth,
      bevelThickness: bevel > 0.5 ? bevel : 0,
      bevelSize: bevel > 0.5 ? bevel * 0.82 : 0,
      segments: 5,
    });
    if (!g.attributes.position.count) { g.dispose(); return; }
    raws.push(g);
    ringsOf.push(polys.flatMap((q) => [q.outer, ...q.holes]));
  });
  if (!raws.length) throw new Error('Не удалось прочитать контуры логотипа SVG');

  const parts: LogoPart[] = [];
  raws.forEach((raw, index) => {
    raw.translate(-ox, -oy, 0);
    raw.scale(scale, scale, scale);
    // SVG coordinates point down. A half-turn keeps front-face winding intact.
    raw.rotateX(Math.PI);
    raw.translate(-opts.size / 2, P(0, 94).y, 0);
    const geometry = flattenCaps(toCreasedNormals(raw, 0.55));
    raw.dispose();
    geometry.computeBoundingBox();
    const bbx = geometry.boundingBox!;
    parts.push({
      name: `svg-${index}`,
      geometry,
      z: 0,
      center: bbx.getCenter(new THREE.Vector3()),
      size: bbx.getSize(new THREE.Vector3()),
      dir: new THREE.Vector3(0, -1, 0),
      // те же преобразования, что и у геометрии: сдвиг к началу, масштаб, переворот по Y, сдвиг к центру
      rings: ringsOf[index].map((ring) =>
        ring.map((pt) => new THREE.Vector3(
          (pt.x - ox) * scale - opts.size / 2,
          -(pt.y - oy) * scale + P(0, 94).y,
          (depth / 2 + bevel) * scale + 0.004,
        ))),
    });
  });
  return parts;
}
