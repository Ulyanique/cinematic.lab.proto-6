// ───────────────────────────────────────────────────────────
//  Конфигурация видеогалереи (cinematic.lab.proto-1, MIT).
//  Десять слотов-панелей золотого коридора. По умолчанию слоты пусты:
//  на экране — анимированный плейсхолдер в цветах интро, а видео или
//  фото вставляет человек через панель «Видео в галерее» (см.
//  gallery-media.js: файлы хранятся в IndexedDB, в конфиге — только имя).
// ───────────────────────────────────────────────────────────

export type MediaKind = 'video' | 'photo'

export interface MediaSlotConfig {
  kind: MediaKind
  title: string
  /** URL файла (необязательно). Если не задан — рисуется анимированный плейсхолдер */
  src?: string
}

export const BRAND = {
  name: 'ЯНТАРНЫЙ ЦИРКУЛЬ',
  presents: 'представляет',
}

/** Десять плейсхолдеров: источники назначаются в панели студии. */
export const MEDIA: MediaSlotConfig[] = Array.from({ length: 10 }, (_, i) => ({
  kind: 'video',
  title: `Кадр ${i + 1}`,
}))

// ── Таймлайн (секунды) ──
export const CLIP_T0 = 4.6 // центр первого клипа
export const CLIP_DT = 3.7 // время на один кадр
export const clipCenter = (i: number) => CLIP_T0 + i * CLIP_DT
export const FLASH_T = clipCenter(MEDIA.length - 1) + 4.4
export const END_T = FLASH_T + 9.5

// Общее окно видимости для живой сцены и покадрового экспорта.
export const PANEL_BEFORE = 2.4
export const PANEL_AFTER = 2.2
