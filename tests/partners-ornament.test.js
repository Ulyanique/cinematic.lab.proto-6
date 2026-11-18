import test from 'node:test';
import assert from 'node:assert/strict';
import { drawPartnersOrnament } from '../src/studio/partners-ornament.js';
import { PARTNERS_DEFAULTS, SPONSOR_KEAZ_DEFAULTS } from '../src/studio/scenes/partners.js';
import { PARTNERS_ELEMENT_SCHEMA } from '../src/studio/partners-elements.js';
import { sponsorDragElements, hitElement } from '../src/studio/drag-layout.js';

test('ornament is an editable layer of the group composition only', () => {
  const layer = PARTNERS_DEFAULTS.stageOrnament;
  assert.equal(layer.enabled, true);
  assert.equal(layer.x, 960);
  assert.equal(layer.y, 823);
  assert.equal(SPONSOR_KEAZ_DEFAULTS.stageOrnament, undefined);
  const schema = PARTNERS_ELEMENT_SCHEMA.find(s => s.id === 'stageOrnament');
  for (const field of ['x', 'y', 'scale', 'opacity', 'enabled', 'color']) assert.ok(schema.fields.some(f => f.key === field));
  assert.equal(hitElement({x: 960, y: 823}, sponsorDragElements(PARTNERS_DEFAULTS)).id, 'stageOrnament');
});

test('ornament draws mirrored lines and curved four-point star with chosen transform', () => {
  const calls = [];
  const ctx = {};
  for (const method of ['save','restore','translate','scale','beginPath','moveTo','lineTo','bezierCurveTo','closePath','stroke','fill'])
    ctx[method] = (...args) => calls.push([method, ...args]);
  const layer = { x: 100, y: 200, scale: 1.5, opacity: .8, color: '#ffcc88' };
  drawPartnersOrnament(ctx, layer, .5);
  assert.equal(ctx.globalAlpha, .4);
  assert.equal(ctx.strokeStyle, '#ffcc88');
  assert.deepEqual(calls.find(c => c[0] === 'translate'), ['translate', 100, 200]);
  assert.deepEqual(calls.find(c => c[0] === 'scale'), ['scale', 1.5, 1.5]);
  assert.equal(calls.filter(c => c[0] === 'bezierCurveTo').length, 4);
  assert.equal(calls.filter(c => c[0] === 'fill').length, 1);
  calls.length = 0;
  drawPartnersOrnament(ctx, { ...layer, enabled: false }, 1);
  assert.equal(calls.length, 0);
});
