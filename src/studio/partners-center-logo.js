import * as THREE from 'three';
import { Logo, revealUniforms } from './logo.js';
import { PHOTO_PAUSE_DEFAULTS } from './scenes/photo-pause.js';
import { logoRotation } from './scenes/logo-motion.js';

/** Тот же объёмный знак и вращение, что в фотопаузе, с прозрачным фоном. */
export class PartnersCenterLogo {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(512, 512, false);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, .1, 100);
    this.camera.position.z = 9;
    this.logo = new Logo();
    this.logo.rebuildIfNeeded(PHOTO_PAUSE_DEFAULTS);
    this.logo.root.scale.setScalar(.9);
    this.scene.add(this.logo.root);
    this.scene.add(new THREE.AmbientLight(0xffe4b8, 1.4));
    const key = new THREE.DirectionalLight(0xffe1a5, 3);
    key.position.set(-3, 4, 6); this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xffb45b, 1.3);
    fill.position.set(4, -2, 3); this.scene.add(fill);
    this.logo.material.color.set('#c8962e');
    this.logo.material.emissive.set('#6b4a12').multiplyScalar(.12);
  }
  render(local, cycle) {
    revealUniforms.uReveal.value = 2.9;
    revealUniforms.uRevealGlow.value = 0;
    revealUniforms.uRevealNoise.value = 0.2;
    revealUniforms.uCenter.value.set(0, 0);
    revealUniforms.uSpecPass.value = 0;
    revealUniforms.uSpecX.value = 0;
    revealUniforms.uK.value = this.logo.parsed.K;
    revealUniforms.uCinematicGold.value = 1;
    revealUniforms.uCinematicTime.value = local;
    revealUniforms.uFacetPolish.value = .65;
    revealUniforms.uStudioRelief.value = .85;
    revealUniforms.uAmber.value = .4;
    const rot = logoRotation({ intro: false, photo: true, time: local, local, cycle, start: 0, turns: 1, swayAmount: 0, swaySpeed: 0 });
    this.logo.root.rotation.set(rot.x, rot.y, rot.z);
    this.renderer.render(this.scene, this.camera);
    return this.canvas;
  }
  dispose() { this.logo.dispose(); this.renderer.dispose(); }
}
