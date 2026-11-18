import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fxDefaults, fxActive, applyFxPreset, FX_SCHEMA_SECTION } from '../src/studio/fx-stack.js';
import { CIRCLE_BEAMS_GLSL } from '../src/studio/circle-final/fx/beams-shader.js';
import { beamMaterial } from '../src/studio/circle-final/fx/background.js';
import { sectionAllowed } from '../src/studio/ui/field-rules.js';
import { PARTNERS_DEFAULTS, SPONSOR_KEAZ_DEFAULTS, SPONSOR_PROMRUKAV_DEFAULTS } from '../src/studio/scenes/partners.js';
import { CIRCLE_FINAL_DEFAULTS } from '../src/studio/scenes/circle-final.js';
import { fxCycleTime } from '../src/studio/fx-cycle.js';

test('crossing beams are an independent effect, off by default and resettable', () => {
  const defaults = fxDefaults();
  assert.equal(defaults.circleFinalRays, 0);
  assert.equal(fxActive(defaults), false);
  assert.ok(FX_SCHEMA_SECTION.fields.some(f => f.key === 'circleFinalRays'));
  const config = {...defaults, circleFinalRays: .7};
  assert.equal(fxActive(config), true);
  assert.equal(config.rays, 0);
  applyFxPreset(config, 'none');
  assert.equal(config.circleFinalRays, 0);
  assert.equal(fxActive(config), false);
  for (const c of [PARTNERS_DEFAULTS, SPONSOR_KEAZ_DEFAULTS, SPONSOR_PROMRUKAV_DEFAULTS, CIRCLE_FINAL_DEFAULTS]) assert.equal(c.fxStack.circleFinalRays, 0);
});

test('effect is available even in sponsor scenes and shares original beam field', () => {
  for (const id of ['partners','sponsor-keaz','sponsor-promrukav','circle-final','waiting','brand','lab-swarm']) assert.equal(sectionAllowed(id, 'fxStack'), true);
  const material = beamMaterial();
  assert.ok(material.fragmentShader.includes(CIRCLE_BEAMS_GLSL));
  material.dispose();
  const source = readFileSync(new URL('../src/studio/fx-stack.js', import.meta.url), 'utf8');
  assert.match(source, /\$\{CIRCLE_BEAMS_GLSL\}/);
  assert.match(source, /circleFinalBeams\(vUv, uCircleTime, along\) \* uCircleFinalRays \* fx/);
  assert.deepEqual(fxCycleTime(25, {start:2,end:12}), {relative:3,total:10,beforeStart:false});
});
