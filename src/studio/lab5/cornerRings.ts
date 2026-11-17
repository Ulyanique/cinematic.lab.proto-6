import { smoothstep } from './math';
import { TL } from './timeline';
import { DEFAULT_SETTINGS, type FilmSettings } from './settings';

/** Fine, screen-anchored astronomical rings, inspired by the earlier intro's corner motifs. */
export function drawCornerRings(ctx: CanvasRenderingContext2D, t: number, w: number, h: number, settings: FilmSettings = DEFAULT_SETTINGS) {
  ctx.clearRect(0, 0, w, h);
  const reveal = smoothstep(TL.explode + 0.4, TL.explode + 3.4, t);
  if (reveal <= 0 || !settings.ringsEnabled) return;
  const time = t - TL.explode;
  const rings = [
    { radius: .2314, alpha: .72, width: .00068, speed: .25, dash: 0 },
    { radius: .2669, alpha: .48, width: .00052, speed: -.19, dash: 145 },
    { radius: .2949, alpha: .58, width: .00062, speed: .16, dash: 0 },
  ];
  for (const [cx, cy, direction] of [[0, 0, 1], [w, h, -1]] as const) {
    ctx.save();
    ctx.translate(cx, cy);
    for (const ring of rings) {
      const radius = h * ring.radius * settings.ringSize;
      ctx.save();
      ctx.rotate(time * ring.speed * direction * settings.ringSpeed);
      ctx.globalAlpha = Math.min(1, reveal * ring.alpha * settings.ringOpacity);
      ctx.strokeStyle = settings.ringColor;
      ctx.lineWidth = Math.max(.45, h * ring.width);
      ctx.shadowColor = settings.ringColor;
      ctx.shadowBlur = Math.max(1.5, h * .005);
      if (ring.dash) {
        const unit = Math.PI * 2 * radius / ring.dash;
        ctx.setLineDash([unit * .55, unit * .45]);
      }
      ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    // Two gentle glints travel on the rotating tracks rather than following the pointer.
    for (const [radiusRatio, offset, speed] of [[.2314, .75, .25], [.2949, 2.2, .16]]) {
      const angle = offset + time * speed * direction * settings.ringSpeed;
      const x = Math.cos(angle) * h * radiusRatio * settings.ringSize;
      const y = Math.sin(angle) * h * radiusRatio * settings.ringSize;
      const pulse = .8 + .2 * Math.sin(time * 2.4 + offset * 5);
      ctx.globalAlpha = Math.min(1, reveal * pulse * settings.ringOpacity);
      ctx.fillStyle = settings.ringColor;
      ctx.shadowColor = settings.ringColor;
      ctx.shadowBlur = Math.max(3, h * .012);
      ctx.beginPath(); ctx.arc(x, y, Math.max(.8, h * .0018), 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}
