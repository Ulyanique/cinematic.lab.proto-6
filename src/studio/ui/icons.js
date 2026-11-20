import {
  Layers, Settings, Video, ChevronDown, ChevronUp, X, Eye, EyeOff, RotateCcw,
  ArrowUp, ArrowDown, Play, Pause, SkipBack, SkipForward, Maximize2, Minimize2,
  Download, Copy, Link, FileJson, ClipboardPaste, Check, Trash2, Search,
  Pin, PinOff, Repeat, Clock, CircleDot, Plus, Minus, Save, Undo2, Redo2,
} from 'lucide';

/**
 * Иконки интерфейса — Lucide, и только они.
 *
 * Раньше контуры были нарисованы руками в двух местах (`float-panel.js` и
 * `panels.js`), а часть кнопок вместо иконок несла типографские символы:
 * «Ⅱ» на паузе, «◇/◆» на закреплении пульта, «×» на закрытии, «↺» в подсказке
 * о сбросе. Такие глифы зависят от шрифта: на другой системе «Ⅱ» становится
 * римской цифрой, а «▸» — треугольником из другого набора. Поэтому здесь один
 * источник контуров, а вызывающий код просит иконку по имени Lucide.
 *
 * Каждая иконка `lucide` — отдельный модуль, а пакет помечен `sideEffects:
 * false`, поэтому сборщик выбрасывает всё, что не названо ниже: в бандл
 * попадают только используемые контуры, а не две с половиной тысячи.
 */

/**
 * Имена, которые использует студия. Таблица задана явно: опечатка в имени
 * падает при сборке, а не превращается в пустое место на кнопке.
 */
const ICONS = {
  layers: Layers,
  settings: Settings,
  record: Video,
  chevronDown: ChevronDown,
  chevronUp: ChevronUp,
  close: X,
  eye: Eye,
  eyeOff: EyeOff,
  reset: RotateCcw,
  up: ArrowUp,
  down: ArrowDown,
  play: Play,
  pause: Pause,
  prev: SkipBack,
  next: SkipForward,
  expand: Maximize2,
  collapse: Minimize2,
  download: Download,
  copy: Copy,
  link: Link,
  json: FileJson,
  paste: ClipboardPaste,
  apply: Check,
  trash: Trash2,
  search: Search,
  pin: Pin,
  pinOff: PinOff,
  repeat: Repeat,
  clock: Clock,
  dot: CircleDot,
  plus: Plus,
  minus: Minus,
  save: Save,
  undo: Undo2,
  redo: Redo2,
};

const cache = new Map();

/** Экранирование значения атрибута: контуры приходят из пакета, но данные — данные. */
const attr = (value) => String(value).replace(/"/g, '&quot;').replace(/</g, '&lt;');

/**
 * SVG-строка иконки Lucide.
 * @param {string} name имя из списка выше (`layers`, `record`, `reset` …)
 * @param {number} [size] сторона в пикселях
 * @param {object} [options]
 * @param {number} [options.strokeWidth] толщина линии; по умолчанию как у Lucide
 * @param {string} [options.className] дополнительный класс
 * @returns {string}
 */
export function icon(name, size = 16, options = {}) {
  const nodes = ICONS[name] || ICONS.layers;
  const key = `${name}:${size}`;
  let body = cache.get(key);
  if (!body) {
    if (!nodes) throw new Error(`Иконка Lucide «${name}» не найдена`);
    body = nodes.map(([tag, attrs]) => {
      const parts = Object.entries(attrs)
        .filter(([key]) => key !== 'key')
        .map(([key, value]) => `${key}="${attr(value)}"`);
      return `<${tag} ${parts.join(' ')}/>`;
    }).join('');
    cache.set(key, body);
  }
  const stroke = options.strokeWidth ?? 1.75;
  const className = options.className ? ` class="${attr(options.className)}"` : '';
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor"`
    + ` stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"`
    + `${className} aria-hidden="true" focusable="false">${body}</svg>`;
}

/**
 * Только контур без обёртки — когда `<svg>` уже создан вызывающим кодом.
 * Нужен редко; основной путь — `icon()`.
 * @param {string} name
 * @returns {string}
 */
export function iconPaths(name) {
  const html = icon(name, 16);
  return html.slice(html.indexOf('>') + 1, html.lastIndexOf('</svg>'));
}

/** Имена, доступные вызывающему коду (для проверок и подсказок). */
export const ICON_NAMES = Object.freeze(Object.keys(ICONS));
