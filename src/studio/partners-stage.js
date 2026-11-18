/** Сценические сигналы спонсорской заставки: открытие и зеркальное закрытие. */
const clamp = x => Math.max(0, Math.min(1, x));
const smooth = (a, b, x) => { const p = clamp((x - a) / Math.max(1e-6, b - a)); return p * p * (3 - 2 * p); };
export function partnersStageCues(phase, timeline, motion = 1) {
  const entry = Math.max(.01, timeline.drawDuration + timeline.emergeDuration);
  const exitStart = entry + Math.max(0, timeline.holdDuration);
  const exitDuration = Math.max(.01, timeline.fadeDuration);
  const t = phase.beforeStart ? 0 : Math.max(0, phase.local);
  const closing = smooth(exitStart, exitStart + exitDuration, t);
  const p = t < entry ? t / entry : t < exitStart ? 1 : 1 - closing;
  const visible = phase.beforeStart ? 0 : 1 - smooth(exitStart + exitDuration * .92, exitStart + exitDuration, t);
  // Четыре знака: сначала оба верхних, затем оба нижних.
  const organizer = smooth(.57, .65, p);
  const partner = smooth(.67, .75, p);
  const organizerSecond = smooth(.77, .85, p);
  const partnerSecond = smooth(.87, .98, p);
  const idle = smooth(.92, 1, p) * clamp(motion);
  return {
    visible, background: smooth(.04, .30, p),
    curtainOpen: smooth(0, .23, p),
    compass: smooth(.25, .39, p), compassShrink: smooth(.42, .57, p),
    title: smooth(.55, .66, p),
    organizerLabel: organizer, organizer, organizerSecond,
    partnerLabel: partner, partner, partnerSecond,
    frame: smooth(.12, .36, p), curtain: 0, shadow: idle, idle,
    glintStrength: .85 * idle, holdGlint: idle, motion: clamp(motion), local: t,
  };
}

/** Геометрия занавеса одинакова для Canvas и GPU. */
export function stageCurtainLayout(image, open, height = 1080, edgeWidth = 96) {
  const p = clamp(open);
  const naturalWidth = image.naturalWidth || image.width || 476;
  const naturalHeight = image.naturalHeight || image.height || 1080;
  const imageWidth = height * naturalWidth / naturalHeight;
  const edge = Math.max(0, Math.min(imageWidth, Number.isFinite(edgeWidth) ? edgeWidth : 96));
  return { x: -(imageWidth - edge) * p, imageWidth };
}

/** Две зеркальные шторы у внешних краёв, без прямоугольной подложки. */
export function drawStageCurtains(ctx, image, open, width = 1920, height = 1080, edgeWidth = 96) {
  if (!image) return;
  const { x, imageWidth } = stageCurtainLayout(image, open, height, edgeWidth);
  ctx.save();
  ctx.drawImage(image, x, 0, imageWidth, height);
  ctx.translate(width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(image, x, 0, imageWidth, height);
  ctx.restore();
}

/** Обновляем только прежнюю длительность и стандартную ширину старой шторы. */
export function migratePartnersStage(saved) {
  const next = structuredClone(saved && typeof saved === 'object' ? saved : {});
  next.timeline = { ...next.timeline, holdDuration: Math.max(30, Number(next.timeline?.holdDuration) || 0) };
  if (next.partners?.curtainWidth === 476) next.partners.curtainWidth = 96;
  return next;
}

/** Тот же рисунок, что в интро, без заливки: только мягкий золотой контур. */
export function introOutlineSvg(svg) {
  return svg
    .replace(/width="39\.5198mm" height="41\.4868mm"/, 'width="800" height="840"')
    .replace('.fil0 {fill:#D7B56D}', '.fil0 {fill:none;stroke:#D7B56D;stroke-width:18;stroke-linejoin:round;stroke-linecap:round}');
}

/** Параметры таймлайна, влияющие на изображение удержания. */
export function partnersHoldCacheKey(timeline) {
  return [timeline.drawDuration, timeline.emergeDuration, timeline.holdDuration,
    timeline.fadeDuration, timeline.restDuration, timeline.startDelay].join('|');
}

/** Обновляем только старый стандартный вход; пользовательские фазы сохраняем. */
export function migratePartnersSequence(saved) {
  const next = structuredClone(saved && typeof saved === 'object' ? saved : {});
  if (next.timeline?.drawDuration === 2.6 && next.timeline?.emergeDuration === 2.4) {
    next.timeline.drawDuration = 6.6;
  }
  return next;
}

/** Перенос старых персональных заставок без потери знаков и своих настроек. */
export function migrateSponsorStage(saved) {
  const next = structuredClone(saved && typeof saved === 'object' ? saved : {});
  if (next.sponsor && Number.isFinite(next.sponsor.curtainWidth) && next.sponsor.curtainWidth > 180) {
    next.sponsor.curtainWidth = Math.max(20, Math.min(180, Math.round(next.sponsor.curtainWidth * 96 / 476)));
  }
  const t = next.timeline;
  if (t && t.drawDuration === 2.6 && t.emergeDuration === 2.4 &&
      Math.abs(t.holdDuration - 7.5) < 1e-6 && t.fadeDuration === 2.3 && t.restDuration === 1.2) {
    t.drawDuration = 6.6;
    t.holdDuration = 30;
  }
  return next;
}
