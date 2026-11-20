/** Независимые дополнительные надписи поверх любого ролика. Координаты — 1920×1080. */
export const EXTRA_TEXT_PREFIX = 'extraText:';
export function extraTextDefaults() {
  return { enabled: true, text: 'Новый текст', x: 960, y: 800, scale: 1, opacity: 1, color: '#ecd4a1', font: 'Forum', animation: 'scene' };
}
export function extraTextSections(cfg) {
  return Object.keys(cfg || {}).filter(id => id.startsWith(EXTRA_TEXT_PREFIX) && cfg[id] && typeof cfg[id] === 'object').map((id, i) => ({
    id, title: `Надпись ${i + 1}`, fields: [
      {key:'enabled',label:'Показывать',type:'bool'},
      {key:'text',label:'Текст',type:'text',maxLength:500},
      {key:'font',label:'Шрифт',type:'select',options:['Forum','Prata','Manrope','Cormorant Garamond','Playfair Display','PT Serif','Unbounded'].map(value=>({value,label:value}))},
      {key:'color',label:'Цвет',type:'color'},
      {key:'x',label:'Положение X, px',type:'range',min:0,max:1920,step:1},
      {key:'y',label:'Положение Y, px',type:'range',min:0,max:1080,step:1},
      {key:'scale',label:'Размер',type:'range',min:.2,max:4,step:.01},
      {key:'opacity',label:'Непрозрачность',type:'range',min:0,max:1,step:.01},
      {key:'animation',label:'Появление',type:'select',options:[{value:'scene',label:'С появлением и уходом сцены'},{value:'always',label:'Без анимации'}]},
    ]
  }));
}
const clamp = n => Math.max(0, Math.min(1, n));
const smooth = n => { n = clamp(n); return n*n*(3-2*n); };
export function extraTextOpacity(time, timeline, animation = 'scene') {
  const start = timeline?.startDelay || 0;
  const entry = Math.max(0,(timeline?.drawDuration || 0)+(timeline?.emergeDuration || 0));
  const hold = Math.max(0,timeline?.holdDuration || 0), fade = Math.max(0,timeline?.fadeDuration || 0), rest = Math.max(0,timeline?.restDuration || 0);
  const cycle = entry+hold+fade+rest;
  if (time < start || !(cycle > 0)) return 0;
  const local = (time-start)%cycle;
  if (animation === 'always') return 1;
  const enter = entry > 0 ? smooth(local / Math.min(1, entry)) : 1;
  const exit = local < entry+hold ? 1 : fade > 0 ? 1-smooth((local-entry-hold)/fade) : 0;
  return enter*exit;
}
export function drawExtraTexts(ctx, time, cfg, width, height) {
  const layers = extraTextSections(cfg);
  if (!layers.length) return;
  ctx.save(); ctx.scale(width/1920, height/1080);
  for (const {id} of layers) {
    const e = cfg[id];
    if (e.enabled === false || !e.text) continue;
    const alpha = clamp(Number.isFinite(e.opacity) ? e.opacity : 1) * extraTextOpacity(time,cfg.timeline,e.animation);
    if (alpha <= 0) continue;
    const font = ['Forum','Prata','Manrope','Cormorant Garamond','Playfair Display','PT Serif','Unbounded'].includes(e.font) ? e.font : 'Forum';
    const size = 36 * Math.max(.2,Math.min(4,Number(e.scale) || 1));
    ctx.save(); ctx.globalAlpha = alpha; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `400 ${size}px "${font}", serif`; ctx.fillStyle = /^#[0-9a-f]{6}$/i.test(e.color) ? e.color : '#ecd4a1';
    ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 9; ctx.shadowOffsetY = 3;
    ctx.fillText(String(e.text), Number.isFinite(e.x) ? e.x : 960, Number.isFinite(e.y) ? e.y : 800, 1800); ctx.restore();
  }
  ctx.restore();
}
