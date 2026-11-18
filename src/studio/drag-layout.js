/** Coordinate math for the editor overlay. All sponsor coordinates use the 1920×1080 frame. */
export function framePoint(rect, clientX, clientY) {
  return { x: (clientX - rect.left) * 1920 / rect.width, y: (clientY - rect.top) * 1080 / rect.height };
}
export function hitElement(point, elements) {
  // Frontmost matching target wins; thin elements remain practical to grab.
  return [...elements].reverse().find(e => {
    const dx = Math.abs(point.x - e.x), dy = Math.abs(point.y - e.y);
    if (dx > e.w / 2 || dy > e.h / 2) return false;
    return !e.borderOnly || Math.min(e.w / 2 - dx, e.h / 2 - dy) <= 42;
  }) || null;
}
export function clampPosition(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
export function sponsorDragElements(cfg) {
  const items = [
    ['stageFrame', 1710, 930],
    ['stageCompass', 360, 370], ['stageOrnament', 1240, 250],
    ['stageOrganizer1', 590, 170], ['stageOrganizer2', 590, 170],
    ['stagePartner1', 590, 170], ['stagePartner2', 590, 170], ['stageSingleMark', 700, 230],
    ['stageOrganizerLabel', 460, 50], ['stageCoorganizerLabel', 460, 50],
    ['stagePartnerLabel', 460, 50], ['stagePartnerLabel2', 460, 50],
    ['stageTitle', 1000, 75], ['stageSubtitle', 800, 60], ['stageTitleDivider', 360, 18],
  ];
  return items.flatMap(([id, w, h]) => {
    const layer = cfg[id];
    if (!layer || layer.enabled === false) return [];
    const scale = Number.isFinite(layer.scale) ? layer.scale : 1;
    return [{ id, x: layer.x, y: layer.y, w: w * scale, h: h * scale, kind: 'frame', borderOnly: id === 'stageFrame', scaleKey: 'scale' }];
  });
}

/** Snap box centre and edges to the canvas and visible neighbouring boxes. */
export function snapBox(box, others, thresholdX, thresholdY) {
  const axes = [
    { axis: 'x', size: 'w', canvas: 1920, threshold: thresholdX },
    { axis: 'y', size: 'h', canvas: 1080, threshold: thresholdY },
  ];
  const result = { x: box.x, y: box.y, guides: [] };
  for (const { axis, size, canvas, threshold } of axes) {
    const moving = [box[axis] - box[size] / 2, box[axis], box[axis] + box[size] / 2];
    const targets = [0, canvas / 2, canvas];
    for (const other of others) {
      if (other.id === box.id) continue;
      targets.push(other[axis] - other[size] / 2, other[axis], other[axis] + other[size] / 2);
    }
    let best = null;
    for (const target of targets) for (const anchor of moving) {
      const delta = target - anchor;
      if (Math.abs(delta) <= threshold && (best === null || Math.abs(delta) < Math.abs(best.delta))) best = { target, delta };
    }
    if (best) { result[axis] += best.delta; result.guides.push({ axis, value: best.target }); }
  }
  return result;
}

/** Масштабирование за нижний правый угол с сохранением пропорций. */
export function resizeScale(box, start, point, original, min, max) {
  const x = box.w / 2, y = box.h / 2;
  const denom = x * x + y * y;
  if (!Number.isFinite(original) || denom < 1) return original;
  const ratio = 1 + ((point.x - start.x) * x + (point.y - start.y) * y) / denom;
  return clampPosition(original * ratio, min, max);
}
