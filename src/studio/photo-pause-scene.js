import * as THREE from "three";
import { PhotoAperture } from "./photo-aperture.js";
import { BrandScene } from "./brand-scene.js";
import { computePhase } from "./timeline.js";
import { viewfinderSegments, framePulseScale } from "./scenes/photo-layout.js";
import { bgVert, bgFrag } from "./lab2/shaders.ts";

const FRAME_DEPTH = 5;
// Волны сияния на стыке зацикленного 24-секундного ролика зациклены целым
// числом периодов — панель «дышит», но шов незаметен.
const BREATHE = (2 * Math.PI) / 24;

/** Тот же рисунок, что фон «Интро» (лучи, ленты, блёстки), вместо штатного тёплого фона сцены. */
function createIntroBackdrop() {
  const uniforms = {
    uTime: { value: 0 }, uAspect: { value: 16 / 9 },
    uBeam: { value: 0 }, uRib: { value: 0 }, uGlow: { value: 0 }, uFlash: { value: 0 }, uFinal: { value: 0 },
    uCam: { value: new THREE.Vector2() },
  };
  const material = new THREE.ShaderMaterial({
    vertexShader: bgVert,
    fragmentShader: bgFrag,
    depthTest: false,
    depthWrite: false,
    uniforms,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  // Тот же слой, что у штатного фона: позади всего остального.
  mesh.renderOrder = -10;
  return { mesh, uniforms, dispose() { mesh.geometry.dispose(); material.dispose(); } };
}

/** №8: центрированный знак, кольцо из текста и уголки у границ кадра. */
export class PhotoPauseScene extends BrandScene {
  constructor(canvas, config) {
    super(canvas, config, { contourWaves: true, decor: false, photoSpin: true });
    // Фон — как в «Интро»: тёмный бархат, лучи, ленты и блёстки. Штатный
    // тёплый фон прячем: он остался для классических сцен и проступал бы под новым.
    this.introBackdrop = createIntroBackdrop();
    this.scene.add(this.introBackdrop.mesh);
    this.background.mesh.visible = false;
    this.aperture = new PhotoAperture();
    this.scene.add(this.aperture.group);
    this.frameSig = '';
    this.viewfinder = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({
      color: 0xdab46f, transparent: true, opacity: 0, depthTest: false, depthWrite: false,
    }));
    this.viewfinder.position.z = -FRAME_DEPTH;
    this.viewfinder.renderOrder = 20;
    this.scene.add(this.camera);
    this.camera.add(this.viewfinder);
  }
  update(t, dt) {
    super.update(t, dt);
    const bu = this.introBackdrop.uniforms;
    bu.uTime.value = t;
    bu.uAspect.value = this.camera.aspect;
    bu.uCam.value.set(this.camera.position.x * -0.25, this.camera.position.y * -0.25);
    // Удержание интро: лучи и ленты включены и медленно дышат, ударных вспышек нет.
    bu.uBeam.value = 0.92 + 0.08 * Math.sin(t * BREATHE * 3);
    bu.uRib.value = 0.9 + 0.1 * Math.sin(t * BREATHE * 4 + 1);
    bu.uGlow.value = 1;
    bu.uFinal.value = 1;
    bu.uFlash.value = 0;
    const cfg = this.cfg, p = cfg.photo;
    const phase = computePhase(t, cfg.timeline);
    this.aperture.update(phase, cfg, this.logo.root);
    // На входе апертура заменяет старую рисующую окружность; обратный уход не меняем.
    if (p.apertureEnabled && !phase.beforeStart && phase.local < cfg.timeline.drawDuration + cfg.timeline.emergeDuration * .15) this.plotter.group.visible = false;
    // Внутренний пунктир следует за знаком; радиус можно менять независимо от текста.
    this.corners.centerRing.position.set(this.logo.root.position.x, this.logo.root.position.y, -0.05);
    this.corners.centerRing.scale.setScalar(p.ringRadius);
    // Камерная плоскость удерживает уголки у границ кадра при любом формате окна.
    const sig = [this.camera.fov, this.camera.aspect, p.frameMargin, p.frameLength].join('|');
    if (sig !== this.frameSig) {
      this.frameSig = sig;
      const halfH = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * FRAME_DEPTH;
      const vertices = viewfinderSegments(halfH * this.camera.aspect, halfH, p.frameMargin, p.frameLength);
      this.viewfinder.geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      this.viewfinder.geometry.computeBoundingSphere();
    }
    this.viewfinder.scale.setScalar(framePulseScale(phase.local, phase.cycle, p.framePulse, p.framePulseCycles));
    this.viewfinder.material.color.set(p.color);
    this.viewfinder.material.opacity = p.frameOpacity * phase.reveal * phase.rings;
    this.viewfinder.visible = p.frameEnabled && this.viewfinder.material.opacity > 0.001;
  }
  dispose() {
    this.introBackdrop.dispose();
    this.aperture.dispose();
    this.viewfinder.removeFromParent(); this.viewfinder.geometry.dispose(); this.viewfinder.material.dispose();
    super.dispose();
  }
}
