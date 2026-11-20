// Ход сцены соответствует реальному времени независимо от частоты кадров.
// Ограничение dt допустимо для постэффектов, но не для времени анимации.
/** @param {number} time @param {number} elapsed @param {number} speed @param {boolean} paused */
export function advanceTimeline(time, elapsed, speed, paused) {
  return paused ? time : time + Math.max(0, elapsed) * speed;
}

/**
 * Время внутри цикла ролика: цикл повторяется, а не кончается.
 *
 * Сцены с собственными фазами (ожидание, фон, партнёры) считают локальное время
 * сами — они знают про уход и паузу. Лаборатории живут собственным фильмом и
 * рисовали абсолютное время студии: фильм заканчивался, и кадр оставался
 * чёрным, хотя в пульте включён цикл. Здесь одно правило для всех: время
 * заворачивается по длительности цикла.
 * @param {number} time @param {number} cycle @param {number} [startDelay]
 */
export function localCycleTime(time, cycle, startDelay = 0) {
  if (!(cycle > 0) || !Number.isFinite(time)) return Math.max(0, Number(time) || 0);
  const local = (time - startDelay) % cycle;
  return local < 0 ? local + cycle : local;
}

/**
 * Время внутри фильма заданной длины: короткий фильм повторяется, пока идёт
 * длинный цикл, вместо того чтобы замирать на последнем кадре или в чёрном.
 * @param {number} time @param {number} length
 */
export function repeatTime(time, length) {
  if (!(length > 0) || !Number.isFinite(time)) return Math.max(0, Number(time) || 0);
  const local = time % length;
  return local < 0 ? local + length : local;
}

/** Внутри одного цикла фильм проигрывается один раз; его последний кадр ждёт следующего цикла. */
export function oncePerCycleTime(time, cycle, length, startDelay = 0) {
  const local = localCycleTime(time, cycle, startDelay);
  return length > 0 && Number.isFinite(length) ? Math.min(local, length) : local;
}
