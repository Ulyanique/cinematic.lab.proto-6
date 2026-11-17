/**
 * Геометрия таймлайна в пульте: три фазы ролика и их границы.
 *
 * Ролик живёт по циклу «вход → удержание → уход». Раньше в пульте эти фазы
 * были подписаны мелким текстом над полосой, а менять их можно было только
 * перетаскиванием невидимых ручек: понять «сколько длится вход» было нельзя,
 * пока не наведёшь на границу. Теперь те же числа читаются и правятся полями
 * в строке пульта, а полоса только показывает пропорции.
 *
 * Чистые функции: одни и те же числа при одном конфиге, поэтому подписи,
 * полоса и то, что реально играет сцена, не могут разойтись.
 */

/** @typedef {{drawDuration:number, emergeDuration:number, holdDuration:number, fadeDuration:number, restDuration:number}} Timeline */

/** Минимальная длительность удержания: короче — уже не «стоит» в кадре. */
export const MIN_HOLD = 0.2;
/**
 * Вход и уход можно выключить совсем (0): у лабораторий своё появление, и
 * насильно навязывать им 0.2 с входа значило бы менять чужой монтаж.
 */
export const MIN_PHASE = 0;
/** Предел полного цикла ролика, секунды. */
export const MAX_CYCLE = 300;

const part = (value) => (Number.isFinite(value) && value > 0 ? value : 0);

/**
 * Разложить длительность фазы по её внутренним стадиям.
 * Обычно стадии просто масштабируются (движение остаётся тем же, только
 * короче). Если обе были нулевыми — у лабораторий вход и уход свои, — вся
 * длительность достаётся первой стадии: иначе поле показывало бы 0.0 сразу
 * после ввода, и фаза выглядела бы нередактируемой.
 * @param {number} first @param {number} second @param {number} total
 * @returns {[number, number]}
 */
function scaleStages(first, second, total) {
  const a = part(first), b = part(second);
  if (a + b <= 0) return [total, 0];
  const scale = total / (a + b);
  return [a * scale, b * scale];
}

/**
 * Три фазы ролика в секундах — то, что показывают поля пульта.
 * Вход — прорисовка контура и появление из тени, уход — уход в тень и пауза.
 * @param {Timeline} tl
 * @returns {{entry:number, hold:number, exit:number, cycle:number}}
 */
export function phaseValues(tl) {
  const draw = part(tl?.drawDuration);
  const emerge = part(tl?.emergeDuration);
  const hold = part(tl?.holdDuration);
  const fade = part(tl?.fadeDuration);
  const rest = part(tl?.restDuration);
  return { entry: draw + emerge, hold, exit: fade + rest, cycle: draw + emerge + hold + fade + rest };
}

/**
 * Фазы в процентах ширины полосы: отрисовка сегментов и ручек.
 * Внутри входа и ухода остаются метки внутренних стадий (контур → тень,
 * тень → пауза): по ним видно, из чего фаза состоит.
 * @param {Timeline} tl
 * @returns {{key:string, label:string, start:number, end:number, startPct:number,
 *   endPct:number, widthPct:number, seconds:number, ticks:number[]}[]}
 */
export function phaseSegments(tl) {
  const { entry, hold, exit, cycle } = phaseValues(tl);
  if (cycle <= 0) return [];
  const draw = part(tl?.drawDuration);
  const fade = part(tl?.fadeDuration);
  const raw = [
    { key: 'entry', label: 'Вход', seconds: entry, ticks: draw > 0 && draw < entry ? [draw] : [] },
    { key: 'hold', label: 'Удержание', seconds: hold, ticks: [] },
    { key: 'exit', label: 'Уход', seconds: exit, ticks: fade > 0 && fade < exit ? [fade] : [] },
  ];
  let at = 0;
  return raw.map((phase) => {
    const start = at;
    const end = at + phase.seconds;
    at = end;
    return {
      key: phase.key,
      label: phase.label,
      seconds: phase.seconds,
      start,
      end,
      startPct: start / cycle * 100,
      endPct: end / cycle * 100,
      widthPct: phase.seconds / cycle * 100,
      ticks: phase.ticks.map((value) => start + value),
    };
  });
}

/**
 * Положение курсора в процентах. Считается от той же суммы фаз, что и полоса.
 * @param {number} localSeconds @param {Timeline} tl
 */
export function timelineCursorPct(localSeconds, tl) {
  const { cycle } = phaseValues(tl);
  if (!(cycle > 0) || !Number.isFinite(localSeconds)) return 0;
  return Math.min(Math.max(0, localSeconds), cycle) / cycle * 100;
}

