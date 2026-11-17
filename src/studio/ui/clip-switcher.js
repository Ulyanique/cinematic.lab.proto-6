import { SCENE_NAV } from '../scenes/nav.js';

/**
 * Выбор ролика сверху по центру — единственное место, где ролик переключается.
 *
 * Раньше список роликов был строкой кнопок внизу, в пульте, и дублировался
 * вкладками старой панели настроек. Три списка одного и того же — три способа
 * разойтись. Теперь ролик выбирается здесь, а пульт снизу показывает только
 * транспорт текущего ролика.
 *
 * Список строится из `SCENE_NAV`: порядок и подписи заданы один раз, поэтому
 * «Рой» — первый пункт и открывается по умолчанию.
 */
export function createClipSwitcher({ onSwitch, canSwitch }) {
  const wrap = document.createElement('div');
  wrap.className = 'clip-switch';
  wrap.innerHTML = `
    <div class="clip-switch-inner">
      <label class="sr-only" for="clip-select">Ролик</label>
      <select id="clip-select" aria-label="Ролик программы"></select>
    </div>`;
  document.body.appendChild(wrap);

  const select = wrap.querySelector('select');
  for (const scene of SCENE_NAV) {
    const option = document.createElement('option');
    option.value = scene.id;
    option.textContent = `${scene.code} · ${scene.label}`;
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
    /** Сцена переключилась (из пульта, ссылки или записи цепочки). */
    sync,
    setDisabled(value) { select.disabled = Boolean(value); },
    /** Подсветка выключена вместе с остальным хромом в простое. */
    setVisible(value) { wrap.classList.toggle('is-hidden', !value); },
  };
}
