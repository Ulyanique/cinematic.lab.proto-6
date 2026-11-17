/**
 * Единственный список роликов вечера — файлы папки `video/`.
 *
 * Раньше в проекте было два независимых перечня: таблица источников для
 * монолитов фильма (`lab5/media.ts`) и список сцен-заставок (`scenes/catalog.js`).
 * Из-за этого «ролик» в выпадающем списке сверху и «ролик» на экране монолита
 * означали разное, а номер в подписи не совпадал с временем события.
 *
 * Здесь порядок задан хронологией вечера — по таймкоду в имени файла. Список
 * используется верхним селектором роликов, левой панелью слоёв и подписями в
 * кадре: добавить файл в `video/` теперь значит добавить одну строку здесь.
 */

export interface Clip {
  id: number;
  file: string;
  name: string;
  timecode: string;
  duration: number;
}

export const CLIPS: readonly Clip[] = Object.freeze([
  { id: 0, file: "00.07 Бэйджи.mp4", name: "Бэйджи", timecode: "00:07", duration: 1.15 },
  { id: 1, file: "01.25 СобольАнисимов.mp4", name: "Соболь и Анисимов", timecode: "01:25", duration: 2.44 },
  { id: 2, file: "01.25-01.28 Шульган.mp4", name: "Шульган", timecode: "01:25", duration: 4.77 },
  { id: 3, file: "03.34 Тихонова.mp4", name: "Тихонова", timecode: "03:34", duration: 2.61 },
  { id: 4, file: "03.36 Общий план зала.mp4", name: "Общий план зала", timecode: "03:36", duration: 1.71 },
  { id: 5, file: "03.52 Зикеев.mp4", name: "Зикеев", timecode: "03:52", duration: 5.29 },
  { id: 6, file: "04.51 Боровская.mp4", name: "Боровская", timecode: "04:51", duration: 4.01 },
  { id: 7, file: "04.59 Юшкевичус.mp4", name: "Юшкевичус", timecode: "04:59", duration: 3.44 },
  { id: 8, file: "05.41 фотозона.mp4", name: "Фотозона", timecode: "05:41", duration: 14.4 },
  { id: 9, file: "05.44 все победители.mp4", name: "Все победители", timecode: "05:44", duration: 4.79 },
]);

/** Сколько роликов в папке — столько же слотов-монолитов и пунктов списка. */
export const CLIP_COUNT = CLIPS.length;

/** @param {number} index */
export function clipAt(index: number) {
  return CLIPS[index] || CLIPS[0];
}

/**
 * Подпись для интерфейса: «00:07 · Бэйджи · 1,2 с».
 * Время события стоит первым: по нему ролик находят быстрее, чем по номеру.
 */
export function clipLabel(clip: Clip | undefined) {
  if (!clip) return '—';
  return `${clip.timecode} · ${clip.name} · ${clip.duration.toFixed(1).replace('.', ',')} с`;
}
