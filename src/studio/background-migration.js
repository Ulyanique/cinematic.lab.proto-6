/** Одноразовое обновление прежнего фона до минутного удержания и чистого титра. */
export function migrateIntroBackground(saved, defaults) {
  const next = structuredClone(saved && typeof saved === 'object' ? saved : {});
  next.timeline = { ...next.timeline };
  next.timeline.drawDuration = defaults.timeline.drawDuration;
  next.timeline.emergeDuration = defaults.timeline.emergeDuration;
  next.timeline.holdDuration = Math.max(60, Number(next.timeline.holdDuration) || 0);
  next.lab2_dividers = { ...next.lab2_dividers, enabled: false, first: false, second: false, diamonds: false };
  next.lab2_subtitle = { ...next.lab2_subtitle, enabled: false };
  next.lab2_date = { ...next.lab2_date, enabled: false };
  next.lab2_title = { ...next.lab2_title, enabled: true, text: 'ЯНТАРНЫЙ ЦИРКУЛЬ' };
  next.lab2_general = { ...next.lab2_general, compositionY: defaults.lab2_general.compositionY,
    logoRise: 0, hold: Math.max(defaults.lab2_general.hold, Number(next.lab2_general?.hold) || 0) };
  return next;
}
