import * as THREE from 'three';

/** Мягкие неподвижные лучи с медленно меняющейся яркостью, как в интро. */
export function createPartnersLight() {
  const uniforms = { time: { value: 0 }, strength: { value: 0 }, speed: { value: 1 } };
  const material = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthTest: false, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false,
    vertexShader: `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
    `,
    fragmentShader: `
      precision highp float;
      uniform float time, strength, speed;
      varying vec2 vUv;
      float beam(vec2 p, vec2 source, float direction, float spread, float seed) {
        vec2 v = p - source;
        float angle = atan(v.y, v.x) - direction;
        angle = mod(angle + 3.14159265, 6.2831853) - 3.14159265;
        float cone = exp(-angle * angle / (spread * spread));
        // Форма луча закреплена; меняется только освещённость, без ползущей сетки.
        float facets = .68 + .18 * cos(angle * 14.0 + seed) + .14 * cos(angle * 27.0 - seed);
        float breathing = .75 + .25 * sin(time * speed * .34 + seed);
        return cone * facets * breathing * exp(-length(v) * .22);
      }
      void main() {
        vec2 p = (vUv - .5) * vec2(1.7777778, 1.0) * 9.0;
        float light = beam(p, vec2(-4.0, 6.0), -2.0, .40, 1.3) * 1.15;
        light += beam(p, vec2(-8.5, 4.2), -.95, .26, 4.1) * .60;
        light += beam(p, vec2(9.0, -6.2), 2.25, .34, 7.7) * .85;
        light += beam(p, vec2(-9.0, -5.5), .62, .22, 9.2) * .55;
        gl_FragColor = vec4(1.0, .64, .28, clamp(light * strength * .26, 0.0, .35));
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  return { mesh, uniforms, dispose() { mesh.geometry.dispose(); material.dispose(); } };
}
