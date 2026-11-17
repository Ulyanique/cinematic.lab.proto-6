import * as THREE from "three";
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";

/**
 * Общий набор эффектов «для любой композиции».
 *
 * Эффекты собраны из трёх проектов (circle-animation-proto-1, cinematic-lab-proto-2,
 * cinematic-lab-proto-5) и работают над готовым кадром любой сцены: берут кадр
 * композиции, добавляют световые слои и пропускают через кинематографичную
 * постобработку. Вид самих композиций не меняется, пока все ползунки равны нулю
 * (так и стоит по умолчанию). Расчёт целиком зависит от абсолютного времени кадра:
 * предпросмотр и покадровый экспорт дают один и тот же результат.
 */

/** Каталог эффектов: ключ → подпись, источник, диапазон. 0 = эффект выключен. */
export const FX_EFFECTS = Object.freeze([
  // Световые слои поверх кадра
  { key: "dust", label: "Золотая пыль в объёме", src: "proto-2/5", max: 2 },
  { key: "bokeh", label: "Боке — тёплые диски света", src: "proto-1/2", max: 2 },
  { key: "embers", label: "Искры и угли", src: "proto-1/2", max: 2 },
  { key: "rays", label: "Объёмные лучи света", src: "proto-1/2/5", max: 2 },
  { key: "flare", label: "Анаморфные блики в углах", src: "proto-1/2", max: 2 },
  { key: "sweep", label: "Световой проход по золоту", src: "proto-2", max: 2 },
  { key: "rings", label: "Угловые астрономические кольца", src: "proto-5", max: 2 },
  { key: "haze", label: "Золотая дымка", src: "proto-1", max: 2 },
  // События (в момент «Удара»)
  { key: "shock", label: "Ударная волна", src: "proto-2/5", max: 2 },
  { key: "flash", label: "Вспышка экспозиции", src: "proto-2", max: 2 },
  { key: "zoom", label: "Зум-удар к центру", src: "proto-2", max: 2 },
  // Оптика и плёнка
  { key: "bloom", label: "Свечение (bloom)", src: "proto-1/2/5", max: 2 },
  { key: "streak", label: "Анаморфные полосы света", src: "proto-2", max: 2 },
  { key: "ghosts", label: "Призраки линзы", src: "proto-2", max: 2 },
  { key: "aberration", label: "Хроматическая аберрация", src: "proto-1/2", max: 2 },
  { key: "vignette", label: "Виньетка", src: "proto-1/2/5", max: 2 },
  { key: "grain", label: "Плёночное зерно", src: "proto-1/2/5", max: 2 },
  { key: "letterbox", label: "Кинематографичные полосы (2.39:1)", src: "proto-5", max: 1 },
  { key: "warm", label: "Золотой тон (цветокор)", src: "proto-1/2", max: 2 },
]);

export const EFFECT_KEYS = FX_EFFECTS.map((e) => e.key);

/** Умолчания: все эффекты выключены — композиции выглядят как прежде. */
export function fxDefaults() {
  const d = { look: "none" };
  for (const k of EFFECT_KEYS) d[k] = 0;
  Object.assign(d, {
    eventTime: 4.5, fadeIn: 1.2, fadeOut: 1.2, speed: 1,
    originX: 0.5, originY: 0.42, tint: "#ffc878",
    hue: 0, saturation: 1, contrast: 1,
  });
  return d;
}

/** Готовые образы: набор значений, который накладывается на все нули. */
export const FX_PRESETS = Object.freeze([
  { id: "none", label: "Без эффектов (как в композиции)", values: {} },
  { id: "gala", label: "Золотой гала", values: { dust: 1, bokeh: 0.8, rays: 0.7, flare: 0.8, sweep: 0.8, bloom: 0.9, vignette: 0.7, grain: 0.5, warm: 0.5 } },
  { id: "cinema", label: "Кинозал", values: { dust: 0.6, bloom: 0.8, streak: 0.8, ghosts: 0.5, aberration: 0.6, vignette: 1, grain: 0.9, letterbox: 1, warm: 0.4 } },
  { id: "impact", label: "Удар и вспышка", values: { shock: 1.2, flash: 0.9, zoom: 1, ghosts: 0.9, streak: 1, bloom: 1.1, aberration: 0.8, rays: 0.9, embers: 0.8, vignette: 0.6, grain: 0.4 } },
  { id: "dream", label: "Мягкая дымка", values: { haze: 1.1, bokeh: 1.4, dust: 0.8, bloom: 1.3, rays: 0.5, vignette: 0.6, grain: 0.3, warm: 0.7 } },
  { id: "sparks", label: "Искры и блики", values: { embers: 1.5, dust: 1, flare: 1.2, sweep: 1, streak: 0.7, bloom: 0.9, rings: 1, vignette: 0.5, grain: 0.4 } },
  { id: "full", label: "Максимум (все эффекты)", values: Object.fromEntries(EFFECT_KEYS.map((k) => [k, k === "letterbox" ? 0.6 : 0.8])) },
]);

