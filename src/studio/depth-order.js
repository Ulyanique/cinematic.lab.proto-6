/**
 * Порядок слоёв «глубиной»: чем выше строка в левой панели, тем ближе слой
 * к зрителю.
 *
 * Раньше порядок наложения был размазан по коду: у каждого декоративного
 * объекта свой `renderOrder`, у знака — своя физическая глубина, а списка,
 * который человек мог бы двигать, не было вовсе (он остался в старом
 * редакторе кадра, который мы убрали). Здесь один список для всех сцен.
 *
 * Механика — та же, что у лаборатории 10: каждому слою выдаётся полоса
 * `renderOrder`, посчитанная из позиции в списке. Внутри полосы объект слоя
 * сохраняет свой собственный порядок, поэтому «пыль поверх знака» не
 * перемешивает частицы между собой. Фон всегда рисуется первым.
 */

/** Слоты, которые можно двигать (id совпадают с разделами схемы) — по умолчанию от дальнего к ближнему. */
export const DEPTH_LAYERS = Object.freeze([
  'background',
  'solarBokeh',
  'logo',
  'constructionGuides',
  'rings',
  'particles',
  'sparks',
]);

/** Человеческие подписи для панели слоёв. */
export const DEPTH_LABELS = Object.freeze({
  background: 'Фон',
  solarBokeh: 'Боке и дымка',
  logo: 'Знак',
  constructionGuides: 'Чертёжные линии',
  rings: 'Кольца и свет из углов',
  particles: 'Частицы',
  sparks: 'Искры',
});

/** Порядок по умолчанию: совпадает с тем, как сцена рисовалась до появления списка. */
export function depthOrderDefaults() {
  return {
    enabled: false,
    ...Object.fromEntries(DEPTH_LAYERS.map((id, index) => [id, index])),
  };
}

/**
 * Текущий порядок: массив id от дальнего к ближнему.
 * Значения вне диапазона и дубликаты не ломают картинку — недостающие слоты
 * встают в конец в исходном порядке.
 */
