import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** Инварианты замены фона фотопаузы на рисунок интро. */
const scene = readFileSync('src/studio/photo-pause-scene.js', 'utf8');

test('photo pause uses the intro backdrop shader', () => {
  assert.match(scene, /import \{ bgVert, bgFrag \} from "\.\/lab2\/shaders\.ts"/);
  assert.match(scene, /fragmentShader: bgFrag/);
});

test('classic warm backdrop is hidden, not removed (classic scenes unchanged)', () => {
  assert.match(scene, /this\.background\.mesh\.visible = false/);
});

test('intro backdrop renders behind everything and is not culled', () => {
  assert.match(scene, /renderOrder = -10/);
  assert.match(scene, /frustumCulled = false/);
});

test('backdrop uniforms are driven from t and the camera each frame', () => {
  assert.match(scene, /bu\.uTime\.value = t/);
  assert.match(scene, /bu\.uCam\.value\.set\(this\.camera\.position\.x \* -0\.25/);
  assert.match(scene, /bu\.uAspect\.value = this\.camera\.aspect/);
});

test('no randomness in the photo pause scene (export is deterministic)', () => {
  assert.ok(!scene.includes('Math.random'));
});

test('dispose releases the intro backdrop', () => {
  assert.match(scene, /this\.introBackdrop\.dispose\(\)/);
});
