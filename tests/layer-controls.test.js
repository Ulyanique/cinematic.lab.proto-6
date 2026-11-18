import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
const built = await build({entryPoints:['src/studio/ui/panels.js'], bundle:true, format:'esm', platform:'node', write:false, loader:{'.svg':'text','.woff':'dataurl','.woff2':'dataurl','.css':'empty'}});
const { createStudioPanels } = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].contents).toString('base64'));
import { sceneDepthOrder, sceneDepthOrderStep, sceneDepthOrderReset, introSceneOrder, introSceneOrderOverride, INTRO_LAYER_ORDER } from '../src/studio/depth-order.js';

const change = (cfg, changes) => { for (const {key,value} of changes) { if (key === 'lab2LayerOrder') cfg.lab2LayerOrder = value; else (cfg.depthOrder ??= {})[key] = value; } };
test('intro order has all real layers and is stored independently', () => {
  const a = {}, b = {};
  const original = introSceneOrder(a);
  assert.equal(introSceneOrderOverride(a), null);
  assert.deepEqual(original, [...INTRO_LAYER_ORDER]);
  change(a, sceneDepthOrderStep(a, 'lab-swarm', 'title', 'front'));
  assert.equal(introSceneOrder(a)[3], 'title');
  assert.deepEqual(introSceneOrder(b), original);
  assert.equal(sceneDepthOrderStep(a, 'lab-swarm', 'fx', 'front'), null);
  change(a, sceneDepthOrderReset('lab-swarm'));
  assert.deepEqual(introSceneOrder(a), original);
  assert.deepEqual(sceneDepthOrder({lab2LayerOrder:['date','date','bad']},'lab-swarm').reverse(), ['date', ...original.filter(i => i !== 'date')]);
  assert.deepEqual(sceneDepthOrder({}, 'partners'), []);
});

test('layer panel shows usable eye and visible depth controls; search does not hide depth when cleared', () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {url:'https://example.org'});
  for (const name of ['window','document','localStorage','Element','HTMLElement','HTMLInputElement','HTMLTextAreaElement','HTMLSelectElement','HTMLButtonElement','navigator']) Object.defineProperty(globalThis, name, {value:dom.window[name], configurable:true, writable:true});
  globalThis.innerWidth = 1200; globalThis.innerHeight = 900;
  const cfg = {lab2_logo:{enabled:true},timeline:{}};
  const state = {sceneId:'lab-swarm', sceneLabel:'Интро', config:cfg, defaults:structuredClone(cfg), sections:[{id:'lab2_logo',title:'Эмблема',fields:[{key:'enabled',type:'bool',label:'Показывать'}]}, {id:'timeline',title:'Таймлайн',fields:[]}]};
  const panels = createStudioPanels({ getState:()=>state, depthOrder:sceneDepthOrder, depthOrderStep:sceneDepthOrderStep, depthOrderReset:sceneDepthOrderReset,
    onCommand:(section,key,value)=> { if (section === 'depthOrder') change(cfg,[{key,value}]); else cfg[section][key] = value; },
  });
  const query = s => document.querySelector(s);
  assert.equal(query('.lyr-depth').hidden, false);
  assert.equal(query('.lyr-depth-row[data-depth="title"] .lyr-depth-step').disabled, false);
  query('.lyr-depth-row[data-depth="title"] .lyr-depth-step').click();
  assert.equal(introSceneOrder(cfg)[3], 'title');
  assert.equal(query('.lyr-row[data-section="timeline"] button[data-role="eye"]'), null);
  query('.lyr-row[data-section="lab2_logo"] button[data-role="eye"]').click();
  assert.equal(cfg.lab2_logo.enabled, false);
  assert.equal(query('.lyr-row[data-section="lab2_logo"] button[data-role="eye"]').getAttribute('aria-pressed'), 'false');
  query('.lyr-row[data-section="lab2_logo"] button[data-role="eye"]').click();
  assert.equal(cfg.lab2_logo.enabled, true);
  const input = query('.lyr-search-input'); input.value = 'эмблема'; input.dispatchEvent(new dom.window.Event('input'));
  assert.equal(query('.lyr-depth').hidden, true);
  input.value = ''; input.dispatchEvent(new dom.window.Event('input'));
  assert.equal(query('.lyr-depth').hidden, false);
  panels.panels.layers.el.remove(); panels.panels.settings.el.remove(); dom.window.close();
});


test('real intro schemas expose visibility for every drawable layer', async () => {
  const built = await build({entryPoints:['src/studio/scenes/labs.js'], bundle:true, format:'esm', platform:'node', write:false, loader:{'.svg':'text','.woff':'dataurl','.woff2':'dataurl','.css':'empty'}});
  const { LAB_SCHEMA_SECTIONS, LAB2_DEFAULTS, LAB2_BRAND_DEFAULTS, lab2Source } = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].contents).toString('base64'));
  for (const name of ['background','logo','compass','title','subtitle','date','dividers','rings','particles','fx']) {
    const id = 'lab2_' + name;
    const section = LAB_SCHEMA_SECTIONS.find(s => s.id === id);
    assert.ok(section?.fields.some(f => f.key === 'enabled' && f.type === 'bool'), id);
    const cfg = structuredClone(LAB2_DEFAULTS);
    cfg[id].enabled = false;
    assert.equal(lab2Source(cfg).layers[name].enabled, false, id);
    cfg[id].enabled = true;
    assert.equal(lab2Source(cfg).layers[name].enabled, true, id);
  }
  assert.equal(LAB2_BRAND_DEFAULTS.lab2_subtitle.enabled, false);
  assert.equal(LAB2_BRAND_DEFAULTS.lab2_date.enabled, false);
});
