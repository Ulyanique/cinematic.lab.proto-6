import { createSharedSceneConfig } from "./shared-visuals.js";
import { WAITING_DEFAULTS } from "./waiting.js";
import { DEFAULT_CONFIG, SCHEMA as LAB2_SCHEMA } from "../lab2/config.ts";
import { DEFAULT_SETTINGS } from "../lab5/settings.ts";
import { TL as LAB5_TL } from "../lab5/timeline.ts";

/**
 * Две кинематографичные лаборатории, подключённые к конструктору как полноценные
 * ролики. Их собственный вид не менялся; параметры показаны в общей панели ⚙, а общий
 * набор эффектов (раздел «Эффекты — для любой композиции») доступен так же, как в
 * остальных сценах.
 *
 * Лаборатория 10 — «Золотой рой» (cinematic-lab-proto-2): 3D-эмблема из роя частиц,
 *   объёмные буквы, ударная волна, блики линзы, 12 пресетов появления эмблемы.
 * Лаборатория 11 — «Монолиты» (cinematic-lab-proto-5): 51-секундный фильм —
 *   десять видеомонолитов, схлопывание, взрыв и появление знака.
 */
export const LAB2_ID = "lab-swarm";
export const LAB5_ID = "lab-monoliths";
export const LAB_IDS = Object.freeze([LAB2_ID, LAB5_ID]);
export const isLabScene = (id) => LAB_IDS.includes(id);

/** Таймлайн ролика-лаборатории: вся длительность — «удержание», её выставляет сам ролик. */
function labTimeline(duration) {
  const base = WAITING_DEFAULTS.timeline;
  return {
    drawDuration: 0, emergeDuration: 0, holdDuration: duration, fadeDuration: 0, restDuration: 0,
    startDelay: 0, ringsIntro: base.ringsIntro, speed: 1, beatBpm: base.beatBpm, beatOffset: base.beatOffset,
  };
}

const plain = (o) => JSON.parse(JSON.stringify(o));

// ── Лаборатория 10 ───────────────────────────────────────────────────────
const LAB2_SCOPES = [
  ["general", "Время"], ["camera", "Камера"], ["post", "Постобработка и оптика"], ["background", "Фон и свет"],
  ["logo", "Эмблема"], ["compass", "Циркуль"], ["title", "Название"], ["subtitle", "Подзаголовок"],
  ["date", "Дата"], ["dividers", "Разделители"], ["rings", "Угловые кольца"], ["particles", "Пыль и боке"], ["fx", "Световые эффекты"],
];
const LAB2_PREFIX = "lab2_";
const GENERAL_KEEP = new Set(["impact", "speed", "hold"]);
const SKIP = (scope, key) => (scope === "general" && !GENERAL_KEEP.has(key)) || key === "svg" || key === "delay";

function convertField(f) {
  const label = f.unit ? `${f.label}, ${f.unit}` : f.label;
  switch (f.t) {
    case "num": return { key: f.k, label, type: "range", min: f.min, max: f.max, step: f.step };
    case "bool": return { key: f.k, label, type: "bool" };
    case "color": return { key: f.k, label, type: "color" };
    case "text": return { key: f.k, label, type: "text", maxLength: 200 };
    case "sel": return { key: f.k, label, type: "select", options: f.opts.map(([value, text]) => ({ value, label: text })) };
    default: return null;
  }
}

const lab2Sections = LAB2_SCOPES.map(([scope, title]) => {
  const seen = new Set();
  const fields = [];
  for (const group of LAB2_SCHEMA[scope] || []) {
    for (const f of group.fields) {
      if (SKIP(scope, f.k) || seen.has(f.k)) continue;
      const converted = convertField(f);
      if (converted) { seen.add(f.k); fields.push(converted); }
    }
  }
  return { id: LAB2_PREFIX + scope, title: `Лаб. 10 · ${title}`, fields };
}).filter((s) => s.fields.length);

/** Собрать конфиг движка proto-2 из плоских разделов сцены. */
export function lab2Source(cfg) {
  const layers = {};
  const out = { general: { ...(cfg[LAB2_PREFIX + "general"] || {}) }, camera: { ...(cfg[LAB2_PREFIX + "camera"] || {}) }, post: { ...(cfg[LAB2_PREFIX + "post"] || {}) }, layers };
  for (const [scope] of LAB2_SCOPES) {
    if (["general", "camera", "post"].includes(scope)) continue;
    layers[scope] = { ...(cfg[LAB2_PREFIX + scope] || {}) };
  }
  return out;
}

export const LAB2_DEFAULTS = (() => {
  const cfg = createSharedSceneConfig(labTimeline(13.6));
  cfg.transition = { duration: 0.9 };
  cfg.caption.titleVisible = false;
  const src = plain(DEFAULT_CONFIG);
  for (const [scope] of LAB2_SCOPES) {
    const part = ["general", "camera", "post"].includes(scope) ? src[scope] : src.layers[scope];
    cfg[LAB2_PREFIX + scope] = part;
  }
  return cfg;
})();

