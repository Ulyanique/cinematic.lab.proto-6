import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { buildHero, buildScenery, buildTerrain } from "./geometry";
import { clamp, lerp, mulberry32, smoothstep, terrainHeight } from "./math";
import * as S from "./shaders";
import { LogoDust, LOGO_H, LOGO_W } from "./logoDust";
import { logoExit } from "./finalExit";
import { createAntialiasPass, resizeAntialias } from "./antialias";
import { DEFAULT_SETTINGS, type FilmSettings } from "./settings";
import { mediaClip, mediaUrl, makeSlotTexture, mediaClock } from "./media";
import logoUrl from "./logo.svg?inline";
import {
  BLAST_POS,
  CamState,
  HERO_COUNT,
  TL,
  heroPlacement,
  riseStart,
  sampleCamera,
  visitTime,
} from "./timeline";

export type Stage = "approach" | "monoliths" | "collapse" | "logo" | "title" | "end";

export interface IntroEvents {
  onProgress?: (frac: number, t: number) => void;
  onChapter?: (chapter: number) => void;
  onStage?: (stage: Stage) => void;
  onReady?: () => void;
}

interface Hero {
  group: THREE.Group;
  bodyMat: THREE.ShaderMaterial;
  screenMat: THREE.ShaderMaterial;
  beamMat: THREE.ShaderMaterial;
  glowMat: THREE.ShaderMaterial;
}

const additive = (m: THREE.ShaderMaterial) => {
  m.transparent = true;
  m.depthWrite = false;
  m.blending = THREE.AdditiveBlending;
  return m;
};

export class IntroEngine {
  private settings: FilmSettings;
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private post: ShaderPass;
  private antialias: ShaderPass;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(55, 1, 0.3, 1400);
  private cam: CamState = { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 50, roll: 0 };

  private U = {
    uTime: { value: 0 },
    uBuildR: { value: 0 },
    uAnchor: { value: new THREE.Vector3(0, 0, 175) },
    uBlastT: { value: -1 },
    uBlastPos: { value: BLAST_POS.clone() },
    uBlastLight: { value: 0 },
    uFogColor: { value: new THREE.Color(0.075, 0.028, 0.005) },
    uFogDensity: { value: 0.0075 },
    uDim: { value: 1 },
    uEdge: { value: 1 },
  };

  private sky: THREE.Mesh;
  private skyMat: THREE.ShaderMaterial;
  private sceneryMat: THREE.ShaderMaterial;
  private heroes: Hero[] = [];
  private dustMat: THREE.ShaderMaterial;
  private sigilMat: THREE.ShaderMaterial;
  private core: THREE.Mesh;
  private coreMat: THREE.ShaderMaterial;
  private shell: THREE.Mesh;
  private shellMat: THREE.ShaderMaterial;
  private flare: THREE.Mesh;
  private flareMat: THREE.ShaderMaterial;
  private halo: THREE.Mesh;
  private haloMat: THREE.ShaderMaterial;
  private ring: THREE.Mesh;
  private ringMat: THREE.ShaderMaterial;
  private blastMat: THREE.ShaderMaterial;
  private cometTrails: THREE.Line[] = [];
  private cometTrailMats: THREE.LineBasicMaterial[] = [];
  private cometParticles: THREE.Points;
  private cometParticleSeeds: Float32Array;
  private cometHead: THREE.Mesh;
  private cometHeadMat: THREE.ShaderMaterial;
  private cometP0 = new THREE.Vector3();
  private cometP1 = new THREE.Vector3();
  private cometP2 = new THREE.Vector3();
  private cometTangent = new THREE.Vector3();
  private logo: THREE.Mesh;
  private logoMaterial: THREE.MeshBasicMaterial;
  private logoDepthMat: THREE.MeshBasicMaterial;
  private logoDust: LogoDust;

  private raf = 0;
  private clock = 0;
  private lastTs = 0;
  private fixedT: number | null;
  private events: IntroEvents;
  private lastStage: Stage | null = null;
  private lastChapter = -1;
  private pixelRatio: number;
  private prLevels: number[] = [1];
  private prIndex = 0;
  private adaptive = true;
  private frameEma = 1 / 60;
  private slowFrames = 0;
  private videos: HTMLVideoElement[] = [];
  private videoTextures: THREE.VideoTexture[] = [];
  private videoReady: Promise<void>[] = [];
  /** Ошибки загрузки источников: по ним панель честно пишет, что не открылось. */
  readonly mediaErrors: string[] = [];
  /** Текстуры плейсхолдеров: создаются один раз на слот. */
  private placeholderCache: (THREE.Texture | null)[] = [];
  private exportMode = new URLSearchParams(window.location.search).get("export") === "1";
  readonly ready: Promise<void>;
  private logoShine = { value: -1 };
  private disposed = false;
  private paused = false;
  private debugLook = new URLSearchParams(window.location.search).get("look");
  private tmpV = new THREE.Vector3();
  private tmpV2 = new THREE.Vector2();

