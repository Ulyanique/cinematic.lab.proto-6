import test from 'node:test';
import assert from 'node:assert/strict';
import { INTRO_BACKGROUND_GLSL, migrateIntroBackgroundEffect } from '../src/studio/intro-background-effect.js';
import { fxDefaults, fxActive, FX_SCHEMA_SECTION } from '../src/studio/fx-stack.js';
import { sectionAllowed } from '../src/studio/ui/field-rules.js';
import { readFileSync } from 'node:fs';

test('intro light is an independent off-by-default overlay effect for any scene', () => {
  const fx = fxDefaults(); assert.equal(fx.introBackground,0); assert.equal(fxActive(fx),false);
  fx.introBackground = 1; assert.equal(fxActive(fx),true);
  assert.ok(FX_SCHEMA_SECTION.fields.some(f=>f.key === 'introBackground'));
  for (const id of ['partners','sponsor-keaz','waiting','lab-swarm','circle-final']) assert.equal(sectionAllowed(id,'fxStack'),true);
  assert.match(INTRO_BACKGROUND_GLSL,/vec3 introBackgroundLight\(vec2 vUv\)/);
  assert.doesNotMatch(INTRO_BACKGROUND_GLSL,/void main\(/);
  assert.equal(INTRO_BACKGROUND_GLSL.includes('\\n'), false);
  assert.doesNotMatch(INTRO_BACKGROUND_GLSL,/gl_FragColor/);
  assert.match(INTRO_BACKGROUND_GLSL,/micro-sparkles/);
  const src = readFileSync(new URL('../src/studio/fx-stack.js',import.meta.url),'utf8');
  assert.match(src,/introBackgroundLight\(vUv\) \* uIntroBackground \* fx/);
});

test('legacy background settings migrate once, preserving light strength and speed', () => {
  const cfg = {partnersIntroBackground:{enabled:true,strength:.7,speed:.4},fxStack:fxDefaults()};
  assert.equal(migrateIntroBackgroundEffect(cfg),true);
  assert.equal(cfg.partnersIntroBackground.enabled,false);
  assert.equal(cfg.fxStack.introBackground,.7);
  assert.equal(cfg.fxStack.introBackgroundSpeed,.4);
  cfg.fxStack.introBackground = 0;
  assert.equal(migrateIntroBackgroundEffect(cfg),false);
  assert.equal(cfg.fxStack.introBackground,0);
});

test('legacy settings migrate on load and import, and stay off after disabling', async () => {
  const {build} = await import('esbuild');
  const built = await build({entryPoints:['src/studio/config.js'],bundle:true,format:'esm',platform:'node',write:false,loader:{'.svg':'text','.woff':'dataurl','.woff2':'dataurl','.css':'empty'}});
  const config = await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].contents).toString('base64'));
  const { SPONSOR_KEAZ_DEFAULTS } = await import('../src/studio/scenes/partners.js');
  const db = new Map();
  globalThis.localStorage = {getItem:key=>db.get(key) ?? null, setItem:(key,value)=>db.set(key,value)};
  const id = 'sponsor-keaz';
  const old = { partnersIntroBackground:{enabled:true,strength:.8,speed:.6}, fxStack:{rays:.4} };
  db.set(config.sceneStorageKey(id),JSON.stringify(old));
  const loaded = config.loadSceneConfig(id, SPONSOR_KEAZ_DEFAULTS);
  assert.equal(loaded.fxStack.introBackground,.8);
  assert.equal(loaded.fxStack.introBackgroundSpeed,.6);
  assert.equal(loaded.fxStack.rays,.4);
  assert.equal(loaded.partnersIntroBackground.enabled,false);
  const saved = JSON.parse(db.get(config.sceneStorageKey(id)));
  assert.equal(saved.partnersIntroBackground.enabled,false);
  loaded.fxStack.introBackground = 0;
  config.saveSceneConfig(id,loaded);
  assert.equal(config.loadSceneConfig(id, SPONSOR_KEAZ_DEFAULTS).fxStack.introBackground,0);
  assert.equal(config.mergeConfig(SPONSOR_KEAZ_DEFAULTS,old).fxStack.introBackground,.8);
  assert.equal(config.parseConfigJSON(JSON.stringify(old),SPONSOR_KEAZ_DEFAULTS).fxStack.introBackground,.8);
  delete globalThis.localStorage;
});
