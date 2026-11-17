// @ts-nocheck
import * as THREE from 'three';
import { Output, Mp4OutputFormat, WebMOutputFormat, BufferTarget, CanvasSource, canEncodeVideo } from 'mediabunny';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js';
import { fontOf, loadFontFace } from './fonts';
import { DEFAULT_CONFIG, DESIGN_IMPACT, cloneConfig, totalDuration, type Config } from './config';
import { EASE, logoXf, letterXf } from './anim';

import {
  bgVert, bgFrag, dustVert, dustFrag, swarmVert, swarmFrag, sparkVert, sparkFrag,
  arcVert, arcFrag, lineVert, lineFrag, textVert, textFrag, waveFrag, finalPass, traceVert, traceFrag,
} from './shaders';
import { makeGold, makeEnvironment, sharedGold } from './gold';
import { buildLogoParts, P } from './logo';
import { buildTitle } from './title';
import { StreakPass } from './streak';

/* ------------------------------------------------------------ helpers */
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
const easeInOutSine = (x: number) => -(Math.cos(Math.PI * x) - 1) / 2;
const easeInOutCubic = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeOutBack = (x: number) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};
/** envelope: rises over `att`, decays exponentially after */
const burst = (t: number, t0: number, att: number, dec: number) =>
  t < t0 ? 0 : t < t0 + att ? (t - t0) / att : Math.exp(-(t - t0 - att) / dec);

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(r: () => number) {
  return (r() + r() + r() + r() - 2) * 1.2;
}

const TL = {
  letters0: 5.75,
  letterStep: 0.085,
  letterDur: 0.95,
  lineStart: 8.05,
  subStart: 8.35,
  line2Start: 9.4,
  dateStart: 9.55,
  sweep2: 10.9,
};

/**
 * Draw dividers after all image effects. They are hairline graphics, not HDR light sources:
 * sending them through bloom/streak extraction and animated film grain made their brightness
 * depend on unrelated moving highlights. The pass keeps the rest of the composition untouched.
 */
class DividerOverlayPass extends Pass {
  scene: THREE.Scene;
  camera: THREE.Camera;
  target: THREE.WebGLRenderTarget;
  material: THREE.ShaderMaterial;
  quad: FullScreenQuad;

