import * as THREE from 'three';
import backgroundUrl from './assets/partners/bg.jpg';
import curtainUrl from './assets/partners/shtora.png';
import proelectroUrl from './assets/partners/proelectro.svg';
import proelectroschitUrl from './assets/partners/proelectroschit.svg';
import promrukavUrl from './assets/partners/promrukav.svg';
import keazUrl from './assets/partners/keaz.svg';
import { drawPartnersDecor, drawAmberAtmosphere, drawBreathingBackground } from './partners-graphics.js';
import { elementVisibility, labelLineLayout } from './partners-elements.js';
import { partnerLogoSize, visibleLogoBounds } from './partner-logo-layout.js';
import { createPartnersOrnamentLayer } from './partners-ornament-layer.js';
import { createPartnersCurtains } from './partners-curtains.js';
import { createPartnersLight } from './partners-light.js';
import { createPartnersGlitter } from './partners-glitter.js';
import { createPartnersFrameGlint } from './partners-frame-glint.js';
import { partnersStageCues, partnersHoldCacheKey, PARTNERS_MARK_LAYOUT } from './partners-stage.js';
import introLogoSvg from './lab2/logo.svg?raw';
import { introOutlineSvg } from './partners-stage.js';
import { glintSpan, easeOutBack } from './partners-motion.js';
import { computePhase } from './timeline.js';
import { BASE_FRAME } from './scenes/catalog.js';
import { masterSize, masterId } from './output-profile.js';
import { DEFAULT_QUALITY, isQualityPreset, suggestedQuality } from './quality-presets.js';
import { PARTNERS_DEFAULTS } from './scenes/partners.js';

const loadImage = url => new Promise(resolve => {
  if (!url) { resolve(null); return; }
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => resolve(null);
  image.src = url;
});

let backgroundCanvas, curtainImage, introOutlineImage;
let assetsRevision = 0;
const builtinMarks = {};
/** Исходные изображения встроенных логотипов: нужны, чтобы доделать второй стиль. */
const builtinMarkSource = {};
/** Активный стиль тиснения: его же читает сцена при отрисовке. */
function activeLogoStyle() {
  return partnersLogoStyle === 'original' ? 'original' : 'gold';
}
let partnersLogoStyle = 'gold';

/** Логотип нужного стиля; второй вариант готовится один раз при первом запросе. */
function builtinMark(key, style) {
  const ready = builtinMarks[key];
  if (!ready) return null;
  if (ready[style]) return ready[style];
  const source = builtinMarkSource[key];
  if (!source) return null;
  ready[style] = renderPartnerMark(source, style);
  return ready[style];
}

/** Сцена сообщает стиль заранее, чтобы первый кадр не платил за подготовку. */
export function setPartnersLogoStyle(style) {
  partnersLogoStyle = style === 'original' ? 'original' : 'gold';
  for (const key of Object.keys(builtinMarks)) {
    if (builtinMarkSource[key] && !builtinMarks[key][partnersLogoStyle]) {
      builtinMarks[key][partnersLogoStyle] = renderPartnerMark(builtinMarkSource[key], partnersLogoStyle);
    }
  }
}

// Размер промежуточной текстуры ограничен, чтобы не держать лишние пиксели;
// в общей заставке видимая ширина выравнивается после удаления прозрачных полей.
// Буфер для блика по золоту: пересобирается в размер знака, поэтому создаётся
// один раз, а не на каждый кадр (в кадре до четырёх знаков).
let glintBuffer = null;
function glintCanvas() {
  if (!glintBuffer) glintBuffer = document.createElement('canvas');
  return glintBuffer;
}

/**
 * Блик, проходящий по золоту знака. Рисуется на копии знака: маска из
 * источника оставляет блеск только на самом рисунке, поэтому полоса не
 * вылезает на фон и не требует знания контура.
 * @param {CanvasRenderingContext2D} ctx @param {HTMLCanvasElement} logo
 * @param {number} x @param {number} y @param {number} w @param {number} h
 * @param {number|null} span доля ширины, где сейчас полоса (см. glintSpan)
 * @param {number} alpha
 */
export function drawMarkGlint(ctx, logo, x, y, w, h, span, alpha) {
  if (span == null || alpha <= 0.002) return;
  const buffer = glintCanvas();
  if (buffer.width !== logo.width || buffer.height !== logo.height) {
    buffer.width = logo.width; buffer.height = logo.height;
  }
  const bctx = buffer.getContext('2d');
  bctx.setTransform(1, 0, 0, 1, 0, 0);
  bctx.globalCompositeOperation = 'source-over';
  bctx.clearRect(0, 0, buffer.width, buffer.height);
  bctx.drawImage(logo, 0, 0);
  bctx.globalCompositeOperation = 'source-in';
  // Узкая тёплая полоса с мягкими краями: ширина ~ 18 % знака, наклон 12°.
  const bandWidth = buffer.width * 0.18;
  const center = span * buffer.width;
  const grad = bctx.createLinearGradient(center - bandWidth, 0, center + bandWidth, 0);
  grad.addColorStop(0, 'rgba(255,246,219,0)');
  grad.addColorStop(.42, 'rgba(255,250,232,.85)');
  grad.addColorStop(.5, 'rgba(255,255,246,1)');
  grad.addColorStop(.58, 'rgba(255,250,232,.85)');
  grad.addColorStop(1, 'rgba(255,246,219,0)');
  bctx.fillStyle = grad;
  bctx.fillRect(0, 0, buffer.width, buffer.height);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(buffer, x, y, w, h);
  ctx.restore();
}

// Предельный размер одного знака; масштаб не меняет пропорции.
const MARK_MAX_WIDTH = 560;
const MARK_MAX_HEIGHT = 125;
const MARK_SUPERSAMPLE = 2;

