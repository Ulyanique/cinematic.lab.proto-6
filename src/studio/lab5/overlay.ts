import { TL, visitTime } from './timeline';
import { glyphExit, subtitleExit } from './finalExit';
import { clamp, easeInOutCubic, easeOutCubic, lerp, smoothstep } from './math';
import { drawCornerRings } from './cornerRings';
import type { FilmSettings } from './settings';
import { mediaClip } from './media';

/**
 * Надписи, полосы, кольца и финальное затухание фильма «Монолиты».
 * В оригинале это DOM-слой, который при экспорте снимался в canvas; здесь он рисуется
 * сразу в canvas по тем же формулам и раскладке (кадр 1920×1080), поэтому предпросмотр
 * и запись видео совпадают и не зависят от размера окна.
 */
const DESIGN_W = 1920, DESIGN_H = 1080;

function measure(ctx: CanvasRenderingContext2D, text: string, spacing: number) {
  return Array.from(text).map((ch) => ctx.measureText(ch).width + spacing);
}

/**
 * Метки монолитов: таймкод и короткое имя ролика под каждым экраном.
 * Появляются вместе с монолитом и гаснут перед схлопыванием, чтобы в
 * финальной части кадра ничего не спорило со знаком. Подпись — часть кадра,
 * поэтому в экспорт она попадает так же, как в предпросмотр.
 */
