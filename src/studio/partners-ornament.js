/** Нижний золотой орнамент: четыре луча, центральная звезда и парные линии. */
export function drawPartnersOrnament(ctx, layer, alpha) {
  if (!layer || layer.enabled === false || alpha <= 0) return;
  const { x = 960, y = 823, scale = 1, opacity = 1, color = '#e5bd7c' } = layer;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha * opacity));
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.35;

  // Центральная горизонталь прерывается у звезды; над ней и под ней две пары коротких линий.
  ctx.beginPath();
  for (const [x1, y1, x2, y2] of [
    [-620, 0, -50, 0], [50, 0, 620, 0],
    [-295, -52, -68, -52], [68, -52, 295, -52],
    [-295, 58, -68, 58], [68, 58, 295, 58],
    [0, -130, 0, -64], [0, 64, 0, 120],
  ]) { ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); }
  ctx.stroke();

  // Четырёхлучевая вогнутая звезда, как в референсе, с малым заполненным ромбом.
  ctx.beginPath();
  ctx.moveTo(0, -52);
  ctx.bezierCurveTo(0, -18, 18, 0, 52, 0);
  ctx.bezierCurveTo(18, 0, 0, 18, 0, 52);
  ctx.bezierCurveTo(0, 18, -18, 0, -52, 0);
  ctx.bezierCurveTo(-18, 0, 0, -18, 0, -52);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -18); ctx.lineTo(18, 0); ctx.lineTo(0, 18); ctx.lineTo(-18, 0);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}
