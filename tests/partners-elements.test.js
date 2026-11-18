import test from 'node:test';
import assert from 'node:assert/strict';
import { PARTNERS_ELEMENT_SCHEMA, partnerElementDefaults, elementVisibility } from '../src/studio/partners-elements.js';
import { migrateCurtainEdge, migrateCurtainEdgeV3, migrateSponsorLabels, partnersStageCues } from '../src/studio/partners-stage.js';
import { sectionAllowed, eyeKey } from '../src/studio/ui/field-rules.js';
import { PARTNERS_DEFAULTS, SPONSOR_KEAZ_DEFAULTS } from '../src/studio/scenes/partners.js';

test('editable layers are scene-specific, independently configured, and have eye controls', () => {
  const group = partnerElementDefaults(false), single = partnerElementDefaults(true);
  assert.ok(group.stageOrganizer1 && group.stagePartner2 && !group.stageSingleMark);
  assert.ok(single.stageSingleMark && !single.stageOrganizer1 && !single.stagePartner2);
  for (const id of ['stageBackground', 'stageCurtains', 'stageFrame', 'stageParticles', 'stageCompass', 'stageTitle', 'stageSubtitle']) {
    assert.ok(group[id] && single[id], id);
    const schema = PARTNERS_ELEMENT_SCHEMA.find(s => s.id === id);
    assert.equal(eyeKey(schema), 'enabled');
    assert.equal(sectionAllowed('partners', id), true);
    assert.equal(sectionAllowed('sponsor-keaz', id), true);
  }
  assert.equal(PARTNERS_DEFAULTS.stagePartner2.scale, .8);
  assert.equal(SPONSOR_KEAZ_DEFAULTS.stageSingleMark.x, 960);
  assert.equal(PARTNERS_DEFAULTS.partners.curtainWidth, 168);
});

test('custom mark entry follows edited time and reverses with scene progress', () => {
  const element = { start: 20, end: 40 };
  assert.equal(elementVisibility(.2, element), 0);
  assert.ok(Math.abs(elementVisibility(.3, element) - .5) < 1e-9);
  assert.equal(elementVisibility(.4, element), 1);
  const tl = { drawDuration: 9, emergeDuration: 0, holdDuration: 30, fadeDuration: 3, restDuration: 0 };
  const open = partnersStageCues({ local: 9 * .3 }, tl);
  const close = partnersStageCues({ local: 39 + 3 * .6367425089 }, tl);
  assert.ok(Math.abs(elementVisibility(open.progress, element) - elementVisibility(close.progress, element)) < .001);
});

test('curtain width migration changes only the old default', () => {
  for (const section of ['partners', 'sponsor']) {
    const original = { [section]: { curtainWidth: 96 } };
    assert.equal(migrateCurtainEdge(original, section)[section].curtainWidth, 144);
    assert.equal(original[section].curtainWidth, 96);
    assert.equal(migrateCurtainEdge({ [section]: { curtainWidth: 128 } }, section)[section].curtainWidth, 128);
  }
});


test('sponsor labels are separate, align over logos and preserve old custom text and style', () => {
  assert.equal(PARTNERS_DEFAULTS.stagePartnerLabel.x, PARTNERS_DEFAULTS.stagePartner1.x);
  assert.equal(PARTNERS_DEFAULTS.stagePartnerLabel2.x, PARTNERS_DEFAULTS.stagePartner2.x);
  assert.equal(PARTNERS_DEFAULTS.partners.partnerLabel, 'СПОНСОР');
  assert.equal(PARTNERS_DEFAULTS.partners.partner2Label, 'СПОНСОР');
  const old = { partners: { partnerLabel: 'СПОНСОРЫ' }, stagePartnerLabel: { x: 960, opacity: .7, color: '#ffffff' } };
  const next = migrateSponsorLabels(old);
  assert.equal(next.partners.partnerLabel, 'СПОНСОР');
  assert.equal(next.partners.partner2Label, 'СПОНСОР');
  assert.equal(next.stagePartnerLabel.x, 500);
  assert.equal(next.stagePartnerLabel2.x, 1420);
  assert.equal(next.stagePartnerLabel2.opacity, .7);
  assert.equal(old.stagePartnerLabel.x, 960);
  const custom = migrateSponsorLabels({ partners: { partnerLabel: 'ПАРТНЁР' }, stagePartnerLabel: { x: 350 } });
  assert.equal(custom.partners.partner2Label, 'ПАРТНЁР');
  assert.equal(custom.stagePartnerLabel.x, 350);
});

test('new curtain migration preserves custom widths and affects all sponsor scenes', () => {
  for (const section of ['partners', 'sponsor']) {
    assert.equal(migrateCurtainEdgeV3({ [section]: { curtainWidth: 144 } }, section)[section].curtainWidth, 168);
    assert.equal(migrateCurtainEdgeV3({ [section]: { curtainWidth: 128 } }, section)[section].curtainWidth, 128);
  }
});
