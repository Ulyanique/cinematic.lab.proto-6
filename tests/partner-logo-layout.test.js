import test from 'node:test';
import assert from 'node:assert/strict';
import { partnerLogoSize, visibleLogoBounds } from '../src/studio/partner-logo-layout.js';
import { migrateEqualPartnerLogoWidths } from '../src/studio/partners-stage.js';
import { PARTNERS_DEFAULTS } from '../src/studio/scenes/partners.js';

test('visible logos have equal widths and retain their proportions', () => {
  for (const [w, h] of [[395,100], [477,100], [358,100], [535,100], [100,300]]) {
    const size = partnerLogoSize(w, h);
    assert.ok(Math.abs(size.width - 440) < 1e-9);
    assert.ok(Math.abs(size.width / size.height - w / h) < 1e-10);
    assert.ok(Math.abs(partnerLogoSize(w, h, {scale: .8}).width - 352) < 1e-9);
  }
  // Персональные заставки не получают новый размер.
  const single = partnerLogoSize(358, 100, {single:true});
  assert.equal(single.height, 125);
  assert.ok(single.width < 560);
});

test('one-time alignment affects only scales of the four marks', () => {
  const old = { stageOrganizer1:{x:100,scale:.7}, stagePartner2:{x:1200,scale:.8}, stageCompass:{scale:2} };
  const next = migrateEqualPartnerLogoWidths(old);
  assert.deepEqual(next.stageOrganizer1, {x:100,scale:1});
  assert.deepEqual(next.stagePartner2, {x:1200,scale:1});
  assert.equal(next.stageCompass.scale, 2);
  assert.equal(old.stageOrganizer1.scale, .7);
  for (const id of ['stageOrganizer1', 'stageOrganizer2', 'stagePartner1', 'stagePartner2']) assert.equal(PARTNERS_DEFAULTS[id].scale, 1);
});


test('transparent padding is excluded from visual width', () => {
  const pixels = new Uint8Array(10 * 4 * 4);
  for (let y = 1; y <= 2; y++) for (let x = 2; x <= 7; x++) pixels[(y * 10 + x) * 4 + 3] = 255;
  assert.deepEqual(visibleLogoBounds(pixels, 10, 4), { x: .2, y: .25, width: .6, height: .5 });
  assert.deepEqual(visibleLogoBounds(new Uint8Array(4), 1, 1), { x: 0, y: 0, width: 1, height: 1 });
});
