import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateIntroBackground } from '../src/studio/background-migration.js';
test('existing background gains a minute of hold and removes extra elements', () => {
  const saved = { timeline: { drawDuration: 4.5, emergeDuration: 0, holdDuration: 53, fadeDuration: 2.5 }, lab2_dividers: { enabled: true }, lab2_title: { text: 'old' }, lab2_general: { hold: 46.4 }, lab2_camera: { sway: .4 } };
  const defaults = { timeline: { drawDuration: 4.5, emergeDuration: 0 }, lab2_general: { compositionY: -.86, hold: 53.4 } };
  const migrated = migrateIntroBackground(saved, defaults);
  assert.equal(migrated.timeline.holdDuration, 60);
  assert.equal(migrated.lab2_dividers.enabled, false);
  assert.equal(migrated.lab2_subtitle.enabled, false);
  assert.equal(migrated.lab2_date.enabled, false);
  assert.equal(migrated.lab2_title.text, 'ЯНТАРНЫЙ ЦИРКУЛЬ');
  assert.equal(migrated.lab2_general.compositionY, -.86);
  assert.equal(migrated.lab2_camera.sway, .4);
  assert.equal(saved.timeline.holdDuration, 53);
});
