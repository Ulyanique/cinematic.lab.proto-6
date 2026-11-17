import test from 'node:test';
import assert from 'node:assert/strict';
import { clampSeconds, holdForDuration, phaseChange, phaseValues } from '../src/studio/operator-timeline.js';
import { oncePerCycleTime } from '../src/studio/playback.js';

const timeline = { drawDuration: 4.5, emergeDuration: 0, holdDuration: 6.6, fadeDuration: 2.5, restDuration: 0 };

test('film duration includes all phases, not only hold', () => {
  assert.ok(Math.abs(holdForDuration(timeline, 13.6) - 6.6) < 1e-9);
  const updated = { ...timeline, holdDuration: holdForDuration(timeline, 20) };
  assert.equal(phaseValues(updated).cycle, 20);
});

test('blank input is not silently converted to zero', () => {
  for (const value of ['', '  ', null, undefined, 'bad']) assert.equal(clampSeconds(value, 0, 20), null);
  assert.equal(clampSeconds('0', 0, 20), 0);
  assert.equal(clampSeconds('1,5', 0, 20), 1.5);
  assert.equal(phaseChange(timeline, 'entry', ''), null);
});

test('intro waits at end until the next cycle', () => {
  assert.equal(oncePerCycleTime(0, 16.26, 13.6), 0);
  assert.equal(oncePerCycleTime(14.78, 16.26, 13.6), 13.6);
  assert.ok(oncePerCycleTime(16.27, 16.26, 13.6) < 0.02);
  assert.equal(oncePerCycleTime(9, 10, 13.6), 9);
});

import { lab2FrameTiming } from '../src/studio/lab2-timing.js';

test('intro entrance and exit follow edited phase boundaries', () => {
  const edited = { ...timeline, drawDuration: 6, holdDuration: 8, fadeDuration: 3 };
  assert.deepEqual(lab2FrameTiming(0, edited, 4.5), { filmTime: 0, fade: 0 });
  assert.equal(lab2FrameTiming(3, edited, 4.5).filmTime, 2.25);
  assert.equal(lab2FrameTiming(6, edited, 4.5).filmTime, 4.5);
  assert.equal(lab2FrameTiming(14, edited, 4.5).fade, 0);
  assert.ok(Math.abs(lab2FrameTiming(15.5, edited, 4.5).fade - 0.5) < 1e-9);
  assert.equal(lab2FrameTiming(17, edited, 4.5).fade, 1);
});

test('long background hold runs naturally and remains visible until exit', () => {
  const background = { ...timeline, holdDuration: 53 };
  assert.equal(lab2FrameTiming(10, background, 4.5).filmTime, 10);
  assert.equal(lab2FrameTiming(40, background, 4.5).fade, 0);
  assert.equal(lab2FrameTiming(60, background, 4.5).fade, 1);
});

test('zero entry or fade and a rest phase are well-defined', () => {
  const edited = { drawDuration: 0, emergeDuration: 0, holdDuration: 2, fadeDuration: 0, restDuration: 1 };
  assert.equal(lab2FrameTiming(0, edited, 4.5).filmTime, 4.5);
  assert.equal(lab2FrameTiming(1.9, edited, 4.5).fade, 0);
  assert.equal(lab2FrameTiming(2, edited, 4.5).fade, 1);
  assert.equal(lab2FrameTiming(2.5, edited, 4.5).fade, 1);
});
