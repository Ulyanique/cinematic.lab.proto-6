import "./styles.css";
import "./font-assets.js";
import { loadFabricTexture } from "./fabric-texture.js";
import { fontName, loadFonts } from "./fonts.js";
import { loadContourFonts, ensureContourFont, isContourFontLoaded } from "./contour-fonts.js";
import { parse as parseFont } from "opentype.js";
import { sources as contourSources } from "./contour-font-assets.js";
import { refreshContours } from "./contour-preview.js";
import { syncCaptionContent } from "./caption-content.js";
import { applyCaptionFit } from "./caption-fit.js";
import {
  cloneDefaults, loadSceneConfig, saveSceneConfigDetailed, replaceConfig, mergeConfig, projectToJSON,
} from "./config.js";
import { LogoScene } from "./scene.js";
import { BrandScene } from "./brand-scene.js";
import { PhotoPauseScene } from "./photo-pause-scene.js";
import { PartnersScene, loadPartnersBackground, preloadPartnerCustomLogos } from "./partners-scene.js";
import { SponsorScene } from "./sponsor-scene.js";
import { FinaleScene } from "./finale-scene.js";
import { createStudioPanels } from "./ui/panels.js";
import { createClipSwitcher } from "./ui/clip-switcher.js";
import { sectionAllowed, fieldHidden, fieldLabel } from "./ui/field-rules.js";
import { labSectionAllowed } from "./scenes/labs.js";
import {
  SCHEMA, cloneDefaults as cloneSchemaDefaults, configToJSON, parseConfigJSON, parseProjectJSON,
} from "./config.js";
import { isProjectPayload } from "./ui/dom.js";
import { depthOrder, depthOrderStep, depthOrderReset } from "./depth-order.js";
import {
  saveSceneSnapshot, loadSceneSnapshot, hasSceneSnapshot, encodeConfigShareHash,
} from "./scene-snapshots.js";
import { AnimationRuntime, cycleDuration, setRenderHook } from "./runtime.js";
import { Lab2Scene, Lab2BrandScene, Lab2OutroScene, Lab5Scene } from "./lab-scenes.js";
import { LAB2_ID, LAB2_BRAND_ID, LAB2_OUTRO_ID, LAB5_ID, isLabScene } from "./scenes/labs.js";
import { FxStack, fxActive, applyFxPreset, EFFECT_KEYS } from "./fx-stack.js";
import { frameCount, estimateVideoBytes, videoBitrateFor } from "./video-math.js";
import { deliveryOption as deliveryOptionLight, deliveryFilename } from "./delivery-light.js";
import { masterSize, masterId, setMasterPreset, loadMasterPreset } from "./output-profile.js";
import { transitionDuration, drawOutgoingFrame } from "./scene-transition.js";
import { OUTPUT, sceneById } from "./scenes/catalog.js";
import { SCENE_NAV, sceneNav, DEFAULT_SCENE_ID } from "./scenes/nav.js";
import { MIN_HOLD, MAX_CYCLE } from "./operator-timeline.js";
import { decodeConfigShareHash } from "./scene-snapshots.js";
import { createOperatorControls, crossedBoundary } from "./operator.js";
import { loadQuality, saveQuality } from "./quality-presets.js";
import { loadDelivery, saveDelivery } from "./delivery-light.js";
import { photoShutterSamples, shutterTimes } from "./photo-shutter.js";

// Панели студии и пульт создаются ниже, но правка конфига может прийти из
// панели в любой момент: объявляем их заранее, чтобы необработанная ссылка не
// превращалась в ReferenceError.
let panels;
let operator;

// Профиль мастера читаем до создания сцены: рендерер сразу получает нужный размер.
loadMasterPreset();
const fabricReady = loadFabricTexture();
const partnersReady = loadPartnersBackground();

