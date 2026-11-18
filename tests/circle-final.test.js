import test from 'node:test';
import assert from 'node:assert/strict';
import { circleFinalTiming } from '../src/studio/circle-final-timing.js';
import { CIRCLE_FINAL_DEFAULTS } from '../src/studio/scenes/circle-final.js';
import { computePhase } from '../src/studio/timeline.js';

test('standalone final film uses original shot frame range and timeline fade', () => {
  const t = CIRCLE_FINAL_DEFAULTS.timeline;
  const at = time => circleFinalTiming(computePhase(time, t), t);
  assert.equal(at(0).opacity, 0);
  assert.equal(at(0).frame, 963);
  assert.equal(at(1.7).frame, 1004);
  assert.equal(at(9).opacity, 1);
  assert.equal(at(10).opacity, .5);
  assert.equal(at(11).opacity, 0);
  assert.equal(at(11.5).opacity, 0);
  assert.equal(at(12).opacity, 0);
  assert.equal(circleFinalTiming({beforeStart:true,local:5}, t).opacity, 0);
  assert.equal(at(5).frame, at(5).frame);
});
