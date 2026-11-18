/** Coordinate math for the editor overlay. All sponsor coordinates use the 1920×1080 frame. */
export function framePoint(rect, clientX, clientY) {
  return { x: (clientX - rect.left) * 1920 / rect.width, y: (clientY - rect.top) * 1080 / rect.height };
}
export function hitElement(point, elements) {
  // Frontmost matching target wins; thin elements remain practical to grab.
  return [...elements].reverse().find(e => Math.abs(point.x - e.x) <= e.w / 2 && Math.abs(point.y - e.y) <= e.h / 2) || null;
}
export function clampPosition(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
export function sponsorDragElements(cfg) {
  const items = [
    ['stageCompass', 360, 370], ['stageDividerLeft', 500, 30], ['stageDividerRight', 500, 30],
    ['stageOrganizer1', 590, 170], ['stageOrganizer2', 590, 170],
    ['stagePartner1', 590, 170], ['stagePartner2', 590, 170], ['stageSingleMark', 700, 230],
    ['stageOrganizerLabel', 460, 50], ['stageCoorganizerLabel', 460, 50],
    ['stagePartnerLabel', 460, 50], ['stagePartnerLabel2', 460, 50],
    ['stageTitle', 1000, 75], ['stageSubtitle', 800, 60],
  ];
  return items.flatMap(([id, w, h]) => {
    const layer = cfg[id];
    if (!layer || layer.enabled === false) return [];
    const scale = Number.isFinite(layer.scale) ? layer.scale : 1;
    return [{ id, x: layer.x, y: layer.y, w: w * scale, h: h * scale, kind: 'frame' }];
  });
}
