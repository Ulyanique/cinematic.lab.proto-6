// All GLSL used by the intro lives here.

export const NOISE = /* glsl */ `
float h31(vec3 p){ p=fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float noise3(vec3 x){
  vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.-2.*f);
  return mix(
    mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x), mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x), f.y),
    mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x), mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x), f.y),
    f.z);
}
float fbm3(vec3 p){
  float s=0.; float a=.5;
  for(int i=0;i<4;i++){ s+=a*noise3(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=.5; }
  return s;
}
float hash11(float n){ return fract(sin(n*91.345)*47453.5453); }
`;

// Fake studio environment that makes flat gold facets glint like liquid metal
export const ENV = /* glsl */ `
vec3 envGold(vec3 r, float rough, float t){
  float y=r.y;
  vec3 horizon=vec3(1.0,0.46,0.09);
  vec3 zenith=vec3(0.07,0.03,0.008);
  vec3 ground=vec3(0.30,0.13,0.03);
  vec3 c=mix(ground,horizon,smoothstep(-0.55,0.03,y));
  c=mix(c,zenith,smoothstep(0.02,0.8,y));
  float a=atan(r.z,r.x);
  float band=smoothstep(0.55,0.97,sin(a*3.0+t*0.10)*0.5+0.5);
  c+=vec3(1.9,1.2,0.5)*band*smoothstep(0.02,0.45,y)*(1.-smoothstep(0.5,0.95,y))*0.8;
  vec3 L1=normalize(vec3(0.35,0.55,-0.75));
  c+=vec3(4.2,2.8,1.2)*pow(max(dot(r,L1),0.),mix(46.,7.,rough));
  vec3 L2=normalize(vec3(-0.65,0.35,0.5));
  c+=vec3(2.4,1.5,0.6)*pow(max(dot(r,L2),0.),mix(32.,5.,rough));
  vec3 L3=normalize(vec3(0.2,0.9,0.3));
  c+=vec3(1.6,1.1,0.6)*pow(max(dot(r,L3),0.),mix(24.,6.,rough));
  return c;
}
`;

/* ------------------------------------------------------------------ facets (terrain, towers, monoliths) */

export const FACET_VERT = /* glsl */ `
attribute vec3 aBary;
attribute vec3 aCenter;
attribute float aRand;
attribute float aH;
uniform float uTime;
uniform float uRise;
uniform float uBuildR;
uniform vec3 uAnchor;
uniform float uHeight;
uniform float uBlastT;
uniform vec3 uBlastPos;
uniform float uShockK;
varying vec3 vBary;
varying vec3 vWorld;
varying float vRand;
varying float vH;
varying float vShock;
${NOISE}
void main(){
  vec3 p=position;
  vec3 c=aCenter;
  float e=1.0;
  vec3 off=vec3(0.0);
  #ifdef TERRAIN
    float d=distance(c.xz,uAnchor.xz);
    float t=clamp((uBuildR-d-aRand*26.)/24.,0.,1.);
    e=t*t*(3.-2.*t);
    off=vec3(0.,-70.*(1.-e),0.);
  #else
    float t=clamp(uRise*1.6-aRand*0.6,0.,1.);
    e=1.-pow(1.-t,3.);
    vec3 rv=vec3(hash11(aRand*13.1)-.5,0.,hash11(aRand*7.7)-.5)*14.;
    off=vec3(rv.x*(1.-e),-(uHeight+8.)*(1.-e)*(0.6+0.8*aRand),rv.z*(1.-e));
  #endif
  p=c+(p-c)*e+off;
  vec3 wc=(modelMatrix*vec4(c,1.)).xyz;
  vec3 wp=(modelMatrix*vec4(p,1.)).xyz;
  float dist=distance(wc.xz,uBlastPos.xz);
  float R=uBlastT*72.;
  float live=step(0.,uBlastT);
  float w=exp(-pow((dist-R)/(8.+R*0.12),2.))*live*exp(-uBlastT*0.55);
  vec3 dir3=vec3(wc.x-uBlastPos.x,0.,wc.z-uBlastPos.z);
  vec3 dir=dir3/(length(dir3)+1e-3);
  wp.y+=w*(4.+aRand*10.)*uShockK;
  wp+=dir*w*(1.5+aRand*3.)*uShockK;
  // lift the facets around the blast
  wp=mix(wp,wc+(wp-wc)*(1.0+w*0.5*uShockK),0.8);
  vShock=w;
  vBary=aBary;
  vWorld=wp;
  vRand=aRand;
  vH=aH;
  gl_Position=projectionMatrix*viewMatrix*vec4(wp,1.);
}
`;