  constructor(container: HTMLElement, events: IntroEvents = {}, fixedT: number | null = null, settings: FilmSettings = DEFAULT_SETTINGS, embedded = false) {
    if (embedded) this.exportMode = true;
    this.settings = settings;
    this.container = container;
    this.events = events;
    this.fixedT = fixedT;
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance", preserveDrawingBuffer: this.exportMode });
    // Supersample for crisp facet edges (the scene has no MSAA), then let the adaptive governor
    // step the resolution down if the GPU cannot hold the frame rate.
    const prParam = parseFloat(new URLSearchParams(window.location.search).get("pr") ?? "");
    const dpr = window.devicePixelRatio || 1;
    const target = embedded ? 1 : Number.isFinite(prParam) && prParam > 0 ? prParam : Math.min(Math.max(dpr, 1.5), 2);
    this.prLevels = [target, 1.5, 1.25, 1, 0.85].filter((v, i, a) => v <= target + 1e-6 && a.indexOf(v) === i);
    this.pixelRatio = this.prLevels[0];
    this.adaptive = !this.exportMode && (!Number.isFinite(prParam) || prParam <= 0);
    renderer.setPixelRatio(this.pixelRatio);
    renderer.setSize(w, h);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.setClearColor(0x000000, 1);
    renderer.domElement.style.display = "block";
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.camera.aspect = w / h;

    // ---------------------------------------------------------------- sky
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: S.SKY_VERT,
      fragmentShader: S.SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { uTime: this.U.uTime, uGlow: { value: 0 }, uFlame: { value: 1 }, uDim: { value: 1 } },
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 20), this.skyMat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);

    // ---------------------------------------------------------------- terrain & scenery
    const facetMat = (terrain: boolean, glow: number, shock: number) =>
      new THREE.ShaderMaterial({
        vertexShader: S.FACET_VERT,
        fragmentShader: S.FACET_FRAG,
        defines: terrain ? { TERRAIN: "" } : {},
        side: THREE.DoubleSide,
        uniforms: {
          ...this.U,
          uRise: { value: 1 },
          uHeight: { value: 20 },
          uGlow: { value: glow },
          uFocus: { value: 0 },
          uShockK: { value: shock },
        },
      });

    const terrain = new THREE.Mesh(buildTerrain(), facetMat(true, 0, 1));
    terrain.frustumCulled = false;
    this.scene.add(terrain);

    this.sceneryMat = facetMat(true, 0.9, 0.35);
    const scenery = new THREE.Mesh(buildScenery(), this.sceneryMat);
    scenery.frustumCulled = false;
    this.scene.add(scenery);

    // ---------------------------------------------------------------- heroes (10 video monoliths)
    const beamGeo = new THREE.CylinderGeometry(2.6, 3.6, 80, 28, 1, true);
    beamGeo.translate(0, 40, 0);
    const glowGeo = new THREE.PlaneGeometry(26, 26);
    glowGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < HERO_COUNT; i++) {
      const data = buildHero(101 + i * 13);
      const pl = heroPlacement(i);
      let minH = Infinity;
      let maxH = -Infinity;
      minH = Math.min(minH, terrainHeight(pl.x, pl.z));
      maxH = Math.max(maxH, terrainHeight(pl.x, pl.z));
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        const hh = terrainHeight(pl.x + Math.cos(a) * 6, pl.z + Math.sin(a) * 6);
        minH = Math.min(minH, hh);
        maxH = Math.max(maxH, hh);
      }
      const baseY = minH - 1.5;

      const group = new THREE.Group();
      group.position.set(pl.x, baseY, pl.z);
      group.rotation.y = pl.yaw;

      const bodyMat = facetMat(false, 1.0, 0);
      bodyMat.uniforms.uRise.value = 0;
      bodyMat.uniforms.uHeight.value = data.totalHeight;
      const body = new THREE.Mesh(data.body, bodyMat);
      body.frustumCulled = false;
      group.add(body);

      const clip = mediaClip(i);
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      // Источник берётся из общего списка роликов папки video/ (см. ./media):
      // реальные имена с пробелами и кириллицей, а не video/01.mp4, которого нет.
      if (clip.file) video.src = mediaUrl(i);
      this.videos.push(video);
      const texture = new THREE.VideoTexture(video);
      texture.colorSpace = THREE.SRGBColorSpace;
      this.videoTextures.push(texture);
      video.addEventListener("seeked", () => {
        if (!this.exportMode && this.paused && !this.disposed) {
          texture.needsUpdate = true;
          this.composer.render();
        }
      });
      this.videoReady.push(new Promise<void>((resolve, reject) => {
        if (!clip.file) { resolve(); return; }
        const timer = window.setTimeout(() => reject(new Error(`Тайм-аут загрузки видео «${clip.file}»`)), 30000);
        video.addEventListener("loadeddata", () => {
          window.clearTimeout(timer);
          // Первый кадр источника — по политике показа: при «середине» это
          // кульминация ролика, а не всегда титр.
          const first = mediaClock(0, video.duration, this.settings.videoFit).time;
          if (Number.isFinite(first) && first > 0) video.currentTime = first;
          resolve();
        }, { once: true });
        video.addEventListener("error", () => {
          window.clearTimeout(timer);
          const message = `Не удалось загрузить или декодировать video/${clip.file}`;
          this.mediaErrors[i] = message;
          // Битый файл не должен оставлять чёрный экран: слот сразу переходит
          // на плейсхолдер, а причина видна в пульте и в подсказке.
          this.heroes.forEach((hero, slot) => {
            if (this.settings.videoAssign[slot] !== i) return;
            hero.screenMat.uniforms.uTex.value = this.placeholderFor(slot);
            hero.screenMat.uniforms.uLive.value = 0;
          });
          if (!this.exportMode && !this.disposed) this.composer.render();
          reject(new Error(`${message}. Проверьте, что файл доступен на сервере и браузер поддерживает его формат.`));
        }, { once: true });
        video.load();
      }));
      // Preview can still run without media; export checks all errors explicitly.
      void this.videoReady[i].catch(() => {});
      const screenMat = new THREE.ShaderMaterial({
        vertexShader: S.SCREEN_VERT,
        fragmentShader: S.SCREEN_FRAG,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
        uniforms: {
          uTime: this.U.uTime,
          uBlastLight: this.U.uBlastLight,
          uBlastPos: this.U.uBlastPos,
          uFogColor: this.U.uFogColor,
          uFogDensity: this.U.uFogDensity,
          uDim: this.U.uDim,
          uTex: { value: clip.file ? texture : this.placeholderFor(i) },
          uLive: { value: clip.file ? 1 : 0 },
          uOn: { value: 0 },
          uFocus: { value: 0 },
          uAspect: { value: data.aspect },
          uMediaAspect: { value: 16 / 9 },
          uVideoBrightness: { value: 1 },
          uSeed: { value: i * 0.137 },
        },
      });
      const screen = new THREE.Mesh(data.screen, screenMat);
      screen.frustumCulled = false;
      group.add(screen);

      const beamMat = additive(
        new THREE.ShaderMaterial({
          vertexShader: S.BEAM_VERT,
          fragmentShader: S.BEAM_FRAG,
          side: THREE.DoubleSide,
          uniforms: { uI: { value: 0 }, uTime: this.U.uTime },
        })
      );
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.position.y = 0.5;
      beam.frustumCulled = false;
      group.add(beam);

      const glowMat = additive(
        new THREE.ShaderMaterial({
          vertexShader: S.FLARE_VERT,
          fragmentShader: S.FLARE_FRAG,
          uniforms: {
            uTime: this.U.uTime,
            uI: { value: 0 },
            uRays: { value: 0 },
            uStreak: { value: 0 },
            uColor: { value: new THREE.Color(1.0, 0.55, 0.12) },
          },
        })
      );
      const glow = new THREE.Mesh(glowGeo, glowMat);
      // lift the ground glow above the highest facet around the base so it is never cut into polygons
      glow.position.y = maxH - baseY + 0.6;
      glow.frustumCulled = false;
      group.add(glow);

      this.scene.add(group);
      this.heroes.push({ group, bodyMat, screenMat, beamMat, glowMat });
    }

    // ---------------------------------------------------------------- arena sigil
    this.sigilMat = additive(
      new THREE.ShaderMaterial({
        vertexShader: S.SIGIL_VERT,
        fragmentShader: S.SIGIL_FRAG,
        uniforms: { uDraw: { value: 0 }, uI: { value: 1 }, uTime: this.U.uTime },
      })
    );
    // the sigil follows the terrain relief, so facets never slice through its lines
    this.sigilMat.polygonOffset = true;
    this.sigilMat.polygonOffsetFactor = -2;
    this.sigilMat.polygonOffsetUnits = -2;
    const sigilGeo = new THREE.PlaneGeometry(80, 80, 160, 160);
    {
      const sp = sigilGeo.attributes.position;
      for (let i = 0; i < sp.count; i++) sp.setZ(i, terrainHeight(sp.getX(i), -sp.getY(i)) + 0.5);
    }
    const sigil = new THREE.Mesh(sigilGeo, this.sigilMat);
    sigil.rotation.x = -Math.PI / 2;
    sigil.frustumCulled = false;
    this.scene.add(sigil);

    // ---------------------------------------------------------------- floating embers
    {
      const n = 2600;
      const rand = mulberry32(77);
      const data = new Float32Array(n * 4);
      for (let i = 0; i < n * 4; i++) data[i] = rand();
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      g.setAttribute("aData", new THREE.BufferAttribute(data, 4));
      this.dustMat = additive(
        new THREE.ShaderMaterial({
          vertexShader: S.DUST_VERT,
          fragmentShader: S.DUST_FRAG,
          uniforms: {
            uTime: this.U.uTime,
            uSize: { value: 1.6 },
            uPx: { value: this.pixelRatio },
            uBox: { value: new THREE.Vector3(150, 60, 150) },
            uAlpha: { value: 0.9 },
          },
        })
      );
      const pts = new THREE.Points(g, this.dustMat);
      pts.frustumCulled = false;
      this.scene.add(pts);
    }

    // ---------------------------------------------------------------- blast particles
    {
      const n = 3200;
      const rand = mulberry32(2024);
      const dir = new Float32Array(n * 3);
      const info = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const u = rand() * 2 - 1;
        const a = rand() * Math.PI * 2;
        const s = Math.sqrt(1 - u * u);
        // squash vertically a bit: more ground-hugging debris, a few pillars of sparks
        const y = u * (rand() < 0.15 ? 1 : 0.55) + 0.12;
        dir[i * 3] = Math.cos(a) * s;
        dir[i * 3 + 1] = y;
        dir[i * 3 + 2] = Math.sin(a) * s;
        info[i * 3] = 22 + Math.pow(rand(), 1.5) * 90;
        info[i * 3 + 1] = rand();
        info[i * 3 + 2] = 0.5 + Math.pow(rand(), 3) * 2.6;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      g.setAttribute("aDir", new THREE.BufferAttribute(dir, 3));
      g.setAttribute("aInfo", new THREE.BufferAttribute(info, 3));
      this.blastMat = additive(
        new THREE.ShaderMaterial({
          vertexShader: S.BLAST_VERT,
          fragmentShader: S.BLAST_FRAG,
          uniforms: {
            uT: { value: -1 },
            uImplode: { value: 0 },
            uPower: { value: 1 },
            uCenter: { value: BLAST_POS.clone() },
            uPx: { value: this.pixelRatio },
            uTime: this.U.uTime,
          },
        })
      );
      const pts = new THREE.Points(g, this.blastMat);
      pts.frustumCulled = false;
      this.scene.add(pts);
    }

    // Camera-facing comet streak: a smooth luminous arc plus individually drifting sparks.
    {
      const trailCount = 64;
      const strands = [
        { color: 0xffe6a0, opacity: 0.82, offset: 0 },
        { color: 0xffc44f, opacity: 0.43, offset: 0.013 },
        { color: 0xff9f32, opacity: 0.25, offset: -0.016 },
      ];
      for (const [index, strand] of strands.entries()) {
        const trailGeo = new THREE.BufferGeometry();
        trailGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(trailCount * 3), 3));
        trailGeo.setDrawRange(0, trailCount);
        const material = new THREE.LineBasicMaterial({
          color: strand.color,
          transparent: true,
          opacity: strand.opacity,
          blending: THREE.AdditiveBlending,
          depthTest: true,
          depthWrite: false,
        });
        const trail = new THREE.Line(trailGeo, material);
        trail.renderOrder = 18 + index;
        trail.frustumCulled = false;
        trail.visible = false;
        this.cometTrails.push(trail);
        this.cometTrailMats.push(material);
        this.scene.add(trail);
      }

      const particleCount = 220;
      const particleGeo = new THREE.BufferGeometry();
      particleGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(particleCount * 3), 3));
      this.cometParticleSeeds = new Float32Array(particleCount * 3);
      const sparkStrength = new Float32Array(particleCount);
      const seedRand = mulberry32(7719);
      for (let i = 0; i < particleCount; i++) {
        this.cometParticleSeeds[i * 3] = seedRand();
        this.cometParticleSeeds[i * 3 + 1] = seedRand() * 2 - 1;
        this.cometParticleSeeds[i * 3 + 2] = seedRand() * 2 - 1;
        sparkStrength[i] = 0.25 + seedRand() * 0.75;
      }
      particleGeo.setAttribute("aSpark", new THREE.BufferAttribute(sparkStrength, 1));
      const sparks = new THREE.ShaderMaterial({
        vertexShader: `
          attribute float aSpark;
          uniform float uTime;
          varying float vSpark;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mv;
            float twinkle = 0.65 + 0.35 * sin(uTime * (2.0 + aSpark * 5.0) + aSpark * 40.0);
            vSpark = aSpark * twinkle;
            gl_PointSize = clamp((1.5 + aSpark * 2.2) * (32.0 / max(-mv.z, 0.5)), 1.0, 7.0);
          }
        `,
        fragmentShader: `
          precision highp float;
          varying float vSpark;
          void main() {
            float r = length(gl_PointCoord - 0.5);
            float alpha = 1.0 - smoothstep(0.16, 0.5, r);
            gl_FragColor = vec4(vec3(1.0, 0.62, 0.24) * vSpark, alpha * vSpark * 0.85);
          }
        `,
        uniforms: { uTime: this.U.uTime },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthTest: true,
        depthWrite: false,
      });
      this.cometParticles = new THREE.Points(particleGeo, sparks);
      this.cometParticles.renderOrder = 19;
      this.cometParticles.frustumCulled = false;
      this.cometParticles.visible = false;
      this.scene.add(this.cometParticles);
    }

    // ---------------------------------------------------------------- core / fireball / shock
    const coreMaterial = (a: THREE.Color, b: THREE.Color) =>
      additive(
        new THREE.ShaderMaterial({
          vertexShader: S.CORE_VERT,
          fragmentShader: S.CORE_FRAG,
          side: THREE.DoubleSide,
          uniforms: {
            uTime: this.U.uTime,
            uDisp: { value: 0.5 },
            uI: { value: 0 },
            uColA: { value: a },
            uColB: { value: b },
          },
        })
      );
    this.coreMat = coreMaterial(new THREE.Color(1.0, 0.42, 0.06), new THREE.Color(1.0, 0.92, 0.65));
    this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 5), this.coreMat);
    this.core.position.copy(BLAST_POS);
    this.core.frustumCulled = false;
    this.scene.add(this.core);

    this.shellMat = coreMaterial(new THREE.Color(1.0, 0.45, 0.08), new THREE.Color(1.0, 0.8, 0.4));
    this.shellMat.uniforms.uDisp.value = 2.0;
    this.shellMat.side = THREE.FrontSide;
    this.shell = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 4), this.shellMat);
    this.shell.position.copy(BLAST_POS);
    this.shell.frustumCulled = false;
    this.scene.add(this.shell);

    const flareMaterial = (streak: number, rays: number) =>
      additive(
        new THREE.ShaderMaterial({
          vertexShader: S.FLARE_VERT,
          fragmentShader: S.FLARE_FRAG,
          uniforms: {
            uTime: this.U.uTime,
            uI: { value: 0 },
            uRays: { value: rays },
            uStreak: { value: streak },
            uColor: { value: new THREE.Color(1.0, 0.72, 0.36) },
          },
        })
      );
    this.flareMat = flareMaterial(1, 1);
    this.flareMat.depthTest = false;
    this.flare = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.flareMat);
    this.flare.position.copy(BLAST_POS);
    this.flare.renderOrder = 20;
    this.flare.frustumCulled = false;
    this.scene.add(this.flare);

    this.cometHeadMat = flareMaterial(1.0, 1.0);
    this.cometHeadMat.depthTest = true;
    this.cometHead = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.cometHeadMat);
    this.cometHead.renderOrder = 20;
    this.cometHead.frustumCulled = false;
    this.cometHead.visible = false;
    this.scene.add(this.cometHead);

    this.haloMat = flareMaterial(1.0, 0.25);
    this.halo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.haloMat);
    this.halo.position.set(0, 5.8, -2.2);
    this.halo.frustumCulled = false;
    this.scene.add(this.halo);

    this.ringMat = additive(
      new THREE.ShaderMaterial({
        vertexShader: S.RING_VERT,
        fragmentShader: S.RING_FRAG,
        side: THREE.DoubleSide,
        uniforms: { uR: { value: 0 }, uW: { value: 1.5 }, uI: { value: 0 }, uTime: this.U.uTime },
      })
    );
    this.ringMat.depthTest = false;
    this.ring = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), this.ringMat);
    this.ring.renderOrder = 5;
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.9;
    this.ring.frustumCulled = false;
    this.scene.add(this.ring);

    // ---------------------------------------------------------------- the compass logo
    let resolveLogo!: () => void;
    let rejectLogo!: (error: Error) => void;
    const logoReady = new Promise<void>((resolve, reject) => { resolveLogo = resolve; rejectLogo = reject; });
    const logoTexture = new THREE.TextureLoader().load(logoUrl, () => resolveLogo(), undefined, () => rejectLogo(new Error("Не удалось загрузить логотип")));
    logoTexture.colorSpace = THREE.SRGBColorSpace;
    logoTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    this.logoMaterial = new THREE.MeshBasicMaterial({
      map: logoTexture,
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    });
    // a travelling diagonal sheen across the gold: masked by the emblem's own alpha
    this.logoMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.uShine = this.logoShine;
      shader.fragmentShader = shader.fragmentShader
        .replace("void main() {", "uniform float uShine;\nvoid main() {")
        .replace(
          "#include <map_fragment>",
          `#include <map_fragment>
          {
            // brushed-gold grade + a light-from-top-left bevel read from the emblem's own alpha
            float a0 = diffuseColor.a;
            float aL = texture2D(map, vMapUv + vec2(-0.0055, 0.0055)).a;
            float aR = texture2D(map, vMapUv + vec2(0.0055, -0.0055)).a;
            float aL2 = texture2D(map, vMapUv + vec2(-0.012, 0.012)).a;
            float aR2 = texture2D(map, vMapUv + vec2(0.012, -0.012)).a;
            float lit = clamp((aR - aL) + 0.5 * (aR2 - aL2), 0.0, 1.0) * a0;
            float sh = clamp((aL - aR) + 0.5 * (aL2 - aR2), 0.0, 1.0) * a0;
            vec3 gold = mix(vec3(1.10, 0.80, 0.40), vec3(1.25, 1.02, 0.70), smoothstep(0.0, 1.0, vMapUv.y));
            diffuseColor.rgb = diffuseColor.rgb * gold;
            diffuseColor.rgb += vec3(1.0, 0.88, 0.58) * lit * 1.05;
            diffuseColor.rgb *= 1.0 - sh * 0.5;
            float d = vMapUv.x * 0.78 + (1.0 - vMapUv.y) * 0.62 - uShine;
            float band = exp(-d * d / 0.0045) + 0.35 * exp(-d * d / 0.03);
            diffuseColor.rgb += vec3(1.0, 0.86, 0.52) * band * 1.35 * diffuseColor.a;
          }`
        );
    };
    const logoGeo = new THREE.PlaneGeometry(LOGO_W, LOGO_H);
    this.logo = new THREE.Mesh(logoGeo, this.logoMaterial);
    this.logo.position.set(0, 7.35, 0);
    this.logo.renderOrder = 10;
    this.logo.frustumCulled = false;
    this.logo.visible = false;
    this.scene.add(this.logo);

    // fake extrusion: a stack of darker copies behind the face gives the emblem real thickness
    // that catches the eye when the camera / pointer parallax swings around it
    this.logoDepthMat = new THREE.MeshBasicMaterial({
      map: logoTexture,
      color: 0x8a5a22,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
      alphaTest: 0.02,
    });
    const LAYERS = 9;
    for (let i = 1; i <= LAYERS; i++) {
      const layer = new THREE.Mesh(logoGeo, this.logoDepthMat);
      layer.position.z = -i * 0.045;
      layer.renderOrder = 9;
      layer.frustumCulled = false;
      layer.userData.k = i / LAYERS;
      this.logo.add(layer);
    }

    // the emblem assembles out of the blast as ~9000 gold sparks
    this.logoDust = new LogoDust(logoUrl, BLAST_POS, this.logo.position, this.logoShine, this.U.uTime);
    this.scene.add(this.logoDust.points);

    // ---------------------------------------------------------------- post
    const rt = new THREE.WebGLRenderTarget(w * this.pixelRatio, h * this.pixelRatio, {
      type: THREE.HalfFloatType,
      // MSAA on half-float composer targets is inconsistently supported and can produce
      // incomplete framebuffers (black output) on some integrated/mobile GPUs.
      samples: 0,
    });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(w, h);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.8, 0.8, 0.8);
    this.composer.addPass(this.bloom);
    this.post = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uTime: this.U.uTime,
        uFlash: { value: 0 },
        uAber: { value: 0.002 },
        uZoom: { value: 0 },
        uVig: { value: 0.55 },
        uFade: { value: 1 },
        uGrain: { value: 0.045 },
        uShockR: { value: 0 },
        uShockAmp: { value: 0 },
        uAspect: { value: w / h },
        uCenter: { value: new THREE.Vector2(0.5, 0.5) },
        uRays: { value: 0 },
        uRayCenter: { value: new THREE.Vector2(0.5, 0.6) },
      },
      vertexShader: S.POST_VERT,
      fragmentShader: S.POST_FRAG,
    });
    this.composer.addPass(this.post);
    this.composer.addPass(new OutputPass());
    // FXAA operates on the output-colour image, smoothing geometry without relying
    // on multisampled half-float framebuffer support. It is also used for export.
    this.antialias = createAntialiasPass();
    this.antialias.enabled = this.settings.antialias;
    resizeAntialias(this.antialias, w, h, this.pixelRatio);
    this.composer.addPass(this.antialias);

    window.addEventListener("resize", this.onResize);
    this.renderer.domElement.addEventListener("webglcontextlost", this.onContextLost);
    this.renderer.domElement.addEventListener("webglcontextrestored", this.onContextRestored);
    document.addEventListener("visibilitychange", this.onVisibility);
    this.warmUp();
    this.ready = Promise.all([logoReady, this.logoDust.readyPromise, ...this.videoReady]).then(() => {
      if (this.disposed) throw new Error("Движок остановлен");
      this.events.onReady?.();
    });
    void this.ready.catch((error) => { if (!this.disposed) console.warn("Не все ресурсы загружены:", error); });
    this.lastTs = performance.now();
    if (this.exportMode) this.paused = true;
    else this.raf = requestAnimationFrame(this.loop);
  }

  /** current intro time in seconds (accumulated per frame, so hitches never make the film jump) */
  get time() {
    return clamp(this.fixedT !== null ? this.fixedT : this.clock, 0, TL.end);
  }

  restart() {
    this.fixedT = null;
    this.clock = 0;
    this.paused = false;
    this.lastStage = null;
    this.lastChapter = -1;
    this.lastTs = performance.now();
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.loop);
  }

  get isPaused() {
    return this.paused;
  }

  pause() {
    if (this.paused) return;
    this.paused = true;
    cancelAnimationFrame(this.raf);
    for (const video of this.videos) video.pause();
  }

  resume() {
    if (!this.paused || this.disposed) return;
    this.paused = false;
    this.lastTs = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  setSettings(settings: FilmSettings) {
    this.settings = settings;
    this.antialias.enabled = settings.antialias;
    this.syncScreens();
    this.apply(this.time);
    this.syncVideos(this.time);
    this.composer.render();
  }

  /** Seek the film timeline in seconds and resume playback from the selected point. */
  seek(seconds: number) {
    this.clock = clamp(seconds, 0, TL.end);
    this.fixedT = null;
    this.lastStage = null;
    this.lastChapter = -1;
    this.apply(this.clock);
    this.syncVideos(this.clock);
    this.composer.render();
  }

  /**
   * Render every visual state once behind black so all shaders are compiled, textures and
   * buffers are uploaded *before* the film starts – no stutter at the explosion.
   */
  private warmUp() {
    for (const t of [TL.explode + 1, TL.explode - 0.5, 20, 0]) {
      this.apply(t, true);
      this.composer.render();
    }
    this.lastStage = null;
    this.lastChapter = -1;
  }

  private onVisibility = () => {
    // Do not keep rendering into a throttled/hidden tab. Reset the frame timestamp on
    // resume so the film clock does not jump forward after backgrounding.
    if (document.hidden) {
      cancelAnimationFrame(this.raf);
      return;
    }
    this.lastTs = performance.now();
    if (!this.disposed && !this.paused) this.raf = requestAnimationFrame(this.loop);
  };

  private onContextLost = (event: Event) => {
    // Prevent the browser from discarding the context permanently. Three.js can restore
    // its resources when the browser emits webglcontextrestored.
    event.preventDefault();
    cancelAnimationFrame(this.raf);
    console.error("WebGL context lost; waiting for the browser to restore it.");
  };

  private onContextRestored = () => {
    if (this.disposed) return;
    console.info("WebGL context restored; resuming cinematic render loop.");
    this.lastTs = performance.now();
    if (!this.paused && !document.hidden) this.raf = requestAnimationFrame(this.loop);
  };


  /** Apply a new internal resolution (also refreshes the point-sprite scale uniforms). */
  private setResolution(pr: number) {
    this.pixelRatio = pr;
    this.dustMat.uniforms.uPx.value = pr;
    this.blastMat.uniforms.uPx.value = pr;
    this.onResize();
  }

  /** Steps the render resolution down when the frame time stays high; never steps back up (no flicker). */
  private governor(dt: number) {
    if (!this.adaptive || this.prIndex >= this.prLevels.length - 1) return;
    if (dt > 0.1) return; // tab switches / hitches are not a signal
    this.frameEma += (dt - this.frameEma) * 0.05;
    this.slowFrames = this.frameEma > 1 / 38 ? this.slowFrames + 1 : Math.max(0, this.slowFrames - 2);
    if (this.slowFrames > 70) {
      this.slowFrames = 0;
      this.frameEma = 1 / 60;
      this.prIndex++;
      this.setResolution(this.prLevels[this.prIndex]);
    }
  }

  private onResize = () => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(w, h);
    resizeAntialias(this.antialias, w, h, this.pixelRatio);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.post.uniforms.uAspect.value = w / h;
  };

  private loop = (ts: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    let dt = (ts - this.lastTs) / 1000;
    this.lastTs = ts;
    if (!(dt > 0)) dt = 1 / 60;
    dt = Math.min(dt, 0.25);
    if (this.fixedT === null) this.clock = Math.min(TL.end, this.clock + dt);
    this.syncVideos(this.time);
    this.governor(dt);
    this.apply(this.time);
    this.composer.render();
    if (this.fixedT === null && this.clock >= TL.end) this.pause();

    // Keep the composer framebuffer at a stable 1x resolution. Resizing multiple
    // post-processing targets dynamically during playback can flash an empty frame.
  };

  /** Preview follows the film clock; media is silent and holds its last frame. */
  /**
   * Время источника для момента фильма `t`.
   *
   * Аргумент — номер источника, а не монолита: слот ищем в назначении. Политика
   * `videoFit` решает, что видно в коротком окне визита (см. ./media).
   */
  private mediaTime(source: number, t: number) {
    const slot = this.settings.videoAssign.indexOf(source);
    if (slot < 0 || !mediaClip(source).file) return 0;
    const duration = this.videos[source].duration;
    if (!Number.isFinite(duration) || duration <= 0) return 0;
    const local = t - (visitTime(slot) - 0.95);
    return mediaClock(local, duration, this.settings.videoFit).time;
  }

  /** Скорость воспроизведения источника: 1, кроме политики «весь ролик». */
  private mediaRate(source: number) {
    const fitsSpeed = this.settings.videoFit === "speed";
    if (!fitsSpeed) return 1;
    const duration = this.videos[source]?.duration;
    if (!Number.isFinite(duration) || duration <= 0) return 1;
    return mediaClock(0, duration, "speed").rate;
  }

  private syncVideos(t: number) {
    if (this.exportMode) return;
    this.videos.forEach((video, index) => {
      if (!this.isLive(index)) return;
      if (video.readyState < 2 || !Number.isFinite(video.duration)) return;
      const slot = this.settings.videoAssign.indexOf(index);
      if (slot < 0) { if (!video.paused) video.pause(); return; }
      const local = this.mediaTime(index, t);
      const rate = this.mediaRate(index);
      if (video.playbackRate !== rate) video.playbackRate = rate;
      const active = !this.paused && this.fixedT === null && t >= visitTime(slot) - 0.95 && local < video.duration - 0.06 && t < TL.explode;
      // Порог перемотки больше на ускоренном воспроизведении: иначе каждый
      // кадр «догоняет» источник и ролик дёргается.
      if (Math.abs(video.currentTime - local) > 0.25 * Math.max(1, rate)) video.currentTime = local;
      if (active && video.paused) void video.play().catch(() => {});
      if (!active && !video.paused) video.pause();
    });
  }

  /** Источник назначен и успешно декодируется: можно показывать видео. */
  private isLive(index: number) {
    return Boolean(index >= 0 && mediaClip(index).file && !this.mediaErrors[index]);
  }

  /** Номер ролика на монолите `i`; -1 — слот намеренно пуст. */
  private slotClip(i: number) {
    const index = this.settings.videoAssign?.[i];
    return Number.isInteger(index) ? index : -1;
  }

  /** Плейсхолдер слота: показывается, пока источник не назначен или не декодировался. */
  private placeholderFor(i: number) {
    let tex = this.placeholderCache[i];
    if (!tex) { tex = makeSlotTexture(i); this.placeholderCache[i] = tex; }
    return tex;
  }

  /** Пересчитать экран после смены назначения источников. */
  private syncScreens() {
    this.heroes.forEach((hero, i) => {
      const index = this.slotClip(i);
      const live = this.isLive(index);
      hero.screenMat.uniforms.uTex.value = live ? this.videoTextures[index] : this.placeholderFor(i);
      hero.screenMat.uniforms.uLive.value = live ? 1 : 0;
      hero.screenMat.uniforms.uMediaAspect.value = 16 / 9;
    });
  }

  get canvas() { return this.renderer.domElement; }

  /** Render one requested time after decoding all source video frames. */
  async renderFrame(t: number) {
    if (!this.exportMode) throw new Error("renderFrame доступен только в режиме export=1");
    if (!Number.isFinite(t) || t < 0 || t >= TL.end) throw new Error("Время кадра вне диапазона фильма");
    await this.ready;
    if (this.renderer.getContext().isContextLost()) throw new Error("Контекст WebGL потерян; экспорт остановлен.");
    await Promise.all(this.videos.map((video, i) => new Promise<void>((resolve, reject) => {
      if (!this.isLive(i) || video.readyState < 2) { resolve(); return; }
      // Кадр нужен только тому источнику, который сейчас стоит на монолите.
      if (!this.settings.videoAssign.includes(i)) { resolve(); return; }
      const target = this.mediaTime(i, t);
      const rate = this.mediaRate(i);
      if (video.playbackRate !== rate) video.playbackRate = rate;
      if (Math.abs(video.currentTime - target) < 0.00001 && video.readyState >= 2) { resolve(); return; }
      const timeout = window.setTimeout(() => { cleanup(); reject(new Error(`Тайм-аут перемотки видео ${i + 1}`)); }, 15000);
      const cleanup = () => { clearTimeout(timeout); video.removeEventListener("seeked", done); video.removeEventListener("error", failed); };
      const done = () => { cleanup(); resolve(); };
      const failed = () => { cleanup(); reject(new Error(`Ошибка декодирования видео ${i + 1}`)); };
      video.addEventListener("seeked", done, { once: true });
      video.addEventListener("error", failed, { once: true });
      video.currentTime = target;
    })));
    this.videoTextures.forEach(texture => { texture.needsUpdate = true; });
    this.fixedT = t;
    this.apply(t);
    this.composer.render();
    if (this.renderer.getContext().isContextLost()) throw new Error("Контекст WebGL потерян; экспорт остановлен.");
  }

  private billboard(m: THREE.Mesh, size: number) {
    m.lookAt(this.camera.position);
    m.scale.set(size, size, 1);
  }

  private updateComet(t: number) {
    // A fixed world-space orbit, independent of the camera: the spark circles around
    // the monolith ring from different sides before diving into the central blast point.
    const active = t >= 0 && t < TL.explode;
    for (const trail of this.cometTrails) trail.visible = active;
    this.cometParticles.visible = active;
    this.cometHead.visible = active;
    if (!active) return;

    const progress = clamp(t / TL.explode);
    const orbitAt = (q: number, out: THREE.Vector3) => {
      const phase = smoothstep(0, 1, q) * Math.PI * 2 * 0.82;
      const radius = 42 + 4 * Math.sin(phase * 1.7);
      return out.set(
        Math.sin(phase) * radius,
        7 + 4 * Math.sin(phase * 1.15),
        Math.cos(phase) * radius
      );
    };
    const pathAt = (u: number, out: THREE.Vector3, offset = 0) => {
      if (u < 0.24) {
        const q = smoothstep(0, 1, u / 0.24);
        out.set(
          THREE.MathUtils.lerp(-9, 0, q),
          THREE.MathUtils.lerp(6, 7, q) + 0.6 * Math.sin(q * Math.PI),
          THREE.MathUtils.lerp(150, 42, q)
        );
      } else if (u < 0.84) {
        orbitAt((u - 0.24) / 0.60, out);
      } else {
        const q = smoothstep(0, 1, (u - 0.84) / 0.16);
        orbitAt(1, this.cometP0);
        this.cometTangent.set(-this.cometP0.x, 0.5, -this.cometP0.z).normalize();
        this.cometP1.copy(this.cometP0).addScaledVector(this.cometTangent, 14);
        this.cometP2.copy(BLAST_POS);
        this.cometP2.y += 9;
        this.cometP2.z += 15;
        const v = 1 - q;
        out.copy(this.cometP0).multiplyScalar(v * v * v)
          .addScaledVector(this.cometP1, 3 * v * v * q)
          .addScaledVector(this.cometP2, 3 * v * q * q)
          .addScaledVector(BLAST_POS, q * q * q);
      }
      const envelope = Math.sin(Math.PI * u);
      out.x += offset * envelope;
      out.y += offset * 0.7 * envelope;
      return out;
    };

    const trailStart = progress - 0.52;
    for (let strandIndex = 0; strandIndex < this.cometTrails.length; strandIndex++) {
      const trail = this.cometTrails[strandIndex];
      const linePos = trail.geometry.getAttribute("position") as THREE.BufferAttribute;
      const offset = strandIndex === 1 ? 0.12 : strandIndex === 2 ? -0.15 : 0;
      for (let i = 0; i < linePos.count; i++) {
        const u = trailStart + (progress - trailStart) * (i / (linePos.count - 1));
        const p = pathAt(u, this.tmpV, offset);
        linePos.setXYZ(i, p.x, p.y, p.z);
      }
      linePos.needsUpdate = true;
    }

    const particlePos = this.cometParticles.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < particlePos.count; i++) {
      const seed = this.cometParticleSeeds[i * 3];
      const spreadX = this.cometParticleSeeds[i * 3 + 1];
      const spreadY = this.cometParticleSeeds[i * 3 + 2];
      const p = pathAt(progress - seed * 0.52, this.tmpV);
      const spread = 0.12 + seed * 0.45;
      particlePos.setXYZ(i, p.x + spreadX * spread, p.y + spreadY * spread, p.z + (spreadX - spreadY) * spread * 0.4);
    }
    particlePos.needsUpdate = true;

    pathAt(progress, this.cometHead.position);
    const apparentSize = this.cometHead.position.distanceTo(this.camera.position) * 0.055;
    this.billboard(this.cometHead, apparentSize);
    this.cometHeadMat.uniforms.uI.value = 0.38 + 0.08 * Math.sin(t * 25);
  }

  private apply(t: number, warm = false) {
    const U = this.U;
    const tl = t - TL.explode;
    const post = tl >= 0;
    const kImp = clamp((t - TL.implodeStart) / (TL.explode - TL.implodeStart));
    const k2 = kImp * kImp;
    const k3 = k2 * kImp;
    const expl = post ? Math.exp(-tl * 2.4) : 0;

    // ------------------------------------------------ camera
    // a slow, soft handheld drift only – no high-frequency shake anywhere
    sampleCamera(t, this.cam, this.settings.cameraDrift);
    if (this.debugLook === "logo") {
      // QA helper: close-up on the logo (?look=logo)
      this.cam.pos.set(0, 6.4, 12.5);
      this.cam.target.set(0, 5.2, 0);
      this.cam.fov = 30;
      this.cam.roll = 0;
    }
    const cam = this.camera;
    cam.position.copy(this.cam.pos);
    cam.position.x += Math.sin(t * 0.9) * 0.1 * this.settings.cameraDrift;
    cam.position.y += Math.sin(t * 1.3 + 2) * 0.08 * this.settings.cameraDrift;
    cam.position.z += Math.sin(t * 0.7 + 1) * 0.1 * this.settings.cameraDrift;
    cam.up.set(0, 1, 0);
    cam.lookAt(this.cam.target);
    cam.rotateZ(this.cam.roll);
    cam.fov = this.cam.fov * this.settings.cameraFov;
    cam.updateProjectionMatrix();
    this.updateComet(t);
    // fades that must fully decay after the blast (the raw implode factor stays at 1 forever)
    const kFx = post ? Math.exp(-tl * 1.1) : kImp;

    // ------------------------------------------------ globals
    U.uTime.value = t;
    U.uBuildR.value = 10 + t * 55;
    U.uBlastT.value = post ? tl : -1;
    U.uEdge.value = 0.72 + k2 * 0.45 + (post ? 0.55 * Math.exp(-tl * 2.0) : 0);
    U.uFogDensity.value = lerp(0.0092, 0.0068, smoothstep(0, 9, t));
    const blastShade = post ? 1 - 0.68 * Math.exp(-tl * 0.9) : 1;
    U.uDim.value = (post ? lerp(1, 0.025, smoothstep(1.5, 5, tl)) : 1) * blastShade;
    U.uBlastLight.value = (post ? 1.6 * Math.exp(-tl * 3.4) + 0.32 * Math.exp(-tl * 0.8) + 0.1 : 0.9 * k2) * this.settings.blast;

    this.sky.position.copy(cam.position);
    this.skyMat.uniforms.uGlow.value = k2 * 0.25 + (post ? 0.38 * Math.exp(-tl * 1.5) : 0);
    this.skyMat.uniforms.uDim.value = lerp(1, 0.06, smoothstep(TL.logoText, TL.finalSettle, t)) * blastShade * this.settings.sky;

    // ------------------------------------------------ monoliths
    let chapter = 0;
    let bestFocus = 0.3;
    for (let i = 0; i < HERO_COUNT; i++) {
      const h = this.heroes[i];
      const screenIndex = this.slotClip(i);
      const screenLive = this.isLive(screenIndex);
      h.screenMat.uniforms.uTex.value = screenLive
        ? this.videoTextures[screenIndex]
        : this.placeholderFor(i);
      h.screenMat.uniforms.uLive.value = screenLive ? 1 : 0;
      h.screenMat.uniforms.uVideoBrightness.value = this.settings.videoBrightness;
      const rise = clamp((t - riseStart(i)) / TL.riseDur);
      const focus = Math.exp(-Math.pow((t - visitTime(i)) / 0.95, 2));
      if (focus > bestFocus && !post) {
        bestFocus = focus;
        chapter = i + 1;
      }
      const fAll = Math.max(focus, kImp * 0.9);
      let on = clamp((rise - 0.78) / 0.22);
      if (post) on *= 1 - smoothstep(0.05, 0.9, tl);
      h.bodyMat.uniforms.uRise.value = rise;
      h.bodyMat.uniforms.uFocus.value = fAll;
      h.bodyMat.uniforms.uGlow.value = 0.9 + focus * 0.9 + k2 * 1.0 + (post ? 1.5 * expl : 0);
      h.screenMat.uniforms.uOn.value = on;
      h.screenMat.uniforms.uFocus.value = fAll;
      const eruption = Math.sin(clamp(rise * 1.15) * Math.PI);
      const beamI = eruption * 0.72 + (rise >= 1 ? 0.10 : 0) * rise + focus * 0.10;
      h.beamMat.uniforms.uI.value = beamI * this.settings.beams;
      h.glowMat.uniforms.uI.value = (eruption * 0.65 + 0.18 * rise + focus * 0.12) * this.settings.beams;
    }
    this.sceneryMat.uniforms.uGlow.value = 0.85 + k2 * 0.8 + (post ? 1.2 * expl : 0);

    // ------------------------------------------------ arena sigil
    this.sigilMat.uniforms.uDraw.value = clamp((t - 12.5) / 13.5);
    const sigilFinalFade = 1 - 0.92 * smoothstep(TL.logoText, TL.finalSettle, t);
    this.sigilMat.uniforms.uI.value =
      (0.35 + 0.45 * smoothstep(12, 20, t) + k2 * 1.0) *
      (post ? 0.6 + 2.2 * Math.exp(-tl * 1.4) : 1) *
      sigilFinalFade * this.settings.sigil;

    // ------------------------------------------------ dust
    this.dustMat.uniforms.uAlpha.value = (0.55 + 0.5 * smoothstep(0, 4, t)) * this.settings.dust;

    // ------------------------------------------------ singularity & explosion
    const pulseK = Math.sin(t * (4 + kImp * 9));
    if (!post) {
      const r = 0.06 + 0.55 * k2 + 0.035 * pulseK * kImp;
      this.core.visible = kImp > 0.02;
      this.core.scale.setScalar(r);
      this.coreMat.uniforms.uI.value = 0.9 * smoothstep(0.05, 1, kImp);
      this.coreMat.uniforms.uDisp.value = 0.3 + 0.3 * kImp;
      this.shell.visible = false;
      this.flare.visible = kImp > 0.05;
      this.billboard(this.flare, 2.0 + 9 * k2);
      this.flareMat.uniforms.uI.value = 0.4 * k2 + 0.08 * kImp;
      this.ring.visible = false;
    } else {
      const g = 1 + 13 * (1 - Math.pow(1 - clamp(tl / 1.0), 3));
      this.core.visible = tl < 2.5;
      this.core.scale.setScalar(g);
      this.coreMat.uniforms.uDisp.value = 0.8 + g * 0.15;
      this.coreMat.uniforms.uI.value = 0.34 * Math.exp(-tl * 3.4);
      this.shell.visible = tl < 3;
      this.shell.scale.setScalar(2 + tl * 48);
      this.shellMat.uniforms.uI.value = 0.16 * Math.exp(-tl * 2.1);
      this.flare.visible = tl < 4;
      this.billboard(this.flare, 10 + tl * 15);
      this.flareMat.uniforms.uI.value = 0.42 * Math.exp(-tl * 2.8);
      this.ring.visible = tl < 7;
      this.ringMat.uniforms.uR.value = tl * 66;
      this.ringMat.uniforms.uW.value = 1.4 + tl * 1.8;
      this.ringMat.uniforms.uI.value = 1.8 * Math.exp(-tl * 0.8);
    }
    this.coreMat.uniforms.uI.value *= this.settings.blast;
    this.flareMat.uniforms.uI.value *= this.settings.blast;
    this.shellMat.uniforms.uI.value *= this.settings.blast;
    this.ringMat.uniforms.uI.value *= this.settings.blast;
    this.blastMat.uniforms.uPower.value = this.settings.blast;
    this.blastMat.uniforms.uT.value = post ? tl : -1;
    this.blastMat.uniforms.uImplode.value = kImp;

    // ------------------------------------------------ final SVG emblem: reveal it as a clean, front-facing vector mark
    // the solid emblem crossfades in only once most sparks have landed on it
    const logoReveal = post ? smoothstep(1.5, 3.3, tl) : 0;
    const exit = logoExit(t);
    const logoVisible = this.settings.showLogo ? this.settings.logoOpacity : 0;
    this.logo.visible = logoReveal * (1 - exit) * logoVisible > 0.001;
    this.logoMaterial.opacity = 0.96 * logoReveal * (1 - exit) * logoVisible;
    this.logoDepthMat.opacity = logoReveal * (1 - exit) * logoVisible;
    const buf = this.renderer.getDrawingBufferSize(this.tmpV2);
    this.logoDust.update(post ? tl : -1, buf.y, post ? (1 - 0.5 * smoothstep(2.8, 4.6, tl)) * (1 - exit) * logoVisible : 1);
    // first sheen as the emblem materialises, then a slow recurring glint
    const sh = tl - 6.0;
    const cycle = sh > 0 ? (sh % 7.5) / 2.2 : 0;
    const first = clamp((tl - 1.1) / 2.2);
    this.logoShine.value = post ? (sh > 0 ? -0.4 + cycle * 2.1 : -0.4 + first * 2.1) : -1;
    const logoScale = (0.92 + 0.08 * logoReveal) * (1 - Math.min(.8, 0.35 * this.settings.exitMotion) * exit) * this.settings.logoScale;
    this.logo.scale.set(logoScale, logoScale, 1);
    // a slow pendulum turn lets the thickness and the bevel glint (strongest right after the reveal)
    const swing = post ? smoothstep(1.5, 5, tl) : 0;
    this.logo.rotation.y = Math.sin(t * 0.55) * 0.13 * swing;
    this.logo.rotation.x = Math.sin(t * 0.38 + 1.0) * 0.025 * swing;
    this.logo.position.y = 7.35 + Math.sin(t * 0.8) * 0.06 * swing;
    this.logoDust.material.uniforms.uLogo.value.copy(this.logo.position);
    this.logoDust.material.uniforms.uLogoScale.value = logoScale;
    const haloI = post ? 0.13 * smoothstep(0.4, 2.4, tl) + 0.65 * Math.exp(-Math.pow((tl - 4.05) / 0.4, 2)) : 0;
    this.halo.visible = post;
    this.billboard(this.halo, 20 + Math.sin(t * 0.6) * 0.6);
    this.halo.position.set(0, 5.8, 0).addScaledVector(this.tmpV.copy(cam.position).sub(BLAST_POS).normalize(), -2.5);
    this.haloMat.uniforms.uI.value = haloI;
    this.haloMat.uniforms.uTime.value = t;

    // ------------------------------------------------ post stack
    this.renderer.toneMappingExposure = 0.95 * this.settings.exposure;
    this.bloom.strength = (0.42 + 0.28 * kImp + (post ? 0.18 * Math.exp(-tl * 2.6) : 0)) * this.settings.bloom;
    this.bloom.radius = 0.8;
    this.bloom.threshold = 1.0;
    const pu = this.post.uniforms;
    // Warm, brief ignition glow only; let the burst particles carry the explosion instead
    // of washing the frame out with a white flash.
    pu.uFlash.value = 0;
    pu.uAber.value = 0.0004 + kFx * kFx * 0.004 + (post ? 0.012 * Math.exp(-tl * 2.2) : 0);
    pu.uZoom.value = post ? 0.34 * Math.exp(-tl * 3.0) : 0.07 * k3;
    pu.uVig.value = (0.5 + 0.1 * (0.5 + 0.5 * Math.sin(t * 0.7)) + 0.12 * k3) * this.settings.vignette;
    pu.uGrain.value = 0.11 * this.settings.grain;
    pu.uFade.value = warm ? 1 : 1 - smoothstep(0.6, 3.4, t);
    pu.uShockR.value = post ? tl * 0.78 : 0;
    pu.uShockAmp.value = post ? Math.exp(-tl * 1.7) : 0;
    this.tmpV.copy(BLAST_POS).project(cam);
    pu.uCenter.value.set(this.tmpV.x * 0.5 + 0.5, this.tmpV.y * 0.5 + 0.5);
    // volumetric god rays radiating from behind the emblem; swell as it forms, then settle
    this.tmpV.copy(this.logo.position).project(cam);
    pu.uRayCenter.value.set(this.tmpV.x * 0.5 + 0.5, this.tmpV.y * 0.5 + 0.5);
    pu.uRays.value = post
      ? smoothstep(2.0, 3.8, tl) * (0.6 + 0.4 * Math.exp(-Math.pow((tl - 4.0) / 0.9, 2))) * (1 - 0.35 * smoothstep(4, 9, tl))
      : 0;
    pu.uRays.value *= this.settings.rays;

    if (warm) return;

    // ------------------------------------------------ UI events
    const stage: Stage =
      t < TL.visit0 - 1.2
        ? "approach"
        : t < TL.implodeStart
          ? "monoliths"
          : t < TL.explode
            ? "collapse"
            : t < TL.logoText
              ? "logo"
              : t < TL.end
                ? "title"
                : "end";
    if (stage !== this.lastStage) {
      this.lastStage = stage;
      this.events.onStage?.(stage);
    }
    if (chapter !== this.lastChapter) {
      this.lastChapter = chapter;
      this.events.onChapter?.(chapter);
    }
    this.events.onProgress?.(clamp(t / TL.end), t);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.onResize);
    this.renderer.domElement.removeEventListener("webglcontextlost", this.onContextLost);
    this.renderer.domElement.removeEventListener("webglcontextrestored", this.onContextRestored);
    document.removeEventListener("visibilitychange", this.onVisibility);
    const seen = new Set<unknown>();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mat of mats) {
        if (seen.has(mat)) continue;
        seen.add(mat);
        const u = (mat as THREE.ShaderMaterial).uniforms;
        if (u) for (const k of Object.keys(u)) (u[k].value as THREE.Texture | null)?.dispose?.();
        mat.dispose();
      }
    });
    for (const video of this.videos) { video.pause(); video.removeAttribute("src"); video.load(); }
    for (const tex of this.placeholderCache) tex?.dispose();
    this.logoMaterial.map?.dispose();
    this.antialias.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
