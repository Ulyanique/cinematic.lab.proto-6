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
    update(image, open, edgeWidth, visible, enabled) {
      left.visible = right.visible = Boolean(image && enabled && visible > .001);
      if (!left.visible) return;
      if (image !== currentImage) { currentImage = image; texture.image = image; texture.needsUpdate = true; }
      const { x, imageWidth } = stageCurtainLayout(image, open, 1080, edgeWidth);
      const center = -1 + (x + imageWidth / 2) / 960;
      left.position.x = center; right.position.x = -center;
      left.scale.x = imageWidth / 960; right.scale.x = -imageWidth / 960;
      material.opacity = visible;
    },
    dispose() { geometry.dispose(); material.dispose(); texture.dispose(); },
  };
}
