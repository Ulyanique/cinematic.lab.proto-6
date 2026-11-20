import * as THREE from "three";
import { clamp, lerp, mulberry32, terrainHeight } from "./math";

/** Master timeline of the intro (seconds). */
export const TL = {
  visit0: 9.0,
  visitStep: 1.9,
  riseLead: 4.2,
  riseDur: 3.4,
  implodeStart: 27.2,
  explode: 31.5,
  logoText: 34.9,
  tagline: 36.3,
  finalSettle: 43.5,
  exitStart: 47.8,
  exitEnd: 50.7,
  fadeOutStart: 49.6,
  fadeOutEnd: 51,
  end: 51.5,
};

export const HERO_COUNT = 10;

export interface HeroPlacement {
  x: number;
  z: number;
  yaw: number;
  theta: number;
  radius: number;
}

export function heroPlacement(i: number): HeroPlacement {
  const rand = mulberry32(900 + i * 17);
  const theta = ((18 + 36 * i) * Math.PI) / 180 + (rand() - 0.5) * 0.06;
  // Extra clearance keeps the wider, near-square video faces from crowding one another
  // and leaves the camera path inside the ring of monoliths.
  const radius = 30.5 + (i % 3) * 1.6 + rand() * 1.2;
  const x = Math.sin(theta) * radius;
  const z = Math.cos(theta) * radius;
  // local +Z (screen normal) should look at the centre
  const yaw = Math.atan2(-x, -z) + (rand() - 0.5) * 0.35;
  return { x, z, yaw, theta, radius };
}

export const visitTime = (i: number) => TL.visit0 + i * TL.visitStep;

export const riseStart = (i: number) => visitTime(i) - TL.riseLead;

interface Key {
  t: number;
  p: THREE.Vector3;
  l: THREE.Vector3;
  fov: number;
  roll: number;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const key = (t: number, p: [number, number, number], l: [number, number, number], fov: number, roll = 0): Key => ({
  t,
  p: V(...p),
  l: V(...l),
  fov,
  roll,
});

function buildKeys(): Key[] {
  const keys: Key[] = [
    key(0, [5, 3.3, 176], [0, 8, 120], 56, 0.03),
    key(2.2, [-4, 3.1, 134], [8, 9, 80], 53, -0.045),
    key(4.4, [5, 4.4, 92], [-3, 10, 46], 51, 0.04),
    key(6.6, [-1.5, 5.6, 58], [0, 10, 16], 49, -0.02),
    key(7.9, [0.6, 5.0, 16], [4, 8.5, 8], 52, 0.0),
  ];
  const deltas = [-0.4, 0.05, -0.35, 0.1, -0.3, 0.15, -0.4, 0.05, -0.35, 0.1];
  const heights = [4.2, 8.5, 3.0, 9.5, 4.5, 8.0, 3.0, 9.0, 4.0, 7.5];
  const radii = [11, 13, 9, 14, 10, 13, 9, 14, 10, 12];
  const tys = [6.5, 9, 7, 8.5, 6, 9, 7.5, 8, 6.5, 8.5];
  const fovs = [44, 48, 42, 50, 44, 48, 40, 50, 44, 46];
  const rolls = [0.04, -0.05, 0.06, -0.04, 0.05, -0.06, 0.04, -0.05, 0.05, -0.03];
  for (let i = 0; i < HERO_COUNT; i++) {
    const h = heroPlacement(i);
    const phi = h.theta + deltas[i];
    keys.push(
      key(
        visitTime(i),
        [Math.sin(phi) * radii[i], heights[i], Math.cos(phi) * radii[i]],
        [h.x, tys[i], h.z],
        fovs[i],
        rolls[i]
      )
    );
  }
  keys.push(key(28.7, [6.5, 7.0, 19], [0, 5.6, 0], 62, 0.06));
  keys.push(key(30.2, [-1.2, 5.8, 11.5], [0, 5.6, 0], 70, -0.04));
  keys.push(key(TL.explode, [0, 5.5, 7.5], [0, 5.6, 0], 78, 0));
  return keys;
}


const KEYS = buildKeys();
const NK = KEYS.length;

/**
 * Time-aware cubic Hermite spline (non-uniform Catmull-Rom). Unlike a uniform
 * Catmull-Rom it keeps velocity continuous even though the keys are not evenly spaced
 * in time, so the fly-through never "snaps" at a key. The last key is a soft hover (zero velocity).
 */
const TENSION = 0.92;
interface Tan {
  p: THREE.Vector3;
  l: THREE.Vector3;
  fov: number;
  roll: number;
}
const TANS: Tan[] = KEYS.map((_k, j) => {
  if (j === NK - 1) return { p: V(0, 0, 0), l: V(0, 0, 0), fov: 0, roll: 0 };
  const a = KEYS[Math.max(0, j - 1)];
  const b = KEYS[j + 1];
  const dt = b.t - a.t;
  return {
    p: b.p.clone().sub(a.p).multiplyScalar(TENSION / dt),
    l: b.l.clone().sub(a.l).multiplyScalar(TENSION / dt),
    fov: ((b.fov - a.fov) * TENSION) / dt,
    roll: ((b.roll - a.roll) * TENSION) / dt,
  };
});

function herm(p0: number, m0: number, p1: number, m1: number, u: number, dt: number) {
  const u2 = u * u;
  const u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * dt * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * dt * m1;
}
function hermV(out: THREE.Vector3, a: THREE.Vector3, ma: THREE.Vector3, b: THREE.Vector3, mb: THREE.Vector3, u: number, dt: number) {
  out.set(herm(a.x, ma.x, b.x, mb.x, u, dt), herm(a.y, ma.y, b.y, mb.y, u, dt), herm(a.z, ma.z, b.z, mb.z, u, dt));
}

/** terrain height blurred over a neighbourhood: the raw field has sharp crests that would kink the camera */
function softGround(x: number, z: number) {
  let sum = terrainHeight(x, z);
  let n = 1;
  for (const R of [9, 21]) {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + R;
      sum += terrainHeight(x + Math.cos(a) * R, z + Math.sin(a) * R);
      n++;
    }
  }
  return sum / n;
}

