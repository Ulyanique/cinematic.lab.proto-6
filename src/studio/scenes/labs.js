import { createSharedSceneConfig } from "./shared-visuals.js";
import { WAITING_DEFAULTS } from "./waiting.js";
import { DEFAULT_CONFIG, SCHEMA as LAB2_SCHEMA, totalDuration as lab2Duration, phaseBounds } from "../lab2/config.ts";
import { DEFAULT_SETTINGS } from "../lab5/settings.ts";
import { TL as LAB5_TL } from "../lab5/timeline.ts";
import { MEDIA_CLIPS, mediaOptions, VIDEO_FIT_OPTIONS } from "../lab5/media.ts";
import { FULL_ASSIGN, normalizeAssign } from "../lab5/settings.ts";

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
/**
 * Фон из интро: та же композиция, что «Интро», без вечера и даты. Отдельный
 * ролик, а не переключатель внутри интро: у фона своя длина, свои настройки и
 * своя запись, и он должен жить в списке рядом с остальными.
 */
export const LAB2_BRAND_ID = "lab-swarm-brand";
export const LAB_IDS = Object.freeze([LAB2_ID, LAB5_ID, LAB2_BRAND_ID]);
export const isLabScene = (id) => LAB_IDS.includes(id);

/**
 * Таймлайн ролика-лаборатории по фазам её фильма: появление · основная картинка ·
 * уход.
 *
 * Раньше вся длительность лежала в «удержании» (0 / всё / 0), и метки входа и
 * ухода стояли по краям полосы — то есть ничего не ограничивали. Теперь границы
 * считает `phaseBounds` по той же формуле, что и длительность фильма: метка
 * входа — конец появления (момент удара), метка ухода — начало ухода.
 * @param {number} duration полная длина фильма, секунды
 * @param {{entry:number, exit:number}} bounds
 */
function labTimeline(duration, bounds) {
  const base = WAITING_DEFAULTS.timeline;
  const entry = Math.max(0, Math.min(bounds.entry, duration - 0.4));
  const exit = Math.max(0, Math.min(bounds.exit, duration - entry - 0.2));
  return {
    // вход — одной стадией: у фильма один пролог, делить его на «контур» и
    // «появление» нечего, и подпись «Вход» честно равна всей анимации появления.
    drawDuration: entry, emergeDuration: 0,
    holdDuration: Math.max(0.2, duration - entry - exit),
    fadeDuration: exit, restDuration: 0,
    startDelay: 0, ringsIntro: base.ringsIntro, speed: 1, beatBpm: base.beatBpm, beatOffset: base.beatOffset,
  };
}

const plain = (o) => JSON.parse(JSON.stringify(o));

/**
 * Фон из интро: одна минута, композиция по центру кадра.
 *
 * Остальное — ровно как в «Интро»: та же эмблема, то же название, тот же свет.
 * Убраны только «ВЕЧЕР РЕТРОСПЕКТИВА» и дата внизу. Без них блок «эмблема +
 * название» садится выше середины, поэтому композиция целиком опускается
 * (compositionY) — центр блока приходится на середину кадра.
 */
function brandTimeline() {
  const base = WAITING_DEFAULTS.timeline;
  return {
    drawDuration: 0, emergeDuration: 0, holdDuration: 60, fadeDuration: 0, restDuration: 0,
    startDelay: 0, ringsIntro: base.ringsIntro, speed: 1, beatBpm: base.beatBpm, beatOffset: base.beatOffset,
  };
}

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
  const srcPre = plain(DEFAULT_CONFIG);
  const cfg = createSharedSceneConfig(labTimeline(lab2Duration(srcPre), phaseBounds(srcPre.general)));
  cfg.transition = { duration: 0.9 };
  cfg.caption.titleVisible = false;
  const src = plain(DEFAULT_CONFIG);
  for (const [scope] of LAB2_SCOPES) {
    const part = ["general", "camera", "post"].includes(scope) ? src[scope] : src.layers[scope];
    cfg[LAB2_PREFIX + scope] = part;
  }
  return cfg;
})();