/** Применить образ к разделу fxStack на месте (ссылка на объект сохраняется). */
export function applyFxPreset(section, id) {
  const preset = FX_PRESETS.find((p) => p.id === id);
  if (!preset) return false;
  for (const k of EFFECT_KEYS) section[k] = preset.values[k] ?? 0;
  section.look = id;
  return true;
}

/** Описание раздела для панели настроек. */
export const FX_SCHEMA_SECTION = {
  id: "fxStack",
  title: "Эффекты — для любой композиции",
  fields: [
    { key: "look", label: "Готовый образ", type: "select", options: FX_PRESETS.map((p) => ({ value: p.id, label: p.label })) },
    ...FX_EFFECTS.map((e) => ({ key: e.key, label: `${e.label} · ${e.src}`, type: "range", min: 0, max: e.max, step: 0.01 })),
    { key: "eventTime", label: "Момент удара, с (волна, вспышка, зум)", type: "range", min: 0, max: 60, step: 0.05 },
    { key: "fadeIn", label: "Плавное появление эффектов, с", type: "range", min: 0, max: 10, step: 0.05 },
    { key: "fadeOut", label: "Плавное затухание в конце, с", type: "range", min: 0, max: 10, step: 0.05 },
    { key: "speed", label: "Скорость движения эффектов", type: "range", min: 0.2, max: 3, step: 0.01 },
    { key: "originX", label: "Центр лучей и волны: X", type: "range", min: 0, max: 1, step: 0.005 },
    { key: "originY", label: "Центр лучей и волны: Y", type: "range", min: 0, max: 1, step: 0.005 },
    { key: "tint", label: "Цвет света эффектов", type: "color" },
    { key: "hue", label: "Оттенок кадра, °", type: "range", min: -180, max: 180, step: 1 },
    { key: "saturation", label: "Насыщенность кадра", type: "range", min: 0, max: 2, step: 0.01 },
    { key: "contrast", label: "Контраст кадра", type: "range", min: 0.5, max: 1.6, step: 0.01 },
  ],
};

/** Есть ли что применять: нулевые ползунки и нейтральный цвет оставляют кадр нетронутым. */
export function fxActive(section) {
  if (!section) return false;
  for (const k of EFFECT_KEYS) if (Number(section[k]) > 0.001) return true;
  return Math.abs(Number(section.hue) || 0) > 0.5 || Math.abs((Number(section.saturation) ?? 1) - 1) > 0.005 ||
    Math.abs((Number(section.contrast) ?? 1) - 1) > 0.005;
}

const VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`;

const HASH = /* glsl */ `
float h11(float p){ p = fract(p*.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y)*p3.z); }
vec2 h22(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*vec3(.1031,.1030,.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz)*p3.zy); }
float vn(float x){ float i = floor(x); float f = fract(x); f = f*f*(3. - 2.*f); return mix(h11(i), h11(i + 1.), f); }
vec3 hueRot(vec3 c, float a){ vec3 k = vec3(.57735); float ca = cos(a); return c*ca + cross(k, c)*sin(a) + k*dot(k, c)*(1. - ca); }
`;

// Проход 0: искажения кадра (ударная волна, зум, аберрация) и все световые слои.
const OVERLAY_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uSrc;
uniform float uTime, uEv, uFx, uAspect;
uniform float uDust, uBokeh, uEmber, uRays, uFlare, uSweep, uShock, uRings, uHaze, uZoom, uCA;
uniform vec3 uTint;
uniform vec2 uOrigin;
varying vec2 vUv;
${HASH}

// пылинки: три слоя глубины, мерцание
vec3 dustLayer(vec2 p, float t, float scale, float seed, float speed){
  vec2 q = p*scale + vec2(t*speed*.35, -t*speed*.5) + seed*17.;
  vec2 id = floor(q); vec2 f = fract(q) - .5;
  vec2 r = h22(id + seed) - .5;
  vec2 pos = r*.7 + vec2(sin(t*.4*speed + h21(id)*6.28), cos(t*.33*speed + h21(id + 3.)*6.28))*.12;
  float d = length(f - pos);
  float size = mix(.018, .055, h21(id + 9.1)) ;
  float tw = .55 + .45*sin(t*1.7 + h21(id)*40.);
  float on = step(.35, h21(id + 5.));
  return vec3(smoothstep(size, 0., d)*tw*on);
}
// боке: мягкие диски с кромкой
float bokehLayer(vec2 p, float t, float scale, float seed, float speed){
  vec2 q = p*scale + vec2(t*speed*.05, -t*speed*.08) + seed*31.;
  vec2 id = floor(q); vec2 f = fract(q) - .5;
  vec2 pos = (h22(id + seed) - .5)*.55;
  float d = length(f - pos);
  float rad = mix(.16, .36, h21(id + 2.3));
  float on = step(.55, h21(id + seed*3.7));
  float breathe = .6 + .4*sin(t*.6*speed + h21(id)*20.);
  float disc = smoothstep(rad, rad*.82, d)*.28 + smoothstep(rad, rad - .02, d)*smoothstep(rad - .07, rad, d)*.55;
  return disc*on*breathe;
}
// искры: поднимаются столбцами, вытянуты вдоль движения
float emberLayer(vec2 p, float t, float cols, float seed, float speed){
  float cx = p.x*cols + seed*13.;
  float id = floor(cx);
  float fx = fract(cx) - .5;
  float rnd = h11(id + seed*7.);
  float life = fract(rnd + t*speed*(.05 + .07*h11(id + 1.3)));
  float y = life*1.5 - .75;
  float sway = sin(t*.9 + rnd*30.)*.18 + (h11(id + 4.) - .5)*.5;
  float dx = (fx - sway*.3)/cols;
  float dy = p.y - y;
  float len = .008 + .013*h11(id + 8.);
  float d = length(vec2(dx*1.2, dy*.45));
  float spark = smoothstep(len, 0., d);
  float fade = smoothstep(0., .12, life)*smoothstep(1., .55, life);
  float on = step(.5, h11(id + seed*2.1));
  float tw = .6 + .4*sin(t*9. + rnd*50.);
  return spark*fade*on*tw;
}

void main(){
  vec2 uv = vUv;
  vec2 asp = vec2(uAspect, 1.);
  vec2 p = (uv - .5)*asp;
  float t = uTime;
  float fx = uFx;

  // ударная волна: линза-кольцо от центра
  vec2 sc = (uv - uOrigin)*asp;
  float sr = length(sc);
  vec2 sdir = sr > 1e-4 ? sc/sr : vec2(0.);
  float e = uEv;
  float shockOn = (e > 0. && e < 3.2) ? 1. : 0.;
  float shockR = max(e, 0.)*.5;
  float shockAmp = uShock*shockOn*exp(-max(e, 0.)*1.15)*fx;
  float ring = exp(-pow((sr - shockR)*10., 2.))*shockAmp;
  uv -= sdir/asp*ring*.015;

  // зум-удар и аберрация
  float zp = (e > 0. ? exp(-e*3.4) : 0.)*uZoom*fx;
  vec2 zc = uOrigin;
  vec2 dir = (zc - uv);
  float ca = (uCA*.012*fx) + ring*.004;
  vec2 d0 = uv - .5;
  vec2 off = d0*dot(d0*asp, d0*asp)*ca*2.2 + sdir/asp*ring*.003;
  vec3 col = vec3(0.);
  const int N = 10;
  float wsum = 0.;
  for(int i = 0; i < N; i++){
    float k = float(i)/float(N - 1);
    vec2 s = uv + dir*k*zp*.1;
    float w = 1. - k*.5;
    col += vec3(texture2D(uSrc, s + off).r, texture2D(uSrc, s).g, texture2D(uSrc, s - off).b)*w;
    wsum += w;
  }
  col /= wsum;
  vec3 src = col;
  float lum = dot(src, vec3(.299, .587, .114));

  vec3 add = vec3(0.);
  vec3 gold = uTint;
  vec3 hot = mix(uTint, vec3(1., .96, .85), .55);

  if(uDust > 0.){
    float s = 0.;
    s += dustLayer(p, t, 9., 1., 1.).x*.55;
    s += dustLayer(p, t, 16., 2., 1.4).x*.8;
    s += dustLayer(p, t, 28., 3., 1.9).x*1.0;
    add += hot*s*uDust*.9*fx;
  }
  if(uBokeh > 0.){
    float b = bokehLayer(p, t, 3.4, 1., 1.) + bokehLayer(p, t, 5.4, 2., 1.3)*.7 + bokehLayer(p, t, 8., 3., 1.7)*.5;
    // боке тёплое и чуть меняет цвет по диску
    add += mix(gold, hot, .35)*b*uBokeh*.26*fx;
  }
  if(uEmber > 0.){
    float s = emberLayer(p, t, 7., 1., 1.) + emberLayer(p, t, 12., 2., 1.3)*.8 + emberLayer(p, t, 20., 3., 1.7)*.7;
    add += mix(vec3(1., .55, .15), hot, .4)*s*uEmber*1.05*fx;
  }
  if(uRays > 0.){
    vec2 rd = (uv - uOrigin)*asp;
    float r = length(rd);
    float ang = atan(rd.y, rd.x);
    float n1 = vn(ang*4.4 + t*.11*1.) , n2 = vn(ang*9.5 - t*.17), n3 = vn(ang*21. + t*.07);
    float beams = pow(clamp(n1*.5 + n2*.32 + n3*.18, 0., 1.), 2.6);
    float fall = exp(-r*1.9)*smoothstep(0., .08, r);
    float breathe = .8 + .2*sin(t*.5);
    add += mix(gold, hot, .3)*beams*fall*uRays*.5*breathe*fx;
  }
  if(uFlare > 0.){
    float fl = 0.;
    for(int c = 0; c < 2; c++){
      vec2 fp = c == 0 ? vec2(.06, .88) : vec2(.94, .12);
      vec2 dd = (uv - fp)*asp;
      float pulse = .7 + .3*sin(t*.9 + float(c)*2.4);
      float streak = exp(-abs(dd.y)*55.)*exp(-abs(dd.x)*1.8);
      float core = exp(-length(dd)*13.);
      float halo = exp(-length(dd)*3.2)*.22;
      fl += (streak*.75 + core*.9 + halo)*pulse;
    }
    add += mix(gold, hot, .5)*fl*uFlare*.36*fx;
  }
  if(uHaze > 0.){
    float fog = vn(p.x*1.6 + t*.07) * vn(p.y*2.1 - t*.05 + 7.) ;
    float fog2 = vn(p.x*3.1 - t*.09 + 3.)*vn(p.y*3.7 + t*.06);
    float f = (fog*.65 + fog2*.45);
    add += gold*f*uHaze*.11*fx*(1. - smoothstep(.15, .95, length(p)*.8)*.35);
  }
  if(uRings > 0.){
    float rl = 0.;
    for(int c = 0; c < 2; c++){
      vec2 corner = c == 0 ? vec2(0., 1.) : vec2(1., 0.);
      vec2 q = (uv - corner)*asp;
      float r = length(q);
      float a = atan(q.y, q.x);
      float dir2 = c == 0 ? 1. : -1.;
      for(int k = 0; k < 3; k++){
        float fk = float(k);
        float rad = .2314 + fk*.0318 + (k == 2 ? .0001 : 0.);
        float w = .0016 + .0006*fk*.0;
        float line = exp(-pow((r - rad)/w, 2.));
        float dash = k == 1 ? smoothstep(.15, .45, sin(a*40. + t*.19*dir2)*.5 + .5) : 1.;
        float alpha = k == 0 ? .75 : (k == 1 ? .5 : .62);
        rl += line*dash*alpha;
      }
    }
    add += mix(gold, vec3(1., .85, .5), .4)*rl*uRings*.8*fx;
  }
  if(uSweep > 0.){
    float period = 6.5;
    float ph = fract(t/period);
    float pos = -.9 + ph*2.2;
    float band = dot(uv - .5, normalize(vec2(1., .55))*vec2(1., 1.));
    float w = .075;
    float sw = exp(-pow((band*1.0 - pos*.55)/w, 2.));
    // блик цепляется за яркие детали золота
    add += (src*1.25*smoothstep(.2, .7, lum) + hot*.02)*sw*uSweep*fx;
  }
  // кольцо ударной волны светится
  add += mix(gold, hot, .5)*ring*.9;

  gl_FragColor = vec4(src + add, 1.);
}
`;

