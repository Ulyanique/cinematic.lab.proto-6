import test from 'node:test';
import assert from 'node:assert/strict';
import { framePoint, hitElement, sponsorDragElements, clampPosition } from '../src/studio/drag-layout.js';
import { PARTNERS_DEFAULTS, SPONSOR_KEAZ_DEFAULTS } from '../src/studio/scenes/partners.js';

test('pointer conversion respects preview size and offset', () => {
  assert.deepEqual(framePoint({left: 100, top: 50, width: 960, height: 540}, 580, 320), {x: 960, y: 540});
  assert.equal(clampPosition(2100, 0, 1920), 1920);
});
test('hit testing chooses the topmost target and excludes disabled elements', () => {
  const elements = sponsorDragElements(PARTNERS_DEFAULTS);
  assert.equal(hitElement({x: 500, y: 205}, elements).id, 'stageOrganizer1');
  assert.equal(hitElement({x: 1420, y: 330}, elements).id, 'stagePartnerLabel2');
  const cfg = structuredClone(PARTNERS_DEFAULTS);
  cfg.stageOrganizer1.enabled = false;
  assert.equal(sponsorDragElements(cfg).some(e => e.id === 'stageOrganizer1'), false);
  assert.equal(hitElement({x: 960, y: 220}, sponsorDragElements(SPONSOR_KEAZ_DEFAULTS)).id, 'stageSingleMark');
  assert.equal(hitElement({x: -300, y: -300}, elements), null);
});