/**
 * Секунды в подпись «5.0». Один знак после запятой всегда: «5.0 с» рядом с
 * «13.6 с» читается как сетка, а «5 с» рядом с «13.6 с» — как опечатка.
 * @param {number} seconds
 */
export function timeLabel(seconds) {
  const value = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  return value.toFixed(1);
}

/**
 * Значение из поля ввода, приведённое к допустимому.
 * Пустая строка и мусор не превращаются в ноль молча: возвращается null, и
 * поле остаётся с прежним значением.
 * @param {unknown} value
 * @param {number} min
 * @param {number} max
 * @returns {number | null}
 */
export function clampSeconds(value, min, max) {
  if (typeof value !== 'number' && String(value ?? '').trim() === '') return null;
  const number = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  if (!Number.isFinite(number)) return null;
  return Math.min(max, Math.max(min, number));
}

/**
 * Что изменится, если задать фазу числом. Возвращает правки таймлайна или null,
 * если правка невозможна (например, вход не влезает в цикл).
 *
 * Логика та же, что при перетаскивании: вход двигает свою границу, уход —
 * свою (его длительность считается от конца цикла), удержание — промежуток
 * между ними. Остальные фазы сохраняют пропорции внутри себя.
 * @param {Timeline} tl
 * @param {'entry'|'hold'|'exit'} key
 * @param {number} seconds
 * @returns {Timeline | null}
 */
export function phaseChange(tl, key, seconds) {
  const { entry, hold, exit, cycle } = phaseValues(tl);
  if (!(cycle > 0)) return null;
  const next = { ...tl };
  if (key === 'hold') {
    const value = clampSeconds(seconds, MIN_HOLD, MAX_CYCLE - entry - exit);
    if (value === null) return null;
    next.holdDuration = value;
    return next;
  }
  if (key === 'entry') {
    const value = clampSeconds(seconds, MIN_PHASE, cycle - exit - MIN_HOLD);
    if (value === null) return null;
    // Внутренние стадии входа масштабируются: контур и появление остаются
    // тем же движением, просто короче или длиннее. Если у ролика входа не было
    // вовсе (лаборатории живут собственным фильмом), делить нечего — вся
    // длительность достаётся первой стадии, и число в поле не отскакивает.
    const scaled = scaleStages(tl.drawDuration, tl.emergeDuration, value);
    next.drawDuration = scaled[0];
    next.emergeDuration = scaled[1];
    next.holdDuration = Math.max(MIN_HOLD, cycle - exit - value);
    return next;
  }
  if (key === 'exit') {
    const value = clampSeconds(seconds, MIN_PHASE, cycle - entry - MIN_HOLD);
    if (value === null) return null;
    const scaled = scaleStages(tl.fadeDuration, tl.restDuration, value);
    next.fadeDuration = scaled[0];
    next.restDuration = scaled[1];
    next.holdDuration = Math.max(MIN_HOLD, cycle - entry - value);
    return next;
  }
  return null;
}

/**
 * Сдвиг границы перетаскиванием: та же функция, что и числовой ввод, только
 * секунды приходят из положения указателя.
 * @param {Timeline} tl @param {'entry'|'exit'} edge @param {number} seconds
 */
export function boundaryChange(tl, edge, seconds) {
  const { entry, exit, cycle } = phaseValues(tl);
  if (!(cycle > 0)) return null;
  if (edge === 'entry') return phaseChange(tl, 'entry', seconds);
  // Длительность ухода — это расстояние от границы до конца цикла.
  const value = cycle - Math.min(Math.max(0, seconds), cycle);
  return phaseChange(tl, 'exit', Math.max(MIN_PHASE, value));
}

/**
 * Где стоит ручка границы, в процентах. «Вход» — конец входа, «уход» — начало
 * ухода; сами длительности считаются от этих двух точек.
 * @param {Timeline} tl @param {'entry'|'exit'} edge
 */
export function boundaryPct(tl, edge) {
  const { entry, exit, cycle } = phaseValues(tl);
  if (!(cycle > 0)) return 0;
  return edge === 'entry' ? entry / cycle * 100 : (cycle - exit) / cycle * 100;
}

/** Удержание, необходимое для заданной полной длительности с учётом входа и ухода. */
export function holdForDuration(tl, duration) {
  const { entry, exit } = phaseValues(tl);
  return Math.max(MIN_HOLD, duration - entry - exit);
}
