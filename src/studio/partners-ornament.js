const clamp = n => Math.max(0, Math.min(1, n));
const smooth = (a, b, n) => { const t = clamp((n - a) / Math.max(.001, b - a)); return t * t * (3 - 2 * t); };

/** Одинаковая огибающая для входа, перемотки и обратного ухода. */
export function ornamentMotion(progress, layer = {}) {
  const start = clamp((Number.isFinite(layer.start) ? layer.start : 68) / 100);
  const end = Math.max(start + .001, clamp((Number.isFinite(layer.end) ? layer.end : 98) / 100));
  const p = clamp((progress - start) / (end - start));
  return { star: smooth(0, .36, p), main: smooth(.12, .8, p), accents: smooth(.35, 1, p), shimmer: smooth(.83, 1, p) };
}

/** Четыре вогнутые стороны, без прямых участков. */
function curvedStar(ctx, radius) {
  const k = radius * .346;
  ctx.beginPath();
  ctx.moveTo(0, -radius);
  ctx.bezierCurveTo(0, -k, k, 0, radius, 0);
  ctx.bezierCurveTo(k, 0, 0, k, 0, radius);
  ctx.bezierCurveTo(0, k, -k, 0, -radius, 0);
  ctx.bezierCurveTo(-k, 0, 0, -k, 0, -radius);
  ctx.closePath();
}

/** Нижний золотой орнамент: звезда раскрывается, линии расходятся от центра. */
export function drawPartnersOrnament(ctx, layer, alpha, progress = 1, time = null, motion = 1) {
  if (!layer || layer.enabled === false || alpha <= 0) return;
  const { x = 960, y = 823, scale = 1, opacity = 1, color = '#e5bd7c' } = layer;
  const state = ornamentMotion(progress, layer);
  if (state.star <= 0) return;
  ctx.save();
  ctx.translate(x, y); ctx.scale(scale, scale);
  const baseAlpha = clamp(alpha * opacity);
  ctx.globalAlpha = baseAlpha;
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.35;

  // Главная линия расходится от центра; боковые и вертикальные рисуются следом.
  const mainEnd = 50 + 570 * state.main;
  const smallEnd = 68 + 227 * state.accents;
  const edgeFade = clamp(Number.isFinite(layer.edgeFade) ? layer.edgeFade : .75);
  for (const [x1, y1, x2, y2, fullX, fullY] of [
    [-50, 0, -mainEnd, 0, -620, 0], [50, 0, mainEnd, 0, 620, 0],
    [-68, -52, -smallEnd, -52, -295, -52], [68, -52, smallEnd, -52, 295, -52],
    [-68, 58, -smallEnd, 58, -295, 58], [68, 58, smallEnd, 58, 295, 58],
    [0, -64, 0, -64 - 66 * state.accents, 0, -130], [0, 64, 0, 64 + 56 * state.accents, 0, 120],
  ]) {
    if (edgeFade > 0) {
      const fade = ctx.createLinearGradient(x1, y1, fullX, fullY);
      fade.addColorStop(0, color); fade.addColorStop(1 - edgeFade * .8, color);
      fade.addColorStop(1, 'rgba(0,0,0,0)'); ctx.strokeStyle = fade;
    } else ctx.strokeStyle = color;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }

  ctx.strokeStyle = color;
  ctx.save();
  ctx.globalAlpha = baseAlpha * state.star;
  ctx.scale(.8 + .2 * state.star, .8 + .2 * state.star);
  curvedStar(ctx, 52); ctx.stroke();
  curvedStar(ctx, 18); ctx.fill();
  ctx.restore();

  // Узкий мягкий блик идёт по готовым линиям. Время берётся из таймлайна,
  // поэтому перемотка и покадровая запись дают тот же результат.
  const glint = Math.max(0, Math.min(2, layer.glint ?? .65)) * clamp(motion) * state.shimmer;
  if (time !== null && glint > .001) {
    const speed = Math.max(0, Math.min(2, layer.glintSpeed ?? 1));
    const head = ((time * speed * 150 + 620) % 1440 + 1440) % 1440 - 720;
    const gradient = ctx.createLinearGradient(head - 65, 0, head + 65, 0);
    gradient.addColorStop(0, 'rgba(255,246,220,0)');
    gradient.addColorStop(.5, 'rgba(255,246,220,1)');
    gradient.addColorStop(1, 'rgba(255,246,220,0)');
    ctx.strokeStyle = gradient; ctx.lineWidth = 2;
    for (const y of [0, -52, 58]) {
      const start = y === 0 ? 50 : 68, end = y === 0 ? mainEnd : smallEnd;
      const maxEnd = y === 0 ? 620 : 295;
      const ratio = (Math.abs(head) - start) / (maxEnd - start);
      const attenuation = edgeFade > 0 ? 1 - smooth(1 - edgeFade * .8, 1, ratio) : 1;
      ctx.globalAlpha = clamp(baseAlpha * glint * .7 * attenuation);
      ctx.beginPath(); ctx.moveTo(-start, y); ctx.lineTo(-end, y);
      ctx.moveTo(start, y); ctx.lineTo(end, y); ctx.stroke();
    }
  }
  ctx.restore();
}
