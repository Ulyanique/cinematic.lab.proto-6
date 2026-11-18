// Лучи и боке из финальной сцены circle.animaation.proto-2 (MIT).
import * as THREE from 'three';
import { rng } from '../core/util.js';

export const beamMaterial = () => new THREE.ShaderMaterial({
  uniforms: { uLevel: { value: 0 }, uAlong: { value: 436 }, uTime: { value: 0 } },
  transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: /* glsl */`
    uniform float uLevel, uAlong, uTime; varying vec2 vUv;
    float hash1(float n) { return fract(sin(n * 127.1) * 43758.5453123); }
    void main() {
      vec2 p = vec2(vUv.x * 1280.0, (1.0 - vUv.y) * 720.0);
      vec3 acc = vec3(0.0);
      for (int side = 0; side < 2; side++) {
        vec2 q = side == 0 ? p : vec2(1280.0 - p.x, p.y);       // the two arms mirror each other
        vec2 d = vec2(0.788, 0.615), n = vec2(-0.615, 0.788);
        vec2 r = q - vec2(0.0, 330.0);
        float along = dot(r, d), perp = dot(r, n);
        float wide = mix(46.0, 16.0, smoothstep(0.0, 380.0, along));              // broad at the frame edge, thin further in
        float core = exp(-pow(perp / wide, 2.0)) + 0.35 * exp(-pow((perp - 20.0) / 85.0, 2.0));
        float lines = 0.0;
        for (int k = 0; k < 6; k++) {
          float fk = float(k) + 9.0 * float(side);
          float off = (hash1(fk + 0.3) - 0.5) * 300.0 + 6.0 * sin(uTime * 0.2 + fk);
          lines += exp(-pow((perp - off) / (1.5 + 4.0 * hash1(fk + 3.1)), 2.0)) * (0.12 + 0.3 * hash1(fk + 11.7));
        }
        float edge = exp(-max(along, 0.0) / 240.0);
        float blob = exp(-pow((along - uAlong) / 130.0, 2.0));
        float spot = exp(-(pow(along - uAlong, 2.0) + perp * perp) / (34.0 * 34.0)) + 0.5 * exp(-pow(perp / 5.0, 2.0)) * exp(-pow((along - uAlong) / 90.0, 2.0));
        float I = core * (1.1 * edge + 0.34 * blob + 0.07) + lines * (0.30 * edge + 0.12 * blob + 0.05) + spot * 1.3;
        vec3 c = mix(vec3(0.34, 0.60, 0.92) * 0.8, vec3(1.0, 0.68, 0.30), smoothstep(30.0, 400.0, along));     // teal at the frame edge, amber further in
        acc += c * I;
      }
      acc += vec3(0.03, 0.02, 0.011) * exp(-pow(length((p - vec2(645.0, 290.0)) * vec2(0.8, 1.0)) / 380.0, 2.0)) / 0.55;   // faint warm haze behind the emblem
      gl_FragColor = vec4(acc * uLevel * 0.55, 1.0);
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

