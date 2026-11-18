import * as THREE from 'three';
import { framePathPoint } from './partners-motion.js';

/** Мягкий блик вдоль той же рамки, которую рисует кешированный слой. */
export function createPartnersFrameGlint() {
  const positions = [], along = [], across = [];
  const samples = 720, halfWidth = 5;
  function vertex(point, side, at) {
    const angle = point.angle * Math.PI / 180;
    const x = 960 + (point.x - 960) * .94 - Math.sin(angle) * halfWidth * side;
    const y = 540 + (point.y - 540) * .94 + Math.cos(angle) * halfWidth * side;
    positions.push(x / 960 - 1, 1 - y / 540, 0);
    along.push(at); across.push(side);
  }
  for (let i = 0; i < samples; i++) {
    const a = i / samples, b = (i + 1) / samples;
    const p = framePathPoint(a), q = framePathPoint(b);
    vertex(p, -1, a); vertex(p, 1, a); vertex(q, -1, b);
    vertex(q, -1, b); vertex(p, 1, a); vertex(q, 1, b);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('along', new THREE.Float32BufferAttribute(along, 1));
  geometry.setAttribute('across', new THREE.Float32BufferAttribute(across, 1));
  const uniforms = { time: { value: 0 }, opacity: { value: 0 }, frameScale: { value: 1 }, frameOffset: { value: new THREE.Vector2(0, 0) } };
  const material = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthTest: false, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false,
    vertexShader: `
      attribute float along, across;
      uniform float frameScale;
      uniform vec2 frameOffset;
      varying float vAlong, vAcross;
      void main() {
        vAlong = along; vAcross = across;
        gl_Position = vec4(position.xy * frameScale + frameOffset, position.z, 1.0);
      }`,
    fragmentShader: `
      uniform float time, opacity;
      varying float vAlong, vAcross;
      void main() {
        float head = fract(time * .105 - .022 * sin(time * .52));
        float distanceAlong = abs(fract(vAlong - head + .5) - .5);
        float falloff = pow(max(0.0, 1.0 - distanceAlong / .036), 1.7);
        float core = exp(-vAcross * vAcross * 6.0);
        float halo = exp(-vAcross * vAcross * 2.0) * .25;
        gl_FragColor = vec4(1.0, .78, .43, opacity * falloff * (core + halo) * .85);
      }`,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false; mesh.renderOrder = 2;
  return { mesh, uniforms, dispose() { geometry.dispose(); material.dispose(); } };
}
