/** Пресеты анимации: чистые функции «прогресс → трансформация». Используются для деталей эмблемы и букв названия. */

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));

const bounceOut = (x: number) => {
  const n1 = 7.5625, d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
  if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
  return n1 * (x -= 2.625 / d1) * x + 0.984375;
};

export const EASE: Record<string, (x: number) => number> = {
  linear: (x) => x,
  sine: (x) => -(Math.cos(Math.PI * x) - 1) / 2,
  cubic: (x) => 1 - Math.pow(1 - x, 3),
  quint: (x) => 1 - Math.pow(1 - x, 5),
  expo: (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
  back: (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
  elastic: (x) => (x <= 0 ? 0 : x >= 1 ? 1 : Math.pow(2, -9 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
  bounce: bounceOut,
};

export interface Xf {
  x: number; y: number; z: number;
  rx: number; ry: number; rz: number;
  s: number;
  /** 0..1 — шейдерное «растворение» золота; 1 = полностью проявлено */
  reveal: number;
}
const id = (): Xf => ({ x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, s: 1, reveal: 1 });
const sine = EASE.sine;

export interface PartCtx {
  /** смещение центра детали от центра эмблемы (xy) */
  vx: number; vy: number;
  i: number; n: number;
  /** детерминированная случайность 0..1 */
  r: number;
  a: number;         // сила
  ang: number;       // направление, рад
  turns: number;
  ease: (x: number) => number;
}

/** k — линейный прогресс детали 0..1. Возвращает трансформацию относительно финального положения. */
export function logoXf(preset: string, k: number, c: PartCtx): Xf {
  const o = id();
  const e = c.ease(clamp01(k));
  const inv = 1 - e;
  const dx = Math.cos(c.ang), dy = Math.sin(c.ang);
  const side = c.i % 2 ? 1 : -1;
  const fastReveal = clamp01(k * 3.2);
  switch (preset) {
    case 'assemble': {
      const a = c.ang + (c.i / c.n) * Math.PI * 2 * 0.35 + (c.r - 0.5) * 0.8;
      o.x = Math.cos(a) * 6 * c.a * inv; o.y = Math.sin(a) * 6 * c.a * inv; o.z = -3 * c.a * inv;
      o.rz = inv * 0.9 * side * c.a; o.ry = inv * 0.8 * side * c.a;
      o.reveal = fastReveal; break;
    }
    case 'forge':
      o.reveal = sine(clamp01(k)); o.s = 1 + 0.1 * c.a * inv; o.z = 1.2 * c.a * inv; break;
    case 'spin':
      o.ry = inv * c.turns * Math.PI * 2; o.s = 1 - 0.45 * c.a * inv; o.z = -4 * c.a * inv; o.reveal = fastReveal; break;
    case 'rise':
      o.y = -3.2 * c.a * inv; o.z = -2 * c.a * inv; o.rx = 0.55 * c.a * inv; o.reveal = clamp01(k * 2.4); break;
    case 'implode': {
      const L = Math.hypot(c.vx, c.vy) || 1;
      o.x = (c.vx / L) * 7 * c.a * inv; o.y = (c.vy / L) * 7 * c.a * inv; o.z = 5 * c.a * inv;
      o.rz = inv * (c.r - 0.5) * 3 * c.a; o.reveal = clamp01(k * 5); break;
    }
    case 'drop': {
      const b = bounceOut(clamp01(k));
      o.x = dx * 0.0; o.y = 6.5 * c.a * (1 - b); o.rz = (1 - b) * 0.25 * side * c.a; o.reveal = clamp01(k * 6); break;
    }
    case 'flip':
      o.rx = inv * Math.PI * c.a * (c.turns || 1) * side; o.z = -1.5 * c.a * inv; o.reveal = clamp01(k * 4); break;
    case 'zoom':
      o.s = 1 + 4.2 * c.a * inv; o.z = 6 * c.a * inv; o.reveal = clamp01(k * 3); break;
    case 'unfold':
      o.x = -c.vx * inv; o.y = -c.vy * inv; o.s = Math.max(0.001, e); o.rz = inv * Math.PI * c.a * side; o.reveal = clamp01(k * 3); break;
    case 'slide':
      o.x = (c.i % 2 ? 1 : -1) * 8 * c.a * inv * Math.abs(dx || 1); o.y = dy * 3 * c.a * inv; o.reveal = clamp01(k * 4); break;
    case 'fade':
      o.reveal = sine(clamp01(k)); o.z = -1.4 * c.a * inv; o.s = 1 - 0.05 * c.a * inv; break;
    default: // swarm: детали проявляются растворением
      o.reveal = sine(clamp01(k));
  }
  return o;
}

export interface LetterCtx { seed: number; r: number; a: number; ease: (x: number) => number }

/** Буквы названия: p — линейный прогресс. */
export function letterXf(preset: string, p: number, c: LetterCtx): Xf {
  const o = id();
  const e = c.ease(clamp01(p));
  const inv = 1 - e;
  const e5 = 1 - Math.pow(1 - clamp01(p), 5);
  const a = c.a, sd = c.seed;
  const rv = sine(seg(p, 0.02, 0.85));
  o.reveal = rv;
  switch (preset) {
    case 'rise':
      o.y = -2.4 * a * inv; o.rx = 1.1 * a * inv; o.z = -1.5 * a * inv; break;
    case 'drop':
      o.y = 4.2 * a * (1 - bounceOut(clamp01(p))); o.rz = 0.2 * sd * a * inv; o.reveal = clamp01(p * 5); break;
    case 'flip':
      o.rx = Math.PI * a * inv * sd; o.z = -1.2 * a * inv; o.reveal = clamp01(p * 3.5); break;
    case 'zoom':
      o.z = 9 * a * inv; o.s = 1 + 0.5 * a * inv; o.reveal = clamp01(p * 3); break;
    case 'scatter':
      o.x = (c.r - 0.5) * 7 * a * inv; o.y = (((c.r * 7.13) % 1) - 0.5) * 5 * a * inv; o.z = -5 * a * inv;
      o.rx = (c.r - 0.5) * 6 * a * inv; o.ry = (((c.r * 3.7) % 1) - 0.5) * 6 * a * inv; o.rz = (c.r - 0.5) * 3 * a * inv; break;
    case 'spin':
      o.ry = Math.PI * 2 * a * inv * sd; o.s = 1 + 0.3 * a * inv; o.reveal = clamp01(p * 3); break;
    case 'pop':
      o.s = Math.max(0.001, c.ease(clamp01(p)) * 1) ; o.z = 0; o.reveal = clamp01(p * 6); break;
    case 'fade':
      o.z = -0.8 * a * inv; o.s = 1 + 0.12 * a * inv; break;
    default: // fly — исходная анимация
      o.y = -(1 - e5) * 0.5 * a; o.z = -(1 - e5) * 6.5 * a;
      o.rx = inv * 1.0 * sd * a; o.ry = inv * 0.7 * -sd * a; o.rz = inv * 0.15 * sd * a; o.s = 1 + inv * 0.08 * a;
  }
  return o;
}
