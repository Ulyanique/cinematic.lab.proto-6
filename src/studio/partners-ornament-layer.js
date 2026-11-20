import * as THREE from 'three';
import { drawPartnersOrnament, ornamentMotion } from './partners-ornament.js';

/** Маленькая независимая текстура, чтобы анимация не перерисовывала весь кадр. */
export function createPartnersOrnamentLayer() {
  const canvas = document.createElement('canvas');
  canvas.width = 1320; canvas.height = 300;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  const geometry = new THREE.PlaneGeometry(1320 / 960, 300 / 540);
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false; mesh.renderOrder = 3.5; mesh.visible = false;
  return {
    mesh,
    update(layer, visible, progress, time, motion) {
      const show = layer && layer.enabled !== false && visible > .001 && (layer.opacity ?? 1) > .001 && ornamentMotion(progress, layer).star > .001;
      mesh.visible = Boolean(show);
      if (!show) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawPartnersOrnament(ctx, { ...layer, x: 660, y: 150, scale: 1 }, visible, progress, time, motion);
      texture.needsUpdate = true;
      mesh.position.set(((layer.x ?? 960) - 960) / 960, (540 - (layer.y ?? 823)) / 540, 0);
      mesh.scale.setScalar(layer.scale ?? 1);
    },
    dispose() { texture.dispose(); geometry.dispose(); material.dispose(); },
  };
}