export const FACET_FRAG = /* glsl */ `
precision highp float;
varying vec3 vBary;
varying vec3 vWorld;
varying float vRand;
varying float vH;
varying float vShock;
uniform float uTime;
uniform float uEdge;
uniform float uGlow;
uniform float uFocus;
uniform float uBlastLight;
uniform vec3 uBlastPos;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uDim;
${ENV}
void main(){
  vec3 dx=dFdx(vWorld);
  vec3 dy=dFdy(vWorld);
  vec3 n=normalize(cross(dx,dy));
  vec3 toCam=cameraPosition-vWorld;
  float dist=length(toCam);
  vec3 V=toCam/dist;
  if(dot(n,V)<0.) n=-n;
  float fvar=fract(vRand*37.17);
  float rough=0.12+fvar*0.6;
  vec3 R=reflect(-V,n);
  float ndv=clamp(dot(n,V),0.,1.);
  float fres=pow(1.-ndv,5.);
  vec3 F0=vec3(1.0,0.70,0.26);
  vec3 F=mix(F0,vec3(1.0,0.93,0.72),fres);
  vec3 col=envGold(R,rough,uTime)*F*(0.12+0.5*fvar);
  vec3 L=normalize(vec3(0.35,0.65,-0.45));
  col+=F0*vec3(1.0,0.55,0.22)*0.10*max(dot(n,L),0.);

  float hm=step(0.,vH);
  float hn=clamp(vH,0.,1.);
  float inner=pow(1.-hn,2.2)*hm;
  col+=vec3(1.0,0.52,0.10)*(inner*0.75+0.05*hm)*uGlow*(0.55+0.7*fract(vRand*13.3));

  float e=min(min(vBary.x,vBary.y),vBary.z);
  float fw=fwidth(e);
  float line=1.-smoothstep(0.,fw*0.9,e);
  float halo=1.-smoothstep(0.,fw*5.,e);
  float far=1./(1.+fw*26.);
  float pulse=0.72+0.28*sin(vWorld.x*0.045+vWorld.z*0.06-uTime*1.3+vRand*6.);
  vec3 edgeCol=vec3(0.62,0.34,0.10);
  float eI=uEdge*(1.+uFocus*1.3+vShock*3.)*pulse*far;
  col+=edgeCol*(line*1.05+halo*0.08)*eI;
  col+=vec3(1.0,0.8,0.45)*vShock*0.5;

  vec3 toB=uBlastPos-vWorld;
  float d2=dot(toB,toB);
  float att=uBlastLight/(1.+d2*0.004);
  col+=vec3(1.0,0.72,0.38)*att*(0.3+0.7*max(dot(n,normalize(toB)),0.))*(0.6+0.6*fvar);

  float fogF=1.-exp(-pow(dist*uFogDensity,1.5));
  vec3 fogC=uFogColor*(1.0+0.6*exp(-max(vWorld.y,0.)*0.08));
  col=mix(col,fogC,clamp(fogF,0.,1.));
  col*=uDim;
  gl_FragColor=vec4(col,1.);
}
`;

/* ------------------------------------------------------------------ video placeholder screens */

export const SCREEN_VERT = /* glsl */ `
attribute vec3 aScr;
varying vec3 vScr;
varying vec3 vWorld;
void main(){
  vScr=aScr;
  vec4 wp=modelMatrix*vec4(position,1.);
  vWorld=wp.xyz;
  gl_Position=projectionMatrix*viewMatrix*wp;
}
`;

