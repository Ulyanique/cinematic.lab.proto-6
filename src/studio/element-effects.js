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
