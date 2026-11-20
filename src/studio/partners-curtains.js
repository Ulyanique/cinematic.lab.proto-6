import * as THREE from 'three';
import { stageCurtainLayout } from './partners-stage.js';

/** Движение штор на GPU, без перерисовки и загрузки полноэкранного холста. */
export function createPartnersCurtains() {
  const texture = new THREE.Texture();
  texture.colorSpace = THREE.SRGBColorSpace;
  const geometry = new THREE.PlaneGeometry(1, 2);
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const left = new THREE.Mesh(geometry, material), right = new THREE.Mesh(geometry, material);
  left.frustumCulled = right.frustumCulled = false;
  left.renderOrder = right.renderOrder = 5;
  let currentImage = null;
  return {
    left, right,
    update(image, open, edgeWidth, visible, enabled, options = {}) {
      const active = Boolean(image && enabled && visible > .001);
      left.visible = active && options.leftVisible !== false;
      right.visible = active && options.rightVisible !== false;
      if (!left.visible && !right.visible) return;
      if (image !== currentImage) { currentImage = image; texture.image = image; texture.needsUpdate = true; }
      const l = stageCurtainLayout(image, open, 1080, edgeWidth + (Number(options.leftOffset) || 0));
      const r = stageCurtainLayout(image, open, 1080, edgeWidth + (Number(options.rightOffset) || 0));
      left.position.x = -1 + (l.x + l.imageWidth / 2) / 960;
      right.position.x = 1 - (r.x + r.imageWidth / 2) / 960;
      left.scale.x = l.imageWidth / 960; right.scale.x = -r.imageWidth / 960;
      material.opacity = visible;
    },
    dispose() { geometry.dispose(); material.dispose(); texture.dispose(); },
  };
}
