/** Сценические сигналы спонсорской заставки: открытие и зеркальное закрытие. */
const clamp = x => Math.max(0, Math.min(1, x));
const smooth = (a, b, x) => { const p = clamp((x - a) / Math.max(1e-6, b - a)); return p * p * (3 - 2 * p); };
export function partnersStageCues(phase, timeline, motion = 1, curtainFadePercent = 8, twoStageCurtains = false) {
  const entry = Math.max(.01, timeline.drawDuration + timeline.emergeDuration);
  const exitStart = entry + Math.max(0, timeline.holdDuration);
  const exitDuration = Math.max(.01, timeline.fadeDuration);
  const t = phase.beforeStart ? 0 : Math.max(0, phase.local);
  const closing = smooth(exitStart, exitStart + exitDuration, t);
  const p = t < entry ? t / entry : t < exitStart ? 1 : 1 - closing;
  const visible = phase.beforeStart ? 0 : 1 - smooth(exitStart + exitDuration * .92, exitStart + exitDuration, t);
  // Сначала организатор и соорганизатор, затем два спонсора.
  const organizer = twoStageCurtains ? smooth(.60, .68, p) : smooth(.57, .65, p);
  const organizerSecond = twoStageCurtains ? smooth(.70, .78, p) : smooth(.67, .75, p);
  const partner = twoStageCurtains ? smooth(.80, .88, p) : smooth(.77, .85, p);
  const partnerSecond = twoStageCurtains ? smooth(.90, .99, p) : smooth(.87, .98, p);
  const idle = smooth(.92, 1, p) * clamp(motion);
  const fadeEnd = Math.max(.01, Math.min(.23, (Number.isFinite(curtainFadePercent) ? curtainFadePercent : 8) / 100));
  // Для общей композиции: небольшой первый проход, пауза на эмблему,
  // затем полный проход до начала появления логотипов. На уходе порядок обратный.
  const curtainOpen = twoStageCurtains
    ? .55 * smooth(.02, .19, p) + .45 * smooth(.34, .55, p)
    : smooth(0, .23, p);
  return {
    progress: p, visible, background: smooth(.04, .30, p),
    // Шторы проявляются из чёрного и гаснут при обратном движении.
    curtainOpacity: smooth(0, fadeEnd, p), curtainOpen,
    compass: smooth(.25, .39, p), compassShrink: smooth(.42, .57, p),
    title: twoStageCurtains ? smooth(.35, .55, p) : smooth(.55, .66, p),
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
    .replace('.fil0 {fill:#D7B56D}', '.fil0 {fill:none;stroke:#e5bd7c;stroke-width:16;stroke-linejoin:round;stroke-linecap:round}');
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

/** Координаты колонок в кадре 1920×1080 и относительный размер КЭАЗ. */
export const PARTNERS_MARK_LAYOUT = Object.freeze({
  left: 500, right: 1420,
  organizerTop: 205, organizerBottom: 205,
  sponsorTop: 475, sponsorBottom: 475,
  organizerLabel: 130, coorganizerLabel: 130, sponsorLabel: 330,
  organizerDivider: 290, sponsorDivider: 290,
  keazScale: .8,
});

/** Обновить только стандартную ширину; ручные настройки не менять. */
export function migrateCurtainEdge(saved, section) {
  const next = structuredClone(saved && typeof saved === 'object' ? saved : {});
  if (next[section]?.curtainWidth === 96) next[section].curtainWidth = 144;
  return next;
}

/** Сдвигаем только прежнюю стандартную ширину, пользовательские значения остаются. */
export function migrateCurtainEdgeV3(saved, section) {
  const next = structuredClone(saved && typeof saved === 'object' ? saved : {});
  if (next[section]?.curtainWidth === 144) next[section].curtainWidth = 168;
  return next;
}

/** Разделить общий заголовок, сохранив настроенные пользователем стиль и текст. */
export function migrateSponsorLabels(saved) {
  const next = structuredClone(saved && typeof saved === 'object' ? saved : {});
  if (next.partners) {
    const text = next.partners.partnerLabel;
    if (text === 'СПОНСОРЫ') next.partners.partnerLabel = 'СПОНСОР';
    if (next.partners.partner2Label === undefined && typeof text === 'string') {
      next.partners.partner2Label = text === 'СПОНСОРЫ' ? 'СПОНСОР' : text;
    }
  }
  const old = next.stagePartnerLabel;
  if (old && typeof old === 'object') {
    if (!next.stagePartnerLabel2) next.stagePartnerLabel2 = { ...old, x: 1420 };
    if (old.x === 960) old.x = 500;
  }
  return next;
}

/** Новую расстановку применяем только к оставленным стандартным координатам. */
export function migratePartnersReferenceLayout(saved) {
  const next = structuredClone(saved && typeof saved === 'object' ? saved : {});
  const positions = {
    stageOrganizer1: [500, 205, 430, 260], stageOrganizer2: [1420, 205, 1380, 260],
    stagePartner1: [500, 475, 410, 500], stagePartner2: [1420, 475, 1490, 500],
    stageOrganizerLabel: [500, 130, 430, 175], stageCoorganizerLabel: [1420, 130, 1380, 175],
    stagePartnerLabel: [500, 330, 410, 365], stagePartnerLabel2: [1420, 330, 1490, 365],
    stageDividerLeft: [500, 290, 410, 405], stageDividerRight: [1420, 290, 1490, 405],
  };
  for (const [id, [oldX, oldY, x, y]] of Object.entries(positions)) {
    const layer = next[id];
    if (layer?.x === oldX && layer?.y === oldY) { layer.x = x; layer.y = y; }
  }
  return next;
}

/** Убираем стандартное множественное число и пододвигаем неизменённые подписи внутрь. */
export function migratePartnerLabelLines(saved) {
  const next = structuredClone(saved && typeof saved === 'object' ? saved : {});
  const positions = {
    stageOrganizerLabel: [430, 175, 510], stageCoorganizerLabel: [1380, 175, 1300],
    stagePartnerLabel: [410, 365, 490], stagePartnerLabel2: [1490, 365, 1410],
  };
  for (const [id, [x, y, newX]] of Object.entries(positions)) {
    const layer = next[id];
    if (layer?.x === x && layer?.y === y) layer.x = newX;
  }
  if (next.partners?.partnerLabel === 'СПОНСОРЫ') next.partners.partnerLabel = 'СПОНСОР';
  if (next.partners?.partner2Label === 'СПОНСОРЫ') next.partners.partner2Label = 'СПОНСОР';
  return next;
}

/** Меняем прежнюю стандартную расстановку; пользовательские координаты не трогаем. */
export function migratePartnersTopTitle(saved) {
  const next = structuredClone(saved && typeof saved === 'object' ? saved : {});
  const positions = {
    stageTitle: [960,780,960,150], stageTitleDivider: [960,818,960,215], stageSubtitle: [960,845,960,255],
    stageCompass: [960,540,960,475], stageOrganizer1: [430,260,430,350], stageOrganizer2: [1380,260,1460,350],
    stagePartner1: [410,500,450,560], stagePartner2: [1490,500,1460,560],
    stageOrganizerLabel: [510,175,570,270], stageCoorganizerLabel: [1300,175,1370,270],
    stagePartnerLabel: [490,365,600,450], stagePartnerLabel2: [1410,365,1320,450],
  };
  for (const [id, [x0, y0, x, y]] of Object.entries(positions)) {
    if (next[id]?.x === x0 && next[id]?.y === y0) { next[id].x = x; next[id].y = y; }
  }
  return next;
}

/** Усиливаем только прежнюю стандартную прозрачность знака на общей заставке. */
export function migratePartnersCompassContrast(saved) {
  const next = structuredClone(saved && typeof saved === 'object' ? saved : {});
  if (next.stageCompass?.opacity === .42) next.stageCompass.opacity = 1;
  return next;
}

/** По просьбе выравниваем размеры четырёх логотипов, сохраняя остальные правки. */
export function migrateEqualPartnerLogoWidths(saved) {
  const next = structuredClone(saved && typeof saved === 'object' ? saved : {});
  for (const id of ['stageOrganizer1', 'stageOrganizer2', 'stagePartner1', 'stagePartner2']) {
    if (next[id] && typeof next[id] === 'object') next[id].scale = 1;
  }
  return next;
}

/** Поднимаем подпись с разделителем, а КЭАЗ выравниваем по ширине организатора. */
export function migratePartnersTitleAndKeaz(saved) {
  const next = structuredClone(saved && typeof saved === 'object' ? saved : {});
  for (const id of ['stageSubtitle', 'stageTitleDivider']) {
    if (Number.isFinite(next[id]?.y)) next[id].y = Math.max(0, next[id].y - 20);
  }
  if (next.stagePartner2 && typeof next.stagePartner2 === 'object') {
    const organizerScale = next.stageOrganizer1?.scale;
    next.stagePartner2.scale = Number.isFinite(organizerScale) && organizerScale > 0 ? organizerScale : 1;
  }
  return next;
}

/** Обновляем лишь прежние стандартные значения общей сцены. */
export function migratePartnersCurtainChoreography(saved) {
  const next = structuredClone(saved && typeof saved === 'object' ? saved : {});
  if (next.partners?.curtainWidth === 168) next.partners.curtainWidth = 196;
  if (next.timeline?.fadeDuration === 2.3 || next.timeline?.fadeDuration === 3.5) next.timeline.fadeDuration = 6.5;
  return next;
}

/** Новый порядок: центр завершается до появления знаков, ручной тайминг не трогаем. */
export function migratePartnersCenterFirst(saved) {
  const next = structuredClone(saved && typeof saved === 'object' ? saved : {});
  for (const [id, oldStart, oldEnd, start, end] of [
    ['stageOrganizer1', 57, 65, 60, 68], ['stageOrganizer2', 67, 75, 70, 78],
    ['stagePartner1', 77, 85, 80, 88], ['stagePartner2', 87, 98, 90, 99],
  ]) {
    const e = next[id];
    if (e?.start === oldStart && e?.end === oldEnd) { e.start = start; e.end = end; }
  }
  return next;
}
