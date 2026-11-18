import { bgFrag } from './lab2/shaders.ts';

/** Тот же рисунок интро, но возвращаем свет как добавку, а не непрозрачный фон. */
export const INTRO_BACKGROUND_GLSL = bgFrag
  .replace('precision highp float;', '')
  .replace('uniform float uTime, uAspect, uBeam, uRib, uGlow, uFlash, uFinal;', '')
  .replace('uniform vec2 uCam;', '')
  .replace('varying vec2 vUv;', '')
  .replaceAll('uTime', 'uIntroTime')
  .replace('void main(){', 'vec3 introBackgroundLight(vec2 vUv){\n  float uBeam=1., uRib=1., uGlow=0., uFlash=0., uFinal=1.; vec2 uCam=vec2(0.);')
  .replace('gl_FragColor=vec4(col,1.);', 'return max(col - vec3(0.012,0.012,0.013), vec3(0.));');

/** Старый режим замены фона переходит в новый эффект; предыдущие настройки не теряются. */
export function migrateIntroBackgroundEffect(config) {
  const legacy = config?.partnersIntroBackground;
  if (legacy?.enabled !== true || !config.fxStack) return false;
  if (!(Number(config.fxStack.introBackground) > 0)) {
    config.fxStack.introBackground = Number.isFinite(legacy.strength) ? Math.max(0, Math.min(2, legacy.strength)) : 1;
    config.fxStack.introBackgroundSpeed = Number.isFinite(legacy.speed) ? legacy.speed : 1;
  }
  legacy.enabled = false;
  return true;
}
