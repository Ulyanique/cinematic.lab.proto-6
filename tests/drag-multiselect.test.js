import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createDragEditor } from '../src/studio/drag-editor.js';
import { PARTNERS_DEFAULTS } from '../src/studio/scenes/partners.js';

test('shift and ctrl select canvas elements, move together and escape cancels atomically', () => {
  const dom = new JSDOM('<!doctype html><body><div class="studio-buttons"></div><canvas></canvas></body>', {url:'https://example.org'});
  for (const name of ['window','document','Element','HTMLElement']) Object.defineProperty(globalThis,name,{value:dom.window[name],configurable:true,writable:true});
  const cfg = structuredClone(PARTNERS_DEFAULTS); cfg.playback.paused = false;
  const state = {id:'partners',cfg,scene:{},canvas:document.querySelector('canvas'),recording:false,sections:[]};
  state.canvas.getBoundingClientRect = () => ({left:0,top:0,width:1920,height:1080});
  const commits = [];
  createDragEditor({getState:()=>state, onMessage:()=>{}, onSelect:()=>{}, commitScale:()=>{},
    commitGroup:(id, values, live)=> { commits.push({id,live,count:values.length}); for (const v of values) { cfg[v.id][v.xKey]=v.x; cfg[v.id][v.yKey]=v.y; } },
  });
  document.querySelector('.studio-btn-drag').click();
  const overlay = document.querySelector('.drag-editor'); overlay.setPointerCapture = () => {};
  const p = (type,x,y,mod={}) => overlay.dispatchEvent(new dom.window.MouseEvent(type,{bubbles:true,clientX:x,clientY:y,button:0,...mod}));
  p('pointerdown',430,350); p('pointerup',430,350);
  p('pointerdown',1460,350,{shiftKey:true}); p('pointerup',1460,350);
  assert.equal(overlay.querySelectorAll('.drag-editor-secondary').length,1);
  p('pointerdown',430,350); p('pointermove',530,390,{altKey:true});
  assert.equal(cfg.playback.paused,true);
  assert.equal(cfg.stageOrganizer1.x,530); assert.equal(cfg.stageOrganizer2.x,1560);
  assert.equal(cfg.stageOrganizer1.y,390); assert.equal(cfg.stageOrganizer2.y,390);
  p('pointerup',530,390);
  assert.equal(cfg.playback.paused,false);
  assert.equal(commits.at(-1).count,2); assert.equal(commits.at(-1).live,false);
  p('pointerdown',1560,390,{ctrlKey:true});
  assert.equal(overlay.querySelectorAll('.drag-editor-secondary').length,0);
  p('pointerdown',530,390); p('pointermove',600,450,{altKey:true});
  window.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  assert.equal(cfg.stageOrganizer1.x,530); assert.equal(cfg.stageOrganizer2.x,1560);
  assert.equal(cfg.playback.paused,false);
  dom.window.close();
});
