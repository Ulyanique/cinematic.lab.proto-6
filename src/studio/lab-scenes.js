import { masterSize } from "./output-profile.js";
import { DEFAULT_QUALITY, isQualityPreset } from "./quality-presets.js";
import { Intro } from "./lab2/Intro.ts";
import { sanitizeConfig, totalDuration } from "./lab2/config.ts";
import { loadFontFace } from "./lab2/fonts.ts";
import { IntroEngine } from "./lab5/Engine.ts";
import { DEFAULT_SETTINGS, normalizeSettings } from "./lab5/settings.ts";
import { TL as LAB5_TL } from "./lab5/timeline.ts";
import { drawLab5Overlay } from "./lab5/overlay.ts";
import { loadLab5Fonts } from "./lab5/fonts.ts";
import { lab2Source, lab5Source } from "./scenes/labs.js";
import { depthOrder, depthOrderEnabled, introDepthOrder } from "./depth-order.js";

/**
 * Адаптеры лабораторий к общему циклу студии: сцена получает время `update(t)` и
 * рисует кадр `render()` в холст сцены (2D), откуда его берут и предпросмотр, и
 * покадровый экспорт, и общий слой эффектов.
 */
class LabScene {
  constructor(canvas, cfg) {
    this.cfg = cfg;
    this.canvas = canvas;
    this.isIntro = false;
    this.contourWaves = null;
    this._quality = DEFAULT_QUALITY;
    this.ready = false;
    this.disposed = false;
    this.time = 0;
    this.ctx = canvas.getContext("2d");
    const { width, height } = masterSize();
    this.W = width; this.H = height;
    canvas.width = width; canvas.height = height;
    // Скрытый хост фиксированного размера: движок лаборатории рисует в нём и не зависит от окна.
    this.host = document.createElement("div");
    this.host.setAttribute("aria-hidden", "true");
    this.host.style.cssText = `position:fixed;left:-20000px;top:0;width:${width}px;height:${height}px;pointer-events:none;overflow:hidden`;
    document.body.appendChild(this.host);
  }

  get quality() { return this._quality; }
  setQuality(id) {
    const next = isQualityPreset(id) ? id : DEFAULT_QUALITY;
    if (next === this._quality) return false;
    this._quality = next;
    return true;
  }
  setCaptionSource() {}
  setCaptionVisible() {}
  /**
   * Держит ли сцена длительность удержания за собой.
   *
   * Лаборатории живут собственным фильмом: их длина считается из «момента
   * удара», скорости и паузы, и каждый кадр переписывает `holdDuration`.
   * Студии это важно знать: иначе правка «Держ.» в пульте молча отменялась
   * следующим же кадром — число вводилось и через кадр возвращалось.
   */
  holdsOwnDuration() { return false; }
  resize() {}
  whenReady() { return this._readyPromise || Promise.resolve(); }
  update(t) { this.time = t; }
  _redrawWhenReady() {
    // Первый кадр проходит до окончания загрузки движка: после неё просим перерисовать паузу.
    this._readyPromise.then(() => {
      if (this.disposed) return;
      window.__logo?.renderAt?.(window.__logo.time);
    }).catch(() => {});
  }
  _black() { this.ctx.fillStyle = "#050403"; this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height); }
  dispose() {
    this.disposed = true;
    this.host.remove();
  }
}

/** Лаборатория 10 — «Золотой рой» (cinematic-lab-proto-2). */
export class Lab2Scene extends LabScene {
  constructor(canvas, cfg) {
    super(canvas, cfg);
    this.lab = sanitizeConfig(lab2Source(cfg));
    this.intro = new Intro(this.host, this.lab);
    this.intro.embedded = true;
    this.intro.forced = true;
    this.intro.embeddedSize = [this.W, this.H];
    this.intro.onWarn = () => { if (!this.disposed) window.__logo?.renderAt?.(window.__logo.time); };
    // Порядок слоёв — из общей панели студии (если ручной режим включён).
    this.intro.setDepthOrder?.(depthOrderEnabled(cfg) ? introDepthOrder(depthOrder(cfg), this.intro.cfg.order) : null);
    this._readyPromise = this.intro.init().then(() => { this.ready = !this.disposed; });
    this._redrawWhenReady();
  }

  /** Параметры из панели → движок; структурные изменения он пересобирает сам. */
  configChanged() {
    this.lab = sanitizeConfig(lab2Source(this.cfg));
    this.intro.setConfig(this.lab);
    // Порядок слоёв приходит из общей панели «Слои» и раскладывается на
    // собственные слои лаборатории: список для человека один.
    this.intro.setDepthOrder?.(depthOrderEnabled(this.cfg) ? introDepthOrder(depthOrder(this.cfg), this.intro.cfg.order) : null);
  }

