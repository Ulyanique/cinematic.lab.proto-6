// GLSL-шейдеры для интро

export const NOISE = /* glsl */ `
#ifndef PI
#define PI 3.14159265359
#endif
float hash11(float p){ p=fract(p*.1031); p*=p+33.33; p*=p+p; return fract(p); }
float hash21(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
float vnoise(vec2 p){
  vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  float a=hash21(i), b=hash21(i+vec2(1,0)), c=hash21(i+vec2(0,1)), d=hash21(i+vec2(1,1));
  return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
}
float fbm(vec2 p){
  float v=0., a=.5; mat2 m=mat2(1.6,1.2,-1.2,1.6);
  for(int i=0;i<3;i++){ v+=a*vnoise(p); p=m*p; a*=.5; }
  return v;
}
`;

/* ---------------------------------------------------------------- BACKGROUND */
export const bgVert = /* glsl */ `
varying vec2 vUv;
void main(){ vUv=uv; gl_Position=vec4(position.xy,0.9999,1.); }
`;

export const bgFrag = /* glsl */ `
precision highp float;
uniform float uTime, uAspect, uBeam, uRib, uGlow, uFlash, uFinal;
uniform vec2 uCam;
varying vec2 vUv;
${NOISE}

float beam(vec2 p, vec2 s, float ang, float spread, float seed){
  vec2 v=p-s; float r=length(v);
  float a=atan(v.y,v.x)-ang; a=mod(a+PI,2.*PI)-PI;
  float cone=exp(-(a*a)/(spread*spread));
  float rays=0.35+0.65*fbm(vec2(a*16.+seed, seed*3.+uTime*0.05));
  // Мелкая сетка (a*80) превращалась в статическую крупу на луче: соседние
  // пиксели попадали в разные узлы и луч «кипел». Крупнее и мягче — тот же
  // характер, но без дрожания.
  rays*=0.55+0.45*vnoise(vec2(a*26.+seed, r*0.18-uTime*0.1));
  return cone*rays*exp(-r*0.17);
}
float ribbon(vec2 p, vec2 c, float R, float w, float seed, float speed){
  vec2 v=p-c; float r=length(v); float a=atan(v.y,v.x); float d=r-R;
  float core=exp(-d*d/(w*w));
  float grain=0.25+0.75*fbm(vec2(a*70.+seed, d/w*1.3));
  float flow=0.3+0.7*fbm(vec2(a*4.-uTime*speed+seed, seed));
  return core*grain*flow;
}

void main(){
  vec2 p=(vUv-.5)*vec2(uAspect,1.)*9.+uCam;

  vec3 col=vec3(0.012,0.012,0.013);
  float top=exp(-length((p-vec2(0.,3.8))*vec2(0.45,0.75)));
  col+=vec3(0.018,0.017,0.017)*top;
  float haze=fbm(p*0.2+vec2(uTime*0.012,0.));
  col+=vec3(0.007,0.006,0.005)*haze*(0.5+top);
  float bands=fbm(vec2((p.x*0.55+p.y*0.45)*0.8, p.y*0.04+3.));
  col+=vec3(0.010)*smoothstep(0.45,0.9,bands);

  vec3 gold=vec3(1.0,0.56,0.13);
  vec3 pale=vec3(1.0,0.84,0.5);

  float bA=beam(p, vec2(-4.0,6.0), -2.0, 0.40, 1.3);
  float bB=beam(p, vec2(-8.5,4.2), -0.95, 0.26, 4.1);
  float bC=beam(p, vec2(9.0,-6.2), 2.25, 0.34, 7.7);
  float bD=beam(p, vec2(-9.0,-5.5), 0.62, 0.22, 9.2);
  float bs=(bA*1.25+bB*0.55+bC*0.9+bD*0.55)*uBeam;
  col+=mix(gold,pale,clamp(bs*0.6,0.,1.))*bs*0.34;

  // glitter ribbons in the corners
  float rib=0.;
  rib+=ribbon(p, vec2(10.,-7.), 6.0, 0.22, 2., 0.12);
  rib+=ribbon(p, vec2(10.,-7.), 6.55, 0.40, 5., 0.09)*0.8;
  rib+=ribbon(p, vec2(10.,-7.), 5.45, 0.10, 8., 0.15)*0.8;
  rib+=ribbon(p, vec2(-10.,-8.), 6.1, 0.24, 3., 0.1);
  rib+=ribbon(p, vec2(-10.,-8.), 6.7, 0.45, 6., 0.08)*0.7;
  rib+=ribbon(p, vec2(-9.,5.5), 3.45, 0.14, 11., 0.11)*0.8;
  rib+=ribbon(p, vec2(-9.,5.5), 4.1, 0.35, 12., 0.07)*0.6;
  col+=mix(gold,pale,clamp(rib*0.4,0.,1.))*rib*0.5*uRib;

  // micro-sparkles living inside the light.
  // Блёстки — это точки: ячейка сетки либо светится, либо нет. Сглаженный шум
  // вместо них давал мягкие пятна, и на фоне это читалось как грязь, а не как
  // искры. Поэтому узор точечный, как был; мягче стала только пульсация —
  // медленнее и без случайной фазы на клетку, из-за которой искры «кипели».
  vec2 g=floor(p*60.);
  float h=hash21(g);
  // Редкие и яркие: из тысячи клеток светится единицы, и только там, где есть
  // свет. «pow(h,34)» оставлял зажжёнными больше десятой части клеток — по всему
  // кадру это и читалось как мусор, а не блёстки.
  // Искра не двигается по экрану — двигается только её яркость. Поэтому
  // «движение» здесь — это мигание, и его надо сделать медленным и сплошным:
  // редкая низкая частота (≈0.22 Гц) и мягкая волна вместо качелей вкл/выкл.
  // Раньше на клетку приходилась случайная фаза (g.y*0.35 + g.x*0.2), из-за
  // которой соседние точки гасли вразнобой — это и читалось как рябь.
  float phase=hash21(g+17.3)*6.2831;
  float sp=smoothstep(0.972,0.999,h)*(0.58+0.42*sin(uTime*0.22+phase));
  col+=pale*sp*(bs+rib*0.8)*1.9;

  col+=vec3(1.0,0.5,0.14)*0.03*exp(-length((p-vec2(0.,0.2))*vec2(0.5,0.9)))*uGlow;
  col+=vec3(1.0,0.66,0.28)*uFlash*exp(-length(p-vec2(0.,1.4))*0.45)*0.55;
  col+=vec3(1.0,0.6,0.2)*uFinal*0.02*exp(-length((p-vec2(0.,-0.6))*vec2(0.22,0.6)));

  gl_FragColor=vec4(col,1.);
}
`;