const sstep = (x: number) => {
  const t = clamp(x);
  return t * t * (3 - 2 * t);
};

export interface CamState {
  pos: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
  roll: number;
}

export const FINAL = {
  pos: V(0, 5.5, 21),
  target: V(0, 4.8, 0),
  fov: 36,
};

export const BLAST_POS = V(0, 5.6, 0);
export const LOGO_POS = V(0, 5.8, 0);

export function sampleCamera(t: number, out: CamState, drift = 1) {
  sampleRaw(t, out, drift);
  if (t < TL.explode) out.pos.y += liftAt(t);

  // From the first monolith visit onward, keep the camera inside the ring of towers.
  // This prevents spline overshoot near the 28.7s transition from cutting through facades.
  if (t >= 7.9 && t < TL.explode) {
    const radius = Math.hypot(out.pos.x, out.pos.z);
    const safeRadius = 18;
    if (radius > safeRadius) {
      const scale = safeRadius / radius;
      out.pos.x *= scale;
      out.pos.z *= scale;
    }
  }
  return out;
}

function sampleRaw(t: number, out: CamState, drift = 1) {
  const tl = t - TL.explode;
  if (tl >= 0) {
    const last = KEYS[NK - 1];
    // starts from the hover (zero velocity) and eases into the final frame: no reversal jerk
    // ease-out-cubic whose first 0.3 s is blended in from rest: zero start velocity (no jerk),
    // yet the camera clears the fireball while the white flash still covers the frame
    const eo = (x: number) => 1 - Math.pow(1 - clamp(x), 3);
    const blend = (x: number) => sstep(x / 0.06) * eo(x);
    const e = blend(tl / 5.2);
    const ef = blend(tl / 6.0);
    out.pos.lerpVectors(last.p, FINAL.pos, e);
    out.target.lerpVectors(last.l, FINAL.target, e);
    out.fov = lerp(last.fov, FINAL.fov, ef) + 9 * (1 - Math.exp(-tl * 16)) * Math.exp(-tl * 2.4);
    out.roll = 0;
    // slow cinematic push-in with a hint of sway while the logo shines (all C1-continuous)
    out.pos.z -= sstep((tl - 2) / 14) * 1.6;
    out.pos.x += Math.sin(tl * 0.35) * 0.5 * sstep(tl / 5) * drift;
    out.pos.y += Math.sin(tl * 0.27) * 0.18 * sstep(tl / 5) * drift;
    return out;
  }
  let i = 0;
  while (i < NK - 2 && t >= KEYS[i + 1].t) i++;
  const k1 = KEYS[i];
  const k2 = KEYS[i + 1];
  const dt = k2.t - k1.t;
  const u = clamp((t - k1.t) / dt);
  hermV(out.pos, k1.p, TANS[i].p, k2.p, TANS[i + 1].p, u, dt);
  hermV(out.target, k1.l, TANS[i].l, k2.l, TANS[i + 1].l, u, dt);
  out.fov = herm(k1.fov, TANS[i].fov, k2.fov, TANS[i + 1].fov, u, dt);
  out.roll = herm(k1.roll, TANS[i].roll, k2.roll, TANS[i + 1].roll, u, dt) * 0.6;
  return out;
}

/**
 * "Never dive into the dunes": the lift needed to clear the ground is computed once along the
 * whole path, widened in time and gaussian-blurred – so the camera rises over hills with a long,
 * gentle swell instead of tracing every crest (which would feel like bumps).
 */
const LIFT_HZ = 30;
const LIFT: Float32Array = (() => {
  const n = Math.ceil(TL.explode * LIFT_HZ) + 2;
  const tmp: CamState = { pos: V(0, 0, 0), target: V(0, 0, 0), fov: 50, roll: 0 };
  const need = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    sampleRaw(Math.min(i / LIFT_HZ, TL.explode - 1e-4), tmp);
    need[i] = Math.max(0, softGround(tmp.pos.x, tmp.pos.z) + 2.9 - tmp.pos.y);
  }
  const W = Math.round(0.7 * LIFT_HZ);
  const dil = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let m = 0;
    for (let j = Math.max(0, i - W); j <= Math.min(n - 1, i + W); j++) m = Math.max(m, need[j]);
    dil[i] = m;
  }
  const sigma = 0.45 * LIFT_HZ;
  const R = Math.ceil(sigma * 3);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    let wsum = 0;
    for (let j = -R; j <= R; j++) {
      const k = Math.min(n - 1, Math.max(0, i + j));
      const w = Math.exp(-(j * j) / (2 * sigma * sigma));
      sum += dil[k] * w;
      wsum += w;
    }
    out[i] = sum / wsum;
  }
  return out;
})();

function liftAt(t: number) {
  const f = clamp(t, 0, TL.explode) * LIFT_HZ;
  const i = Math.floor(f);
  const u = f - i;
  const a = LIFT[Math.min(i, LIFT.length - 1)];
  const b = LIFT[Math.min(i + 1, LIFT.length - 1)];
  return a + (b - a) * u;
}