export function depthOrder(config) {
  const section = config?.depthOrder || {};
  const rank = (id, fallback) => {
    const value = section[id];
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  };
  return DEPTH_LAYERS
    .map((id, index) => ({ id, index, rank: rank(id, index) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.id);
}

/**
 * Как общий список глубины ложится на собственные слои лаборатории 10.
 *
 * У «Интро» свои имена слоёв, и один к одному они не совпадают с общими:
 * боке и дымка — это тот же слой частиц, световые блики знака — «эффекты»,
 * чертёжные линии — «разделители». Поэтому стрелка «выше» не переписывает
 * порядок лаборатории целиком: слоты с однозначной парой переставляются
 * согласно общему списку, а слои без пары (циркуль, титр, подзаголовок, дата)
 * остаются на своих местах. Движение одного слоя не сдвигает всю композицию.
 *
 * @param {string[]} shared порядок от дальнего к ближнему
 * @param {readonly string[]} own порядок лаборатории (индекс 0 — ближе к зрителю)
 * @returns {string[]} новый порядок в терминах лаборатории
 */
export function introDepthOrder(shared, own) {
  const map = { particles: 'particles', rings: 'rings', logo: 'logo', sparks: 'fx', constructionGuides: 'dividers' };
  // Индекс 0 в лаборатории — самый близкий слой, поэтому общий список читаем
  // с конца: из «дальний→ближний» получается «ближний→дальний».
  const nearToFar = shared.filter((id) => map[id]).reverse().map((id) => map[id]);
  const slots = [];
  own.forEach((id, index) => { if (nearToFar.includes(id)) slots.push(index); });
  // Списки разной длины (в лаборатории появился новый слой) не трогаем:
  // лучше оставить исходный порядок, чем переставить часть слотов наугад.
  if (!slots.length || slots.length !== nearToFar.length) return [...own];
  const next = [...own];
  slots.forEach((slot, index) => { next[slot] = nearToFar[index]; });
  return next;
}

/** Включён ли ручной порядок. Пока выключен, сцена рисуется как раньше. */
export function depthOrderEnabled(config) {
  return config?.depthOrder?.enabled === true;
}

/**
 * Один шаг по глубине. `direction: 'front'` — ближе к зрителю (выше в списке),
 * `'back'` — дальше. Возвращает список точечных правок конфига или null, если
 * двигать некуда.
 * @param {any} config
 * @param {string} id
 * @param {'front'|'back'} direction
 * @returns {{ key: string, value: number }[] | null}
 */
export function depthOrderStep(config, id, direction) {
  const order = depthOrder(config).filter((key) => key !== id);
  const current = DEPTH_LAYERS.indexOf(id);
  if (current < 0) return null;
  const at = depthOrder(config).indexOf(id);
  const target = direction === 'front' ? at + 1 : at - 1;
  if (target < 0 || target >= DEPTH_LAYERS.length) return null;
  order.splice(target, 0, id);
  // Включаем ручной порядок первым действием: иначе первое нажатие «выше»
  // ничего не меняло бы на экране и выглядело бы сломанным.
  return [{ key: 'enabled', value: true }, ...order.map((key, index) => ({ key, value: index }))];
}

/** Сброс порядка к исходному (и выключение ручного режима). */
export function depthOrderReset() {
  return [{ key: 'enabled', value: false }, ...DEPTH_LAYERS.map((id, index) => ({ key: id, value: index }))];
}

/**
 * Полосы `renderOrder` для объектов сцены.
 * Возвращает { id: полоса }, где полоса — базовое число; объект слоя может
 * добавить к нему собственный небольшой сдвиг.
 */
export function depthBands(config, base = 40, step = 10) {
  const order = depthOrder(config);
  const bands = {};
  for (const [index, id] of order.entries()) bands[id] = base + index * step;
  return bands;
}

/**
 * Применить порядок к трёхмерному кадру: объектам слоя выдаётся `renderOrder`
 * внутри его полосы. Прозрачные объекты сортируются по `renderOrder` только при
 * равной глубине, поэтому полоса обязана различаться на десятки — иначе
 * аддитивные спрайты «перещёлкиваются» между собой.
 */
export function applyDepthOrder(config, scene) {
  if (!scene) return;
  const bands = depthBands(config);
  const band = (id) => (typeof bands[id] === 'number' ? bands[id] : null);
  const set = (group, id, keepOrder = true) => {
    const base = band(id);
    if (base === null || !group) return;
    group.traverse((object) => {
      if (!(object.isMesh || object.isLine || object.isPoints || object.isSprite)) return;
      const own = keepOrder && Number.isFinite(object.userData.depthOrder) ? object.userData.depthOrder : 0;
      object.renderOrder = base + own;
    });
  };

  set(scene.background?.mesh, 'background');
  set(scene.solarBokeh?.group, 'solarBokeh');
  set(scene.logo?.root, 'logo');
  set(scene.constructionGuides?.group, 'constructionGuides');
  set(scene.corners?.group, 'rings');
  set(scene.particles?.group, 'particles');
  set(scene.plotter?.group, 'rings');
  for (const glow of Object.values(scene.backgroundGlows || {})) set(glow.group, 'background');
  for (const decor of Object.values(scene.brandDecors || {})) set(decor.group, 'constructionGuides');
  for (const cloud of Object.values(scene.particleClouds || {})) set(cloud.group, 'particles');
  set(scene.sparks?.points, 'sparks');
  // Блик — отдельный объект внутри знака; иначе он уехал бы в полосу «Знак».
  set(scene.flare?.mesh, 'sparks');
  for (const sprite of [scene.topGlow, scene.amberGlow]) set(sprite, 'background');

  // Знак остаётся физически перед фоном: полосы меняют только порядок
  // отрисовки прозрачных слоёв, а глубина золота — из настроек знака.
  if (scene.logo?.root) scene.logo.root.renderOrder = band('logo') ?? scene.logo.root.renderOrder;
}
