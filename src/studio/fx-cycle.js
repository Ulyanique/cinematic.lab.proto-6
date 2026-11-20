/** Локальное время эффектов повторяется с циклом, как и время композиции. */
export function fxCycleTime(time, span) {
  const start = Number.isFinite(span?.start) ? span.start : 0;
  const end = Number.isFinite(span?.end) ? span.end : start;
  const total = Math.max(0, end - start);
  const elapsed = (Number.isFinite(time) ? time : 0) - start;
  if (elapsed < 0) return { relative: 0, total, beforeStart: true };
  return { relative: total > 0 ? elapsed % total : elapsed, total, beforeStart: false };
}