export const SCREEN_FRAG = /* glsl */ `
precision highp float;
varying vec3 vScr;
varying vec3 vWorld;
uniform sampler2D uTex;
uniform float uTime;
uniform float uOn;
uniform float uFocus;
uniform float uAspect;
uniform float uMediaAspect;
uniform float uVideoBrightness;
uniform float uSeed;
uniform float uBlastLight;
uniform vec3 uBlastPos;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uDim;
${NOISE}
${ENV}
void main(){
  float u=vScr.x/vScr.y;
  float v=vScr.z;
  if(u<0.||u>1.) discard;

  // CRT-style power on: a line grows horizontally, then opens vertically
  float p1=clamp(uOn/0.35,0.,1.);
  float p2=clamp((uOn-0.35)/0.65,0.,1.);
  p2=p2*p2*(3.-2.*p2);
  float halfH=mix(0.003,0.5,p2);
  float halfW=mix(0.0,0.5,p1);
  float mH=1.-smoothstep(halfH-0.004,halfH+0.004,abs(v-0.5));
  float mW=1.-smoothstep(halfW-0.01,halfW+0.01,abs(u-0.5));
  float m=mH*mW*step(0.001,uOn);

  // Fit 16:9 footage inside the near-square facade without cropping or stretching.
  float mediaY=(v-0.5)*uMediaAspect/uAspect+0.5;
  vec4 tex=texture2D(uTex,vec2(u,clamp(mediaY,0.0,1.0)));
  vec3 col=vec3(0.008,0.004,0.002);
  if(mediaY>=0.0 && mediaY<=1.0) col=tex.rgb*1.25*uVideoBrightness;

  // scan lines + gentle flicker
  float ph=fwidth(v)*820.;
  float scan=mix(0.9,0.9+0.1*sin(v*820.+uTime*0.8),1.-smoothstep(0.7,1.8,ph));
  col*=scan;
  col*=0.985+0.015*sin(uTime*2.3+uSeed*20.);

  // glowing gold frame
  float dE=min(min(u,1.-u)*uAspect,min(v,1.-v));
  float frame=1.-smoothstep(0.0,0.014,dE);
  float frameGlow=1.-smoothstep(0.0,0.07,dE);
  col+=vec3(1.0,0.62,0.14)*(frame*2.6+frameGlow*0.22);

  // glassy reflection of the environment
  vec3 dx=dFdx(vWorld); vec3 dy=dFdy(vWorld);
  vec3 n=normalize(cross(dx,dy));
  vec3 toCam=cameraPosition-vWorld;
  float dist=length(toCam);
  vec3 V=toCam/dist;
  if(dot(n,V)<0.) n=-n;
  vec3 R=reflect(-V,n);
  float fres=pow(1.-clamp(dot(n,V),0.,1.),3.);
  col+=envGold(R,0.5,uTime)*(0.05+0.35*fres);

  // power-on bar
  float bar=exp(-pow((v-0.5)/0.01,2.))*(1.-p2)*step(0.001,uOn);
  col+=vec3(2.5,2.0,1.4)*bar*mW;

  col*=0.45+0.95*uFocus+0.15;
  col*=m;

  vec3 toB=uBlastPos-vWorld;
  col+=vec3(1.0,0.7,0.35)*uBlastLight/(1.+dot(toB,toB)*0.004)*0.35*m;

  float fogF=1.-exp(-pow(dist*uFogDensity,1.5));
  col=mix(col,uFogColor*m,clamp(fogF,0.,1.));
  col*=uDim;
  if(m<0.002) discard;
  gl_FragColor=vec4(col,1.);
}
`;

/* ------------------------------------------------------------------ sky */

export const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main(){
  vDir=normalize(position);
  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
}
`;

export const SKY_FRAG = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform float uTime;
uniform float uGlow;
uniform float uFlame;
uniform float uDim;
${NOISE}
void main(){
  vec3 d=normalize(vDir);
  float y=d.y;
  vec3 zenith=vec3(0.010,0.0045,0.0015);
  vec3 horizon=vec3(0.26,0.10,0.016);
  float g=exp(-max(y,0.)*5.0);
  vec3 col=mix(zenith,horizon,g*0.72);
  col+=vec3(0.35,0.13,0.02)*exp(-abs(y)*28.)*0.9;
  float f=fbm3(vec3(d.x*9.,d.z*9.,y*16.-uTime*0.55));
  float f2=fbm3(vec3(d.x*22.+f*2.,d.z*22.,y*30.-uTime*0.9));
  float flame=smoothstep(0.38,0.85,f*0.7+f2*0.5)*exp(-max(y,0.)*7.5)*smoothstep(-0.08,0.01,y);
  col+=vec3(1.0,0.48,0.09)*flame*0.55*uFlame;
  col*=1.+uGlow*2.2;
  col+=vec3(1.0,0.6,0.25)*uGlow*0.4;
  col*=uDim;
  gl_FragColor=vec4(col,1.);
}
`;

