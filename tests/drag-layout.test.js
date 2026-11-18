import test from 'node:test';
import assert from 'node:assert/strict';
import { framePoint, hitElement, sponsorDragElements, clampPosition, snapBox } from '../src/studio/drag-layout.js';
import { PARTNERS_DEFAULTS, SPONSOR_KEAZ_DEFAULTS } from '../src/studio/scenes/partners.js';

test('pointer conversion respects preview size and offset', () => {
  assert.deepEqual(framePoint({left: 100, top: 50, width: 960, height: 540}, 580, 320), {x: 960, y: 540});
  assert.equal(clampPosition(2100, 0, 1920), 1920);
});
test('hit testing chooses the topmost target and excludes disabled elements', () => {
  const elements = sponsorDragElements(PARTNERS_DEFAULTS);
  assert.equal(hitElement({x: 430, y: 260}, elements).id, 'stageOrganizer1');
  assert.equal(hitElement({x: 1410, y: 365}, elements).id, 'stagePartnerLabel2');
  const cfg = structuredClone(PARTNERS_DEFAULTS);
  cfg.stageOrganizer1.enabled = false;
  assert.equal(sponsorDragElements(cfg).some(e => e.id === 'stageOrganizer1'), false);
  assert.equal(hitElement({x: 960, y: 220}, sponsorDragElements(SPONSOR_KEAZ_DEFAULTS)).id, 'stageSingleMark');
  assert.equal(hitElement({x: -300, y: -300}, elements), null);
});


test('smart guides snap to canvas centre and neighboring centres or edges', () => {
  const a = { id: 'a', x: 954, y: 303, w: 100, h: 50 };
  const b = { id: 'b', x: 500, y: 300, w: 150, h: 80 };
  const result = snapBox(a, [a, b], 8, 8);
  assert.equal(result.x, 960);
  assert.equal(result.y, 300);
  assert.deepEqual(result.guides, [{ axis: 'x', value: 960 }, { axis: 'y', value: 300 }]);
  const edge = snapBox({ id: 'a', x: 397, y: 600, w: 50, h: 50 }, [b], 4, 4);
  assert.equal(edge.x, 400); // right edge 425 meets left edge 425
  assert.deepEqual(edge.guides, [{ axis: 'x', value: 425 }]);
  assert.deepEqual(snapBox({ id: 'a', x: 600, y: 700, w: 20, h: 20 }, [b], 4, 4), { x: 600, y: 700, guides: [] });
});
