import * as THREE from 'three'
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js'
import { glowTexture } from './textures'

const rand = (a: number, b: number) => a + Math.random() * (b - a)

function randDir() {
  const u = Math.random() * 2 - 1
  const a = Math.random() * Math.PI * 2
  const s = Math.sqrt(1 - u * u)
  return new THREE.Vector3(s * Math.cos(a), s * Math.sin(a), u)
}

/**
 * Финал галереи: объёмный взрыв вместо плоского векторного пятна.
 * Огненный шар с шумом и френелем, дым, тлеющие искры, лучи-стрики,
 * ударная волна и осколки — всё в 3D, без фонового градиента и звезды-спрайта.
 */
export class Finale {
  group = new THREE.Group()
  light: THREE.PointLight
  private streakMat: THREE.ShaderMaterial
  private dustMat: THREE.ShaderMaterial
  private ringMat: THREE.ShaderMaterial
  private fireMat: THREE.ShaderMaterial
  private fireball: THREE.Mesh
  private smokeMat: THREE.ShaderMaterial
  private emberMat: THREE.ShaderMaterial
  private halo: THREE.Sprite
  private debris: { m: THREE.Mesh; dir: THREE.Vector3; speed: number; axis: THREE.Vector3; spin: number }[] = []

  constructor(goldMat: THREE.Material, pixelRatio: number) {
    this.group.visible = false

    // ── огненный шар: шум поверхности, френель, остывание ──
    this.fireMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uFade: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec3 vN; varying vec3 vP;
        void main(){
          vN = normalize(normalMatrix * normal);
          vP = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uFade;
        varying vec3 vN; varying vec3 vP;
        float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float noise(vec3 x){
          vec3 i = floor(x);
          vec3 f = fract(x);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(hash(i + vec3(0.,0.,0.)), hash(i + vec3(1.,0.,0.)), f.x),
                         mix(hash(i + vec3(0.,1.,0.)), hash(i + vec3(1.,1.,0.)), f.x), f.y),
                     mix(mix(hash(i + vec3(0.,0.,1.)), hash(i + vec3(1.,0.,1.)), f.x),
                         mix(hash(i + vec3(0.,1.,1.)), hash(i + vec3(1.,1.,1.)), f.x), f.y), f.z);
        }
        float fbm(vec3 p){
          float v = 0.0; float a = 0.5;
          for(int i = 0; i < 4; i++){ v += a * noise(p); p *= 2.03; a *= 0.5; }
          return v;
        }
        void main(){
          float t = uTime;
          // поверхность «кипит»: шум плывёт и закручивается
          float n = fbm(vP * 3.2 + vec3(t * 0.22, t * 0.35, -t * 0.18));
          float n2 = fbm(vP * 7.5 - vec3(t * 0.45));
          float body = smoothstep(0.22, 0.9, n * 0.62 + n2 * 0.5);
          // френель: края шара светятся сильнее — объём вместо плоского диска
          float fres = pow(1.0 - abs(dot(normalize(vN), vec3(0.0, 0.0, 1.0))), 1.6);
          float heat = exp(-t * 0.55);
          vec3 col = mix(vec3(0.30, 0.07, 0.01), vec3(1.0, 0.52, 0.10), body);
          col = mix(col, vec3(1.0, 0.93, 0.72), pow(body, 2.0) * heat);
          float alpha = (body * 0.8 + fres * 0.55) * uFade;
          gl_FragColor = vec4(col * (1.1 + heat * 2.2), alpha);
        }`,
    })
    this.fireball = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), this.fireMat)
    this.fireball.frustumCulled = false
    this.fireball.renderOrder = 2
    this.group.add(this.fireball)

    // ── дым: мягкие тёмные хлопья, расширяются и растворяются ──
    const SN = 140
    const sg = new THREE.BufferGeometry()
    const sdir = new Float32Array(SN * 3)
    const spar = new Float32Array(SN * 3)
    for (let i = 0; i < SN; i++) {
      const d = randDir()
      sdir.set([d.x, d.y, d.z], i * 3)
      spar.set([3 + Math.pow(Math.random(), 1.5) * 16, 2.5 + Math.pow(Math.random(), 2) * 7, Math.random()], i * 3)
    }
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SN * 3), 3))
    sg.setAttribute('aDir', new THREE.BufferAttribute(sdir, 3))
    sg.setAttribute('aP', new THREE.BufferAttribute(spar, 3))
    this.smokeMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: { value: 0 }, uPx: { value: pixelRatio }, uMap: { value: glowTexture() } },
      vertexShader: /* glsl */ `
        attribute vec3 aDir; attribute vec3 aP;
        uniform float uTime; uniform float uPx;
        varying float vA;
        void main(){
          float k = 0.55;
          float r = aP.x * (1.0 - exp(-uTime * k)) / k + 0.5;
          vec3 p = aDir * r + vec3(sin(uTime * 0.4 + aP.z * 40.0), cos(uTime * 0.33 + aP.z * 31.0), 0.0) * (0.4 + uTime * 0.12);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float sz = aP.y * (1.0 + uTime * 1.4) * uPx * (300.0 / max(-mv.z, 0.5));
          gl_PointSize = clamp(sz, 0.0, 260.0);
          vA = exp(-uTime * 0.38) * smoothstep(0.0, 0.15, uTime);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        varying float vA;
        void main(){
          float a = texture2D(uMap, gl_PointCoord).a;
          gl_FragColor = vec4(vec3(0.16, 0.11, 0.07), a * vA * 0.5);
        }`,
    })
    const smoke = new THREE.Points(sg, this.smokeMat)
    smoke.frustumCulled = false
    smoke.renderOrder = 3
    this.group.add(smoke)

    // ── тлеющие искры: яркие точки с гравитацией ──
    const EN = 220
    const eg = new THREE.BufferGeometry()
    const edir = new Float32Array(EN * 3)
    const epar = new Float32Array(EN * 3)
    for (let i = 0; i < EN; i++) {
      const d = randDir()
      edir.set([d.x, d.y, d.z], i * 3)
      epar.set([5 + Math.pow(Math.random(), 1.6) * 30, 0.5 + Math.pow(Math.random(), 2) * 2.2, Math.random()], i * 3)
    }
    eg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(EN * 3), 3))
    eg.setAttribute('aDir', new THREE.BufferAttribute(edir, 3))
    eg.setAttribute('aP', new THREE.BufferAttribute(epar, 3))
    this.emberMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uPx: { value: pixelRatio } },
      vertexShader: /* glsl */ `
        attribute vec3 aDir; attribute vec3 aP;
        uniform float uTime; uniform float uPx;
        varying float vA; varying float vS;
        void main(){
          float t = uTime;
          vec3 p = aDir * (aP.x * t * exp(-t * 0.12)) + vec3(0.0, -1.6 * t * t, 0.0);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(aP.y * uPx * (300.0 / max(-mv.z, 0.5)), 0.0, 26.0);
          vS = aP.z;
          vA = exp(-t * 0.5) * smoothstep(0.0, 0.05, t) * step(0.0, -mv.z);
        }`,
      fragmentShader: /* glsl */ `
        varying float vA; varying float vS;
        void main(){
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c) * 2.0;
          float a = smoothstep(1.0, 0.0, d);
          vec3 col = mix(vec3(1.0, 0.45, 0.08), vec3(1.0, 0.85, 0.4), vS);
          gl_FragColor = vec4(col * a * vA * 2.0, a * vA);
        }`,
    })
    const embers = new THREE.Points(eg, this.emberMat)
    embers.frustumCulled = false
    embers.renderOrder = 6
    this.group.add(embers)

    // ── лучи-стрики ──
    const N = 1400
    const quad = new THREE.InstancedBufferGeometry()
    quad.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3))
    quad.setAttribute('corner', new THREE.BufferAttribute(new Float32Array([0, -1, 0, 1, 1, -1, 1, 1]), 2))
    quad.setIndex([0, 1, 2, 2, 1, 3])
    const dirs = new Float32Array(N * 3)
    const params = new Float32Array(N * 4)
    for (let i = 0; i < N; i++) {
      const d = randDir()
      dirs.set([d.x, d.y, d.z], i * 3)
      const sp = 14 + Math.pow(Math.random(), 1.8) * 120
      params.set([sp, 2 + Math.random() * 26 * (0.4 + sp / 130), 0.8 + Math.random() * 2.8, Math.random()], i * 4)
    }
    quad.setAttribute('aDir', new THREE.InstancedBufferAttribute(dirs, 3))
    quad.setAttribute('aParams', new THREE.InstancedBufferAttribute(params, 4))
    quad.instanceCount = N
    this.streakMat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uRes: { value: new THREE.Vector2(1920, 1080) },
        uPx: { value: pixelRatio },
      },
      vertexShader: /* glsl */ `
        attribute vec2 corner; attribute vec3 aDir; attribute vec4 aParams;
        uniform float uTime; uniform vec2 uRes; uniform float uPx;
        varying float vAlpha; varying vec3 vCol; varying float vY; varying float vX;
        void main(){
          float t = uTime;
          float speed = aParams.x, len = aParams.y, width = aParams.z, seed = aParams.w;
          float k = 1.35;
          float r = speed*(1.0-exp(-t*k))/k + 0.4;
          float lenNow = len*(1.0-exp(-t*5.0));
          vec3 headP = aDir*r;
          vec3 tailP = aDir*max(r-lenNow, 0.0);
          vec4 h = projectionMatrix*modelViewMatrix*vec4(headP,1.0);
          vec4 tl = projectionMatrix*modelViewMatrix*vec4(tailP,1.0);
          if(h.w < 0.5 || tl.w < 0.5){ gl_Position = vec4(3.0,3.0,3.0,1.0); vAlpha=0.0; vCol=vec3(0.); vY=0.; vX=0.; return; }
          vec2 hs = h.xy/h.w, ts = tl.xy/tl.w;
          vec2 d = (hs-ts)*uRes;
          float L = length(d);
          vec2 dn = L>0.0001 ? d/L : vec2(1.0,0.0);
          vec2 n = vec2(-dn.y, dn.x);
          vec4 base = mix(tl,h,corner.x);
          float w = width*uPx*(0.12+0.88*corner.x);
          base.xy += n*corner.y*w*2.0/uRes*base.w;
          gl_Position = base;
          float fade = exp(-t*(0.28+seed*0.35));
          vAlpha = fade*(0.45+0.55*seed)*smoothstep(0.0,0.04,t);
          vec3 gold = vec3(1.0,0.66,0.24);
          vec3 white = vec3(1.0,0.95,0.8);
          vCol = mix(gold, white, smoothstep(0.55,1.0,seed))*(1.2+corner.x*2.2);
          vY = corner.y; vX = corner.x;
        }`,
      fragmentShader: /* glsl */ `
        varying float vAlpha; varying vec3 vCol; varying float vY; varying float vX;
        void main(){
          float edge = 1.0 - vY*vY;
          float a = vAlpha*edge*(0.15+0.85*vX);
          gl_FragColor = vec4(vCol*a, a);
        }`,
    })
    const streaks = new THREE.Mesh(quad, this.streakMat)
    streaks.frustumCulled = false
    streaks.renderOrder = 5
    this.group.add(streaks)

    // ── золотая пыль (боке) ──
    const M = 380
    const dg = new THREE.BufferGeometry()
    const dpos = new Float32Array(M * 3)
    const dpar = new Float32Array(M * 3)
    for (let i = 0; i < M; i++) {
      const d = randDir()
      dpos.set([d.x, d.y, d.z], i * 3)
      dpar.set([4 + Math.pow(Math.random(), 2) * 55, 0.5 + Math.pow(Math.random(), 3) * 5.5, Math.random()], i * 3)
    }
    dg.setAttribute('position', new THREE.BufferAttribute(dpos, 3))
    dg.setAttribute('aParams', new THREE.BufferAttribute(dpar, 3))
    this.dustMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uPx: { value: pixelRatio } },
      vertexShader: /* glsl */ `
        attribute vec3 aParams; uniform float uTime; uniform float uPx;
        varying float vA; varying float vS;
        void main(){
          float k = 0.9;
          float r = aParams.x*(1.0-exp(-uTime*k))/k + 0.5;
          vec3 p = position*r + vec3(sin(uTime*0.6+aParams.z*30.0), cos(uTime*0.5+aParams.z*17.0), 0.0)*0.6;
          vec4 mv = modelViewMatrix*vec4(p,1.0);
          gl_Position = projectionMatrix*mv;
          float sz = aParams.y*uPx*(420.0/max(-mv.z,0.5));
          gl_PointSize = clamp(sz, 0.0, 90.0);
          vS = aParams.z;
          vA = exp(-uTime*0.42)*(0.45+0.55*sin(uTime*(2.0+aParams.z*5.0)+aParams.z*40.0)*0.5+0.25)*smoothstep(0.0,0.1,uTime)*step(0.0,-mv.z);
        }`,
      fragmentShader: /* glsl */ `
        varying float vA; varying float vS;
        void main(){
          vec2 c = gl_PointCoord-0.5;
          float d = length(c)*2.0;
          float a = smoothstep(1.0,0.0,d);
          a = a*a;
          vec3 col = mix(vec3(1.0,0.68,0.25), vec3(1.0,0.92,0.7), vS);
          gl_FragColor = vec4(col*a*vA*1.6, a*vA);
        }`,
    })
    const dust = new THREE.Points(dg, this.dustMat)
    dust.frustumCulled = false
    dust.renderOrder = 6
    this.group.add(dust)

    // ── ударная волна ──
    this.ringMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv; uniform float uTime;
        void main(){
          float d = length(vUv-0.5)*2.0;
          float R = 1.0-exp(-uTime*1.6);
          float w = 0.015 + 0.09*R;
          float ring = exp(-pow((d-R)/w, 2.0));
          float trail = smoothstep(R-0.35, R, d)*step(d,R)*0.25;
          float a = (ring + trail)*exp(-uTime*0.9)*step(0.001,uTime);
          gl_FragColor = vec4(vec3(1.0,0.78,0.4)*a*1.6, a);
        }`,
    })
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(130, 130), this.ringMat)
    ring.renderOrder = 4
    this.group.add(ring)

    // ── мягкое свечение ядра ──
    const glow = glowTexture()
    this.halo = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glow, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false, transparent: true }),
    )
    this.halo.renderOrder = 3
    this.group.add(this.halo)

    // ── осколки ──
    for (let i = 0; i < 90; i++) {
      const s = rand(0.3, 2.0)
      const pts: THREE.Vector3[] = []
      for (let k = 0; k < 7; k++) pts.push(new THREE.Vector3(rand(-1, 1) * s * 1.6, rand(-1, 1) * s, rand(-1, 1) * s * 0.5))
      const m = new THREE.Mesh(new ConvexGeometry(pts), goldMat)
      this.group.add(m)
      this.debris.push({
        m,
        dir: randDir().multiplyScalar(1),
        speed: rand(6, 45),
        axis: randDir(),
        spin: rand(0.4, 2.4),
      })
    }

    this.light = new THREE.PointLight(0xffc873, 0, 0, 2)
    this.group.add(this.light)
  }

  setPixelRatio(pixelRatio: number) {
    this.streakMat.uniforms.uPx.value = pixelRatio
    this.dustMat.uniforms.uPx.value = pixelRatio
    this.smokeMat.uniforms.uPx.value = pixelRatio
    this.emberMat.uniforms.uPx.value = pixelRatio
  }

  setRes(w: number, h: number) {
    this.streakMat.uniforms.uRes.value.set(w, h)
  }

  update(tb: number, now: number) {
    const t = Math.max(tb, 0)
    this.streakMat.uniforms.uTime.value = t
    this.dustMat.uniforms.uTime.value = t
    this.ringMat.uniforms.uTime.value = t
    this.fireMat.uniforms.uTime.value = t
    this.smokeMat.uniforms.uTime.value = t
    this.emberMat.uniforms.uTime.value = t

    // огненный шар: быстрый рост, медленное остывание и сжатие
    const grow = 4 + 22 * (1 - Math.exp(-t * 1.9))
    const shrink = 1 - 0.4 * THREE.MathUtils.smoothstep(t, 2.5, 7)
    this.fireball.scale.setScalar(Math.max(0.001, grow * shrink))
    this.fireMat.uniforms.uFade.value = t > 0.02 ? Math.exp(-t * 0.45) : 0

    // свечение ядра с лёгким мерцанием
    const burst = Math.exp(-t * 1.1)
    const h = 26 + 90 * Math.exp(-t * 1.3)
    this.halo.scale.set(h, h, 1)
    ;(this.halo.material as THREE.SpriteMaterial).opacity = (0.05 + 0.6 * burst) * (1 + 0.03 * Math.sin(now * 0.7))

    this.light.intensity = 9000 * Math.exp(-t * 1.4) + 120

    for (const d of this.debris) {
      const r = (d.speed * (1 - Math.exp(-t * 0.9))) / 0.9 + 1.5
      d.m.position.copy(d.dir).multiplyScalar(r)
      d.m.rotation.set(d.axis.x * t * d.spin, d.axis.y * t * d.spin, d.axis.z * t * d.spin)
      const sc = Math.min(1, t * 3) * (1 - THREE.MathUtils.smoothstep(t, 2, 4.8))
      d.m.scale.setScalar(sc)
    }
  }
}
