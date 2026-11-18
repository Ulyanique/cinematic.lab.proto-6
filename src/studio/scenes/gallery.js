import { createSharedSceneConfig } from './shared-visuals.js';
import { END_T, FLASH_T, CLIP_T0, PANEL_BEFORE } from '../gallery/config.ts';

/**
 * Видеогалерея (cinematic.lab.proto-1, MIT): золотой коридор из десяти панелей
 * в цветах интро. Слоты по умолчанию пусты — плейсхолдеры; видео или фото
 * вставляет человек в панели «Видео в галерее» (раздел gallery_video).
 *
 * Таймлайн повторяет фильм исходника: первая панель входит в 2,2 с, финал —
 * вспышка в FLASH_T, уход — до END_T. Длительность фиксирована (holdsOwnDuration
 * в адаптере), поэтому фазы заданы один раз здесь.
 */
export const GALLERY_ID = 'gallery';
export const GALLERY_SLOT_COUNT = 10;

const entry = CLIP_T0 - PANEL_BEFORE; // 2.2 с — появление первой панели
const GALLERY_TIMELINE = {
  drawDuration: entry,
  emergeDuration: 0,
  holdDuration: Math.max(0.2, FLASH_T - entry),
  fadeDuration: Math.max(0.2, END_T - FLASH_T),
  restDuration: 0,
  startDelay: 0,
  ringsIntro: 2.4,
  speed: 1,
  beatBpm: 120,
  beatOffset: 0,
};

export const GALLERY_DEFAULTS = (() => {
  const cfg = createSharedSceneConfig(GALLERY_TIMELINE);
  cfg.transition = { duration: 0.9 };
  cfg.caption.titleVisible = false;
  cfg.gallery_video = Object.fromEntries(
    Array.from({ length: GALLERY_SLOT_COUNT }, (_, i) => [`slot${i}`, '']),
  );
  return cfg;
})();
