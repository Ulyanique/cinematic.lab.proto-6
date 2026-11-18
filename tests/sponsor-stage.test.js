import test from 'node:test';
import assert from 'node:assert/strict';
import { SPONSOR_PROMRUKAV_DEFAULTS as a, SPONSOR_KEAZ_DEFAULTS as b } from '../src/studio/scenes/partners.js';
import { migrateSponsorStage } from '../src/studio/partners-stage.js';
import { sectionAllowed } from '../src/studio/ui/field-rules.js';

test('individual sponsors share timing, curtains and optional light', () => {
  for (const cfg of [a, b]) {
    assert.equal(cfg.timeline.drawDuration + cfg.timeline.emergeDuration, 9);
    assert.equal(cfg.timeline.holdDuration, 30);
    assert.equal(cfg.sponsor.curtainWidth, 168);
    assert.equal(cfg.partnersLight.enabled, true);
  }
  assert.equal(a.sponsor.mark, 'promrukav');
  assert.equal(b.sponsor.mark, 'keaz');
  assert.equal(sectionAllowed('sponsor-keaz', 'partnersLight'), true);
});

test('migration preserves custom marks and manually edited timing', () => {
  const old = { sponsor: { markLogo: 'custom-logo', curtainWidth: 476 }, timeline: {
    drawDuration: 2.6, emergeDuration: 2.4, holdDuration: 7.5, fadeDuration: 2.3, restDuration: 1.2,
  } };
  const migrated = migrateSponsorStage(old);
  assert.equal(migrated.sponsor.markLogo, 'custom-logo');
  assert.equal(migrated.sponsor.curtainWidth, 96);
  assert.equal(migrated.timeline.drawDuration, 6.6);
  assert.equal(migrated.timeline.holdDuration, 30);
  assert.equal(old.sponsor.curtainWidth, 476);
  old.timeline.holdDuration = 15;
  assert.equal(migrateSponsorStage(old).timeline.holdDuration, 15);
  assert.equal(migrateSponsorStage(old).timeline.drawDuration, 2.6);
});
