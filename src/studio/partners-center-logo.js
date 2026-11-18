import * as THREE from 'three';
import emblemUrl from './lab2/logo.svg';
import { logoRotation } from './scenes/logo-motion.js';

/** Эмблема интро на лёгкой вращающейся плоскости, без второй сцены WebGL. */
export class PartnersCenterLogo {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, .1, 100);
    this.camera.position.z = 9;
    this.texture = new THREE.Texture();
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.material = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.05, 3.2), this.material);
    this.scene.add(this.mesh);
    this.image = new Image();
    this.image.onload = () => {
      this.texture.image = this.image;
      this.texture.needsUpdate = true;
      if (window.__logo?.activeScene?.id === 'partners' && window.__logo?.cfg?.playback?.paused) {
        window.__logo.renderAt(window.__logo.time);
      }
    };
    this.image.src = emblemUrl;
  }
  update(local, cycle, opacity) {
    this.material.opacity = opacity * .38;
    const rot = logoRotation({ intro: false, photo: true, time: local, local, cycle, start: 0, turns: 1, swayAmount: 0, swaySpeed: 0 });
    this.mesh.rotation.set(rot.x, rot.y, rot.z);
  }
  dispose() {
    this.image.onload = null;
    this.mesh.geometry.dispose(); this.material.dispose(); this.texture.dispose();
  }
}
