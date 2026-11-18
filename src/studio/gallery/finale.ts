import * as THREE from 'three'
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js'
import { backdropTexture, starTexture, glowTexture } from './textures'

const rand = (a: number, b: number) => a + Math.random() * (b - a)

function randDir() {
  const u = Math.random() * 2 - 1
  const a = Math.random() * Math.PI * 2
  const s = Math.sqrt(1 - u * u)
  return new THREE.Vector3(s * Math.cos(a), s * Math.sin(a), u)
}

export class Finale {
  group = new THREE.Group()
  light: THREE.PointLight
  private streakMat: THREE.ShaderMaterial
  private dustMat: THREE.ShaderMaterial
  private ringMat: THREE.ShaderMaterial
  private star: THREE.Sprite
  private halo: THREE.Sprite
  private halo2: THREE.Sprite
  private backdrop: THREE.Mesh
  private debris: { m: THREE.Mesh; dir: THREE.Vector3; speed: number; axis: THREE.Vector3; spin: number }[] = []

  constructor(goldMat: THREE.Material, pixelRatio: number) {
    this.group.visible = false

    // ── фон ──
    const bt = backdropTexture()
    this.backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(420, 240),
      new THREE.MeshBasicMaterial({ map: bt, fog: false, depthWrite: false }),
    )
    this.backdrop.position.z = -90
    this.group.add(this.backdrop)

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

    // ── звезда в центре ──
    const star = starTexture(16, 11)
    this.star = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: star, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false, transparent: true }),
    )
    this.star.renderOrder = 7
    this.group.add(this.star)
    const glow = glowTexture()
    this.halo = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glow, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false, transparent: true }),
    )
    this.halo.renderOrder = 3
    this.group.add(this.halo)
    this.halo2 = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: star, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false, transparent: true, rotation: 0.6 }),
    )
    this.halo2.renderOrder = 7
    this.group.add(this.halo2)

    // ── осколки ──
    for (let i = 0; i < 70; i++) {
      const s = rand(0.35, 1.5)
      const pts: THREE.Vector3[] = []
      for (let k = 0; k < 7; k++) pts.push(new THREE.Vector3(rand(-1, 1) * s * 1.6, rand(-1, 1) * s, rand(-1, 1) * s * 0.5))
      const m = new THREE.Mesh(new ConvexGeometry(pts), goldMat)
      this.group.add(m)
      this.debris.push({
        m,
        dir: randDir().multiplyScalar(1),
        speed: rand(6, 38),
        axis: randDir(),
        spin: rand(0.4, 2.4),
      })
    }

    this.light = new THREE.PointLight(0xffc873, 0, 0, 2)
    this.group.add(this.light)
  }

  setPixelRatio(pixelRatio: number) {
    this.streakMat.uniforms.uPx.value = pixelRatio
  }

  setRes(w: number, h: number) {
    this.streakMat.uniforms.uRes.value.set(w, h)
  }

  update(tb: number, now: number) {
    const t = Math.max(tb, 0)
    this.streakMat.uniforms.uTime.value = t
    this.dustMat.uniforms.uTime.value = t
    this.ringMat.uniforms.uTime.value = t

    const burst = Math.exp(-t * 1.1)
    const s1 = 9 + 70 * Math.exp(-t * 2.6)
    this.star.scale.set(s1 * 2.0, s1 * 2.0, 1)
    ;(this.star.material as THREE.SpriteMaterial).opacity = 0.015 + 0.75 * burst
    ;(this.star.material as THREE.SpriteMaterial).rotation = t * 0.05
    const s2 = 14 + 30 * Math.exp(-t * 1.6)
    this.halo2.scale.set(s2 * 2, s2 * 2, 1)
    ;(this.halo2.material as THREE.SpriteMaterial).opacity = 0.02 + 0.4 * burst
    this.halo2.material.rotation = 0.6 - t * 0.04
    const h = 30 + 110 * Math.exp(-t * 1.1)
    this.halo.scale.set(h, h, 1)
    ;(this.halo.material as THREE.SpriteMaterial).opacity = 0.05 + 0.65 * burst

    this.light.intensity = 9000 * Math.exp(-t * 1.4) + 120
    ;(this.backdrop.material as THREE.MeshBasicMaterial).color.setScalar(0.5 + 0.38 * burst + 0.025 * Math.sin(now * 0.7))

    for (const d of this.debris) {
      const r = (d.speed * (1 - Math.exp(-t * 0.9))) / 0.9 + 1.5
      d.m.position.copy(d.dir).multiplyScalar(r)
      d.m.rotation.set(d.axis.x * t * d.spin, d.axis.y * t * d.spin, d.axis.z * t * d.spin)
      const sc = Math.min(1, t * 3) * (1 - THREE.MathUtils.smoothstep(t, 2, 4.8))
      d.m.scale.setScalar(sc)
    }
  }
}