  update(t) {
    super.update(t);
    if (!this.ready) return;
    // Длительность ролика зависит от «Момента удара», скорости и паузы — таймлайн
    // студии следует за ней. Исключение одно: длительность уже задана в пульте
    // явно, и фильм после этого не менялся — тогда значение остаётся за пультом,
    // иначе поле «Держ.» возвращало бы старое число на следующем же кадре.
    const duration = totalDuration(this.lab);
    if (this.filmDuration === undefined) this.filmDuration = duration;
    if (Math.abs(this.filmDuration - duration) > 1e-3) {
      // Параметры фильма поменялись в панели: длина ролика снова следует за ним.
      this.filmDuration = duration;
      this.durationFromPanel = false;
    }
    if (this.durationFromPanel) return;
    if (Math.abs(this.cfg.timeline.holdDuration - duration) > 1e-3) this.cfg.timeline.holdDuration = duration;
  }

  /** Длительность задаётся пультом: следующий кадр её не перетирает. */
  overrideDuration(seconds) {
    this.durationFromPanel = true;
    if (this.ready) this.filmDuration = totalDuration(this.lab);
    return Number.isFinite(seconds) && seconds > 0;
  }

  holdsOwnDuration() { return true; }

  render() {
    if (!this.ready) { this._black(); return; }
    const intro = this.intro;
    intro.t = this.time;
    intro.update(this.time, 1 / 30);
    intro.composer.render();
    this.ctx.drawImage(intro.renderer.domElement, 0, 0, this.canvas.width, this.canvas.height);
  }

  dispose() {
    super.dispose();
    try { this.intro.dispose(); } catch (error) { console.warn("Лаборатория 10: ошибка освобождения", error); }
  }
}

/** Лаборатория 11 — «Монолиты» (cinematic-lab-proto-5). */
export class Lab5Scene extends LabScene {
  constructor(canvas, cfg) {
    super(canvas, cfg);
    this.film = normalizeSettings(lab5Source(cfg));
    this.prepared = -1;
    const text = `${this.film.title} ${this.film.subtitle} ${DEFAULT_SETTINGS.title}`;
    this._readyPromise = loadLab5Fonts(text).then(() => {
      if (this.disposed) return;
      this.engine = new IntroEngine(this.host, {}, null, this.film, true);
      this.engine.pause();
      this.ready = true;
    });
    this._redrawWhenReady();
  }

  configChanged() {
    this.film = normalizeSettings(lab5Source(this.cfg));
    this.engine?.setSettings(this.film);
  }

  /** Фильм 51 с: длину задаёт его собственный таймлайн, а не пульт. */
  holdsOwnDuration() { return true; }

  /** Покадровый экспорт: дожидаемся перемотки видеоэкранов монолитов. */
  async prepareFrame(t) {
    await this.whenReady();
    if (!this.engine) return;
    const time = Math.min(Math.max(0, t), LAB5_TL.end - 1e-4);
    await this.engine.renderFrame(time);
    this.prepared = t;
  }

  render() {
    if (!this.ready || !this.engine) { this._black(); return; }
    const t = Math.min(Math.max(0, this.time), LAB5_TL.end - 1e-4);
    if (Math.abs(this.prepared - this.time) > 1e-9) this.engine.seek(t);
    this.prepared = -1;
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.filter = `hue-rotate(${this.film.hue}deg) saturate(${this.film.saturation})`;
    ctx.drawImage(this.engine.canvas, 0, 0, canvas.width, canvas.height);
    ctx.restore();
    drawLab5Overlay(ctx, t, canvas.width, canvas.height, this.film);
  }

  /**
   * Состояние источников для пульта: сколько слотов занято, сколько играет и
   * что не открылось. Без этого пустой экран в кадре выглядел как ошибка
   * рендера, хотя причина — неназначенный слот или битый файл.
   */
  mediaStatus() {
    const assign = this.film?.videoAssign || [];
    const slots = assign.filter((n) => Number.isInteger(n) && n >= 0).length;
    const engine = this.engine;
    const errors = (engine?.mediaErrors || []).filter(Boolean);
    return { slots, total: assign.length, errors, ready: this.ready };
  }

  dispose() {
    super.dispose();
    try { this.engine?.dispose(); } catch (error) { console.warn("Лаборатория 11: ошибка освобождения", error); }
  }
}

export { loadFontFace };
