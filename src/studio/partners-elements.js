/** Редактируемые слои трёх спонсорских сцен; координаты в кадре 1920×1080. */
const spec = (id, title, x, y, extra = {}) => ({ id, title, defaults: { enabled: true, x, y, scale: 1, opacity: 1, ...extra } });
export const PARTNERS_ELEMENTS = Object.freeze([
  spec('stageOrganizer1', 'Организатор · логотип', 500, 205, { start: 57, end: 65 }),
  spec('stageOrganizer2', 'Соорганизатор · логотип', 1420, 205, { start: 67, end: 75 }),
  spec('stagePartner1', 'Спонсор 1 · логотип', 500, 475, { start: 77, end: 85 }),
  spec('stagePartner2', 'Спонсор 2 · логотип', 1420, 475, { scale: .8, start: 87, end: 98 }),
  spec('stageSingleMark', 'Логотип спонсора', 960, 220, { start: 57, end: 65 }),
  spec('stageOrganizerLabel', 'Подпись организатора', 500, 130, { color: '#d2ac70' }),
  spec('stageCoorganizerLabel', 'Подпись соорганизатора', 1420, 130, { color: '#d2ac70' }),
  spec('stagePartnerLabel', 'Подпись спонсоров', 960, 330, { color: '#d2ac70' }),
  spec('stageDividerLeft', 'Левый разделитель', 500, 290),
  spec('stageDividerRight', 'Правый разделитель', 1420, 290),
  spec('stageBackground', 'Фоновая картинка', 960, 540, { backgroundImage: '' }),
  spec('stageCurtains', 'Шторы', 960, 540, { leftVisible: true, rightVisible: true, leftOffset: 0, rightOffset: 0 }),
  spec('stageFrame', 'Рамка и блик', 960, 540, { glint: 1 }),
  spec('stageParticles', 'Искры', 960, 540),
  spec('stageCompass', 'Циркуль', 960, 540, { opacity: .42 }),
  spec('stageTitle', 'Название вечера', 960, 780, { color: '#ecd4a1' }),
  spec('stageSubtitle', 'Подзаголовок', 960, 845, { color: '#c8a873' }),
]);
const singleOnly = new Set(['stageSingleMark']);
const groupOnly = new Set(['stageOrganizer1', 'stageOrganizer2', 'stagePartner1', 'stagePartner2', 'stageOrganizerLabel', 'stageCoorganizerLabel', 'stagePartnerLabel', 'stageDividerLeft', 'stageDividerRight']);
export function partnerElementDefaults(single = false) {
  const out = {};
  for (const s of PARTNERS_ELEMENTS) {
    if ((single && groupOnly.has(s.id)) || (!single && singleOnly.has(s.id))) continue;
    out[s.id] = { ...s.defaults };
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
      { key: 'leftOffset', label: 'Левая: дополнительно в кадр, px', type: 'range', min: -100, max: 100, step: 1 },
      { key: 'rightOffset', label: 'Правая: дополнительно в кадр, px', type: 'range', min: -100, max: 100, step: 1 },
    ] : []),
    ...('glint' in s.defaults ? [{ key: 'glint', label: 'Яркость блика', type: 'range', min: 0, max: 2, step: .01 }] : []),
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
