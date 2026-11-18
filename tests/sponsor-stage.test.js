import test from 'node:test';
import assert from 'node:assert/strict';
import { SPONSOR_PROMRUKAV_DEFAULTS as a, SPONSOR_KEAZ_DEFAULTS as b } from '../src/studio/scenes/partners.js';
import { migrateSponsorStage, migrateSponsorTitleBlock } from '../src/studio/partners-stage.js';
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

test('single-sponsor cards use reference composition and editable sponsor subtitle', async () => {
  const { migrateSingleSponsorLayout } = await import('../src/studio/partners-stage.js');
  for (const c of [a, b]) {
    assert.equal(c.sponsor.subtitle, 'вечер ретроспектива');
    assert.equal(c.sponsor.sponsorLabel, 'СПОНСОР');
    assert.ok(c.stageSponsorLabel.x < c.stageSingleMark.x);
    assert.equal(c.stageTitle.y, 150);
    assert.equal(c.stageTitleDivider.y, 195);
    assert.equal(c.stageSubtitle.y, 235);
    assert.equal(c.stageSingleMark.x, 1130);
    assert.equal(c.stageSingleMark.y, 385);
    assert.equal(c.stageCompass.y, 715);
    assert.equal(c.stageTitleDivider.width, 520);
    assert.equal(c.stageSubtitle.color, '#c8a873');
  }
  const old = {sponsor:{subtitle:'Вечер ретроспектива',markLogo:'custom'}, stageTitle:{x:960,y:780},
    stageSubtitle:{x:960,y:845,color:'#c8a873'},stageSingleMark:{x:900,y:220},stageTitleDivider:{x:960,y:818,width:360}};
  const next = migrateSingleSponsorLayout(old);
  assert.equal(next.sponsor.subtitle, 'СПОНСОР');
  assert.equal(next.sponsor.markLogo, 'custom');
  assert.equal(next.stageTitle.y, 150);
  assert.deepEqual(next.stageSubtitle, {x:960,y:265,color:'#d2ac70'});
  assert.deepEqual(next.stageSingleMark, old.stageSingleMark);
  assert.equal(next.stageTitleDivider.width, 520);
  assert.equal(old.sponsor.subtitle, 'Вечер ретроспектива');
  assert.equal(migrateSingleSponsorLayout({sponsor:{subtitle:'Партнёр'}}).sponsor.subtitle, 'Партнёр');
});

test('partner text keeps user-entered capitalization, while untouched defaults keep their appearance', async () => {
  const { migratePartnerTextCase } = await import('../src/studio/partners-stage.js');
  const old = {partners:{title:'Янтарный циркуль',subtitle:'Вечер ретроспектива'}};
  assert.deepEqual(migratePartnerTextCase(old), {partners:{title:'ЯНТАРНЫЙ ЦИРКУЛЬ',subtitle:'вечер ретроспектива'}});
  assert.deepEqual(migratePartnerTextCase({partners:{title:'Мой Текст',subtitle:'Мой подЗаголовок'}}), {partners:{title:'Мой Текст',subtitle:'Мой подЗаголовок'}});
  const { PARTNERS_DEFAULTS } = await import('../src/studio/scenes/partners.js');
  assert.equal(PARTNERS_DEFAULTS.partners.title,'ЯНТАРНЫЙ ЦИРКУЛЬ');
  assert.equal(PARTNERS_DEFAULTS.partners.subtitle,'вечер ретроспектива');
});


test('side sponsor label migration preserves customized text and positions', async () => {
  const { migrateSponsorSideLabel } = await import('../src/studio/partners-stage.js');
  assert.deepEqual(migrateSponsorSideLabel({sponsor:{subtitle:'СПОНСОР'},stageSingleMark:{x:960,y:385},stageSubtitle:{color:'#d2ac70'}}),
    {sponsor:{subtitle:'вечер ретроспектива'},stageSingleMark:{x:1130,y:385},stageSubtitle:{color:'#c8a873'}});
  const custom = {sponsor:{subtitle:'Партнёр'},stageSingleMark:{x:800,y:385},stageSubtitle:{color:'#123456'}};
  assert.deepEqual(migrateSponsorSideLabel(custom), {...custom, sponsor:{subtitle:'вечер ретроспектива',sponsorLabel:'Партнёр'}});
});

test('05А/05Б text block migration lifts only the untouched defaults', () => {
  const old = { stageTitleDivider:{x:960,y:215,width:520}, stageSubtitle:{x:960,y:265,color:'#c8a873'}, stageSingleMark:{x:1140,y:385} };
  const next = migrateSponsorTitleBlock(old);
  assert.deepEqual(next.stageTitleDivider, {x:960,y:195,width:520});
  assert.deepEqual(next.stageSubtitle, {x:960,y:235,color:'#c8a873'});
  assert.equal(next.stageSingleMark.x, 1130);
  const custom = { stageTitleDivider:{x:960,y:150}, stageSubtitle:{x:700,y:265}, stageSingleMark:{x:1000,y:385} };
  assert.deepEqual(migrateSponsorTitleBlock(custom), custom);
});