/* ------------------------------------------------------------------ dust / embers */

export const DUST_VERT = /* glsl */ `
attribute vec4 aData;
uniform float uTime;
uniform float uSize;
uniform float uPx;
uniform vec3 uBox;
uniform float uAlpha;
varying float vA;
void main(){
  vec3 p=aData.xyz*uBox;
  p.y+=uTime*(0.5+aData.w*1.6);
  p.x+=sin(uTime*0.3+aData.w*20.)*1.8;
  p.z+=cos(uTime*0.27+aData.w*13.)*1.8;
  vec3 rel=mod(p-cameraPosition+uBox*0.5,uBox)-uBox*0.5;
  vec3 wp=cameraPosition+rel;
  vec4 mv=viewMatrix*vec4(wp,1.);
  gl_Position=projectionMatrix*mv;
  float d=max(-mv.z,1.);
  gl_PointSize=clamp(uSize*uPx*(0.35+aData.w)*(55./d),1.,26.*uPx);
  float edge=(1.-smoothstep(0.30,0.5,length(rel.xz)/uBox.x))*(1.-smoothstep(0.30,0.5,abs(rel.y)/uBox.y));
  float tw=0.55+0.45*sin(uTime*(1.5+aData.w*4.)+aData.w*40.);
  vA=edge*tw*uAlpha*smoothstep(0.5,6.,d);
}
`;

export const DUST_FRAG = /* glsl */ `
precision highp float;
varying float vA;
void main(){
  float d=length(gl_PointCoord-.5);
  float a=smoothstep(.5,0.,d);
  a*=a;
  gl_FragColor=vec4(vec3(1.0,0.72,0.3)*1.6,a*vA);
}
`;

/* ------------------------------------------------------------------ blast / implode particles */

export const BLAST_VERT = /* glsl */ `
attribute vec3 aDir;
attribute vec3 aInfo; // speed, rand, size
uniform float uT;
uniform float uImplode;
uniform float uPower;
uniform vec3 uCenter;
uniform float uPx;
uniform float uTime;
varying float vA;
varying float vHeat;
varying float vAngle;
varying float vRand;
void main(){
  float speed=aInfo.x;
  float rnd=aInfo.y;
  float size=aInfo.z;
  vec3 pos;
  float a;
  float heat;
  float sz=size;
  if(uT<0.){
    float k=clamp(uImplode*1.35-rnd*0.35,0.,1.);
    float kk=k*k*k;
    float rad=(34.+speed*1.4)*(1.-kk);
    vec3 d=aDir;
    float ang=kk*7.0*(0.5+rnd)+rnd*6.28*0.0;
    float cs=cos(ang); float sn=sin(ang);
    d.xz=mat2(cs,-sn,sn,cs)*d.xz;
    pos=uCenter+d*rad;
    a=smoothstep(0.0,0.12,uImplode)*(1.-smoothstep(0.8,1.0,k))*0.6;
    heat=kk;
    sz*=0.6+kk*1.4;
  } else {
    // Slightly staggered launch and slower drag leave visible, separate spark trails
    // instead of merging into one instantaneous white flash.
    float age=max(uT-rnd*0.10,0.);
    float launched=step(rnd*0.10,uT);
    float drag=0.55+rnd*0.7;
    float s=(1.-exp(-age*drag))/drag*speed;
    pos=uCenter+aDir*s;
    pos.y-=0.5*age*age*(1.5+rnd*3.);
    a=launched*exp(-age*(0.24+rnd*0.42));
    heat=exp(-age*0.72);
    sz*=1.0+0.25*sin(uTime*2.+rnd*30.);
  }
  vec4 mv=viewMatrix*vec4(pos,1.);
  vec4 clip=projectionMatrix*mv;
  gl_Position=clip;
  vec3 velocity=aDir*speed;
  if(uT>=0.) velocity.y-=uT*(1.5+rnd*3.);
  vec4 ahead=projectionMatrix*viewMatrix*vec4(pos+velocity*0.08,1.);
  vec2 motion=ahead.xy/max(ahead.w,1e-4)-clip.xy/max(clip.w,1e-4);
  vAngle=atan(motion.y,motion.x);
  float d=max(-mv.z,0.5);
  gl_PointSize=clamp(sz*uPx*(62./d),1.,28.*uPx);
  vA=a*uPower;
  vHeat=heat;
  vRand=rnd;
}
`;

