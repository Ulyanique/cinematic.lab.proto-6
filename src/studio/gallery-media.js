/**
 * Файлы слотов видеогалереи: видео и фото слишком велики для localStorage,
 * поэтому в конфиге сцены лежит только имя файла, а сам Blob хранится в
 * IndexedDB (переживает перезагрузку) и в памяти сессии (мгновенный доступ
 * для движка). Без IndexedDB — только память: слот работает до перезагрузки.
 */

const DB_NAME = 'cinematic-gallery-media';
const STORE = 'files';
const memory = new Map(); // slot -> { file: Blob, name: string }

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB недоступен')); return; }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'slot' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function dbPut(slot, file, name) {
  return openDb().then(db => new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ slot, file, name });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch { resolve(false); }
    finally { db.close(); }
  })).catch(() => false);
}

function dbDelete(slot) {
  return openDb().then(db => new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(slot);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch { resolve(false); }
    finally { db.close(); }
  })).catch(() => false);
}

function dbAll() {
  return openDb().then(db => new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).getAll();
      request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
      request.onerror = () => resolve([]);
    } catch { resolve([]); }
    finally { db.close(); }
  })).catch(() => []);
}

/** Файл слота из памяти сессии (или null, если не загружен). */
export function galleryFileFor(slot) {
  return memory.get(slot)?.file || null;
}

/** Имя файла слота из памяти сессии. */
export function galleryNameFor(slot) {
  return memory.get(slot)?.name || '';
}

/** Положить файл в слот: память сразу, IndexedDB — фоном. */
export function setGalleryFile(slot, file) {
  const name = file?.name || 'файл';
  memory.set(slot, { file, name });
  void dbPut(slot, file, name);
  return name;
}

/** Убрать файл слота из памяти и IndexedDB. */
export function clearGalleryFile(slot) {
  memory.delete(slot);
  void dbDelete(slot);
}

/** Прочитать все сохранённые файлы в память (вызывается при старте сцены). */
export async function loadGalleryFiles() {
  const rows = await dbAll();
  for (const row of rows) {
    if (row && Number.isInteger(row.slot) && row.file) memory.set(row.slot, { file: row.file, name: row.name || 'файл' });
  }
  return memory.size;
}

/** Индекс слота из ключа поля панели (`slot0`…`slot9`) или -1. */
export function gallerySlotIndex(key) {
  const match = /^slot(\d+)$/.exec(String(key || ''));
  return match ? Number(match[1]) : -1;
}

/** Только для тестов: очистить память сессии. */
export function _resetGalleryMemory() { memory.clear(); }
