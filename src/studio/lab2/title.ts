// @ts-nocheck
import * as THREE from 'three';
import { parse as parseFont } from 'opentype.js';
import { cleanPaths, pathsToPolys, flattenCaps } from './polyfix';
import { extrudePolys } from './extrude';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface Letter {
  char: string;
  geometry: THREE.BufferGeometry;
  center: THREE.Vector3; // final centre in title space
  size: THREE.Vector3;
  rings?: THREE.Vector3[][]; // контуры передней грани (для световой кромки)
}

const fontCache = new Map<string, Promise<any>>();
function loadFont(url: string) {
  if (!fontCache.has(url)) {
    fontCache.set(
      url,
      fetch(url).then(async (r) => {
        if (!r.ok) throw new Error(`Не удалось загрузить шрифт: ${r.status}`);
        return parseFont(await r.arrayBuffer());
      }).catch((e) => { fontCache.delete(url); throw e; }) // не помним неудачу: следующая попытка загрузит заново
    );
  }
  return fontCache.get(url)!;
}

export interface TitleOpts { tracking: number; depth: number; bevel: number }

/** Строит 3D-буквы. `fontUrls` — подмножества одного шрифта (кириллица + латиница). */
export async function buildTitle(fontUrls: string[], text: string, targetWidth: number, opts: TitleOpts) {
  const fonts = await Promise.all(fontUrls.map(loadFont));
  const main = fonts[0];
  const { tracking, depth, bevel } = opts;
  const pick = (ch: string) => fonts.find((f) => f.charToGlyphIndex(ch) > 0) ?? main;

  const layout = (fs: number) => {
    let x = 0;
    const items: any[] = [];
    let prev: any = null, prevFont: any = null;
    for (const ch of text) {
      const font = pick(ch);
      const g = font.charToGlyph(ch);
      if (prev && prevFont === font) x += font.getKerningValue(prev, g) * (fs / font.unitsPerEm);
      const adv = ((g.advanceWidth || font.unitsPerEm * 0.3) * fs) / font.unitsPerEm;
      if (ch !== ' ' && ch !== '\n') items.push({ ch, g, x });
      prev = g; prevFont = font;
      x += adv + tracking * fs;
    }
    return { items, width: Math.max(0.0001, x - tracking * fs) };
  };
  const base = layout(1);
  const fs = targetWidth / base.width;
  const lay = layout(fs);

  const letters: Letter[] = [];
  for (const it of lay.items) {
    const path = it.g.getPath(it.x, 0, fs);
    // контуры глифа → ломаные (кривые разворачиваются адаптивно), затем ремонт: наложения, самопересечения, дыры
    const rings = [];
    let ring = null, cx = 0, cy = 0;
    const steps = (len) => Math.max(6, Math.min(40, Math.ceil(len / (fs * 0.012))));
    for (const c of path.commands) {
      if (c.type === 'M') { if (ring && ring.length > 2) rings.push(ring); ring = [{ x: c.x, y: -c.y }]; cx = c.x; cy = c.y; }
      else if (!ring) continue;
      else if (c.type === 'L') { ring.push({ x: c.x, y: -c.y }); cx = c.x; cy = c.y; }
      else if (c.type === 'Q') {
        const n = steps(Math.hypot(c.x1 - cx, c.y1 - cy) + Math.hypot(c.x - c.x1, c.y - c.y1));
        for (let i = 1; i <= n; i++) {
          const t = i / n, u = 1 - t;
          ring.push({ x: u * u * cx + 2 * u * t * c.x1 + t * t * c.x, y: -(u * u * cy + 2 * u * t * c.y1 + t * t * c.y) });
        }
        cx = c.x; cy = c.y;
      } else if (c.type === 'C') {
        const n = steps(Math.hypot(c.x1 - cx, c.y1 - cy) + Math.hypot(c.x2 - c.x1, c.y2 - c.y1) + Math.hypot(c.x - c.x2, c.y - c.y2));
        for (let i = 1; i <= n; i++) {
          const t = i / n, u = 1 - t;
          ring.push({
            x: u * u * u * cx + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t * t * t * c.x,
            y: -(u * u * u * cy + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t * t * t * c.y),
          });
        }
        cx = c.x; cy = c.y;
      } else if (c.type === 'Z') { if (ring && ring.length > 2) rings.push(ring); ring = null; }
    }
    if (ring && ring.length > 2) rings.push(ring);
    const fo = { scale: 200_000 / Math.max(fs, 1e-6), rule: 'nonzero', weld: fs * 0.0004, minArea: fs * fs * 1e-6 };
    const polys = pathsToPolys(cleanPaths(rings, fo), fo.scale);
    if (!polys.length) continue;
    const g0 = extrudePolys(polys, {
      depth,
      bevelThickness: bevel > 0.001 ? bevel : 0,
      bevelSize: bevel > 0.001 ? bevel * 0.8 : 0,
      segments: 5,
    });
    if (!g0.attributes.position.count) { g0.dispose(); continue; }
    g0.translate(-lay.width / 2, 0, 0);
    const g = flattenCaps(toCreasedNormals(g0, 0.5));
    g0.dispose();
    g.computeBoundingBox();
    const bb = g.boundingBox;
    const zf = depth / 2 + bevel + 0.003;
    const edgeRings = [];
    for (const pl of polys) {
      for (const ring of [pl.outer, ...pl.holes]) edgeRings.push(ring.map((q) => new THREE.Vector3(q.x - lay.width / 2, q.y, zf)));
    }
    letters.push({
      rings: edgeRings,
      char: it.ch,
      geometry: g,
      center: bb.getCenter(new THREE.Vector3()),
      size: bb.getSize(new THREE.Vector3()),
    });
  }
  const capH = ((main.tables.os2?.sCapHeight || 700) * fs) / main.unitsPerEm;
  return { letters, capH, width: lay.width, fontSize: fs };
}