/* ---------------------------------------------------------------- DUST / BOKEH */
export const dustVert = /* glsl */ `
uniform float uTime, uScale, uIn, uBokeh, uDens, uSizeK, uSpd;
attribute vec3 aDir;
attribute vec4 aP; // size, phase, speed, glint
varying float vAlpha;
varying float vGlint;
varying float vHeat;
void main(){
  float f=fract(uTime*uSpd*aP.z*0.1+aP.y);
  vec3 pos=position+aDir*(f-0.5);
  float life=sin(f*3.14159265);
  float tw=0.55+0.45*sin(uTime*(1.2+aP.y*3.)+aP.y*40.);
  float breathe=mix(tw, 0.7+0.3*sin(uTime*0.6+aP.y*20.), uBokeh);
  vAlpha=life*breathe*uIn*step(aP.y,uDens);
  vGlint=aP.w*tw;
  vHeat=aP.y;
  vec4 mv=modelViewMatrix*vec4(pos,1.);
  gl_PointSize=min(aP.x*uSizeK*uScale/-mv.z, 220.);
  gl_Position=projectionMatrix*mv;
}
`;
export const dustFrag = /* glsl */ `
precision highp float;
uniform float uBokeh;
varying float vAlpha;
varying float vGlint;
varying float vHeat;
void main(){
  vec2 c=gl_PointCoord*2.-1.;
  float d=length(c);
  vec3 col=mix(vec3(1.,0.52,0.14), vec3(1.,0.86,0.55), vHeat);
  float a;
  if(uBokeh>0.5){
    float disc=(1.-smoothstep(0.88,1.,d));
    float rim=0.35+0.65*smoothstep(0.45,0.97,d);
    a=disc*rim*0.22;
  } else {
    float core=exp(-d*d*9.);
    float star=(exp(-abs(c.x)*38.)*(1.-smoothstep(0.,1.,abs(c.y)))+exp(-abs(c.y)*38.)*(1.-smoothstep(0.,1.,abs(c.x))))*vGlint;
    a=core*1.1+star*1.4;
    col=mix(col,vec3(1.,0.95,0.8),core*0.6);
  }
  if(d>1.) discard;
  gl_FragColor=vec4(col*1.3, a*vAlpha*0.8);
}
`;

