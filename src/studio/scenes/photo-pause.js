import { LAB2_BRAND_DEFAULTS } from "./labs.js";

/**
 * Фотопауза — та же композиция, что «Фон» (№ 02): интро-сборка эмблемы из роя,
 * объёмная надпись, кольца и свет «фона», без подзаголовка и даты. Два своих
 * штриха: вместо «ЯНТАРНЫЙ ЦИРКУЛЬ» — слово «ФОТОПАУЗА» мельче, а дуги
 * «циркуля» вокруг знака заменены апертурой фотографической диафрагмы
 * (как была на прежней фотопаузе). Русский текст короче исходной строки,
 * поэтому `scale` уменьшен: буквы мельче, а не просто короче.
 */
export const PHOTO_PAUSE_DEFAULTS = (() => {
  const cfg = JSON.parse(JSON.stringify(LAB2_BRAND_DEFAULTS));
  // Надпись: «ФОТОПАУЗА», мельче «ЯНТАРНОГО ЦИРКУЛЯ».
  cfg.lab2_title.text = "ФОТОПАУЗА";
  cfg.lab2_title.scale = 0.62;
  // Дуги циркуля вокруг эмблемы убраны: их место занимает апертура.
  cfg.lab2_compass.enabled = false;
  // Собственная настройка апертуры (раздел «Апертура»): как на прежней фотопаузе.
  cfg.photo = {
    apertureEnabled: true, apertureOffsetX: 0, apertureOffsetY: 0,
    apertureRadius: 3.1, apertureOpacity: 0.85, apertureColor: "#e8c77e",
  };
  return cfg;
})();