// По умолчанию студия открывается на первой анимации программы — «Интро»
// (лаборатория 10). Раньше стартовым был «Интро», и первым в списке стоял он.
const requestedScene = new URLSearchParams(location.search).get("scene") || DEFAULT_SCENE_ID;
let activeScene = sceneById(requestedScene);
if (!activeScene?.defaults || !["ready", "preview"].includes(activeScene.status)) {
  throw new Error(`Сцена «${requestedScene}» пока не подготовлена`);
}
// "waiting" остаётся внутренним идентификатором для старых ссылок и настроек.
let sceneId = activeScene.id;
// Настройки каждой готовой сцены живут отдельно: в браузере свой ключ на сцену.
// Заставки отдельных спонсоров — те же страницы программы, поэтому идут в общем
// списке: у каждой свой конфиг, своя кнопка и своя запись.
const READY_IDS = ["waiting", "brand", "partners", "sponsor-promrukav", "sponsor-keaz", "photo-pause", "finale", LAB2_ID, LAB2_BRAND_ID, LAB2_OUTRO_ID, LAB5_ID];
const configs = new Map();
const storageFailures = new Set();
for (const id of READY_IDS) {
  configs.set(id, loadSceneConfig(id, sceneById(id).defaults, failedId => storageFailures.add(failedId)));
}
// Если открыта ссылка вида ?scene=brand#cfg=<base64url>, накладываем патч на активную сцену
// только для текущего просмотра (без перезаписи localStorage пользователя).
const sharedRaw = new URLSearchParams(location.hash.replace(/^#/, "")).get("cfg") ||
  new URLSearchParams(location.search).get("cfg");
const sharedPatch = decodeConfigShareHash(sharedRaw);
if (sharedPatch) {
  configs.set(sceneId, mergeConfig(sceneById(sceneId).defaults, sharedPatch));
}
function configFor(id) {
  id = sceneById(id)?.id || id;
  if (!configs.has(id)) configs.set(id, cloneDefaults(sceneById(id).defaults));
  return configs.get(id);
}
function saveScene(id = sceneId) {
  id = sceneById(id)?.id || id;
  const result = saveSceneConfigDetailed(id, configFor(id));
  if (result.ok) storageFailures.delete(id);
  else { storageFailures.add(id); storageReason = result.reason; }
  updateStorageWarning();
}
/** Применить присланный JSON к сцене, не ломая ссылку, которую держит рендер. */
/**
 * Внести правку в конфиг сцены из панели настроек и сразу пересобрать кадр.
 * Одна точка входа для всех полей: и одиночный ползунок, и быстрая команда
 * раздела идут одним путём, поэтому движок и сохранение не могут разойтись.
 */
function commitSceneConfig(id, mutate, options = {}) {
  id = sceneById(id)?.id || id;
  mutate(configFor(id));
  // Живой жест (перетаскивание ползунка) не сохраняет и не перестраивает
  // разметку: запись в localStorage и полная перерисовка — по завершении.
  const live = Boolean(options.live);
  if (!live) saveScene(id);
  if (id === sceneId) {
    scene.configChanged?.();
    applyTypography();
    runtime.renderAt(runtime.time, 1 / OUTPUT.fps);
  }
  if (live) return;
  operator?.refresh?.();
  panels?.refresh?.();
}

/**
 * Сброс настроек к стандартным — одна команда на все случаи: поле, раздел
 * (слой), отдельный эффект и вся сцена.
 *
 * Раньше сброс был только у сцены целиком: чтобы вернуть один ползунок,
 * приходилось править его вручную, а «вернуть стандартный вид» стоил всей
 * работы над кадром. Здесь просто копируются значения из умолчаний — тем же
 * путём, что и любая правка, поэтому кадр, пульт и сохранение не разъезжаются.
 *
 * @param {string} id сцена
 * @param {{ section?: string, key?: string }} scope
 */
function resetSceneConfig(id, scope = {}) {
  id = sceneById(id)?.id || id;
  const defaults = sceneById(id).defaults;
  if (!scope.section) {
    applySceneConfig(id, cloneDefaults(defaults));
    panels?.rebuild?.();
    return true;
  }
  commitSceneConfig(id, (config) => {
    const target = config[scope.section];
    const source = defaults[scope.section];
    if (!target || !source) return;
    if (scope.key) {
      if (!(scope.key in source)) return;
      target[scope.key] = cloneDefaults(source[scope.key]);
      return;
    }
    for (const key of Object.keys(source)) target[key] = cloneDefaults(source[key]);
  });
  panels?.rebuild?.();
  return true;
}

function applySceneConfig(id, next) {
  id = sceneById(id)?.id || id;
  // Присланный фрагмент накладывается на умолчания сцены: частичный JSON не ломает рендер.
  replaceConfig(configFor(id), mergeConfig(sceneById(id).defaults, next));
  saveScene(id);
  if (id === sceneId) { scene.configChanged?.(); applyTypography(); runtime.renderAt(runtime.time, 1 / OUTPUT.fps); }
}
let cfg = configFor(sceneId);
let canvas = document.getElementById("stage");
const toastEl = document.getElementById("toast");
let toastTimer = 0;
function toast(msg, isError = false) {
  toastEl.textContent = msg;
  toastEl.classList.toggle("error", isError);
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), isError ? 10000 : 2200);
}

// Persistent warning: a toast can be overwritten by a later success message.
// Текст зависит от причины: при переполнении квоты нужно подсказать, что делать,
// а не ограничиваться «настройки не сохранились».
let storageReason = null;
const storageWarning = document.createElement("div");
storageWarning.className = "storage-warning";
storageWarning.setAttribute("role", "alert");
storageWarning.innerHTML = '<span></span> <button type="button">Скачать текущий проект JSON</button>';
const storageWarningText = storageWarning.querySelector("span");
const STORAGE_MESSAGES = {
  quota: "Не хватает места в хранилище браузера: настройки не сохраняются (обычно из-за загруженных логотипов). Уберите логотипы в разделах «Организаторы»/«Партнёры» или скачайте проект JSON — изменения потеряются после перезагрузки.",
  blocked: "Браузер запретил сохранение настроек (приватный режим или запрет хранилища сайта). Изменения потеряются после перезагрузки — скачайте проект JSON.",
  unknown: "Настройки не удалось прочитать или сохранить в браузере. Изменения могут потеряться после перезагрузки.",
};
function storageWarningMessage(reason) {
  return STORAGE_MESSAGES[reason] || STORAGE_MESSAGES.unknown;
}
storageWarning.querySelector("button").addEventListener("click", () => {
  const blob = new Blob([projectToJSON(Object.fromEntries(READY_IDS.map(id => [id, configFor(id)])), READY_IDS)], {type: "application/json"});
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob); link.download = "circle-scenes-backup.json";
  link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
});
document.body.appendChild(storageWarning);
function updateStorageWarning() {
  storageWarning.hidden = storageFailures.size === 0;
  if (!storageWarning.hidden) storageWarningText.textContent = storageWarningMessage(storageReason);
}
updateStorageWarning();