/* ---------------------------------------------------------------- ASSEMBLY SWARM */
export const swarmVert = /* glsl */ `
uniform float uAssemble, uTime, uScale, uFade, uDens;
uniform vec2 uCenter;
attribute vec3 aStart;
attribute vec3 aTarget;
attribute vec4 aR; // delay, swirl, size, phase
varying float vAlpha;
varying float vHot;
void main(){
  float raw=(uAssemble-aR.x*0.5)/0.5;
  float p=clamp(raw,0.,1.);
  float e=1.-pow(1.-p,3.);
  vec3 tgt=aTarget+0.012*vec3(sin(uTime*2.+aR.w*30.),cos(uTime*2.3+aR.w*17.),sin(uTime*1.7+aR.w*9.));
  vec3 pos=mix(aStart,tgt,e);
  float sw=(1.-e)*aR.y*2.8;
  vec2 q=pos.xy-uCenter; float cs=cos(sw), sn=sin(sw);
  pos.xy=uCenter+mat2(cs,-sn,sn,cs)*q;
  pos.z+=sin(p*3.14159265)*(aR.w-0.5)*3.0;
  float appear=smoothstep(0.,0.06,uAssemble-aR.x*0.5+0.03);
  vHot=(1.-e)*0.8+0.2*step(p,0.999);
  float tw=0.7+0.3*sin(uTime*6.+aR.w*50.);
  vAlpha=appear*uFade*tw*step(aR.w,uDens);
  vec4 mv=modelViewMatrix*vec4(pos,1.);
  gl_PointSize=min(aR.z*uScale/-mv.z*(0.8+1.2*(1.-e)), 60.);
  gl_Position=projectionMatrix*mv;
}
`;
export const swarmFrag = /* glsl */ `
precision highp float;
varying float vAlpha;
varying float vHot;
void main(){
  vec2 c=gl_PointCoord*2.-1.; float d=length(c);
  if(d>1.) discard;
  float a=exp(-d*d*6.);
  vec3 col=mix(vec3(1.,0.6,0.18), vec3(1.,0.93,0.7), vHot);
  gl_FragColor=vec4(col*2.4, a*vAlpha);
}
`;

/* ---------------------------------------------------------------- SPARKS (deterministic bursts) */
export const sparkVert = /* glsl */ `
uniform float uTime, uScale;
attribute vec3 aVel;
attribute vec2 aLife; // birth, life
attribute float aSize;
varying float vAlpha;
varying float vHot;
void main(){
  float t=uTime-aLife.x;
  float ok=step(0.,t)*step(t,aLife.y);
  t=max(t,0.);
  float k=2.2;
  vec3 pos=position+aVel*(1.-exp(-t*k))/k+vec3(0.,-0.35,0.)*t*t*0.5;
  float u=clamp(t/aLife.y,0.,1.);
  vAlpha=ok*pow(1.-u,1.6)*(0.6+0.4*sin(t*38.+aSize*500.));
  vHot=1.-u;
  vec4 mv=modelViewMatrix*vec4(pos,1.);
  gl_PointSize=min(aSize*uScale/-mv.z*(0.5+0.5*(1.-u)), 40.);
  gl_Position=projectionMatrix*mv;
}
`;
export const sparkFrag = /* glsl */ `
precision highp float;
varying float vAlpha;
varying float vHot;
void main(){
  vec2 c=gl_PointCoord*2.-1.; float d=length(c);
  if(d>1.) discard;
  float a=exp(-d*d*7.);
  vec3 col=mix(vec3(1.,0.5,0.12), vec3(1.,0.92,0.65), vHot);
  gl_FragColor=vec4(col*3.0, a*vAlpha);
}
`;

