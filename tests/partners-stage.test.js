import test from 'node:test';
import assert from 'node:assert/strict';
import { partnersStageCues, migratePartnersStage } from '../src/studio/partners-stage.js';
const tl = { drawDuration: 2.6, emergeDuration: 2.4, holdDuration: 30, fadeDuration: 2.3, restDuration: 1.2 };
const at = t => partnersStageCues({ beforeStart: false, local: t }, tl);
test('curtains open before the logo and sponsors, and close in reverse order', () => {
  assert.equal(at(0).curtainOpen, 0);
  assert.equal(at(0).organizer, 0);
  assert.equal(at(2.1).curtainOpen, 1);
  assert.ok(at(2.1).compass < 1e-10);
  assert.ok(at(2.5).compass > 0);
  assert.equal(at(2.1).organizer, 0);
  assert.equal(at(5).organizer, 1);
  assert.equal(at(35).curtainOpen, 1);
  assert.equal(at(37.3).curtainOpen, 0);
  assert.equal(at(37.3).organizer, 0);
  for (const u of [.2, .4, .6, .8]) {
    const eased = u * u * (3 - 2 * u);
    const opened = at((1 - eased) * 5);
    const closed = at(35 + 2.3 * u);
    for (const key of ['curtainOpen', 'compass', 'organizer', 'partnerSecond']) {
      assert.ok(Math.abs(opened[key] - closed[key]) < 1e-9, key);
    }
  }
});
test('existing settings retain assets and get 30 seconds of hold', () => {
  const saved = { timeline: { holdDuration: 17.5 }, partners: { curtainWidth: 476, partner1Logo: 'custom' } };
  const next = migratePartnersStage(saved);
  assert.equal(next.timeline.holdDuration, 30);
  assert.equal(next.partners.curtainWidth, 96);
  assert.equal(next.partners.partner1Logo, 'custom');
  assert.equal(saved.timeline.holdDuration, 17.5);
  assert.equal(migratePartnersStage({ timeline: { holdDuration: 45 } }).timeline.holdDuration, 45);
});
