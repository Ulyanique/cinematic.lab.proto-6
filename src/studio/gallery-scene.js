import { LabScene } from './lab-scenes.js';
import { GalleryEngine } from './gallery/engine.ts';
import { END_T } from './gallery/config.ts';
import { GALLERY_SLOT_COUNT } from './scenes/gallery.js';
import { galleryFileFor, galleryNameFor, clearGalleryFile, loadGalleryFiles } from './gallery-media.js';

/**
 * Адаптер видеогалереи к общему циклу студии (как Lab5Scene у «Монолитов»):
 * движок рисует в скрытом хосте фиксированного размера, адаптер копирует кадр
 * в холст сцены. Время идёт по таймлайну студии; видео слотов перематываются
 * на каждый кадр экспорта (prepareFrame), в предпросмотре играют по видимости.
 */
export class GalleryScene extends LabScene {
  constructor(canvas, cfg) {
    super(canvas, cfg);
    this.engine = new GalleryEngine(this.host, { manual: true });
    this.engine.pause();
    this.loadedNames = Array(GALLERY_SLOT_COUNT).fill(null);
    this.errors = Array(GALLERY_SLOT_COUNT).fill('');
    this.prepared = -1;
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

  /** Синхронизировать слоты движка с конфигом: загрузить новые, убрать пустые. */
  async syncSlots() {
    const names = this.slotNames();
    for (let i = 0; i < GALLERY_SLOT_COUNT; i++) {
      const desired = names[i];
      if (desired === this.loadedNames[i]) continue;
      this.loadedNames[i] = desired;
      this.errors[i] = '';
      if (!desired) {
        this.engine.clearSlot(i);
        clearGalleryFile(i);
        continue;
      }
      const file = galleryFileFor(i);
      if (!file) {
        this.errors[i] = `Файл «${desired}» не найден в этом браузере — загрузите его снова`;
        continue;
      }
      const ok = await this.engine.assignSlotFile(i, file);
      if (!ok) this.errors[i] = `Не удалось открыть «${desired}» — проверьте формат видео`;
      if (this.disposed) return;
    }
  }

  configChanged() {
    void this.syncSlots().then(() => {
      if (!this.disposed) window.__logo?.renderAt?.(window.__logo.time);
    });
  }

  /** Покадровый экспорт: перемотать видео активных панелей на кадр t. */
  async prepareFrame(t) {
    await this.whenReady();
    if (!this.engine || this.disposed) return;
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
