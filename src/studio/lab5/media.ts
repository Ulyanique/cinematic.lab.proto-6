/**
 * Исходники видеомонолитов фильма «Монолиты» (лаборатория 11).
 *
 * Раньше движок собирал путь по номеру (`video/01.mp4` … `video/10.mp4`), а в
 * папке `video/` лежат реальные ролики вечера с осмысленными именами. Из-за
 * этого ни один файл не находился, и на всех десяти экранах оставался только
 * пустой плейсхолдер. Здесь — единственный список источников: движок, панель
 * настроек и подписи в кадре берут имена и порядок из него, поэтому добавить
 * новый ролик можно правкой одной таблицы, а не поиском путей по коду.
 *
 * Порядок задан временем события в имени файла: ролик начинается с таймкода
 * вечера (00.07, 01.25, …), поэтому сортировка по имени совпадает с хронологией
 * программы — от бейджей до награждения победителей.
 */

import * as THREE from "three";
import { makePlaceholderTexture } from "./textures";
import { CLIPS } from "../clips.ts";

/**
 * Единственный перечень роликов — `studio/clip-list.js`.
 *
 * Раньше здесь лежала своя таблица имён файлов, и та же самая таблица (с теми же
 * цифрами) дублировалась в списке сцен. Два перечня успевали разойтись: подпись в
 * панели говорила одно, а верхний селектор роликов — другое. Теперь порядок и
 * длительности заданы один раз, в хронологии вечера.
 */
export interface MediaClip {
  /** Номер источника в папке `video/` (стабильный ключ для настроек). */
  id: number;
  /** Имя файла относительно папки `video/`. */
  file: string;
  /** Короткое имя для панели настроек и подписи в кадре. */
  name: string;
  /** Таймкод события из имени файла: показывается как метка в кадре. */
  timecode: string;
  /** Длительность источника, секунд (для подписи в панели и раскладки). */
  duration: number;
}

/**
 * Десять роликов вечера в хронологическом порядке.
 * `duration` — фактическая длительность файла: подпись в панели настроек
 * помогает выбрать источник под конкретный визит камеры (1,9 с на монолит).
 */
export const MEDIA_CLIPS: readonly MediaClip[] = CLIPS;

/** Число видеомонолитов: столько же, сколько визитов камеры в таймлайне фильма. */
export const MEDIA_COUNT = MEDIA_CLIPS.length;

/** Пустой слот — на случай, если источник не назначен (экран показывает плейсхолдер). */
const EMPTY_SLOT = { id: -1, file: "", name: "Нет источника", timecode: "", duration: 0 } as const;

/**
 * Адрес источника. Имена файлов содержат пробелы и кириллицу, поэтому путь
 * кодируется целиком: `encodeURI` сохраняет слэши, но экранирует и «Бэйджи»,
 * и пробел. Без этого браузер запрашивал несуществующий путь и получал 404.
 */
export function mediaUrl(index: number): string {
  const clip = MEDIA_CLIPS[index];
  if (!clip) return "";
  return `${import.meta.env.BASE_URL}video/${encodeURI(clip.file)}`;
}

/** Описание источника по индексу; для пустого слота — безопасная заглушка. */
export function mediaClip(index: number): MediaClip | typeof EMPTY_SLOT {
  return MEDIA_CLIPS[index] ?? EMPTY_SLOT;
}

/** Подпись для панели настроек: «01 · Бэйджи · 00:07 · 1,2 с». */
export function mediaLabel(index: number): string {
  const clip = mediaClip(index);
  if (!clip.file) return clip.name;
  return `${String(clip.id + 1).padStart(2, "0")} · ${clip.name} · ${clip.timecode} · ${clip.duration.toFixed(1).replace(".", ",")} с`;
}

/**
 * Варианты для <select> панели настроек: пустой слот плюс каждый источник.
 * «Пусто» стоит первым: это штатное состояние, а не ошибка, и его должно быть
 * так же просто выбрать, как любой ролик.
 */
export function mediaOptions(): { value: number; label: string }[] {
  return [
    { value: -1, label: "— пусто (плейсхолдер) —" },
    ...MEDIA_CLIPS.map((clip) => ({ value: clip.id, label: mediaLabel(clip.id) })),
  ];
}

/**
 * Текстура пустого слота. Рисуется тем же `makePlaceholderTexture`, что лежал
 * в проекте без применения, поэтому экран без источника выглядит осмысленно
 * («нет источника», номер слота), а не чёрным прямоугольником.
 */
export function makeSlotTexture(index: number): THREE.Texture {
  const clip = mediaClip(index);
  const tex = makePlaceholderTexture(clip.file ? clip.id : index, MEDIA_COUNT, 16 / 9);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Как источник заполняет окно визита камеры.
 *
 * Экран монолита живёт около 1,9 с, а ролики вечера длятся от 1,15 до 14,4 с:
 * без выбора фрагмента восемь из десяти показывали только начало, а два
 * обрывались до конца. Политика решает, что именно видит зритель.
 */
export type VideoFit = "cut" | "center" | "speed";

export const VIDEO_FIT_OPTIONS = Object.freeze([
  { value: "cut", label: "С начала и обрезка по уходу камеры" },
  { value: "center", label: "Середина ролика: кульминация кадра" },
  { value: "speed", label: "Весь ролик: подогнать скорость под визит" },
]);

/** Окно визита в секундах: от включения экрана до ухода камеры (см. timeline). */
export const VISIT_WINDOW = 1.9;

/**
 * Время источника для момента фильма `local` (секунды от включения экрана).
 * `cut` — просто линейное время; `center` — сдвиг к середине ролика;
 * `speed` — тот же фрагмент, растянутый на весь ролик.
 */
export function mediaClock(local: number, duration: number, fit: VideoFit): { time: number; rate: number } {
  const D = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const clamped = Math.max(0, local);
  if (!D) return { time: 0, rate: 1 };
  if (fit === "center") return { time: Math.min(D - 0.05, clamped + Math.max(0, (D - VISIT_WINDOW) / 2)), rate: 1 };
  if (fit === "speed") return { time: Math.min(D - 0.05, clamped * (D / VISIT_WINDOW)), rate: D / VISIT_WINDOW };
  return { time: Math.min(D - 0.05, clamped), rate: 1 };
}
