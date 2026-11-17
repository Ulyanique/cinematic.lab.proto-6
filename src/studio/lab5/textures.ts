import * as THREE from "three";

/** Draws the "video placeholder" UI that sits on every monolith screen. */
export function makePlaceholderTexture(index: number, total: number, aspect: number) {
  // design in a 512-wide coordinate space, rasterise at 1.5x for crisp type up close
  const w = 512;
  const h = Math.round(w / aspect);
  const K = 1.5;
  const c = document.createElement("canvas");
  c.width = Math.round(w * K);
  c.height = Math.round(h * K);
  const g = c.getContext("2d")!;
  g.scale(K, K);
  g.clearRect(0, 0, w, h);

  const gold = "rgba(255,206,110,0.95)";
  const goldDim = "rgba(255,190,90,0.28)";
  const m = w * 0.075;

  // faint grid
  g.strokeStyle = "rgba(255,190,90,0.07)";
  g.lineWidth = 1;
  for (let x = m; x < w - m; x += (w - 2 * m) / 6) {
    g.beginPath();
    g.moveTo(x, m);
    g.lineTo(x, h - m);
    g.stroke();
  }
  for (let y = m; y < h - m; y += (w - 2 * m) / 6) {
    g.beginPath();
    g.moveTo(m, y);
    g.lineTo(w - m, y);
    g.stroke();
  }

  // diagonals — classic placeholder cross
  g.strokeStyle = goldDim;
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(m, m);
  g.lineTo(w - m, h - m);
  g.moveTo(w - m, m);
  g.lineTo(m, h - m);
  g.stroke();

  // corner brackets
  g.strokeStyle = gold;
  g.lineWidth = 4;
  const b = w * 0.1;
  const corner = (x: number, y: number, dx: number, dy: number) => {
    g.beginPath();
    g.moveTo(x + dx * b, y);
    g.lineTo(x, y);
    g.lineTo(x, y + dy * b);
    g.stroke();
  };
  corner(m, m, 1, 1);
  corner(w - m, m, -1, 1);
  corner(m, h - m, 1, -1);
  corner(w - m, h - m, -1, -1);

  // play button
  const cx = w / 2;
  const cy = h * 0.47;
  const R = w * 0.17;
  g.fillStyle = "rgba(20,8,0,0.55)";
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = gold;
  g.lineWidth = 5;
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 1.5;
  g.strokeStyle = goldDim;
  g.beginPath();
  g.arc(cx, cy, R * 1.28, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = gold;
  g.beginPath();
  g.moveTo(cx - R * 0.28, cy - R * 0.42);
  g.lineTo(cx + R * 0.48, cy);
  g.lineTo(cx - R * 0.28, cy + R * 0.42);
  g.closePath();
  g.fill();

  // typography
  const font = (px: number, weight = 600) => `${weight} ${px}px "Inter", "Helvetica Neue", Arial, sans-serif`;
  g.fillStyle = gold;
  g.textBaseline = "alphabetic";
  g.font = font(w * 0.2, 700);
  g.textAlign = "left";
  g.fillText(String(index + 1).padStart(2, "0"), m + 10, m + w * 0.26);
  g.font = font(w * 0.05, 500);
  g.fillStyle = "rgba(255,206,110,0.6)";
  g.fillText(`/ ${String(total).padStart(2, "0")}`, m + 14 + w * 0.3, m + w * 0.245);

  g.textAlign = "center";
  g.fillStyle = gold;
  g.font = font(w * 0.058, 600);
  const label = "VIDEO PLACEHOLDER";
  try {
    (g as unknown as { letterSpacing: string }).letterSpacing = "6px";
  } catch {
    /* noop */
  }
  g.fillText(label, cx, h - m - w * 0.24);
  g.font = font(w * 0.042, 500);
  g.fillStyle = "rgba(255,206,110,0.62)";
  g.fillText("9 : 16   ·   00:00:15", cx, h - m - w * 0.15);

  // timeline bar
  const by = h - m - w * 0.07;
  g.fillStyle = "rgba(255,190,90,0.22)";
  g.fillRect(m + 8, by, w - 2 * m - 16, 5);
  g.fillStyle = gold;
  g.fillRect(m + 8, by, (w - 2 * m - 16) * (0.15 + 0.07 * index), 5);
  g.beginPath();
  g.arc(m + 8 + (w - 2 * m - 16) * (0.15 + 0.07 * index), by + 2.5, 8, 0, Math.PI * 2);
  g.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  return tex;
}
