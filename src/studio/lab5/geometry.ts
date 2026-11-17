import * as THREE from "three";
import Delaunator from "delaunator";
import { lerp, mulberry32, smoothstep, terrainHeight } from "./math";

type V3 = THREE.Vector3;
const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/**
 * Non-indexed triangle accumulator. Every triangle gets barycentric coords (for glowing edges),
 * its centroid (for per-facet assemble animation) and a random seed.
 */
export class TriSoup {
  pos: number[] = [];
  bary: number[] = [];
  cen: number[] = [];
  rnd: number[] = [];
  hh: number[] = [];
  y0 = 0;
  hgt = 1;
  fixedH: number | null = null;
  rand: () => number;

  constructor(rand: () => number) {
    this.rand = rand;
  }

  tri(a: V3, b: V3, c: V3) {
    const rr = this.rand();
    const cx = (a.x + b.x + c.x) / 3;
    const cy = (a.y + b.y + c.y) / 3;
    const cz = (a.z + b.z + c.z) / 3;
    const verts = [a, b, c];
    const B = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
    for (let k = 0; k < 3; k++) {
      const v = verts[k];
      this.pos.push(v.x, v.y, v.z);
      this.bary.push(B[k][0], B[k][1], B[k][2]);
      this.cen.push(cx, cy, cz);
      this.rnd.push(rr);
      this.hh.push(this.fixedH !== null ? this.fixedH : (v.y - this.y0) / this.hgt);
    }
  }

  quad(a: V3, b: V3, c: V3, d: V3) {
    this.tri(a, b, c);
    this.tri(a, c, d);
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("aBary", new THREE.Float32BufferAttribute(this.bary, 3));
    g.setAttribute("aCenter", new THREE.Float32BufferAttribute(this.cen, 3));
    g.setAttribute("aRand", new THREE.Float32BufferAttribute(this.rnd, 1));
    g.setAttribute("aH", new THREE.Float32BufferAttribute(this.hh, 1));
    g.computeBoundingSphere();
    return g;
  }
}

/* ------------------------------------------------------------------ terrain */

export function buildTerrain(seed = 11) {
  const rand = mulberry32(seed);
  const R = 340;
  const pts: number[] = [0, 0];
  let r = 1.7;
  while (r < R) {
    const s = 1.35 + 0.034 * r;
    const n = Math.max(6, Math.floor((2 * Math.PI * r) / s));
    const off = rand() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a = off + ((i + (rand() - 0.5) * 0.7) / n) * Math.PI * 2;
      const rr = r + (rand() - 0.5) * s * 0.55;
      pts.push(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    r += s * 0.95;
  }
  const count = pts.length / 2;
  const ys = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const x = pts[i * 2];
    const z = pts[i * 2 + 1];
    const rr = Math.hypot(x, z);
    const far = smoothstep(26, 170, rr);
    const arena = 1 - smoothstep(12, 30, rr);
    const jit = (0.35 + 2.4 * far) * (1 - arena * 0.92);
    ys[i] = terrainHeight(x, z) + (rand() - 0.5) * jit;
  }
  const del = new Delaunator(Float64Array.from(pts));
  const soup = new TriSoup(rand);
  soup.fixedH = -1;
  const T = del.triangles;
  const a = v3();
  const b = v3();
  const c = v3();
  for (let i = 0; i < T.length; i += 3) {
    const i0 = T[i];
    const i1 = T[i + 1];
    const i2 = T[i + 2];
    a.set(pts[i0 * 2], ys[i0], pts[i0 * 2 + 1]);
    b.set(pts[i1 * 2], ys[i1], pts[i1 * 2 + 1]);
    c.set(pts[i2 * 2], ys[i2], pts[i2 * 2 + 1]);
    if (a.distanceTo(b) > 60 || b.distanceTo(c) > 60 || a.distanceTo(c) > 60) continue;
    soup.tri(a.clone(), b.clone(), c.clone());
  }
  return soup.build();
}

/* ------------------------------------------------------------------ prisms */

export interface PrismOpts {
  base: V3;
  sides: number;
  radius: number;
  height: number;
  taper: number;
  rings?: number;
  jitter?: number;
  twist?: number;
  lean?: V3;
  capH?: number;
  capSlant?: V3;
  topJitter?: number;
  rot?: number;
  sx?: number;
  sz?: number;
}