/* ---------------------------------------------------------------- ARCS */
export const arcVert = /* glsl */ `
varying vec2 vP;
void main(){ vP=position.xy; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }
`;
export const arcFrag = /* glsl */ `
precision highp float;
uniform float uProg, uR, uStart, uLen, uDash, uAlpha, uW, uTime;
varying vec2 vP;
void main(){
  float r=length(vP);
  float d=abs(r-uR);
  float ang=atan(vP.y,vP.x);
  float t=mod(ang-uStart+12.5663706, 6.2831853)/uLen;
  if(t>1.) discard;
  float draw=(1.-smoothstep(uProg-0.03, uProg, t));
  float headDist=(t-uProg)*26.;
  float head=exp(-headDist*headDist)*step(uProg,0.999)*step(0.001,uProg);
  float core=exp(-d*d/(uW*uW));
  float glow=exp(-d*65.)*0.035;
  // Fine, subdued markings rather than a wide, road-like dashed stripe.
  float dashPhase=fract(t*uDash);
  float mark=1.-smoothstep(0.14,0.25,dashPhase);
  float dashes=mix(1., mark, step(0.5,uDash));
  float glimmer=0.82+0.18*sin(ang*5.+uTime*0.45);
  float a=(core+glow)*dashes*draw*glimmer;
  a+=(core*1.1+exp(-d*40.)*0.08)*head;
  vec3 col=mix(vec3(0.78,0.47,0.17), vec3(1.,0.79,0.46), core);
  gl_FragColor=vec4(col, a*uAlpha);
}
`;

/* ---------------------------------------------------------------- DIVIDER LINES */
export const lineVert = /* glsl */ `
varying vec2 vUv;
void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }
`;
export const lineFrag = /* glsl */ `
precision highp float;
uniform float uProg, uDir, uAlpha, uCore, uGlow, uHighlight;
uniform vec3 uColor, uHotColor;
varying vec2 vUv;
void main(){
  // t: 0 at the diamond end, 1 at outer end
  float t=uDir>0.?(1.-vUv.x):vUv.x;
  float vy=abs(vUv.y-.5)*2.;
  // Derivative-based edge width keeps the core stable when it is less than one preview pixel.
  float aa=max(fwidth(vy),0.002);
  float core=1.-smoothstep(uCore-aa,uCore+aa,vy);
  float glow=exp(-vy*5.)*uGlow;
  float grad=pow(1.-t,0.55)*0.9+0.1;
  // Optional broad head; zero by default. Its width follows the screen-space pixel footprint.
  float headWidth=max(fwidth(t)*3.,0.012);
  float head=exp(-pow((t-uProg)/headWidth,2.))*step(0.001,uProg)*step(uProg,0.999);
  float a=(core+glow)*uProg*grad+(core+glow*3.)*head*uHighlight;
  vec3 col=mix(uColor,uHotColor,core);
  gl_FragColor=vec4(col*2.,a*uAlpha);
}
`;

/* ---------------------------------------------------------------- TEXT PLANE */
export const textVert = lineVert;
export const textFrag = /* glsl */ `
precision highp float;
uniform sampler2D uMap;
uniform float uReveal, uTime, uShine, uBright;
uniform vec3 uColA, uColB;
varying vec2 vUv;
void main(){
  float cx=abs(vUv.x-.5)*2.;
  float rv=uReveal*2.0;
  float m=clamp(1.-smoothstep(rv-0.9, rv-0.2, cx),0.,1.);
  float blur=(1.-m)*5.5;
  vec4 t=texture2D(uMap, vUv, blur);
  float g=smoothstep(0.15,0.85,vUv.y);
  vec3 col=mix(uColA,uColB,g);
  float pos=fract(uTime*0.11)*1.6-0.3;
  float shineDist=(vUv.x-pos+(vUv.y-.5)*0.25)*7.;
  float sh=exp(-shineDist*shineDist);
  col+=vec3(1.,0.9,0.6)*sh*uShine;
  float a=t.a*m;
  gl_FragColor=vec4(col*uBright*(1.+m*0.0), a);
}
`;

