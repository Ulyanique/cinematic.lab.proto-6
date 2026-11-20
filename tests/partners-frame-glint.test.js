import test from 'node:test';
import assert from 'node:assert/strict';
import { createPartnersFrameGlint } from '../src/studio/partners-frame-glint.js';
import { framePathPoint } from '../src/studio/partners-motion.js';

test('glint ribbon follows the inset frame and is driven by time', () => {
  const glint = createPartnersFrameGlint();
  const geo = glint.mesh.geometry;
  assert.equal(geo.attributes.position.count, 720 * 6);
  const first = framePathPoint(0);
  const x = (geo.attributes.position.getX(0) + geo.attributes.position.getX(1)) / 2;
  const y = (geo.attributes.position.getY(0) + geo.attributes.position.getY(1)) / 2;
  assert.ok(Math.abs(x - ((960 + (first.x - 960) * .94) / 960 - 1)) < 1e-6);
  assert.ok(Math.abs(y - (1 - (540 + (first.y - 540) * .94) / 540)) < 1e-6);
  assert.match(glint.mesh.material.fragmentShader, /time/);
  glint.dispose();
});