export function addPrism(soup: TriSoup, o: PrismOpts, rand: () => number) {
  const rings = o.rings ?? 1;
  const N = o.sides;
  const jit = o.jitter ?? 0;
  const rot = o.rot ?? 0;
  const twist = o.twist ?? 0;
  const lean = o.lean ?? v3();
  const sx = o.sx ?? 1;
  const sz = o.sz ?? 1;
  const rj: number[] = [];
  const aj: number[] = [];
  for (let j = 0; j < N; j++) {
    rj.push(1 + (rand() - 0.5) * 2 * jit);
    aj.push(((j + (rand() - 0.5) * jit * 1.2) / N) * Math.PI * 2);
  }
  const P: V3[][] = [];
  for (let k = 0; k <= rings; k++) {
    const t = k / rings;
    const sc = lerp(1, o.taper, t);
    const row: V3[] = [];
    for (let j = 0; j < N; j++) {
      const ang = rot + aj[j] + twist * t;
      const extra = k > 0 && k < rings ? 1 + (rand() - 0.5) * 0.2 * jit : 1;
      const rr = o.radius * sc * rj[j] * extra;
      const x = o.base.x + Math.cos(ang) * rr * sx + lean.x * t;
      const z = o.base.z + Math.sin(ang) * rr * sz + lean.z * t;
      let y = o.base.y + o.height * t;
      if (k === rings) y += (rand() - 0.5) * (o.topJitter ?? 0);
      row.push(v3(x, y, z));
    }
    P.push(row);
  }
  for (let k = 0; k < rings; k++) {
    for (let j = 0; j < N; j++) {
      const j2 = (j + 1) % N;
      soup.quad(P[k][j], P[k][j2], P[k + 1][j2], P[k + 1][j]);
    }
  }
  const top = P[rings];
  const apex = v3();
  top.forEach((p) => apex.add(p));
  apex.multiplyScalar(1 / N);
  apex.y += o.capH ?? 0;
  if (o.capSlant) apex.add(o.capSlant);
  for (let j = 0; j < N; j++) {
    soup.tri(apex.clone(), top[j], top[(j + 1) % N]);
  }
}

/* ------------------------------------------------------------------ scenery */

export function buildScenery(seed = 5) {
  const rand = mulberry32(seed);
  const soup = new TriSoup(rand);

  const placeBase = (x: number, z: number) => terrainHeight(x, z) - 1.8;

  // 1. clusters of box towers (like the reference) flanking the opening fly-through and all around
  const clusters: { x: number; z: number; s: number }[] = [];
  for (let i = 0; i < 9; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    clusters.push({ x: side * (22 + rand() * 20), z: 175 - i * 15 + rand() * 6, s: 1.05 + rand() * 0.5 });
  }
  for (let i = 0; i < 30; i++) {
    const a = rand() * Math.PI * 2;
    const rr = 62 + rand() * 190;
    const x = Math.sin(a) * rr;
    const z = Math.cos(a) * rr;
    if (Math.abs(x) < 20 && z > 20) continue;
    clusters.push({ x, z, s: 0.8 + rand() * 1.1 });
  }
  for (const cl of clusters) {
    const n = 3 + Math.floor(rand() * 3);
    const yaw = rand() * Math.PI;
    for (let k = 0; k < n; k++) {
      const ox = (rand() - 0.5) * 12 * cl.s;
      const oz = (rand() - 0.5) * 12 * cl.s;
      const x = cl.x + ox;
      const z = cl.z + oz;
      const w = (2.4 + rand() * 3.6) * cl.s;
      const h = (k === 0 ? 38 + rand() * 24 : 12 + rand() * 24) * cl.s;
      const by = placeBase(x, z);
      soup.y0 = by;
      soup.hgt = h;
      addPrism(
        soup,
        {
          base: v3(x, by, z),
          sides: 4,
          radius: w,
          height: h,
          taper: 0.9 + rand() * 0.1,
          rings: 1,
          jitter: 0.04,
          rot: Math.PI / 4 + yaw,
          sx: 0.8 + rand() * 0.5,
          sz: 0.8 + rand() * 0.5,
          capH: rand() < 0.3 ? 1.5 + rand() * 2 : 0,
          topJitter: 0,
        },
        rand
      );
    }
  }

  // 2. crystal spike clumps
  for (let i = 0; i < 70; i++) {
    const a = rand() * Math.PI * 2;
    const rr = 12 + Math.pow(rand(), 0.8) * 200;
    const cx = Math.sin(a) * rr;
    const cz = Math.cos(a) * rr;
    if (rr > 21 && rr < 40) continue;
    if (Math.abs(cx) < 6 && cz > 30) continue;
    const n = 2 + Math.floor(rand() * 4);
    for (let k = 0; k < n; k++) {
      const x = cx + (rand() - 0.5) * 7;
      const z = cz + (rand() - 0.5) * 7;
      const h = 3 + rand() * 11 * (k === 0 ? 1.3 : 0.8);
      const by = placeBase(x, z) + 0.6;
      soup.y0 = by;
      soup.hgt = h;
      const la = rand() * Math.PI * 2;
      const ll = 0.4 + rand() * 2.2;
      addPrism(
        soup,
        {
          base: v3(x, by, z),
          sides: 5 + Math.floor(rand() * 2),
          radius: 0.6 + rand() * 1.5,
          height: h,
          taper: 0.08 + rand() * 0.3,
          rings: 2,
          jitter: 0.25,
          twist: (rand() - 0.5) * 0.6,
          lean: v3(Math.cos(la) * ll, 0, Math.sin(la) * ll),
          capH: 0.8 + rand() * 2.2,
          topJitter: 0.4,
          rot: rand() * 6,
        },
        rand
      );
    }
  }
  return soup.build();
}