/* ---------------------------------------------------------------- SHOCKWAVE / FLARE */
export const waveFrag = /* glsl */ `
precision highp float;
uniform float uR, uA, uW, uAspect, uPrevR;
varying vec2 vUv;
void main(){
  // uAspect — пропорции самой плоскости волны. Без этой поправки на плоскости 26×9 кольцо
  // сжималось по вертикали: кромка по горизонтали выходила в 2.9 раза тоньше, чем по вертикали,
  // и на быстром расширении начинала мигать (субпиксельная линия).
  vec2 q=(vUv-.5)*2.;      // в границах плоскости — для маски краёв
  vec2 c=q; c.y/=uAspect;  // с поправкой пропорций — для круглого кольца
  float d=length(c);
  float x=(d-uR)/uW;
  // резкий передний фронт, длинный мягкий шлейф позади, тонкое раскалённое ядро
  // Узкий внутренний фронт и «ядро» были субпиксельными у начала волны (около 8 с):
  // движение на кадр перескакивало яркий пик. Расширяем профиль, чтобы он не стробил.
  float lead=exp(-x*x*7.)*step(0.,x)+exp(-x*x*24.)*step(x,0.);
  float tail=exp(x*0.85)*step(x,0.)*0.34;
  float core=exp(-x*x*18.);
  // мягкий «подшёрсток»: широкое гало вокруг кольца — переход остаётся видимым даже когда
  // кольцо за кадр смещается на много пикселей (иначе появляется стробоскоп на быстром фронте)
  float skirt=exp(-x*x*1.6)*0.22;
  // Временной антиалиасинг: за один кадр кромка успевает уехать на несколько пикселей,
  // и глаз видит стробоскоп. При расширении uPrevR меньше uR; заливаем путь между радиусами.
  float deltaR = uR - uPrevR;
  float trail = step(0.0001, deltaR) * step(uPrevR, d) * step(d, uR);
  float trailGain = mix(0.10, 0.65, smoothstep(0.025, 0.18, deltaR));
  skirt += trail * trailGain;
  // мягкая маска у границ плоскости: кольцо никогда не упирается в «квадратный» край
  // маска считается по НЕисправленным координатам: иначе свет упирается в прямоугольный
  // край плоскости волны и появляется резкая горизонтальная полоса
  float edge=1.-smoothstep(0.74,1.0,max(abs(q.x),abs(q.y)));
  float a=(lead*0.5+tail+core*1.1+skirt)*uA*edge;
  vec3 col=mix(vec3(1.,0.62,0.22)*1.9, vec3(1.,0.93,0.74)*2.6, clamp(core+lead*0.4,0.,1.));
  gl_FragColor=vec4(col, a);
}
`;

