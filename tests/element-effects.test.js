import test from 'node:test';
import assert from 'node:assert/strict';
import { elementLightPulse } from '../src/studio/element-effects.js';

test('disabled or missing effect leaves element unchanged', () => {
  assert.equal(elementLightPulse(3.7, 0, 0.3), 0);
  assert.equal(elementLightPulse(3.7, undefined, undefined), 0);
});

test('pulse is bounded, independent, and deterministic for seeking', () => {
  assert.ok(Math.abs(elementLightPulse(0.25, 1, 1) - 1) < 1e-10);
  assert.ok(elementLightPulse(0.75, 1, 1) < 1e-10);
  assert.equal(elementLightPulse(4.2, 0.4, 0.3), elementLightPulse(4.2, 0.4, 0.3));
  assert.ok(elementLightPulse(4.2, 100, 999) <= 1);
});