export const BLAST_FRAG = /* glsl */ `
precision highp float;
varying float vA;
varying float vHeat;
varying float vAngle;
varying float vRand;
void main(){
  // Rotate each spark along its projected velocity to read as a short firework trail.
  vec2 p=gl_PointCoord-0.5;
  float c=cos(vAngle), s=sin(vAngle);
  p=mat2(c,-s,s,c)*p;
  float streak=length(vec2(p.x*0.52,p.y*1.8));
  float a=1.-smoothstep(0.08,0.48,streak);
  float core=1.-smoothstep(0.02,0.16,length(p));
  a=max(a*0.75,core);
  vec3 ember=vec3(1.0,0.16,0.025);
  vec3 gold=vec3(1.0,0.48,0.08);
  vec3 pale=vec3(1.0,0.62,0.20);
  vec3 col=mix(ember,gold,smoothstep(0.1,0.7,vHeat));
  col=mix(col,pale,clamp(vHeat*0.45+fract(vRand*17.)*0.12,0.,0.58));
  gl_FragColor=vec4(col*(0.6+vHeat*0.65),a*vA*0.62);
}
`;

/* ------------------------------------------------------------------ fireball / core */

export const CORE_VERT = /* glsl */ `
uniform float uTime;
uniform float uDisp;
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
${NOISE}
void main(){
  vec3 p=position;
  float n=noise3(position*1.4+vec3(0.,-uTime*1.6,0.));
  p+=normal*(n-.5)*uDisp;
  vP=position;
  vec4 mv=modelViewMatrix*vec4(p,1.);
  vV=-mv.xyz;
  vN=normalize(normalMatrix*normal);
  gl_Position=projectionMatrix*mv;
}
`;

export const CORE_FRAG = /* glsl */ `
precision highp float;
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
uniform float uTime;
uniform float uI;
uniform vec3 uColA;
uniform vec3 uColB;
${NOISE}
void main(){
  float f=pow(1.-abs(dot(normalize(vN),normalize(vV))),1.5);
  float n=fbm3(vP*1.7+vec3(0.,-uTime*1.7,0.));
  vec3 col=mix(uColA,uColB,clamp(n*1.5,0.,1.))*(0.5+f*1.8+n);
  gl_FragColor=vec4(col*uI,clamp(uI,0.,1.)*(0.3+f*0.9));
}
`;

/* ------------------------------------------------------------------ billboard flare, rays, halos */

export const FLARE_VERT = /* glsl */ `
varying vec2 vUv;
void main(){
  vUv=uv;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
}
`;

