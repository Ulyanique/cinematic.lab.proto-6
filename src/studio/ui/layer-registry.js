/**
 * Реестр «слоёв» для левой панели.
 *
 * В этом проекте композиция описана не списком слоёв, а разделами SCHEMA:
 * у каждого раздела есть имя и набор полей. Левая панель показывает ровно эти
 * разделы — по одному на строку — и ничего не выдумывает: если раздел есть в
 * схеме, его можно выбрать, а справа появятся все его параметры. Поэтому
 * «всё настраивается»: список слоёв и инспектор питаются одним источником.
 *
 * Здесь заданы только человеческие подписи, порядок групп и то, какое поле
 * считаётся «глазом» слоя (быстрое включение/выключение прямо в списке).
 */

/** @typedef {{ label: string, hint: string, group: string, eye?: string }} LayerMeta */

/** Порядок групп сверху вниз: от монтажа к оформлению кадра. */
export const LAYER_GROUPS = Object.freeze([
  'Монтаж',
  'Текст',
  'Кадр',
  'Свет',
  'Декор',
  'Эффекты',
  'Интро · лаборатория 10',
  'Монолиты · лаборатория 11',
]);

/** @type {Record<string, LayerMeta>} */
export const LAYER_META = Object.freeze({
  // ── монтаж ────────────────────────────────────────────────────────────
  intro: { group: 'Монтаж', label: 'Последовательность интро', hint: 'очерёдность появления знака и титра' },
  timeline: { group: 'Монтаж', label: 'Таймлайн', hint: 'длительности фаз цикла, секунды' },
  transition: { group: 'Монтаж', label: 'Переход в ролик', hint: 'растворение с предыдущего кадра' },

  // ── текст ─────────────────────────────────────────────────────────────
  caption: { group: 'Текст', label: 'Надписи', hint: 'название, подзаголовок, дата' },
  typography: { group: 'Текст', label: 'Типографика', hint: 'шрифт и начертание' },
  ...Object.fromEntries(['stageSponsorLabel', 'stageOrganizer1', 'stageOrganizer2', 'stagePartner1', 'stagePartner2', 'stageSingleMark', 'stageOrganizerLabel', 'stageCoorganizerLabel', 'stagePartnerLabel', 'stagePartnerLabel2', 'stageBackground', 'stageCurtains', 'stageFrame', 'stageParticles', 'stageCompass', 'stageTitle', 'stageSubtitle', 'stageTitleDivider', 'stageOrnament'].map(id => [id, { group: 'Кадр', hint: 'положение, размер и видимость', eye: 'enabled' }])),
  partners: { group: 'Текст', label: 'Партнёры и организаторы', hint: 'имена и логотипы' },
  sponsor: { group: 'Текст', label: 'Партнёр и подписи', hint: 'знак партнёра и строки' },
  finale: { group: 'Текст', label: 'Финальный уход', hint: 'этапы финальной фразы' },

  // ── кадр ──────────────────────────────────────────────────────────────
  photo: { group: 'Кадр', label: 'Круговая надпись и рамка', hint: 'фотопауза: апертура, рамка' },
  logo: { group: 'Кадр', label: 'Знак', hint: 'эмблема: свет, контур, качание' },
  camera: { group: 'Кадр', label: 'Камера', hint: 'наезд и параллакс' },
  colors: { group: 'Кадр', label: 'Цвета', hint: 'золото и материалы' },

  // ── свет ──────────────────────────────────────────────────────────────
  partnersIntroBackground: { group: 'Кадр', label: 'Фон интро', hint: 'отдельный фон вместо картинки', eye: 'enabled' },
  partnersLight: { group: 'Свет', label: 'Играющий свет на фоне', hint: 'лучи на фоновой картинке', eye: 'enabled' },
  lights: { group: 'Свет', label: 'Свет и тени', hint: 'окружение и ключевой свет' },
  topIllumination: { group: 'Свет', label: 'Верхнее свечение', hint: 'ореол и лучи сверху', eye: 'enabled' },
  background: { group: 'Свет', label: 'Фон и свет', hint: 'дымка, сетка, виньетка' },
  backgroundGlow: { group: 'Свет', label: 'Фоновое свечение 1', hint: 'мягкое пятно за знаком', eye: 'enabled' },
  backgroundGlow2: { group: 'Свет', label: 'Фоновое свечение 2', hint: 'мягкое пятно за знаком', eye: 'enabled' },
  backgroundGlow3: { group: 'Свет', label: 'Фоновое свечение 3', hint: 'мягкое пятно за знаком', eye: 'enabled' },
  backgroundGlow4: { group: 'Свет', label: 'Фоновое свечение 4', hint: 'мягкое пятно за знаком', eye: 'enabled' },
  constructionGuides: { group: 'Свет', label: 'Чертёжные линии', hint: 'тонкая геометрия кадра', eye: 'enabled' },

  // ── декор ─────────────────────────────────────────────────────────────
  decor: { group: 'Декор', label: 'Построительная окружность 1', hint: 'контур-построение', eye: 'enabled' },
  decor2: { group: 'Декор', label: 'Построительная окружность 2', hint: 'контур-построение', eye: 'enabled' },
  decor3: { group: 'Декор', label: 'Построительная окружность 3', hint: 'контур-построение', eye: 'enabled' },
  decor4: { group: 'Декор', label: 'Построительная окружность 4', hint: 'контур-построение', eye: 'enabled' },
  particleCloud: { group: 'Декор', label: 'Облако частиц 1', hint: 'пыль в воздухе', eye: 'enabled' },
  particleCloud2: { group: 'Декор', label: 'Облако частиц 2', hint: 'пыль в воздухе', eye: 'enabled' },
  particleCloud3: { group: 'Декор', label: 'Облако частиц 3', hint: 'пыль в воздухе', eye: 'enabled' },
  particleCloud4: { group: 'Декор', label: 'Облако частиц 4', hint: 'пыль в воздухе', eye: 'enabled' },
  rings: { group: 'Декор', label: 'Кольца в углах', hint: 'угловые окружности и их свет', eye: 'enabled' },
  particles: { group: 'Декор', label: 'Частицы', hint: 'золотая пыль вокруг знака', eye: 'enabled' },
  sparks: { group: 'Декор', label: 'Искры', hint: 'короткие вспышки', eye: 'enabled' },

  // ── эффекты ───────────────────────────────────────────────────────────
  fxStack: { group: 'Эффекты', label: 'Эффекты поверх кадра', hint: 'световые эффекты и готовые образы' },
  post: { group: 'Эффекты', label: 'Постобработка', hint: 'свечение, зерно, глубина резкости' },

  // ── лаборатории ───────────────────────────────────────────────────────
  lab2_general: { group: 'Интро · лаборатория 10', label: 'Время', hint: 'удар, скорость, удержание' },
  lab2_camera: { group: 'Интро · лаборатория 10', label: 'Камера', hint: 'движение и наклон' },
  lab2_post: { group: 'Интро · лаборатория 10', label: 'Постобработка и оптика', hint: 'свечение, зерно, дисторсия' },
  lab2_background: { group: 'Интро · лаборатория 10', label: 'Фон и свет', hint: 'туман и подсветка' },
  lab2_logo: { group: 'Интро · лаборатория 10', label: 'Эмблема', hint: 'сборка знака из роя' },
  lab2_compass: { group: 'Интро · лаборатория 10', label: 'Циркуль', hint: 'символ вечера' },
  lab2_title: { group: 'Интро · лаборатория 10', label: 'Название', hint: 'объёмные буквы' },
  lab2_subtitle: { group: 'Интро · лаборатория 10', label: 'Подзаголовок', hint: 'вторая строка' },
  lab2_date: { group: 'Интро · лаборатория 10', label: 'Дата', hint: 'третья строка' },
  lab2_dividers: { group: 'Интро · лаборатория 10', label: 'Разделители', hint: 'линии вокруг текста' },
  lab2_rings: { group: 'Интро · лаборатория 10', label: 'Угловые кольца', hint: 'рамка кадра' },
  lab2_particles: { group: 'Интро · лаборатория 10', label: 'Пыль и боке', hint: 'глубина воздуха' },
  lab2_fx: { group: 'Интро · лаборатория 10', label: 'Световые эффекты', hint: 'блики и вспышки' },

  lab5_video: { group: 'Монолиты · лаборатория 11', label: 'Ролики на монолитах', hint: 'что играет на каждом экране' },
  gallery_video: { group: 'Монтаж', label: 'Видео в галерее', hint: 'десять слотов: видео или фото в каждой панели' },
  lab5_text: { group: 'Монолиты · лаборатория 11', label: 'Надписи', hint: 'название и подзаголовок фильма' },
  lab5_logo: { group: 'Монолиты · лаборатория 11', label: 'Знак и кольца', hint: 'эмблема и угловые кольца' },
  lab5_light: { group: 'Монолиты · лаборатория 11', label: 'Свет, камера, цвет', hint: 'экспозиция, дымка, камера' },
});

/**
 * Подпись и подсказка раздела. Неизвестный раздел не теряется: он показывается
 * своим названием из схемы и попадает в группу «Эффекты», чтобы список слоёв
 * не мог «потерять» настройку.
 */
export function layerMeta(section) {
  if (section.id.startsWith('extraText:')) return { label: section.title, hint: 'текст поверх кадра', group: 'Текст', eye: 'enabled' };
  const meta = LAYER_META[section.id];
  return {
    label: meta?.label || section.title,
    hint: meta?.hint || '',
    group: meta?.group || 'Эффекты',
    eye: meta?.eye || null,
  };
}

/** Группировка разделов с сохранением порядка внутри группы. */
export function groupLayers(sections) {
  const buckets = new Map(LAYER_GROUPS.map((name) => [name, []]));
  for (const section of sections) {
    const meta = layerMeta(section);
    if (!buckets.has(meta.group)) buckets.set(meta.group, []);
    buckets.get(meta.group).push({ section, meta });
  }
  return [...buckets.entries()].filter(([, items]) => items.length);
}
