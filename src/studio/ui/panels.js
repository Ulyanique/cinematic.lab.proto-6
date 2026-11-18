import { createFloatPanel, ICON_LAYERS, ICON_GEAR, ICON_EXPORT } from './float-panel.js';
import { icon as ico } from './icons.js';
import { groupLayers, layerMeta } from './layer-registry.js';
import { DEPTH_LABELS, INTRO_DEPTH_LABELS, isIntroDepthScene } from '../depth-order.js';
import { eyeKey as ruleEyeKey, SECTION_NOTES } from './field-rules.js';
import { isInteractiveTarget } from './dom.js';
import { FRAME_SECTIONS, frameSummary, probeDeliveries } from '../output-settings.js';

/**
 * Две плавающие панели: слева — слои композиции, справа — настройки выбранного
 * слоя. Выбор строки слева раскрывает справа её параметры: одно действие,
 * один результат, как в референсе.
 *
 * Панели ничего не знают о сцене напрямую: они спрашивают `getSections()` и
 * пишут через `commit(sectionId, key, value)`. Поэтому одинаково работают и для
 * классических сцен, и для лабораторий.
 */

const decimals = (step) => {
  const s = String(step ?? 0.01);
  return s.includes('.') ? s.split('.')[1].length : 0;
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * @param {object} options
 * @param {() => { sections: any[], sceneId: string, config: any, defaults: any, sceneLabel: string }} options.getState
 * @param {(sectionId: string) => void} [options.onSelect]
 * @param {(id: string) => boolean} [options.onSwitchScene]
 * @param {() => void} [options.onClosed]   панель закрыта — снять подсветку кнопки
 */
export function createStudioPanels({
  getState, onSelect, onSwitchScene, onClosed, onCommand, onToast,
  // Кадр и запись, JSON и снимки вариантов приходят снаружи: панель не знает,
  // как рендерится кадр, и не дублирует правила сохранения проекта.
  getFrameSettings, onFrameSetting,
  getProjectJSON, onApplyScene, onApplyProject, onPauseToggle, onExportVideo,
  configToJSON, parseConfigJSON, parseProjectJSON, isProjectPayload,
  cloneDefaults, saveSceneSnapshot, loadSceneSnapshot, hasSceneSnapshot,
  encodeConfigShareHash,
  // Сброс к стандартным и порядок слоёв по глубине.
  onReset, depthOrder, depthOrderStep, depthOrderReset,
  // Разделы, у которых каждая строка — отдельный эффект (стек эффектов).
  effectKeys,
}) {
  /**
   * Текст кнопки с иконкой: в разметке одна строка, а не три узла, и подпись
   * остаётся доступной для поиска и тестов.
   */
  const withIcon = (name, text, size = 13) => `${ico(name, size)}<span>${text}</span>`;

  let selected = null;
  let panelOpenLayers = false;
  let panelOpenSettings = false;
  /** Вкладка правой панели: слой, общие настройки кадра или JSON. */
  let tab = 'layer';
  let probeKey = '';
  let probeToken = 0;

  // ── левая панель: слои ───────────────────────────────────────────────
  const layers = createFloatPanel({
    title: 'Слои',
    icon: ICON_LAYERS,
    key: 'layers',
    side: 'left',
    width: 292,
    y: 60,
    onClose: () => { panelOpenLayers = false; syncButtons(); onClosed?.(); },
  });
  // ── правая панель: настройки выбранного слоя ──────────────────────────
  const settings = createFloatPanel({
    title: 'Настройки',
    icon: ICON_GEAR,
    key: 'settings',
    side: 'right',
    width: 344,
    y: 60,
    onClose: () => { panelOpenSettings = false; syncButtons(); onClosed?.(); },
  });

  const buttons = document.createElement('div');
  buttons.className = 'studio-buttons';
  buttons.innerHTML = `
    <button type="button" class="studio-btn studio-btn-layers" data-role="layers"
      aria-label="Слои композиции" aria-pressed="false" title="Слои композиции — выбрать элемент">
      ${ICON_LAYERS}
    </button>
    <button type="button" class="studio-btn studio-btn-export" data-role="export"
      aria-label="Записать текущий ролик в видео" title="Записать текущий ролик в видео">
      ${ICON_EXPORT}
    </button>
    <button type="button" class="studio-btn studio-btn-settings" data-role="settings"
      aria-label="Настройки выбранного слоя" aria-pressed="false" title="Настройки выбранного слоя">
      ${ICON_GEAR}
    </button>`;
  document.body.appendChild(buttons);
  const layersBtn = buttons.querySelector('[data-role="layers"]');
  const settingsBtn = buttons.querySelector('[data-role="settings"]');
  const exportBtn = buttons.querySelector('[data-role="export"]');

  function syncButtons() {
    layersBtn.setAttribute('aria-pressed', String(panelOpenLayers));
    settingsBtn.setAttribute('aria-pressed', String(panelOpenSettings));
    document.body.classList.toggle('panels-on', panelOpenLayers || panelOpenSettings);
  }

  layersBtn.addEventListener('click', () => {
    panelOpenLayers = !panelOpenLayers;
    if (panelOpenLayers) layers.open(); else layers.close();
    syncButtons();
  });
  settingsBtn.addEventListener('click', () => {
    panelOpenSettings = !panelOpenSettings;
    if (panelOpenSettings) { renderInspector(); settings.open(); } else settings.close();
    syncButtons();
  });
  // Запись — рядом с настройками, в верхней строке. Раньше кнопка жила в
  // нижнем пульте вместе с «Все ролики» и «Составом»: человек искал экспорт
  // там же, где монтаж, хотя это разные задачи. Ролики пишутся по одному —
  // тот, что сейчас открыт.
  exportBtn.addEventListener('click', () => onExportVideo?.());

  // ── выбор слоя ───────────────────────────────────────────────────────
  function select(sectionId, { openInspector = true } = {}) {
    selected = sectionId;
    // Выбор слоя всегда показывает его параметры: остаться на вкладке «Кадр»
    // или «JSON» после клика по слою значило бы, что клик не сработал.
    tab = 'layer';
    renderLayers();
    renderInspector();
    if (openInspector) {
      panelOpenSettings = true;
      settings.open();
      syncButtons();
    }
    onSelect?.(sectionId);
  }

  /** Текущий выбранный раздел, с поправкой на смену ролика. */
  function ensureSelection(sections) {
    if (!selected || !sections.some((s) => s.id === selected)) {
      selected = sections[0]?.id || null;
    }
    return selected;
  }

  /**
   * Поиск по слоям. В «Рое» и «Монолитах» разделов больше сорока, и без
   * фильтра нужная строка ищется глазами по всему списку. Поле создаётся один
   * раз: перерисовка списка не должна отбирать фокус у набора.
   */
  let searchEl = null;
  function ensureSearch() {
    if (searchEl) return searchEl;
    const wrap = document.createElement('div');
    wrap.className = 'lyr-search';
    const input = document.createElement('input');
    input.type = 'search';
    input.className = 'lyr-search-input';
    input.placeholder = 'Найти слой';
    input.setAttribute('aria-label', 'Найти слой');
    input.addEventListener('input', () => applyFilter(input.value));
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      input.value = '';
      applyFilter('');
    });
    wrap.appendChild(input);
    searchEl = wrap;
    return wrap;
  }

  /** Скрыть строки и группы, которые не подходят под запрос. */
  function applyFilter(query) {
    const q = String(query || '').trim().toLowerCase();
    const depthBlock = layers.body.querySelector('.lyr-depth');
    if (depthBlock) depthBlock.hidden = false;
    for (const group of layers.body.querySelectorAll('.lyr-group')) {
      if (group.classList.contains('lyr-depth')) { group.hidden = Boolean(q); continue; }
      let shown = 0;
      for (const row of group.querySelectorAll('.lyr-row')) {
        const text = row.textContent.toLowerCase();
        const hit = !q || text.includes(q);
        row.hidden = !hit;
        if (hit) shown++;
      }
      group.hidden = shown === 0;
    }
  }

  /**
   * Список глубины: чем выше строка, тем ближе слой к зрителю.
   *
   * Это отдельный от разделов схемы список намеренно: раздел — это набор
   * параметров (у «Колец» их двадцать), а здесь речь о том, что перекрывает
   * что. Список общий для всех ролей программы: у лаборатории 10 он
   * раскладывается на её собственные слои.
   */
  function renderDepth(frag) {
    const state = getState();
    const order = typeof depthOrder === 'function' ? depthOrder(state.config, state.sceneId) : [];
    if (!order.length) return;
    const section = document.createElement('section');
    section.className = 'lyr-group lyr-depth';
    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'lyr-group-head';
    head.setAttribute('aria-expanded', 'true');
    head.innerHTML = `<span>Глубина кадра</span>${ico('chevronUp', 12)}`;
    const body = document.createElement('div');
    body.className = 'lyr-depth-body';
    head.addEventListener('click', () => {
      const on = (body.hidden = !body.hidden);
      head.setAttribute('aria-expanded', String(!on));
    });

    const note = document.createElement('p');
    note.className = 'lyr-depth-note';
    note.textContent = 'Выше — ближе к зрителю. Порядок сохраняется для этого ролика и попадает в видео.';
    body.appendChild(note);

    if (typeof depthOrderReset === 'function') {
      const reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'lyr-depth-reset';
      reset.innerHTML = withIcon('reset', 'Стандартный порядок', 12);
      reset.title = 'Вернуть исходный порядок слоёв';
      reset.addEventListener('click', () => {
        for (const change of depthOrderReset(state.sceneId)) onCommand?.('depthOrder', change.key, change.value);
        renderLayers();
      });
      body.appendChild(reset);
    }

    // Сверху списка — самый близкий слой, поэтому порядок читаем с конца.
    const near = [...order].reverse();
    for (const id of near) {
      const at = order.indexOf(id);
      const row = document.createElement('div');
      row.className = 'lyr-depth-row';
      row.dataset.depth = id;
      const label = document.createElement('span');
      label.className = 'lyr-depth-label';
      label.textContent = (isIntroDepthScene(state.sceneId) ? INTRO_DEPTH_LABELS[id] : DEPTH_LABELS[id]) || id;
      const controls = document.createElement('span');
      controls.className = 'lyr-depth-controls';
      const step = (direction, glyph, title, disabled) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'lyr-depth-step';
        button.innerHTML = ico(glyph, 11);
        button.title = title;
        button.setAttribute('aria-label', title);
        button.disabled = disabled;
        button.addEventListener('click', () => {
          const changes = depthOrderStep?.(getState().config, getState().sceneId, id, direction);
          if (!changes) return;
          for (const change of changes) onCommand?.('depthOrder', change.key, change.value);
          renderLayers();
        });
        return button;
      };
      controls.append(
        step('front', 'up', 'Выше — ближе к зрителю', at >= order.length - 1),
        step('back', 'down', 'Ниже — дальше от зрителя', at <= 0),
      );
      row.append(label, controls);
      body.appendChild(row);
    }

    section.append(head, body);
    frag.appendChild(section);
  }

  // ── левая панель: строки слоёв ───────────────────────────────────────
  function renderLayers() {
    const state = getState();
    const sections = state.sections;
    ensureSelection(sections);
    const groups = groupLayers(sections);
    const list = document.createDocumentFragment();

    if (!layers.head.querySelector('[data-role="scene"]')) {
      const scene = document.createElement('span');
      scene.className = 'fp-scene';
      scene.dataset.role = 'scene';
      scene.title = 'Ролик, к которому относятся слои';
      layers.head.querySelector('[data-role="right"]').appendChild(scene);
    }
    const sceneEl = layers.head.querySelector('[data-role="scene"]');
    if (sceneEl) sceneEl.textContent = state.sceneLabel || '';

    for (const [name, items] of groups) {
      const groupEl = document.createElement('section');
      groupEl.className = 'lyr-group';
      const head = document.createElement('button');
      head.type = 'button';
      head.className = 'lyr-group-head';
      head.setAttribute('aria-expanded', 'true');
      head.innerHTML = `<span>${name}</span>${ico('chevronUp', 12)}`;
      const body = document.createElement('ul');
      body.className = 'lyr-list';
      head.addEventListener('click', () => {
        const on = body.hidden = !body.hidden;
        head.setAttribute('aria-expanded', String(!on));
      });
      groupEl.append(head, body);

      for (const { section, meta } of items) {
        const key = ruleEyeKey(section) || meta.eye || null;
        const holder = state.config[section.id] || {};
        const enabled = key ? Boolean(holder[key]) : null;
        const row = document.createElement('li');
        row.className = 'lyr-row';
        row.dataset.section = section.id;
        row.tabIndex = 0;
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', String(section.id === selected));
        if (section.id === selected) row.classList.add('is-selected');
        if (enabled === false) row.classList.add('is-off');
        row.title = meta.hint || section.title;

        const eye = key
          ? `<button type="button" class="lyr-eye" data-role="eye" aria-pressed="${enabled}" title="${enabled ? 'Скрыть слой' : 'Показать слой'}">${ico(enabled ? 'eye' : 'eyeOff', 14)}</button>`
          : `<span class="lyr-eye is-empty" aria-hidden="true"></span>`;
        row.innerHTML = `${eye}<span class="lyr-text"><b>${meta.label}</b><i>${meta.hint || ''}</i></span>`;

        row.addEventListener('click', (event) => {
          if (event.target.closest('[data-role="eye"]')) return;
          select(section.id);
        });
        row.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(section.id); return; }
          // Стрелки ходят по списку слоёв, как в обычном списке выбора.
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const rows = [...layers.body.querySelectorAll('.lyr-row')];
            const next = rows[rows.indexOf(row) + (event.key === 'ArrowDown' ? 1 : -1)];
            next?.focus();
          }
        });
        row.querySelector('[data-role="eye"]')?.addEventListener('click', (event) => {
          event.stopPropagation();
          onCommand?.(section.id, key, !enabled);
          renderLayers();
          renderInspector();
        });
        body.appendChild(row);
      }
      list.appendChild(groupEl);
    }
    const search = ensureSearch();
    const depthBlock = document.createDocumentFragment();
    renderDepth(depthBlock);
    layers.body.replaceChildren(search, depthBlock, list);
    applyFilter(search.value);
  }

  // ── правая панель: вкладки «слой / кадр / JSON» ───────────────────────
  const TABS = [['layer', 'Слой'], ['frame', 'Кадр'], ['json', 'JSON']];

  function buildTabs() {
    const bar = document.createElement('div');
    bar.className = 'ins-tabs';
    bar.setAttribute('role', 'tablist');
    for (const [id, label] of TABS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ins-tab';
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', String(tab === id));
      if (tab === id) button.classList.add('is-active');
      button.textContent = label;
      button.addEventListener('click', () => {
        if (tab === id) return;
        tab = id;
        renderInspector();
      });
      bar.appendChild(button);
    }
    return bar;
  }

  // ── правая панель: поля выбранного раздела ───────────────────────────
  function renderInspector() {
    const state = getState();
    const sections = state.sections;
    const id = ensureSelection(sections);
    const section = sections.find((s) => s.id === id);
    if (!section) { settings.body.replaceChildren(); return; }
    const meta = layerMeta(section);
    settings.setTitle(tab === 'frame' ? 'Кадр и запись' : tab === 'json' ? 'JSON' : meta.label || 'Настройки');
    if (tab === 'frame') { renderFrame(); return; }
    if (tab === 'json') { renderJson(); return; }

    const holder = state.config[section.id] || {};
    const defaults = state.defaults?.[section.id] || {};
    const frag = document.createDocumentFragment();
    frag.appendChild(buildTabs());

    // Переключатель ролика: сменить кадр, не закрывая панели.
    const scenes = state.scenes || [];
    if (scenes.length > 1) {
      const picker = document.createElement('div');
      picker.className = 'ins-scene';
      picker.innerHTML = `<span class="ins-scene-label">Ролик</span>`;
      const selectEl = document.createElement('select');
      selectEl.className = 'ins-select';
      selectEl.setAttribute('aria-label', 'Ролик');
      for (const scene of scenes) {
        const option = document.createElement('option');
        option.value = scene.id;
        option.textContent = scene.archived
          ? `${scene.code} · ${scene.label} · архив`
          : `${scene.code} · ${scene.label}`;
        option.title = scene.title || scene.label;
        selectEl.appendChild(option);
      }
      selectEl.value = state.sceneId;
      selectEl.addEventListener('change', () => {
        if (onSwitchScene?.(selectEl.value) === false) selectEl.value = state.sceneId;
      });
      picker.appendChild(selectEl);
      frag.appendChild(picker);
    }

    {
      const note = SECTION_NOTES[section.id];
      const hint = document.createElement('p');
      hint.className = 'ins-hint';
      hint.textContent = `${note || meta.hint || section.title}. Значок сброса у параметра возвращает его стандартное значение.`;
      frag.appendChild(hint);

      // Сброс слоя целиком: кадр возвращается к стандартному виду, остальные
      // слои не затрагиваются.
      const changedCount = [...new Set([...Object.keys(defaults), ...Object.keys(holder)])]
        .filter((key) => !same(holder[key], defaults[key])).length;
      const bar = document.createElement('div');
      bar.className = 'ins-actions ins-actions-tight ins-layer-actions';
      const resetLayer = document.createElement('button');
      resetLayer.type = 'button';
      resetLayer.className = 'ins-layer-reset';
      resetLayer.innerHTML = `${ico('reset', 13)}<span>Сброс слоя</span>${changedCount ? ` <b>${changedCount}</b>` : ''}`;
      resetLayer.title = changedCount
        ? `Вернуть все ${section.fields.length} параметров этого слоя к умолчаниям (изменено ${changedCount})`
        : 'Все параметры слоя уже стандартные';
      resetLayer.disabled = changedCount === 0;
      resetLayer.addEventListener('click', () => resetSection(section));
      bar.appendChild(resetLayer);
      const resetComposition = document.createElement('button');
      resetComposition.type = 'button';
      resetComposition.className = 'ins-layer-reset';
      resetComposition.innerHTML = `${ico('reset', 13)}<span>Сброс всей композиции</span>`;
      resetComposition.title = 'Вернуть все настройки текущего ролика, включая изображения и длительности';
      resetComposition.addEventListener('click', () => {
        const current = getState();
        if (!confirm(`Сбросить всю композицию «${current.sceneLabel}»? Будут сброшены все слои, изображения, длительности и настройки этого ролика. Другие ролики не изменятся.`)) return;
        onReset?.({});
        onToast?.(`Композиция «${current.sceneLabel}» сброшена`);
      });
      bar.appendChild(resetComposition);
      frag.appendChild(bar);
    }

    // У стека эффектов строки сгруппированы: каждый эффект — отдельная строка
    // со своим сбросом, служебные настройки (момент удара, цвет, грейд) идут
    // своей группой. Так «убрать только ударную волну» — одно нажатие.
    const keys = effectKeys?.[section.id];
    const isFx = Array.isArray(keys) && keys.length > 0;
    if (isFx) {
      const groups = [
        ['Эффекты', section.fields.filter((field) => keys.includes(field.key))],
        ['Служебные', section.fields.filter((field) => !keys.includes(field.key))],
      ];
      for (const [title, fields] of groups) {
        if (!fields.length) continue;
        const head = document.createElement('p');
        head.className = 'ins-group-title';
        head.textContent = title;
        frag.appendChild(head);
        for (const field of fields) {
          const row = buildRow(section, field, holder, defaults);
          if (!row) continue;
          // У каждого эффекта — свой возврат к «выключено».
          if (keys.includes(field.key) && Number(holder[field.key]) > 0.001) {
            const off = document.createElement('button');
            off.type = 'button';
            off.className = 'ins-effect-off';
            off.innerHTML = withIcon('close', 'выкл', 11);
            off.title = 'Вернуть этот эффект к нулю, остальные не трогать';
            off.addEventListener('click', () => resetEffect(section, field));
            row.appendChild(off);
          }
          frag.appendChild(row);
        }
      }
    } else {
      for (const field of section.fields) {
        const row = buildRow(section, field, holder, defaults);
        if (row) frag.appendChild(row);
      }
    }
    settings.body.replaceChildren(frag);
  }

  /**
   * Вкладка «Кадр»: разрешение мастера, качество превью и кодек. Значения
   * приходят снаружи (они не часть сцены), а после выбора панель показывает
   * фактическое состояние: если браузер откажет в кодеке, подпись не соврёт.
   */
  function renderFrame() {
    const frag = document.createDocumentFragment();
    frag.appendChild(buildTabs());
    const state = getState();
    const frame = getFrameSettings?.() || {};

    const head = document.createElement('div');
    head.className = 'ins-frame-head';
    head.innerHTML = `<span>${state.sceneLabel || ''}</span><b>${frameSummary(frame)}</b>`;
    frag.appendChild(head);

    for (const section of FRAME_SECTIONS) {
      const row = document.createElement('div');
      row.className = 'ins-row ins-select';
      const label = document.createElement('span');
      label.className = 'ins-label';
      label.title = section.hint;
      label.innerHTML = `<i class="ins-dot" aria-hidden="true"></i><span>${section.label}</span>`;
      const select = document.createElement('select');
      select.className = 'ins-select';
      select.dataset.frame = section.id;
      select.setAttribute('aria-label', section.label);
      for (const option of section.options) {
        const el = document.createElement('option');
        el.value = option.value;
        el.textContent = option.label;
        el.title = option.description || '';
        select.appendChild(el);
      }
      select.value = frame[section.id] ?? '';
      select.addEventListener('change', () => {
        if (onFrameSetting?.(section.id, select.value) === false) {
          onToast?.('Во время записи или перехода этот параметр менять нельзя', true);
        }
        renderInspector();
      });
      row.append(label, select);
      frag.appendChild(row);
    }

    // Действия: пауза, запись одного ролика и копия ссылки на настройки сцены.
    const actions = document.createElement('div');
    actions.className = 'ins-actions';
    // Подпись приходит готовой разметкой (`withIcon`), поэтому innerHTML:
    // текст здесь наш собственный, а не из поля ввода.
    const action = (html, title, handler) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.innerHTML = html;
      button.title = title;
      button.addEventListener('click', handler);
      actions.appendChild(button);
      return button;
    };
    action(withIcon('record', 'Записать ролик'), 'Записать один цикл текущего ролика — то же, что кнопка записи сверху', () => onExportVideo?.());
    action(withIcon('link', 'Ссылка на сцену'), 'Скопировать короткую ссылку на текущие настройки сцены', async () => {
      const url = new URL(location.href);
      // Настоящий id: ?scene=intro — это новое интро, а не архивное.
      url.searchParams.set('scene', state.sceneId);
      url.hash = `cfg=${encodeConfigShareHash(getState().config, getState().defaults)}`;
      try {
        await navigator.clipboard.writeText(url.href);
        onToast?.('Ссылка на сцену скопирована');
      } catch (_) {
        onToast?.(url.href, true);
      }
    });
    action(withIcon('reset', 'Сброс сцены'), 'Вернуть умолчания этого ролика', () => {
      if (!confirm(`Сбросить настройки ролика «${state.sceneLabel}» к умолчаниям? При необходимости сначала скачайте JSON проекта.`)) return;
      onApplyScene?.(state.sceneId, cloneDefaults(getState().defaults));
      renderInspector();
      renderLayers();
      onToast?.(`Ролик «${state.sceneLabel}» сброшен`);
    });
    frag.appendChild(actions);

    // Проверку кодеков делаем один раз на разрешение: она тянет кодировщик.
    const key = frame.master;
    if (key && key !== probeKey) {
      probeKey = key;
      const token = ++probeToken;
      probeDeliveries(key).then((results) => {
        if (!results || token !== probeToken) return;
        for (const option of settings.body.querySelectorAll('[data-frame="delivery"] option')) {
          const row = results[option.value];
          if (!row) continue;
          const base = FRAME_SECTIONS.find((s) => s.id === 'delivery')
            ?.options.find((o) => o.value === option.value)?.label ?? option.textContent;
          option.textContent = row.ok ? base : `${base} · недоступно`;
          option.title = row.ok ? '' : (row.reason || 'кодировщик недоступен в этом браузере');
        }
      });
    }
    settings.body.replaceChildren(frag);
  }

  /**
   * Вкладка «JSON»: текущая сцена или весь проект. Экспорт — «что прислать как
   * умолчание», импорт — замена настроек с подтверждением: молчаливая подмена
   * чужого конфига дороже лишнего клика.
   */
  function renderJson() {
    const frag = document.createDocumentFragment();
    frag.appendChild(buildTabs());
    const state = getState();

    const actions = document.createElement('div');
    actions.className = 'ins-actions ins-actions-tight';
    // Как и на вкладке «Кадр»: подпись приходит разметкой с иконкой.
    const action = (html, title, handler) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.innerHTML = html;
      button.title = title;
      button.addEventListener('click', handler);
      actions.appendChild(button);
    };

    const area = document.createElement('textarea');
    area.className = 'ins-json';
    area.spellcheck = false;
    area.setAttribute('aria-label', 'JSON настроек');
    area.placeholder = 'Вставьте JSON сцены или всего проекта…';
    area.readOnly = true;
    area.value = configToJSON?.(getState().config) || '';

    action(withIcon('json', 'Сцена'), 'Показать JSON текущего ролика', () => {
      area.readOnly = true;
      area.value = configToJSON?.(getState().config) || '';
    });
    action(withIcon('json', 'Проект'), 'Показать JSON всех готовых роликов', () => {
      area.readOnly = true;
      area.value = getProjectJSON?.() || '';
    });
    action(withIcon('copy', 'Копировать'), 'Скопировать текст из поля', async () => {
      const text = area.value;
      try { await navigator.clipboard.writeText(text); onToast?.('JSON скопирован'); }
      catch (_) { area.select(); document.execCommand?.('copy'); onToast?.('JSON скопирован'); }
    });
    action(withIcon('download', 'Скачать'), 'Сохранить текст как файл .json', () => {
      const blob = new Blob([area.value], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      let isProject = false;
      try { isProject = isProjectPayload?.(JSON.parse(area.value)); } catch (_) { /* не JSON — сохраняем как есть */ }
      a.download = isProject ? 'circle-scenes.json' : `circle-${state.sceneId}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    action(withIcon('paste', 'Вставить / править'), 'Разрешить редактирование поля для импорта', () => {
      area.readOnly = false;
      area.focus();
    });
    action(withIcon('apply', 'Применить'), 'Применить JSON из поля к сцене или проекту', () => {
      try {
        const text = area.value.trim();
        if (!text) throw new Error('пустой JSON');
        const parsed = JSON.parse(text);
        if (isProjectPayload?.(parsed)) {
          if (!confirm('Импорт заменит настройки указанных роликов и очистит их историю. Продолжить?')) return;
          onApplyProject?.(parseProjectJSON(text, getState().scenes.map((s) => s.id)).scenes);
          onToast?.('Настройки проекта применены');
        } else {
          if (!confirm(`Импорт заменит настройки ролика «${state.sceneLabel}» и очистит его историю. Продолжить?`)) return;
          onApplyScene?.(state.sceneId, parseConfigJSON(text, getState().defaults));
          onToast?.(`Настройки ролика «${state.sceneLabel}» применены`);
        }
        renderLayers();
      } catch (error) {
        onToast?.(`Ошибка JSON: ${error.message}`, true);
      }
    });

    frag.appendChild(actions);
    frag.appendChild(area);

    // Варианты A/B: два состояния сцены, между которыми хочется переключаться
    // (сравнение образов), живут здесь же — рядом с JSON.
    const slots = document.createElement('div');
    slots.className = 'ins-actions ins-actions-tight';
    for (const slot of ['A', 'B']) {
      const save = document.createElement('button');
      save.type = 'button';
      save.innerHTML = withIcon('save', `Запомнить ${slot}`);
      save.title = `Сохранить текущие настройки в слот ${slot}`;
      save.addEventListener('click', () => {
        if (saveSceneSnapshot?.(state.sceneId, slot, getState().config)) onToast?.(`Вариант ${slot} сохранён`);
        else onToast?.(`Не удалось сохранить вариант ${slot}`, true);
        renderInspector();
      });
      const load = document.createElement('button');
      load.type = 'button';
      load.innerHTML = withIcon('apply', `Применить ${slot}`);
      load.title = `Применить настройки из слота ${slot}`;
      load.disabled = hasSceneSnapshot ? !hasSceneSnapshot(state.sceneId, slot) : false;
      load.addEventListener('click', () => {
        const snapshot = loadSceneSnapshot?.(state.sceneId, slot);
        if (!snapshot) return;
        onApplyScene?.(state.sceneId, snapshot);
        onToast?.(`Применён вариант ${slot}`);
        renderLayers();
      });
      slots.append(save, load);
    }
    frag.appendChild(slots);

    settings.body.replaceChildren(frag);
  }

  /**
   * Сброс к стандартным значениям. Поле, весь раздел (слой) или один эффект —
   * одна и та же команда снаружи, поэтому «вернуть как было» не зависит от
   * того, где человек нажал.
   */
  function resetField(section, field) {
    onReset?.({ section: section.id, key: field.key });
    refreshValues();
    renderLayers();
  }

  function resetSection(section) {
    onReset?.({ section: section.id });
    renderInspector();
    renderLayers();
  }

  /**
   * Эффект целиком: у стека эффектов каждый ползунок — отдельный эффект, и
   * вернуть «только ударную волну» удобнее строкой списка, не трогая
   * остальные восемнадцать.
   */
  function resetEffect(section, field) {
    onReset?.({ section: section.id, key: field.key });
    refreshValues();
    renderLayers();
  }

  /** Одна строка инспектора: подпись, точка «изменено», поле управления. */
  function buildRow(section, field, holder, defaults) {
    const value = holder[field.key];
    const def = defaults[field.key];
    const changed = def !== undefined && !same(value, def);
    const row = document.createElement('div');
    row.className = `ins-row ins-${field.type}`;
    row.dataset.key = `${section.id}.${field.key}`;
    if (field.hint) row.title = field.hint;

    const label = document.createElement('button');
    label.type = 'button';
    label.className = 'ins-label';
    label.title = changed ? 'Двойной клик — сбросить к умолчанию' : (field.hint || field.label);
    label.innerHTML = `<i class="ins-dot${changed ? ' is-on' : ''}" aria-hidden="true"></i><span>${field.label}</span>`;
    label.addEventListener('dblclick', (event) => {
      event.preventDefault();
      if (def === undefined) return;
      write(section, field, def);
    });
    row.appendChild(label);

    // Сброс прямо у параметра: двойной клик по названию тоже работает, но
    // иконка видна, пока значение нестандартное, и не требует знания приёма.
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = `ins-reset${changed ? ' is-on' : ''}`;
    reset.title = `Сбросить «${field.label}» к умолчанию (${String(def ?? '')})`;
    reset.setAttribute('aria-label', `Сбросить ${field.label} к умолчанию`);
    reset.innerHTML = ico('reset', 12);
    reset.addEventListener('click', (event) => {
      event.stopPropagation();
      if (def === undefined) return;
      resetField(section, field);
    });
    row.appendChild(reset);

    const commit = () => {
      const nowChanged = def !== undefined && !same(holder[field.key], def);
      row.querySelector('.ins-dot')?.classList.toggle('is-on', nowChanged);
      reset.classList.toggle('is-on', nowChanged);
      reset.disabled = def === undefined;
    };
    commit();

    const write = (sectionRef, fieldRef, next) => {
      onCommand?.(sectionRef.id, fieldRef.key, next);
      refreshValues();
    };

    if (field.type === 'range') {
      const wrap = document.createElement('div');
      wrap.className = 'ins-range';
      const out = document.createElement('input');
      out.type = 'number';
      out.className = 'ins-number';
      out.min = field.min; out.max = field.max; out.step = field.step;
      out.value = String(Number(value).toFixed(decimals(field.step)));
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.className = 'rng';
      slider.min = field.min; slider.max = field.max; slider.step = field.step;
      slider.value = String(value);
      const paint = () => {
        const min = Number(field.min), max = Number(field.max);
        const p = max > min ? ((Number(slider.value) - min) / (max - min)) * 100 : 0;
        slider.style.setProperty('--p', `${Math.max(0, Math.min(100, p))}%`);
      };
      paint();
      slider.addEventListener('input', () => {
        holder[field.key] = Number(slider.value);
        out.value = String(Number(slider.value).toFixed(decimals(field.step)));
        paint(); commit();
        onCommand?.(section.id, field.key, holder[field.key], { live: true });
      });
      slider.addEventListener('change', () => onCommand?.(section.id, field.key, holder[field.key]));
      out.addEventListener('change', () => {
        const n = Number(out.value);
        if (!Number.isFinite(n)) { out.value = String(holder[field.key]); return; }
        const clamped = Math.min(Number(field.max), Math.max(Number(field.min), n));
        holder[field.key] = clamped;
        slider.value = String(clamped);
        out.value = String(Number(clamped.toFixed(decimals(field.step))));
        paint(); commit();
        onCommand?.(section.id, field.key, clamped);
      });
      wrap.append(out, slider);
      row.appendChild(wrap);
      row._set = () => {
        slider.value = String(holder[field.key]);
        out.value = String(Number(holder[field.key]).toFixed(decimals(field.step)));
        paint(); commit();
      };
    } else if (field.type === 'bool') {
      let sync = () => {};
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ins-switch';
      button.setAttribute('role', 'switch');
      sync = () => button.setAttribute('aria-checked', String(Boolean(holder[field.key])));
      button.innerHTML = '<span></span>';
      sync();
      button.addEventListener('click', () => {
        holder[field.key] = !holder[field.key];
        sync(); commit();
        onCommand?.(section.id, field.key, holder[field.key]);
      });
      row.appendChild(button);
      row._set = () => { sync(); commit(); };
    } else if (field.type === 'color') {
      const wrap = document.createElement('span');
      wrap.className = 'ins-color';
      const hex = document.createElement('input');
      hex.type = 'text';
      hex.className = 'ins-hex';
      hex.value = String(value ?? field.fallback ?? '#000000');
      const picker = document.createElement('input');
      picker.type = 'color';
      picker.value = String(value ?? field.fallback ?? '#000000');
      hex.addEventListener('change', () => {
        if (!/^#[\da-f]{6}$/i.test(hex.value)) { hex.value = String(holder[field.key]); return; }
        holder[field.key] = hex.value.toLowerCase();
        picker.value = holder[field.key];
        commit();
        onCommand?.(section.id, field.key, holder[field.key]);
      });
      picker.addEventListener('input', () => {
        holder[field.key] = picker.value;
        hex.value = picker.value;
        commit();
        onCommand?.(section.id, field.key, holder[field.key], { live: true });
      });
      picker.addEventListener('change', () => onCommand?.(section.id, field.key, picker.value));
      wrap.append(hex, picker);
      row.appendChild(wrap);
      row._set = () => {
        hex.value = String(holder[field.key] ?? field.fallback ?? '#000000');
        picker.value = String(holder[field.key] ?? field.fallback ?? '#000000');
        commit();
      };
    } else if (field.type === 'select') {
      const input = document.createElement('select');
      input.className = 'ins-select';
      // Числовые варианты (например, номер видеоисточника) остаются числами:
      // <select> отдаёт строку, а конфиг и движок ждут число.
      const numeric = field.options.every((option) => typeof option.value === 'number');
      for (const option of field.options) {
        const el = document.createElement('option');
        el.value = String(option.value);
        el.textContent = option.label;
        if (option.value === -1) el.className = 'ins-option-empty';
        input.appendChild(el);
      }
      input.value = String(value);
      input.addEventListener('change', () => {
        holder[field.key] = numeric ? Number(input.value) : input.value;
        commit();
        onCommand?.(section.id, field.key, holder[field.key]);
      });
      row.appendChild(input);
      row._set = () => { input.value = String(holder[field.key]); commit(); };
    } else if (field.type === 'image') {
      const wrap = document.createElement('span');
      wrap.className = 'ins-image';
      const file = document.createElement('input');
      file.type = 'file';
      file.accept = 'image/svg+xml,image/png,image/webp,image/jpeg';
      file.hidden = true;
      const pick = document.createElement('button');
      pick.type = 'button';
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.innerHTML = ico('close', 12);
      clear.title = 'Убрать загруженный логотип';
      clear.setAttribute('aria-label', 'Убрать загруженный логотип');
      const sync = () => {
        const has = typeof holder[field.key] === 'string' && holder[field.key].startsWith('data:image/');
        pick.textContent = has ? 'Заменить…' : 'Загрузить…';
        clear.hidden = !has;
      };
      pick.addEventListener('click', () => file.click());
      file.addEventListener('change', () => {
        const chosen = file.files?.[0];
        file.value = '';
        if (!chosen) return;
        if (chosen.size > 1536 * 1024) { onToast?.('Файл логотипа больше 1,5 МБ — используйте компактный SVG или PNG', true); return; }
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result !== 'string' || !reader.result.startsWith('data:image/')) return;
          holder[field.key] = reader.result;
          sync(); commit();
          onCommand?.(section.id, field.key, holder[field.key]);
        };
        reader.readAsDataURL(chosen);
      });
      clear.addEventListener('click', () => {
        holder[field.key] = '';
        sync(); commit();
        onCommand?.(section.id, field.key, '');
      });
      sync();
      wrap.append(file, pick, clear);
      row.appendChild(wrap);
      row._set = sync;
    } else {
      // text и всё неизвестное — однострочное поле
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'ins-text';
      if (field.maxLength) input.maxLength = field.maxLength;
      input.value = String(value ?? '');
      input.addEventListener('input', () => {
        holder[field.key] = input.value;
        commit();
        onCommand?.(section.id, field.key, input.value, { live: true });
      });
      input.addEventListener('change', () => onCommand?.(section.id, field.key, holder[field.key]));
      row.appendChild(input);
      row._set = () => { input.value = String(holder[field.key] ?? ''); commit(); };
    }

    return row;
  }

  /** Обновить значения в открытом инспекторе, не пересобирая разметку. */
  function refreshValues() {
    for (const row of settings.body.querySelectorAll('.ins-row')) {
      row._set?.();
    }
  }

  /** Сцена переключилась: список слоёв и подписи идут следом. */
  function syncScene() {
    const state = getState();
    selected = null;
    ensureSelection(state.sections);
    if (panelOpenLayers) renderLayers();
    if (panelOpenSettings) renderInspector();
  }

  /** Открыть панель настроек на конкретном разделе (из редактора кадра). */
  function openSection(id) {
    const state = getState();
    selected = state.sections.some((s) => s.id === id) ? id : state.sections[0]?.id;
    tab = 'layer';
    panelOpenSettings = true;
    renderLayers();
    renderInspector();
    settings.open();
    syncButtons();
  }

  function openLayers() {
    panelOpenLayers = true;
    renderLayers();
    layers.open();
    syncButtons();
  }

  // Горячие клавиши хрома: L — слои, S — настройки, Esc — закрыть панели.
  window.addEventListener('keydown', (event) => {
    if (isInteractiveTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.code === 'KeyL') { event.preventDefault(); layersBtn.click(); }
    else if (event.code === 'KeyS') { event.preventDefault(); settingsBtn.click(); }
    else if (event.code === 'Escape' && (panelOpenLayers || panelOpenSettings)) {
      if (panelOpenSettings) settingsBtn.click();
      if (panelOpenLayers) layersBtn.click();
    }
  });

  // первая отрисовка списка, чтобы панель открывалась уже с содержимым
  renderLayers();
  syncButtons();

  return {
    openLayers,
    selectFromCanvas(id) {
      if (!getState().sections.some(s => s.id === id)) return;
      const input = ensureSearch().querySelector('input');
      if (input) input.value = '';
      select(id, { openInspector: false });
      const row = layers.body.querySelector(`.lyr-row[data-section="${id}"]`);
      if (row && panelOpenLayers) row.scrollIntoView({ block: 'nearest' });
    },
    openSection,
    syncScene,
    /** Состояние кнопки записи: пульт больше не показывает экспорт. */
    setExportState: ({ busy = false, label = '' } = {}) => {
      exportBtn.classList.toggle('is-busy', busy);
      exportBtn.setAttribute('aria-busy', String(busy));
      const text = label || (busy ? 'Идёт запись ролика' : 'Записать текущий ролик в видео');
      exportBtn.title = `${text}. Ролики записываются по одному — тот, что открыт.`;
      exportBtn.setAttribute('aria-label', text);
    },
    refresh: () => {
      if (!layers.el.hidden) renderLayers();
      if (!settings.el.hidden) refreshValues();
    },
    /** Пересобрать список слоёв после смены ролика или применения JSON. */
    rebuild: () => {
      renderLayers();
      if (!settings.el.hidden) renderInspector();
    },
    get layersOpen() { return panelOpenLayers; },
    get settingsOpen() { return panelOpenSettings; },
    toggleLayers: () => { panelOpenLayers ? (panelOpenLayers = false, layers.close(), syncButtons()) : layersBtn.click(); },
    toggleSettings: () => { panelOpenSettings ? (panelOpenSettings = false, settings.close(), syncButtons()) : settingsBtn.click(); },
    panels: { layers, settings },
    buttons,
  };
}
