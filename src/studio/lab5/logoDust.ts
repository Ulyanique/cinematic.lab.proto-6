import * as THREE from "three";
import { mulberry32 } from "./math";

/** Logo plane size in world units (must match the emblem mesh in Engine). */
export const LOGO_W = 4.2;
export const LOGO_H = 4.42;

const VERT = /* glsl */ `
attribute vec3 aTarget;
attribute vec4 aRand;
uniform float uT;        // seconds since the blast
uniform float uTime;     // film time
uniform float uShine;    // sheen position (same as the emblem material)
uniform float uViewH;    // drawing buffer height in px
uniform float uPower;    // global strength
uniform vec3 uOrigin;
uniform vec3 uLogo;
uniform float uLogoScale;
varying float vInt;
varying float vHot;
varying float vSettle;

float easeOut3(float x){ x = clamp(x, 0.0, 1.0); return 1.0 - pow(1.0 - x, 3.0); }

void main(){
  vec3 rnd = aRand.yzw * 2.0 - 1.0;
  vec3 dir = normalize(rnd + vec3(0.0, 0.18, 0.0) + 1e-3);
  float speed = 7.0 + aRand.x * 24.0;
  float tb = max(uT, 0.0);
  vec3 burst = uOrigin + dir * speed * (1.0 - exp(-tb * 1.5)) / 1.5;

  // particles near the middle of the emblem arrive first, the rim last: it "draws itself" inwards-out
  float rad = length(aTarget.xy) / 2.4;
  float delay = 0.45 + aRand.x * 0.95 + rad * 0.35;
  float k = easeOut3((uT - delay) / 1.55);
  vec3 tgt = uLogo + aTarget * uLogoScale;

  vec3 p = mix(burst, tgt, k);
  // curved, swirling flight path instead of a straight line
  vec3 side = normalize(cross(dir, vec3(0.0, 0.0, 1.0)) + 1e-3);
  p += side * sin(k * 3.14159) * (1.2 + aRand.x * 2.6) * (1.0 - 0.3 * k);
  p.z += sin(k * 3.14159) * rnd.x * 1.4;

  float settle = smoothstep(0.88, 1.0, k);
  float breath = 0.03 + 0.025 * aRand.x;
  p += settle * breath * vec3(
    sin(uTime * 1.3 + aRand.y * 40.0),
    cos(uTime * 1.1 + aRand.z * 40.0),
    sin(uTime * 0.9 + aRand.w * 40.0));

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;

  vec2 uv = aTarget.xy / vec2(${LOGO_W.toFixed(2)}, ${LOGO_H.toFixed(2)}) + 0.5;
  float d = uv.x * 0.78 + (1.0 - uv.y) * 0.62 - uShine;
  float band = exp(-d * d / 0.006);
  float tw = 0.5 + 0.5 * sin(uTime * (2.5 + aRand.x * 7.0) + aRand.y * 90.0);

  vHot = band;
  vSettle = settle;
  float flight = (1.0 - settle) * smoothstep(0.0, 0.12, uT);
  vInt = (flight * 1.9 + settle * (0.10 + 0.10 * tw + band * 1.5)) * uPower;

  float sizeW = mix(0.085, 0.036, settle) * (0.55 + aRand.x * 0.9) * (1.0 + band * settle * 1.4);
  gl_PointSize = clamp(sizeW * projectionMatrix[1][1] * uViewH * 0.5 / max(mv.w, 0.1), 1.2, 14.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;
varying float vInt;
varying float vHot;
varying float vSettle;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c);
  float a = 1.0 - smoothstep(0.0, 0.5, r);
  a *= a;
  float core = 1.0 - smoothstep(0.0, 0.2, r);
  // tiny four-point cross glint on the brightest, settled sparks
  float xr = exp(-abs(c.x) * 38.0) * exp(-abs(c.y) * 7.0) + exp(-abs(c.y) * 38.0) * exp(-abs(c.x) * 7.0);
  float glint = xr * smoothstep(0.6, 1.4, vHot) * vSettle * 0.8;
  vec3 col = mix(vec3(1.0, 0.56, 0.16), vec3(1.0, 0.9, 0.62), clamp(core + vHot * 0.7, 0.0, 1.0));
  gl_FragColor = vec4(col * vInt, (a + glint) * clamp(vInt, 0.0, 1.0));
}
`;