  constructor(scene: THREE.Scene, camera: THREE.Camera) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.target = new THREE.WebGLRenderTarget(320, 180, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tBase: { value: null },
        tDividers: { value: this.target.texture },
        uAspect: { value: 16 / 9 },
        uVignette: { value: 0.62 },
        uFade: { value: 1 },
        uOpen: { value: 1 },
        uSlitMix: { value: 1 },
      },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform sampler2D tBase, tDividers;
        uniform float uAspect, uVignette, uFade, uOpen, uSlitMix;
        varying vec2 vUv;
        vec3 srgbToLinear(vec3 c) {
          vec3 lo=c/12.92;
          vec3 hi=pow(max((c+0.055)/1.055,vec3(0.)),vec3(2.4));
          return mix(lo,hi,step(vec3(0.04045),c));
        }
        vec3 linearToSrgb(vec3 c) {
          vec3 lo=c*12.92;
          vec3 hi=1.055*pow(max(c,vec3(0.)),vec3(1./2.4))-0.055;
          return mix(lo,hi,step(vec3(0.0031308),c));
        }
        void main(){
          vec3 base=texture2D(tBase,vUv).rgb;
          vec3 line=texture2D(tDividers,vUv).rgb;
          vec2 d=vUv-0.5;
          float vignette=smoothstep(0.30,1.05,length(d*vec2(uAspect*0.72,1.15)));
          float lineVignette=1.-vignette*uVignette;
          float dy=abs(d.y);
          float softEdge=max(0.004,uOpen*0.35);
          float vis=1.-smoothstep(max(0.,uOpen-softEdge),uOpen+softEdge,dy);
          float dim=mix(1.,0.22,(1.-smoothstep(0.02,0.5,uOpen))*step(uOpen,0.5));
          float slit=mix(dim,vis,uSlitMix);
          vec3 merged=srgbToLinear(base)+line*(lineVignette*uFade*slit);
          gl_FragColor=vec4(linearToSrgb(merged),1.);
        }
      `,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.NoBlending,
    });
    this.quad = new FullScreenQuad(this.material);
    this.needsSwap = true;
  }

  setSize(width: number, height: number) {
    this.target.setSize(width, height);
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget) {
    const oldAutoClear = renderer.autoClear;
    const oldClearColor = renderer.getClearColor(new THREE.Color()).clone();
    const oldClearAlpha = renderer.getClearAlpha();
    try {
      renderer.autoClear = false;
      renderer.setClearColor(0x000000, 0);
      renderer.setRenderTarget(this.target);
      renderer.clear(true, false, false);
      renderer.render(this.scene, this.camera);

      this.material.uniforms.tBase.value = readBuffer.texture;
      renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
      renderer.clear(true, false, false);
      this.quad.render(renderer);
    } finally {
      renderer.setClearColor(oldClearColor, oldClearAlpha);
      renderer.autoClear = oldAutoClear;
    }
  }

  dispose() {
    this.target.dispose();
    this.material.dispose();
    this.quad.dispose();
  }
}

export class Intro {
  host: HTMLElement;
  cfg: Config = cloneConfig(DEFAULT_CONFIG);
  stackZ = { logo: 0, title: 0 };
  _v3 = new THREE.Vector3();
  pending = new Set<string>();
  sigs: any = null;
  rebuildTimer: any = 0;
  onWarn: ((msg: string | null) => void) | null = null;
  onFrame: ((t: number) => void) | null = null;
  onContextLost: (() => void) | null = null;
  freeze: number | null = null;
  playing = false;
  t = 0;
  private startAt = 0;
  private anchor = 0;
  private anchorPending = false;
  private pxW = 1920;
  private pxH = 1080;
  /** false до первого реального applySize — иначе проверка «размер не изменился» съест первый вызов */
  private _sized = false;
  /** true после первого круга: повтор входит в кадр быстрее, без длинного чёрного пролога */
  private loopRound = false;
  private _playedOnce = false;
  private renderFails = 0;
  private onVisibility: (() => void) | null = null;
  private forced = false;
  /** Встроенный режим студии: кадр рисует хост по времени, собственного цикла и ResizeObserver нет. */
  embedded = false;
  embeddedSize: [number, number] | null = null;
  private disposed = false;
  /** Порядок слоёв, пришедший из общей панели студии; `null` — собственный. */
  private sharedDepthOrder: string[] | null = null;
  private cancelRecording: (() => void) | null = null;
  /** максимальная ширина рендера в превью; адаптивно снижается на слабых GPU */
  private qualityCap = 1920;
  private perf = { n: 0, sum: 0, last: 0, slow: 0 };

  constructor(host: HTMLElement, cfg?: Config) {
    this.host = host;
    if (cfg) this.cfg = cfg;
  }

  /* ------------------------------------------------------------ init */
  async init() {
    const LY = this.cfg.layers;
    await Promise.all([loadFontFace(LY.title.font, LY.title.text), loadFontFace(LY.subtitle.font, LY.subtitle.text), loadFontFace(LY.date.font, LY.date.text)]);
    if (this.disposed) return;

    const renderer = (this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
      alpha: false,
      preserveDrawingBuffer: true,
    }));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    // Не чистый чёрный: если проход композера почему-то не отрисовался, зритель увидит
    // тёмный тёплый кадр, а не провал в черноту (это же значение даёт фону «пол»).
    renderer.setClearColor(0x050403, 1);
    renderer.domElement.style.cssText = 'width:100%;height:100%;display:block';
    this.host.appendChild(renderer.domElement);
    this.handleContextLost = (event: Event) => {
      event.preventDefault();
      this.cancelRecording?.();
      this.onContextLost?.();
    };
    renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost);
    // Фоновая вкладка: requestAnimationFrame останавливается, а время считается по performance.now().
    // При возврате получался скачок на десятки секунд — ролик «телепортировался» в финал или на
    // чёрный кадр пролога (при зацикливании). Переякорим таймлайн и не рисуем, пока вкладка скрыта.
    this.onVisibility = () => {
      if (document.hidden) {
        if (this.playing) this.anchor = this.t;
        return;
      }
      if (this.playing) {
        this.startAt = performance.now() - this.anchor * 1000;
        this.t = this.anchor;
      }
      this.perf = { n: 0, sum: 0, last: performance.now(), slow: 0 };
    };
    document.addEventListener('visibilitychange', this.onVisibility);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 200);
    this.camera.position.set(0, 0, 21);
    this.scene.add(this.camera);

    this.U = {
      uTime: { value: 0 },
      uScale: { value: 2000 },
    };

    this.environmentTarget = makeEnvironment(renderer);
    this.scene.environment = this.environmentTarget.texture;
    this.scene.environmentIntensity = 1.0;

    this.setupLights();
    this.setupBackground();
    this.setupDust();
    this.setupArcs();
    this.setupLogo();
    this.setupCompassRings();
    await this.setupTitle();
    if (this.disposed) { this.dispose(); return; }
    this.setupSubtitle();
    this.setupDividers();
    this.setupFX();
    this.setupPost();

    if (this.embedded && this.embeddedSize) this.applySize(this.embeddedSize[0], this.embeddedSize[1]);
    else {
      this.applySize();
      this.ro = new ResizeObserver(() => !this.forced && this.applySize());
      this.ro.observe(this.host);
    }


    this.sigs = this.sigOf(this.cfg);
    this.applyOrder();
    this.warmUp();
    if (!this.embedded) renderer.setAnimationLoop(() => this.frame());
  }

  /** Компилируем все шейдеры и заливаем текстуры до старта, чтобы таймлайн не «съедал» начало ролика. */
  warmUp() {
    try {
      this.renderer.compile(this.scene, this.camera);
      for (const t of [0.6, 2.6, 4.6, 5.6, 7.1, 9.8, 11.6]) {
        this.update(t);
        this.composer.render();
      }
      this.renderer.getContext().finish();
    } catch (e) {
      console.warn('warm-up failed', e);
    }
    this.update(0);
  }

  /* ------------------------------------------------------------ setup parts */
  setupLights() {
    const key = new THREE.DirectionalLight(0xfff0dc, 1.4);
    key.position.set(-4, 7, 9);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xff9a40, 1.2);
    rim.position.set(6, -2, 5);
    this.scene.add(rim);
    this.sweepLight = new THREE.PointLight(0xffe2b4, 0, 0, 2);
    this.sweepLight.position.set(-20, 0.4, 3.2);
    this.scene.add(this.sweepLight);
  }

  setupBackground() {
    this.bgMat = new THREE.ShaderMaterial({
      vertexShader: bgVert,
      fragmentShader: bgFrag,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uTime: this.U.uTime,
        uAspect: { value: 16 / 9 },
        uBeam: { value: 0 },
        uRib: { value: 0 },
        uGlow: { value: 0 },
        uFlash: { value: 0 },
        uFinal: { value: 0 },
        uCam: { value: new THREE.Vector2() },
      },
    });
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.bgMat);
    bg.frustumCulled = false;
    bg.renderOrder = -100;
    this.bgMesh = bg;
    this.scene.add(bg);
  }

  additive(vert, frag, uniforms, extra = {}) {
    return new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      ...extra,
    });
  }

  setupDust() {
    const r = rng(7);
    const pos: number[] = [], dir: number[] = [], prm: number[] = [];
    const push = (x, y, z, dx, dy, dz, size, glint) => {
      pos.push(x, y, z);
      dir.push(dx, dy, dz);
      prm.push(size, r(), 0.4 + r() * 1.1, glint);
    };
    // ambient dust
    for (let i = 0; i < 450; i++) {
      push((r() - 0.5) * 24, (r() - 0.5) * 14, -6 + r() * 11, (r() - 0.5) * 1.2, 0.4 + r() * 1.0, (r() - 0.5) * 0.6, 0.018 + Math.pow(r(), 3) * 0.06, r() > 0.75 ? 1 : 0);
    }
    // glitter streams hugging the corner ribbons
    const stream = (cx, cy, R0, R1, a0, a1, n, spread) => {
      for (let i = 0; i < n; i++) {
        const a = a0 + (a1 - a0) * Math.pow(r(), 0.8);
        const R = R0 + (R1 - R0) * r() + gauss(r) * spread;
        const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
        const tx = -Math.sin(a), ty = Math.cos(a);
        const L = 0.8 + r() * 1.8;
        push(x, y, -1.5 + r() * 3, tx * L, ty * L, (r() - 0.5) * 0.3, 0.014 + Math.pow(r(), 3) * 0.06, r() > 0.6 ? 1 : 0);
      }
    };
    const d2r = Math.PI / 180;
    stream(10, -7, 5.2, 6.9, 98 * d2r, 182 * d2r, 450, 0.18);
    stream(-10, -8, 5.4, 7.2, -4 * d2r, 76 * d2r, 400, 0.2);
    stream(-9, 5.5, 3.2, 4.4, -95 * d2r, 5 * d2r, 350, 0.15);
    // beam dust (top-left cone)
    for (let i = 0; i < 220; i++) {
      const s = r();
      push(-4 + (-6.5 + 4) * s + gauss(r) * (0.3 + s * 1.2), 5.5 - 5.5 * s + gauss(r) * (0.3 + s * 0.8), -2 + r() * 4, 0.3, -0.5, 0, 0.014 + Math.pow(r(), 3) * 0.05, r() > 0.6 ? 1 : 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aDir', new THREE.Float32BufferAttribute(dir, 3));
    g.setAttribute('aP', new THREE.Float32BufferAttribute(prm, 4));
    this.dustU = { uIn: { value: 0 }, uBokeh: { value: 0 }, uDens: { value: 1 }, uSizeK: { value: 1 }, uSpd: { value: 1 } };
    const dust = this.dustPts = new THREE.Points(g, this.additive(dustVert, dustFrag, { ...this.U, ...this.dustU }));
    dust.frustumCulled = false;
    dust.renderOrder = 5;
    this.scene.add(dust);

    // bokeh
    const bp: number[] = [], bd: number[] = [], bq: number[] = [];
    const bk = (x, y, z, size) => {
      bp.push(x, y, z);
      bd.push((r() - 0.5) * 0.6, 0.2 + r() * 0.5, 0);
      bq.push(size, r(), 0.15 + r() * 0.3, 0);
    };
    for (let i = 0; i < 26; i++) {
      const a = (98 + r() * 84) * d2r, R = 4.2 + r() * 3;
      bk(10 + Math.cos(a) * R, -7 + Math.sin(a) * R, -2 + r() * 6, 0.12 + Math.pow(r(), 2.2) * 0.9);
    }
    for (let i = 0; i < 22; i++) {
      const a = (-4 + r() * 80) * d2r, R = 4.4 + r() * 3;
      bk(-10 + Math.cos(a) * R, -8 + Math.sin(a) * R, -2 + r() * 6, 0.1 + Math.pow(r(), 2.2) * 0.8);
    }
    for (let i = 0; i < 18; i++) bk(-9 + r() * 5, 1 + r() * 4.5, -3 + r() * 4, 0.08 + Math.pow(r(), 2) * 0.5);
    for (let i = 0; i < 10; i++) bk((r() - 0.5) * 20, (r() - 0.5) * 11, -4 + r() * 3, 0.1 + r() * 0.35);
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
    bg.setAttribute('aDir', new THREE.Float32BufferAttribute(bd, 3));
    bg.setAttribute('aP', new THREE.Float32BufferAttribute(bq, 4));
    this.bokehU = { uIn: { value: 0 }, uBokeh: { value: 1 }, uDens: { value: 1 }, uSizeK: { value: 1 }, uSpd: { value: 1 } };
    const bokeh = this.bokehPts = new THREE.Points(bg, this.additive(dustVert, dustFrag, { ...this.U, ...this.bokehU }));
    bokeh.frustumCulled = false;
    bokeh.renderOrder = 4;
    this.scene.add(bokeh);
  }

  setupArcs() {
    this.arcs = [];
    this.dots = [];
    const glow = this.glowTex();
    // The centres are fixed to screen corners, not world-space positions.
    // Complete rings extend beyond the viewport, so they remain curved circles
    // instead of rotating a short arc in and out of view.
    this.cornerRings = [new THREE.Group(), new THREE.Group()];
    this.camera.add(...this.cornerRings);
    const mk = (group, R, opts) => {
      const geo = new THREE.RingGeometry(R - 0.12, R + 0.12, 320, 1);
      const mat = this.additive(arcVert, arcFrag, {
        uProg: { value: 0 },
        uR: { value: R },
        uStart: { value: 0 },
        uLen: { value: Math.PI * 2 },
        uDash: { value: opts.dash || 0 },
        uAlpha: { value: opts.alpha ?? 1 },
        uW: { value: opts.w ?? 0.006 },
        uTime: this.U.uTime,
      }, { depthTest: false });
      const m = new THREE.Mesh(geo, mat);
      m.renderOrder = 3;
      group.add(m);
      this.arcs.push({ mesh: m, t0: 0, t1: 1.5, speed: opts.speed, a0: opts.alpha ?? 1 });
      return { group, R, speed: opts.speed };
    };
    const node = (arc, angle, size, t0) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glow, color: new THREE.Color(2.4, 1.6, 0.7), blending: THREE.AdditiveBlending,
        depthWrite: false, depthTest: false, transparent: true,
      }));
      s.renderOrder = 6;
      arc.group.add(s);
      this.dots.push({ s, size, t0, R: arc.R, angle, speed: arc.speed });
    };
    const makeCorner = (group, direction) => {
      const inner = mk(group, 1.24, { speed: 0.25 * direction, w: 0.0035, alpha: 0.72 });
      mk(group, 1.43, { speed: -0.19 * direction, dash: 145, w: 0.0025, alpha: 0.48 });
      const outer = mk(group, 1.58, { speed: 0.16 * direction, w: 0.003, alpha: 0.58 });
      node(inner, 0.75, 0.075, 0.5);
      node(outer, 2.2, 0.065, 0.7);
    };
    makeCorner(this.cornerRings[0], 1);
    makeCorner(this.cornerRings[1], -1);
  }

  setupLogo() {
    const LG = this.cfg.layers.logo;
    // сначала строим геометрию: при ошибке SVG состояние сцены не затрагивается
    const parts = buildLogoParts({ svg: LG.svg, size: LG.size, depth: LG.depth, bevel: LG.bevel });
    this.logoRoot = new THREE.Group();
    const inner = (this.logoInner = new THREE.Group());
    this.logoRoot.add(inner);
    this.logoParts = parts;

    const bb = new THREE.Box3();
    this.logoParts.forEach((p) => {
      p.geometry.computeBoundingBox();
      bb.union(p.geometry.boundingBox);
    });
    const C = bb.getCenter(new THREE.Vector3());
    this.logoCenter = C;
    this.logoRoot.position.set(C.x, C.y, 0);
    inner.position.set(-C.x, -C.y, 0);
    const pr = rng(33);
    this.logoRand = this.logoParts.map(() => pr());

    // световая обводка контура: один материал на все детали, фазы разбросаны, чтобы штрих «пересекал» эмблему
    this.traceU = { uHead: { value: 0 }, uAmp: { value: 0 }, uHead2: { value: 0 }, uAmp2: { value: 0 }, uBase: { value: 0 } };
    const traceMat = new THREE.ShaderMaterial({
      vertexShader: traceVert, fragmentShader: traceFrag, uniforms: this.traceU,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    // каждая деталь вращается вокруг собственного центра — это нужно пресетам анимации
    this.logoMeshes = this.logoParts.map((p, pi) => {
      const mat = makeGold({ gradBot: -0.1, gradTop: 3.15, env: 1.6 });
      const u = mat.userData.u;
      u.uCenter.value.set(0, 0, 0);
      u.uDir.value.copy(p.dir);
      u.uExtent.value = Math.abs(p.dir.x) > 0.5 ? p.size.x : p.size.y;
      const geo = p.geometry.clone();
      geo.translate(-p.center.x, -p.center.y, -p.center.z);
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(p.center);
      m.position.z += p.z;
      m.visible = false;
      inner.add(m);
      const tr = this.makeTrace(p, traceMat, pi);
      if (tr) m.add(tr);
      return m;
    });

    // swarm sampled from the geometry surface
    const N = 18000;
    const r = rng(21);
    const areas = this.logoParts.map((p) => p.size.x * p.size.y + 0.05);
    const sum = areas.reduce((a, b) => a + b, 0);
    const tgt: number[] = [], st: number[] = [], rr: number[] = [];
    const tmp = new THREE.Vector3(), nrm = new THREE.Vector3();
    this.logoParts.forEach((p, i) => {
      const n = Math.round((N * areas[i]) / sum);
      const s = new MeshSurfaceSampler(new THREE.Mesh(p.geometry)).setRandomGenerator(r).build();
      for (let k = 0; k < n; k++) {
        s.sample(tmp, nrm);
        tgt.push(tmp.x, tmp.y, tmp.z + p.z);
        const a = r() * Math.PI * 2;
        const R = 4 + Math.pow(r(), 0.7) * 9;
        st.push(C.x + Math.cos(a) * R * 1.25, C.y + Math.sin(a) * R * 0.8, (r() - 0.5) * 9);
        rr.push(r(), (r() - 0.5) * 2, 0.025 + Math.pow(r(), 2.5) * 0.05, r());
      }
    });
    this.swarmTargets = tgt;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(tgt, 3));
    g.setAttribute('aTarget', new THREE.Float32BufferAttribute(tgt, 3));
    g.setAttribute('aStart', new THREE.Float32BufferAttribute(st, 3));
    g.setAttribute('aR', new THREE.Float32BufferAttribute(rr, 4));
    this.swarmU = {
      uAssemble: { value: 0 },
      uFade: { value: 1 },
      uDens: { value: 1 },
      uCenter: { value: new THREE.Vector2(C.x, C.y) },
    };
    const sw = new THREE.Points(g, this.additive(swarmVert, swarmFrag, { ...this.U, ...this.swarmU }));
    sw.frustumCulled = false;
    sw.renderOrder = 7;
    inner.add(sw);

    // burst sparks from the logo at the flash moment
    const sp = this.makeSparks();
    const rs = rng(55);
    const cnt = tgt.length ? LG.sparkCount : 0;
    for (let k = 0; k < cnt; k++) {
      const i = Math.floor(rs() * (tgt.length / 3));
      const x = tgt[i * 3], y = tgt[i * 3 + 1], z = tgt[i * 3 + 2];
      const dx = x - C.x, dy = y - C.y;
      const L = Math.hypot(dx, dy) + 0.2;
      const sp1 = 0.8 + rs() * 3.2;
      sp.add(x, y, z + 0.1, (dx / L) * sp1 + (rs() - 0.5) * 0.8, (dy / L) * sp1 + (rs() - 0.5) * 0.8, (rs() - 0.2) * 1.8, 4.5 + rs() * 0.5, 0.9 + rs() * 1.8, 0.03 + rs() * rs() * 0.09);
    }
    sp.build(inner);

    this.scene.add(this.logoRoot);
  }

  /** Линии контуров детали с параметром вдоль периметра (aT) — для светящейся обводки. */
  makeTrace(p, mat, pi, byX = false) {
    const pos: number[] = [], t: number[] = [];
    p.rings.forEach((ring, ri) => {
      const n = ring.length;
      if (n < 3) return;
      const cum = [0];
      for (let i = 1; i <= n; i++) cum.push(cum[i - 1] + ring[i % n].distanceTo(ring[i - 1]));
      const len = cum[n] || 1;
      const ph = byX ? 0 : ((pi * 0.37 + ri * 0.21) % 1) * 0.85;
      for (let i = 0; i < n; i++) {
        const a = ring[i], b = ring[(i + 1) % n];
        pos.push(a.x - p.center.x, a.y - p.center.y, a.z - p.center.z, b.x - p.center.x, b.y - p.center.y, b.z - p.center.z);
        if (byX) t.push((a.x + 9) / 18, (b.x + 9) / 18); // положение вдоль названия — в той же шкале, что и бегущий луч
        else t.push(cum[i] / len + ph, cum[i + 1] / len + ph);
      }
    });
    if (!pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aT', new THREE.Float32BufferAttribute(t, 1));
    const ls = new THREE.LineSegments(g, mat);
    ls.frustumCulled = false;
    ls.renderOrder = 8;
    return ls;
  }

  /** Циркуль «вычерчивает» дуги вокруг эмблемы: светящаяся головка бежит по окружности и оставляет тонкий след. */
  setupCompassRings() {
    const glow = this.glowTex();
    const d2r = Math.PI / 180;
    const root = new THREE.Group();
    this.compass = [
      { R: 2.08, w: 0.0075, alpha: 1.0, dash: 0, t0: 5.0, t1: 6.9, mirror: 1 },
      { R: 2.3, w: 0.005, alpha: 0.75, dash: 120, t0: 5.3, t1: 7.3, mirror: -1 },
    ].map((d) => {
      const mat = this.additive(arcVert, arcFrag, {
        uProg: { value: 0 }, uR: { value: d.R }, uStart: { value: -15 * d2r }, uLen: { value: 210 * d2r },
        uDash: { value: d.dash }, uAlpha: { value: d.alpha }, uW: { value: d.w }, uTime: this.U.uTime,
      }, { depthTest: false, side: THREE.DoubleSide });
      const m = new THREE.Mesh(new THREE.RingGeometry(d.R - 0.12, d.R + 0.12, 360, 1), mat);
      m.renderOrder = 3;
      m.scale.x = d.mirror;
      m.position.z = -0.15;
      m.visible = false;
      root.add(m);
      const head = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glow, color: new THREE.Color(2.6, 1.8, 0.8), blending: THREE.AdditiveBlending,
        depthWrite: false, depthTest: false, transparent: true,
      }));
      head.renderOrder = 6;
      head.visible = false;
      root.add(head);
      return { m, head, ...d, a0: -15 * d2r, len: 210 * d2r };
    });
    if (this.compassRoot) this.scene.remove(this.compassRoot);
    this.compassRoot = root;
    this.scene.add(root);
  }

  makeSparks() {
    const pos: number[] = [], vel: number[] = [], life: number[] = [], size: number[] = [];
    const self = this;
    return {
      add(x, y, z, vx, vy, vz, birth, lf, sz) {
        pos.push(x, y, z); vel.push(vx, vy, vz); life.push(birth, lf); size.push(sz);
      },
      build(parent) {
        if (!pos.length) return null;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('aVel', new THREE.Float32BufferAttribute(vel, 3));
        g.setAttribute('aLife', new THREE.Float32BufferAttribute(life, 2));
        g.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 1));
        const pts = new THREE.Points(g, self.additive(sparkVert, sparkFrag, { ...self.U }));
        pts.frustumCulled = false;
        pts.renderOrder = 8;
        parent.add(pts);
        return pts;
      },
    };
  }

  async setupTitle() {
    const T = this.cfg.layers.title;
    const F = fontOf(T.font);
    const { letters, capH } = await buildTitle(F.urls, T.text, T.width, { tracking: T.tracking, depth: T.depth, bevel: T.bevel });
    if (this.disposed) return;
    const root = new THREE.Group();
    const group = new THREE.Group();
    const baseY = -0.66 - capH / 2;
    group.position.set(0, baseY, 0);
    root.add(group);

    // очерёдность появления букв
    const n = letters.length;
    const rnd = rng(77);
    const byCenter = [...Array(n).keys()].sort((a, b) => Math.abs(a - (n - 1) / 2) - Math.abs(b - (n - 1) / 2) || a - b);
    const rank = new Array(n);
    if (T.order === 'rtl') for (let i = 0; i < n; i++) rank[i] = n - 1 - i;
    else if (T.order === 'center') byCenter.forEach((idx, j) => (rank[idx] = j));
    else if (T.order === 'edges') byCenter.forEach((idx, j) => (rank[idx] = n - 1 - j));
    else if (T.order === 'random') {
      const sh = [...Array(n).keys()];
      for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [sh[i], sh[j]] = [sh[j], sh[i]]; }
      sh.forEach((idx, j) => (rank[idx] = j));
    } else for (let i = 0; i < n; i++) rank[i] = i;

    const sp = this.makeSparks();
    const r = rng(99);
    const edgeU = { uHead: { value: -1 }, uAmp: { value: 0 }, uHead2: { value: 0 }, uAmp2: { value: 0 }, uBase: { value: 0 } };
    const edgeMat = new THREE.ShaderMaterial({
      vertexShader: traceVert, fragmentShader: traceFrag, uniforms: edgeU,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const meshes = letters.map((L, i) => {
      L.geometry.translate(-L.center.x, -L.center.y, -L.center.z);
      const mat = makeGold({ gradBot: -1.15, gradTop: -0.1, env: T.env, roughness: T.roughness });
      const u = mat.userData.u;
      u.uCenter.value.set(0, 0, 0);
      u.uDir.value.set(0, -1, 0);
      u.uExtent.value = L.size.y * 1.05;
      const m = new THREE.Mesh(L.geometry, mat);
      m.position.copy(L.center);
      m.visible = false;
      group.add(m);
      const edge = this.makeTrace({ rings: L.rings || [], center: L.center }, edgeMat, i, true);
      if (edge) m.add(edge);
      const start = T.start + rank[i] * T.stagger;
      const land = start + T.duration * 0.78;
      for (let k = 0; k < T.sparkCount; k++) {
        sp.add(L.center.x + (r() - 0.5) * L.size.x, L.center.y + baseY + (r() - 0.5) * L.size.y, 0.15, (r() - 0.5) * 1.8, 0.2 + r() * 1.8, (r() - 0.3) * 1.2, land, 0.7 + r() * 1.3, 0.02 + r() * r() * 0.07);
      }
      return { mesh: m, start, land, L, i, seed: i % 2 ? 1 : -1, r: rnd() };
    });
    // final-sweep sparks along the title
    const half = Math.max(1, T.width / 2);
    for (let k = 0; k < (T.sparkCount > 0 ? 420 : 0); k++) {
      const x = (r() - 0.5) * 2 * half;
      const t0 = TL.sweep2 + ((x + 9) / 18) * 1.7 * 0.9;
      sp.add(x, -0.2 + (r() - 0.5) * 1.1, 0.2, (r() - 0.5) * 0.8, 0.3 + r() * 1.3, (r() - 0.3) * 0.8, t0, 0.8 + r() * 1.4, 0.02 + r() * r() * 0.06);
    }
    sp.build(root);

    // атомарная подмена: кадр никогда не видит «полусобранное» название
    if (this.titleRoot) { this.scene.remove(this.titleRoot); this.disposeTree(this.titleRoot); }
    this.titleRoot = root;
    this.titleGroup = group;
    this.titleBaseY = baseY;
    this.titleEdgeU = edgeU;
    this.letterMeshes = meshes;
    this.scene.add(root);
  }

  disposeTree(obj) {
    obj.traverse((o) => {
      if (o.geometry && !o.isSprite) o.geometry.dispose();
      const list = Array.isArray(o.material) ? o.material : [o.material];
      list.filter(Boolean).forEach((m) => {
        Object.values(m.uniforms || {}).forEach((u) => { if (u?.value?.isTexture && u.value !== this._glow) u.value.dispose(); });
        m.dispose();
      });
    });
  }

  makeTextTexture(text, px, trackEm, fontDef) {
    const cvs = document.createElement('canvas');
    const ctx = cvs.getContext('2d');
    const font = `${fontDef.weight} ${px}px "${fontDef.family}"`;
    ctx.font = font;
    const ws = [...text].map((c) => ctx.measureText(c).width);
    const track = px * trackEm;
    const total = Math.max(1, ws.reduce((a, b) => a + b, 0) + track * (ws.length - 1));
    const pad = px * 0.7;
    cvs.width = Math.ceil(total + pad * 2);
    cvs.height = Math.ceil(px * 1.7);
    const c2 = cvs.getContext('2d');
    c2.font = font;
    c2.fillStyle = '#fff';
    c2.textBaseline = 'alphabetic';
    let x = pad;
    [...text].forEach((ch, i) => {
      c2.fillText(ch, x, px * 1.18);
      x += ws[i] + track;
    });
    const tex = new THREE.CanvasTexture(cvs);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    return { tex, w: cvs.width, h: cvs.height, total, pad };
  }

  textPlane(text, px, trackEm, worldTextWidth, yWorld, bright, fontDef) {
    const { tex, w, h, total } = this.makeTextTexture(text, px, trackEm, fontDef);
    const k = worldTextWidth / total;
    const mat = new THREE.ShaderMaterial({
      vertexShader: textVert,
      fragmentShader: textFrag,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uMap: { value: tex },
        uReveal: { value: 0 },
        uTime: this.U.uTime,
        uShine: { value: 0.5 },
        uBright: { value: bright },
        uColA: { value: new THREE.Color(0.8, 0.5, 0.18) },
        uColB: { value: new THREE.Color(1, 0.86, 0.55) },
      },
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w * k, h * k), mat);
    // baseline sits at 1.18 / 1.7 of canvas height; shift so caps are centred on yWorld
    const capCenter = (1.18 - 0.35) / 1.7; // approx cap-centre from the top
    m.position.set(0, yWorld + (capCenter - 0.5) * h * k, 0.1);
    m.userData.baseY = m.position.y;
    m.renderOrder = 9;
    m.visible = false;
    this.scene.add(m);
    return m;
  }

  buildText(kind) {
    const L = this.cfg.layers[kind === 'sub' ? 'subtitle' : 'date'];
    const px = kind === 'sub' ? 120 : 100;
    const yW = kind === 'sub' ? P(0, 537).y : P(0, 597).y;
    const m = this.textPlane(L.text || ' ', px, L.tracking, L.width, yW, L.brightness, fontOf(L.font));
    const old = this[kind];
    if (old) { this.scene.remove(old); this.disposeTree(old); }
    this[kind] = m;
  }

  setupSubtitle() {
    this.buildText('sub');
    this.buildText('date');
  }

  setupDividers() {
    // Keep only the bars in a separate scene; diamonds remain part of the regular HDR layers.
    this.dividerScene = new THREE.Scene();
    const line = (cx, y, w, dir, h = 0.16) => {
      const mat = new THREE.ShaderMaterial({
        vertexShader: lineVert,
        fragmentShader: lineFrag,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uProg: { value: 0 }, uDir: { value: dir }, uAlpha: { value: 1 },
          uCore: { value: 0.1 }, uGlow: { value: 0.14 }, uHighlight: { value: 0 },
          uColor: { value: new THREE.Color('#ffb95e') },
          uHotColor: { value: new THREE.Color('#fff1c9') },
        },
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      m.position.set(cx, y, 0.05);
      m.userData.baseY = y;
      m.userData.line = { inner: cx + (dir * w) / 2, w, dir };
      m.renderOrder = 9;
      m.visible = false;
      this.dividerScene.add(m);
      return m;
    };
    const diamond = (x, y, s) => {
      const sh = new THREE.Shape();
      sh.moveTo(0, s); sh.lineTo(s, 0); sh.lineTo(0, -s); sh.lineTo(-s, 0); sh.closePath();
      const hole = new THREE.Path();
      const k = s * 0.62;
      hole.moveTo(0, k); hole.lineTo(-k, 0); hole.lineTo(0, -k); hole.lineTo(k, 0); hole.closePath();
      sh.holes.push(hole);
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.7, 0.8), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const m = new THREE.Mesh(new THREE.ShapeGeometry(sh), mat);
      m.position.set(x, y, 0.08);
      m.userData.baseY = y;
      m.renderOrder = 10;
      m.visible = false;
      this.scene.add(m);
      return m;
    };
    const y1 = P(0, 488).y, y2 = P(0, 630).y;
    const x = (px) => P(px, 0).x;
    this.div1 = {
      L: line((x(253) + x(610)) / 2, y1, x(610) - x(253), 1),
      R: line((x(665) + x(1025)) / 2, y1, x(1025) - x(665), -1),
      d: diamond(x(638), y1, 0.1),
    };
    this.div2 = {
      L: line((x(515) + x(620)) / 2, y2, x(620) - x(515), 1, 0.14),
      R: line((x(656) + x(765)) / 2, y2, x(765) - x(656), -1, 0.14),
      d: diamond(x(638), y2, 0.075),
    };
  }

  glowTex() {
    if (this._glow) return this._glow;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.12, 'rgba(255,236,190,0.75)');
    gr.addColorStop(0.4, 'rgba(255,170,70,0.16)');
    gr.addColorStop(1, 'rgba(255,140,40,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    this._glow = new THREE.CanvasTexture(c);
    this._glow.colorSpace = THREE.SRGBColorSpace;
    return this._glow;
  }

  flareTex() {
    const W = 512, H = 64;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const img = g.createImageData(W, H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const u = (x / (W - 1) - 0.5) * 2, v = (y / (H - 1) - 0.5) * 2;
        let a = Math.pow(1 - Math.abs(u), 2.4) * Math.exp(-v * v * 55) + 0.35 * Math.exp(-(u * u * 25 + v * v * 6));
        a = Math.min(1, a);
        const i = (y * W + x) * 4;
        img.data[i] = 255; img.data[i + 1] = 226; img.data[i + 2] = 170; img.data[i + 3] = a * 255;
      }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  starTex() {
    const S = 256;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const u = (x / (S - 1) - 0.5) * 2, v = (y / (S - 1) - 0.5) * 2;
        const r = Math.hypot(u, v);
        const arm = (a, b) => Math.exp(-b * b * 900) * Math.pow(Math.max(0, 1 - Math.abs(a)), 3.2);
        const cross = arm(u, v) + arm(v, u);
        const d = Math.SQRT1_2;
        const diag = 0.35 * (arm((u + v) * d, (u - v) * d) + arm((u - v) * d, (u + v) * d));
        const core = Math.exp(-r * r * 60) * 1.2;
        const a = Math.min(1, cross + diag + core);
        const i = (y * S + x) * 4;
        img.data[i] = 255; img.data[i + 1] = 238; img.data[i + 2] = 200; img.data[i + 3] = a * 255;
      }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  setupFX() {
    const flareT = this.flareTex();
    const mkFlare = (x, y, sx, sy) => {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: flareT, color: new THREE.Color(2.2, 1.5, 0.7), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 })
      );
      s.position.set(x, y, 0.4);
      s.scale.set(sx, sy, 1);
      s.renderOrder = 11;
      this.scene.add(s);
      return { s, sx, sy };
    };
    const lc = this.logoCenter;
    this.flareLogo = mkFlare(0, lc.y - 0.2, 15, 1.4);
    this.flareTitle = mkFlare(0, -0.66, 18, 1.0);
    this.flareSub = mkFlare(0, P(0, 537).y, 10, 0.5);

    // звёздные блики на золоте: четырёхлучевые «искры» в точках эмблемы и на кромках букв
    const starT = this.starTex();
    this.glints = [];
    const addGlint = (x, y, size, phase) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: starT, color: new THREE.Color(2.6, 1.9, 1.0), blending: THREE.AdditiveBlending,
        depthWrite: false, depthTest: false, transparent: true, opacity: 0,
      }));
      s.position.set(x, y, 0.5);
      s.renderOrder = 13;
      s.visible = false;
      this.scene.add(s);
      this.glints.push({ s, x, size, phase });
    };
    [[545, 285, 1.5], [748, 275, 1.3], [640, 148, 1.2], [602, 352, 1.0], [694, 352, 1.0], [676, 190, 0.9]].forEach(([px, py, k], i) =>
      addGlint(P(px, py).x, P(px, py).y, k, i * 1.7));
    [0, 3, 5, 8, 11, 14].forEach((li, i) => {
      const L = this.letterMeshes[Math.min(li, this.letterMeshes.length - 1)].L;
      addGlint(L.center.x - L.size.x * 0.28, this.titleBaseY + L.center.y + L.size.y * 0.5, 1.15 + (i % 2) * 0.25, 3 + i * 1.3);
    });

    const glow = this.glowTex();
    this.coreGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glow, color: new THREE.Color(2.5, 1.6, 0.6), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 })
    );
    this.coreGlow.position.set(0, lc.y, -0.3);
    this.coreGlow.renderOrder = 2;
    this.scene.add(this.coreGlow);

    const wave = (w, h) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        this.additive(lineVert, waveFrag, {
          uR: { value: 0 }, uPrevR: { value: 0 }, uA: { value: 0 }, uW: { value: 0.05 },
          // Компромисс между «круглым» и «широким» кольцом: полная компенсация пропорций
          // (w/h) гнала волну за край кадра за пару кадров, без неё кромка по горизонтали
          // выходила в 2.9 раза тоньше и мигала. Корень из пропорций уравнивает толщину
          // по осям примерно вдвое, сохраняя прежний силуэт.
          uAspect: { value: Math.sqrt(w > h ? w / h : h / w) },
        })
      );
      m.renderOrder = 12;
      m.visible = false;
      this.scene.add(m);
      return m;
    };
    this.waveLogo = wave(34, 34);
    this.waveLogo.position.set(0, lc.y, 0.3);
    this.waveTitle = wave(26, 9);
    this.waveTitle.position.set(0, -0.66, 0.3);
  }

  setupPost() {
    // Start small: applySize allocates the actual preview/recording dimensions.
    // MSAA ×4 в HDR-буфере: без него кромки эмблемы и букв ступенчатые. На GPU без поддержки — откат на 0.
    const msaa = Math.min(4, this.renderer.capabilities.maxSamples || 0);
    const rt = new THREE.WebGLRenderTarget(320, 180, { type: THREE.HalfFloatType, samples: msaa >= 2 ? msaa : 0 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(320, 180), 0.6, 0.7, 1.0);
    this.composer.addPass(this.bloom);
    this.streak = new StreakPass();
    this.composer.addPass(this.streak);
    this.composer.addPass(new OutputPass());
    this.fp = new ShaderPass({ ...finalPass, uniforms: THREE.UniformsUtils.clone(finalPass.uniforms) });
    this.composer.addPass(this.fp);
    // Dividers are composited last, after the animated HDR and film-grain passes.
    this.dividerOverlay = new DividerOverlayPass(this.dividerScene, this.camera);
    this.composer.addPass(this.dividerOverlay);
  }

  /* ------------------------------------------------------------ sizing */
  applySize(w?: number, h?: number) {
    const pr = Math.min(window.devicePixelRatio || 1, 2);
    let W = w ?? Math.round(this.host.clientWidth * pr);
    let H = h ?? Math.round(this.host.clientHeight * pr);
    const cap = Math.min(this.qualityCap, this.cfg.general.quality);
    if (!this.forced && W > cap) { H = Math.round((H * cap) / W); W = cap; }
    W = Math.max(W, 320); H = Math.max(H, 180);
    // Пересоздание render target'ов стоит кадров: без этой проверки каждый тик ползунка
    // (setConfig → applySize) и каждое понижение качества переаллоцировали весь композер,
    // а на слабом GPU это заметные «провалы в чёрное».
    if (W === this.pxW && H === this.pxH && this._sized) return;
    this._sized = true;
    this.pxW = W; this.pxH = H;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(W, H, false);
    this.composer.setPixelRatio(1);
    this.composer.setSize(W, H);
    this.camera.aspect = W / H;
    this.camera.updateProjectionMatrix();
    this.U.uScale.value = H / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    this.bgMat.uniforms.uAspect.value = W / H;
    this.fp.uniforms.uAspect.value = W / H;
    this.fp.uniforms.uRes.value = [W, H];
    this.fp.uniforms.uAspect.value = W / H;
    this.bloom.resolution.set(W, H);
  }

  /* ------------------------------------------------------------ config */
  get duration() { return totalDuration(this.cfg); }

  sigOf(c: Config) {
    const L = c.layers, pick = (o, ks) => JSON.stringify(ks.map((k) => o[k]));
    return {
      logo: pick(L.logo, ['svg', 'size', 'depth', 'bevel', 'sparkCount']),
      title: pick(L.title, ['text', 'font', 'width', 'tracking', 'depth', 'bevel', 'start', 'stagger', 'duration', 'order', 'sparkCount']),
      sub: pick(L.subtitle, ['text', 'font', 'width', 'tracking']),
      date: pick(L.date, ['text', 'font', 'width', 'tracking']),
    };
  }

  /**
   * Порядок слоёв из общей панели студии (от дальнего к ближнему).
   * `null` возвращает собственный порядок лаборатории.
   */
  setDepthOrder(order: string[] | null) {
    this.sharedDepthOrder = Array.isArray(order) ? order : null;
    if (this.scene) this.applyOrder();
  }

  /** Применить новую конфигурацию. Параметры «на лету» подхватываются в update(); структурные — пересобирают слой. */
  setConfig(cfg: Config) {
    this.cfg = cfg;
    if (!this.scene || !this.sigs) return;
    this.applyOrder();
    if (!this.forced) this.applySize();
    const sig = this.sigOf(cfg);
    for (const k of Object.keys(sig)) if (sig[k] !== this.sigs[k]) this.pending.add(k);
    if (!this.pending.size) return;
    clearTimeout(this.rebuildTimer);
    this.rebuildTimer = setTimeout(() => this.runRebuild(), 280);
  }

  async runRebuild() {
    if (this.disposed) return;
    if (this.forced && !this.embedded) { this.rebuildTimer = setTimeout(() => this.runRebuild(), 500); return; }
    const list = [...this.pending];
    this.pending.clear();
    const L = this.cfg.layers;
    const sig = this.sigOf(this.cfg);
    try {
      await Promise.all([loadFontFace(L.title.font, L.title.text), loadFontFace(L.subtitle.font, L.subtitle.text), loadFontFace(L.date.font, L.date.text)]);
      if (list.includes('logo')) {
        const oldLogo = this.logoRoot;
        this.setupLogo();
        this.setupCompassRings();
        this.scene.remove(oldLogo);
        this.disposeTree(oldLogo);
      }
      if (list.includes('title')) await this.setupTitle();
      if (list.includes('sub')) this.buildText('sub');
      if (list.includes('date')) this.buildText('date');
      this.sigs = sig;
      this.applyOrder();
      this.onWarn?.(null);
    } catch (e) {
      console.error(e);
      // не пытаемся пересобирать то же самое снова, пока пользователь не изменит параметры
      this.sigs = sig;
      this.onWarn?.(e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * Порядок слоёв: чем выше в списке, тем ближе к зрителю (renderOrder для
   * светящихся, глубина для золота).
   *
   * Список приходит из левой панели «Слои»: лаборатория берёт общий порядок
   * сцены (`depthOrder`) и раскладывает его на свои слои. Пока ручной порядок
   * выключен, используется `cfg.order` — вид ролика не меняется.
   */
  applyOrder() {
    const shared = this.sharedDepthOrder;
    const order = shared?.length ? shared : this.cfg.order;
    const N = order.length;
    const fromPanel = Boolean(shared?.length);
    // Без общей панели полосы остаются прежними (10, 20, 30 … от дальнего).
    // С общей панелью база 40 держит лабораторию выше кадра-хоста, а ближний
    // слой получает наибольший renderOrder: в лаборатории индекс 0 — самый
    // близкий к зрителю.
    const band = (id) => (fromPanel ? 40 : 10) + (N - 1 - order.indexOf(id)) * 10;
    const setRO = (list, id) => list.filter(Boolean).forEach((o, j) => { o.renderOrder = band(id) + Math.min(j, 9); });
    setRO([...this.arcs.map((a) => a.mesh), ...this.dots.map((d) => d.s)], 'rings');
    setRO(this.logoInner.children.filter((o) => o.isPoints), 'logo');
    setRO([...this.compass.map((c) => c.m), ...this.compass.map((c) => c.head)], 'compass');
    setRO([this.bokehPts, this.dustPts], 'particles');
    setRO(this.titleRoot.children.filter((o) => o.isPoints), 'title');
    setRO([this.sub], 'subtitle');
    setRO([this.date], 'date');
    setRO([this.div1.L, this.div1.R, this.div1.d, this.div2.L, this.div2.R, this.div2.d], 'dividers');
    setRO([this.coreGlow, ...this.glints.map((g) => g.s), this.flareLogo.s, this.flareTitle.s, this.flareSub.s, this.waveLogo, this.waveTitle], 'fx');
    const il = order.indexOf('logo'), it = order.indexOf('title');
    this.stackZ = { logo: il < it ? 0.3 : 0, title: it < il ? 0.3 : 0 };
  }

  /* ------------------------------------------------------------ playback */
  play(from = 0) {
    // повтор с начала: пролог не должен снова «моргать» на секунду
    if (from <= 0.001) this.loopRound = this._playedOnce;
    this._playedOnce = true;
    this.startAt = performance.now() - from * 1000;
    this.anchor = from;
    this.anchorPending = true;
    this.playing = true;
    this.freeze = null;
  }

  /** Перемотка: продолжает воспроизведение с позиции `time`. */
  seek(time: number) {
    this.play(Math.max(0, Math.min(this.duration, time)));
  }

  /** Offline rendering: one explicitly timestamped canvas sample per frame. */
  async record(onProgress?: (progress: number) => void): Promise<Blob> {
    if (this.disposed) throw new Error('Сцена закрыта');
    if (this.forced) throw new Error('Экспорт уже выполняется');
    if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
      throw new Error('Покадровый экспорт не поддерживается браузером. Попробуйте актуальный Chrome или Edge.');
    }
    this.forced = true;
    let cancelled = false;
    this.cancelRecording = () => { cancelled = true; };
    let output: Output | undefined;
    const previousTime = this.t;
    const previousFreeze = this.freeze;
    const wasPlaying = this.playing;
    const fps = this.cfg.general.fps;
    try {
      const EW = Math.round(this.cfg.general.width / 2) * 2, EH = Math.round((EW * 9) / 16 / 2) * 2;
      const options = { width: EW, height: EH, bitrate: this.cfg.general.bitrate * 1_000_000, frameRate: fps };
      const codec = await canEncodeVideo('avc', options) ? 'avc'
        : await canEncodeVideo('vp9', options) ? 'vp9'
        : await canEncodeVideo('vp8', options) ? 'vp8' : null;
      if (cancelled || this.disposed) throw new Error('Экспорт отменён');
      if (!codec) throw new Error(`Нет доступного кодировщика видео ${EW}×${EH}. Выберите меньшее разрешение или попробуйте Chrome/Edge.`);
      this.renderer.setAnimationLoop(null);
      this.applySize(EW, EH);
      const target = new BufferTarget();
      output = new Output({ format: codec === 'avc' ? new Mp4OutputFormat() : new WebMOutputFormat(), target });
      const source = new CanvasSource(this.renderer.domElement, { codec, bitrate: options.bitrate });
      output.addVideoTrack(source, { frameRate: fps });
      await output.start();
      const frames = Math.round(this.duration * fps);
      for (let i = 0; i < frames; i++) {
        if (cancelled || this.disposed) throw new Error('Экспорт отменён');
        this.t = i / fps;
        this.update(this.t);
        this.composer.render();
        await source.add(i / fps, 1 / fps, { keyFrame: i % (fps * 2) === 0 });
        if (i % 3 === 0) {
          onProgress?.((i + 1) / frames);
          // Give the browser an opportunity to paint the export progress.
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
      }
      if (cancelled || this.disposed) throw new Error('Экспорт отменён');
      onProgress?.(1);
      await output.finalize();
      if (cancelled || this.disposed) throw new Error('Экспорт отменён');
      if (!target.buffer) throw new Error('Не удалось создать видео');
      return new Blob([target.buffer], { type: codec === 'avc' ? 'video/mp4' : 'video/webm' });
    } catch (error) {
      if (output && output.state !== 'finalized' && output.state !== 'canceled') await output.cancel();
      throw error;
    } finally {
      this.cancelRecording = null;
      this.forced = false;
      if (!this.disposed) {
        this.t = previousTime;
        this.freeze = previousFreeze;
        this.playing = wasPlaying;
        this.startAt = performance.now() - previousTime * 1000;
        this.anchor = previousTime;
        this.anchorPending = true;
        this.applySize();
        this.renderer.setAnimationLoop(() => this.frame());
      }
    }
  }

  /** Если GPU не тянет — снижаем разрешение превью (экспорт всегда 1920×1080). */
  private adaptQuality() {
    const now = performance.now();
    const dt = now - this.perf.last;
    this.perf.last = now;
    if (this.forced || this.freeze !== null || dt <= 0) return;
    // visibilitychange переякоривает таймер при возврате из фоновой вкладки.
    // Значит, повторные паузы >250 мс — это медленный рендер, а не сон вкладки.
    if (dt > 250) {
      this.perf.n = 0; this.perf.sum = 0;
      if (++this.perf.slow >= 2) {
        const cap = Math.max(320, Math.floor((this.pxW * 0.75) / 64) * 64);
        if (cap < this.qualityCap) {
          this.qualityCap = cap;
          this.applySize();
        }
        this.perf.slow = 0;
      }
      return;
    }
    this.perf.slow = 0;
    this.perf.n++;
    if (this.perf.n <= 20) return; // компиляция шейдеров, прогрев
    this.perf.sum += dt;
    if (this.perf.n >= 80) {
      const avg = this.perf.sum / (this.perf.n - 20);
      if (avg > 27 && this.qualityCap > 960) {
        this.qualityCap = this.qualityCap > 1280 ? 1280 : 960;
        this.applySize();
      }
      this.perf.n = 0; this.perf.sum = 0;
    }
  }

  frame() {
    this.adaptQuality();
    const previousTime = this.t;
    let frameDelta = 1 / this.cfg.general.fps;
    if (this.freeze !== null) this.t = this.freeze;
    else if (this.playing) {
      // первый кадр после play/seek: якорим время, чтобы долгий кадр (загрузка/компиляция) не сдвигал таймлайн
      const firstFrame = this.anchorPending;
      if (firstFrame) { this.startAt = performance.now() - this.anchor * 1000; this.anchorPending = false; }
      this.t = (performance.now() - this.startAt) / 1000;
      if (!firstFrame && this.t > previousTime) frameDelta = this.t - previousTime;
    }
    // Зацикливание: в конце ролик гаснет (0.45 с), поэтому переход на новый круг не выглядит
    // как «камера ушла в черноту» — кадр уходит в чёрный плавно.
    const tail = this.duration;
    if (this.playing && this.freeze === null && this.cfg.general.loop && this.t > tail + 0.35) {
      this.play(0);
      this.t = 0;
      frameDelta = 1 / this.cfg.general.fps;
    }
    this.update(this.t, frameDelta);
    try {
      this.composer.render();
      this.renderFails = 0;
    } catch (e) {
      // Сбой одного прохода (потеря контекста, нехватка памяти на 4K) не должен «вешать»
      // чёрный кадр навсегда: считаем ошибки и сообщаем наружу, продолжая цикл.
      if (++this.renderFails <= 3) console.error('render failed', e);
      if (this.renderFails === 3) this.onWarn?.('Не удалось отрисовать кадр. Уменьшите разрешение превью в настройках.');
    }
    this.onFrame?.(this.t);
  }

  /* ------------------------------------------------------------ the timeline */
  warp(real: number) {
    const g = this.cfg.general;
    return real < g.impact ? real * (DESIGN_IMPACT / g.impact) : DESIGN_IMPACT + (real - g.impact) * g.speed;
  }

  update(real: number, frameDelta = 1 / this.cfg.general.fps) {
    const frameStep = Math.max(1 / this.cfg.general.fps, frameDelta);
    this.updateDesign(this.warp(real), real, frameStep);
  }

  setCol(c, hex) {
    if (c.__h !== hex) { c.set(hex); c.__h = hex; }
  }

  /** t — «проектное» время (удар всегда в 4.5 с), real — реальное время ролика. */
  updateDesign(t: number, real: number, frameDelta = 1 / this.cfg.general.fps) {
    const C = this.cfg, G = C.general, CM = C.camera, PO = C.post, LY = C.layers;
    const BG = LY.background, LG = LY.logo, CP = LY.compass, TT = LY.title, SB = LY.subtitle, DT = LY.date;
    const DV = LY.dividers, RG = LY.rings, PT = LY.particles, FX = LY.fx;
    const lt = (id: string) => t - LY[id].delay;
    const fxk = (v: number) => (FX.enabled ? v : 0);
    const d2r = Math.PI / 180;

    this.U.uTime.value = t;
    sharedGold.uTime.value = t;
    this.renderer.toneMappingExposure = PO.exposure;
    if (this.camera.fov !== CM.fov) {
      this.camera.fov = CM.fov;
      this.camera.updateProjectionMatrix();
      this.U.uScale.value = this.pxH / (2 * Math.tan((CM.fov * Math.PI) / 360));
    }

    // camera: a slow cinematic push with parallax
    const ck = easeInOutSine(seg(t, 0, 12.5));
    this.camera.position.set(
      (1 - ck) * CM.startX + Math.sin(t * 0.33) * 0.1 * CM.sway,
      (1 - ck) * CM.startY + Math.cos(t * 0.27) * 0.06 * CM.sway,
      CM.distance + (1 - ck) * CM.push
    );
    // удар в момент появления эмблемы: короткий «толчок» камеры и дрожь
    const punch = burst(t, 4.5, 0.045, 0.55);
    const shake = burst(t, 4.5, 0.02, 0.22) * CM.shake;
    // «замах»: кадр чуть отъезжает и темнеет перед ударом, затем резко бьёт вперёд
    const windup = easeInOutSine(seg(t, 3.85, 4.5)) * (t < 4.5 ? 1 : 0);
    this.camera.position.z += windup * CM.windup;
    this.camera.position.z -= punch * CM.punch;
    this.camera.position.x += Math.sin(t * 83) * 0.045 * shake;
    this.camera.position.y += Math.cos(t * 71) * 0.035 * shake;
    // Смещение композиции: камера целится выше или ниже центра, поэтому
    // эмблема и надписи уезжают в кадре вместе, а фон остаётся на месте
    // (он рисуется экранной плоскостью и смотрит только на позицию камеры).
    this.camera.lookAt(0, -G.compositionY, 0);
    this.camera.rotation.z += (1 - ck) * CM.roll + Math.sin(t * 59) * 0.004 * shake;
    this.bgMat.uniforms.uCam.value.set(this.camera.position.x * -0.25, this.camera.position.y * -0.25);

    // global fade-in.
    // Раньше он стартовал на 0.95 с, а линия-зажигание появлялась на 0.25 с: первые ~1.1 с
    // кадр был абсолютно чёрным (при зацикливании — «камера уходит в черноту» каждый круг).
    // Теперь пролог начинается сразу: короткое затемнение с тёплым «полом», чтобы кадр
    // никогда не был чистым чёрным, а повтор круга не показывал длинную чёрную паузу.
    const fadeIn = 0.3 + 0.7 * easeOutCubic(seg(t, 0, this.loopRound ? 0.4 : 1.0));
    const F = this.fp.uniforms;
    const dip = 0.3 * easeInOutSine(seg(t, 4.1, 4.48)) * (t < 4.5 ? 1 : 0);
    // в экспортируемом видео картинка уходит в чёрный вместе с финальным кадром;
    // в превью с зацикливанием — тоже, иначе круг обрывается резким чёрным кадром
    const dur = this.duration;
    // Экспорт — честный уход в чёрный; превью с зацикливанием — «провал в темень» до 12 %
    // и сразу новый круг: зритель не видит 0.4 с абсолютно чёрного экрана на каждом стыке.
    const fadeOutAt = this.forced && G.fadeOut ? dur : G.loop ? dur + 0.35 : -1;
    const fadeFloor = this.forced ? 0 : 0.12;
    const fadeOut = fadeOutAt > 0 ? 1 - (1 - fadeFloor) * easeInOutSine(seg(real, fadeOutAt - 0.35, fadeOutAt)) : 1;
    F.uFade.value = fadeIn * (1 - dip) * fadeOut;
    F.uTime.value = t;
    F.uVig.value = PO.vignette;
    F.uGrainK.value = PO.grain;
    F.uSat.value = PO.saturation;
    F.uCon.value = PO.contrast;
    F.uHue.value = PO.hue * d2r;
    F.uShadow.value = PO.shadowTint;

    // ПРОЛОГ: искра → линия света → «щель» раскрывается в cinemascope → удар раскрывает кадр целиком
    const ign = PO.ignition ? 1 : 0;
    // искра и линия стартуют практически с нулевого кадра: раньше до 0.25 с в кадре был
    // только чёрный (а при зацикливании это читалось как «камера ушла в черноту»)
    // «Искра уже горит на входе»: сдвигаем старт зажигания в минус, чтобы самый первый кадр
    // (t = 0) не был пустым чёрным — иначе на стыке кругов глаз ловит провал.
    const lineGrow = 1 - Math.pow(1 - seg(t, -0.35, 1.55), 4);
    F.uLine.value = lineGrow * 1.25 * ign;
    const spark = burst(t, -0.25, 0.35, 0.9);
    F.uLineI.value = (0.25 + 0.75 * easeOutCubic(seg(t, 0.2, 1.0)) + 0.5 * spark) * (1 - easeInOutSine(seg(t, 1.9, 3.1))) * ign;
    const so = PO.slitSize;
    const open1 = easeInOutCubic(seg(t, 1.05, 2.75)) * so;
    const open2 = (1 - Math.pow(1 - seg(t, 4.46, 5.2), 4)) * (0.62 - so);
    F.uOpen.value = !PO.slit ? 1 : t < 4.46 ? open1 : so + open2;
    // «щель» гасит кадр маской по вертикали: при тонкой щели (меньше 2.5 % высоты) кадр
    // превращался в чёрный экран с полоской. Плавно переводим маску в затемнение
    // и оставляем видимой больше строк — кадр читается даже в самом начале.
    F.uSlitMix.value = !PO.slit ? 0 : 1 - easeInOutSine(seg(so, 0.012, 0.045));
    F.uLineVisible.value = PO.ignition ? 1 : 0;
    // фокус-пулл: из мягкого боке в резкость, на ударе — короткий «вдох» расфокуса
    F.uBlur.value = (0.014 * (1 - easeInOutSine(seg(t, 1.1, 4.4))) + 0.0045 * burst(t, 4.5, 0.03, 0.18)) * PO.focus;
    // ударная волна и хроматика
    const shk = seg(t, 4.5, 6.4);
    F.uShock.value = easeOutCubic(shk) * 1.15;
    F.uShockAmp.value = (t < 4.5 ? 0 : Math.pow(1 - shk, 1.6)) * fxk(FX.shock);
    F.uCA.value = burst(t, 4.5, 0.04, 0.45) * 0.9 * PO.aberration;
    F.uPulse.value = burst(t, 4.5, 0.03, 0.2) * 0.05 * fxk(FX.flash);
    const lcx = this.logoCenter.x + LG.x, lcy = this.logoCenter.y + LG.y;
    const lp = this._v3.set(lcx, lcy, 0).project(this.camera);
    F.uShockC.value = [lp.x * 0.5 + 0.5, lp.y * 0.5 + 0.5];

    // environment drifts so reflections glide over the metal
    const envRot = Math.sin(t * 0.32) * 0.35 + t * 0.06;
    this.scene.environmentRotation.y = envRot;
    this.scene.environmentIntensity = 0.4 + 0.4 * easeOutCubic(seg(t, 3.8, 6.0));

    // background light
    const bu = this.bgMat.uniforms;
    this.bgMesh.visible = BG.enabled;
    const bt = lt('background');
    bu.uBeam.value = easeOutCubic(seg(bt, 0.4, 3.4)) * (0.92 + 0.08 * Math.sin(t * 0.7)) * (1 + 0.15 * burst(t, 4.5, 0.1, 0.8)) * BG.beam;
    bu.uRib.value = easeOutCubic(seg(bt, 1.0, 4.0)) * (0.9 + 0.1 * Math.sin(t * 0.9 + 1)) * BG.ribbons;
    bu.uGlow.value = easeOutCubic(seg(bt, 3.5, 6.5)) * BG.glow;
    bu.uFlash.value = (burst(t, 4.5, 0.06, 0.5) * 0.08 + burst(t, TL.sweep2, 0.3, 0.7) * 0.15) * fxk(FX.flash);
    bu.uFinal.value = easeOutCubic(seg(bt, 7.5, 10.5)) * BG.final;

    // particles
    const pt = lt('particles');
    this.dustPts.visible = this.bokehPts.visible = PT.enabled;
    this.dustU.uIn.value = easeOutCubic(seg(pt, 0.2, 2.5)) * PT.brightness;
    this.bokehU.uIn.value = easeOutCubic(seg(pt, 0.6, 3.5)) * PT.brightness;
    this.dustU.uDens.value = PT.dust;
    this.bokehU.uDens.value = PT.bokeh;
    this.dustU.uSizeK.value = this.bokehU.uSizeK.value = PT.size;
    this.dustU.uSpd.value = this.bokehU.uSpd.value = PT.speed;

    // Keep the ring centres at the viewport corners at every camera position.
    const cornerY = 10 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const cornerX = cornerY * this.camera.aspect;
    this.cornerRings[0].position.set(-cornerX, cornerY, -10);
    this.cornerRings[1].position.set(cornerX, -cornerY, -10);
    this.cornerRings.forEach((g) => { g.visible = RG.enabled; g.scale.setScalar(RG.scale); });

    // arcs
    const rt = lt('rings');
    this.arcs.forEach(({ mesh, t0, t1, speed, a0 }) => {
      mesh.rotation.z = t * speed * RG.speed;
      mesh.material.uniforms.uProg.value = easeInOutSine(seg(rt, t0, t1));
      mesh.material.uniforms.uAlpha.value = a0 * RG.opacity;
    });
    this.dots.forEach(({ s, size, t0, R, angle, speed }) => {
      const a = angle + t * speed * RG.speed;
      s.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
      const k = easeOutBack(seg(rt, t0, t0 + 0.7));
      const pulse = 1 + 0.25 * Math.sin(t * 2.4 + t0 * 5);
      const sc = Math.max(0, k) * size * pulse * (1 + burst(t, 4.55, 0.1, 0.6) * 0.8) * (RG.nodes ? RG.opacity : 0);
      s.scale.set(sc, sc, 1);
      s.visible = sc > 0.001;
    });

    // logo swarm assembly
    const gt = lt('logo');
    const isSwarm = LG.preset === 'swarm';
    this.swarmU.uAssemble.value = easeInOutSine(seg(gt, 1.6, 4.55));
    // на ударе рой кратко приглушаем (иначе 18 000 аддитивных точек выжигают силуэт) и быстрее растворяем
    this.swarmU.uFade.value = isSwarm ? easeOutCubic(seg(gt, 1.5, 2.4)) * (1 - 0.75 * burst(t, 4.5, 0.03, 0.22)) * (1 - easeInOutSine(seg(gt, 4.5, 4.95))) : 0;
    this.swarmU.uDens.value = LG.swarm;
    this.logoRoot.visible = LG.enabled;
    const rot = LG.tilt * (1 - easeInOutCubic(seg(gt, 1.4, 8.0)));
    this.logoRoot.rotation.y = rot + Math.sin(t * 0.5) * 0.015 * LG.float;
    this.logoRoot.rotation.x = Math.sin(t * 0.4) * 0.012 * LG.float;
    this.logoRoot.position.set(lcx, lcy + Math.sin(t * 0.7) * 0.025 * LG.float, this.stackZ.logo);
    this.logoRoot.scale.setScalar(LG.scale * (1 + 0.04 * (1 - easeOutCubic(seg(gt, 4.2, 8)))));

    const n = this.logoParts.length;
    const ease = EASE[LG.easing] || EASE.cubic;
    this.logoParts.forEach((p, i) => {
      const m = this.logoMeshes[i];
      const t0 = 4.5 - LG.lead + i * LG.stagger;
      const k = seg(gt, t0, t0 + LG.duration);
      const xf = logoXf(LG.preset, k, {
        vx: p.center.x - this.logoCenter.x, vy: p.center.y - this.logoCenter.y, i, n, r: this.logoRand[i],
        a: LG.intensity, ang: LG.angle * d2r, turns: LG.turns, ease,
      });
      m.position.set(p.center.x + xf.x, p.center.y + xf.y, p.center.z + p.z + xf.z);
      m.rotation.set(xf.rx, xf.ry, xf.rz);
      m.scale.setScalar(Math.max(1e-4, xf.s));
      const u = m.material.userData.u;
      u.uReveal.value = xf.reveal;
      m.visible = k > 0.0001;
      u.uFlash.value = (burst(t, 4.52, 0.05, 0.5) * 0.24 + burst(gt, t0 + LG.duration * 0.9, 0.05, 0.4) * 0.3) * LG.flash;
      this.setCol(u.uGD.value, LG.deep); this.setCol(u.uGM.value, LG.mid); this.setCol(u.uGT.value, LG.top);
      u.uGradY.value.set(-0.1 + LG.y, 3.15 + LG.y);
      m.material.roughness = LG.roughness;
      m.material.envMapIntensity = LG.env;
    });

    // световая обводка контура: первый круг сразу после удара, второй — вместе с финальным бликом
    const tp = seg(gt, 4.62, 7.4), tp2 = seg(t, TL.sweep2 + 0.1, TL.sweep2 + 1.9);
    this.traceU.uHead.value = easeInOutCubic(tp) * 1.6;
    this.traceU.uAmp.value = easeOutCubic(seg(gt, 4.62, 4.8)) * (1 - easeInOutSine(seg(gt, 6.6, 7.6))) * LG.flash * fxk(1);
    this.traceU.uHead2.value = easeInOutSine(tp2) * 1.3;
    this.traceU.uAmp2.value = Math.sin(Math.PI * tp2) * fxk(FX.sweep) * LG.flash;
    this.traceU.uBase.value = 0.05 * easeOutCubic(seg(gt, 5.2, 7.5)) * fxk(1);

    // дуги циркуля вокруг эмблемы (повторяют трансформацию эмблемы)
    const ct = lt('compass');
    this.compassRoot.visible = CP.enabled;
    this.compassRoot.position.copy(this.logoRoot.position);
    this.compassRoot.rotation.copy(this.logoRoot.rotation);
    this.compassRoot.scale.copy(this.logoRoot.scale);
    this.compass.forEach((c) => {
      const t1 = c.t0 + (c.t1 - c.t0) / CP.speed;
      const k = seg(ct, c.t0, t1);
      const e = easeInOutCubic(k);
      c.m.visible = k > 0;
      c.m.scale.set(c.mirror * CP.radius, CP.radius, 1);
      c.m.material.uniforms.uProg.value = e;
      c.m.material.uniforms.uW.value = c.w * CP.thickness;
      c.m.material.uniforms.uAlpha.value = c.alpha * CP.opacity * (1 - 0.45 * easeInOutSine(seg(ct, 7.6, 9.4)));
      const a = c.a0 + c.len * e;
      c.head.position.set(Math.cos(a) * c.R * c.mirror * CP.radius, Math.sin(a) * c.R * CP.radius, -0.1);
      const ping = burst(ct, t1, 0.05, 0.35);
      const hs = ((k > 0 && k < 1 ? 0.3 : 0) + ping * 0.6) * CP.head;
      c.head.scale.set(hs, hs, 1);
      c.head.visible = hs > 0.01;
    });

    // title letters
    const tt = lt('title');
    this.titleRoot.visible = TT.enabled;
    this.titleRoot.position.set(TT.x, TT.y + -0.66 * (1 - TT.scale), this.stackZ.title);
    this.titleRoot.scale.setScalar(TT.scale);
    const tease = EASE[TT.easing] || EASE.cubic;
    this.letterMeshes.forEach(({ mesh, start, land, L, seed, r }) => {
      const p = seg(tt, start, start + TT.duration);
      const xf = letterXf(TT.preset, p, { seed, r, a: TT.intensity, ease: tease });
      mesh.visible = p > 0;
      mesh.position.set(L.center.x + xf.x, L.center.y + xf.y, L.center.z + xf.z);
      mesh.rotation.set(xf.rx, xf.ry, xf.rz);
      mesh.scale.setScalar(Math.max(1e-4, xf.s));
      const u = mesh.material.userData.u;
      u.uReveal.value = xf.reveal;
      u.uFlash.value = burst(tt, land, 0.04, 0.38) * 1.1 * TT.flash;
      this.setCol(u.uGD.value, TT.deep); this.setCol(u.uGM.value, TT.mid); this.setCol(u.uGT.value, TT.top);
      u.uGradY.value.set(-1.15 + TT.y, -0.1 + TT.y);
      mesh.material.roughness = TT.roughness;
      mesh.material.envMapIntensity = TT.env;
    });
    const ts = TT.start - 5.75 + TT.delay; // сдвиг событий, привязанных к названию

    // sweeping light (title + final shimmer)
    const sw = this.sweepState(t - (TT.start - 5.75));
    const swAmt = sw.amt * fxk(FX.sweep);
    this.sweepLight.position.x = sw.x;
    this.sweepLight.intensity = swAmt * 58;
    sharedGold.uSweepX.value = sw.x;
    sharedGold.uSweepAmt.value = swAmt;
    // кромки букв вспыхивают, когда по ним пробегает луч
    this.titleEdgeU.uHead.value = (sw.x + 9) / 18;
    this.titleEdgeU.uAmp.value = swAmt * 0.9;
    this.titleEdgeU.uBase.value = 0.025 * easeOutCubic(seg(tt, TT.start + 1.6, TT.start + 3.2)) * fxk(1);

    // dividers
    const dt = lt('dividers');
    const d1 = DV.duration * DV.duration1;
    const d2 = DV.duration * DV.duration2;
    const placeLine = (m, dy, length) => {
      const ln = m.userData.line;
      m.scale.x = length;
      m.scale.y = DV.thickness;
      m.position.x = ln.inner - ln.dir * (ln.w * length) / 2;
      m.position.y = m.userData.baseY + dy;
    };
    const updateLinePair = (d, progress, alpha, dy, length) => {
      d.L.visible = d.R.visible = DV.enabled && alpha > 0 && progress > 0;
      [d.L, d.R].forEach((m) => {
        const u = m.material.uniforms;
        u.uProg.value = progress;
        u.uAlpha.value = DV.intensity * alpha;
        u.uCore.value = DV.core;
        u.uGlow.value = DV.glow;
        u.uHighlight.value = DV.highlight;
        this.setCol(u.uColor.value, DV.color);
        this.setCol(u.uHotColor.value, DV.hotColor);
        placeLine(m, dy, DV.width * length);
      });
    };
    const l1 = easeInOutCubic(seg(dt, DV.start1, DV.start1 + d1));
    const on1 = DV.enabled && DV.first;
    updateLinePair(this.div1, l1, on1 ? DV.intensity1 : 0, DV.y1, DV.length1);
    this.popDiamond(this.div1.d, seg(dt, DV.start1 - 0.1, DV.start1 + 0.6), t, 0);
    this.div1.d.visible = this.div1.d.visible && on1 && DV.diamonds;
    this.div1.d.position.y = this.div1.d.userData.baseY + DV.y1;
    const l2 = easeInOutCubic(seg(dt, DV.start2, DV.start2 + d2));
    const on2 = DV.enabled && DV.second;
    updateLinePair(this.div2, l2, on2 ? DV.intensity2 : 0, DV.y2, DV.length2);
    this.popDiamond(this.div2.d, seg(dt, DV.start2 - 0.1, DV.start2 + 0.55), t, 1.7);
    this.div2.d.visible = this.div2.d.visible && on2 && DV.diamonds;
    this.div2.d.position.y = this.div2.d.userData.baseY + DV.y2;

    // The bars bypass animated HDR extraction and final-pass grain; reapply only the
    // global fade, vignette and opening slit so their look stays in sync with the scene.
    this.dividerOverlay.enabled = DV.enabled && (this.div1.L.visible || this.div2.L.visible);
    const du = this.dividerOverlay.material.uniforms;
    du.uAspect.value = this.camera.aspect;
    du.uVignette.value = PO.vignette;
    du.uFade.value = F.uFade.value;
    du.uOpen.value = F.uOpen.value;
    du.uSlitMix.value = F.uSlitMix.value;

    // subtitle + date
    this.updateText(this.sub, SB, t, 1.3, 0, 0.55, 0.25);
    this.updateText(this.date, DT, t, 1.1, 1, 0.5, 0.2);

    // FX
    const setFlare = (f, v) => {
      v *= fxk(FX.flares);
      f.s.material.opacity = Math.min(1, v);
      f.s.visible = v > 0.003;
      f.s.scale.set(f.sx * (0.7 + 0.5 * Math.min(1, v)), f.sy * (0.6 + 0.6 * Math.min(1, v)), 1);
    };
    this.flareLogo.s.position.set(lcx, lcy - 0.2, 0.4);
    this.flareTitle.s.position.set(TT.x, -0.66 + TT.y, 0.4);
    this.flareSub.s.position.set(SB.x, P(0, 537).y + SB.y, 0.4);
    setFlare(this.flareLogo, burst(t, 4.5, 0.07, 0.4) * 0.2 + 0.1 * easeOutCubic(seg(gt, 5.5, 8)) * (0.8 + 0.2 * Math.sin(t * 0.8)));
    setFlare(this.flareTitle, burst(t - ts, 7.7, 0.25, 0.7) * 0.5 + 0.14 * easeOutCubic(seg(t - ts, 7.5, 10)) + burst(t, TL.sweep2 + 0.4, 0.3, 0.7) * 0.35);
    setFlare(this.flareSub, burst(t - SB.start + 8.35 - SB.delay, 9.6, 0.3, 0.6) * 0.45);
    const cg = this.coreGlow;
    cg.position.set(lcx, lcy, -0.3);
    cg.material.opacity = (easeOutCubic(seg(t, 3.0, 4.6)) * 0.28 * (1 - 0.6 * seg(t, 5, 7)) + burst(t, 4.5, 0.06, 0.4) * 0.09) * fxk(FX.flash);
    const cgs = 6 + burst(t, 4.5, 0.06, 0.8) * 3;
    cg.scale.set(cgs, cgs, 1);
    cg.visible = cg.material.opacity > 0.003;

    // МИГАНИЕ КОЛЕЦ. Плоскость волны — квадрат 34×34 при 16:9, поэтому один и тот же uW давал
    // разную толщину кромки по осям (растянуто по x, тонко по y). Кромка титульной волны была
    // 2 px и расширялась до ~2400 px/с по горизонтали — втрое быстрее предела Найквиста,
    // то есть кольцо обгоняло само себя и стробоскопило (заметно с 8.1 с, затухая до ~9.6 с).
    // Теперь: ширина задаётся в мировых единицах и не зависит от пропорций плоскости,
    // кольца шире, мягче и растут медленнее.
    // Предыдущий радиус считаем по явному шагу кадра, без скрытой истории рендеров:
    // перемотка/экспорт используют 1/fps, а живое превью учитывает фактический пропуск кадров.
    const prevT = this.warp(Math.max(0, real - frameDelta));
    const w1 = seg(t, 4.5, 6.1);
    const w1Prev = seg(prevT, 4.5, 6.1);
    this.waveLogo.position.set(lcx, lcy, 0.3);
    this.waveLogo.visible = w1 > 0 && w1 < 1 && fxk(FX.waves) > 0;
    // плоскость 34×34 (квадрат, uAspect = 1): радиус в мировых единицах, ширина растёт с радиусом
    this.waveLogo.material.uniforms.uR.value = (easeOutCubic(w1) * 9.2) / 17;
    this.waveLogo.material.uniforms.uPrevR.value = (easeOutCubic(w1Prev) * 9.2) / 17;
    this.waveLogo.material.uniforms.uA.value = Math.pow(1 - w1, 1.5) * 0.3 * (0.45 + 0.55 * seg(w1, 0, 0.12)) * fxk(FX.waves);
    this.waveLogo.material.uniforms.uW.value = (0.26 + w1 * 0.75) / 17;
    const w2 = seg(t - ts, 7.75, 9.4);
    const w2Prev = seg(prevT - ts, 7.75, 9.4);
    const titleWaveRadius = (w: number) => (0.35 * (1 - Math.pow(1 - w, 1.6)) + 0.65 * w) * 1.1;
    const titleWaveGain = fxk(FX.waves) * FX.titleWave;
    this.waveTitle.position.set(TT.x, -0.66 + TT.y, 0.3);
    this.waveTitle.visible = w2 > 0 && w2 < 1 && titleWaveGain > 0;
    // плоскость 26×9 (uAspect = 2.89): кольцо остаётся круглым, кромка по горизонтали
    // больше не тоньше вертикальной в 2.9 раза — именно она мигала на быстром расширении
    // Равномерное расширение вместо easeOutCubic: у кубической кривой скорость в начале втрое
    // выше средней — отсюда стробоскоп на первых кадрах (8.0–8.3 с). Здесь пиковая скорость
    // меньше, а широкий мягкий фронт успевает «пропечататься» на каждом кадре.
    this.waveTitle.material.uniforms.uR.value = titleWaveRadius(w2);
    this.waveTitle.material.uniforms.uPrevR.value = titleWaveRadius(w2Prev);
    this.waveTitle.material.uniforms.uA.value = Math.pow(1 - w2, 1.3) * 0.24 * titleWaveGain;
    this.waveTitle.material.uniforms.uW.value = 0.09 + w2 * 0.12;

    // анаморфные полосы: нарастают к удару, вспыхивают на нём, оживают на названии и финальном блике
    this.streak.strength = PO.streak * Math.min(1.1,
      0.1 * easeOutCubic(seg(t, 2.6, 4.5)) +
      0.3 * burst(t, 4.5, 0.05, 0.8) +
      0.1 * burst(t - ts, 7.7, 0.25, 0.8) +
      0.05 * easeOutCubic(seg(t, 8, 10)) +
      0.09 * burst(t, TL.sweep2 + 0.3, 0.35, 0.7)) * easeOutCubic(seg(t, 1.5, 2.5));
    // зум-блюр на ударе и «призраки» линзы на пиках света (премиальная оптика)
    F.uZoom.value = fxk(FX.flash) * burst(t, 4.5, 0.012, 0.09) * 0.075 * PO.aberration;
    F.uGhost.value = fxk(FX.flares) * (burst(t, 4.52, 0.05, 0.4) * 0.55 + burst(t, TL.sweep2 + 0.3, 0.3, 0.55) * 0.3 + burst(t - ts, 7.7, 0.25, 0.5) * 0.2);
    // объёмные лучи света из эмблемы
    F.uRays.value = fxk(FX.rays) * (
      0.12 * easeInOutSine(seg(t, 3.0, 4.5)) * (t < 4.5 ? 1 : 0) +
      0.14 * burst(t, 4.5, 0.05, 0.8) +
      0.05 * easeOutCubic(seg(t, 6, 9)) * (0.85 + 0.15 * Math.sin(t * 0.9)) +
      0.03 * burst(t, TL.sweep2 + 0.3, 0.4, 0.7));

    // звёздные блики: пробегают вслед за световым лучом и редко мерцают в финале
    this.glints.forEach((gl, i) => {
      const dx = (gl.x - sw.x) * 0.8;
      const swept = Math.exp(-dx * dx) * swAmt * (t > 5.9 ? 1 : 0);
      const tw = Math.pow(0.5 + 0.5 * Math.sin(t * 1.35 + gl.phase), 18) * 0.7 * easeOutCubic(seg(t, 9, 11));
      const intro = burst(t, 4.7 + i * 0.07, 0.08, 0.35) * (i < 6 ? 0.9 : 0);
      const v = Math.min(1, (swept + tw + intro) * fxk(FX.glints));
      gl.s.visible = v > 0.01;
      gl.s.material.opacity = v;
      const sc = gl.size * (0.35 + 0.9 * v);
      gl.s.scale.set(sc, sc, 1);
      gl.s.material.rotation = 0.12 * Math.sin(t * 0.8 + gl.phase) + (1 - v) * 0.3;
    });

    // bloom breathes with the story
    this.bloom.strength = PO.bloom * (0.5 + 0.1 * burst(t, 4.5, 0.08, 0.6) + 0.1 * burst(t, TL.sweep2, 0.4, 0.9));
    this.bloom.radius = PO.bloomRadius;
    this.bloom.threshold = PO.bloomThreshold;
  }

  /** Текстовый слой (подзаголовок/дата): пресеты wipe / fade / rise / spread. */
  updateText(m, S, t, shineF, shineP, shineA, shineB) {
    const tl = t - S.delay;
    const k = seg(tl, S.start, S.start + S.duration);
    const r = easeInOutCubic(k);
    const e = easeOutCubic(k);
    const u = m.material.uniforms;
    m.visible = S.enabled && r > 0.001;
    let reveal = r, bright = S.brightness, sx = 1.07 - 0.07 * easeOutCubic(seg(tl, S.start, S.start + S.duration * 1.26)), dy = 0;
    if (S.preset === 'fade') { reveal = 1; bright = S.brightness * r; sx = 1; }
    else if (S.preset === 'rise') { dy = (1 - e) * 0.4; sx = 1; }
    else if (S.preset === 'spread') { sx = 1.4 - 0.4 * e; }
    u.uReveal.value = reveal;
    u.uBright.value = bright;
    u.uShine.value = shineA + shineB * Math.sin(t * shineF + shineP);
    this.setCol(u.uColA.value, S.colA);
    this.setCol(u.uColB.value, S.colB);
    m.scale.x = sx;
    m.position.set(S.x, m.userData.baseY + S.y + dy, 0.1);
  }

  popDiamond(m, k, t, phase) {
    m.visible = k > 0;
    const e = Math.max(0, easeOutBack(k));
    m.scale.setScalar(e * (1 + 0.06 * Math.sin(t * 2 + phase)));
    m.rotation.z = (1 - easeOutCubic(k)) * Math.PI * 0.5;
    m.material.opacity = clamp01(k * 2);
  }

  sweepState(t: number) {
    const sw = [[5.75, 8.8], [TL.sweep2, TL.sweep2 + 1.7]];
    for (const [a, b] of sw) {
      if (t >= a && t <= b) {
        const p = (t - a) / (b - a);
        return { x: -9 + 18 * easeInOutSine(p), amt: Math.sin(Math.PI * p) };
      }
    }
    if (t > TL.sweep2 + 1.7) {
      const ph = (t - TL.sweep2) % 8;
      if (ph < 1.7) {
        const p = ph / 1.7;
        return { x: -9 + 18 * easeInOutSine(p), amt: Math.sin(Math.PI * p) * 0.8 };
      }
    }
    return { x: -20, amt: 0 };
  }

  dispose() {
    this.disposed = true;
    this.cancelRecording?.();
    this.renderer?.setAnimationLoop(null);
    this.ro?.disconnect();
    const geometries = new Set();
    const materials = new Set();
    const textures = new Set();
    [this.scene, this.dividerScene].filter(Boolean).forEach((scene) => scene.traverse((obj) => {
      if (obj.geometry) geometries.add(obj.geometry);
      const list = Array.isArray(obj.material) ? obj.material : [obj.material];
      list.filter(Boolean).forEach((material) => {
        materials.add(material);
        Object.values(material).forEach((value) => { if (value?.isTexture) textures.add(value); });
        Object.values(material.uniforms || {}).forEach((uniform) => {
          if (uniform?.value?.isTexture) textures.add(uniform.value);
        });
      });
    }));
    this.environmentTarget?.dispose();
    this.environmentTarget = null;
    if (this.scene) this.scene.environment = null;
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
    this.composer?.passes.forEach((pass) => pass.dispose?.());
    this.composer?.dispose();
    if (this.handleContextLost) this.renderer?.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
    if (this.onVisibility) document.removeEventListener('visibilitychange', this.onVisibility);
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
  }
}
