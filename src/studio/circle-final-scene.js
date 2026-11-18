// Финальный кадр проекта circle.animaation.proto-2: исходные лучи, частицы и постобработка
// (MIT, см. circle-final/LICENSE). Вместо титра — логотип этой студии в центре.
import * as THREE from 'three';
import logoUrl from './lab2/logo.svg';
import { Stage } from './circle-final/core/stage.js';
import { track } from './circle-final/core/util.js';
import { makeBurst } from './circle-final/fx/burst.js';
import { beamMaterial, makeBokeh } from './circle-final/fx/background.js';
import { circleFinalTiming } from './circle-final-timing.js';
import { computePhase } from './timeline.js';
import { masterSize } from './output-profile.js';
import { DEFAULT_QUALITY, isQualityPreset } from './quality-presets.js';

const flareI = track([[963,1.5],[966,2.2],[970,3],[974,4],[979,3],[985,2],[988,1.4],[991,.8],[994,.5],[997,.32],[1000,.24],[1004,.2],[1009,.1],[1014,0]]);
const flareS = track([[963,1.4],[968,3],[974,6],[982,4.5],[988,3.5],[994,2.6],[1000,2.2],[1009,1.8]]);
const flash = track([[963,.04],[966,.19],[969,.5],[972,.85],[974,1],[976,.8],[979,.58],[982,.48],[985,.4],[988,.25],[991,.1],[994,.035],[997,.012],[1000,.004],[1003,0]]);
const beams = track([[1003,0],[1009,.22],[1045,1]]);
const bokeh = track([[972,0],[980,1],[1003,.9],[1060,.32],[1120,.16],[1213,.1]]);
const logoOpacity = track([[978,0],[984,.5],[990,1]]);
const rays = track([[963,1],[970,.2],[1000,.2],[1010,1]]);
const centre = track([[963,[665,375]],[966,[645,352]],[970,[640,356]],[1003,[641,362]]]);

export class CircleFinalScene {
  constructor(canvas, cfg) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.cfg = cfg;
    this.time = 0; this._quality = DEFAULT_QUALITY; this.disposed = false;
    this.stage = new Stage(document.createElement('canvas'));
    this.background = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), beamMaterial());
    this.background.frustumCulled = false; this.background.renderOrder = -5;
    this.burst = makeBurst(); this.bokeh = makeBokeh();
    this.logo = new THREE.Mesh(new THREE.PlaneGeometry(.49, .92), new THREE.ShaderMaterial({
      uniforms: { uMap: { value: null }, uOpacity: { value: 0 } }, transparent: true, depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv; gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader: 'uniform sampler2D uMap; uniform float uOpacity; varying vec2 vUv; void main(){vec4 c=texture2D(uMap,vUv); gl_FragColor=vec4(c.rgb,c.a*uOpacity);}',
    }));
    this.logo.frustumCulled = false; this.logo.renderOrder = 20;
    this.stage.scene.add(this.background, this.logo, this.burst, this.bokeh);
    this._readyPromise = new Promise((resolve, reject) => new THREE.TextureLoader().load(logoUrl, texture => {
      if (this.disposed) { texture.dispose(); resolve(); return; }
      texture.colorSpace = THREE.SRGBColorSpace; this.logo.material.uniforms.uMap.value = texture;
      this.texture = texture; resolve(); window.__logo?.renderAt?.(window.__logo.time);
    }, undefined, reject));
    this.resize();
  }
  get quality() { return this._quality; }
  setQuality(id) { if (!isQualityPreset(id) || id === this._quality) return false; this._quality = id; return true; }
  setCaptionSource() {} setCaptionVisible() {} configChanged() {}
  whenReady() { return this._readyPromise; }
  resize() { const {width, height} = masterSize(); this.canvas.width = width; this.canvas.height = height; this.stage.resize(width, height, 1); }
  update(t) { this.time = t; }
  render() {
    const { width, height } = masterSize();
    if (width !== this.canvas.width || height !== this.canvas.height) this.resize();
    const timing = circleFinalTiming(computePhase(this.time, this.cfg.timeline), this.cfg.timeline);
    const f = timing.frame, time = (f - 963) / 24;
    const stage = this.stage; stage.resetFrame();
    this.background.material.uniforms.uLevel.value = beams(f);
    this.background.material.uniforms.uAlong.value = 495 + .08 * (f - 1100);
    this.background.material.uniforms.uTime.value = time;
    this.logo.material.uniforms.uOpacity.value = this.texture ? logoOpacity(f) : 0;
    this.burst.visible = f < 1004; this.burst.material.uniforms.uF.value = f;
    const c = centre(f); this.burst.material.uniforms.uC.value.set(...c);
    this.bokeh.material.uniforms.uF.value = f;
    this.bokeh.material.uniforms.uAlpha.value = bokeh(f);
    this.bokeh.material.uniforms.uPx.value = height / 720;
    const fl = stage.flares[0];
    Object.assign(fl, {x:c[0], y:c[1], i:flareI(f), s:flareS(f), rays:rays(f), rot:time * .3});
    stage.post.flash = flash(f); stage.post.flashColor = [1,.64,.32];
    stage.post.vignette = .34; stage.post.fade = timing.opacity;
    stage.render(time);
    this.ctx.drawImage(stage.canvas, 0, 0, width, height);
  }
  dispose() {
    this.disposed = true; this.texture?.dispose();
    for (const object of [this.background, this.logo, this.burst, this.bokeh]) { object.geometry.dispose(); object.material.dispose(); }
    for (const pass of this.stage.composer.passes) pass.dispose?.();
    this.stage.composer.dispose(); this.stage.under.dispose(); this.stage.renderer.dispose();
  }
}
