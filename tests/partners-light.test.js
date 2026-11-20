import test from 'node:test';
import assert from 'node:assert/strict';
import { createPartnersLight } from '../src/studio/partners-light.js';
import { PARTNERS_DEFAULTS } from '../src/studio/scenes/partners.js';
import { sectionAllowed, eyeKey } from '../src/studio/ui/field-rules.js';
import { layerMeta } from '../src/studio/ui/layer-registry.js';

test('animated background light is a separate switchable layer', () => {
  assert.equal(PARTNERS_DEFAULTS.partnersLight.enabled, true);
  assert.equal(sectionAllowed('partners', 'partnersLight'), true);
  const section = { id: 'partnersLight', title: 'Свет', fields: [{ key: 'enabled' }] };
  assert.equal(eyeKey(section), 'enabled');
  assert.equal(layerMeta(section).group, 'Свет');
  const light = createPartnersLight();
  assert.equal(light.mesh.renderOrder, 1);
  assert.equal(light.uniforms.strength.value, 0);
  assert.match(light.mesh.material.fragmentShader, /time \* speed/);
  assert.match(light.mesh.material.fragmentShader, /gl_FragColor/);
  light.dispose();
});


test('legacy intro background shader remains available for old projects', async () => {
  const { createPartnersIntroBackground } = await import('../src/studio/partners-intro-background.js');
  assert.equal(PARTNERS_DEFAULTS.partnersIntroBackground.enabled, false);
  assert.equal(sectionAllowed('partners', 'partnersIntroBackground'), false);
  assert.equal(sectionAllowed('sponsor-keaz', 'partnersIntroBackground'), false);
  const bg = createPartnersIntroBackground();
  assert.equal(bg.mesh.visible, false);
  assert.match(bg.mesh.material.fragmentShader, /gl_FragColor=vec4\(col,uOpacity\)/);
  assert.match(bg.mesh.material.fragmentShader, /micro-sparkles/);
  bg.dispose();
});