export const LAB2_BRAND_DEFAULTS = (() => {
  const cfg = createSharedSceneConfig(brandTimeline());
  cfg.transition = { duration: 0.9 };
  cfg.caption.titleVisible = false;
  const src = plain(DEFAULT_CONFIG);
  // Подзаголовок и дата выключены: фон идёт под речь, лишние строки в кадре
  // только мешают. Всё остальное — из «Интро», без правок.
  src.layers.subtitle.enabled = false;
  src.layers.date.enabled = false;
  // Подчёркивания под текстом: в «Интро» их два — над названием и под ним, у
  // подзаголовка и даты. Второго блока в фоне нет, и нижняя пара линий
  // осталась бы висеть в пустоте, как лишнее подчёркивание. Верхняя — часть
  // композиции, она остаётся.
  src.layers.dividers.second = false;
  src.layers.dividers.diamonds = false;
  // Композиция по центру: блок «эмблема + название» занимает y от −1.61 до
  // 3.34 (проверено по реальным границам эмблемы и высоте букв), то есть его
  // центр выше середины кадра. Минус 0.86 ставит центр ровно в середину:
  // эмблема сверху 22.5 %, название снизу 77.5 %.
  src.general.compositionY = -0.86;
  // Минута: длина фильма — «удар + базовый хвост + финальная пауза», поэтому
  // минута задаётся паузой. Всё остальное в ритме остаётся как в «Интро».
  src.general.hold = 60 - lab2Duration(src);
  // Фон почти стоит в кадре всю минуту, поэтому всё, что в «Интро» можно
  // позволить на тринадцати секундах, здесь превращается в дрожание: ударная
  // дрожь камеры, толчок и «замах» перед ним. Убираем их у фона; удара в кадре
  // остаётся столько, сколько нужно композиции (вспышка и волна на месте).
  src.camera.shake = 0;
  src.camera.punch = 0;
  src.camera.windup = 0;
  // Медленное покачивание камеры оставляем, но чуть мягче: оно и держит фон
  // живым, а не резким.
  src.camera.sway = Math.min(src.camera.sway, 0.6);
  // Границы фаз — из того же «минутного» general: появление до удара, уход —
  // последнее движение композиции. Метки на пульте должны совпадать с кадром.
  cfg.timeline = labTimeline(60, phaseBounds(src.general));
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
/**
 * Слоты видеомонолитов. Каждый слот — отдельное поле, поэтому человек видит,
 * какой ролик попадёт в какой визит камеры, и может назначить источники по
 * одному. Одним списком «videoOrder» это было не сделать: порядок есть, а
 * что именно играет на слоте — нет.
 */
const LAB5_SLOTS = MEDIA_CLIPS.map((clip, index) => ({
  key: `videoAssign.${index}`,
  label: `Слот ${String(index + 1).padStart(2, "0")} (визит ${index + 1})`,
  type: "select",
  options: mediaOptions(),
  // Подсказка в панели: чей ролик и сколько он длится.
  hint: `${clip.name} · ${clip.timecode}`,
}));

const LAB5_FIELDS = {
  video: [
    {
      key: "videoFit",
      label: "Что видно в окне визита",
      type: "select",
      options: VIDEO_FIT_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
      hint: "Экран монолита живёт около 1,9 с: выберите, показывать начало, кульминацию или весь ролик.",
    },
    ...LAB5_SLOTS,
  ],
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
const LAB5_TITLES = { video: "Ролики на монолитах", text: "Надписи", logo: "Знак и кольца", light: "Свет, камера, цвет" };
const lab5Sections = Object.entries(LAB5_FIELDS).map(([id, fields]) => ({ id: LAB5_PREFIX + id, title: `Лаб. 11 · ${LAB5_TITLES[id]}`, fields }));

/**
 * Собрать плоский набор настроек фильма из разделов сцены (нормализует сам движок).
 *
 * Слоты лежат в конфиге плоско (`videoAssign.0`), а движок ждёт массив: здесь
 * они и собираются. Пустой список означает «ни одного источника» — так
 * плейсхолдеры видны сразу после первого запуска, а не заменяются молча.
 */
export function lab5Source(cfg) {
  const section = cfg[LAB5_PREFIX + "video"] || {};
  // -1 — намеренно пустой слот, он часть раскладки: «одна дырка» не должна
  // обнулять весь набор и молча терять все источники.
  const assign = normalizeAssign(MEDIA_CLIPS.map((_clip, index) => section[`videoAssign.${index}`])) ?? [];
  return {
    videoAssign: assign,
    videoFit: section.videoFit,
    ...(cfg[LAB5_PREFIX + "text"] || {}),
    ...(cfg[LAB5_PREFIX + "logo"] || {}),
    ...(cfg[LAB5_PREFIX + "light"] || {}),
  };
}

/**
 * Значение по умолчанию для поля панели. Слоты монолитов адресуются точечным
 * ключом (`videoAssign.3`), поэтому обычный `DEFAULT_SETTINGS[f.key]` для них
 * пуст — здесь он разворачивается в номер ролика из полного набора.
 */
function lab5Default(key) {
  const slot = /^videoAssign\.(\d+)$/.exec(key);
  if (slot) return FULL_ASSIGN[Number(slot[1])];
  return DEFAULT_SETTINGS[key];
}

/**
 * Лаборатория 11 живёт не общей схемой, а своим таймлайном визитов: появление и
 * уход заданы в `TL` — первым подъёмом камеры и финальным движением.
 */
export const LAB5_DEFAULTS = (() => {
  const cfg = createSharedSceneConfig(labTimeline(LAB5_TL.end, { entry: LAB5_TL.visit0, exit: LAB5_TL.end - LAB5_TL.exitStart }));
  cfg.transition = { duration: 0.9 };
  cfg.caption.titleVisible = false;
  for (const [id, fields] of Object.entries(LAB5_FIELDS)) {
    cfg[LAB5_PREFIX + id] = Object.fromEntries(fields.map((f) => [f.key, lab5Default(f.key)]));
  }
  return cfg;
})();

export const LAB_SCHEMA_SECTIONS = [...lab2Sections, ...lab5Sections];

/** Какие разделы панели показывать для ролика-лаборатории (null — не лаборатория). */
export function labSectionAllowed(sceneId, sectionId) {
  if (!isLabScene(sceneId)) return null;
  if (["timeline", "playback", "transition", "fxStack"].includes(sectionId)) return true;
  // Фон собран из той же композиции, что «Интро», поэтому его разделы — те же
  // lab2_*: отдельного набора настроек у него нет и не должно быть.
  return sectionId.startsWith(sceneId === LAB5_ID ? LAB5_PREFIX : LAB2_PREFIX);
}
