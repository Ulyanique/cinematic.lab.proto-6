import * as THREE from 'three';
import backgroundUrl from './assets/partners/bg.jpg';
import curtainUrl from './assets/partners/shtora.png';
import proelectroUrl from './assets/partners/proelectro.svg';
import proelectroschitUrl from './assets/partners/proelectroschit.svg';
import promrukavUrl from './assets/partners/promrukav.svg';
import keazUrl from './assets/partners/keaz.svg';
import { drawPartnersDecor, drawAmberAtmosphere, drawBreathingBackground } from './partners-graphics.js';
import { createPartnersLight } from './partners-light.js';
import { createPartnersGlitter } from './partners-glitter.js';
import { createPartnersFrameGlint } from './partners-frame-glint.js';
import { partnersStageCues, drawStageCurtains, partnersHoldCacheKey } from './partners-stage.js';
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

// На экране логотип не шире MARK_MAX_WIDTH и не выше MARK_MAX_HEIGHT (см. company()).
// Готовить его в 1200 px значило держать 14× лишних пикселей и вчетверо больше
// памяти; масштаб 2× оставляем на смену мастер-профиля и чёткость.
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
 * Прозрачные поля вокруг рисунка срезаются: исходные SVG приходят с разным
 * запасом (у одного 6 % сверху, у другого 20 %), и знаки на экране получались
 * разного веса при одинаковой высоте блока. По срезанным границам вызывающая
 * сторона может выровнять их по оптической массе, а не по пустому полю.
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
  const whole = { x: 0, y: 0, width: canvas.width, height: canvas.height };
  let ctx;
  try { ctx = canvas.getContext('2d', { willReadFrequently: true }); } catch (e) { return whole; }
  if (!ctx) return whole;
  const { width, height } = canvas;
  let data;
  try { data = ctx.getImageData(0, 0, width, height).data; } catch (e) { return whole; }
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      // Порог 24 из 255 отсекает почти прозрачную кромку сглаживания.
      if (data[row + x * 4 + 3] > 24) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return whole;
  return { x: minX / width, y: minY / height, width: (maxX - minX + 1) / width, height: (maxY - minY + 1) / height };
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
  constructor(canvas, cfg) {
    this.cfg = cfg;
    this.isIntro = false;
    this.contourWaves = null;
    // Стиль известен из настроек сразу: готовим только нужный вариант логотипов.
    setPartnersLogoStyle(cfg.partners?.logoStyle);
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
    this._backgroundBuffers = [0, 1].map(() => {
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
      new THREE.MeshBasicMaterial({ map: this._backgroundTextures[0], toneMapped: false, depthTest: false, depthWrite: false }));
    this.backgroundMesh.renderOrder = 0;
    this.cardScene.add(this.backgroundMesh);
    this.light = createPartnersLight();
    this.cardScene.add(this.light.mesh);
    this.cardCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
    this.cardCamera.position.z = 1;
    this.cardMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({ map: this.cardTexture, toneMapped: false, transparent: true, depthTest: false, depthWrite: false })
    );
    this.cardMesh.renderOrder = 2;
    this.cardScene.add(this.cardMesh);
    this.glitter = createPartnersGlitter();
    this.glitter.points.renderOrder = 3;
    this.cardScene.add(this.glitter.points);
    this.frameGlint = createPartnersFrameGlint();
    this.frameGlint.mesh.renderOrder = 4;
    this.cardScene.add(this.frameGlint.mesh);
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
    const holding = phase.name === 'hold' && !phase.beforeStart;
    const cue = partnersStageCues(phase, this.cfg.timeline, this.cfg.partners.motion ?? 1);
    this.glitter.points.visible = holding && cue.visible > 0;
    const light = this.cfg.partnersLight || { enabled: true, strength: .7, speed: 1 };
    const lightStrength = light.enabled === false ? 0 : Math.max(0, Math.min(1.5, Number(light.strength) || 0));
    this.light.uniforms.time.value = phase.local;
    this.light.uniforms.speed.value = Math.max(0, Math.min(2, Number(light.speed) || 0));
    this.light.uniforms.strength.value = lightStrength * cue.visible * cue.background;
    this.light.mesh.visible = this.light.uniforms.strength.value > .001;
    const glintOpacity = this.cfg.partners.frameVisible !== false && cue.curtainOpen >= .999
      ? cue.visible * cue.frame * Math.max(0, Math.min(1, this.cfg.partners.motion ?? 1)) : 0;
    this.frameGlint.mesh.visible = glintOpacity > .001;
    this.frameGlint.uniforms.time.value = phase.local;
    this.frameGlint.uniforms.opacity.value = glintOpacity;
    if (holding) {
      const u = this.glitter.uniforms;
      u.time.value = phase.local; u.period.value = phase.cycle;
      u.motion.value = (this.cfg.partners.motion ?? 1) * cue.visible;
      u.pixelScale.value = master.height / 1080;
    }
    const holdKey = partnersHoldCacheKey(this.cfg.timeline);
    if (holding && this._holdTexture && this._holdRevision === assetsRevision && this._holdKey === holdKey) {
      this._blackFrame = false;
      this.cardMesh.material.map = this._holdTexture;
      this.backgroundMesh.material.map = this._holdBackgroundTexture;
      return;
    }
    this._holdTexture = null;
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
    const bgTarget = this._backgroundBuffers[this._bufferIndex];
    const bgCtx = bgTarget.ctx;
    const bgTexture = this._backgroundTextures[this._bufferIndex];
    this.backgroundMesh.material.map = bgTexture;

    const ctx = this.cardCtx, w = BASE_FRAME.width, h = BASE_FRAME.height, cfg = this.cfg, tl = cfg.timeline;
    ctx.setTransform(master.width / w, 0, 0, master.height / h, 0, 0);
    const data = cfg.partners, visible = cue.visible;
    const visualTime = Math.min(phase.local, tl.drawDuration + tl.emergeDuration);
    this._blackFrame = visible <= 0;

    // Фоновое фото, свет и передний план — отдельные слои. В удержании оба
    // полотна остаются на GPU; меняется только uniform анимации света.
    ctx.clearRect(0, 0, w, h);
    bgCtx.setTransform(master.width / w, 0, 0, master.height / h, 0, 0);
    bgCtx.globalAlpha = 1;
    bgCtx.fillStyle = '#000000'; bgCtx.fillRect(0, 0, w, h);
    if (visible <= 0) { this.cardTexture.needsUpdate = true; bgTexture.needsUpdate = true; return; }
    const staticLayer = this._buildStaticLayer(master, backgroundCanvas);
    bgCtx.save(); bgCtx.globalAlpha = visible * cue.background;
    drawBreathingBackground(bgCtx, backgroundCanvas, w, h, tl.drawDuration + tl.emergeDuration, phase.cycle);
    bgCtx.drawImage(staticLayer, 0, 0, w, h);
    bgCtx.restore();
    // Защищаем от частиц области знаков в верхних боковых колонках.
    // Свет и сложную позолоту кэшируем, а искры оставляем живыми.
    const motion = Math.max(0, Math.min(1, data.motion ?? 1));
    bgCtx.save(); bgCtx.globalAlpha = visible * cue.background * motion;
    bgCtx.drawImage(this._cachedDecoration(master, 'veil'), 0, 0, w, h);
    bgCtx.restore();
    if (!holding) drawAmberAtmosphere(ctx, phase.local, motion * visible * cue.background, phase.cycle, [
      { x: 150, y: 70, w: 550, h: 450 },
      { x: 1220, y: 70, w: 550, h: 450 },
    ], { veils: false });
    if (data.frameVisible !== false) {
      ctx.save(); ctx.globalAlpha = visible * cue.frame;
      ctx.drawImage(this._cachedDecoration(master, 'frame'), 0, 0, w, h);
      ctx.restore();
    }
    // Эмблема проявляется крупно и плавно уменьшается к фоновой композиции.
    if (introOutlineImage && cue.compass > .001) {
      const size = 600 - 260 * cue.compassShrink;
      const height = size * 4133.76 / 3937.77;
      ctx.save(); ctx.globalAlpha = visible * cue.compass * .42;
      ctx.drawImage(introOutlineImage, 960 - size / 2, 540 - height / 2, size, height);
      ctx.restore();
    }
    const text = (value, x, y, font, color, alpha, maxWidth, entry = 1) => {
      ctx.save(); ctx.globalAlpha = alpha; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = font; ctx.fillStyle = color;
      ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 9; ctx.shadowOffsetY = 3;
      ctx.fillText(String(value ?? ''), x, y + 22 * (1 - entry), maxWidth); ctx.restore();
    };
    const warm = '#d2ac70', ivory = '#f6e4be';
    // Подпись появляется под уменьшившейся эмблемой, а не поверх неё.
    text(String(data.title ?? 'Янтарный циркуль').toLocaleUpperCase('ru'), 960, 780,
      '600 58px "Cormorant Garamond", Georgia, serif', '#ecd4a1', visible * cue.title, 650, cue.title);
    text(String(data.subtitle ?? 'вечер ретроспектива').toLocaleLowerCase('ru'), 960, 845,
      '400 36px "Cormorant Garamond", Georgia, serif', '#c8a873', visible * cue.title, 580, cue.title);

    const trackedLabel = (value, x, y, alpha, entry) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '600 24px Manrope, sans-serif';
      ctx.fillStyle = warm;
      ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 9; ctx.shadowOffsetY = 3;
      const supportsTracking = 'letterSpacing' in ctx;
      if (supportsTracking) ctx.letterSpacing = '5px';
      // Компенсация: разрядка добавляет хвостовой пробел справа, поэтому
      // центрированный текст уезжает — сдвигаем на половину разрядки.
      const shift = supportsTracking ? 2.5 : 0;
      ctx.fillText(String(value ?? ''), x + shift, y + 22 * (1 - entry), 460);
      if (supportsTracking) ctx.letterSpacing = '0px';
      ctx.restore();
    };
    const label = (value, x, y, alpha, entry) => {
      trackedLabel(value, x, y, alpha, entry);
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
        if (window.__logo?.activeScene?.id === 'partners' && window.__logo?.cfg?.playback?.paused) {
          window.__logo.renderAt(window.__logo.time);
        }
      });
      const isDefault = String(data[key] ?? '').trim().toLocaleLowerCase('ru') === defaults[key].toLocaleLowerCase('ru');
      return custom || (isDefault ? builtinMark(key, style) : null);
    };
    // Встроенные и пользовательские знаки готовим один раз на кадр.
    const marks = {
      organizer1: customLogoFor('organizer1'), organizer2: customLogoFor('organizer2'),
      partner1: customLogoFor('partner1'), partner2: customLogoFor('partner2'),
    };
    const company = (key, x, y, entry, glintAt, phaseIdx, fit = 1) => {
      const value = data[key];
      const logo = marks[key];
      // Мягкий подъём с перелётом: p идёт 0→1, overshoot даёт «доезд».
      const p = entry <= 0 ? 0 : Math.min(1.06, easeOutBack(entry));
      const rise = (1 - Math.min(1, p)) * 26;
      if (!logo) {
        text(value, x, y, '600 52px Manrope, sans-serif', ivory, visible * Math.max(0, Math.min(1, p)), 440, Math.min(1, p));
        return;
      }
      // Ширина И высота считаются от ОДНОГО коэффициента. Раньше высота
      // бралась до ограничения пары, а ширина ужималась отдельно — правые
      // знаки (ПРОэлектрощит, КЭАЗ) выходили сжатыми по горизонтали в 1.25 и
      // 1.34 раза. Логотип искажать нельзя ни при каких раскладках.
      const scale = Math.min(MARK_MAX_WIDTH / logo.width, MARK_MAX_HEIGHT / logo.height) * fit;
      const lw = logo.width * scale;
      const lh = logo.height * scale;
      // Масштаб группы: 0.955 → 1, на перелёте — до 1.008.
      // В конце входа знаки замирают: устойчивый кадр можно держать на GPU.
      const breathe = cue.idle * 0.004 * Math.sin(visualTime * 0.62 + phaseIdx * 1.7);
      const floatY = cue.idle * 2.1 * Math.sin(visualTime * 0.5 + phaseIdx * 2.1);
      const grow = 0.955 + 0.045 * p + breathe;
      const cx = x, cy = y + rise + floatY;
      ctx.save();
      ctx.globalAlpha = visible * Math.max(0, Math.min(1, p * 1.15));
      // Мягкая тень под знаком отделяет золото от винного фона и даёт глубину.
      if (cue.shadow > 0.01) {
        ctx.save();
        ctx.globalAlpha = visible * Math.min(1, p) * cue.shadow * 0.5;
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
      // Клип по кадру при входе остаётся: он не даёт знаку «вылезать» за блок.
      ctx.beginPath(); ctx.rect(-295, -85, 590, 170); ctx.clip();
      ctx.drawImage(logo, -lw / 2, -lh / 2, lw, lh);
      // Блик проходит уже по проявленному знаку — иначе он светит в пустоту.
      if (!holding) drawMarkGlint(ctx, logo, -lw / 2, -lh / 2, lw, lh,
        glintSpan(phase.local, { start: glintAt, span: 0.62, from: -0.35, to: 1.35 }),
        visible * Math.min(1, p) * cue.glintStrength);
      // Второй проход на удержании — медленнее и тише. Разнесён по знакам,
      // чтобы свет «гулял» по группе, а не вспыхивал весь сразу.
      if (!holding) drawMarkGlint(ctx, logo, -lw / 2, -lh / 2, lw, lh,
        glintSpan(phase.local, { start: 7.4 + phaseIdx * 0.35, span: 1.15, from: -0.3, to: 1.3 }),
        visible * Math.min(1, p) * cue.holdGlint * 0.55);
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
    // Все четыре знака в верхней половине и на внешних сторонах кадра.
    const left = 425, right = 1495, topY = 245, secondY = 465;
    tierGlow(left, topY, 260, 115, visible * cue.shadow * .5);
    tierGlow(right, topY, 260, 115, visible * cue.shadow * .5);
    tierGlow(left, secondY, 260, 115, visible * cue.shadow * .5);
    tierGlow(right, secondY, 260, 115, visible * cue.shadow * .5);
    // Тонкие золотые разделители между верхним и нижним знаками.
    const divider = (x, opacity) => {
      if (opacity <= .001) return;
      ctx.save(); ctx.globalAlpha = visible * opacity * .65;
      const gradient = ctx.createLinearGradient(x - 250, 0, x + 250, 0);
      gradient.addColorStop(0, 'rgba(232,196,132,0)');
      gradient.addColorStop(.22, 'rgba(232,196,132,.75)');
      gradient.addColorStop(.78, 'rgba(232,196,132,.75)');
      gradient.addColorStop(1, 'rgba(232,196,132,0)');
      ctx.strokeStyle = gradient; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x - 250, 325); ctx.lineTo(x + 250, 325); ctx.stroke();
      ctx.restore();
    };
    divider(left, Math.min(cue.organizer, cue.organizerSecond));
    divider(right, Math.min(cue.partner, cue.partnerSecond));
    label(data.organizerLabel, left, 150, visible * cue.organizerLabel, cue.organizerLabel);
    label(data.coorganizerLabel, left, 370, visible * cue.organizerSecond, cue.organizerSecond);
    label(data.partnerLabel, right, 150, visible * cue.partnerLabel, cue.partnerLabel);
    company('organizer1', left, topY, cue.organizer, 2.75, 0, 1);
    company('organizer2', left, secondY, cue.organizerSecond, 3.25, 1, 1);
    company('partner1', right, topY, cue.partner, 4.45, 2, 1);
    company('partner2', right, secondY, cue.partnerSecond, 4.95, 3, 1);
    // Занавес расположен поверх всех элементов и в конце закрывается обратно.
    if (data.curtainVisible !== false) {
      ctx.save(); ctx.globalAlpha = visible;
      drawStageCurtains(ctx, curtainImage, cue.curtainOpen, w, h, data.curtainWidth);
      ctx.restore();
    }
    this.cardTexture.needsUpdate = true;
    bgTexture.needsUpdate = true;
    if (holding) { this._holdBackgroundTexture = bgTexture; this._holdTexture = this.cardTexture; this._holdRevision = assetsRevision; this._holdKey = holdKey; }
  }

  render() {
    this.renderer.setRenderTarget(null);
    if (this._blackFrame) this.renderer.clear(true, true, true);
    else this.renderer.render(this.cardScene, this.cardCamera);
  }

  dispose() {
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