function activateClasses(id) {
  for (const name of ["brand", "partners", "photo-pause", "finale", "sponsor-promrukav", "sponsor-keaz"]) {
    document.body.classList.toggle(`scene-${name === "photo-pause" ? "photo" : name}`, id === name);
  }
  document.body.classList.toggle("scene-waiting", id === "waiting");
  // На заставках спонсора текст живёт в кадре: DOM-титр там не нужен.
  document.body.classList.toggle("scene-sponsor", id.startsWith("sponsor-"));
}
activateClasses(sceneId);
function activeFontIds(config = cfg) {
  const ids = [config?.typography?.font || "cormorant-garamond"];
  const tl = config?.textLayers;
  if (tl && typeof tl === "object") {
    for (let i = 1; i <= 8; i++) {
      if (tl[`text${i}Present`] && tl[`text${i}Font`]) ids.push(tl[`text${i}Font`]);
    }
  }
  return [...new Set(ids)];
}
function applyTypography(force = false) {
  const cap = document.getElementById("caption");
  const font = cfg.typography?.font || "cormorant-garamond";
  const sizes = ["title", "subtitle", "date"].map(name => cfg.caption?.[`${name}Scale`] ?? 1);
  const tracking = ["title", "subtitle", "date"].map(name => cfg.typography?.[`${name}Tracking`]);
  const textChanged = syncCaptionContent(cap, cfg.caption, cfg.textLayers);
  for (const [i, name] of ["title", "subtitle", "date"].entries()) {
    cap.style.setProperty(`--${name}-scale`, sizes[i]);
    const value = tracking[i];
    if (Number.isFinite(value)) cap.style.setProperty(`--${name}-tracking`, `${Math.max(0, Math.min(.6, value))}em`);
    else cap.style.removeProperty(`--${name}-tracking`);
  }
  cap.style.fontFamily = `"${fontName(font)}", Georgia, serif`;
  cap.dataset.font = font;
  const fitted = applyCaptionFit(cap, cfg.caption, cfg.textLayers);
  const signature = `${font}:${sizes.join(":")}:${tracking.join(":")}:${fitted.join(":")}`;
  const changed = cap.dataset.fontSignature !== signature;
  cap.dataset.fontSignature = signature;
  const needed = activeFontIds(cfg);
  if (needed.some(id => !isContourFontLoaded(id))) {
    ensureContourFont(needed).then(loaded => {
      if (loaded) {
        refreshContours(cfg.typography?.font || "cormorant-garamond");
        if (!recording) runtime.renderAt(runtime.time, 1 / OUTPUT.fps);
      }
    }).catch(() => {});
  }
  if (textChanged || changed || force || !cap.classList.contains("contours-ready")) refreshContours(font);
}
applyTypography();

const adapters = { waiting: LogoScene, brand: BrandScene,
  "partners": PartnersScene, "photo-pause": PhotoPauseScene, finale: FinaleScene,
  // Заставки спонсоров — один класс, знак берётся из своего конфига.
  "sponsor-promrukav": SponsorScene, "sponsor-keaz": SponsorScene,
  // Кинематографичные лаборатории proto-2 и proto-5
  [LAB2_ID]: Lab2Scene, [LAB2_BRAND_ID]: Lab2BrandScene, [LAB2_OUTRO_ID]: Lab2OutroScene, [LAB5_ID]: Lab5Scene };
let scene = new adapters[sceneId](canvas, cfg);
// Пресет качества запоминаем между запусками: на площадке важно не искать его
// заново. Значение по умолчанию — полный кадр превью.
scene.setQuality(loadQuality());
// Вариант доставки (кодек и глубина) — решение человека, не браузера: он
// влияет на то, что площадка сможет открыть. По умолчанию H.264.
let delivery = loadDelivery();
// Программа показывается по кругу; экспорт — всегда один ролик, тот, что открыт.
let runtime = new AnimationRuntime(scene, cfg, OUTPUT.fps);
scene.setCaptionSource(captionSourceFor(sceneId));
layoutStage(canvas, document.getElementById("caption"));
applyTypography(true); // теперь известны реальные размеры рамки после resize сцены
/**
 * Панели студии: слева — слои, справа — настройки выбранного слоя.
 *
 * Обе панели читают один и тот же набор разделов схемы и пишут правки одним
 * путём (`onCommand` → `commitSceneConfig`). Поэтому ползунок в инспекторе,
 * глаз в списке слоёв и быстрые команды раздела не могут разойтись: они
 * меняют одну и ту же запись конфига и пересобирают кадр одинаково.
 */
const sectionsFor = (id) => SCHEMA.filter((section) => {
  if (!sectionAllowed(id, section.id, labSectionAllowed)) return false;
  const holder = configFor(id)[section.id];
  if (!holder) return false;
  // У «Фотопаузы» нет надписей: раздел существует, но в этой сцене пуст.
  if (section.id === "caption" && id === "photo-pause") return false;
  return true;
}).map((section) => ({
  ...section,
  title: section.title,
  // Скрытые для сцены поля убираем здесь, чтобы список слоёв и инспектор
  // показывали ровно одно и то же.
  fields: section.fields.filter((field) => !fieldHidden(id, section.id, field)).map((field) => ({
    ...field,
    label: fieldLabel(id, section.id, field),
  })),
}));

panels = createStudioPanels({
  getState: () => ({
    sceneId,
    sceneLabel: sceneNav(sceneId)?.label || sceneId,
    scenes: SCENE_NAV.map((scene) => ({ id: scene.id, code: scene.code, label: scene.label, title: scene.title })),
    sections: sectionsFor(sceneId),
    config: configFor(sceneId),
    defaults: sceneById(sceneId).defaults,
  }),
  onSwitchScene: (id) => switchScene(id),
  onToast: (message, isError) => toast(message, isError),
  onSelect: () => {},
  onClosed: () => {},
  // Кадр и запись: те же данные и тот же путь применения, что были у прежней
  // панели ⚙, поэтому фактические значения и подписи не расходятся.
  getFrameSettings: () => ({ master: masterId(), quality: scene.quality, delivery }),
  onFrameSetting: (id, value) => {
    if (id === "master") return applyMaster(value);
    if (id === "quality") return applyQuality(value);
    if (id === "delivery") return applyDelivery(value);
    return false;
  },
  onPauseToggle: () => { cfg.playback.paused = !cfg.playback.paused; saveScene(); },
  onExportVideo: () => startRecording(),
  getProjectJSON: () => projectToJSON(
    Object.fromEntries(READY_IDS.map((id) => [id, configFor(id)])), READY_IDS),
  onApplyScene: (id, next) => applySceneConfig(id, next),
  onApplyProject: (scenes) => {
    for (const [id, next] of Object.entries(scenes)) applySceneConfig(id, next);
    panels.rebuild();
  },
  configToJSON,
  parseConfigJSON,
  parseProjectJSON,
  isProjectPayload,
  cloneDefaults: cloneSchemaDefaults,
  saveSceneSnapshot,
  loadSceneSnapshot,
  hasSceneSnapshot,
  encodeConfigShareHash,
  // Сброс к стандартным: поле, раздел, отдельный эффект и вся сцена.
  onReset: (scope) => resetSceneConfig(sceneId, scope),
  // Порядок слоёв по глубине: список один для всех ролей программы.
  depthOrder,
  depthOrderStep,
  depthOrderReset,
  // В стеке эффектов каждая строка — отдельный эффект со своим сбросом.
  effectKeys: { fxStack: EFFECT_KEYS },
  onCommand: (section, key, value, options) => {
    // Порядок слоёв по глубине — настройка сцены, но не раздел схемы: он
    // кладётся в собственный раздел конфига и сцену не перестраивает.
    if (section === "depthOrder") {
      commitSceneConfig(sceneId, (config) => {
        config.depthOrder = { ...(config.depthOrder || {}), [key]: value };
        // Ручной режим включается первой же стрелкой и выключается сбросом.
        if (key === "enabled" && value !== true) config.depthOrder.enabled = false;
      });
      return;
    }
    // Одна точка входа на все правки из панелей. Живой жест (ползунок, цвет)
    // пересобирает кадр без записи в localStorage и без перестройки разметки:
    // иначе поле теряло фокус на каждом кадре.
    commitSceneConfig(sceneId, (config) => {
      const holder = config[section];
      if (!holder) return;
      holder[key] = value;
      if (section === "fxStack" && key === "look") applyFxPreset(config.fxStack, config.fxStack.look);
    }, { live: Boolean(options?.live) });
  },
});

