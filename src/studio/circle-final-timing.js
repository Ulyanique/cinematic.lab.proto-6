const clamp = n => Math.max(0, Math.min(1, n));
const smooth = n => { n = clamp(n); return n * n * (3 - 2 * n); };
/** Исходные кадры 963–1213 при 24 fps; вход и уход привязаны к пульту. */
export function circleFinalTiming(phase, tl) {
  if (phase.beforeStart) return { frame: 963, opacity: 0 };
  const t = phase.local;
  const entry = Math.max(.001, tl.drawDuration + tl.emergeDuration);
  const exit = entry + Math.max(0, tl.holdDuration);
  const frame = t < entry ? 963 + 41 * clamp(t / entry) : Math.min(1213, 1004 + Math.max(0, t - entry) * 24);
  const fade = t < exit ? 1 : 1 - smooth((t - exit) / Math.max(.001, tl.fadeDuration));
  return { frame, opacity: fade * smooth(t / Math.min(.2, entry)) };
}