// Золотая заливка использует альфу SVG/PNG, а не прямоугольную белую плашку.
/**
 * Готовит знак к отрисовке: подгоняет под экранный размер и заливает золотом.
 *
 * Прозрачные поля удаляются отдельно при подготовке общего кадра, чтобы
 * пользовательские файлы и встроенные знаки выравнивались по видимой ширине.
 */
export function renderPartnerMark(image, style = 'gold') {
  const w = Math.max(1, image.naturalWidth || image.width || 600);
  const h = Math.max(1, image.naturalHeight || image.height || 200);
  // Целевой размер считается тем же правилом, что и при отрисовке кадра.
  const fit = Math.min(MARK_MAX_WIDTH / w, MARK_MAX_HEIGHT / h);
  const full = document.createElement('canvas');
  full.width = Math.max(1, Math.round(w * fit * MARK_SUPERSAMPLE));
  full.height = Math.max(1, Math.round(h * fit * MARK_SUPERSAMPLE));
  const fullCtx = full.getContext('2d');
  fullCtx.drawImage(image, 0, 0, full.width, full.height);
  if (style !== 'original') {
    fullCtx.globalCompositeOperation = 'source-in';
    const gold = fullCtx.createLinearGradient(0, 0, 0, full.height);
    gold.addColorStop(0, '#f8e6bd'); gold.addColorStop(.42, '#e5c48b');
    gold.addColorStop(.72, '#b88b4f'); gold.addColorStop(1, '#ebd19b');
    fullCtx.fillStyle = gold; fullCtx.fillRect(0, 0, full.width, full.height);
  }
  return full;
}

/**
 * Плотные границы непрозрачного рисунка в пределах канваса. Нужны, чтобы
 * выровнять знаки по видимому размеру и не считать блик по пустому полю.
 * Возвращает доли 0..1; при неудаче — весь канвас.
 */
export function markBounds(canvas) {
  const whole = { x: 0, y: 0, width: 1, height: 1 };
  let ctx;
  try { ctx = canvas.getContext('2d', { willReadFrequently: true }); } catch (e) { return whole; }
  if (!ctx) return whole;
  const { width, height } = canvas;
  let data;
  try { data = ctx.getImageData(0, 0, width, height).data; } catch (e) { return whole; }
  // Отсечь почти прозрачную кромку сглаживания, сохранив пропорции.
  return visibleLogoBounds(data, width, height);
}

// Прозрачные поля у присланных файлов различаются; кадрируем по видимым
// пикселям один раз, чтобы именно видимые ширины логотипов совпадали.
const trimmedMarks = new WeakMap();
function visiblePartnerMark(canvas) {
  if (trimmedMarks.has(canvas)) return trimmedMarks.get(canvas);
  const bounds = markBounds(canvas);
  const x = Math.round(bounds.x * canvas.width), y = Math.round(bounds.y * canvas.height);
  const w = Math.max(1, Math.min(canvas.width - x, Math.round(bounds.width * canvas.width)));
  const h = Math.max(1, Math.min(canvas.height - y, Math.round(bounds.height * canvas.height)));
  const result = document.createElement('canvas');
  result.width = w; result.height = h;
  result.getContext('2d').drawImage(canvas, x, y, w, h, 0, 0, w, h);
  trimmedMarks.set(canvas, result);
  return result;
}

const outlineUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(introOutlineSvg(introLogoSvg))}`;
const imageReady = Promise.all([backgroundUrl, curtainUrl, proelectroUrl, proelectroschitUrl, promrukavUrl, keazUrl, outlineUrl].map(loadImage)).then(images => {
  const [background, curtain, ...rest] = images;
  const marks = rest.slice(0, 4);
  introOutlineImage = rest[4];
  if (background) {
    // Подгонка с сохранением пропорций (центр кадра), без растяжения.
    backgroundCanvas = document.createElement('canvas');
    const w = BASE_FRAME.width, h = BASE_FRAME.height;
    backgroundCanvas.width = w; backgroundCanvas.height = h;
    const scale = Math.max(w / background.naturalWidth, h / background.naturalHeight);
    const dw = background.naturalWidth * scale, dh = background.naturalHeight * scale;
    backgroundCanvas.getContext('2d').drawImage(background, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }
  curtainImage = curtain;
  // Логотип готовится под тот стиль, который выбран в настройках; второй вариант
  // доделывается при первом обращении (см. builtinMark). Иначе на старте
  // выполнялась двойная работа и вдвое больше канвасов в памяти.
  const style = activeLogoStyle();
  ['organizer1', 'organizer2', 'partner1', 'partner2'].forEach((key, i) => {
    if (marks[i]) builtinMarkSource[key] = marks[i];
    if (marks[i]) builtinMarks[key] = { [style]: renderPartnerMark(marks[i], style) };
  });
  assetsRevision++;
  return images.every(Boolean);
});
export const loadPartnersBackground = () => imageReady;

// Красим готовый контур один раз на цвет, сохраняя мягкие края PNG/SVG.
const compassColorCache = new Map();
function coloredCompass(color) {
  if (!introOutlineImage) return null;
  const safeColor = typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color) ? color : '#e5bd7c';
  if (compassColorCache.has(safeColor)) return compassColorCache.get(safeColor);
  const canvas = document.createElement('canvas');
  canvas.width = introOutlineImage.naturalWidth || 800;
  canvas.height = introOutlineImage.naturalHeight || 840;
  const context = canvas.getContext('2d');
  context.drawImage(introOutlineImage, 0, 0, canvas.width, canvas.height);
  context.globalCompositeOperation = 'source-in';
  context.fillStyle = safeColor;
  context.fillRect(0, 0, canvas.width, canvas.height);
  if (compassColorCache.size >= 8) compassColorCache.clear();
  compassColorCache.set(safeColor, canvas);
  return canvas;
}


// Пользовательский фон приводим к тем же пропорциям, что встроенное фото.
const customBackgroundCache = new Map();
const customBackgroundPending = new Map();
export function preloadPartnersCustomBackground(section) {
  const url = section?.backgroundImage;
  if (typeof url !== 'string' || !url.startsWith('data:image/') || url.length > 4 * 1024 * 1024) return Promise.resolve(null);
  if (customBackgroundCache.has(url)) return Promise.resolve(customBackgroundCache.get(url));
  if (customBackgroundPending.has(url)) return customBackgroundPending.get(url);
  const task = loadImage(url).then(image => {
    customBackgroundPending.delete(url);
    if (!image || !image.naturalWidth || !image.naturalHeight) {
      customBackgroundCache.set(url, null);
      return null;
    }
    const canvas = document.createElement('canvas');
    const w = BASE_FRAME.width, h = BASE_FRAME.height;
    canvas.width = w; canvas.height = h;
    const scale = Math.max(w / image.naturalWidth, h / image.naturalHeight);
    const dw = image.naturalWidth * scale, dh = image.naturalHeight * scale;
    canvas.getContext('2d').drawImage(image, (w - dw) / 2, (h - dh) / 2, dw, dh);
    if (customBackgroundCache.size >= 4) customBackgroundCache.clear();
    customBackgroundCache.set(url, canvas);
    assetsRevision++;
    if ((window.__logo?.activeScene?.id === 'partners' || window.__logo?.activeScene?.id?.startsWith('sponsor-')) && window.__logo?.cfg?.playback?.paused) {
      window.__logo.renderAt(window.__logo.time);
    }
    return canvas;
  });
  customBackgroundPending.set(url, task);
  return task;
}
function selectedBackground(section) {
  const url = section?.backgroundImage;
  if (!url) return backgroundCanvas;
  const ready = customBackgroundCache.get(url);
  if (!customBackgroundCache.has(url)) preloadPartnersCustomBackground(section);
  return ready || backgroundCanvas;
}


/**
 * Изображения программы: фон, занавес и встроенные знаки. Заставки отдельных
 * спонсоров берут их отсюда же — вторая копия картинок в памяти не нужна.
 * @returns {{background: HTMLCanvasElement|null, curtain: HTMLImageElement|null}}
 */
export function partnersAssets() {
  return { background: backgroundCanvas ?? null, curtain: curtainImage ?? null };
}

/**
 * Готовый знак для заставки спонсора: встроенный золотой (или свой файл).
 * Возвращает канвас в том же виде, в каком знаки рисуются в «Спонсорах»,
 * поэтому блик и тиснение совпадают.
 * @param {string} key @param {string} [customUrl] @param {string} [style]
 */
export function partnersMark(key, customUrl, style = 'gold') {
  const resolved = style === 'original' ? 'original' : 'gold';
  if (typeof customUrl === 'string' && customUrl.startsWith('data:image/') && customUrl.length <= MAX_LOGO_DATA_URL) {
    const cacheKey = `${resolved}:${customUrl}`;
    const cached = customLogoCache.get(cacheKey);
    if (cached) return cached;
    resolveCustomLogo(customUrl, resolved);
    return null;
  }
  return builtinMark(key, resolved);
}

/** Заголовок и подзаголовок по умолчанию: у заставок они те же, что у «Спонсоров». */
export function partnerDefaults() {
  return PARTNERS_DEFAULTS.partners;
}

// Кэш пользовательских логотипов (data:image/...) по URL + стилю тиснения.
const customLogoCache = new Map();
const customLogoPending = new Set();

// Та же граница, что и при разборе настроек (config.js): гигантский data:image
// из ссылки #cfg не должен попадать ни в кэш, ни в отрисовку.
const MAX_LOGO_DATA_URL = 4 * 1024 * 1024;

function resolveCustomLogo(dataUrl, style, onReady) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/') || dataUrl.length > MAX_LOGO_DATA_URL) return null;
  const cacheKey = `${style}:${dataUrl}`;
  if (customLogoCache.has(cacheKey)) return customLogoCache.get(cacheKey);
  if (!customLogoPending.has(cacheKey)) {
    customLogoPending.add(cacheKey);
    loadImage(dataUrl).then(img => {
      customLogoPending.delete(cacheKey);
      if (img) {
        if (customLogoCache.size > 32) customLogoCache.clear();
        customLogoCache.set(cacheKey, renderPartnerMark(img, style));
        assetsRevision++;
        onReady?.();
      }
    });
  }
  return null;
}

/** Предварительно декодирует пользовательские data:image логотипы перед оффлайн-экспортом. */
export async function preloadPartnerCustomLogos(partnersCfg) {
  if (!partnersCfg || typeof partnersCfg !== 'object') return;
  const style = partnersCfg.logoStyle === 'original' ? 'original' : 'gold';
  const tasks = ['organizer1', 'organizer2', 'partner1', 'partner2'].map(async key => {
    const url = partnersCfg[`${key}Logo`];
    if (typeof url !== 'string' || !url.startsWith('data:image/') || url.length > MAX_LOGO_DATA_URL) return;
    const cacheKey = `${style}:${url}`;
    if (customLogoCache.has(cacheKey)) return;
    const img = await loadImage(url);
    if (img) { customLogoCache.set(cacheKey, renderPartnerMark(img, style)); assetsRevision++; }
  });
  await Promise.all(tasks);
}

/**
 * Сцена 04 «Спонсоры»: лёгкий автономный WebGL-адаптер без тяжёлого 3D-графа
 * основной сцены и с двойной буферизацией 2D-полотна (0 аллокаций canvas на кадр).
 */
export class PartnersScene {
  constructor(canvas, cfg, { single = false } = {}) {
    this.cfg = cfg;
    this.single = single;
    this.isIntro = false;
    this.contourWaves = null;
    // Стиль известен из настроек сразу: готовим только нужный вариант логотипов.
    setPartnersLogoStyle((single ? cfg.sponsor : cfg.partners)?.logoStyle);
    this._quality = suggestedQuality(masterId());
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false, depth: false,
    });
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    const master = masterSize();
    this._buffers = [0, 1].map(() => {
      const c = document.createElement('canvas');
      c.width = master.width; c.height = master.height;
      return { canvas: c, ctx: c.getContext('2d') };
    });
    this._backgroundBuffers = [0].map(() => {
      const c = document.createElement('canvas');
      c.width = master.width; c.height = master.height;
      return { canvas: c, ctx: c.getContext('2d') };
    });
    this._backgroundTextures = this._backgroundBuffers.map(({ canvas }) => {
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.generateMipmaps = false;
      texture.minFilter = texture.magFilter = THREE.LinearFilter;
      return texture;
    });
    this._bufferIndex = 0;
    this.card = this._buffers[0].canvas;
    this.cardCtx = this._buffers[0].ctx;
    this._textures = this._buffers.map(({ canvas }) => {
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.generateMipmaps = false;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      return texture;
    });
    this.cardTexture = this._textures[0];

    this.cardScene = new THREE.Scene();
    this.backgroundMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({ map: this._backgroundTextures[0], toneMapped: false, transparent: true, depthTest: false, depthWrite: false }));
    this.backgroundMesh.renderOrder = 0;
    this.cardScene.add(this.backgroundMesh);
    this.light = createPartnersLight();
    this.cardScene.add(this.light.mesh);
    this.frameMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    this.frameMesh.renderOrder = 2;
    this.cardScene.add(this.frameMesh);
    this.cardCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
    this.cardCamera.position.z = 1;
    this.cardMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({ map: this.cardTexture, toneMapped: false, transparent: true, depthTest: false, depthWrite: false })
    );
    this.cardMesh.renderOrder = 3;
    this.cardScene.add(this.cardMesh);
    this.ornament = this.single ? null : createPartnersOrnamentLayer();
    if (this.ornament) this.cardScene.add(this.ornament.mesh);
    this.glitter = createPartnersGlitter();
    this.glitter.points.renderOrder = 4;
    this.cardScene.add(this.glitter.points);
    this.frameGlint = createPartnersFrameGlint();
    this.frameGlint.mesh.renderOrder = 4;
    this.cardScene.add(this.frameGlint.mesh);
    this.curtains = createPartnersCurtains();
    this.cardScene.add(this.curtains.left, this.curtains.right);
    this.emptyTexture = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat);
    this.emptyTexture.needsUpdate = true;
    this._w = 0; this._h = 0;
    this.resize();
  }

  resize() {
    const { width, height } = masterSize();
    if (this._w !== width || this._h !== height) {
      this._w = width; this._h = height;
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(width, height, false);
      for (const buf of [...this._buffers, ...this._backgroundBuffers]) {
        buf.canvas.width = width;
        buf.canvas.height = height;
        buf.ctx = buf.canvas.getContext('2d');
      }
      // Статический слой привязан к разрешению мастера — пересобрать.
      this._staticLayer = null;
      this._staticLayerKey = "";
      this._frameLayer = null;
      this._frameTexture?.dispose();
      this._frameTexture = null;
      this._backgroundKey = null;
      this._veilLayer = null;
      this._holdTexture = null;
    }
  }

  /**
   * Постоянный градиент света не меняется за цикл и не зависит от времени.
   * Раньше они перерисовывались каждый кадр: полноэкранный градиент стоит
   * дороже всей анимации вместе. Фото сюда больше не запекается: оно живёт
   * отдельным слоем с «дыханием» (drawBreathingBackground), а готовый холст
   * 1920×1080 масштабируется за кадр дёшево.
   */
  _buildStaticLayer(master, background) {
    // Ключ обязан учитывать наличие фона: первые кадры могут пройти до загрузки
    // фото, и закэшированная «пустая» подложка иначе останется навсегда.
    const key = `${master.width}x${master.height}|${background ? "bg" : "empty"}`;
    if (this._staticLayer && this._staticLayerKey === key) return this._staticLayer;
    const w = BASE_FRAME.width, h = BASE_FRAME.height;
    /** @type {any} */
    const layer = this._staticLayer?.canvas ?? document.createElement("canvas");
    layer.width = master.width; layer.height = master.height;
    const ctx = layer.getContext("2d");
    ctx.setTransform(master.width / w, 0, 0, master.height / h, 0, 0);
    const light = ctx.createRadialGradient(720, 90, 20, 850, 400, 900);
    light.addColorStop(0, "rgba(255,190,139,.13)");
    light.addColorStop(.45, "rgba(197,97,76,.035)");
    light.addColorStop(1, "rgba(0,0,0,.16)");
    ctx.fillStyle = light; ctx.fillRect(0, 0, w, h);
    this._staticLayer = layer;
    this._staticLayerKey = key;
    return layer;
  }

  _cachedDecoration(master, kind) {
    const field = kind === 'frame' ? '_frameLayer' : '_veilLayer';
    if (this[field]) return this[field];
    const canvas = document.createElement('canvas');
    canvas.width = master.width; canvas.height = master.height;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(master.width / 1920, 0, 0, master.height / 1080, 0, 0);
    if (kind === 'frame') {
      // Рамка чуть меньше и тише; сложная позолота готовится только один раз.
      ctx.translate(960, 540); ctx.scale(.94, .94); ctx.translate(-960, -540);
      drawPartnersDecor(ctx, { visible: 1, frame: 1, curtain: 0, motion: 1, local: 0 }, { frameVisible: true, curtainVisible: false }, null);
    } else {
      drawAmberAtmosphere(ctx, 0, 1, 1, [], { particles: false });
    }
    this[field] = canvas;
    return canvas;
  }

  _updateBackground(master, phase, cue, data) {
    const tl = this.cfg.timeline;
    const motion = Math.max(0, Math.min(1, data.motion ?? 1));
    const source = selectedBackground(this.cfg.stageBackground);
    const key = `${assetsRevision}|${partnersHoldCacheKey(tl)}|${motion}`;
    const texture = this._backgroundTextures[0];
    if (this._backgroundKey !== key || this._backgroundSource !== source) {
      const ctx = this._backgroundBuffers[0].ctx;
      const w = BASE_FRAME.width, h = BASE_FRAME.height;
      ctx.setTransform(master.width / w, 0, 0, master.height / h, 0, 0);
      ctx.globalAlpha = 1; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
      drawBreathingBackground(ctx, source, w, h, tl.drawDuration + tl.emergeDuration, phase.cycle);
      ctx.drawImage(this._buildStaticLayer(master, source), 0, 0, w, h);
      ctx.save(); ctx.globalAlpha = motion;
      ctx.drawImage(this._cachedDecoration(master, 'veil'), 0, 0, w, h);
      ctx.restore();
      texture.needsUpdate = true;
      this._backgroundKey = key;
      this._backgroundSource = source;
    }
    this.backgroundMesh.material.map = texture;
    const bg = this.cfg.stageBackground;
    this.backgroundMesh.visible = bg?.enabled !== false;
    this.backgroundMesh.material.opacity = cue.visible * cue.background * (bg?.opacity ?? 1);
    this.backgroundMesh.scale.setScalar(bg?.scale ?? 1);
    this.backgroundMesh.position.set(((bg?.x ?? 960) - 960) / 960, (540 - (bg?.y ?? 540)) / 540, 0);
    if (!this._frameTexture) {
      this._frameTexture = new THREE.CanvasTexture(this._cachedDecoration(master, 'frame'));
      this._frameTexture.colorSpace = THREE.SRGBColorSpace;
      this._frameTexture.generateMipmaps = false;
      this._frameTexture.minFilter = this._frameTexture.magFilter = THREE.LinearFilter;
      this.frameMesh.material.map = this._frameTexture;
      this.frameMesh.material.needsUpdate = true;
    }
    const frame = this.cfg.stageFrame;
    this.frameMesh.material.opacity = cue.visible * cue.frame * (frame?.opacity ?? 1);
    this.frameMesh.visible = data.frameVisible !== false && frame?.enabled !== false && cue.frame > .001;
    this.frameMesh.scale.setScalar(frame?.scale ?? 1);
    this.frameMesh.position.set(((frame?.x ?? 960) - 960) / 960, (540 - (frame?.y ?? 540)) / 540, 0);
  }

  get quality() { return this._quality; }
  setQuality(id) {
    const next = isQualityPreset(id) ? id : DEFAULT_QUALITY;
    if (next === this._quality) return false;
    this._quality = next;
    return true;
  }
  configChanged() { this._holdTexture = null; }
  refreshTextTexture() { this.configChanged(); }
  setCaptionSource() {}
  setCaptionVisible() {}

  update(t) {
    const master = masterSize();
    if (this._w !== master.width || this._h !== master.height) this.resize();
    const phase = computePhase(t, this.cfg.timeline);
    const data = this.single ? this.cfg.sponsor : this.cfg.partners;
    const holding = phase.name === 'hold' && !phase.beforeStart;
    const cue = partnersStageCues(phase, this.cfg.timeline, data.motion ?? 1, this.cfg.stageCurtains?.fadePercent, !this.single);
    const config = this.cfg;
    if (this.single && config.stageSingleMark) cue.organizer = elementVisibility(cue.progress, config.stageSingleMark);
    if (!this.single) {
      if (config.stageOrganizer1) cue.organizer = elementVisibility(cue.progress, config.stageOrganizer1);
      if (config.stageOrganizer2) cue.organizerSecond = elementVisibility(cue.progress, config.stageOrganizer2);
      if (config.stagePartner1) cue.partner = elementVisibility(cue.progress, config.stagePartner1);
      if (config.stagePartner2) cue.partnerSecond = elementVisibility(cue.progress, config.stagePartner2);
      cue.organizerLabel = cue.organizer; cue.partnerLabel = cue.partner;
    }
    this.glitter.points.visible = cue.visible > 0 && cue.background > .001 && config.stageParticles?.enabled !== false;
    const curtainLayer = config.stageCurtains;
    this.curtains.update(curtainImage, cue.curtainOpen, data.curtainWidth, cue.visible * cue.curtainOpacity * (curtainLayer?.opacity ?? 1),
      data.curtainVisible !== false && curtainLayer?.enabled !== false, curtainLayer);
    this._blackFrame = cue.visible <= 0;
    this._updateBackground(master, phase, cue, data);
    const light = this.cfg.partnersLight || { enabled: true, strength: .7, speed: 1 };
    const lightStrength = light.enabled === false ? 0 : Math.max(0, Math.min(1.5, Number(light.strength) || 0));
    this.light.uniforms.time.value = phase.local;
    this.light.uniforms.speed.value = Math.max(0, Math.min(2, Number(light.speed) || 0));
    this.light.uniforms.strength.value = lightStrength * cue.visible * cue.background * (config.stageBackground?.enabled === false ? 0 : (config.stageBackground?.opacity ?? 1));
    this.light.mesh.visible = this.light.uniforms.strength.value > .001;
    const frame = config.stageFrame;
    const glintOpacity = data.frameVisible !== false && frame?.enabled !== false
      ? cue.visible * cue.frame * cue.idle * (frame?.opacity ?? 1) * (frame?.glint ?? 1) : 0;
    this.frameGlint.mesh.visible = glintOpacity > .001;
    this.frameGlint.uniforms.time.value = phase.local;
    this.frameGlint.uniforms.opacity.value = glintOpacity;
    this.frameGlint.uniforms.frameScale.value = frame?.scale ?? 1;
    this.frameGlint.uniforms.frameOffset.value.set(((frame?.x ?? 960) - 960) / 960, (540 - (frame?.y ?? 540)) / 540);
    {
      const u = this.glitter.uniforms;
      u.time.value = phase.local; u.period.value = phase.cycle;
      u.motion.value = (data.motion ?? 1) * cue.visible * cue.background * (config.stageParticles?.opacity ?? 1);
      u.pixelScale.value = master.height / 1080;
    }
    this.ornament?.update(config.stageOrnament, cue.visible, cue.progress, phase.local, data.motion ?? 1);
    const holdKey = partnersHoldCacheKey(this.cfg.timeline);
    if (holding && this._holdTexture && this._holdRevision === assetsRevision && this._holdKey === holdKey) {
      this._blackFrame = false;
      this.cardMesh.material.map = this._holdTexture;
      return;
    }
    this._holdTexture = null;
    // Пока шторы движутся, переднего плана ещё нет — никакой перезагрузки
    // полного холста, только плавное перемещение текстур на видеокарте.
    if (cue.compass <= .001 && cue.organizer <= .001 && cue.partner <= .001 &&
        cue.organizerSecond <= .001 && cue.partnerSecond <= .001 && cue.title <= .001) {
      this.cardMesh.material.map = this.emptyTexture;
      return;
    }
    // Чередуем два готовых холста: Chromium гарантированно обновляет WebGL-текстуру
    // без ежекадрового создания полноразмерного DOM-элемента.
    this._bufferIndex = 1 - this._bufferIndex;
    const target = this._buffers[this._bufferIndex];
    this.card = target.canvas;
    this.cardCtx = target.ctx;
    // Each reusable buffer owns its own texture. Swapping maps avoids mutating
    // a live texture's image source while WebGL still has it bound.
    this.cardTexture = this._textures[this._bufferIndex];
    this.cardMesh.material.map = this.cardTexture;
    const ctx = this.cardCtx, w = BASE_FRAME.width, h = BASE_FRAME.height, cfg = this.cfg, tl = cfg.timeline;
    ctx.setTransform(master.width / w, 0, 0, master.height / h, 0, 0);
    const visible = cue.visible;
    const visualTime = Math.min(phase.local, tl.drawDuration + tl.emergeDuration);
    this._blackFrame = visible <= 0;

    ctx.clearRect(0, 0, w, h);
    if (visible <= 0) { this.cardTexture.needsUpdate = true; return; }
    // Эмблема проявляется крупно и уменьшается к выбранному положению.
    const compass = cfg.stageCompass;
    if (introOutlineImage && cue.compass > .001 && compass?.enabled !== false) {
      const shrink = cue.compassShrink;
      const size = (600 - 260 * shrink) * (compass?.scale ?? 1);
      const height = size * 4133.76 / 3937.77;
      // Эмблема материализуется именно в центре кадра и уже оттуда, сжимаясь,
      // спускается в своё место (для общей композиции разница всего 65 px).
      const fx = compass?.x ?? 960, fy = compass?.y ?? 540;
      const cx = fx + (960 - fx) * (1 - shrink);
      const cy = fy + (540 - fy) * (1 - shrink);
      ctx.save(); ctx.globalAlpha = visible * cue.compass * (compass?.opacity ?? .42);
      ctx.drawImage(coloredCompass(compass?.color), cx - size / 2, cy - height / 2, size, height);
      ctx.restore();
    }
    const text = (value, x, y, font, color, alpha, maxWidth, entry = 1) => {
      ctx.save(); ctx.globalAlpha = alpha; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = font; ctx.fillStyle = color;
      ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 9; ctx.shadowOffsetY = 3;
      ctx.fillText(String(value ?? ''), x, y + 22 * (1 - entry), maxWidth); ctx.restore();
    };
    const warm = '#d2ac70', ivory = '#f6e4be';
    const drawTextLayer = (element, value, font, color, alpha, maxWidth, entry = 1) => {
      if (!element || element.enabled === false) return;
      const scale = element.scale ?? 1;
      ctx.save(); ctx.translate(element.x, element.y); ctx.scale(scale, scale);
      text(value, 0, 0, font, element.color ?? color, alpha * (element.opacity ?? 1), maxWidth / scale, entry);
      ctx.restore();
    };
    drawTextLayer(cfg.stageTitle, String(data.title ?? 'ЯНТАРНЫЙ ЦИРКУЛЬ'),
      '400 58px Prata, Georgia, serif', '#ecd4a1', visible * cue.title, 1200, cue.title);
    drawTextLayer(cfg.stageSubtitle, String(data.subtitle ?? 'вечер ретроспектива'),
      '400 36px Forum, Georgia, serif', '#c8a873', visible * cue.title, 1000, cue.title);

    // Тонкий золотой разделитель в духе интро, отдельный настраиваемый слой.
    const titleDivider = cfg.stageTitleDivider;
    if (titleDivider && titleDivider.enabled !== false && cue.title > .001) {
      const { x, y, scale = 1, opacity = 1, color = '#e5bd7c', width = 360 } = titleDivider;
      const half = width * .5 * scale;
      ctx.save(); ctx.globalAlpha = visible * cue.title * opacity;
      const gradient = ctx.createLinearGradient(x - half, 0, x + half, 0);
      gradient.addColorStop(0, 'rgba(0,0,0,0)'); gradient.addColorStop(.25, color);
      gradient.addColorStop(.75, color); gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.strokeStyle = gradient; ctx.lineWidth = 1.25 * scale;
      ctx.beginPath(); ctx.moveTo(x - half, y); ctx.lineTo(x + half, y); ctx.stroke();
      ctx.restore();
    }

    const trackedLabel = (value, x, y, alpha, entry, color = warm, line = null) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '600 24px Manrope, sans-serif';
      ctx.fillStyle = color;
      ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 9; ctx.shadowOffsetY = 3;
      const supportsTracking = 'letterSpacing' in ctx;
      if (supportsTracking) ctx.letterSpacing = '5px';
      // Компенсация: разрядка добавляет хвостовой пробел справа, поэтому
      // центрированный текст уезжает — сдвигаем на половину разрядки.
      const shift = supportsTracking ? 2.5 : 0;
      const labelText = String(value ?? '');
      const textY = y + 22 * (1 - entry);
      ctx.fillText(labelText, x + shift, textY, 460);
      if (line?.enabled !== false && line && labelText) {
        const { near, far } = labelLineLayout(x, ctx.measureText(labelText).width, line.side, line.gap, line.length);
        if (near !== far) {
          ctx.save(); ctx.globalAlpha *= line.opacity ?? .65; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
          const gradient = ctx.createLinearGradient(near, 0, far, 0);
          gradient.addColorStop(0, color); gradient.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.strokeStyle = gradient; ctx.lineWidth = 1.25;
          ctx.beginPath(); ctx.moveTo(near, textY); ctx.lineTo(far, textY); ctx.stroke(); ctx.restore();
        }
      }
      if (supportsTracking) ctx.letterSpacing = '0px';
      ctx.restore();
    };
    const label = (element, value, alpha, entry, side) => {
      if (!element || element.enabled === false) return;
      ctx.save(); ctx.translate(element.x, element.y); ctx.scale(element.scale, element.scale);
      trackedLabel(value, 0, 0, alpha * element.opacity, entry, element.color, { side, enabled: element.lineEnabled, length: element.lineLength, gap: element.lineGap, opacity: element.lineOpacity });
      ctx.restore();
    };
    const defaults = { organizer1: 'ПРОэлектро', organizer2: 'ПРОэлектрощит', partner1: 'Промрукав', partner2: 'КЭАЗ' };
    const style = data.logoStyle === 'original' ? 'original' : 'gold';
    // Смена стиля в настройках доготовит нужный вариант один раз, а не каждый кадр.
    if (style !== partnersLogoStyle) setPartnersLogoStyle(style);
    // Знак входит не «проявлением», а движением: поднимается на 26 px, чуть
    // увеличиваясь, и садится с мягким перелётом. Текст рядом идёт следом,
    // чтобы группа читалась как единое целое, а не как два независимых слоя.
    /** Знак из настроек (свой файл) либо встроенный, если имя не меняли. */
    const customLogoFor = (key) => {
      const custom = resolveCustomLogo(data[`${key}Logo`], style, () => {
        if ((window.__logo?.activeScene?.id === 'partners' || window.__logo?.activeScene?.id?.startsWith('sponsor-')) && window.__logo?.cfg?.playback?.paused) {
          window.__logo.renderAt(window.__logo.time);
        }
      });
      const isDefault = String(data[key] ?? '').trim().toLocaleLowerCase('ru') === defaults[key].toLocaleLowerCase('ru');
      return custom || (isDefault ? builtinMark(key, style) : null);
    };
    // Встроенные и пользовательские знаки готовим один раз на кадр.
    const singleKey = data.mark === 'keaz' ? 'partner2' : 'partner1';
    const marks = this.single ? {
      single: resolveCustomLogo(data.markLogo, style, () => {
        if (window.__logo?.activeScene?.id?.startsWith('sponsor-') && window.__logo?.cfg?.playback?.paused) {
          window.__logo.renderAt(window.__logo.time);
        }
      }) || builtinMark(singleKey, style),
    } : {
      organizer1: customLogoFor('organizer1'), organizer2: customLogoFor('organizer2'),
      partner1: customLogoFor('partner1'), partner2: customLogoFor('partner2'),
    };
    const company = (key, element, entry, glintAt, phaseIdx, fit = 1) => {
      if (!element || element.enabled === false) return;
      const x = element.x, y = element.y;
      fit *= element.scale ?? 1;
      const layerVisible = visible * (element.opacity ?? 1);
      const value = this.single ? (data.mark === 'keaz' ? 'КЭАЗ' : 'Промрукав') : data[key];
      const sourceLogo = marks[key];
      const logo = sourceLogo && !this.single ? visiblePartnerMark(sourceLogo) : sourceLogo;
      // Мягкий подъём с перелётом: p идёт 0→1, overshoot даёт «доезд».
      const p = entry <= 0 ? 0 : Math.min(1.06, easeOutBack(entry));
      const rise = (1 - Math.min(1, p)) * 26;
      if (!logo) {
        text(value, x, y, '600 52px Manrope, sans-serif', ivory, layerVisible * Math.max(0, Math.min(1, p)), 440, Math.min(1, p));
        return;
      }
      // Ширина И высота считаются от ОДНОГО коэффициента. Раньше высота
      // бралась до ограничения пары, а ширина ужималась отдельно — правые
      // знаки (ПРОэлектрощит, КЭАЗ) выходили сжатыми по горизонтали в 1.25 и
      // 1.34 раза. Логотип искажать нельзя ни при каких раскладках.
      const size = partnerLogoSize(logo.width, logo.height, { single: this.single, scale: fit });
      const lw = size.width;
      const lh = size.height;
      // Масштаб группы: 0.955 → 1, на перелёте — до 1.008.
      // В конце входа знаки замирают: устойчивый кадр можно держать на GPU.
      const breathe = this.single ? cue.idle * 0.004 * Math.sin(visualTime * 0.62 + phaseIdx * 1.7) : 0;
      const floatY = cue.idle * 2.1 * Math.sin(visualTime * 0.5 + phaseIdx * 2.1);
      const grow = 0.955 + 0.045 * p + breathe;
      const cx = x, cy = y + rise + floatY;
      ctx.save();
      ctx.globalAlpha = layerVisible * Math.max(0, Math.min(1, p * 1.15));
      // Мягкая тень под знаком отделяет золото от винного фона и даёт глубину.
      if (cue.shadow > 0.01) {
        ctx.save();
        ctx.globalAlpha = layerVisible * Math.min(1, p) * cue.shadow * 0.5;
        ctx.translate(cx, cy + lh * 0.52);
        ctx.scale(1, 0.22);
        const shadow = ctx.createRadialGradient(0, 0, 0, 0, 0, lw * 0.52);
        shadow.addColorStop(0, 'rgba(0,0,0,.55)');
        shadow.addColorStop(.6, 'rgba(0,0,0,.22)');
        shadow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = shadow;
        ctx.beginPath(); ctx.arc(0, 0, lw * 0.52, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      ctx.translate(cx, cy);
      ctx.scale(grow, grow);
      // В персональных заставках прежний клип; на общей не обрезаем высокие знаки.
      if (this.single) { ctx.beginPath(); ctx.rect(-295 * fit, -85 * fit, 590 * fit, 170 * fit); ctx.clip(); }
      ctx.drawImage(logo, -lw / 2, -lh / 2, lw, lh);
      // Блик проходит уже по проявленному знаку — иначе он светит в пустоту.
      if (!holding) drawMarkGlint(ctx, logo, -lw / 2, -lh / 2, lw, lh,
        glintSpan(phase.local, { start: glintAt, span: 0.62, from: -0.35, to: 1.35 }),
        layerVisible * Math.min(1, p) * cue.glintStrength);
      // Второй проход на удержании — медленнее и тише. Разнесён по знакам,
      // чтобы свет «гулял» по группе, а не вспыхивал весь сразу.
      if (!holding) drawMarkGlint(ctx, logo, -lw / 2, -lh / 2, lw, lh,
        glintSpan(phase.local, { start: 7.4 + phaseIdx * 0.35, span: 1.15, from: -0.3, to: 1.3 }),
        layerVisible * Math.min(1, p) * cue.holdGlint * 0.55);
      ctx.restore();
    };
    // Тёплая «подушка» под каждым ярусом: отделяет группу от фона и добавляет
    // глубины. Рисуется до знаков, поэтому знаки остаются резкими поверх света.
    const tierGlow = (cx, cy, rx, ry, alpha) => {
      if (alpha <= 0.01) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(cx, cy); ctx.scale(1, ry / rx);
      const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
      glow.addColorStop(0, 'rgba(255,186,110,.16)');
      glow.addColorStop(.55, 'rgba(232,138,72,.07)');
      glow.addColorStop(1, 'rgba(200,100,50,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    };
    const glowFor = (element, rx = 260, ry = 115) => {
      if (element?.enabled !== false && element) tierGlow(element.x, element.y, rx, ry, visible * cue.shadow * .5 * element.opacity);
    };
    if (this.single) {
      const e = cfg.stageSingleMark;
      const scale = 1.45 * Math.max(.5, Math.min(1.8, Number(data.markScale) || 1)) *
        (data.mark === 'keaz' ? PARTNERS_MARK_LAYOUT.keazScale : 1);
      glowFor(e, 400, 130);
      label(cfg.stageSponsorLabel, data.sponsorLabel ?? 'СПОНСОР', visible * cue.organizer, cue.organizer, -1);
      company('single', e, cue.organizer, 2.75, 0, scale);
    } else {
      glowFor(cfg.stageOrganizer1); glowFor(cfg.stageOrganizer2);
      glowFor(cfg.stagePartner1); glowFor(cfg.stagePartner2);
      label(cfg.stageOrganizerLabel, data.organizerLabel, visible * cue.organizerLabel, cue.organizerLabel, -1);
      label(cfg.stageCoorganizerLabel, data.coorganizerLabel, visible * cue.organizerSecond, cue.organizerSecond, 1);
      label(cfg.stagePartnerLabel, data.partnerLabel, visible * cue.partner, cue.partner, -1);
      label(cfg.stagePartnerLabel2, data.partner2Label, visible * cue.partnerSecond, cue.partnerSecond, 1);
      company('organizer1', cfg.stageOrganizer1, cue.organizer, 2.75, 0);
      company('organizer2', cfg.stageOrganizer2, cue.organizerSecond, 3.25, 1);
      company('partner1', cfg.stagePartner1, cue.partner, 4.45, 2);
      company('partner2', cfg.stagePartner2, cue.partnerSecond, 4.95, 3);
    }
    this.cardTexture.needsUpdate = true;
    if (holding) { this._holdTexture = this.cardTexture; this._holdRevision = assetsRevision; this._holdKey = holdKey; }
  }

  render() {
    this.renderer.setRenderTarget(null);
    if (this._blackFrame) this.renderer.clear(true, true, true);
    else this.renderer.render(this.cardScene, this.cardCamera);
  }

  dispose() {
    this.curtains.dispose();
    this.ornament?.dispose();
    this.emptyTexture.dispose();
    this._frameTexture?.dispose();
    this.frameMesh.geometry.dispose();
    this.frameMesh.material.dispose();
    this.light.dispose();
    this._backgroundTextures.forEach(texture => texture.dispose());
    this.backgroundMesh.geometry.dispose();
    this.backgroundMesh.material.dispose();
    this.glitter.dispose();
    this.frameGlint.dispose();
    this._textures.forEach(texture => texture.dispose());
    this.cardMesh.geometry.dispose();
    this.cardMesh.material.dispose();
    this.renderer.dispose();
  }
}