/**
 * Верхняя строка студии: ролик по центру. Список — часть хрома, а не плеера,
 * поэтому переключение блокируется только записью и переходом.
 */
const clipSwitcher = createClipSwitcher({
  onSwitch: (id) => {
    if (id === sceneId) return true;
    return switchScene(id);
  },
  canSwitch: () => !recording && !transition,
});
clipSwitcher.sync(sceneId);

window.addEventListener("resize", () => { layoutStage(canvas, document.getElementById("caption")); applyTypography(true); });


let last = performance.now();
// Возврат из фоновой вкладки не должен перематывать анимацию на минуты вперёд.
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && !recording) last = performance.now();
});
let recording = null; // один цикл текущей сцены, переключение на время записи заблокировано
operator = createOperatorControls({
  getState: () => ({ id: sceneId, time: runtime.time, config: cfg, cycle: runtime.cycle,
    recording: !!recording, master: masterId(), quality: scene.quality,
    // Длину ролика задаёт он сам (фильм лаборатории), а не пульт.
    ownDuration: !!scene.holdsOwnDuration?.(),
    delivery, media: scene.mediaStatus?.() || null }),
  seek: (value) => { cfg.playback.paused = true; runtime.renderAt(value, 1 / OUTPUT.fps); },
  // Фазы ролика: вход, удержание, уход. Пульт присылает уже посчитанный
  // таймлайн (phaseChange/boundaryChange) — и от цифры, и от метки, поэтому
  // сохранить и перерисовать кадр нужно ровно здесь, в одном месте.
  setPhase: (next) => {
    if (recording || transition) return false;
    // Удержание у ролика, который живёт своим фильмом, сначала надо отвязать от
    // длины фильма — иначе сцена вернёт старое значение следующим же кадром.
    if (Math.abs(next.holdDuration - cfg.timeline.holdDuration) > 1e-9) scene.overrideDuration?.(next.holdDuration);
    Object.assign(cfg.timeline, next);
    saveScene();
    panels.refresh();
    // Кадр пересобирается сразу: длительности фаз — монтажное решение, его
    // надо видеть. Время подрезается, чтобы не остаться за концом цикла.
    runtime.renderAt(Math.min(runtime.time, cfg.timeline.startDelay + runtime.cycle - 1 / OUTPUT.fps));
    return true;
  },
  setDuration: (value) => {
    if (recording || transition) return false;
    // Цикл меняется только удержанием: вход и уход остаются как настроены,
    // иначе правка одного числа незаметно переписывала бы два других.
    const tl = cfg.timeline;
    const fixed = runtime.cycle - tl.holdDuration;
    const next = Math.max(MIN_HOLD, Math.min(MAX_CYCLE - fixed, value - fixed));
    scene.overrideDuration?.(next);
    tl.holdDuration = next;
    saveScene();
    panels.refresh();
    runtime.renderAt(Math.min(runtime.time, tl.startDelay + runtime.cycle - 1 / OUTPUT.fps));
  },
  togglePause: () => {
    cfg.playback.paused = !cfg.playback.paused;
    saveScene();
    panels.refresh();
  },
  setMaster: (id) => applyMaster(id),
  setQuality: (id) => {
    if (recording || transition) { toast("Во время записи или перехода качество менять нельзя", true); return false; }
    scene.setQuality(id);
    saveQuality(scene.quality);
    runtime.renderAt(runtime.time, 1 / OUTPUT.fps);
    operator.refresh();
    return true;
  },
  setDelivery: (id) => {
    if (recording || transition) { toast("Во время записи или перехода вариант файла менять нельзя", true); return false; }
    if (delivery === id) return true;
    if (!saveDelivery(id)) return false;
    delivery = id;
    operator.refresh();
    return true;
  },
});

/**
 * Автоматическая раскладка кадра: сцена и титр стоят по центру окна.
 *
 * Раньше это считал модуль старого покадрового редактора: он же обрезал
 * предпросмотр под его панели. Редактора больше нет — правки идут в реальном
 * времени через панели студии, — поэтому осталась только сама раскладка.
 */
function layoutStage(canvasEl, captionEl) {
  const width = Math.min(innerWidth, innerHeight * 16 / 9);
  const height = width * 9 / 16;
  for (const el of [canvasEl, captionEl]) {
    if (!el) continue;
    el.style.left = "50%";
    el.style.top = "50%";
    el.style.width = `${Math.round(width)}px`;
    el.style.height = `${Math.round(height)}px`;
    el.style.clipPath = "";
  }
  if (captionEl) captionEl.style.setProperty("--u", `${width / 100}px`);
}

