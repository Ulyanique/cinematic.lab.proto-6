import { phaseValues } from './operator-timeline.js';

/**
 * Время встроенного фильма и затемнение определяются теми же фазами, что пульт.
 * Вход масштабируется до указанной точки фильма (по умолчанию — удар); после входа время продолжает идти
 * естественно, чтобы длинное удержание фона не замедляло появление названия.
 * Выход и пауза после него задают плавный уход в чёрный и чёрный экран.
 */
export function lab2FrameTiming(local, timeline, impact, entryEnd = impact) {
  const { entry, hold, cycle } = phaseValues(timeline);
  const t = Math.max(0, Math.min(Number.isFinite(local) ? local : 0, cycle));
  const strike = Number.isFinite(impact) && impact > 0 ? impact : 4.5;
  const target = Number.isFinite(entryEnd) && entryEnd > 0 ? entryEnd : strike;
  const filmTime = entry > 0 && t < entry ? t * target / entry : target + t - entry;
  const fadeStart = entry + hold;
  const fadeDuration = Math.max(0, Number(timeline.fadeDuration) || 0);
  const progress = fadeDuration > 0 ? Math.max(0, Math.min(1, (t - fadeStart) / fadeDuration)) : (t >= fadeStart ? 1 : 0);
  const fade = (1 - Math.cos(Math.PI * progress)) / 2;
  return { filmTime, fade };
}

/** Интро в обратном направлении: начало — готовая композиция, конец — чёрный кадр. */
export function lab2OutroFrameTiming(local, timeline, impact) {
  const { entry, hold, exit, cycle } = phaseValues(timeline);
  const t = Math.max(0, Math.min(Number.isFinite(local) ? local : 0, cycle));
  const forwardTimeline = { ...timeline, drawDuration: exit, emergeDuration: 0,
    holdDuration: hold, fadeDuration: entry, restDuration: 0 };
  const forward = lab2FrameTiming(cycle - t, forwardTimeline, impact);
  return { filmTime: forward.filmTime, fade: 0 };
}
