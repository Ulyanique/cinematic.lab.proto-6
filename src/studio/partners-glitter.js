import * as THREE from 'three';
import { GLITTER } from './partners-graphics.js';

/** Те же точки, что в Canvas2D, на GPU: без перезагрузки всего кадра. */
export function createPartnersGlitter() {
  const grains = GLITTER.filter(g => {
    if (g.y <= 60 || g.y >= 1050) return false;
    const inColumn = (g.x > 126 && g.x < 724) || (g.x > 1196 && g.x < 1794);
    return !(inColumn && g.y > 52 && g.y < 538);
  });
  const positions = [], params = [], offsets = [];
  for (const g of grains) {
    positions.push(g.x, g.y, 0);
    params.push(g.phase, g.speed, g.duty, g.size);
    offsets.push(g.sway, g.drift);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('params', new THREE.Float32BufferAttribute(params, 4));
  geometry.setAttribute('offsets', new THREE.Float32BufferAttribute(offsets, 2));
  const uniforms = { time: { value: 0 }, period: { value: 1 }, motion: { value: 1 }, pixelScale: { value: 1 } };
  const material = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute vec4 params;
      attribute vec2 offsets;
      uniform float time, period, motion, pixelScale;
      varying float brightness;
      void main() {
        float phase = fract(time / max(.1, period) * params.y + params.x);
        float flash = max(0.0, 1.0 - abs(phase - .5) / (params.z * .5));
        brightness = pow(flash, 1.15) * motion;
        float x = position.x + sin(time * .4 + params.x) * offsets.x;
        float y = position.y + cos(time * .3 + params.x * 1.7) * offsets.x * .6 - offsets.y;
        gl_Position = vec4(x / 960.0 - 1.0, 1.0 - y / 540.0, 0.0, 1.0);
        gl_PointSize = max(1.0, params.w * (2.6 + brightness * 4.0) * pixelScale);
      }`,
    fragmentShader: `
      varying float brightness;
      void main() {
        float r = length(gl_PointCoord - vec2(.5)) * 2.0;
        float core = exp(-r * r * 5.0) * (1.0 - smoothstep(.65, 1.0, r));
        gl_FragColor = vec4(1.0, .70, .38, core * brightness * .65);
      }`,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 1;
  points.visible = false;
  return { points, uniforms, dispose() { geometry.dispose(); material.dispose(); } };
}
