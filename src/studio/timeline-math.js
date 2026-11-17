/**
 * Чистая математика таймлайна: длительность цикла и сдвиг границ фаз.
 *
 * Раньше это жило в `editor-timeline.js` вместе с разметкой старого
 * покадрового редактора. Редактор убран (правки идут в реальном времени), а
 * два расчёта остались нужны пульту: перетаскивание границы входа/выхода и
 * длительность цикла.
 */

/** @typedef {{startDelay:number, drawDuration:number, emergeDuration:number, holdDuration:number, fadeDuration:number, restDuration:number}} Timeline */
/** Чистая математика таймлайна: проценты от цикла после стартовой задержки. @param {Timeline} tl */
export function timelineCycle(tl) {
  const value = tl.drawDuration + tl.emergeDuration + tl.holdDuration + tl.fadeDuration + tl.restDuration;
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** Изменение базовой границы фаз без изменения общей длительности и противоположного края.
 * Внутренние стадии входа/ухода масштабируются пропорционально.
 * @param {Timeline} tl @param {'entry' | 'exit'} edge @param {number} seconds @param {number} minHold */
export function movePhaseBoundary(tl, edge, seconds, minHold = 1) {
  const cycle = timelineCycle(tl), entry = tl.drawDuration + tl.emergeDuration;
  const exit = entry + tl.holdDuration, tail = tl.fadeDuration + tl.restDuration;
  if (!(cycle > 0 && entry > 0 && tail > 0 && tl.holdDuration >= 0) || !Number.isFinite(seconds)) return null;
  if (edge === 'entry') {
    const boundary = Math.max(.1, Math.min(exit - minHold, seconds));
    if (boundary < .1 || exit - minHold < .1) return null;
    const draw = boundary * tl.drawDuration / entry;
    return {drawDuration: draw, emergeDuration: boundary - draw, holdDuration: exit - boundary,
      fadeDuration: tl.fadeDuration, restDuration: tl.restDuration};
  }
  const boundary = Math.max(entry + minHold, Math.min(cycle - .1, seconds));
  if (boundary > cycle - .1) return null;
  const remaining = cycle - boundary, fade = remaining * tl.fadeDuration / tail;
  return {drawDuration: tl.drawDuration, emergeDuration: tl.emergeDuration, holdDuration: boundary - entry,
    fadeDuration: fade, restDuration: remaining - fade};
}
