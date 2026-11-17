/**
 * Единая конфигурация композиции. Движок (Intro.ts) читает её каждый кадр,
 * панели настроек строятся из SCHEMA, а JSON-экспорт — это просто сериализованный Config.
 */

export type LayerId = 'logo' | 'compass' | 'title' | 'subtitle' | 'date' | 'dividers' | 'rings' | 'particles' | 'fx';
export const LAYER_IDS: LayerId[] = ['logo', 'compass', 'title', 'subtitle', 'date', 'dividers', 'rings', 'particles', 'fx'];
/** Порядок «сверху вниз» (первый — на переднем плане). Совпадает с исходной раскадровкой. */
export const DEFAULT_ORDER: LayerId[] = ['fx', 'dividers', 'date', 'subtitle', 'title', 'logo', 'compass', 'rings', 'particles'];

export const DEFAULT_CONFIG = {
  version: 1 as const,
  order: [...DEFAULT_ORDER] as LayerId[],
  general: {
    impact: 4.5, speed: 1, hold: 0,
    // Насколько эмблема ниже своего места в начале, до появления названия:
    // сначала она собирается по центру кадра, затем плавно поднимается.
    // 1.65 — посчитано по камере: центр эмблемы до подъёма ровно в середине
    // кадра (50 %), после — на своём обычном месте (34 %).
    logoRise: 1.65,
    // Смещение всей композиции по вертикали, в мировых единицах (плюс — вверх).
    // Нужно фоновым роликам: у них нет подзаголовка и даты, и блок «эмблема +
    // название» без сдвига садится выше середины кадра.
    compositionY: 0,
    fadeOut: true,
    fps: 30, width: 1920, bitrate: 16, quality: 1920,
    loop: false, fileName: 'intro',
  },
  camera: {
    fov: 30, distance: 16.8, push: 4.6, startX: -1.6, startY: 0.8, roll: 0.025,
    sway: 1, punch: 0.75, shake: 1, windup: 0.38,
  },
  post: {
    exposure: 0.9, bloom: 1, bloomRadius: 0.7, bloomThreshold: 1, streak: 1, aberration: 1, focus: 1,
    vignette: 0.62, grain: 0.02, hue: 0, saturation: 1, contrast: 1, shadowTint: 1,
    // Кадр открывается не «щелью», а включением старого телевизора: круг из
    // центра. Щель и линия света остаются как возможность в настройках.
    slit: false, slitSize: 0.372, ignition: true,
  },
  layers: {
    background: { enabled: true, delay: 0, beam: 1, ribbons: 1, glow: 1, final: 1 },
    logo: {
      enabled: true, delay: 0,
      preset: 'swarm', duration: 1.15, stagger: 0.12, lead: 0.3, easing: 'cubic', intensity: 1, angle: 90, turns: 1,
      lightPulse: 0, lightPulseSpeed: 0.3,
      x: 0, y: 0, scale: 1, tilt: 0.62, float: 1,
      swarm: 1, sparkCount: 1100, flash: 1,
      deep: '#e4b159', mid: '#ffe29e', top: '#fff2c8', roughness: 0.27, env: 1.6,
      size: 3.2, depth: 140, bevel: 22, svg: '',
    },
    compass: { enabled: true, delay: 0, opacity: 1, radius: 1, thickness: 1, speed: 1, head: 1 },
    title: {
      enabled: true, delay: 0,
      text: 'ЯНТАРНЫЙ ЦИРКУЛЬ', font: 'prata', width: 11.55, tracking: 0.045, depth: 0.15, bevel: 0.04,
      x: 0, y: 0, scale: 1,
      preset: 'fly', order: 'ltr', start: 5.75, stagger: 0.085, duration: 0.95, intensity: 1, easing: 'cubic',
      lightPulse: 0, lightPulseSpeed: 0.3,
      sparkCount: 70, flash: 1,
      deep: '#e4b159', mid: '#ffe29e', top: '#fff2c8', roughness: 0.25, env: 1.55,
    },
    subtitle: {
      enabled: true, delay: 0,
      text: 'ВЕЧЕР РЕТРОСПЕКТИВА', font: 'forum', width: 7.25, tracking: 0.42, x: 0, y: 0,
      preset: 'wipe', start: 8.35, duration: 1.9, brightness: 1.45, lightPulse: 0, lightPulseSpeed: 0.3, colA: '#e7bb76', colB: '#ffefc4',
    },
    date: {
      enabled: true, delay: 0,
      text: '20 НОЯБРЯ 2026 ГОДА', font: 'forum', width: 4.45, tracking: 0.3, x: 0, y: 0,
      preset: 'wipe', start: 9.55, duration: 1.6, brightness: 1.35, lightPulse: 0, lightPulseSpeed: 0.3, colA: '#e7bf7c', colB: '#fff1cb',
    },
    dividers: {
      enabled: true, delay: 0, first: true, second: true, diamonds: true,
      width: 1, intensity: 1, thickness: 1.2, core: 0.1, glow: 0.14, highlight: 0,
      color: '#ffb95e', hotColor: '#fff1c9',
      length1: 1, length2: 1, intensity1: 1, intensity2: 1, duration1: 1, duration2: 0.815,
      y1: 0, y2: 0, start1: 8.05, start2: 9.4, duration: 1.35,
    },
    rings: { enabled: true, delay: 0, opacity: 1, speed: 1, scale: 1, nodes: true },
    particles: { enabled: true, delay: 0, dust: 1, bokeh: 1, size: 1, speed: 1, brightness: 1 },
    fx: { enabled: true, flash: 1, shock: 1, flares: 1, glints: 1, sweep: 1, rays: 1, waves: 1, titleWave: 0 },
  },
};

