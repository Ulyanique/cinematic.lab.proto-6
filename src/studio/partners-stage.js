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
  const marks = smooth(.68, .91, p);
  const idle = smooth(.85, 1, p) * clamp(motion);
  return {
    visible, curtainOpen: smooth(0, .42, p), compass: smooth(.42, .67, p),
    organizerLabel: marks, organizer: marks, organizerSecond: smooth(.71, .94, p),
    partnerLabel: marks, partner: smooth(.69, .92, p), partnerSecond: smooth(.72, .95, p),
    frame: smooth(.08, .45, p), curtain: 0, shadow: idle, idle,
    glintStrength: .85 * idle, holdGlint: idle, motion: clamp(motion), local: t,
  };
}

/** Две зеркальные непрозрачные половины; в покое ткань остаётся у края. */
export function drawStageCurtains(ctx, image, open, width = 1920, height = 1080, edgeWidth = 96) {
  const p = clamp(open);
  const half = width / 2;
  const edge = Math.max(0, Math.min(width * .1, Number.isFinite(edgeWidth) ? edgeWidth : 96));
  const covered = half + (edge - half) * p;
  const drawHalf = () => {
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, covered, height); ctx.clip();
    // Плотная подложка нужна лишь пока сцена закрыта. По мере раскрытия
    // она исчезает, оставляя у края только прозрачный PNG с тканью.
    if (p < 1) {
      ctx.save(); ctx.globalAlpha *= (1 - p);
      ctx.fillStyle = '#26040b'; ctx.fillRect(0, 0, covered, height);
      ctx.restore();
    }
    if (image) {
      // Размер ткани постоянен: движение задаёт только позиция. Исходные
      // пропорции PNG сохраняются при любом размере мастер-кадра.
      const naturalWidth = image.naturalWidth || image.width || 476;
      const naturalHeight = image.naturalHeight || image.height || 1080;
      const imageWidth = height * naturalWidth / naturalHeight;
      ctx.drawImage(image, covered - imageWidth, 0, imageWidth, height);
    }
    ctx.restore();
  };
  ctx.save(); drawHalf(); ctx.translate(width, 0); ctx.scale(-1, 1); drawHalf(); ctx.restore();
}

/** Обновляем только прежнюю длительность и стандартную ширину старой шторы. */
export function migratePartnersStage(saved) {
  const next = structuredClone(saved && typeof saved === 'object' ? saved : {});
  next.timeline = { ...next.timeline, holdDuration: Math.max(30, Number(next.timeline?.holdDuration) || 0) };
  if (next.partners?.curtainWidth === 476) next.partners.curtainWidth = 96;
  return next;
}
