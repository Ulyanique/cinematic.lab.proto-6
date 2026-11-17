/**
 * Мелочи работы с DOM, общие для панелей и пульта.
 * Раньше они лежали в ui.js рядом с разметкой старой панели настроек.
 */

/**
 * Игнорировать глобальные хоткеи, когда фокус в интерактивном поле или кнопке.
 * @param {EventTarget | null} target
 */
export function isInteractiveTarget(target) {
  if (!(target instanceof Element)) return false;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement || target instanceof HTMLButtonElement ||
      target.isContentEditable) return true;
  return Boolean(target.closest("button, a[href], select, textarea, input, [contenteditable='true']"));
}

/** Разобранный JSON — файл всего проекта (`{ scenes: … }`) или одной сцены? */
export function isProjectPayload(data) {
  return Boolean(data && typeof data === "object" && !Array.isArray(data) &&
    data.scenes && typeof data.scenes === "object" && !Array.isArray(data.scenes));
}
