/**
 * Встроенные клипы видеогалереи: десять роликов лежат в репозитории
 * (`video/gallery/01.mp4`…`10.mp4`, скачаны из Google Drive, папка «yz»)
 * и отдаются как обычные файлы — как ролики вечера в `video/`.
 *
 * Приоритет всегда у файла, который пользователь загрузил в слот сам
 * (IndexedDB): встроенный файл используется только когда слота не трогали.
 */

export const GALLERY_BUILTIN = Object.freeze(
  Array.from({ length: 10 }, (_, i) => `${String(i + 1).padStart(2, '0')}.mp4`),
);

export const GALLERY_BUILTIN_FLAG = 'gallery-builtin-clips-v1';

/** Имя слота — один из встроенных клипов? */
export function isBuiltinGalleryName(name) {
  return GALLERY_BUILTIN.includes(String(name ?? '').trim());
}

/** URL встроенного клипа с учётом BASE_URL сборки. */
export function builtinGalleryUrl(name) {
  const base = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';
  return `${base}video/gallery/${encodeURIComponent(String(name ?? '').trim())}`;
}

/** Одноразово заполнить пустые слоты встроенными клипами; свои файлы не трогаем. */
export function migrateGalleryBuiltinClips(saved) {
  const next = structuredClone(saved && typeof saved === 'object' ? saved : {});
  const gv = next.gallery_video && typeof next.gallery_video === 'object' ? { ...next.gallery_video } : {};
  for (let i = 0; i < GALLERY_BUILTIN.length; i++) {
    const key = `slot${i}`;
    if (!String(gv[key] ?? '').trim()) gv[key] = GALLERY_BUILTIN[i];
  }
  next.gallery_video = gv;
  return next;
}
