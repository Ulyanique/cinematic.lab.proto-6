import type { AnimatedProperty, CubicBezier, EasingType, Keyframe } from './schema'

export function clamp01(t: number): number {
  return Math.max(0, Math.min(1, t))
}

export function cubicBezier(t: number, { x1, y1, x2, y2 }: CubicBezier): number {
  const u = clamp01(t)
  // Solve x(s) = u via Newton-Raphson, then return y(s)
  const cx = 3 * x1
  const bx = 3 * (x2 - x1) - cx
  const ax = 1 - cx - bx
  const cy = 3 * y1
  const by = 3 * (y2 - y1) - cy
  const ay = 1 - cy - by

  let s = u
  for (let i = 0; i < 6; i++) {
    const x = ((ax * s + bx) * s + cx) * s - u
    const dx = (3 * ax * s + 2 * bx) * s + cx
    if (Math.abs(x) < 1e-6 || Math.abs(dx) < 1e-6) break
    s = clamp01(s - x / dx)
  }
  return ((ay * s + by) * s + cy) * s
}

export function applyEasing(t: number, easing: EasingType | CubicBezier = 'linear'): number {
  const u = clamp01(t)
  if (typeof easing === 'object') return cubicBezier(u, easing)
  switch (easing) {
    case 'hold':
      return u >= 1 ? 1 : 0
    case 'easeIn':
      return u * u * u
    case 'easeOut':
      return 1 - Math.pow(1 - u, 3)
    case 'easeInOut':
      return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2
    case 'linear':
    default:
      return u
  }
}

export function isKeyframeArray<T>(prop: AnimatedProperty<T>): prop is Keyframe<T>[] {
  return Array.isArray(prop) && prop.length > 0 && typeof prop[0] === 'object' && prop[0] !== null && 'time' in prop[0]
}

function lerpValue<T>(a: T, b: T, t: number): T {
  if (typeof a === 'number' && typeof b === 'number') {
    return (a + (b - a) * t) as T
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.map((v, i) => (typeof v === 'number' && typeof b[i] === 'number' ? v + (b[i] - v) * t : v)) as T
  }
  return t >= 1 ? b : a
}

export function evaluateProperty<T>(prop: AnimatedProperty<T>, time: number): T {
  if (!isKeyframeArray(prop)) return prop
  const sorted = prop.length > 1 ? [...prop].sort((a, b) => a.time - b.time) : prop
  if (time <= sorted[0].time) return sorted[0].value
  const last = sorted[sorted.length - 1]
  if (time >= last.time) return last.value

  for (let i = 0; i < sorted.length - 1; i++) {
    const k0 = sorted[i]
    const k1 = sorted[i + 1]
    if (time >= k0.time && time <= k1.time) {
      const span = k1.time - k0.time
      if (span <= 0) return k1.value
      const rawT = (time - k0.time) / span
      const easedT = applyEasing(rawT, k0.easing ?? 'linear')
      return lerpValue(k0.value, k1.value, easedT)
    }
  }
  return last.value
}
