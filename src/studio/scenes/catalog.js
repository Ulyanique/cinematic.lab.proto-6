import { WAITING_DEFAULTS } from "./waiting.js";
import { BRAND_DEFAULTS } from "./brand.js";
import { PHOTO_PAUSE_DEFAULTS } from "./photo-pause.js";
import { PARTNERS_DEFAULTS, SPONSOR_PROMRUKAV_DEFAULTS, SPONSOR_KEAZ_DEFAULTS } from "./partners.js";
import { FINALE_DEFAULTS } from "./finale.js";
import { LAB2_DEFAULTS, LAB5_DEFAULTS, LAB2_ID, LAB5_ID } from "./labs.js";

// Базовый формат кадра. Это единственный источник числа 1920×1080: остальные
// модули (битрейт, масштаб макета, профили мастера) считают от него, чтобы
// константы не разъезжались при смене базы.
export const BASE_FRAME = Object.freeze({ width: 1920, height: 1080 });
/** Площадь базового кадра в пикселях — база для битрейта и масштабов. */
export const BASE_PIXELS = BASE_FRAME.width * BASE_FRAME.height;
// Единственный технический формат цикла. Других разрешений и пресетов нет.
// 30 fps — целевая частота программы: вдвое меньше кадров на тот же битрейт
// в секунду, то есть вдвое больше бюджета на кадр, и вдвое быстрее покадровый
// экспорт. Движение сцен построено на абсолютном времени, поэтому ритм не
// меняется; стробирование вращения компенсирует затвор (photo-shutter).
export const OUTPUT = Object.freeze({ ...BASE_FRAME, fps: 30 });

/**
 * Каталог — производственный план, а не набор фиктивных готовых заставок.
 * Виды 1, 2, 8 и 9 имеют адаптеры; прочие потребуют отдельного сценария.
 */
export const SCENES = Object.freeze([
  // Прежнее «Интро» — заставка ожидания из первой версии студии. Новое интро —
  // лаборатория 10, поэтому этот ролик помечен архивным: он остаётся доступным
  // и записывается как обычно, но код у него архивный (A1), и в списке он
  // подписан явно. Внутренний id сохранён: по нему лежат сохранённые настройки
  // и старые ссылки ?scene=waiting.
  { id: "waiting", title: "Архив — прежнее интро: ожидание вечера", code: "A1", label: "Интро (архив)", status: "ready", archived: true, defaults: WAITING_DEFAULTS },
  { id: "brand", title: "Фирменный фон для речи, ужина и музыкальных сетов", code: "02", label: "Фон", status: "ready", defaults: BRAND_DEFAULTS },
  { id: "dream-project", title: "Проект мечты", status: "planned" },
  { id: "partners", title: "Спонсоры и партнёры (макет)", code: "04", label: "Спонсоры", status: "preview", defaults: PARTNERS_DEFAULTS },
  // Заставки отдельных спонсоров: тот же кадр, но один знак крупно по центру.
  { id: "sponsor-promrukav", title: "Спонсор — Промрукав", code: "05а", label: "Промрукав", status: "preview", defaults: SPONSOR_PROMRUKAV_DEFAULTS },
  { id: "sponsor-keaz", title: "Спонсор — КЭАЗ", code: "05б", label: "КЭАЗ", status: "preview", defaults: SPONSOR_KEAZ_DEFAULTS },
  { id: "archive", title: "Янтарный циркуль: помним всё", status: "needs-assets" },
  { id: "trick-brief", title: "ТЗ с подвохом", status: "needs-host" },
  { id: "architect", title: "Проектировщик объясняет", status: "needs-host" },
  { id: "photo-pause", title: "Фотопауза", code: "08", label: "Фотопауза", status: "ready", defaults: PHOTO_PAUSE_DEFAULTS },
  { id: "finale", title: "Янтарный циркуль / История продолжается", code: "09", label: "Финал", status: "ready", defaults: FINALE_DEFAULTS },
  // Кинематографичные лаборатории (cinematic-lab-proto-2 и proto-5).
  // Первая анимация программы. Внутри — 3D-эмблема из роя частиц; в интерфейсе
  // она называется просто «Интро», потому что открывает показ.
  { id: LAB2_ID, title: "Интро — 3D-эмблема из роя частиц и объёмные буквы", code: "01", label: "Интро", status: "ready", defaults: LAB2_DEFAULTS },
  { id: LAB5_ID, title: "Лаборатория 11 — Монолиты: кинофильм 51 с", code: "11", label: "Монолиты", status: "ready", defaults: LAB5_DEFAULTS },
]);

/**
 * Ролики, которые можно открыть и записать. Это единственный список id для
 * пульта, панели настроек и цепочки: раньше у каждого модуля был свой, и
 * наборы успевали разойтись. `chain` — сцена по умолчанию входит в автопоказ;
 * спонсорские заставки играют отдельно.
 */
export const PLAYABLE_SCENES = Object.freeze(
  SCENES.filter((scene) => scene.defaults && ["ready", "preview"].includes(scene.status))
    .map((scene) => ({
      id: scene.id,
      title: scene.title,
      code: scene.code,
      label: scene.label,
      archived: scene.archived === true,
      chain: scene.id !== "sponsor-promrukav" && scene.id !== "sponsor-keaz",
    }))
);

/** @param {string} id */
export function sceneById(id) {
  // «intro» — человеческий адрес интро программы: теперь это лаборатория 10.
  // Прежнее интро живёт по своему id (waiting) и по-прежнему открывается.
  const canonical = id === "intro" ? LAB2_ID : id;
  return SCENES.find((scene) => scene.id === canonical);
}