function drawVisitLabels(ctx: CanvasRenderingContext2D, t: number, w: number, h: number, s: FilmSettings) {
  const appear = smoothstep(visitTime(0) - 2.6, visitTime(0) - 1.4, t);
  const fade = 1 - smoothstep(TL.implodeStart - 2.4, TL.implodeStart - 0.4, t);
  const alpha = Math.min(appear, fade) * (s.showSubtitle ? 1 : 0);
  if (alpha < 0.004) return;
  const size = Math.min(15, Math.max(10, 0.0078 * w));
  const gap = 0.012 * w;
  const y = h * 0.905;
  ctx.save();
  ctx.globalAlpha = alpha * 0.92;
  ctx.font = `500 ${size}px "${s.subtitleFont}", serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  // Кодировка точек: только буквы, цифры и двоеточие — панель и кадр
  // используют одну и ту же запись из media.ts.
  for (let i = 0; i < s.videoAssign.length; i++) {
    const clip = mediaClip(s.videoAssign[i]);
    const x = (w / (s.videoAssign.length + 1)) * (i + 1);
    const label = clip.file ? `${clip.timecode} · ${clip.name}` : `${String(i + 1).padStart(2, "0")} · НЕТ ИСТОЧНИКА`;
    ctx.fillStyle = clip.file ? "rgba(255,224,168,.78)" : "rgba(255,196,120,.5)";
    ctx.fillText(label, x, y);
    ctx.fillStyle = "rgba(255,206,110,.28)";
    ctx.fillRect(x - gap / 2, y + size * 0.55, gap, 1);
  }
  ctx.restore();
}

export function drawLab5Overlay(ctx: CanvasRenderingContext2D, t: number, W: number, H: number, s: FilmSettings) {
  ctx.save();
  ctx.scale(W / DESIGN_W, H / DESIGN_H);
  const w = DESIGN_W, h = DESIGN_H;
  const chars = Array.from(s.title);
  const n = chars.length;

  // ---- метрики блока (как в CSS .brand-wrap)
  const titleSize = Math.min(72, Math.max(22, 0.0435 * w)) * s.titleScale * Math.min(1, 19 / Math.max(1, n));
  const titleLine = titleSize * 1.12;
  const subSize = Math.min(21, Math.max(13, 0.015 * w)) * s.subtitleScale * Math.min(1, 25 / Math.max(1, Array.from(s.subtitle).length));
  const ruleW = Math.min(0.3 * w, 420);
  const top = (s.titlePosition / 100) * h;
  const ruleY = top + titleLine + Math.min(16, Math.max(8, 0.01 * w));
  const subY = ruleY + 1 + Math.min(22, Math.max(10, 0.014 * w));
  const subLine = subSize * 1.2;
  const blockH = subY + subLine - top;

  // ---- затемнение под надписью
  const shade = smoothstep(TL.logoText - 0.4, TL.logoText + 1.8, t) * (s.showTitle || s.showSubtitle ? 1 : 0);
  if (shade > 0.001) {
    ctx.save();
    ctx.globalAlpha = shade;
    ctx.translate(w / 2, top + blockH / 2);
    ctx.scale(0.35 * w, blockH * 0.95);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, 'rgba(8,3,0,.62)'); g.addColorStop(.45, 'rgba(8,3,0,.3)'); g.addColorStop(.72, 'rgba(8,3,0,0)'); g.addColorStop(1, 'rgba(8,3,0,0)');
    ctx.fillStyle = g; ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }

  // ---- название: буквы проявляются по одной, затем по золоту бежит блик
  const sweepT = t - (TL.logoText + 2.6);
  const sweepPos = sweepT > 0 && sweepT % 7 < 2 ? -2 + ((sweepT % 7) / 2) * (n + 4) : -99;
  ctx.font = `400 ${titleSize}px "${s.titleFont}", serif`;
  ctx.textBaseline = 'alphabetic';
  const spacing = s.titleSpacing * titleSize;
  const widths = chars.map((ch) => (ch === ' ' ? 0.58 * titleSize : ctx.measureText(ch).width + spacing));
  const total = widths.reduce((a, b) => a + b, 0) + spacing;
  let x = (w - total) / 2 + spacing;
  const asc = ctx.measureText('Я').fontBoundingBoxAscent || titleSize * 0.8;
  const desc = ctx.measureText('Я').fontBoundingBoxDescent || titleSize * 0.2;
  const baseline = top + (titleLine - asc - desc) / 2 + asc;
  for (let i = 0; i < n; i++) {
    const gw = widths[i];
    if (chars[i] !== ' ') {
      const e = easeOutCubic(clamp((t - (TL.logoText + (i * 0.11) / s.revealSpeed)) / (1.25 / s.revealSpeed)));
      const k = Math.exp(-Math.pow((i + 0.5 - sweepPos) / 1.1, 2));
      const exit = glyphExit(t, i);
      const alpha = e * (1 - exit) * (s.showTitle ? 1 : 0);
      if (alpha > 0.002) {
        const sc = (1.05 - 0.05 * e) * (1 - Math.min(0.8, 0.35 * s.exitMotion) * exit);
        const dy = (1 - e) * 22 - exit * 12 * s.exitMotion;
        const blur = (1 - e) * 9;
        const parts: string[] = [];
        if (blur > 0.15) parts.push(`blur(${blur.toFixed(2)}px)`);
        if (k > 0.01) parts.push(`brightness(${(1 + 0.65 * k).toFixed(3)})`);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.filter = parts.length ? parts.join(' ') : 'none';
        ctx.translate(x + (gw - spacing) / 2, top + titleLine / 2 + dy);
        ctx.scale(sc, sc);
        ctx.translate(-(x + (gw - spacing) / 2), -(top + titleLine / 2));
        const gold = ctx.createLinearGradient(0, top, 0, top + titleLine);
        gold.addColorStop(0, s.titleLight); gold.addColorStop(.3, s.titleMid); gold.addColorStop(.62, s.titleGold); gold.addColorStop(1, s.titleDark);
        ctx.shadowColor = 'rgba(255,170,40,.45)'; ctx.shadowBlur = 18;
        ctx.fillStyle = gold;
        ctx.fillText(chars[i], x, baseline);
        ctx.restore();
      }
    }
    x += gw;
  }

  // ---- линия и подзаголовок
  const exitSub = subtitleExit(t);
  const ruleScale = easeOutCubic((t - (TL.logoText + 1.1)) / 1.5) * (1 - exitSub);
  const ruleAlpha = smoothstep(TL.logoText + 1.1, TL.logoText + 1.8, t) * (1 - exitSub) * (s.showTitle || s.showSubtitle ? 1 : 0);
  if (ruleAlpha > 0.002 && ruleScale > 0.001) {
    const rw = ruleW * ruleScale;
    const g = ctx.createLinearGradient(w / 2 - rw / 2, 0, w / 2 + rw / 2, 0);
    g.addColorStop(0, 'rgba(255,215,130,0)'); g.addColorStop(.5, 'rgba(255,215,130,.9)'); g.addColorStop(1, 'rgba(255,215,130,0)');
    ctx.save(); ctx.globalAlpha = ruleAlpha; ctx.fillStyle = g; ctx.fillRect(w / 2 - rw / 2, ruleY, rw, 1.5); ctx.restore();
  }
  const a = smoothstep(TL.tagline, TL.tagline + 1.8, t);
  const tagAlpha = a * 0.85 * (1 - exitSub) * (s.showSubtitle ? 1 : 0);
  if (tagAlpha > 0.002) {
    ctx.save();
    ctx.globalAlpha = tagAlpha;
    ctx.font = `400 ${subSize}px "${s.subtitleFont}", serif`;
    ctx.fillStyle = s.subtitleColor;
    const sp = s.subtitleSpacing * subSize;
    const sw = measure(ctx, s.subtitle, sp);
    const tot = sw.reduce((p, c) => p + c, 0) + sp;
    let sx = (w - tot) / 2 + sp;
    const m = ctx.measureText('ВЕЧЕР');
    const sAsc = m.fontBoundingBoxAscent || subSize * 0.8, sDesc = m.fontBoundingBoxDescent || subSize * 0.2;
    const by = subY + (subLine - sAsc - sDesc) / 2 + sAsc + ((1 - a) * 10 - 8 * exitSub);
    Array.from(s.subtitle).forEach((ch, i) => { ctx.fillText(ch, sx, by); sx += sw[i]; });
    ctx.restore();
  }

  drawVisitLabels(ctx, t, w, h, s);

  // ---- анаморфные полосы: из чёрной щели раскрываются и выбрасываются взрывом
  const open = easeInOutCubic((t - 0.3) / 3.4);
  const punch = easeOutCubic((t - TL.explode) / 1.6);
  const bar = (lerp(50, 7.2, open) - 4.4 * punch) * (1 - smoothstep(TL.explode, TL.logoText, t));
  if (bar > 0.01) {
    const bh = (bar / 100) * h;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, bh); ctx.fillRect(0, h - bh, w, bh);
  }
  // ---- угловые кольца и финальное затухание
  ctx.save();
  const ringsLayer = ctx;
  drawCornerRingsOnTop(ringsLayer, t, w, h, s);
  ctx.restore();
  const fade = smoothstep(TL.fadeOutStart, TL.fadeOutEnd, t);
  if (fade > 0.001) { ctx.globalAlpha = fade; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1; }
  ctx.restore();
}

/** drawCornerRings очищает свой холст, поэтому рисуем его на временном слое и накладываем. */
let ringLayer: HTMLCanvasElement | null = null;
function drawCornerRingsOnTop(ctx: CanvasRenderingContext2D, t: number, w: number, h: number, s: FilmSettings) {
  if (!ringLayer) ringLayer = document.createElement('canvas');
  if (ringLayer.width !== w || ringLayer.height !== h) { ringLayer.width = w; ringLayer.height = h; }
  const c = ringLayer.getContext('2d')!;
  c.setTransform(1, 0, 0, 1, 0, 0);
  drawCornerRings(c, t, w, h, s);
  ctx.drawImage(ringLayer, 0, 0);
}