/* ---------------------------------------------------------------- POST */
export const finalPass = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uFade: { value: 1 },
    uAspect: { value: 1.7778 },
    uRes: { value: [1920, 1080] },
    uOpen: { value: 1 },       // половина высоты видимой «щели» (в UV); >0.5 — кадр полностью открыт
    uSlitMix: { value: 1 },    // 1 — жёсткая маска «щели», 0 — мягкое затемнение вместо неё
    uLineVisible: { value: 1 },// 1 — пролог с линией-зажиганием разрешён
    uLine: { value: 0 },       // длина линии-зажигания 0..1
    uLineI: { value: 0 },      // её яркость
    uBlur: { value: 0 },       // радиус расфокуса (UV)
    uShock: { value: 0 },      // радиус ударной волны
    uShockAmp: { value: 0 },
    uShockC: { value: [0.5, 0.6] },
    uCA: { value: 0 },         // дополнительная хроматическая аберрация
    uPulse: { value: 0 },      // вспышка экспозиции
    uRays: { value: 0 },       // объёмные лучи из эмблемы
    uZoom: { value: 0 },       // зум-блюр к эмблеме
    uGhost: { value: 0 },      // «призраки» линзы
    uVig: { value: 0.62 }, uGrainK: { value: 0.02 }, uSat: { value: 1 }, uCon: { value: 1 }, uHue: { value: 0 }, uShadow: { value: 1 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: /* glsl */ `
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform float uTime, uFade, uAspect, uOpen, uLine, uLineI, uBlur, uShock, uShockAmp, uCA, uPulse, uRays, uZoom, uGhost, uVig, uGrainK, uSat, uCon, uHue, uShadow, uSlitMix, uLineVisible;
    uniform vec2 uRes, uShockC;
    varying vec2 vUv;
    vec3 hueRot(vec3 c,float a){ vec3 k=vec3(0.57735); float ca=cos(a); return c*ca+cross(k,c)*sin(a)+k*dot(k,c)*(1.-ca); }
    float h21(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
    void main(){
      vec2 uv=vUv;
      vec2 d=uv-.5;
      float r2=dot(d*vec2(uAspect,1.),d*vec2(uAspect,1.));

      // shockwave: кольцо-линза, расходящееся от логотипа
      vec2 sc=(uv-uShockC)*vec2(uAspect,1.);
      float sr=length(sc);
      vec2 sdir=sr>1e-4? sc/sr : vec2(0.);
      float ring=exp(-pow((sr-uShock)*11.,2.))*uShockAmp;
      uv-=sdir*vec2(1./uAspect,1.)*ring*0.02;

      vec2 off=d*r2*(0.005+uCA*0.03)+sdir*vec2(1./uAspect,1.)*ring*0.0022;

      vec3 col;
      if(uBlur>0.0015){
        // фокус-пулл: спиральное боке, яркие точки получают больший вес
        vec3 acc=vec3(0.); float ws=0.;
        float jit=h21(vUv*uRes+7.3)*6.2831853;
        for(int i=0;i<24;i++){
          float fi=float(i);
          float rad=sqrt((fi+.5)/24.);
          float ang=fi*2.3999632+jit;
          vec2 o=vec2(cos(ang),sin(ang))*rad*uBlur*vec2(1./uAspect,1.);
          vec3 s=vec3(texture2D(tDiffuse,uv+o+off).r, texture2D(tDiffuse,uv+o).g, texture2D(tDiffuse,uv+o-off).b);
          float w=1.+dot(s,vec3(.3,.5,.2))*3.;
          acc+=s*w; ws+=w;
        }
        col=acc/ws;
      } else {
        col.r=texture2D(tDiffuse, uv+off).r;
        col.g=texture2D(tDiffuse, uv).g;
        col.b=texture2D(tDiffuse, uv-off).b;
      }

      // зум-блюр: радиальный «удар» к эмблеме
      if(uZoom>0.002){
        vec2 zd=(uShockC-uv)*uZoom/12.;
        float zj=h21(vUv*uRes+11.1);
        vec3 zacc=col; float zw=1.;
        for(int i=1;i<12;i++){
          float k=float(i)+zj;
          float w=1.-float(i)/13.;
          zacc+=texture2D(tDiffuse,uv+zd*k).rgb*w; zw+=w;
        }
        col=mix(col,zacc/zw,0.85);
      }
      // «призраки» линзы: зеркальные отражения ярких зон с лёгкой дисперсией
      if(uGhost>0.002){
        vec3 gh=vec3(0.);
        for(int i=0;i<4;i++){
          float k=0.32+0.23*float(i);
          vec2 gu=0.5+(0.5-vUv)*k;
          float edge=pow(clamp(1.-length(gu-.5)/0.62,0.,1.),2.);
          vec3 gs=vec3(texture2D(tDiffuse,gu+0.004*k*(gu-.5)).r,texture2D(tDiffuse,gu).g,texture2D(tDiffuse,gu-0.004*k*(gu-.5)).b);
          gs=max(gs-0.72,vec3(0.));
          vec3 tint=mix(vec3(1.,.72,.38),vec3(.55,.8,1.),fract(float(i)*.37));
          gh+=gs*tint*edge/(1.+float(i)*.5);
        }
        col+=gh*uGhost*0.9;
      }
      // объёмные лучи (god rays): радиальное размытие ярких зон к центру эмблемы
      if(uRays>0.002){
        vec2 delta=(uv-uShockC)*0.62/24.;
        vec2 suv=uv-delta*h21(vUv*uRes+3.7);
        vec3 rays=vec3(0.); float decay=1.;
        for(int i=0;i<24;i++){
          suv-=delta;
          vec3 s=texture2D(tDiffuse,suv).rgb;
          float l=max(max(s.r,s.g),s.b);
          rays+=s*smoothstep(0.5,0.95,l)*decay;
          decay*=0.955;
        }
        col+=rays/24.*uRays*vec3(1.0,0.74,0.4)*2.2;
      }
      col*=1.+uPulse;
      // vignette
      float v=smoothstep(0.30,1.05,length(d*vec2(uAspect*0.72,1.15)));
      col*=1.-v*uVig;
      // warm grade
      col=pow(max(col, vec3(0.)), vec3(0.98,1.0,1.04));
      // холодные тени: сине-зелёный оттенок в чёрном подчёркивает золото
      float lum=dot(col,vec3(.3,.5,.2));
      col+=vec3(-0.002,0.004,0.011)*uShadow*(1.-smoothstep(0.0,0.35,lum));
      if(abs(uHue)>0.0005) col=hueRot(col,uHue);
      float lm2=dot(col,vec3(.3,.5,.2));
      col=mix(vec3(lm2),col,uSat);
      col=max((col-0.18)*uCon+0.18,vec3(0.));
      // film grain / dither
      // Зерно меняется 24 раза в секунду и только по одной оси: полноэкранный
      // шум на каждом кадре на спокойном фоне читался не как плёнка, а как
      // дрожание света — особенно на фоновом ролике, где картинка почти стоит.
      // Зерно меняется по кадрам, но мягко: сильное по силе оно давало
      // «дрожание света» на спокойном фоне. Слабее и с плавной фазой.
      float gr=(h21(vUv*uRes+floor(uTime*24.)*37.)-.5)*0.5;
      col+=gr*uGrainK*(1.-0.4*col);
      col*=uFade;

      // кинематографическая «щель»: кадр раскрывается из линии света.
      // Маска не должна выжигать кадр: при тонкой щели она смешивается с мягким затемнением,
      // а мягкая кромка считается относительно uOpen — без «жёсткого» перехода на 1.6 px.
      float dy=abs(d.y);
      float softEdge=max(0.004, uOpen*0.35);
      float vis=1.-smoothstep(max(0.0, uOpen-softEdge), uOpen+softEdge, dy);
      float dim=mix(1., 0.22, smoothstep(0.5, 0.02, uOpen)*step(uOpen,0.5));
      col*=mix(dim, vis, uSlitMix);
      float edge=exp(-pow((dy-uOpen)*55.,2.))*step(uOpen,0.5)*smoothstep(0.0,0.02,uOpen);
      col+=vec3(1.,0.66,0.26)*edge*0.22*mix(1.,vis,uSlitMix);

      // линия-зажигание: горячее ядро + анаморфный шлейф
      float half_=uLine*0.62;
      float lx=1.-smoothstep(half_*0.55, half_, abs(d.x)*1.0);
      float core=exp(-dy*dy*90000.);
      float halo=exp(-dy*dy*1800.)*0.35+exp(-dy*dy*180.)*0.07;
      float streak=exp(-abs(d.x)*2.4)*exp(-dy*dy*20000.)*0.7;
      float ig=(core*3.2+halo)*lx+streak*step(0.001,uLine);
      vec3 lc=mix(vec3(1.,0.62,0.2),vec3(1.,0.93,0.75),core);
      col+=lc*ig*uLineI*uLineVisible;
      gl_FragColor=vec4(col,1.);
    }
  `,
};

/** Световая «обводка» контура эмблемы: яркая головка бежит по периметру и оставляет затухающий след. */
export const traceVert = /* glsl */ `
attribute float aT;
varying float vT;
void main(){
  vT = aT;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
export const traceFrag = /* glsl */ `
uniform float uHead, uAmp, uHead2, uAmp2, uBase;
varying float vT;
float trail(float h){
  float d = fract(h - vT);
  float head = exp(-d * 5.5);
  return head * smoothstep(0.0, 0.0025, 1.0 - d) * (0.35 + 0.65 * exp(-d * 60.0));
}
void main(){
  float v = uAmp * trail(uHead) + uAmp2 * trail(uHead2) * 0.8 + uBase;
  if (v < 0.003) discard;
  gl_FragColor = vec4(vec3(2.9, 2.0, 0.9) * v, 1.0);
}`;