// ── Лаборатория 11 ───────────────────────────────────────────────────────
const LAB5_PREFIX = "lab5_";
const FONTS5 = [{ value: "Prata", label: "Prata" }, { value: "Forum", label: "Forum" }, { value: "Inter", label: "Inter" }];
const r = (key, label, min, max, step = 0.01) => ({ key, label, type: "range", min, max, step });
const LAB5_FIELDS = {
  text: [
    { key: "title", label: "Название", type: "text", maxLength: 30 },
    { key: "subtitle", label: "Подзаголовок", type: "text", maxLength: 45 },
    { key: "titleFont", label: "Шрифт названия", type: "select", options: FONTS5 },
    { key: "subtitleFont", label: "Шрифт подзаголовка", type: "select", options: FONTS5 },
    r("titleScale", "Размер названия", 0.55, 1.5), r("subtitleScale", "Размер подзаголовка", 0.6, 1.5),
    r("titleSpacing", "Трекинг названия, em", 0, 0.2, 0.005), r("subtitleSpacing", "Трекинг подзаголовка, em", 0, 0.6, 0.005),
    r("titlePosition", "Положение блока, % высоты", 38, 68, 0.5),
    { key: "titleLight", label: "Золото названия: блик", type: "color" }, { key: "titleMid", label: "Золото названия: свет", type: "color" },
    { key: "titleGold", label: "Золото названия: тело", type: "color" }, { key: "titleDark", label: "Золото названия: тень", type: "color" },
    { key: "subtitleColor", label: "Цвет подзаголовка", type: "color" },
    { key: "showTitle", label: "Показывать название", type: "bool" }, { key: "showSubtitle", label: "Показывать подзаголовок", type: "bool" },
    r("revealSpeed", "Скорость проявления букв", 0.5, 2), r("exitMotion", "Движение букв при уходе", 0, 2),
  ],
  logo: [
    { key: "showLogo", label: "Показывать знак", type: "bool" }, r("logoScale", "Размер знака", 0.5, 1.5), r("logoOpacity", "Прозрачность знака", 0, 1),
    { key: "ringsEnabled", label: "Угловые кольца", type: "bool" }, { key: "ringColor", label: "Цвет колец", type: "color" },
    r("ringSize", "Размер колец", 0.5, 1.5), r("ringOpacity", "Яркость колец", 0, 1.5), r("ringSpeed", "Скорость колец", 0, 2),
  ],
  light: [
    r("exposure", "Экспозиция", 0.35, 2), r("bloom", "Свечение", 0, 2), r("dust", "Пыль", 0, 2), r("beams", "Лучи монолитов", 0, 2),
    r("blast", "Взрыв", 0, 2), r("sigil", "Сигил", 0, 2), r("sky", "Небо", 0, 2), r("rays", "Лучи света", 0, 2),
    r("grain", "Зерно", 0, 2), r("vignette", "Виньетка", 0, 2), r("hue", "Оттенок, °", -180, 180, 1), r("saturation", "Насыщенность", 0, 2),
    r("cameraFov", "Угол обзора камеры", 0.75, 1.3), r("cameraDrift", "Дрейф камеры", 0, 2), r("videoBrightness", "Яркость экранов монолитов", 0, 2),
    { key: "antialias", label: "Сглаживание кромок", type: "bool" },
  ],
};
const LAB5_TITLES = { text: "Надписи", logo: "Знак и кольца", light: "Свет, камера, цвет" };
const lab5Sections = Object.entries(LAB5_FIELDS).map(([id, fields]) => ({ id: LAB5_PREFIX + id, title: `Лаб. 11 · ${LAB5_TITLES[id]}`, fields }));

/** Собрать плоский набор настроек фильма из разделов сцены (нормализует сам движок). */
export function lab5Source(cfg) {
  return { ...(cfg[LAB5_PREFIX + "text"] || {}), ...(cfg[LAB5_PREFIX + "logo"] || {}), ...(cfg[LAB5_PREFIX + "light"] || {}) };
}

export const LAB5_DEFAULTS = (() => {
  const cfg = createSharedSceneConfig(labTimeline(LAB5_TL.end));
  cfg.transition = { duration: 0.9 };
  cfg.caption.titleVisible = false;
  for (const [id, fields] of Object.entries(LAB5_FIELDS)) {
    cfg[LAB5_PREFIX + id] = Object.fromEntries(fields.map((f) => [f.key, DEFAULT_SETTINGS[f.key]]));
  }
  return cfg;
})();

export const LAB_SCHEMA_SECTIONS = [...lab2Sections, ...lab5Sections];

/** Какие разделы панели показывать для ролика-лаборатории (null — не лаборатория). */
export function labSectionAllowed(sceneId, sectionId) {
  if (!isLabScene(sceneId)) return null;
  if (["timeline", "playback", "transition", "fxStack"].includes(sectionId)) return true;
  return sectionId.startsWith(sceneId === LAB2_ID ? LAB2_PREFIX : LAB5_PREFIX);
}
