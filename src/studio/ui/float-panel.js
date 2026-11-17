/**
 * Плавающая панель — та же механика, что в референсе (cinematic.lab.proto-2):
 *
 *  • панель не приклеена к краю, а висит поверх кадра и тянется за заголовок;
 *  • без наведения и без фокуса она полупрозрачна (0.5) и «отходит назад»,
 *    чтобы не спорить с картинкой;
 *  • кнопки в заголовке сворачивают панель в одну строку и закрывают её;
 *  • тело панели скроллится отдельно, высота ограничена долей экрана.
 *
 * Всё оформление — в styles.css (классы `fp-*`); здесь только поведение и
 * разметка, чтобы левая и правая панели не расходились по механике.
 */

/** Иконки в той же штриховой манере, что и в референсе. */
const svg = (paths, size = 15) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export const ICON_LAYERS = svg(
  '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/><path d="m3 17.5 9 5 9-5" opacity=".5"/>'
);
export const ICON_GEAR = svg(
  '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'
);
const ICON_MIN = '<path d="m6 15 6-6 6 6"/>';
const ICON_MAX = '<path d="m6 9 6 6 6-6"/>';
const ICON_CLOSE = '<path d="M6 6l12 12M18 6 6 18"/>';

const POS_KEY = 'circle-ui-panels-v1';

/** Прочитать запомненные позиции панелей; битые данные не мешают открыть студию. */
function loadPositions() {
  try {
    const raw = JSON.parse(localStorage.getItem(POS_KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch (_) { return {}; }
}

let positions = loadPositions();
let saveTimer = 0;
function rememberPositions() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(POS_KEY, JSON.stringify(positions)); } catch (_) { /* приватный режим */ }
  }, 250);
}

/**
 * Создать панель. `side` задаёт позицию по умолчанию: левая — у левого края,
 * правая — у правого. Возвращает ручки, через которые панель показывает и
 * прячет содержимое.
 *
 * @param {object} options
 * @param {string} options.title      заголовок (капсом, с трекингом)
 * @param {string} options.icon       svg-иконка в заголовке
 * @param {string} options.key        ключ, под которым запоминается позиция
 * @param {number} [options.width]
 * @param {'left'|'right'} [options.side]
 * @param {number} [options.y]
 * @param {() => void} [options.onClose]
 */
export function createFloatPanel({ title, icon, key, width = 300, side = 'left', y = 58, onClose }) {
  const el = document.createElement('section');
  el.className = 'fp';
  el.dataset.panel = key;
  el.setAttribute('aria-hidden', 'true');
  el.hidden = true;
  el.style.width = `${width}px`;
  el.innerHTML = `
    <div class="fp-head" data-role="head">
      <span class="fp-icon">${icon || ''}</span>
      <span class="fp-title" data-role="title">${title}</span>
      <span class="fp-right" data-role="right"></span>
      <button type="button" class="fp-btn" data-role="min" aria-label="Свернуть" title="Свернуть">${svg(ICON_MIN, 12)}</button>
      <button type="button" class="fp-btn" data-role="close" aria-label="Закрыть" title="Закрыть">${svg(ICON_CLOSE, 12)}</button>
    </div>
    <div class="fp-body panel-scroll" data-role="body"></div>
  `;
  document.body.appendChild(el);

  const head = el.querySelector('[data-role="head"]');
  const body = el.querySelector('[data-role="body"]');
  const titleEl = el.querySelector('[data-role="title"]');
  const rightEl = el.querySelector('[data-role="right"]');
  const minBtn = el.querySelector('[data-role="min"]');
  const closeBtn = el.querySelector('[data-role="close"]');

  const saved = positions[key];
  let pos = {
    x: Number.isFinite(saved?.x) ? saved.x : (side === 'right' ? Math.max(8, innerWidth - width - 16) : 16),
    y: Number.isFinite(saved?.y) ? saved.y : y,
  };
  let min = false;
  let drag = null; // { pointerId, dx, dy }
  let hover = false;
  let focused = false;

  function apply() {
    el.style.left = `${Math.round(pos.x)}px`;
    el.style.top = `${Math.round(pos.y)}px`;
    positions[key] = { x: Math.round(pos.x), y: Math.round(pos.y) };
  }

  function clamp() {
    pos.x = Math.max(8 - width + 90, Math.min(pos.x, innerWidth - 90));
    pos.y = Math.max(8, Math.min(pos.y, innerHeight - 44));
    apply();
  }

  /** Полупрозрачность без наведения и фокуса — как в референсе. */
  function syncOpacity() {
    const active = hover || Boolean(drag) || focused || el.contains(document.activeElement);
    el.classList.toggle('is-dim', !active);
  }

  apply();

  el.addEventListener('pointerenter', () => { hover = true; syncOpacity(); });
  el.addEventListener('pointerleave', () => { hover = false; syncOpacity(); });
  el.addEventListener('focusin', () => { focused = true; syncOpacity(); });
  el.addEventListener('focusout', () => { focused = false; syncOpacity(); });

  head.addEventListener('pointerdown', (event) => {
    if (event.target.closest('button')) return;
    event.preventDefault();
    drag = { pointerId: event.pointerId, dx: event.clientX - pos.x, dy: event.clientY - pos.y };
    head.setPointerCapture?.(event.pointerId);
    el.classList.add('is-drag');
    syncOpacity();
  });
  head.addEventListener('pointermove', (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    pos.x = event.clientX - drag.dx;
    pos.y = event.clientY - drag.dy;
    clamp();
  });
  const release = (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag = null;
    el.classList.remove('is-drag');
    rememberPositions();
    syncOpacity();
  };
  head.addEventListener('pointerup', release);
  head.addEventListener('pointercancel', release);
  head.addEventListener('dblclick', (event) => {
    if (event.target.closest('button')) return;
    setMin(!min);
  });

  function setMin(value) {
    min = value;
    el.classList.toggle('is-min', min);
    body.hidden = min;
    minBtn.innerHTML = svg(min ? ICON_MAX : ICON_MIN, 12);
    minBtn.setAttribute('aria-label', min ? 'Развернуть' : 'Свернуть');
  }

  minBtn.addEventListener('click', () => setMin(!min));
  closeBtn.addEventListener('click', () => api.close());

  const api = {
    el,
    body,
    head,
    setTitle(text) { titleEl.textContent = text; },
    /** Место для кнопок-действий в заголовке (например, «сброс слоя»). */
    setRight(nodes) { rightEl.replaceChildren(...[].concat(nodes || [])); },
    isOpen() { return !el.hidden; },
    open() {
      el.hidden = false;
      el.setAttribute('aria-hidden', 'false');
      clamp();
      syncOpacity();
    },
    close() {
      el.hidden = true;
      el.setAttribute('aria-hidden', 'true');
      hover = false;
      focused = false;
      syncOpacity();
      onClose?.();
    },
    toggle() { el.hidden ? api.open() : api.close(); },
    focusBody() { body.focus?.({ preventScroll: true }); },
    /** Сброс позиции — двойной клик по логотипу панели не нужен, но кнопка Reset есть. */
    resetPosition() {
      pos = { x: side === 'right' ? Math.max(8, innerWidth - width - 16) : 16, y };
      apply();
      rememberPositions();
    },
  };

  window.addEventListener('resize', clamp);
  return api;
}
