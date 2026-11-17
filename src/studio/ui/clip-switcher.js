import { SCENE_NAV } from '../scenes/nav.js';
import { icon } from './icons.js';

/**
 * Выбор ролика сверху по центру — единственное место, где ролик переключается.
 *
 * Раньше список роликов был строкой кнопок внизу, в пульте, и дублировался
 * вкладками старой панели настроек. Три списка одного и того же — три способа
 * разойтись. Теперь ролик выбирается здесь, а пульт снизу показывает только
 * транспорт текущего ролика.
 *
 * Список строится из `SCENE_NAV`: порядок и подписи заданы один раз, поэтому
 * «Интро» — первый пункт и открывается по умолчанию.
 */
export function createClipSwitcher({ onSwitch, canSwitch }) {
  const wrap = document.createElement('div');
  wrap.className = 'clip-switch';
  wrap.innerHTML = `
    <div class="clip-switch-inner">
      <label class="sr-only" for="clip-select">Ролик</label>
      <select id="clip-select" aria-label="Ролик программы"></select>
      <span class="clip-switch-chevron" aria-hidden="true">${icon('chevronDown', 14)}</span>
    </div>`;
  document.body.appendChild(wrap);

  const select = wrap.querySelector('select');
  for (const scene of SCENE_NAV) {
    const option = document.createElement('option');
    option.value = scene.id;
    // Архивные ролики остаются доступными, но подписаны явно: иначе старый
    // «Интро» рядом с новым выглядел бы как дубль по ошибке.
    option.textContent = scene.archived
      ? `${scene.code} · ${scene.label} · архив`
      : `${scene.code} · ${scene.label}`;
    option.title = scene.title;
    select.appendChild(option);
  }

  select.addEventListener('change', () => {
    const next = select.value;
    if (canSwitch && !canSwitch()) { sync(current); return; }
    if (onSwitch(next) === false) sync(current);
  });

  let current = SCENE_NAV[0]?.id || '';
  function sync(id) {
    current = id;
    if (select.value !== id) select.value = id;
  }
  sync(current);

  return {
    el: wrap,
    select,
    /** Сцена переключилась (из списка, ссылки или режима «Авто»). */
    sync,
    setDisabled(value) { select.disabled = Boolean(value); },
    /** Подсветка выключена вместе с остальным хромом в простое. */
    setVisible(value) { wrap.classList.toggle('is-hidden', !value); },
  };
}
