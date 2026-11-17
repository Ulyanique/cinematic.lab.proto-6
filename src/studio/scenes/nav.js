import { PLAYABLE_SCENES } from "./catalog.js";

/**
 * Единый список роликов для всего интерфейса.
 *
 * Раньше одни и те же сцены были перечислены трижды: кнопками в пульте
 * (operator.js), вкладками панели настроек (main.js → READY_IDS) и отдельным
 * списком цепочки записи. Наборы расходились, подписи и порядок жили в двух
 * местах. Теперь порядок и подписи заданы один раз здесь, а верхний список
 * роликов и автопоказ строятся из него.
 */

/**
 * @typedef {object} SceneNav
 * @property {string} id      идентификатор сцены
 * @property {string} code    код в программе («01», «05а» …)
 * @property {string} label   короткое имя для пульта и вкладок
 * @property {string} title   полное название для подсказки и заголовка
 * @property {boolean} program  участвует ли сцена в автопоказе программы
 * @property {boolean} archived сцена из прежних версий: доступна, но помечена
 */

/**
 * «Интро» открывает программу: лаборатория 10 — первая анимация вечера, она
 * стоит в списке роликов и в выпадающем списке сверху раньше остальных, поэтому
 * студия стартует именно с неё (см. `DEFAULT_SCENE_ID`).
 */
export const INTRO_SCENE_ID = "lab-swarm";

/** Порядок показа: рой-интро, затем остальные ролики в порядке каталога. */
const ORDERED = [
  ...PLAYABLE_SCENES.filter((scene) => scene.id === INTRO_SCENE_ID),
  ...PLAYABLE_SCENES.filter((scene) => scene.id !== INTRO_SCENE_ID),
];

/** @type {readonly SceneNav[]} */
export const SCENE_NAV = Object.freeze(
  ORDERED.map((scene) =>
    Object.freeze({
      id: scene.id,
      code: scene.code,
      label: scene.label,
      title: scene.title,
      // Заставка спонсора — тот же кадр, что «Спонсоры», но со своим знаком:
      // в автопоказ её ставят отдельно, поэтому по умолчанию она вне программы.
      program: scene.chain !== false,
      archived: scene.archived === true,
    })
  )
);

/** @param {string} id */
export function sceneNav(id) {
  // «intro» теперь адрес лаборатории 10 — там же, где каталог ищет сцену.
  const canonical = id === "intro" ? INTRO_SCENE_ID : id;
  return SCENE_NAV.find((scene) => scene.id === canonical);
}

/** Ролик, который открывается при запуске студии. */
export const DEFAULT_SCENE_ID = SCENE_NAV[0].id;

/** Готовые ролики, которые участвуют в автопоказе программы. */
export const PROGRAM_SCENES = Object.freeze(SCENE_NAV.filter((scene) => scene.program));