const BRIGHT_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tDiffuse; uniform float uThreshold;
varying vec2 vUv;
void main(){
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  float l = max(max(c.r, c.g), c.b);
  float k = smoothstep(uThreshold, uThreshold + .45, l);
  gl_FragColor = vec4(c*k, 1.);
}`;

const BLUR_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tDiffuse; uniform vec2 uStep;
varying vec2 vUv;
void main(){
  vec3 acc = vec3(0.); float ws = 0.;
  for(int i = -10; i <= 10; i++){
    float f = float(i);
    float w = exp(-f*f/38.);
    acc += texture2D(tDiffuse, vUv + uStep*f).rgb*w; ws += w;
  }
  gl_FragColor = vec4(acc/ws, 1.);
}`;

// Итоговый проход: свечение, полосы, призраки, цвет, плёнка, кадр.
const FINAL_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tBase, tBloomA, tBloomB, tStreak;
uniform float uTime, uEv, uFx, uAspect, uRes;
uniform float uBloom, uStreak, uGhost, uVig, uGrain, uFlash, uWarm, uLetter, uHue, uSat, uCon;
uniform vec3 uTint;
varying vec2 vUv;
${HASH}
void main(){
  vec2 uv = vUv;
  vec2 asp = vec2(uAspect, 1.);
  vec3 col = texture2D(tBase, uv).rgb;
  float fx = uFx;
  vec3 gold = uTint;

  vec3 bA = texture2D(tBloomA, uv).rgb;
  vec3 bB = texture2D(tBloomB, uv).rgb;
  col += (bA*.32 + bB*.55)*uBloom*fx;

  if(uStreak > 0.){
    vec3 s = texture2D(tStreak, uv).rgb;
    col += s*mix(gold, vec3(1.), .25)*uStreak*.85*fx;
  }
  if(uGhost > 0.){
    // зеркальные отражения ярких зон с дисперсией; сильнее в момент удара
    float pulse = .35 + (uEv > 0. ? exp(-uEv*1.6)*1.4 : 0.);
    vec2 d = uv - .5;
    vec3 g = vec3(0.);
    for(int i = 0; i < 3; i++){
      float k = -.55 - float(i)*.42;
      vec2 gu = .5 + d*k;
      vec3 sA = texture2D(tBloomA, gu*(1. + .012*float(i))).rgb;
      vec3 sB = vec3(texture2D(tBloomA, .5 + d*k*1.02).r, sA.g, texture2D(tBloomA, .5 + d*k*.98).b);
      float edge = smoothstep(.62, .2, length((gu - .5)*asp));
      g += sB*edge*(.8 - .2*float(i));
    }
    col += g*gold*uGhost*pulse*.85*fx;
  }
  if(uFlash > 0. && uEv > 0.){
    float f = exp(-uEv*5.2)*uFlash*fx;
    col += mix(gold, vec3(1., .97, .88), .6)*f*.34*(1. - .35*length((uv - .5)*asp));
  }
  // цвет: золотой тон, оттенок, насыщенность, контраст
  if(uWarm > 0.){
    float l = dot(col, vec3(.299, .587, .114));
    vec3 warm = col*vec3(1.07, 1.0, .86) + gold*.02;
    col = mix(col, mix(warm, vec3(l)*gold*1.5 + warm*.5, .18), clamp(uWarm, 0., 1.)*fx);
  }
  if(abs(uHue) > .001) col = hueRot(col, uHue*3.14159265/180.);
  float L = dot(col, vec3(.299, .587, .114));
  col = mix(vec3(L), col, uSat);
  col = (col - .5)*uCon + .5;

  if(uVig > 0.){
    vec2 d = (uv - .5)*asp;
    float v = smoothstep(.35, 1.05, length(d)*1.05);
    col *= 1. - v*clamp(uVig, 0., 2.)*.5*fx;
  }
  if(uGrain > 0.){
    float n = h21(uv*uRes + fract(uTime*37.)*91.7) - .5;
    float lum2 = dot(col, vec3(.333));
    col += n*uGrain*.07*fx*(1. - lum2*.55);
  }
  if(uLetter > 0.){
    float bar = (.5 - .5*(1.7778/2.39))*uLetter*mix(0., 1., fx);
    float aa = 1.5/uRes*1.0;
    float edge = min(uv.y, 1. - uv.y);
    col *= smoothstep(bar - .0008, bar + .0008, edge);
  }
  // дизеринг ±0.5 LSB: против полос на тёмных градиентах после 8-битного кодирования
  col += (h21(uv*uRes + 3.7) - .5)/255.;
  gl_FragColor = vec4(max(col, 0.), 1.);
}`;

const hexToRgb = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  const n = parseInt(m ? m[1] : "ffc878", 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / Math.max(1e-6, b - a))); return t * t * (3 - 2 * t); };

export class FxStack {
  constructor() {
    this.renderer = null;
    this.size = [0, 0];
    this.texture = null;
    this.texSource = null;
  }

  get canvas() { return this.renderer?.domElement || null; }

  _init(w, h) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(1);
    this.renderer.autoClear = false;
    this.quad = new FullScreenQuad();
    const mk = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
    const u = (value) => ({ value });
    this.mats = {
      overlay: mk(OVERLAY_FRAG, {
        uSrc: u(null), uTime: u(0), uEv: u(-1), uFx: u(1), uAspect: u(16 / 9),
        uDust: u(0), uBokeh: u(0), uEmber: u(0), uRays: u(0), uFlare: u(0), uSweep: u(0), uShock: u(0), uRings: u(0), uHaze: u(0),
        uZoom: u(0), uCA: u(0), uTint: u(new THREE.Vector3(1, .78, .47)), uOrigin: u(new THREE.Vector2(.5, .58)),
      }),
      bright: mk(BRIGHT_FRAG, { tDiffuse: u(null), uThreshold: u(.7) }),
      blur: mk(BLUR_FRAG, { tDiffuse: u(null), uStep: u(new THREE.Vector2()) }),
      final: mk(FINAL_FRAG, {
        tBase: u(null), tBloomA: u(null), tBloomB: u(null), tStreak: u(null),
        uTime: u(0), uEv: u(-1), uFx: u(1), uAspect: u(16 / 9), uRes: u(1080),
        uBloom: u(0), uStreak: u(0), uGhost: u(0), uVig: u(0), uGrain: u(0), uFlash: u(0), uWarm: u(0), uLetter: u(0),
        uHue: u(0), uSat: u(1), uCon: u(1), uTint: u(new THREE.Vector3(1, .78, .47)),
      }),
    };
    const opts = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, generateMipmaps: false };
    this.rt = {};
    for (const name of ["base", "bright", "h2", "v2", "h3", "v3", "s1", "s2"]) this.rt[name] = new THREE.WebGLRenderTarget(16, 16, opts);
    this._resize(w, h);
  }

  _resize(w, h) {
    this.size = [w, h];
    this.renderer.setSize(w, h, false);
    const set = (name, div) => this.rt[name].setSize(Math.max(8, Math.round(w / div)), Math.max(8, Math.round(h / div)));
    set("base", 1); set("bright", 2); set("h2", 4); set("v2", 4); set("h3", 8); set("v3", 8); set("s1", 4); set("s2", 4);
  }

  _pass(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.quad.render(this.renderer);
  }

  _blur(srcTex, a, b, stepPx, horizontalOnly = false) {
    const m = this.mats.blur;
    const [w, h] = [a.width, a.height];
    m.uniforms.tDiffuse.value = srcTex;
    m.uniforms.uStep.value.set(stepPx / w, 0);
    this._pass(m, a);
    if (horizontalOnly) return a.texture;
    m.uniforms.tDiffuse.value = a.texture;
    m.uniforms.uStep.value.set(0, stepPx / h);
    this._pass(m, b);
    return b.texture;
  }

  /**
   * Применить эффекты к кадру.
   * @param {HTMLCanvasElement} source готовый кадр композиции
   * @param {number} time абсолютное время кадра, с
   * @param {object} cfg раздел fxStack
   * @param {{start:number,end:number}} span начало и конец цикла сцены
   * @returns {HTMLCanvasElement|null} канвас эффектов (того же размера) либо null
   */
  render(source, time, cfg, span) {
    const w = source.width | 0, h = source.height | 0;
    if (!(w > 15 && h > 15)) return null;
    if (!this.renderer) this._init(w, h);
    else if (w !== this.size[0] || h !== this.size[1]) {
      this._resize(w, h);
    }
    if (!this.texture || this.texSource !== source || this.texture.image.width !== w || this.texture.image.height !== h) {
      this.texture?.dispose();
      this.texture = new THREE.CanvasTexture(source);
      this.texture.colorSpace = THREE.NoColorSpace;
      this.texture.minFilter = THREE.LinearFilter; this.texture.magFilter = THREE.LinearFilter;
      this.texture.generateMipmaps = false;
      this.texSource = source;
    }
    this.texture.needsUpdate = true;

    const k = (key) => Math.max(0, Number(cfg[key]) || 0);
    const speed = Math.max(0.05, Number(cfg.speed) || 1);
    const rel = time - (span?.start || 0);
    const total = Math.max(0.1, (span?.end ?? 1e9) - (span?.start || 0));
    const fx = smooth(0, Math.max(0.001, cfg.fadeIn), rel) * (1 - smooth(total - Math.max(0.001, cfg.fadeOut), total, rel));
    const ev = rel - (Number(cfg.eventTime) || 0);
    const tint = hexToRgb(cfg.tint);
    const aspect = w / h;
    const ou = this.mats.overlay.uniforms;
    ou.uSrc.value = this.texture;
    ou.uTime.value = rel * speed + 3.7;
    ou.uEv.value = ev;
    ou.uFx.value = (cfg.fadeIn <= 0 && cfg.fadeOut <= 0) ? 1 : fx;
    ou.uAspect.value = aspect;
    ou.uDust.value = k("dust"); ou.uBokeh.value = k("bokeh"); ou.uEmber.value = k("embers"); ou.uRays.value = k("rays");
    ou.uFlare.value = k("flare"); ou.uSweep.value = k("sweep"); ou.uShock.value = k("shock"); ou.uRings.value = k("rings");
    ou.uHaze.value = k("haze"); ou.uZoom.value = k("zoom"); ou.uCA.value = k("aberration");
    ou.uTint.value.set(tint[0], tint[1], tint[2]);
    // y в UV идёт снизу вверх, а в панели — сверху вниз
    ou.uOrigin.value.set(Number(cfg.originX) || 0.5, 1 - (Number.isFinite(cfg.originY) ? cfg.originY : 0.42));
    this._pass(this.mats.overlay, this.rt.base);

    const bloom = k("bloom"), streak = k("streak"), ghosts = k("ghosts");
    let bloomA = this.rt.base.texture, bloomB = this.rt.base.texture, streakTex = this.rt.base.texture;
    if (bloom > 0 || streak > 0 || ghosts > 0) {
      this.mats.bright.uniforms.tDiffuse.value = this.rt.base.texture;
      this._pass(this.mats.bright, this.rt.bright);
      const br = this.rt.bright.texture;
      bloomA = this._blur(br, this.rt.h2, this.rt.v2, 1.6);
      bloomB = this._blur(bloomA, this.rt.h3, this.rt.v3, 1.8);
      if (streak > 0) {
        this._blur(br, this.rt.s1, this.rt.s2, 3.2, true);
        streakTex = this._blur(this.rt.s1.texture, this.rt.s2, this.rt.s1, 9, true);
        streakTex = this.rt.s2.texture;
      }
    }
    const fu = this.mats.final.uniforms;
    fu.tBase.value = this.rt.base.texture; fu.tBloomA.value = bloomA; fu.tBloomB.value = bloomB; fu.tStreak.value = streakTex;
    fu.uTime.value = rel; fu.uEv.value = ev; fu.uFx.value = ou.uFx.value; fu.uAspect.value = aspect; fu.uRes.value = h;
    fu.uBloom.value = bloom; fu.uStreak.value = streak; fu.uGhost.value = ghosts;
    fu.uVig.value = k("vignette"); fu.uGrain.value = k("grain"); fu.uFlash.value = k("flash"); fu.uWarm.value = k("warm");
    fu.uLetter.value = Math.min(1, k("letterbox"));
    fu.uHue.value = Number(cfg.hue) || 0; fu.uSat.value = Number.isFinite(cfg.saturation) ? cfg.saturation : 1;
    fu.uCon.value = Number.isFinite(cfg.contrast) ? cfg.contrast : 1;
    fu.uTint.value.set(tint[0], tint[1], tint[2]);
    this._pass(this.mats.final, null);
    return this.renderer.domElement;
  }

  dispose() {
    if (!this.renderer) return;
    this.texture?.dispose();
    for (const rt of Object.values(this.rt)) rt.dispose();
    for (const m of Object.values(this.mats)) m.dispose();
    this.quad.dispose();
    this.renderer.dispose();
    this.renderer = null;
  }
}
