/** Размер видимого знака без искажения. На общей сцене ширина у всех одна. */
export function partnerLogoSize(width, height, { single = false, scale = 1 } = {}) {
  const w = Math.max(1, width), h = Math.max(1, height);
  const factor = (single ? Math.min(560 / w, 125 / h) : 440 / w) * scale;
  return { width: w * factor, height: h * factor };
}

/** Видимые границы альфа-маски в долях размера изображения. */
export function visibleLogoBounds(data, width, height, threshold = 24) {
  if (!(width > 0 && height > 0) || !data || data.length < width * height * 4) return { x: 0, y: 0, width: 1, height: 1 };
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > threshold) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
    }
  }
  if (maxX < minX || maxY < minY) return { x: 0, y: 0, width: 1, height: 1 };
  return { x: minX / width, y: minY / height, width: (maxX - minX + 1) / width, height: (maxY - minY + 1) / height };
}
