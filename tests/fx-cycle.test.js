import test from 'node:test';
import assert from 'node:assert/strict';
import { fxCycleTime } from '../src/studio/fx-cycle.js';

test('effects restart with the scene and seek deterministically', () => {
  const span = { start: 2, end: 12 };
  assert.deepEqual(fxCycleTime(1, span), { relative: 0, total: 10, beforeStart: true });
  assert.deepEqual(fxCycleTime(5, span), { relative: 3, total: 10, beforeStart: false });
  assert.deepEqual(fxCycleTime(15, span), { relative: 3, total: 10, beforeStart: false });
  assert.equal(fxCycleTime(12, span).relative, 0);
});
