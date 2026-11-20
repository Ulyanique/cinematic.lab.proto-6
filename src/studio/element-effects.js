/**
 * Общая детерминированная огибающая световой пульсации элемента.
 * Нулевая сила полностью сохраняет исходный вид; время берётся из кадра,
 * поэтому перемотка, повтор и покадровый экспорт совпадают.
 */
export function elementLightPulse(time, amount, speed) {
  const strength = Number.isFinite(amount) ? Math.max(0, Math.min(1, amount)) : 0;
  const rate = Number.isFinite(speed) ? Math.max(0, Math.min(3, speed)) : 1;
  const t = Number.isFinite(time) ? time : 0;
  return strength * (0.5 + 0.5 * Math.sin(t * rate * 2 * Math.PI));
}

/** Вспышка с мягким началом и экспоненциальным затуханием, как в интро. */
export function elementFlash(time, amount, at, duration) {
  const strength = Number.isFinite(amount) ? Math.max(0, Math.min(2, amount)) : 0;
  if (!strength || !Number.isFinite(time)) return 0;
  const start = Number.isFinite(at) ? at : 4.5;
  const length = Number.isFinite(duration) ? Math.max(0.05, Math.min(5, duration)) : 0.5;
  const elapsed = time - start;
  if (elapsed <= 0) return 0;
  const attack = Math.min(0.12, length * 0.25);
  const rise = Math.min(1, elapsed / attack);
  const smoothRise = rise * rise * (3 - 2 * rise);
  return strength * smoothRise * Math.exp(-Math.max(0, elapsed - attack) / length);
}
