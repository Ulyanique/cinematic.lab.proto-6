/**
 * Дешёвые «смоук-защиты» галереи: регрессии, которые раньше ловил только глаз
 * (невидимый лого из-за uReveal=0, лучи в начале, пропадающая сетка).
 * Тесты сверяют исходники движка — движок рендерит в WebGL, настоящего
 * скриншота в node нет, поэтому проверяем ключевые инварианты.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = (p) => readFileSync(path.join(root, p), 'utf8');

test('builtin gallery clips exist in repo and back the default slots', () => {
  for (let i = 1; i <= 10; i++) {
    const f = path.join(root, 'video', 'gallery', `${String(i).padStart(2, '0')}.mp4`);
    assert.ok(existsSync(f), `отсутствует ${f}`);
    assert.ok(statSync(f).size > 100_000, `подозрительно маленький файл ${f}`);
  }
  assert.match(read('src/studio/scenes/gallery.js'), /GALLERY_BUILTIN\[i\]/);
  assert.match(read('src/studio/gallery-defaults.js'), /GALLERY_BUILTIN_FLAG/);
});

test('finale has no fireball: it shows the intro emblem instead', () => {
  const finale = read('src/studio/gallery/finale.ts');
  assert.doesNotMatch(finale, /SphereGeometry|fireball|Fireball|uBeam|streak/i);
  assert.match(finale, /buildEmblem/);
  // Осколков остаётся много, шара — ноль.
  assert.match(finale, /ConvexGeometry/);
});

test('intro-style beams are off in the gallery background', () => {
  assert.match(read('src/studio/gallery/engine.ts'), /bu\.uBeam\.value = 0/);
});

test('floor/ceiling grid is never fogged out on panel switches', () => {
  assert.match(read('src/studio/gallery/engine.ts'), /mat\.fog = false/);
});

test('gold material fails open: uReveal defaults to 1, not 0', () => {
  assert.match(read('src/studio/lab2/gold.ts'), /uReveal: \{ value: 1 \}/);
});

test('FIN_Y has a single source of truth (gallery/config.ts)', () => {
  assert.match(read('src/studio/gallery/config.ts'), /export const FIN_Y = 1000/);
  assert.doesNotMatch(read('src/studio/gallery/finale.ts'), /const FIN_Y =/);
  assert.doesNotMatch(read('src/studio/gallery/engine.ts'), /const FIN_Y =/);
});

test('corridor and finale geometry are deterministic (no Math.random at build)', () => {
  for (const p of ['src/studio/gallery/engine.ts', 'src/studio/gallery/finale.ts']) {
    assert.doesNotMatch(read(p), /Math\.random/, p);
  }
});

test('export waits for the media queue before rendering', () => {
  const scene = read('src/studio/gallery-scene.js');
  assert.match(scene, /syncSlots\(\)/);
  assert.match(scene, /Promise\.allSettled\(\[\.\.\.this\._loading\.values\(\)\]\)/);
});

test('shared emblem builder is used by both intro and finale', () => {
  assert.match(read('src/studio/lab2/Intro.ts'), /buildEmblem/);
  assert.match(read('src/studio/gallery/finale.ts'), /buildEmblem/);
  assert.match(read('src/studio/lab2/emblem.ts'), /export function buildEmblem/);
});

test('gallery panels are split into a rectangular triptych with the largest central piece', () => {
  const engine = read('src/studio/gallery/engine.ts');
  assert.match(engine, /function designedShards/);
  // прямоугольная рама и три куска, центральный — самый большой
  assert.match(engine, /CUT_TOP_L/);
  assert.match(engine, /CUT_BOT_R/);
  // центральная трапеция шире боковых квадов на обоих краях
  const hw = 1;
  const m = engine.match(/const CUT_TOP_L = ([-\d.]+), CUT_BOT_L = ([-\d.]+) \/\/.*?\nconst CUT_TOP_R = ([-\d.]+), CUT_BOT_R = ([-\d.]+)/s);
  const [topL, botL, topR, botR] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  const sideLTop = topL - (-1), sideRTop = 1 - topR;
  const centerTop = topR - topL;
  const centerBot = botR - botL;
  const sideLBot = botL - (-1), sideRBot = 1 - botR;
  assert.ok(centerTop > sideLTop && centerTop > sideRTop, 'центральная часть шире боковых сверху');
  assert.ok(centerBot > sideLBot && centerBot > sideRBot, 'центральная часть шире боковых снизу');
  assert.ok(centerTop >= centerBot, 'центр сужается книзу — как в эскизе');
  assert.ok(topL < botL && topR > botR, 'резы диагональные, внешние куски сужаются книзу');
  // куски смещены по глубине и едва повёрнуты (эскиз: тонкие диагональные зазоры)
  assert.match(engine, /piece\.position\.set\(cx, cy, \(panelRng\(\) - 0\.5\) \* 0\.55\)/);
  assert.match(engine, /piece\.rotation\.z = /);
  // видео при этом остаётся единым через непрерывные UV
  assert.match(engine, /uv\.setXY\(k, \(pa\.getX\(k\) \+ hw\) \/ PANEL_W/);
  // панели парят на своей глубине, а не в одной плоскости
  assert.match(engine, /PANEL_DIST \+ \(panelRng\(\) - 0\.5\) \* 2\.3/);
});
