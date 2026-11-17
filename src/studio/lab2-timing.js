import { phaseValues } from './operator-timeline.js';

/**
 * Время встроенного фильма и затемнение определяются теми же фазами, что пульт.
 * Вход масштабируется до момента удара; после входа время продолжает идти
 * естественно, чтобы длинное удержание фона не замедляло появление названия.
 * Выход и пауза после него задают плавный уход в чёрный и чёрный экран.
 */
export function lab2FrameTiming(local, timeline, impact) {
  const { entry, hold, cycle } = phaseValues(timeline);
  const t = Math.max(0, Math.min(Number.isFinite(local) ? local : 0, cycle));
  const strike = Number.isFinite(impact) && impact > 0 ? impact : 4.5;
  const filmTime = entry > 0 && t < entry ? t * strike / entry : strike + t - entry;
  const fadeStart = entry + hold;
  const fadeDuration = Math.max(0, Number(timeline.fadeDuration) || 0);
  const progress = fadeDuration > 0 ? Math.max(0, Math.min(1, (t - fadeStart) / fadeDuration)) : (t >= fadeStart ? 1 : 0);
  const fade = (1 - Math.cos(Math.PI * progress)) / 2;
  return { filmTime, fade };
}
