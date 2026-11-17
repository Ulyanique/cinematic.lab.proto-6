// @ts-nocheck
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

const VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`;

const BRIGHT = /* glsl */ `
precision highp float;
uniform sampler2D tDiffuse; uniform vec2 uTexel; uniform float uThreshold;
varying vec2 vUv;
void main(){
  vec3 c=vec3(0.);
  for(int i=0;i<4;i++){
    vec2 o=vec2(i==0||i==2?-1.:1., i<2?-1.:1.)*uTexel;
    vec3 s=texture2D(tDiffuse, vUv+o).rgb;
    float l=max(max(s.r,s.g),s.b);
    c+=s*smoothstep(uThreshold, uThreshold+1.4, l);
  }
  gl_FragColor=vec4(c*0.25,1.);
}`;

const BLUR = /* glsl */ `
precision highp float;
uniform sampler2D tDiffuse; uniform vec2 uStep;
varying vec2 vUv;
void main(){
  vec3 acc=vec3(0.); float ws=0.;
  for(int i=-12;i<=12;i++){
    float f=float(i);
    float w=exp(-f*f/50.);
    acc+=texture2D(tDiffuse, vUv+uStep*f).rgb*w; ws+=w;
  }
  gl_FragColor=vec4(acc/ws,1.);
}`;

const COMP = /* glsl */ `
precision highp float;
uniform sampler2D tBase, tStreak; uniform float uStrength; uniform vec3 uTint;
varying vec2 vUv;
void main(){
  vec4 b=texture2D(tBase, vUv);
  vec3 s=texture2D(tStreak, vUv).rgb;
  gl_FragColor=vec4(b.rgb + s*uTint*uStrength*1.6, b.a);
}`;

/** Анаморфные горизонтальные полосы света от ярких областей (HDR, до тон-маппинга). */
export class StreakPass extends Pass {
  constructor() {
    super();
    const opts = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
    this.rtA = new THREE.WebGLRenderTarget(80, 45, opts);
    this.rtB = new THREE.WebGLRenderTarget(80, 45, opts);
    this.w = 80; this.h = 45;
    this.strength = 0;
    this.threshold = 1.8;
    this.quad = new FullScreenQuad();
    const mk = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
    this.brightMat = mk(BRIGHT, { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 1 } });
    this.blurMat = mk(BLUR, { tDiffuse: { value: null }, uStep: { value: new THREE.Vector2() } });
    this.compMat = mk(COMP, { tBase: { value: null }, tStreak: { value: null }, uStrength: { value: 0 }, uTint: { value: new THREE.Color(1.0, 0.7, 0.36) } });
  }

  setSize(w, h) {
    this.w = Math.max(16, w >> 2);
    this.h = Math.max(9, h >> 2);
    this.rtA.setSize(this.w, this.h);
    this.rtB.setSize(this.w, this.h);
  }

  render(renderer, writeBuffer, readBuffer) {
    const out = this.renderToScreen ? null : writeBuffer;
    const q = this.quad;
    let streakTex = this.rtB.texture;
    if (this.strength >= 0.002) {
      q.material = this.brightMat;
      this.brightMat.uniforms.tDiffuse.value = readBuffer.texture;
      this.brightMat.uniforms.uTexel.value.set(0.5 / this.w, 0.5 / this.h);
      this.brightMat.uniforms.uThreshold.value = this.threshold;
      renderer.setRenderTarget(this.rtA);
      q.render(renderer);

      q.material = this.blurMat;
      let src = this.rtA, dst = this.rtB;
      for (const s of [1, 4, 14]) {
        this.blurMat.uniforms.tDiffuse.value = src.texture;
        this.blurMat.uniforms.uStep.value.set(s / this.w, 0);
        renderer.setRenderTarget(dst);
        q.render(renderer);
        const tmp = src; src = dst; dst = tmp;
      }
      streakTex = src.texture; // последний результат
    }
    q.material = this.compMat;
    this.compMat.uniforms.tBase.value = readBuffer.texture;
    this.compMat.uniforms.tStreak.value = streakTex;
    this.compMat.uniforms.uStrength.value = this.strength >= 0.002 ? this.strength : 0;
    renderer.setRenderTarget(out);
    q.render(renderer);
  }

  dispose() {
    this.rtA.dispose();
    this.rtB.dispose();
    this.brightMat.dispose();
    this.blurMat.dispose();
    this.compMat.dispose();
    this.quad.dispose();
  }
}
