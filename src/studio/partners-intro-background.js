import * as THREE from 'three';
import { bgVert, bgFrag } from './lab2/shaders.ts';

/** Тот же шейдер, что в интро, как отдельный отключаемый фон спонсоров. */
export function createPartnersIntroBackground() {
  const uniforms = {
    uTime: { value: 0 }, uAspect: { value: 16 / 9 }, uBeam: { value: 1 }, uRib: { value: 1 },
    uGlow: { value: 0 }, uFlash: { value: 0 }, uFinal: { value: 1 }, uCam: { value: new THREE.Vector2() },
    uOpacity: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({ uniforms, transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
    vertexShader: bgVert,
    fragmentShader: bgFrag.replace('uniform vec2 uCam;', 'uniform vec2 uCam;\nuniform float uOpacity;')
      .replace('gl_FragColor=vec4(col,1.);', 'gl_FragColor=vec4(col,uOpacity);'),
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false; mesh.renderOrder = 0; mesh.visible = false;
  return { mesh, uniforms, dispose() { mesh.geometry.dispose(); material.dispose(); } };
}
