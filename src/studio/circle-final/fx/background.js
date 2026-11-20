// Лучи и боке из финальной сцены circle.animaation.proto-2 (MIT).
import * as THREE from 'three';
import { rng } from '../core/util.js';
import { CIRCLE_BEAMS_GLSL } from './beams-shader.js';

export const beamMaterial = () => new THREE.ShaderMaterial({
  uniforms: { uLevel: { value: 0 }, uAlong: { value: 436 }, uTime: { value: 0 } },
  transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: /* glsl */`
    uniform float uLevel, uAlong, uTime; varying vec2 vUv;
    ${CIRCLE_BEAMS_GLSL}
    void main() {
      gl_FragColor = vec4(circleFinalBeams(vUv, uTime, uAlong) * uLevel, 1.0);
    }`,
});

/** Bokeh dots: thrown out by the burst, then they drift slowly and fade. Drawn straight in video pixels. */
export function makeBokeh(count = 220) {
  const R = rng(77);
  const a = new Float32Array(count * 4), b = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    a.set([R() * Math.PI * 2, 120 + 820 * Math.pow(R(), 0.8), 9 + 24 * R(), 3 + 10 * Math.pow(R(), 2.2)], i * 4);
    b.set([(R() - 0.5) * 0.7, (R() - 0.5) * 0.5 - 0.1, R() * 6.28, 0.35 + 0.65 * R()], i * 4);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute('aA', new THREE.BufferAttribute(a, 4));
  geo.setAttribute('aB', new THREE.BufferAttribute(b, 4));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uF: { value: 0 }, uAlpha: { value: 0 }, uPx: { value: 1 } },
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute vec4 aA; attribute vec4 aB; uniform float uF, uAlpha, uPx; varying float vA;
      void main() {
        float tau = max(uF - 970.0, 0.0);
        float r = aA.y * (1.0 - exp(-tau / aA.z));
        vec2 p = vec2(640.0, 360.0) + vec2(cos(aA.x), sin(aA.x)) * r + aB.xy * max(uF - 990.0, 0.0);
        vA = uAlpha * aB.w * (0.6 + 0.4 * sin(uF * 0.21 + aB.z));
        gl_Position = vec4(p.x / 640.0 - 1.0, 1.0 - p.y / 360.0, 0.0, 1.0);
        gl_PointSize = aA.w * uPx * (1.0 + 1.2 * exp(-tau / 12.0));
      }`,
    fragmentShader: /* glsl */`
      varying float vA;
      void main() { float d = length(gl_PointCoord - 0.5) * 2.0; gl_FragColor = vec4(vec3(1.0, 0.74, 0.34) * smoothstep(1.0, 0.45, d) * vA * 1.7, 1.0); }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 30;
  return pts;
}