export const FLARE_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform float uI;
uniform float uRays;
uniform float uStreak;
uniform vec3 uColor;
void main(){
  vec2 p=vUv-.5;
  float r=length(p);
  float a=atan(p.y,p.x);
  float rays=pow(abs(sin(a*7.+uTime*0.25)),28.)*0.8
            +pow(abs(sin(a*13.-uTime*0.18+1.3)),48.)*0.55
            +pow(abs(sin(a*3.+uTime*0.1+0.7)),16.)*0.45;
  float core=exp(-r*r*70.)*2.2;
  float glow=exp(-r*6.5)*0.55;
  float streak=exp(-abs(p.y)*70.)*exp(-abs(p.x)*5.5)*1.4*uStreak;
  float v=core+glow+rays*uRays*exp(-r*5.)+streak;
  v*=smoothstep(0.5,0.18,r);
  gl_FragColor=vec4(uColor*v*uI,clamp(v*uI,0.,1.));
}
`;

/* ------------------------------------------------------------------ shockwave ring on the ground */

export const RING_VERT = /* glsl */ `
varying vec2 vXZ;
void main(){
  vXZ=position.xy;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
}
`;

export const RING_FRAG = /* glsl */ `
precision highp float;
varying vec2 vXZ;
uniform float uR;
uniform float uW;
uniform float uI;
uniform float uTime;
${NOISE}
void main(){
  float r=length(vXZ);
  float a=atan(vXZ.y,vXZ.x);
  float n=noise3(vec3(cos(a)*3.,sin(a)*3.,uTime*0.6));
  float rr=uR*(0.97+0.06*n);
  float ring=exp(-pow((r-rr)/uW,2.));
  float trail=step(r,rr)*exp(-(rr-r)/(uW*6.))*0.1;
  float v=ring*1.6+trail;
  v*=1.-smoothstep(0.4,0.5,length(vXZ)/400.);
  gl_FragColor=vec4(vec3(1.0,0.66,0.22)*v*uI,clamp(v*uI,0.,1.));
}
`;

/* ------------------------------------------------------------------ compass-drawn sigil on the arena floor */

export const SIGIL_VERT = RING_VERT;

export const SIGIL_FRAG = /* glsl */ `
precision highp float;
varying vec2 vXZ;
uniform float uDraw;
uniform float uI;
uniform float uTime;
const float PI=3.14159265;
float circ(vec2 p, vec2 c, float R, float w, float draw, float start){
  vec2 q=p-c;
  float d=abs(length(q)-R);
  float ang=fract((atan(q.y,q.x)/(2.*PI))+0.5-start);
  float vis=step(ang,draw);
  float line=exp(-pow(d/w,2.));
  float tip=exp(-pow((ang-draw)*R*0.5,2.))*step(0.0001,draw)*step(draw,0.999)*exp(-pow(d/(w*3.),2.));
  return (line*vis+tip*2.5);
}
void main(){
  vec2 p=vXZ;
  float r=length(p);
  float w=0.06+r*0.0016;
  float v=0.;
  float dr=clamp(uDraw,0.,1.);
  v+=circ(p,vec2(0.),4.0,w,clamp(dr*3.-0.0,0.,1.),0.0);
  v+=circ(p,vec2(0.),6.0,w,clamp(dr*3.-0.4,0.,1.),0.2);
  v+=circ(p,vec2(0.),12.0,w,clamp(dr*3.-0.8,0.,1.),0.5)*0.9;
  v+=circ(p,vec2(0.),17.0,w*1.4,clamp(dr*3.-1.2,0.,1.),0.1)*0.8;
  v+=circ(p,vec2(0.),23.0,w*1.8,clamp(dr*3.-1.6,0.,1.),0.7)*0.6;
  for(int i=0;i<6;i++){
    float a=float(i)*PI/3.;
    vec2 c=vec2(cos(a),sin(a))*6.0;
    v+=circ(p,c,6.0,w,clamp(dr*2.6-0.6-float(i)*0.12,0.,1.),float(i)*0.17)*0.8;
  }
  // radial ticks between r=12..14
  float ang=atan(p.y,p.x);
  float tick=pow(abs(sin(ang*36.)),60.)*smoothstep(12.8,13.2,r)*(1.-smoothstep(14.8,15.2,r));
  v+=tick*0.7*smoothstep(0.5,1.,dr);
  v*=exp(-r*0.045);
  float fade=1.-smoothstep(28.,35.,r);
  v*=fade;
  gl_FragColor=vec4(vec3(1.0,0.64,0.18)*v*uI,clamp(v*uI,0.,1.));
}
`;

/* ------------------------------------------------------------------ light beams above monoliths */

export const BEAM_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
varying float vY;
void main(){
  vY=uv.y;
  vec4 mv=modelViewMatrix*vec4(position,1.);
  vN=normalize(normalMatrix*normal);
  vV=normalize(-mv.xyz);
  gl_Position=projectionMatrix*mv;
}
`;