export type Config = typeof DEFAULT_CONFIG;

export const cloneConfig = <T>(c: T): T => JSON.parse(JSON.stringify(c));

/** Безопасное слияние: берёт только известные ключи с совпадающим типом, числа ограничивает схемой. */
export function mergeConfig(base: any, patch: any, path = ''): any {
  if (patch === undefined || patch === null) return cloneConfig(base);
  if (Array.isArray(base)) return Array.isArray(patch) ? [...patch] : cloneConfig(base);
  if (typeof base === 'object') {
    const out: any = {};
    for (const k of Object.keys(base)) out[k] = mergeConfig(base[k], typeof patch === 'object' ? patch[k] : undefined, path ? `${path}.${k}` : k);
    return out;
  }
  if (typeof base === 'number') {
    if (typeof patch !== 'number' || !Number.isFinite(patch)) return base;
    const f = FIELD_INDEX[path];
    return f && f.t === 'num' ? Math.min(f.max ?? Infinity, Math.max(f.min ?? -Infinity, patch)) : patch;
  }
  if (typeof base === 'boolean') return typeof patch === 'boolean' ? patch : base;
  if (typeof base === 'string') {
    if (typeof patch !== 'string') return base;
    const f = FIELD_INDEX[path];
    if (f && f.t === 'sel' && !f.opts.some(([v]) => v === patch)) return base;
    if (f && f.t === 'color' && !/^#[0-9a-fA-F]{6}$/.test(patch)) return base;
    return patch.slice(0, 200000);
  }
  return base;
}

export function sanitizeConfig(raw: any): Config {
  const cfg = mergeConfig(DEFAULT_CONFIG, raw);
  const given: string[] = Array.isArray(raw?.order) ? raw.order : [];
  const order = given.filter((id, i) => (LAYER_IDS as string[]).includes(id) && given.indexOf(id) === i) as LayerId[];
  for (const id of DEFAULT_ORDER) if (!order.includes(id)) order.push(id);
  cfg.order = order;
  return cfg;
}

export function getPath(obj: any, path: string): any {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}
export function setPath<T>(obj: T, path: string, value: any): T {
  const keys = path.split('.');
  const root: any = Array.isArray(obj) ? [...(obj as any)] : { ...(obj as any) };
  let cur = root;
  for (let i = 0; i < keys.length - 1; i++) {
    cur[keys[i]] = Array.isArray(cur[keys[i]]) ? [...cur[keys[i]]] : { ...cur[keys[i]] };
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
  return root;
}

/** Длительность ролика в секундах при текущих настройках времени. */
export const baseDuration = 13.6;
export const DESIGN_IMPACT = 4.5;
/** Проектное время последнего движения композиции и его конца (уход). */
const DESIGN_EXIT = 11.1;
const DESIGN_EXIT_END = 13.6;

/**
 * Границы фаз ролика в реальном времени: где кончается появление и где
 * начинается уход.
 *
 * Композиция живёт в «проектном» времени, а `impact` и `speed` его растягивают,
 * поэтому границы нельзя держать константами: они считаются той же формулой,
 * что и `totalDuration`. По этим двум числам пульт ставит метки входа и ухода —
 * метка перестаёт быть декоративной пропорцией и показывает, где на самом деле
 * заканчивается анимация появления и начинается уход.
 *
 * Конец появления — момент удара: до него эмблема собирается из роя, после он
 * уже стоит. Уход начинается с финального движения: последние 2.5 с проектного
 * времени композиция уходит, а затем фильм гаснет (`fadeOut`).
 * @param {{impact:number, speed:number, hold?:number}} g
 */
export function phaseBounds(g: { impact: number; speed: number; hold?: number }) {
  const speed = g.speed > 0 ? g.speed : 1;
  const impact = g.impact;
  // та же формула, что и totalDuration: удар + базовый хвост со скоростью + пауза
  const total = Math.round((impact + (baseDuration - DESIGN_IMPACT) / speed + (g.hold || 0)) * 100) / 100;
  // в проектном времени уход начинается на DESIGN_EXIT, в реальном — с учётом скорости
  const exitAt = impact + (DESIGN_EXIT - DESIGN_IMPACT) / speed;
  const exitEnd = impact + (DESIGN_EXIT_END - DESIGN_IMPACT) / speed;
  return {
    entry: Math.max(0.1, Math.min(impact, total * 0.5)),
    exit: Math.max(0.3, Math.min(exitEnd - exitAt, total - impact)),
    exitAt: Math.min(exitAt, total),
  };
}
export function totalDuration(c: Config) {
  const g = c.general;
  return Math.round((g.impact + (baseDuration - DESIGN_IMPACT) / g.speed + g.hold) * 100) / 100;
}

/* ------------------------------------------------------------------ схема полей */
export type Field =
  | { k: string; label: string; t: 'num'; min: number; max: number; step: number; unit?: string; s?: boolean; hint?: string }
  | { k: string; label: string; t: 'bool'; s?: boolean; hint?: string }
  | { k: string; label: string; t: 'color'; s?: boolean; hint?: string }
  | { k: string; label: string; t: 'text' | 'area'; s?: boolean; hint?: string }
  | { k: string; label: string; t: 'sel'; opts: [string, string][]; s?: boolean; hint?: string };
export interface Section { title: string; fields: Field[] }

const num = (k: string, label: string, min: number, max: number, step: number, extra: Partial<{ unit: string; s: boolean; hint: string }> = {}): Field => ({ k, label, t: 'num', min, max, step, ...extra });
const bool = (k: string, label: string, hint?: string): Field => ({ k, label, t: 'bool', hint });
const color = (k: string, label: string): Field => ({ k, label, t: 'color' });
const sel = (k: string, label: string, opts: [string, string][]): Field => ({ k, label, t: 'sel', opts });
const text = (k: string, label: string, s = true): Field => ({ k, label, t: 'text', s });

export const FONT_KEYS: [string, string][] = [
  ['forum', 'Forum'], ['prata', 'Prata'], ['playfair', 'Playfair Display'],
  ['cormorant', 'Cormorant'], ['oldstandard', 'Old Standard TT'], ['montserrat', 'Montserrat'],
];
export const EASING_OPTS: [string, string][] = [
  ['cubic', 'Плавное замедление'], ['sine', 'Синус'], ['quint', 'Резкий старт'], ['expo', 'Экспонента'],
  ['back', 'С перелётом'], ['elastic', 'Пружина'], ['bounce', 'Отскок'], ['linear', 'Линейно'],
];

export const LOGO_PRESETS: [string, string][] = [
  ['swarm', 'Рой частиц → эмблема'],
  ['assemble', 'Сборка деталей'],
  ['forge', 'Литьё золота'],
  ['spin', 'Вращение 3D'],
  ['rise', 'Всплытие'],
  ['implode', 'Схлопывание'],
  ['drop', 'Падение с отскоком'],
  ['flip', 'Переворот'],
  ['zoom', 'Удар из глубины'],
  ['unfold', 'Раскрытие из центра'],
  ['slide', 'Скольжение сторон'],
  ['fade', 'Проявление'],
];
/** Рекомендованные тайминги при выборе пресета (подставляются автоматически, потом настраиваются). */
export const LOGO_PRESET_DEFAULTS: Record<string, { duration: number; stagger: number; lead: number; easing: string }> = {
  swarm: { duration: 1.15, stagger: 0.12, lead: 0.3, easing: 'cubic' },
  assemble: { duration: 1.2, stagger: 0.1, lead: 0.9, easing: 'cubic' },
  forge: { duration: 1.6, stagger: 0.06, lead: 1.0, easing: 'sine' },
  spin: { duration: 1.8, stagger: 0.05, lead: 1.5, easing: 'cubic' },
  rise: { duration: 1.4, stagger: 0.14, lead: 1.0, easing: 'cubic' },
  implode: { duration: 1.1, stagger: 0.04, lead: 1.0, easing: 'expo' },
  drop: { duration: 1.2, stagger: 0.13, lead: 0.9, easing: 'linear' },
  flip: { duration: 1.1, stagger: 0.12, lead: 0.9, easing: 'back' },
  zoom: { duration: 1.2, stagger: 0.05, lead: 1.0, easing: 'expo' },
  unfold: { duration: 1.3, stagger: 0.08, lead: 1.0, easing: 'back' },
  slide: { duration: 1.2, stagger: 0.1, lead: 1.0, easing: 'cubic' },
  fade: { duration: 1.8, stagger: 0.1, lead: 1.3, easing: 'sine' },
};
export const TITLE_PRESETS: [string, string][] = [
  ['fly', 'Влёт из глубины'], ['rise', 'Подъём'], ['drop', 'Падение с отскоком'], ['flip', 'Переворот'],
  ['zoom', 'На зрителя'], ['scatter', 'Из хаоса'], ['spin', 'Вращение'], ['pop', 'Всплеск'], ['fade', 'Проявление'],
];
export const TEXT_PRESETS: [string, string][] = [['wipe', 'Проявление лучом'], ['fade', 'Плавное'], ['rise', 'Подъём'], ['spread', 'Раздвижение букв']];

const gold = [color('deep', 'Золото: тень'), color('mid', 'Золото: середина'), color('top', 'Золото: блик')];

export const SCHEMA: Record<string, Section[]> = {
  general: [
    { title: 'Время', fields: [
      num('impact', 'Момент удара (эмблема)', 1.5, 9, 0.05, { unit: 'с', hint: 'Центральное событие: вспышка и ударная волна' }),
      num('speed', 'Скорость после удара', 0.5, 2.5, 0.05, { unit: '×' }),
      num('hold', 'Финальная пауза', 0, 60, 0.1, { unit: 'с' }),
      num('compositionY', 'Положение композиции, Y', -3, 3, 0.05, { hint: 'Сдвиг эмблемы и надписей целиком: вверх — положительное' }),
      num('logoRise', 'Подъём эмблемы к названию', 0, 3, 0.02, { unit: 'Y', hint: 'Насколько эмблема ниже в начале и поднимается, когда появляется название' }),
      bool('loop', 'Зацикливать превью'),
    ] },
    { title: 'Экспорт видео', fields: [
      text('fileName', 'Имя файла', false),
      sel('width', 'Разрешение', [['1280', '1280×720'], ['1920', '1920×1080'], ['2560', '2560×1440'], ['3840', '3840×2160 (4K)']]),
      sel('fps', 'Кадров/с', [['24', '24'], ['30', '30'], ['50', '50'], ['60', '60']]),
      num('bitrate', 'Битрейт', 4, 80, 1, { unit: 'Мбит/с' }),
      bool('fadeOut', 'Уход в чёрный в конце экспорта'),
      num('quality', 'Макс. ширина превью', 640, 3840, 160, { unit: 'px', hint: 'Только для просмотра; снижается автоматически, если GPU не тянет' }),
    ] },
  ],
  camera: [
    { title: 'Камера', fields: [
      num('fov', 'Угол обзора', 15, 60, 1, { unit: '°' }),
      num('distance', 'Дистанция (финал)', 10, 30, 0.1),
      num('push', 'Наезд за ролик', 0, 12, 0.1),
      num('startX', 'Старт: смещение X', -6, 6, 0.1),
      num('startY', 'Старт: смещение Y', -4, 4, 0.1),
      num('roll', 'Старт: крен', -0.2, 0.2, 0.005),
      num('sway', 'Лёгкое покачивание', 0, 4, 0.05),
    ] },
    { title: 'Удар', fields: [
      num('punch', 'Толчок камеры', 0, 2, 0.05),
      num('shake', 'Дрожь', 0, 4, 0.05),
      num('windup', 'Замах (отъезд перед ударом)', 0, 2, 0.02),
    ] },
  ],
  post: [
    { title: 'Свет и стекло', fields: [
      num('exposure', 'Экспозиция', 0.3, 2, 0.01),
      num('bloom', 'Свечение (bloom)', 0, 3, 0.05, { unit: '×' }),
      num('bloomRadius', 'Радиус свечения', 0, 1.5, 0.05),
      num('bloomThreshold', 'Порог свечения', 0, 2, 0.05),
      num('streak', 'Анаморфные полосы', 0, 3, 0.05, { unit: '×' }),
      num('aberration', 'Хроматическая аберрация', 0, 4, 0.05, { unit: '×' }),
      num('focus', 'Фокус-пулл (боке)', 0, 3, 0.05, { unit: '×' }),
    ] },
    { title: 'Цвет и плёнка', fields: [
      num('hue', 'Оттенок (весь кадр)', -180, 180, 1, { unit: '°' }),
      num('saturation', 'Насыщенность', 0, 2, 0.01),
      num('contrast', 'Контраст', 0.6, 1.6, 0.01),
      num('shadowTint', 'Холодные тени', 0, 4, 0.1),
      num('vignette', 'Виньетка', 0, 1.2, 0.01),
      num('grain', 'Зерно', 0, 0.12, 0.002),
    ] },
    { title: 'Пролог', fields: [
      bool('ignition', 'Линия-зажигание'),
      bool('slit', 'Кинематографическая «щель»'),
      num('slitSize', 'Высота «щели»', 0.1, 0.5, 0.005),
    ] },
  ],
  background: [
    { title: 'Фон', fields: [
      num('beam', 'Луч света', 0, 2, 0.02), num('ribbons', 'Золотые ленты', 0, 2, 0.02),
      num('glow', 'Свечение за эмблемой', 0, 2, 0.02), num('final', 'Финальное сияние', 0, 2, 0.02),
    ] },
  ],
  logo: [
    lightPulseSection(),
    { title: 'Анимация', fields: [
      sel('preset', 'Пресет', LOGO_PRESETS),
      num('duration', 'Длительность детали', 0.2, 4, 0.05, { unit: 'с' }),
      num('stagger', 'Задержка между деталями', 0, 0.6, 0.01, { unit: 'с' }),
      num('lead', 'Опережение удара', -1, 3, 0.05, { unit: 'с' }),
      sel('easing', 'Кривая', EASING_OPTS),
      num('intensity', 'Сила эффекта', 0, 3, 0.05),
      num('angle', 'Направление', 0, 360, 5, { unit: '°', hint: 'Откуда прилетают детали (для сборки, падения, скольжения)' }),
      num('turns', 'Обороты', 0, 4, 0.25),
      num('delay', 'Сдвиг слоя', -3, 5, 0.05, { unit: 'с' }),
      num('swarm', 'Плотность роя', 0, 1, 0.01),
      num('flash', 'Вспышка при ударе', 0, 2, 0.05),
    ] },
    { title: 'Трансформация', fields: [
      num('x', 'Смещение X', -6, 6, 0.05), num('y', 'Смещение Y', -4, 4, 0.05),
      num('scale', 'Масштаб', 0.3, 2.5, 0.01),
      num('tilt', 'Начальный поворот', -1.5, 1.5, 0.01),
      num('float', 'Парение', 0, 4, 0.05),
    ] },
    { title: 'Материал', fields: [
      ...gold,
      num('roughness', 'Шероховатость', 0.02, 0.9, 0.01),
      num('env', 'Отражения', 0, 4, 0.05),
    ] },
    { title: 'Геометрия и SVG', fields: [
      num('size', 'Ширина эмблемы', 1, 6, 0.05, { s: true }),
      num('depth', 'Толщина (выдавливание)', 10, 400, 5, { s: true }),
      num('bevel', 'Фаска', 0, 60, 1, { s: true }),
      num('sparkCount', 'Искры при ударе', 0, 3000, 50, { s: true }),
      { k: 'svg', label: 'Свой SVG (вставьте код)', t: 'area', s: true, hint: 'Пусто — встроенная эмблема. Заливка путей не важна, берутся контуры.' },
    ] },
  ],
  compass: [
    { title: 'Дуги циркуля', fields: [
      num('opacity', 'Яркость', 0, 2, 0.02), num('radius', 'Радиус', 0.5, 2, 0.01),
      num('thickness', 'Толщина', 0.2, 4, 0.05), num('speed', 'Скорость вычерчивания', 0.3, 3, 0.05),
      num('head', 'Светящаяся головка', 0, 3, 0.05), num('delay', 'Сдвиг слоя', -3, 5, 0.05, { unit: 'с' }),
    ] },
  ],
  title: [
    lightPulseSection(),
    { title: 'Текст', fields: [
      text('text', 'Название'),
      sel('font', 'Шрифт', FONT_KEYS),
      num('width', 'Ширина', 3, 16, 0.05, { s: true }),
      num('tracking', 'Межбуквенный интервал', -0.05, 0.4, 0.005, { s: true }),
      num('depth', 'Толщина букв', 0.02, 0.6, 0.01, { s: true }),
      num('bevel', 'Фаска', 0, 0.12, 0.005, { s: true }),
    ] },
    { title: 'Анимация', fields: [
      sel('preset', 'Пресет', TITLE_PRESETS),
      sel('order', 'Порядок букв', [['ltr', 'Слева направо'], ['rtl', 'Справа налево'], ['center', 'От центра'], ['edges', 'От краёв'], ['random', 'Случайно']]),
      num('start', 'Старт', 0, 12, 0.05, { unit: 'с' }),
      num('stagger', 'Задержка между буквами', 0, 0.4, 0.005, { unit: 'с' }),
      num('duration', 'Длительность буквы', 0.2, 3, 0.05, { unit: 'с' }),
      sel('easing', 'Кривая', EASING_OPTS),
      num('intensity', 'Сила эффекта', 0, 3, 0.05),
      num('flash', 'Вспышка при посадке', 0, 3, 0.05),
      num('sparkCount', 'Искры при посадке', 0, 200, 5),
      num('delay', 'Сдвиг слоя', -3, 5, 0.05, { unit: 'с' }),
    ] },
    { title: 'Положение', fields: [num('x', 'Смещение X', -6, 6, 0.05), num('y', 'Смещение Y', -3, 3, 0.02), num('scale', 'Масштаб', 0.3, 2, 0.01)] },
    { title: 'Материал', fields: [...gold, num('roughness', 'Шероховатость', 0.02, 0.9, 0.01), num('env', 'Отражения', 0, 4, 0.05)] },
  ],
  subtitle: [textSection('Подзаголовок'), textAnim(), lightPulseSection()],
  date: [textSection('Дата'), textAnim(), lightPulseSection()],
  dividers: [
    { title: 'Общие', fields: [
      bool('first', 'Показывать верхний'), bool('second', 'Показывать нижний'), bool('diamonds', 'Ромбы'),
      num('width', 'Общая длина', 0.2, 2, 0.01), num('intensity', 'Общая яркость', 0, 2, 0.02),
      num('thickness', 'Толщина линии', 0.3, 3, 0.05), num('core', 'Ширина ядра', 0.03, 0.35, 0.01),
      num('glow', 'Свечение вокруг линии', 0, 0.8, 0.02), num('highlight', 'Бегущий блик', 0, 2, 0.05),
      color('color', 'Цвет линии'), color('hotColor', 'Цвет ядра'),
      num('duration', 'Общая длительность', 0.2, 4, 0.05, { unit: 'с' }),
      num('delay', 'Сдвиг слоя', -3, 5, 0.05, { unit: 'с' }),
    ] },
    { title: 'Верхний разделитель', fields: [
      num('length1', 'Длина, ×', 0.2, 2, 0.02), num('intensity1', 'Яркость, ×', 0, 2, 0.02),
      num('duration1', 'Длительность, ×', 0.2, 2.5, 0.05),
      num('y1', 'Смещение Y', -2, 2, 0.02), num('start1', 'Старт', 0, 12, 0.05, { unit: 'с' }),
    ] },
    { title: 'Нижний разделитель', fields: [
      num('length2', 'Длина, ×', 0.2, 2, 0.02), num('intensity2', 'Яркость, ×', 0, 2, 0.02),
      num('duration2', 'Длительность, ×', 0.2, 2.5, 0.05),
      num('y2', 'Смещение Y', -2, 2, 0.02), num('start2', 'Старт', 0, 12, 0.05, { unit: 'с' }),
    ] },
  ],
  rings: [
    { title: 'Угловые кольца', fields: [
      num('opacity', 'Яркость', 0, 2, 0.02), num('speed', 'Скорость вращения', 0, 4, 0.05),
      num('scale', 'Размер', 0.4, 2.5, 0.02), bool('nodes', 'Светящиеся узлы'), num('delay', 'Сдвиг слоя', -3, 5, 0.05, { unit: 'с' }),
    ] },
  ],
  particles: [
    { title: 'Пыль и боке', fields: [
      num('dust', 'Количество пыли', 0, 1, 0.01), num('bokeh', 'Количество боке', 0, 1, 0.01),
      num('size', 'Размер', 0.3, 3, 0.05), num('speed', 'Скорость', 0, 4, 0.05), num('brightness', 'Яркость', 0, 3, 0.05),
      num('delay', 'Сдвиг слоя', -3, 5, 0.05, { unit: 'с' }),
    ] },
  ],
  fx: [
    { title: 'Световые эффекты', fields: [
      num('flash', 'Вспышка и ядро', 0, 3, 0.05), num('shock', 'Ударная волна', 0, 3, 0.05),
      num('waves', 'Кольцевые волны', 0, 3, 0.05), num('titleWave', 'Волна под названием', 0, 1, 0.05),
      num('flares', 'Анаморфные блики', 0, 3, 0.05),
      num('glints', 'Звёздные блики', 0, 3, 0.05), num('sweep', 'Бегущий свет по золоту', 0, 3, 0.05),
      num('rays', 'Лучи из эмблемы', 0, 4, 0.05),
    ] },
  ],
};

function textSection(title: string): Section {
  return { title, fields: [
    text('text', 'Текст'), sel('font', 'Шрифт', FONT_KEYS),
    num('width', 'Ширина', 1, 14, 0.05, { s: true }), num('tracking', 'Межбуквенный интервал', 0, 1.2, 0.01, { s: true }),
    num('x', 'Смещение X', -6, 6, 0.05), num('y', 'Смещение Y', -3, 3, 0.02),
    color('colA', 'Цвет: основа'), color('colB', 'Цвет: блик'), num('brightness', 'Яркость', 0, 4, 0.05),
  ] };
}
function lightPulseSection(): Section {
  return { title: 'Переиспользуемый эффект: световая пульсация', fields: [
    num('lightPulse', 'Пульсация света: сила', 0, 1, 0.01),
    num('lightPulseSpeed', 'Пульсация света: скорость, Гц', 0, 3, 0.01),
  ] };
}

function textAnim(): Section {
  return { title: 'Анимация', fields: [
    sel('preset', 'Пресет', TEXT_PRESETS), num('start', 'Старт', 0, 12, 0.05, { unit: 's' }),
    num('duration', 'Длительность', 0.2, 5, 0.05, { unit: 'с' }), num('delay', 'Сдвиг слоя', -3, 5, 0.05, { unit: 'с' }),
  ] };
}

export const FIELD_INDEX: Record<string, Field> = {};
for (const [scope, sections] of Object.entries(SCHEMA)) {
  const prefix = ['general', 'camera', 'post'].includes(scope) ? scope : `layers.${scope}`;
  for (const s of sections) for (const f of s.fields) FIELD_INDEX[`${prefix}.${f.k}`] = f;
}
// «delay» есть у каждого слоя, но не у всех в схеме — общий диапазон
for (const id of ['background', ...LAYER_IDS]) FIELD_INDEX[`layers.${id}.delay`] ??= { k: 'delay', label: 'Сдвиг слоя', t: 'num', min: -3, max: 5, step: 0.05 };

export const LAYER_META: Record<string, { label: string; hint: string }> = {
  background: { label: 'Фон и свет', hint: 'Луч, ленты, свечение. Всегда внизу' },
  logo: { label: 'Эмблема', hint: '3D-логотип, 12 пресетов появления' },
  compass: { label: 'Дуги циркуля', hint: 'Вычерчиваемые дуги вокруг эмблемы' },
  title: { label: 'Название', hint: '3D-буквы' },
  subtitle: { label: 'Подзаголовок', hint: 'Текстовый слой' },
  date: { label: 'Дата', hint: 'Текстовый слой' },
  dividers: { label: 'Разделители', hint: 'Линии с ромбами' },
  rings: { label: 'Угловые кольца', hint: 'Кольца в углах кадра' },
  particles: { label: 'Пыль и боке', hint: 'Частицы в объёме' },
  fx: { label: 'Световые эффекты', hint: 'Вспышки, волны, блики, лучи' },
};

/* ------------------------------------------------------------------ готовые образы всей композиции */
export const LOOKS: { id: string; label: string; patch: any }[] = [
  { id: 'gold', label: 'Янтарное золото (по умолчанию)', patch: {} },
  { id: 'platinum', label: 'Платина', patch: { post: { saturation: 0.12, contrast: 1.06, shadowTint: 1.6 } } },
  { id: 'rose', label: 'Розовое золото', patch: { post: { hue: -34, saturation: 0.92 } } },
  { id: 'emerald', label: 'Изумруд', patch: { post: { hue: 78, saturation: 0.95 } } },
  { id: 'sapphire', label: 'Сапфир', patch: { post: { hue: 172, saturation: 0.9, shadowTint: 2 } } },
  { id: 'minimal', label: 'Минимализм (без частиц и колец)', patch: { layers: { particles: { enabled: false }, rings: { enabled: false }, fx: { glints: 0.4, rays: 0.4 } }, post: { bloom: 0.7 } } },
  { id: 'quick', label: 'Быстрый (≈9 с)', patch: { general: { impact: 2.8, speed: 1.4 } } },
  { id: 'epic', label: 'Эпик (дольше, сильнее удар)', patch: { general: { impact: 5.5, speed: 0.85, hold: 1.5 }, camera: { punch: 1.3, shake: 1.8, windup: 0.7 }, post: { bloom: 1.3, aberration: 1.6 } } },
];
