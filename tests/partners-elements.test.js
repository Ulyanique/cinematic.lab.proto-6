import test from 'node:test';
import assert from 'node:assert/strict';
import { PARTNERS_ELEMENT_SCHEMA, partnerElementDefaults, elementVisibility, labelLineLayout } from '../src/studio/partners-elements.js';
import { migrateCurtainEdge, migrateCurtainEdgeV3, migrateSponsorLabels, migratePartnersReferenceLayout, migratePartnerLabelLines, migratePartnersTopTitle, migratePartnersCompassContrast, migratePartnersTitleAndKeaz, partnersStageCues } from '../src/studio/partners-stage.js';
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
  assert.equal(PARTNERS_DEFAULTS.stagePartner2.scale, 1);
  assert.equal(SPONSOR_KEAZ_DEFAULTS.stageSingleMark.x, 1130);
  assert.equal(PARTNERS_DEFAULTS.partners.curtainWidth, 196);
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
  assert.ok(PARTNERS_DEFAULTS.stagePartnerLabel.x > PARTNERS_DEFAULTS.stagePartner1.x);
  assert.ok(PARTNERS_DEFAULTS.stagePartnerLabel2.x < PARTNERS_DEFAULTS.stagePartner2.x);
  assert.equal(PARTNERS_DEFAULTS.partners.partnerLabel, 'ПАРТНЁР');
  assert.equal(PARTNERS_DEFAULTS.partners.partner2Label, 'ПАРТНЁР');
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


test('reference layout migration changes only untouched positions', () => {
  const saved = { stageOrganizer1: {x:500,y:205,opacity:.6}, stagePartner1: {x:490,y:475}, stagePartnerLabel2: {x:1420,y:330} };
  const next = migratePartnersReferenceLayout(saved);
  assert.deepEqual(next.stageOrganizer1, {x:430,y:260,opacity:.6});
  assert.deepEqual(next.stagePartner1, {x:490,y:475});
  assert.deepEqual(next.stagePartnerLabel2, {x:1490,y:365});
  assert.equal(saved.stageOrganizer1.x, 500);
  assert.ok(PARTNERS_DEFAULTS.stageTitleDivider);
  assert.ok(SPONSOR_KEAZ_DEFAULTS.stageTitleDivider);
});


test('label lines are editable and old standard labels migrate without replacing custom values', () => {
  for (const id of ['stageOrganizerLabel','stageCoorganizerLabel','stagePartnerLabel','stagePartnerLabel2']) {
    assert.equal(PARTNERS_DEFAULTS[id].lineEnabled, true);
    const schema = PARTNERS_ELEMENT_SCHEMA.find(s => s.id === id);
    assert.ok(['lineEnabled', 'lineLength', 'lineGap', 'lineOpacity'].every(k => schema.fields.some(f => f.key === k)));
  }
  const saved = { partners: { partnerLabel:'СПОНСОРЫ', partner2Label:'ПАРТНЁР' }, stagePartnerLabel:{x:410,y:365}, stagePartnerLabel2:{x:1500,y:365} };
  const next = migratePartnerLabelLines(saved);
  assert.equal(next.partners.partnerLabel, 'СПОНСОР');
  assert.equal(next.partners.partner2Label, 'ПАРТНЁР');
  assert.equal(next.stagePartnerLabel.x, 490);
  assert.equal(next.stagePartnerLabel2.x, 1500);
  assert.equal(saved.partners.partnerLabel, 'СПОНСОРЫ');
});


test('label decoration extends outward without crossing the text', () => {
  assert.deepEqual(labelLineLayout(500, 200, -1, 20, 300), { near: 380, far: 80 });
  assert.deepEqual(labelLineLayout(1400, 200, 1, 20, 300), { near: 1520, far: 1820 });
  assert.deepEqual(labelLineLayout(0, 800, -1, 0, 0), { near: -230, far: -230 });
});


test('reference composition places the evening name above the partner rows without overriding custom placement', () => {
  assert.equal(PARTNERS_DEFAULTS.stageTitle.y, 150);
  assert.equal(PARTNERS_DEFAULTS.stageSubtitle.y, 235);
  assert.ok(PARTNERS_DEFAULTS.stageOrganizer1.y < PARTNERS_DEFAULTS.stagePartner1.y);
  assert.equal(SPONSOR_KEAZ_DEFAULTS.stageTitle.y, 150);
  const old = { stageTitle: {x:960,y:780}, stageCompass:{x:900,y:540} };
  const next = migratePartnersTopTitle(old);
  assert.equal(next.stageTitle.y, 150);
  assert.equal(next.stageCompass.x, 900);
  assert.equal(next.stageCompass.y, 540);
  assert.equal(old.stageTitle.y, 780);
});


test('compass matches ornament by default without overwriting custom opacity', () => {
  assert.equal(PARTNERS_DEFAULTS.stageCompass.color, PARTNERS_DEFAULTS.stageOrnament.color);
  assert.equal(PARTNERS_DEFAULTS.stageCompass.opacity, 1);
  assert.equal(SPONSOR_KEAZ_DEFAULTS.stageCompass.opacity, .42);
  assert.equal(migratePartnersCompassContrast({ stageCompass: { opacity: .42 } }).stageCompass.opacity, 1);
  assert.equal(migratePartnersCompassContrast({ stageCompass: { opacity: .7 } }).stageCompass.opacity, .7);
  assert.equal(PARTNERS_ELEMENT_SCHEMA.find(s => s.id === 'stageOrnament').fields.some(f => f.key === 'edgeFade'), true);
});


test('title divider is wider and editable; subtitle and KEAZ migrate independently', () => {
  assert.equal(PARTNERS_DEFAULTS.stageTitleDivider.width, 520);
  assert.equal(PARTNERS_DEFAULTS.stageTitleDivider.y, 195);
  assert.ok(PARTNERS_ELEMENT_SCHEMA.find(s => s.id === 'stageTitleDivider').fields.some(f => f.key === 'width'));
  assert.equal(SPONSOR_KEAZ_DEFAULTS.stageTitleDivider.width, 520);
  const old = { stageSubtitle: { x: 950, y: 250 }, stageTitleDivider: { x: 960, y: 210 }, stageOrganizer1: { scale: .9 }, stagePartner2: { x: 1400, scale: .8 } };
  const next = migratePartnersTitleAndKeaz(old);
  assert.deepEqual(next.stageSubtitle, {x: 950, y: 230});
  assert.deepEqual(next.stageTitleDivider, {x: 960, y: 190});
  assert.deepEqual(next.stagePartner2, {x: 1400, scale: .9});
  assert.equal(old.stageSubtitle.y, 250);
  assert.equal(old.stagePartner2.scale, .8);
});