// Размер мастер-кадра. Композитор титров и экспорт читают его же, а не OUTPUT.
let REC_W = masterSize().width, REC_H = masterSize().height;
function syncMasterSize() {
  const size = masterSize();
  REC_W = size.width; REC_H = size.height;
}

// Титр рисуется внутри сцены (см. CaptionLayer), поэтому композит — это кадр
// WebGL целиком: превью и экспорт совпадают пиксель в пиксель.
function captionSourceFor(id) {
  return () => {
    // «Спонсоры» и заставки спонсоров собирают текст в кадре: DOM-титра нет.
    if (id === "partners" || id.startsWith("sponsor-") || isLabScene(id) || !document.getElementById("caption")) return null;
    return { sceneId: id, alpha: 1 };
  };
}

function drawCompositeFrame(ctx) {
  ctx.drawImage(canvas, 0, 0, ctx.canvas.width, ctx.canvas.height);
}

// Переход в предпросмотре — прозрачный оверлей поверх кадра нового вида.
// Показ считается тем же drawOutgoingFrame, что и экспорт: CSS-растворение
// гасило всё содержимое разом и давало серую муть, а кроме того расход
// времени в CSS и в кадрах видео не совпадал.
let previewTransition = null;
let transitionOverlay = null;
// Оверлей обязан вставать ровно на кадр сцены: те же left/top/размер/обрезка,
// что у #stage. Иначе на изменённом масштабе переход «съезжает» с кадра.
function syncTransitionOverlay() {
  if (!transitionOverlay) return;
  const to = transitionOverlay.style;
  const from = canvas.style;
  if (to.left !== from.left) to.left = from.left;
  if (to.top !== from.top) to.top = from.top;
  if (to.width !== from.width) to.width = from.width;
  if (to.height !== from.height) to.height = from.height;
  if (to.clipPath !== from.clipPath) to.clipPath = from.clipPath;
}
function overlayCtx() {
  return transitionOverlay ? transitionOverlay.getContext("2d") : null;
}
function drawPreviewTransition(ctx) {
  if (!ctx) return;
  if (!previewTransition) return;
  syncTransitionOverlay();
  const elapsed = (performance.now() - previewTransition.startedAt) / 1000;
  const done = elapsed / previewTransition.duration >= 1;
  if (done || !drawOutgoingFrame(ctx, previewTransition.snapshot, elapsed * OUTPUT.fps,
    OUTPUT.fps, previewTransition.duration, ctx.canvas.width, ctx.canvas.height)) {
    previewTransition = null;
    transition = null;
    if (transitionOverlay) { transitionOverlay.hidden = true; transitionOverlay.style.display = "none"; }
  }
}

/** Тот же композит, что записывается в видео; includeCaption=false — эталон для теста. */
function compositeFrameAt(time, dt = 1 / OUTPUT.fps, includeCaption = true) {
  scene.setCaptionVisible(includeCaption);
  try {
    runtime.renderAt(time, dt);
    const frame = document.createElement("canvas");
    frame.width = REC_W; frame.height = REC_H;
    const frameCtx = frame.getContext("2d");
    drawCompositeFrame(frameCtx);
    fxApplyToContext(frameCtx, time, cfg);
    return frame;
  } finally {
    scene.setCaptionVisible(true);
  }
}

// Склейка без перезагрузки: последний композит старого вида (WebGL + DOM-титры)
// мягко растворяется поверх первого кадра нового. Запись одного цикла не
// прерывается случайным переключением, а пульт не попадает в экспорт.
let transition = null;
function switchScene(id) {
  id = sceneById(id)?.id || id;
  if (id === sceneId) return true;
  // Во время записи ролик не меняется: файл — это один ролик.
  if (!adapters[id] || transition || recording) return false;
  const nextCfg = configFor(id);
  const nextCanvas = document.createElement("canvas");
  nextCanvas.setAttribute("aria-label", "Анимация логотипа");
  let nextScene;
  try {
    nextScene = new adapters[id](nextCanvas, nextCfg);
  } catch (error) {
    toast(`Не удалось открыть сцену: ${error.message}`, true);
    return false;
  }
  const duration = transitionDuration(nextCfg);
  let snapshot = null;
  if (duration > 0) {
    // Тот же композит, что уходит в видео, и уже с титром: иначе на переходе
    // подпись старой сцены исчезала бы раньше картинки.
    snapshot = compositeFrameAt(runtime.time, 1 / OUTPUT.fps, true);
  }
  const oldCanvas = canvas;
  const oldScene = scene;
  nextCanvas.id = "stage";
  oldCanvas.replaceWith(nextCanvas);
  canvas = nextCanvas;
  sceneId = id;
  activeScene = sceneById(id);
  cfg = nextCfg;
  scene = nextScene;
  runtime = new AnimationRuntime(scene, cfg, OUTPUT.fps);
  scene.setCaptionSource(captionSourceFor(id));
  activateClasses(id);
  layoutStage(canvas, document.getElementById("caption"));
  applyTypography(true);
  runtime.renderAt(cfg.timeline.startDelay, 1 / OUTPUT.fps);
  oldScene.dispose();
  // Панели остаются открытыми и переключаются на слои новой сцены.
  panels.syncScene();
  clipSwitcher.sync(id);
  const url = new URL(location.href);
  // Пишем настоящий id: ?scene=intro открывает новое интро (лабораторию 10),
  // поэтому архивную сцену нельзя записывать этим адресом.
  url.searchParams.set("scene", id);
  history.replaceState(null, "", url);
  if (snapshot) {
    // Оверлей живёт до конца перехода; снимает его сам цикл кадров.
    transition = snapshot;
    if (!transitionOverlay) {
      transitionOverlay = document.createElement("canvas");
      transitionOverlay.className = "transition-overlay";
      transitionOverlay.width = REC_W; transitionOverlay.height = REC_H;
      document.body.appendChild(transitionOverlay);
    }
    if (transitionOverlay.width !== REC_W || transitionOverlay.height !== REC_H) {
      transitionOverlay.width = REC_W; transitionOverlay.height = REC_H;
    }
    transitionOverlay.hidden = false;
    transitionOverlay.style.display = "block";
    syncTransitionOverlay();
    previewTransition = { snapshot, duration, startedAt: performance.now() };
    // Первый кадр перехода рисуем сразу: иначе до следующего тика цикла на
    // экране виден чистый оверлей (прозрачный) и переход «моргает».
    drawPreviewTransition(overlayCtx());
  }
  operator.refresh();
  return true;
}

