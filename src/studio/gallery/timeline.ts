/** Fixed frame boundaries in WebCodecs microseconds, independently of wall-clock time. */
export function frameTiming(index: number, fps: number) {
  const timestamp = Math.round(index * 1_000_000 / fps)
  return { timestamp, duration: Math.round((index + 1) * 1_000_000 / fps) - timestamp }
}

/** Continuous camera motion: slow near panel centres, faster between them, never held in place. */
export function continuousCameraTime(t: number, first: number, last: number, interval: number, finale: number) {
  const smooth = (a: number, b: number, x: number) => {
    const p = Math.max(0, Math.min(1, (x - a) / (b - a)))
    return p * p * (3 - 2 * p)
  }
  const envelope = smooth(first - 3, first - 1, t) * (1 - smooth(last + 1, finale - 0.5, t))
  const phase = 2 * Math.PI * (t - first) / interval
  return t - envelope * (0.7 * interval / (2 * Math.PI)) * Math.sin(phase)
}

/** A true circle around the whole rectangle, with room beyond all four corners. */
export function lightOrbit(t: number, centre: number, strand: number, width: number, height: number) {
  const angle = (t - centre) * (2 * Math.PI / 2.7) - Math.PI / 2 + strand * 0.028
  const radius = Math.hypot(width / 2, height / 2) + 1.5
  return { x: radius * Math.cos(angle), y: radius * Math.sin(angle), z: 0.75 + strand * 0.06 }
}

/** Select the closest panel without connecting paths through either card. */
export function lightPanelIndex(t: number, first: number, interval: number, count: number) {
  return Math.max(0, Math.min(count - 1, Math.floor((t - first) / interval + 0.5)))
}

/** Fade the beam at each panel change, so its path never cuts between cards. */
export function lightVisibility(t: number, first: number, interval: number, count: number, before: number, after: number) {
  const smooth = (a: number, b: number, x: number) => {
    const p = Math.max(0, Math.min(1, (x - a) / (b - a)))
    return p * p * (3 - 2 * p)
  }
  const last = first + (count - 1) * interval
  const edgeFade = smooth(first - before, first - before + 0.5, t) * (1 - smooth(last + after - 0.5, last + after, t))
  const nextIndex = Math.round((t - first) / interval + 0.5)
  if (nextIndex < 1 || nextIndex >= count) return edgeFade
  const boundary = first + (nextIndex - 0.5) * interval
  return edgeFade * smooth(0, 0.45, Math.abs(t - boundary))
}

/** Position of a looping source video on the shared preview/export timeline. */
export function clipMediaTime(t: number, centre: number, before: number, duration: number) {
  return Number.isFinite(duration) && duration > 0 ? Math.max(0, t - (centre - before)) % duration : 0
}

/** A calm, dark stage for the identity after the initial finale burst. */
export function finaleDim(t: number, flashTime: number) {
  const p = Math.max(0, Math.min(1, (t - (flashTime + 1.2)) / 2.6))
  return p * p * (3 - 2 * p) * 0.78
}

export function brandBackdropOpacity(progress: number) {
  const p = Math.max(0, Math.min(1, progress / 0.55))
  return p * p * (3 - 2 * p)
}

/** The mark grows from the centre of the burst; text and backdrop settle afterwards. */
export function brandReveal(t: number, flashTime: number) {
  const elapsed = t - flashTime
  const smooth = (a: number, b: number) => {
    const p = Math.max(0, Math.min(1, (elapsed - a) / (b - a)))
    return p * p * (3 - 2 * p)
  }
  const emergence = smooth(0.12, 2.5)
  return {
    visible: elapsed > 0.12,
    markOpacity: smooth(0.12, 0.65),
    markScale: 0.14 + 0.86 * emergence,
    centreOffset: 1 - emergence,
    blur: 7 * (1 - emergence),
    glow: 18 + 26 * (1 - emergence),
    backdrop: smooth(1.5, 3.5),
    text: smooth(1.6, 3.4),
  }
}

/** Gentle motes stay outside the panel, never over its picture. */
export function panelMote(t: number, index: number, width: number, height: number) {
  const side = index % 4
  const phase = index * 2.399963
  const along = Math.sin(phase + t * (0.13 + (index % 5) * 0.015))
  const distance = 0.18 + (index % 7) * 0.16 + 0.08 * Math.sin(t * 0.7 + phase)
  const x = side < 2 ? (side === 0 ? -1 : 1) * (width / 2 + distance) : along * (width / 2 + 0.3)
  const y = side < 2 ? along * (height / 2 + 0.3) : (side === 2 ? -1 : 1) * (height / 2 + distance)
  return { x, y, z: -0.1 + 0.18 * Math.sin(phase + t * 0.22) }
}