/* ------------------------------------------------------------------ hero monoliths */

export interface HeroData {
  body: THREE.BufferGeometry;
  screen: THREE.BufferGeometry;
  height: number;
  totalHeight: number;
  aspect: number;
  baseRadius: number;
}

export function buildHero(seed: number): HeroData {
  const rand = mulberry32(seed);
  const soup = new TriSoup(rand);

  const N = [5, 6, 6, 7][Math.floor(rand() * 4)];
  // Wider than the original pillar, while retaining enough clearance between neighbors.
  const wb = 10.5 + rand() * 2.0;
  const R = wb / (2 * Math.sin(Math.PI / N));
  const H = 12.5 + rand() * 3.5;
  const taper = 0.78 + rand() * 0.12;
  const skew = v3((rand() - 0.5) * 3.4, 0, -(0.3 + rand() * 1.4));

  soup.y0 = 0;
  soup.hgt = H;

  const base: V3[] = [];
  const mid: V3[] = [];
  const top: V3[] = [];
  const tm0 = 0.5 + (rand() - 0.5) * 0.1;
  for (let j = 0; j < N; j++) {
    const phi = ((j - 0.5) * 2 * Math.PI) / N + (j >= 2 ? (rand() - 0.5) * 0.35 : 0);
    const rr = j < 2 ? R : R * (0.82 + rand() * 0.42);
    const bx = Math.sin(phi) * rr;
    const bz = Math.cos(phi) * rr;
    base.push(v3(bx, 0, bz));
    if (j < 2) {
      top.push(v3(bx * taper + skew.x, H, bz * taper + skew.z));
      mid.push(
        v3(lerp(bx, bx * taper + skew.x, tm0), H * tm0, lerp(bz, bz * taper + skew.z, tm0))
      );
    } else {
      const tp = taper * (0.78 + rand() * 0.4);
      const sk = 0.4 + rand() * 1.1;
      const th = H * (0.8 + rand() * 0.42);
      const tx = bx * tp + skew.x * sk;
      const tz = bz * tp + skew.z * sk;
      top.push(v3(tx, th, tz));
      const tm = tm0 + (rand() - 0.5) * 0.2;
      const bulge = 1.04 + rand() * 0.14;
      mid.push(v3(lerp(bx, tx, tm) * bulge, th * tm, lerp(bz, tz, tm) * bulge));
    }
  }
  for (let j = 0; j < N; j++) {
    const j2 = (j + 1) % N;
    soup.quad(base[j], base[j2], mid[j2], mid[j]);
    soup.quad(mid[j], mid[j2], top[j2], top[j]);
  }
  const apex = v3();
  top.forEach((p) => apex.add(p));
  apex.multiplyScalar(1 / N);
  const capH = 2.5 + rand() * 3.5;
  apex.y = Math.max(...top.map((p) => p.y)) + capH;
  apex.x += (rand() - 0.5) * 2.4;
  apex.z += (rand() - 0.5) * 2.4;
  for (let j = 0; j < N; j++) soup.tri(apex.clone(), top[j], top[(j + 1) % N]);

  // satellite crystal shards hugging the back of the monolith
  const shards = 3 + Math.floor(rand() * 2);
  for (let s = 0; s < shards; s++) {
    const phi = Math.PI * (0.5 + rand() * 1.0) + (rand() < 0.5 ? 0 : 0.0);
    const dist = R * (0.95 + rand() * 0.5);
    const h = 4.5 + rand() * 7;
    addPrism(
      soup,
      {
        base: v3(Math.sin(phi) * dist, -0.8, Math.cos(phi) * dist),
        sides: 5 + Math.floor(rand() * 2),
        radius: 0.9 + rand() * 1.3,
        height: h,
        taper: 0.1 + rand() * 0.25,
        rings: 2,
        jitter: 0.22,
        lean: v3(Math.sin(phi) * (1 + rand() * 2.5), 0, Math.cos(phi) * (1 + rand() * 2.5)),
        capH: 1 + rand() * 2,
        topJitter: 0.4,
        rot: rand() * 6,
      },
      rand
    );
  }

  // screen face: planar trapezoid with perspective-correct (N / W) mapping
  const b0 = base[0];
  const b1 = base[1];
  const t0 = top[0];
  const t1 = top[1];
  const nrm = v3().subVectors(b1, b0).cross(v3().subVectors(t0, b0)).normalize();
  const off = nrm.clone().multiplyScalar(0.06);
  const P = [b0, b1, t1, t0].map((p) => p.clone().add(off));
  // Fit a horizontal 16:9 screen inside the tall facade, leaving a stone frame.
  const sideL = P[3].clone().sub(P[0]);
  const sideR = P[2].clone().sub(P[1]);
  const sideLLen = sideL.length();
  const sideRLen = sideR.length();
  const spanBottom = P[1].distanceTo(P[0]);
  const spanTop = P[2].distanceTo(P[3]);
  const panelH = Math.min((spanBottom + spanTop) * 0.5 * 9 / 16, sideLLen, sideRLen);
  const insetL = (sideLLen - panelH) / (2 * sideLLen);
  const insetR = (sideRLen - panelH) / (2 * sideRLen);
  const bottomL = P[0].clone();
  const bottomR = P[1].clone();
  P[0].copy(bottomL).addScaledVector(sideL, insetL);
  P[3].copy(bottomL).addScaledVector(sideL, 1 - insetL);
  P[1].copy(bottomR).addScaledVector(sideR, insetR);
  P[2].copy(bottomR).addScaledVector(sideR, 1 - insetR);
  const wbot = b1.x - b0.x;
  const wtop = t1.x - t0.x;
  const scrData = [
    [0, wbot, 0],
    [wbot, wbot, 0],
    [wtop, wtop, 1],
    [0, wtop, 1],
  ];
  const idx = [0, 1, 2, 0, 2, 3];
  const sp: number[] = [];
  const ss: number[] = [];
  for (const i of idx) {
    sp.push(P[i].x, P[i].y, P[i].z);
    ss.push(scrData[i][0], scrData[i][1], scrData[i][2]);
  }
  const screen = new THREE.BufferGeometry();
  screen.setAttribute("position", new THREE.Float32BufferAttribute(sp, 3));
  screen.setAttribute("aScr", new THREE.Float32BufferAttribute(ss, 3));
  screen.computeBoundingSphere();

  const aspect = (P[1].distanceTo(P[0]) + P[2].distanceTo(P[3])) / (2 * panelH);
  return {
    body: soup.build(),
    screen,
    height: H,
    totalHeight: H + capH,
    aspect,
    baseRadius: R,
  };
}
