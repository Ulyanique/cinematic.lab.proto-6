import test from 'node:test';
import assert from 'node:assert/strict';
import { drawPartnersOrnament, ornamentMotion } from '../src/studio/partners-ornament.js';
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
  ctx.createLinearGradient = (...args) => { const stops = []; calls.push(['gradient', ...args, stops]); return { addColorStop: (offset, color) => stops.push([offset, color]) }; };
  const layer = { x: 100, y: 200, scale: 1.5, opacity: .8, color: '#ffcc88' };
  drawPartnersOrnament(ctx, layer, .5);
  assert.equal(ctx.globalAlpha, .4);
  assert.equal(ctx.strokeStyle, '#ffcc88');
  assert.deepEqual(calls.find(c => c[0] === 'translate'), ['translate', 100, 200]);
  assert.deepEqual(calls.find(c => c[0] === 'scale'), ['scale', 1.5, 1.5]);
  assert.equal(calls.filter(c => c[0] === 'bezierCurveTo').length, 8);
  assert.equal(calls.filter(c => c[0] === 'lineTo').length, 8);
  assert.equal(calls.filter(c => c[0] === 'fill').length, 1);
  assert.equal(calls.filter(c => c[0] === 'gradient').length, 8);
  assert.ok(calls.filter(c => c[0] === 'gradient').every(c => c.at(-1).at(-1)[1] === 'rgba(0,0,0,0)'));
  calls.length = 0;
  drawPartnersOrnament(ctx, { ...layer, edgeFade: 0 }, .5);
  assert.equal(calls.filter(c => c[0] === 'gradient').length, 0);
  calls.length = 0;
  drawPartnersOrnament(ctx, { ...layer, enabled: false }, 1);
  assert.equal(calls.length, 0);
});


test('ornament enters star first, then lines and shimmer, and reverses deterministically', () => {
  const start = ornamentMotion(.68);
  const middle = ornamentMotion(.8);
  const end = ornamentMotion(.98);
  assert.deepEqual(start, {star: 0, main: 0, accents: 0, shimmer: 0});
  assert.ok(middle.star > 0 && middle.star > middle.accents);
  assert.deepEqual(end, {star: 1, main: 1, accents: 1, shimmer: 1});
  assert.deepEqual(ornamentMotion(.8), middle);
  assert.equal(ornamentMotion(.8, {start: 90, end: 99}).star, 0);
});

test('ornament animation uses its own small texture, even during a cached hold', async () => {
  const { createPartnersOrnamentLayer } = await import('../src/studio/partners-ornament-layer.js');
  const calls = [];
  const ctx = {};
  for (const method of ['save','restore','translate','scale','clearRect','beginPath','moveTo','lineTo','bezierCurveTo','closePath','stroke','fill']) ctx[method] = (...args) => calls.push([method, ...args]);
  ctx.createLinearGradient = () => ({ addColorStop() {} });
  const originalDocument = globalThis.document;
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
  try {
    const ornament = createPartnersOrnamentLayer();
    const layer = PARTNERS_DEFAULTS.stageOrnament;
    ornament.update(layer, 1, 1, 10, 1);
    assert.equal(ornament.mesh.visible, true);
    assert.deepEqual(calls.find(c => c[0] === 'clearRect'), ['clearRect', 0, 0, 1320, 300]);
    assert.equal(ornament.mesh.position.x, 0);
    calls.length = 0;
    ornament.update(layer, 1, 1, 11, 1);
    assert.ok(calls.some(c => c[0] === 'clearRect'));
    ornament.update({ ...layer, enabled: false }, 1, 1, 11, 1);
    assert.equal(ornament.mesh.visible, false);
    ornament.dispose();
  } finally { globalThis.document = originalDocument; }
});