/**
 * Качество просмотра. Влияет только на сглаживание и дизеринг кадра, поэтому
 * запрещено лишь на время записи и перехода — иначе кадр в файле разъедется.
 */
function applyQuality(id) {
  if (recording || transition) return false;
  scene.setQuality(id);
  saveQuality(scene.quality);
  runtime.renderAt(runtime.time, 1 / OUTPUT.fps);
  return true;
}

/** Кодек и глубина записи: решение человека, оно влияет на совместимость файла. */
function applyDelivery(id) {
  if (recording || transition) return false;
  if (delivery === id) return true;
  if (!saveDelivery(id)) return false;
  delivery = id;
  return true;
}

/**
 * Переключение мастер-разрешения. Композиция задана в долях кадра, поэтому
 * меняется только пиксельная сетка: рендерер, композитор, титры и экспорт.
 */
function applyMaster(id) {
  if (recording || transition) { toast("Во время записи или перехода формат менять нельзя", true); return false; }
  if (!setMasterPreset(id)) return false;
  syncMasterSize();
  scene.resize();
  applyTypography(true);
  runtime.renderAt(runtime.time, 1 / OUTPUT.fps);
  return true;
}

// The export owns the renderer until it has completed or has been cancelled.
function exportOverlay(job, estimatedMiB) {
  const overlay = document.createElement("div");
  overlay.className = "export-overlay";
  overlay.innerHTML = '<div class="export-dialog" role="status" aria-live="polite"><strong>Покадровый экспорт</strong><p>Подготовка…</p><small></small><progress max="100" value="0"></progress><button type="button">Отменить</button></div>';
  const inert = [...document.body.children].filter(el => el !== canvas && el.id !== "caption" && el.id !== "toast").map(el => [el, el.inert]);
  for (const [el] of inert) el.inert = true;
  document.body.appendChild(overlay);
  overlay.querySelector("small").textContent = `Ориентировочный размер MP4: ${estimatedMiB} МиБ. Памяти браузеру потребуется больше; фактический размер может отличаться.`;
  const button = overlay.querySelector("button");
  button.addEventListener("click", () => { job.cancelled = true; button.disabled = true; button.textContent = "Отмена…"; });
  const blockKeys = event => { if (event.key !== "Tab") event.stopImmediatePropagation(); };
  window.addEventListener("keydown", blockKeys, true);
  button.focus();
  return {
    progress(done, total) {
      const percent = Math.floor(done * 100 / total);
      overlay.querySelector("p").textContent = `Кадр ${done} из ${total} · ${percent}%`;
      overlay.querySelector("progress").value = percent;
    },
    remove() {
      window.removeEventListener("keydown", blockKeys, true);
      for (const [el, previous] of inert) el.inert = previous;
      overlay.remove();
    },
  };
}
function saveVideo(blob, filename) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob); link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 60000);
}
/**
 * Записать открытый ролик. Цепочной записи («Все ролики», «Состав») больше
 * нет: файл — это один ролик, и его имя совпадает с тем, что человек видит
 * сверху. Цепочка нужна была для показа программы одним файлом, но монтаж
 * между роликами делается сборкой готовых файлов, а не повторной записью.
 */
