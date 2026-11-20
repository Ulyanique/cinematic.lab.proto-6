import { LabScene } from './lab-scenes.js';
import { GalleryEngine } from './gallery/engine.ts';
import { END_T } from './gallery/config.ts';
import { GALLERY_SLOT_COUNT } from './scenes/gallery.js';
import { galleryFileFor, galleryNameFor, clearGalleryFile, loadGalleryFiles } from './gallery-media.js';
import { isBuiltinGalleryName, builtinGalleryUrl } from './gallery-defaults.js';

/**
 * Адаптер видеогалереи к общему циклу студии (как Lab5Scene у «Монолитов»):
 * движок рисует в скрытом хосте фиксированного размера, адаптер копирует кадр
 * в холст сцены. Время идёт по таймлайну студии; видео слотов перематываются
 * на каждый кадр экспорта (prepareFrame), в предпросмотре играют по видимости.
 */
export class GalleryScene extends LabScene {
  constructor(canvas, cfg) {
    super(canvas, cfg);
    this.engine = new GalleryEngine(this.host, { manual: true, shards: this.cfg?.gallery_effects?.shards !== false });
    this.engine.pause();
    this.loadedNames = Array(GALLERY_SLOT_COUNT).fill(null);
    this.errors = Array(GALLERY_SLOT_COUNT).fill('');
    this.prepared = -1;
    // Идущие загрузки: i -> Promise. Нужны, чтобы покадровый экспорт мог
    // дождаться слотов, запрошенных «фоном» из предпросмотра.
    this._loading = new Map();
    // Все синхронизации идут через одну цепочку: медиа грузятся строго по
    // очереди. Параллельно запросившиеся в один кадр ролики подвисали на
    // фазе metadata в headless-Chromium, а последовательная загрузка (как
    // было до ленивого режима) всегда срабатывала.
    this._syncChain = Promise.resolve();
    this._readyPromise = (async () => {
      await loadGalleryFiles();
      if (this.disposed) return;
      await this.syncSlots();
      this.ready = true;
    })();
    this._redrawWhenReady();
  }

  /** Фильм фиксированной длины: удержание задаёт сам ролик, а не пульт. */
  holdsOwnDuration() { return true; }

  /** Имя файла в конфиге слота ('' — плейсхолдер). */
  slotNames() {
    const section = this.cfg.gallery_video || {};
    return Array.from({ length: GALLERY_SLOT_COUNT }, (_, i) => String(section[`slot${i}`] || ''));
  }

  /** Синхронизация слотов: выход через одну последовательную очередь. */
  syncSlots() {
    const run = this._syncChain.then(() => this._syncSlotsInner());
    this._syncChain = run.catch(() => {});
    return run;
  }  async _assignSlot(i, desired) {
    const file = galleryFileFor(i);
    if (file) {
      const ok = await this.engine.assignSlotFile(i, file);
      if (!ok) this.errors[i] = `Не удалось открыть «${desired}» — проверьте формат видео`;
      return ok;
    }
    if (isBuiltinGalleryName(desired)) {
      // Встроенный клиент из сборки: свой файл всегда в приоритете выше.
      const ok = await this.engine.assignSlotUrl(i, builtinGalleryUrl(desired));
      if (!ok) this.errors[i] = `Не удалось открыть встроенный «${desired}»`;
      return ok;
    }
    this.errors[i] = `Файл «${desired}» не найден в этом браузере — загрузите его снова`;
    return false;
  }

  /** Синхронизация слотов: выход через одну последовательную очередь. */
  syncSlots() {
    const run = this._syncChain.then(() => this._syncSlotsInner());
    this._syncChain = run.catch(() => {});
    return run;
  }

  /**
   * Синхронизировать слоты движка с конфигом: грузим всё назначенное.
   * Ленивый режим пробовали и отменили: у клипа-петли все панели нужны в
   * течение первой минуты, а перемотка/экспорт обязаны видеть каждый слот;
   * на слабом GPU параллельные медиа-запросы к тому же подвисали.
   */
  async _syncSlotsInner() {
    const names = this.slotNames();
    for (let i = 0; i < GALLERY_SLOT_COUNT; i++) {
      const desired = names[i];
      if (desired === this.loadedNames[i]) continue;
      if (!desired) {
        this.loadedNames[i] = desired;
        this.errors[i] = '';
        this.engine.clearSlot(i);
        clearGalleryFile(i);
        continue;
      }
      this.loadedNames[i] = desired;
      this.errors[i] = '';
      const p = this._assignSlot(i, desired).finally(() => this._loading.delete(i));
      this._loading.set(i, p);
      await p;
      if (this.disposed) return;
    }
  }

  configChanged() {
    this.engine?.setShards(this.cfg?.gallery_effects?.shards !== false);
    void this.syncSlots().then(() => {
      if (!this.disposed) window.__logo?.renderAt?.(window.__logo.time);
    });
  }

  /** Покадровый экспорт: перемотать видео активных панелей на кадр t. */
  async prepareFrame(t) {
    await this.whenReady();
    if (!this.engine || this.disposed) return;
    // syncSlots дожидается всю очередь последовательных загрузок сама.
    await this.syncSlots();
    await Promise.allSettled([...this._loading.values()]);
    const time = Math.min(this.filmTime(t, END_T), END_T - 1e-4);
    await this.engine.prepareExportFrame(time);
    this.engine.renderAt(time);
    this.prepared = t;
  }

  render() {
    if (!this.ready || !this.engine) { this._black(); return; }
    const t = Math.min(this.filmTime(this.time, END_T), END_T - 1e-4);
    this.engine.setPlaying(!this.cfg.playback?.paused);
    if (Math.abs(this.prepared - this.time) > 1e-9) this.engine.renderAt(t);
    this.prepared = -1;
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(this.engine.canvas, 0, 0, canvas.width, canvas.height);
  }

  /** Состояние слотов для пульта: сколько занято и что не открылось. */
  mediaStatus() {
    const names = this.slotNames();
    const filled = names.filter((name, i) => name && this.engine?.slotFilled(i)).length;
    const errors = this.errors.filter(Boolean);
    return { slots: filled, total: GALLERY_SLOT_COUNT, errors, ready: this.ready };
  }

  dispose() {
    super.dispose();
    try { this.engine?.dispose(); } catch (error) { console.warn('Видеогалерея: ошибка освобождения', error); }
  }
}
