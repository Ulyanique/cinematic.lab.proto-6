import test from 'node:test';
import assert from 'node:assert/strict';
import { partnersStageCues, migratePartnersStage } from '../src/studio/partners-stage.js';
const tl = { drawDuration: 2.6, emergeDuration: 2.4, holdDuration: 30, fadeDuration: 2.3, restDuration: 1.2 };
const at = t => partnersStageCues({ beforeStart: false, local: t }, tl);
test('curtains, large emblem, shrinking and logos appear in order and reverse on exit', () => {
  assert.equal(at(0).background, 0);
  assert.equal(at(0).curtainOpen, 0);
  assert.equal(at(1.15).curtainOpen, 1);
  assert.equal(at(1.15).compass, 0);
  assert.ok(at(1.9).compass > 0);
  assert.equal(at(1.9).compassShrink, 0);
  assert.equal(at(2.1).organizer, 0);
  assert.equal(at(2.85).compassShrink, 1);
  assert.ok(at(3.1).organizer > 0);
  assert.equal(at(3.1).organizerSecond, 0);
  assert.equal(at(3.6).organizer, 1);
  assert.ok(at(3.6).organizerSecond > 0);
  assert.equal(at(3.6).partner, 0);
  assert.ok(at(4.1).partner > 0);
  assert.equal(at(4.1).partnerSecond, 0);
  assert.ok(at(4.5).partnerSecond > 0);
  assert.equal(at(5).partnerSecond, 1);
  assert.equal(at(5).title, 1);
  assert.equal(at(35).curtainOpen, 1);
  assert.equal(at(37.3).curtainOpen, 0);
  for (const u of [.2, .4, .6, .8]) {
    const eased = u * u * (3 - 2 * u);
    const opened = at((1 - eased) * 5);
    const closed = at(35 + 2.3 * u);
    for (const key of ['background', 'curtainOpacity', 'curtainOpen', 'compass', 'compassShrink', 'title', 'organizer', 'partner', 'organizerSecond', 'partnerSecond']) {
      assert.ok(Math.abs(opened[key] - closed[key]) < 1e-9, key);
    }
  }
});
test('only the old default entrance gets longer', async () => {
  const { migratePartnersSequence } = await import('../src/studio/partners-stage.js');
  const old = { timeline: { drawDuration: 2.6, emergeDuration: 2.4, holdDuration: 30 }, partners: { title: 'custom' } };
  const migrated = migratePartnersSequence(old);
  assert.equal(migrated.timeline.drawDuration, 6.6);
  assert.equal(migrated.timeline.holdDuration, 30);
  assert.equal(migrated.partners.title, 'custom');
  assert.equal(old.timeline.drawDuration, 2.6);
  assert.equal(migratePartnersSequence({ timeline: { drawDuration: 1, emergeDuration: 3 } }).timeline.drawDuration, 1);
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

test('curtains have no solid burgundy backing at any time', async () => {
  const { drawStageCurtains } = await import('../src/studio/partners-stage.js');
  const calls = [];
  const ctx = {
    globalAlpha: 1,
    save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, translate() {}, scale() {},
    fillRect(...args) { calls.push(['backing', ...args]); },
    drawImage(...args) { calls.push(['image', ...args]); },
  };
  const image = {};
  drawStageCurtains(ctx, image, 1);
  assert.equal(calls.filter(c => c[0] === 'backing').length, 0);
  assert.equal(calls.filter(c => c[0] === 'image').length, 2);
  calls.length = 0;
  drawStageCurtains(ctx, image, 0);
  assert.equal(calls.filter(c => c[0] === 'backing').length, 0);
  assert.equal(calls.filter(c => c[0] === 'image').length, 2);
});


test('curtain image keeps its aspect and dimensions throughout movement', async () => {
  const { drawStageCurtains } = await import('../src/studio/partners-stage.js');
  const calls = [];
  const ctx = {
    globalAlpha: 1, save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, translate() {}, scale() {}, fillRect() {},
    drawImage(...args) { calls.push(args); },
  };
  const image = { naturalWidth: 476, naturalHeight: 1080 };
  for (const p of [0, .25, .5, .75, 1]) drawStageCurtains(ctx, image, p);
  assert.equal(calls.length, 10);
  for (const [, , , width, height] of calls) {
    assert.equal(width, 476);
    assert.equal(height, 1080);
  }
  assert.ok(calls[0][1] === 0); // at the left edge, not in the centre
  assert.equal(calls[8][1], -380); // slides outwards
  assert.equal(calls[0][1], calls[1][1]); // mirrored curtain shares the motion
});

test('intro artwork is rendered as an unfilled golden outline', async () => {
  const { introOutlineSvg } = await import('../src/studio/partners-stage.js');
  const svg = '<svg><style>.fil0 {fill:#D7B56D}</style><path class="fil0"/></svg>';
  const outline = introOutlineSvg(svg);
  assert.match(outline, /fill:none/);
  assert.match(outline, /stroke:#e5bd7c;stroke-width:16/);
  assert.match(outline, /<path class="fil0"\/>/);
});

test('hold cache key changes whenever timeline dimensions change', async () => {
  const { partnersHoldCacheKey } = await import('../src/studio/partners-stage.js');
  const base = { ...tl, startDelay: 0 };
  const key = partnersHoldCacheKey(base);
  for (const field of ['drawDuration', 'emergeDuration', 'holdDuration', 'fadeDuration', 'restDuration', 'startDelay']) {
    assert.notEqual(partnersHoldCacheKey({ ...base, [field]: base[field] + 1 }), key, field);
  }
});

test('default sequence has a nine-second entrance and thirty-second hold', async () => {
  const { PARTNERS_DEFAULTS } = await import('../src/studio/scenes/partners.js');
  const t = PARTNERS_DEFAULTS.timeline;
  assert.equal(t.drawDuration + t.emergeDuration, 9);
  assert.equal(t.holdDuration, 30);
});

test('organizers share the top row, sponsors share the lower row, KEAZ is smaller', async () => {
  const { PARTNERS_MARK_LAYOUT: l } = await import('../src/studio/partners-stage.js');
  assert.ok(l.left > 425 && l.right < 1495);
  assert.equal(l.left + l.right, 1920);
  assert.equal(l.organizerTop, l.organizerBottom);
  assert.equal(l.sponsorTop, l.sponsorBottom);
  assert.ok(l.organizerBottom < l.sponsorTop);
  assert.equal(l.organizerLabel, l.coorganizerLabel);
  assert.ok(l.keazScale > 0 && l.keazScale < 1);
});


test('curtains fade smoothly from black and back, including before start and zero duration', () => {
  const defaultTl = { drawDuration: 6.6, emergeDuration: 2.4, holdDuration: 30, fadeDuration: 3.5, restDuration: 0 };
  const cue = t => partnersStageCues({ local: t, beforeStart: false }, defaultTl);
  assert.equal(cue(0).curtainOpacity, 0);
  assert.ok(cue(.18).curtainOpacity > 0 && cue(.18).curtainOpacity < 1);
  assert.equal(cue(.72).curtainOpacity, 1);
  assert.equal(cue(9).curtainOpacity, 1);
  assert.equal(cue(42.5).curtainOpacity, 0);
  assert.equal(partnersStageCues({ local: 5, beforeStart: true }, defaultTl).curtainOpacity, 0);
  assert.ok(partnersStageCues({ local: .36 }, defaultTl, 1, 16).curtainOpacity < cue(.36).curtainOpacity);
  const zero = { drawDuration: 0, emergeDuration: 0, holdDuration: 1, fadeDuration: 0 };
  assert.equal(partnersStageCues({ local: 0 }, zero).curtainOpacity, 0);
});

test('group curtains pause for emblem, fully open before marks and reverse smoothly', async () => {
  const { migratePartnersCurtainChoreography, stageCurtainLayout } = await import('../src/studio/partners-stage.js');
  const { PARTNERS_DEFAULTS } = await import('../src/studio/scenes/partners.js');
  const timeline = PARTNERS_DEFAULTS.timeline;
  assert.equal(timeline.fadeDuration, 6.5);
  const entry = timeline.drawDuration + timeline.emergeDuration;
  const exit = entry + timeline.holdDuration;
  const cue = t => partnersStageCues({local:t}, timeline, 1, 8, true);
  assert.ok(Math.abs(cue(.2 * entry).curtainOpen - .55) < 1e-10);
  assert.equal(cue(.2 * entry).compass, 0);
  assert.ok(cue(.32 * entry).compass > 0);
  assert.ok(Math.abs(cue(.32 * entry).curtainOpen - .55) < 1e-10);
  assert.ok(cue(.45 * entry).curtainOpen > .55 && cue(.45 * entry).curtainOpen < 1);
  assert.equal(cue(.56 * entry).curtainOpen, 1);
  assert.equal(cue(.56 * entry).organizer, 0);
  assert.equal(stageCurtainLayout({width:476,height:1080}, 1, 1080, 196).x + 476, 196);
  assert.ok(196 < PARTNERS_DEFAULTS.stageOrganizer1.x - 220 * PARTNERS_DEFAULTS.stageOrganizer1.scale);
  for (const u of [0, .1, .25, .5, .75, .9, 1]) {
    const eased = u * u * (3 - 2 * u);
    const a = cue((1 - eased) * entry), b = cue(exit + timeline.fadeDuration * u);
    for (const key of ['curtainOpen', 'curtainOpacity', 'compass', 'compassShrink', 'title', 'organizer', 'partnerSecond']) {
      assert.ok(Math.abs(a[key] - b[key]) < 1e-9, key);
    }
  }
  const old = {partners:{curtainWidth:168},timeline:{fadeDuration:3.5,holdDuration:30}};
  assert.deepEqual(migratePartnersCurtainChoreography(old), {partners:{curtainWidth:196},timeline:{fadeDuration:6.5,holdDuration:30}});
  assert.equal(old.partners.curtainWidth,168);
  assert.equal(migratePartnersCurtainChoreography({timeline:{fadeDuration:2.3}}).timeline.fadeDuration, 6.5);
  assert.deepEqual(migratePartnersCurtainChoreography({partners:{curtainWidth:180},timeline:{fadeDuration:4}}), {partners:{curtainWidth:180},timeline:{fadeDuration:4}});
});

test('central emblem and heading complete before any group mark appears', async () => {
  const { PARTNERS_DEFAULTS } = await import('../src/studio/scenes/partners.js');
  const { elementVisibility } = await import('../src/studio/partners-elements.js');
  const { migratePartnersCenterFirst } = await import('../src/studio/partners-stage.js');
  const t = PARTNERS_DEFAULTS.timeline;
  const entry = t.drawDuration + t.emergeDuration;
  const cue = partnersStageCues({local:entry * .59}, t, 1, 8, true);
  assert.equal(cue.compass, 1); assert.equal(cue.compassShrink, 1); assert.equal(cue.title, 1);
  for (const id of ['stageOrganizer1','stageOrganizer2','stagePartner1','stagePartner2']) {
    assert.equal(elementVisibility(cue.progress, PARTNERS_DEFAULTS[id]), 0);
  }
  const old = {stageOrganizer1:{start:57,end:65,x:40},stagePartner2:{start:12,end:80}};
  const next = migratePartnersCenterFirst(old);
  assert.deepEqual(next.stageOrganizer1,{start:60,end:68,x:40});
  assert.deepEqual(next.stagePartner2, old.stagePartner2);
  assert.equal(old.stageOrganizer1.start, 57);
});