function startRecording({ download = true } = {}) {
  return startOfflineRecording(download);
}
function startOfflineRecording(download) {
  if (recording || transition) return false;
  let estimatedMiB;
  try {
    const timeline = cfg.timeline;
    const frames = frameCount(cycleDuration(timeline), timeline.speed, OUTPUT.fps);
    const bitrate = deliveryOptionLight(delivery).bitrateScale * videoBitrateFor(REC_W, REC_H);
    estimatedMiB = Math.ceil(estimateVideoBytes(frames, OUTPUT.fps, bitrate) / 1024 ** 2);
  } catch (error) { toast(`Ошибка экспорта: ${error.message}`, true); return false; }
  if (download && estimatedMiB >= 256 && !confirm(`Ориентировочный размер MP4 — ${estimatedMiB} МиБ. Видео собирается в памяти браузера; потребуется больше памяти, а итоговый размер может отличаться. Продолжить?`)) return false;
  const job = { cancelled: false, outgoing: null };
  recording = job;
  const overlay = exportOverlay(job, estimatedMiB);
  // Кнопка в верхней строке показывает, что запись идёт: пульт больше не
  // отвечает за экспорт и не может служить индикатором.
  panels?.setExportState?.({ busy: true, label: `Запись «${sceneNav(sceneId)?.label || sceneId}»` });
  operator.refresh();
  runOfflineRecording(job, overlay, download).catch(error => console.error("Ошибка экспорта", error));
  return true;
}
async function runOfflineRecording(job, overlay, download) {
  const initialTime = runtime.time;
  const initialScene = sceneId;
  let completed = false;
  // Метаданные доставки берём из лёгкого модуля: тяжёлый delivery.js тянет
  // mediabunny и приходит вместе с кодировщиком ниже. Прямая ссылка на
  // deliveryOption осталась здесь с переезда кодировщика вне критического
  // пути и роняла экспорт ReferenceError ещё на «Подготовке…».
  const option = deliveryOptionLight(delivery);
  const stats = { scenes: [], transitions: [], frames: 0, blendedFrames: 0,
    resolution: [REC_W, REC_H], delivery: option.id, bitDepth: option.bitDepth,
    mime: option.container === "webm" ? "video/webm" : "video/mp4" };
  window.__recStats = stats; window.__lastVideoBlob = null;
  try {
    const ids = [sceneId];
    const exportFonts = [...new Set(activeFontIds(cfg))];
    await Promise.all([
      fabricReady,
      partnersReady,
      ensureContourFont(exportFonts),
      sceneId === "partners" ? preloadPartnerCustomLogos(cfg.partners)
        : sceneId.startsWith("sponsor-") ? preloadPartnerCustomLogos({ partner1Logo: cfg.sponsor.markLogo, logoStyle: cfg.sponsor.logoStyle }) : null,
    ]); // ассеты не меняются в середине записи
    const segments = [{
      id: sceneId,
      start: cfg.timeline.startDelay,
      speed: cfg.timeline.speed,
      transition: transitionDuration(cfg),
      count: frameCount(cycleDuration(cfg.timeline), cfg.timeline.speed, OUTPUT.fps),
    }];
    const total = segments[0].count;
    const videoCanvas = document.createElement("canvas");
    videoCanvas.width = REC_W; videoCanvas.height = REC_H;
    // 10 бит требуют чтения пикселей в JS: без willReadFrequently каждый кадр
    // заставляет браузер выгружать полотно с GPU, и запись идёт в разы дольше.
    const ctx = videoCanvas.getContext("2d", option.bitDepth === 10 ? { willReadFrequently: true } : undefined);
    if (!ctx) throw new Error("Не удалось создать кадр для экспорта");
    let blurCanvas = null, blurCtx = null;
    let segmentIndex = -1, segmentStart = 0;
    const { encodeOfflineVideo } = await import("./offline-video.js");
    const result = await encodeOfflineVideo({canvas:videoCanvas, fps:OUTPUT.fps, total,
      bitrate:videoBitrateFor(REC_W, REC_H), delivery:option.id,
      cancelled:() => job.cancelled,
      progress:(done, count) => overlay.progress(done, count),
      async draw(index) {
        if (segmentIndex < 0) {
          segmentIndex = 0;
          stats.scenes.push(segments[0].id);
          // Первый кадр ждёт готовности сцены (шрифты, текстуры), иначе
          // запись начинается с пустой картинки.
          await scene.whenReady?.();
        }
        const segment = segments[segmentIndex];
        const localIndex = index - segmentStart;
        const frameTime = segment.start + localIndex * segment.speed / OUTPUT.fps;
        // Затвор: только вращение кольцевой надписи в «Фотопаузе». Один кадр —
        // один рендер в остальных сценах, поэтому стоимость не меняется.
        const shutter = photoShutterSamples(configFor(segment.id), { id: segment.id, fps: OUTPUT.fps, speed: segment.speed });
        if (shutter <= 1) {
          await scene.prepareFrame?.(frameTime);
          runtime.renderAt(frameTime, 1 / OUTPUT.fps);
          drawCompositeFrame(ctx);
          fxApplyToContext(ctx, frameTime, configFor(segment.id));
        } else {
          const times = shutterTimes(frameTime, segment.speed / OUTPUT.fps, shutter);
          if (!blurCanvas || blurCanvas.width !== REC_W || blurCanvas.height !== REC_H) {
            blurCanvas = document.createElement("canvas");
            blurCanvas.width = REC_W; blurCanvas.height = REC_H;
            blurCtx = blurCanvas.getContext("2d");
          }
          ctx.clearRect(0, 0, REC_W, REC_H);
          for (let s = 0; s < times.length; s++) {
            runtime.renderAt(times[s], 1 / OUTPUT.fps);
            blurCtx.clearRect(0, 0, REC_W, REC_H);
            blurCtx.drawImage(canvas, 0, 0, REC_W, REC_H);
            ctx.globalAlpha = 1 / (s + 1);
            ctx.drawImage(blurCanvas, 0, 0);
          }
          // Возвращаем время кадра: дальше по циклу время считается заново, но
          // пауза/переходы не должны увидеть последнюю выборку затвора.
          runtime.renderAt(frameTime, 1 / OUTPUT.fps);
          ctx.globalAlpha = 1;
          fxApplyToContext(ctx, frameTime, configFor(segment.id));
        }
        if (job.outgoing) {
          if (!drawOutgoingFrame(ctx, job.outgoing, localIndex, OUTPUT.fps, segment.transition, REC_W, REC_H)) job.outgoing = null;
          else {
            stats.blendedFrames++; stats.transitions.at(-1).blendedFrames++;
          }
        }
        stats.frames++;
      },
    });
    stats.bytes = result.blob.size; stats.codec = result.codec; stats.expectedFrames = total;
    window.__lastVideoBlob = result.blob;
    completed = true;
    // Формат называем честно: WebM не откроется там, где ждут MP4.
    const name = option.container === "webm" ? `${option.bitDepth}-битный WebM` : `${option.bitDepth}-битный MP4`;
    if (download) {
      // Имя файла берёт фактический размер записи: 4K-мастер не должен
      // сохраняться как «1920x1080».
      const filename = deliveryFilename(
        initialScene, option, REC_W, REC_H);
      // Готовое видео открывается поверх всего кадра: посмотреть, сохранить
      // кнопкой с этим именем или через «Сохранить видео как…», развернуть
      // на весь экран, закрыть Esc. Молчаливое скачивание убрано: файл было
      // не найти, а результат — не проверить.
      const { openExportViewer } = await import("./export-viewer.js");
      openExportViewer({
        blob: result.blob,
        filename,
        meta: `${REC_W}×${REC_H} · ${OUTPUT.fps} fps · ${stats.frames} кадров · ${(result.blob.size / 1048576).toFixed(1)} МиБ · ${name}`,
        onDownload: () => saveVideo(result.blob, filename),
      });
      toast(`Видео готово (${name}) — просмотр и сохранение`);
    } else {
      toast(`Видео готово (${name})`);
    }
  } catch (error) {
    stats.error = error.message;
    toast(error.name === "AbortError" ? "Экспорт отменён" : `Ошибка экспорта: ${error.message}`, error.name !== "AbortError");
    if (error.name !== "AbortError") console.error("Ошибка экспорта", error);
  } finally {
    recording = null;
    try {
      // Возвращаем кадр на место: запись уводила время к концу ролика.
      if (!completed) runtime.renderAt(initialTime, 1 / OUTPUT.fps);
    } finally {
      last = performance.now();
      overlay.remove();
      panels?.setExportState?.({ busy: false });
      panels.refresh(); operator.refresh();
    }
  }
}

