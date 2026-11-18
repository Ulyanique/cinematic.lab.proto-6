// @ts-nocheck
import * as THREE from 'three';

export const sharedGold = {
  uSweepX: { value: -20 },
  uSweepAmt: { value: 0 },
  uTime: { value: 0 },
};

const GOLD_FRAG_HEAD = /* glsl */ `
uniform float uReveal, uExtent, uFlash, uTime, uSweepX, uSweepAmt;
uniform vec3 uCenter, uDir, uGD, uGM, uGT;
uniform vec2 uGradY;
varying vec3 vLocal;
varying vec3 vWorldP;
float gh31(vec3 p){ p=fract(p*0.3183099+vec3(.1,.2,.3)); p*=17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float gn3(vec3 x){
  vec3 i=floor(x), f=fract(x); f=f*f*(3.-2.*f);
  return mix(mix(mix(gh31(i),gh31(i+vec3(1,0,0)),f.x),mix(gh31(i+vec3(0,1,0)),gh31(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(gh31(i+vec3(0,0,1)),gh31(i+vec3(1,0,1)),f.x),mix(gh31(i+vec3(0,1,1)),gh31(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float gfbm(vec3 p){ return gn3(p)*.55+gn3(p*2.03)*.3+gn3(p*4.1)*.15; }
`;

export function makeGold(params = {}) {
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 1,
    roughness: params.roughness ?? 0.27,
    clearcoat: 0.55,
    clearcoatRoughness: 0.1,
    envMapIntensity: params.env ?? 1.5,
  });
  const u = {
    // По умолчанию эмблема полностью вырезана: uReveal=0 отбрасывает ВСЕ фрагменты
    // золота (if(dm>drv) discard), то есть «забыл включить reveal» = невидимая деталь.
    // Интро всё равно перезаписывает uReveal каждый кадр анимации.
    uReveal: { value: 1 },
    uCenter: { value: new THREE.Vector3() },
    uDir: { value: new THREE.Vector3(0, -1, 0) },
    uExtent: { value: 1 },
    uFlash: { value: 0 },
    uGD: { value: new THREE.Color('#e4b159') },
    uGM: { value: new THREE.Color('#ffe29e') },
    uGT: { value: new THREE.Color('#fff2c8') },
    uGradY: { value: new THREE.Vector2(params.gradBot ?? -1, params.gradTop ?? 3) },
    uTime: sharedGold.uTime,
    uSweepX: sharedGold.uSweepX,
    uSweepAmt: sharedGold.uSweepAmt,
  };
  mat.userData.u = u;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLocal;\nvarying vec3 vWorldP;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvLocal=position;\nvWorldP=(modelMatrix*vec4(position,1.0)).xyz;'
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GOLD_FRAG_HEAD)
      .replace(
        '#include <clipping_planes_fragment>',
        /* glsl */ `#include <clipping_planes_fragment>
        float dn=gfbm(vLocal*5.0+3.1);
        float ds=clamp(dot(vLocal-uCenter,uDir)/uExtent+0.5,0.,1.);
        float dm=ds*0.62+dn*0.38;
        float drv=uReveal*1.3-0.14;
        if(dm>drv) discard;
        float dedge=1.0-smoothstep(0.0,0.08,drv-dm);
        `
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        float gy=clamp((vWorldP.y-uGradY.x)/(uGradY.y-uGradY.x),0.,1.);
        vec3 gDeep=uGD;
        vec3 gMid=uGM;
        vec3 gTop=uGT;
        vec3 gcol=mix(gDeep,gMid,smoothstep(0.0,0.55,gy));
        gcol=mix(gcol,gTop,smoothstep(0.45,1.0,gy));
        diffuseColor.rgb*=gcol;
        `
      )
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
        totalEmissiveRadiance+=gcol*gcol*0.2*(0.8+0.4*dn);
        totalEmissiveRadiance+=vec3(1.0,0.5,0.1)*dedge*5.0;
        totalEmissiveRadiance+=vec3(1.0,0.62,0.22)*uFlash*0.55;
        float sweepDist=(vWorldP.x-uSweepX)*0.9;
        float sheen=exp(-sweepDist*sweepDist);
        totalEmissiveRadiance+=vec3(1.0,0.72,0.34)*sheen*uSweepAmt*0.22*(0.5+0.5*dn);
        `
      );
  };
  mat.customProgramCacheKey = () => 'gold-v1';
  return mat;
}

/** Studio-like HDR environment: soft boxes and stripes for gold reflections. */
export function makeEnvironment(renderer) {
  const s = new THREE.Scene();
  const room = new THREE.Mesh(
    new THREE.BoxGeometry(60, 60, 60),
    new THREE.MeshBasicMaterial({ color: 0x080402, side: THREE.BackSide })
  );
  s.add(room);
  const panel = (w, h, pos, color, k) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide })
    );
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    s.add(m);
  };
  // top soft box
  panel(26, 6, [0, 20, 6], 0xfff2dc, 6);
  // side amber strips
  panel(5, 28, [-20, 2, 4], 0xffb45a, 4);
  panel(5, 28, [20, 0, 6], 0xffffff, 5);
  // front (behind the camera) vertical stripes: sliding highlights on flat faces
  const front = [
    [-26, 0xffd9a0, 1.2],
    [-17, 0xfff4e0, 5.5],
    [-8, 0xff9a3c, 0.9],
    [0, 0xffffff, 3.0],
    [9, 0xffcf8a, 6.5],
    [18, 0xff8c2e, 1.0],
    [27, 0xfff0d0, 4.5],
  ];
  front.forEach(([x, c, k]) => panel(6, 40, [x, 4, 34], c, k));
  // floor warmth
  panel(40, 10, [0, -18, 10], 0xff8a2a, 2.2);
  // dark flags for contrast
  panel(10, 40, [-3.5, 4, 33], 0x000000, 1);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(s, 0.025);
  pmrem.dispose();
  s.traverse((obj) => {
    obj.geometry?.dispose();
    obj.material?.dispose();
  });
  return rt;
}
