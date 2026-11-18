/** Редактируемые слои трёх спонсорских сцен; координаты в кадре 1920×1080. */
const spec = (id, title, x, y, extra = {}) => ({ id, title, defaults: { enabled: true, x, y, scale: 1, opacity: 1, ...extra } });
export const PARTNERS_ELEMENTS = Object.freeze([
  spec('stageOrganizer1', 'Организатор · логотип', 430, 260, { start: 57, end: 65 }),
  spec('stageOrganizer2', 'Соорганизатор · логотип', 1380, 260, { start: 67, end: 75 }),
  spec('stagePartner1', 'Спонсор 1 · логотип', 410, 500, { start: 77, end: 85 }),
  spec('stagePartner2', 'Спонсор 2 · логотип', 1490, 500, { scale: .8, start: 87, end: 98 }),
  spec('stageSingleMark', 'Логотип спонсора', 960, 220, { start: 57, end: 65 }),
  spec('stageOrganizerLabel', 'Подпись организатора', 510, 175, { color: '#d2ac70', lineEnabled: true, lineLength: 320, lineGap: 20, lineOpacity: .65 }),
  spec('stageCoorganizerLabel', 'Подпись соорганизатора', 1300, 175, { color: '#d2ac70', lineEnabled: true, lineLength: 320, lineGap: 20, lineOpacity: .65 }),
  spec('stagePartnerLabel', 'Подпись спонсора 1', 490, 365, { color: '#d2ac70', lineEnabled: true, lineLength: 320, lineGap: 20, lineOpacity: .65 }),
  spec('stagePartnerLabel2', 'Подпись спонсора 2', 1410, 365, { color: '#d2ac70', lineEnabled: true, lineLength: 320, lineGap: 20, lineOpacity: .65 }),
  spec('stageBackground', 'Фоновая картинка', 960, 540, { backgroundImage: '' }),
  spec('stageCurtains', 'Шторы', 960, 540, { leftVisible: true, rightVisible: true, leftOffset: 0, rightOffset: 0, fadePercent: 8 }),
  spec('stageFrame', 'Рамка и блик', 960, 540, { glint: 1 }),
  spec('stageParticles', 'Искры', 960, 540),
  spec('stageCompass', 'Циркуль', 960, 540, { opacity: .42, color: '#e5bd7c' }),
  spec('stageTitle', 'Название вечера', 960, 780, { color: '#ecd4a1' }),
  spec('stageSubtitle', 'Подзаголовок', 960, 845, { color: '#c8a873' }),
  spec('stageTitleDivider', 'Разделитель названия и подзаголовка', 960, 818, { color: '#e5bd7c' }),
  spec('stageOrnament', 'Нижний золотой орнамент', 960, 823, { color: '#e5bd7c', edgeFade: .75, start: 68, end: 98, glint: .65, glintSpeed: 1 }),
]);
const singleOnly = new Set(['stageSingleMark']);
const groupOnly = new Set(['stageOrganizer1', 'stageOrganizer2', 'stagePartner1', 'stagePartner2', 'stageOrganizerLabel', 'stageCoorganizerLabel', 'stagePartnerLabel', 'stagePartnerLabel2', 'stageOrnament']);
export function partnerElementDefaults(single = false) {
  const out = {};
  for (const s of PARTNERS_ELEMENTS) {
    if ((single && groupOnly.has(s.id)) || (!single && singleOnly.has(s.id))) continue;
    out[s.id] = { ...s.defaults };
  }
  if (!single) {
    const reference = {
      stageTitle: [960, 150], stageTitleDivider: [960, 215], stageSubtitle: [960, 255],
      stageCompass: [960, 475], stageOrganizer1: [430, 350], stageOrganizer2: [1460, 350],
      stagePartner1: [450, 560], stagePartner2: [1460, 560],
      stageOrganizerLabel: [570, 270], stageCoorganizerLabel: [1370, 270],
      stagePartnerLabel: [600, 450], stagePartnerLabel2: [1320, 450],
    };
    for (const [id, [x, y]] of Object.entries(reference)) Object.assign(out[id], { x, y });
    out.stageCompass.opacity = 1;
  }
  return out;
}
export const PARTNERS_ELEMENT_SCHEMA = PARTNERS_ELEMENTS.map(s => ({
  id: s.id, title: s.title,
  fields: [
    { key: 'enabled', label: 'Показывать', type: 'bool' },
    ...(['stageParticles', 'stageCurtains'].includes(s.id) ? [] : [{ key: 'x', label: 'Положение X, px', type: 'range', min: 0, max: 1920, step: 1 },
    { key: 'y', label: 'Положение Y, px', type: 'range', min: 0, max: 1080, step: 1 },
    { key: 'scale', label: 'Размер', type: 'range', min: .2, max: 2, step: .01 }]),
    { key: 'opacity', label: 'Непрозрачность', type: 'range', min: 0, max: 1, step: .01 },
    ...('backgroundImage' in s.defaults ? [{ key: 'backgroundImage', label: 'Своя фоновая картинка', type: 'image' }] : []),
    ...('leftVisible' in s.defaults ? [
      { key: 'leftVisible', label: 'Левая штора', type: 'bool' },
      { key: 'rightVisible', label: 'Правая штора', type: 'bool' },
      { key: 'fadePercent', label: 'Проявление из чёрного, % входа', type: 'range', min: 1, max: 23, step: 1 },
      { key: 'leftOffset', label: 'Левая: дополнительно в кадр, px', type: 'range', min: -100, max: 100, step: 1 },
      { key: 'rightOffset', label: 'Правая: дополнительно в кадр, px', type: 'range', min: -100, max: 100, step: 1 },
    ] : []),
    ...('glint' in s.defaults ? [{ key: 'glint', label: 'Яркость блика', type: 'range', min: 0, max: 2, step: .01 }] : []),
    ...('lineEnabled' in s.defaults ? [
      { key: 'lineEnabled', label: 'Полоска рядом с подписью', type: 'bool' },
      { key: 'lineLength', label: 'Длина полоски, px', type: 'range', min: 0, max: 600, step: 1 },
      { key: 'lineGap', label: 'Отступ от подписи, px', type: 'range', min: 0, max: 150, step: 1 },
      { key: 'lineOpacity', label: 'Непрозрачность полоски', type: 'range', min: 0, max: 1, step: .01 },
    ] : []),
    ...('edgeFade' in s.defaults ? [{ key: 'edgeFade', label: 'Растворение краёв', type: 'range', min: 0, max: 1, step: .01 }] : []),
    ...('glintSpeed' in s.defaults ? [{ key: 'glintSpeed', label: 'Скорость блика', type: 'range', min: 0, max: 2, step: .01 }] : []),
    ...('color' in s.defaults ? [{ key: 'color', label: 'Цвет', type: 'color' }] : []),
    ...('start' in s.defaults ? [
      { key: 'start', label: 'Начало появления, % входа', type: 'range', min: 0, max: 99, step: 1 },
      { key: 'end', label: 'Конец появления, % входа', type: 'range', min: 1, max: 100, step: 1 },
    ] : []),
  ],
}));
export function elementVisibility(progress, element) {
  const start = Math.max(0, Math.min(.99, (Number(element?.start) || 0) / 100));
  const end = Math.max(start + .001, Math.min(1, (Number(element?.end) || 100) / 100));
  const p = Math.max(0, Math.min(1, (progress - start) / (end - start)));
  return p * p * (3 - 2 * p);
}

/** Линия остаётся снаружи подписи при изменении текста и масштаба. */
export function labelLineLayout(center, textWidth, side, gap = 20, length = 320) {
  const direction = side < 0 ? -1 : 1;
  const near = center + direction * (Math.min(460, Math.max(0, textWidth)) / 2 + Math.max(0, gap));
  return { near, far: near + direction * Math.max(0, length) };
}
