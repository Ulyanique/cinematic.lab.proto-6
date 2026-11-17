import { RECORDING_CHAIN } from './scenes/catalog.js';
import { CHAIN_SCENES } from './scenes/nav.js';

/**
 * Все сцены, которые могут входить в настраиваемую программу показа/записи.
 * Список не локальный: он собран из каталога роликов (scenes/nav.js), поэтому
 * новая сцена появляется здесь сама, без правки второго перечня.
 */
export const CHAIN_CANDIDATES = Object.freeze(
  CHAIN_SCENES.map((scene) => ({ id: scene.id, code: scene.code, label: scene.label }))
);

export const RECORDING_CHAIN_KEY = 'circle-anim-recording-chain-v1';

const VALID_IDS = new Set(CHAIN_CANDIDATES.map((c) => c.id));

function storage() {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch (_) { return null; }
}

/**
 * Нормализует список идентификаторов сцен в каноническом порядке показа.
 * Невалидные и дублирующиеся элементы отбрасываются; пустой список заменяется
 * штатной цепочкой `RECORDING_CHAIN` (01 → 02 → 08 → 09).
 * @param {unknown} list
 * @returns {string[]}
 */
export function normalizeChain(list) {
  if (!Array.isArray(list)) return [...RECORDING_CHAIN];
  const chosen = new Set(list.filter((id) => typeof id === 'string' && VALID_IDS.has(id)));
  const ordered = CHAIN_CANDIDATES.map((c) => c.id).filter((id) => chosen.has(id));
  return ordered.length >= 1 ? ordered : [...RECORDING_CHAIN];
}

/** @param {any} [store] @returns {string[]} */
export function loadRecordingChain(store = storage()) {
  try {
    const raw = store?.getItem(RECORDING_CHAIN_KEY);
    if (!raw) return [...RECORDING_CHAIN];
    return normalizeChain(JSON.parse(raw));
  } catch (_) {
    return [...RECORDING_CHAIN];
  }
}

/** @param {unknown} list @param {any} [store] @returns {string[]} */
export function saveRecordingChain(list, store = storage()) {
  const next = normalizeChain(list);
  try { store?.setItem(RECORDING_CHAIN_KEY, JSON.stringify(next)); } catch (_) { /* приватный режим */ }
  return next;
}

/** Короткая метка цепочки для имени файла, например `circle-01-02-08-09` или `circle-01-02-04-08-09`.
 * @param {readonly string[]} ids */
export function chainBaseFilename(ids) {
  const codes = ids.map((id) => CHAIN_CANDIDATES.find((c) => c.id === id)?.code || id);
  return `circle-${codes.join('-')}`;
}