/**
 * The emblem assembles itself out of the blast: thousands of gold sparks fly out of the
 * singularity and settle onto the pixels of the real logo (sampled from its alpha channel),
 * then keep glittering as the sheen travels across the gold.
 */
export class LogoDust {
  readonly points: THREE.Points;
  readonly material: THREE.ShaderMaterial;
  private geometry = new THREE.BufferGeometry();
  private ready = false;
  readonly readyPromise: Promise<void>;

  constructor(
    logoUrl: string,
    origin: THREE.Vector3,
    logoPos: THREE.Vector3,
    shine: { value: number },
    uTime: { value: number },
    count = 9000
  ) {
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uT: { value: -1 },
        uTime,
        uShine: shine,
        uViewH: { value: 1080 },
        uPower: { value: 1 },
        uOrigin: { value: origin.clone() },
        uLogo: { value: logoPos.clone() },
        uLogoScale: { value: 1 },
      },
    });
    // placeholder so the object is valid before the image has been sampled
    this.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(3), 3));
    this.geometry.setAttribute("aTarget", new THREE.BufferAttribute(new Float32Array(3), 3));
    this.geometry.setAttribute("aRand", new THREE.BufferAttribute(new Float32Array(4), 4));
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 12;
    this.points.visible = false;
    this.readyPromise = this.sample(logoUrl, count);
  }

  private sample(url: string, count: number): Promise<void> {
    return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error("Не удалось загрузить изображение логотипа"));
    img.onload = () => {
      const W = 300;
      const H = Math.round((W * LOGO_H) / LOGO_W);
      const cv = document.createElement("canvas");
      cv.width = W;
      cv.height = H;
      const g = cv.getContext("2d", { willReadFrequently: true });
      if (!g) { reject(new Error("Canvas недоступен для частиц логотипа")); return; }
      g.drawImage(img, 0, 0, W, H);
      const data = g.getImageData(0, 0, W, H).data;
      const solid: number[] = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (data[(y * W + x) * 4 + 3] > 140) solid.push(x, y);
      const n = solid.length / 2;
      if (n === 0) { reject(new Error("Логотип не содержит видимых пикселей")); return; }
      const rand = mulberry32(424242);
      const target = new Float32Array(count * 3);
      const rnd = new Float32Array(count * 4);
      for (let i = 0; i < count; i++) {
        const j = Math.floor(rand() * n) * 2;
        const u = (solid[j] + rand()) / W;
        const v = (solid[j + 1] + rand()) / H;
        target[i * 3] = (u - 0.5) * LOGO_W;
        target[i * 3 + 1] = (0.5 - v) * LOGO_H;
        target[i * 3 + 2] = (rand() - 0.5) * 0.08;
        rnd[i * 4] = rand();
        rnd[i * 4 + 1] = rand();
        rnd[i * 4 + 2] = rand();
        rnd[i * 4 + 3] = rand();
      }
      this.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
      this.geometry.setAttribute("aTarget", new THREE.BufferAttribute(target, 3));
      this.geometry.setAttribute("aRand", new THREE.BufferAttribute(rnd, 4));
      this.geometry.computeBoundingSphere();
      this.ready = true;
      resolve();
    };
    img.src = url;
    });
  }

  /** tl = seconds since the blast (<0 hides everything). */
  update(tl: number, viewH: number, power = 1) {
    this.points.visible = this.ready && tl > 0;
    this.material.uniforms.uT.value = tl;
    this.material.uniforms.uViewH.value = viewH;
    this.material.uniforms.uPower.value = power;
  }
}