/** Следующий готовый ролик в порядке программы — для режима «Авто». */
function nextSceneId(id) {
  const list = SCENE_NAV.filter((scene) => !scene.archived).map((scene) => scene.id);
  const at = list.indexOf(id);
  return list[(at + 1) % list.length] || id;
}

// ── Общий набор эффектов (src/fx-stack.js) ─────────────────────────────────
// Один и тот же расчёт идёт и в предпросмотре (слой над сценой), и в покадровом
// экспорте (поверх готового композита), поэтому видео совпадает с экраном.
const fx = new FxStack();
let fxOverlay = null;
function fxSpan(config) {
  const tl = config.timeline;
  const start = tl.startDelay || 0;
  return { start, end: start + cycleDuration(tl) };
}
function fxHide() { if (fxOverlay) fxOverlay.style.display = "none"; }
function fxPreview(rt, time) {
  const section = rt.config.fxStack;
  if (recording || !fxActive(section)) { fxHide(); return; }
  let out = null;
  try { out = fx.render(canvas, time, section, fxSpan(rt.config)); } catch (error) { console.warn("Эффекты: кадр не построен", error); }
  if (!out) { fxHide(); return; }
  if (!fxOverlay) {
    fxOverlay = out;
    out.className = "transition-overlay fx-overlay";
    out.setAttribute("aria-hidden", "true");
    out.style.zIndex = "11";
    document.body.appendChild(out);
  }
  const to = out.style, from = canvas.style;
  to.display = "block";
  // Слой встаёт ровно на кадр сцены: те же положение, размер и обрезка.
  if (to.left !== from.left) to.left = from.left;
  if (to.top !== from.top) to.top = from.top;
  if (to.width !== from.width) to.width = from.width;
  if (to.height !== from.height) to.height = from.height;
  if (to.clipPath !== from.clipPath) to.clipPath = from.clipPath;
}
/** Наложить эффекты на готовый кадр (экспорт и снимок для перехода). */
function fxApplyToContext(ctx, time, config) {
  const section = config?.fxStack;
  if (!fxActive(section)) return;
  const out = fx.render(ctx.canvas, time, section, fxSpan(config));
  if (!out) return;
  ctx.globalAlpha = 1;
  ctx.drawImage(out, 0, 0, ctx.canvas.width, ctx.canvas.height);
}
setRenderHook(fxPreview);

let firstFrameRendered = false;
let lastOperatorRefresh = 0;
function frame(now) {
  const elapsed = Math.max(0, (now - last) / 1000);
  const renderDt = Math.min(0.05, elapsed);
  last = now;
  const before = runtime.time;
  if (!recording) {
    // На паузе сцена уже перерисовывается при seek и изменении настроек.
    // Во время воспроизведения удержание спонсоров больше не перезагружает
    // большой Canvas каждый кадр, поэтому рендерим с частотой дисплея.
    if ((sceneId !== "partners" && !sceneId.startsWith("sponsor-")) || !cfg.playback.paused) runtime.advance(elapsed, renderDt);
    if (previewTransition) drawPreviewTransition(overlayCtx());
    if (operator.auto && !cfg.playback.paused && !transition &&
        crossedBoundary(before, runtime.time, cfg.timeline.startDelay, runtime.cycle)) {
      switchScene(nextSceneId(sceneId));
    }
  }
  // Не снимаем заставку загрузки до реального WebGL-кадра и готовых шрифтов.
  // Это также защищает титр от вспышки системного шрифта при медленном запуске.
  if (!firstFrameRendered) {
    firstFrameRendered = true;
    const initialFonts = [...new Set(READY_IDS.flatMap(id => activeFontIds(configFor(id))))];
    const fonts = Promise.all([loadFonts(), loadContourFonts(contourSources, parseFont, initialFonts)]).catch((error) => console.warn("Не удалось загрузить контуры шрифтов", error));
    Promise.all([fonts, fabricReady, partnersReady]).then(([, fabricLoaded, partnersLoaded]) => {
      applyTypography(true); scene.refreshTextTexture?.();
      if (!recording) runtime.renderAt(runtime.time, 1 / OUTPUT.fps);
      window.__bootReady?.();
      if (!partnersLoaded && sceneId === "partners") toast("Не все изображения спонсоров загрузились; возможны текстовые замены", true);
      if (!fabricLoaded) toast("Текстура камня не загрузилась; используется упрощённый фон", true);
      // Остальные шрифты подгружаем в простое, чтобы переключение в настройках было мгновенным.
      const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 250));
      idle(() => ensureContourFont(Object.keys(contourSources)).catch(() => {}));
    });
  }
  if (now - lastOperatorRefresh >= 120) {
    operator.refresh();
    lastOperatorRefresh = now;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// для отладки из консоли: window.__logo.setTime(7.5)
window.__logo = {
  get time() { return runtime.time; },
  setTime(v) { runtime.time = v; },
  renderAt(v, dt = 1 / OUTPUT.fps) { runtime.renderAt(v, dt); },
  compositeFrameAt,
  startRecording,
  getSceneConfig: configFor,
  saveScene,
  panels, // технический API тестов: панели слоёв и настроек
  settings: panels, // прежнее имя: тесты и редактор зовут панель настроек
  switchScene,
  operator,
  get activeScene() { return activeScene; },
  get runtime() { return runtime; },
  get cfg() { return cfg; },
  get scene() { return scene; },
};
