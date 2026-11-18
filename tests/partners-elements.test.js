import test from 'node:test';
import assert from 'node:assert/strict';
import { PARTNERS_ELEMENT_SCHEMA, partnerElementDefaults, elementVisibility } from '../src/studio/partners-elements.js';
import { migrateCurtainEdge, partnersStageCues } from '../src/studio/partners-stage.js';
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
  assert.equal(PARTNERS_DEFAULTS.partners.curtainWidth, 144);
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