export const BEAM_FRAG = /* glsl */ `
precision highp float;
varying vec3 vN;
varying vec3 vV;
varying float vY;
uniform float uI;
uniform float uTime;
void main(){
  float f=pow(abs(dot(normalize(vN),normalize(vV))),1.6);
  float g=pow(1.-vY,2.4);
  float flicker=0.9+0.1*sin(uTime*1.8+vY*9.);
  float v=f*g*flicker*uI;
  gl_FragColor=vec4(vec3(1.0,0.6,0.16)*v*1.4,v);
}
`;

/* ------------------------------------------------------------------ final post pass */

export const POST_VERT = /* glsl */ `
varying vec2 vUv;
void main(){
  vUv=uv;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
}
`;

export const POST_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tDiffuse;
uniform float uTime;
uniform float uFlash;
uniform float uAber;
uniform float uZoom;
uniform float uVig;
uniform float uFade;
uniform float uGrain;
uniform float uShockR;
uniform float uShockAmp;
uniform float uAspect;
uniform vec2 uCenter;
uniform float uRays;
uniform vec2 uRayCenter;
varying vec2 vUv;
float hash(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
vec3 sampleCA(vec2 uv){
  vec2 d=uv-.5;
  float r=uAber*(0.4+dot(d,d)*3.);
  return vec3(texture2D(tDiffuse,uv+d*r).r,texture2D(tDiffuse,uv).g,texture2D(tDiffuse,uv-d*r).b);
}
void main(){
  vec2 uv=vUv;
  vec2 dc=(uv-uCenter)*vec2(uAspect,1.);
  float rr=length(dc);
  float ring=exp(-pow((rr-uShockR)/0.06,2.))*uShockAmp;
  vec2 dir=dc/(rr+1e-4)/vec2(uAspect,1.);
  uv+=dir*ring*0.04;
  vec3 col;
  if(uZoom>0.001){
    col=vec3(0.);
    for(int i=0;i<12;i++){
      float s=float(i)/11.;
      vec2 p=uCenter+(uv-uCenter)*(1.-uZoom*s);
      col+=sampleCA(p);
    }
    col/=12.;
  } else {
    col=sampleCA(uv);
  }
  col+=uFlash*vec3(1.0,0.82,0.5);
  // ---- god rays: radial streaks of the brightest parts, marched towards the emblem
  if(uRays>0.002){
    vec2 rd=(uRayCenter-uv)*(1./20.);
    vec2 rp=uv+rd*hash(uv*vec2(1920.,1080.)+uTime);
    vec3 acc=vec3(0.);
    float wgt=1.;
    for(int i=0;i<20;i++){
      vec3 sm=texture2D(tDiffuse,rp).rgb;
      float sl=dot(sm,vec3(0.2126,0.7152,0.0722));
      acc+=sm*smoothstep(1.6,4.0,sl)*wgt;
      wgt*=0.94;
      rp+=rd;
    }
    col+=acc*(1./20.)*uRays*vec3(1.0,0.78,0.42)*0.55;
  }
  // ---- grade: warm toe, gentle shoulder, a touch of saturation in the mids (scene-linear)
  float lum=dot(col,vec3(0.2126,0.7152,0.0722));
  vec3 toe=vec3(0.0035,0.0013,0.0002)*(1.-smoothstep(0.,0.09,lum));
  col+=toe;
  col=mix(vec3(lum),col,1.0+0.12*(1.-smoothstep(0.,1.2,lum)));
  vec2 q=vUv-.5;
  q.x*=uAspect*0.75;
  float vig=1.-uVig*smoothstep(0.22,0.95,length(q)*1.3);
  col*=vig;
  // ---- 35mm grain: luminance-weighted, slightly softened over two hashes, 30 fps cadence
  float fr=floor(uTime*30.);
  float g1=hash(vUv*vec2(1920.,1080.)+fr*17.31);
  float g2=hash(vUv*vec2(960.,540.)+fr*5.17+3.7);
  float grain=(g1*0.65+g2*0.35)-.5;
  col*=1.+grain*uGrain*(1.6-0.9*smoothstep(0.,1.,lum));
  col*=1.-uFade;
  gl_FragColor=vec4(max(col,0.),1.);
}
`;
