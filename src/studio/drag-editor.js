import * as THREE from 'three';
import { framePoint, hitElement, sponsorDragElements, clampPosition, snapBox, resizeScale } from './drag-layout.js';

/** Preview-only hit overlay. Its coordinates never become part of the video. */
export function createDragEditor({ getState, commit, commitScale, onMessage, onSelect }) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'studio-btn studio-btn-drag';
  button.title = 'Перемещение элементов мышью'; button.setAttribute('aria-label', button.title);
  button.setAttribute('aria-pressed', 'false');
  button.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2v20M2 12h20M9 5l3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3M19 9l3 3-3 3"/></svg>';
  document.querySelector('.studio-buttons').appendChild(button);
  const overlay = document.createElement('div');
  overlay.className = 'drag-editor'; overlay.hidden = true;
  const outline = document.createElement('div'); outline.className = 'drag-editor-outline'; outline.hidden = true; overlay.appendChild(outline);
  const handle = document.createElement('div'); handle.className = 'drag-resize-handle'; outline.appendChild(handle);
  const verticalGuide = document.createElement('div'), horizontalGuide = document.createElement('div');
  verticalGuide.className = 'drag-guide drag-guide-x'; horizontalGuide.className = 'drag-guide drag-guide-y';
  verticalGuide.hidden = horizontalGuide.hidden = true;
  overlay.append(verticalGuide, horizontalGuide);
  document.body.appendChild(overlay);
  let enabled = false, drag = null, selectedId = null;
  function syncRect() {
    const rect = getState().canvas.getBoundingClientRect();
    Object.assign(overlay.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    return rect;
  }
  function introElements(scene, cfg) {
    const intro = scene.intro, camera = intro?.camera;
    if (!scene.ready || !camera || !intro.logoRoot) return [];
    camera.updateMatrixWorld();
    const out = [];
    const targets = [
      ['lab2_logo', intro.logoRoot, 3.3, 3.4, 0],
      ['lab2_title', intro.titleRoot, 10.5, 1.2, intro.titleBaseY || 0],
      ['lab2_subtitle', intro.sub, 7, .8, 0],
      ['lab2_date', intro.date, 5, .8, 0],
    ];
    for (const [id, obj, width, height, offset] of targets) {
      if (!obj || !cfg[id] || cfg[id].enabled === false || obj.visible === false) continue;
      const p = obj.position.clone(); p.y += offset * (obj.scale?.y || 1);
      const p0 = p.clone().project(camera), px = p.clone().add(new THREE.Vector3(width / 2, 0, 0)).project(camera);
      const py = p.clone().add(new THREE.Vector3(0, height / 2, 0)).project(camera);
      if (p0.z < -1 || p0.z > 1) continue;
      const scaleKey = id === 'lab2_logo' || id === 'lab2_title' ? 'scale' : 'width';
      const size = cfg[id][scaleKey];
      const sizeFactor = scaleKey === 'scale' ? size : size / (id === 'lab2_subtitle' ? 7.25 : 4.45);
      out.push({ id, kind: 'world', scaleKey, x: (p0.x + 1) * 960, y: (1 - p0.y) * 540,
        w: Math.max(50, Math.abs(px.x - p0.x) * 1920 * sizeFactor), h: Math.max(40, Math.abs(py.y - p0.y) * 1080 * sizeFactor), z: p.z });
    }
    return out;
  }
  function elements() {
    const { id, cfg, scene } = getState();
    if (id === 'partners' || id.startsWith('sponsor-')) return sponsorDragElements(cfg);
    if (id.startsWith('lab-swarm')) return introElements(scene, cfg);
    // Классические сцены используют смещения эмблемы в мировых координатах.
    const obj = scene.logo?.root, camera = scene.camera;
    if (obj && camera && cfg.logo && obj.visible !== false) {
      camera.updateMatrixWorld();
      const p = obj.position.clone(), center = p.clone().project(camera);
      const edgeX = p.clone().add(new THREE.Vector3(1.5, 0, 0)).project(camera);
      const edgeY = p.clone().add(new THREE.Vector3(0, 1.5, 0)).project(camera);
      const sizeFactor = (cfg.logo.scale ?? .47) / .47;
      return [{ id: 'logo', kind: 'world', scaleKey: 'scale', xKey: 'offsetX', yKey: 'offsetY',
        x: (center.x + 1) * 960, y: (1 - center.y) * 540,
        w: Math.max(50, Math.abs(edgeX.x - center.x) * 1920 * sizeFactor),
        h: Math.max(40, Math.abs(edgeY.y - center.y) * 1080 * sizeFactor), z: p.z }];
    }
    return [];
  }
  function showHit(hit) {
    outline.hidden = !hit;
    if (!hit) return;
    handle.hidden = !(hit.id === selectedId && hit.scaleKey);
    Object.assign(outline.style, { left: `${(hit.x - hit.w / 2) / 1920 * 100}%`, top: `${(hit.y - hit.h / 2) / 1080 * 100}%`, width: `${hit.w / 1920 * 100}%`, height: `${hit.h / 1080 * 100}%` });
  }
  function showGuides(guides = []) {
    const x = guides.find(g => g.axis === 'x'), y = guides.find(g => g.axis === 'y');
    verticalGuide.hidden = !x; horizontalGuide.hidden = !y;
    if (x) verticalGuide.style.left = `${x.value / 1920 * 100}%`;
    if (y) horizontalGuide.style.top = `${y.value / 1080 * 100}%`;
  }
  function worldPoint(camera, rect, x, y, z) {
    const ndc = new THREE.Vector2((x - rect.left) / rect.width * 2 - 1, 1 - (y - rect.top) / rect.height * 2);
    const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, camera);
    return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -z), new THREE.Vector3());
  }
  button.addEventListener('click', () => {
    if (getState().recording) { onMessage('Во время записи перемещение недоступно.'); return; }
    if (drag) finish(true);
    enabled = !enabled; overlay.hidden = !enabled; outline.hidden = true; selectedId = null;
    button.setAttribute('aria-pressed', String(enabled));
    if (enabled) { syncRect(); onMessage('Перетащите элемент или потяните за угол рамки, чтобы изменить размер.'); }
  });
  window.addEventListener('resize', () => { if (enabled) syncRect(); });
  overlay.addEventListener('pointerdown', event => {
    if (event.button !== 0 || getState().recording) return;
    const state = getState(), rect = syncRect();
    const targets = elements();
    const pt = framePoint(rect, event.clientX, event.clientY);
    const selected = targets.find(e => e.id === selectedId);
    const onHandle = selected?.scaleKey && Math.abs(pt.x - selected.x - selected.w / 2) <= 14 * 1920 / rect.width && Math.abs(pt.y - selected.y - selected.h / 2) <= 14 * 1080 / rect.height;
    const hit = onHandle ? selected : hitElement(pt, targets);
    if (!hit) return;
    selectedId = hit.id; onSelect?.(hit.id); showHit(hit);
    const holder = state.cfg[hit.id];
    const world = hit.kind === 'world' ? worldPoint(state.scene.intro?.camera || state.scene.camera, rect, event.clientX, event.clientY, hit.z) : null;
    if (hit.kind === 'world' && !world) return;
    drag = { hit, id: state.id, rect, x: event.clientX, y: event.clientY, originalX: holder[hit.xKey || 'x'], originalY: holder[hit.yKey || 'y'], world, targets, mode: onHandle ? 'resize' : 'move', startPoint: pt, originalScale: holder[hit.scaleKey], config: state.cfg, paused: state.cfg.playback.paused };
    state.cfg.playback.paused = true;
    overlay.setPointerCapture(event.pointerId); overlay.classList.add('is-dragging');
    event.preventDefault();
  });
  overlay.addEventListener('pointermove', event => {
    if (!drag) {
      const rect = syncRect(), hit = hitElement(framePoint(rect, event.clientX, event.clientY), elements());
      const selected = elements().find(e => e.id === selectedId);
      overlay.style.cursor = hit ? 'grab' : 'default'; showHit(selected || hit); return;
    }
    const state = getState();
    if (state.id !== drag.id) { finish(true); return; }
    if (drag.mode === 'resize') {
      const field = state.sections.find(s => s.id === drag.hit.id)?.fields.find(f => f.key === drag.hit.scaleKey);
      const point = framePoint(drag.rect, event.clientX, event.clientY);
      const value = resizeScale(drag.hit, drag.startPoint, point, drag.originalScale, field?.min ?? .1, field?.max ?? 5);
      commitScale(drag.id, drag.hit.id, drag.hit.scaleKey, value, true);
      showHit(elements().find(e => e.id === drag.hit.id));
      return;
    }
    const pointerDx = (event.clientX - drag.x) * 1920 / drag.rect.width;
    const pointerDy = (event.clientY - drag.y) * 1080 / drag.rect.height;
    const candidate = { ...drag.hit, x: drag.hit.x + pointerDx, y: drag.hit.y + pointerDy };
    // Восемь экранных пикселей независимо от размера предпросмотра. Alt отключает привязку.
    const snapped = event.altKey ? { x: candidate.x, y: candidate.y, guides: [] }
      : snapBox(candidate, drag.targets, 8 * 1920 / drag.rect.width, 8 * 1080 / drag.rect.height);
    const screenDx = snapped.x - drag.hit.x, screenDy = snapped.y - drag.hit.y;
    let dx, dy;
    if (drag.hit.kind === 'world') {
      const clientX = drag.x + screenDx * drag.rect.width / 1920;
      const clientY = drag.y + screenDy * drag.rect.height / 1080;
      const world = worldPoint(state.scene.intro?.camera || state.scene.camera, drag.rect, clientX, clientY, drag.hit.z);
      if (!world) return;
      dx = world.x - drag.world.x; dy = world.y - drag.world.y;
    } else { dx = screenDx; dy = screenDy; }
    const fields = state.sections.find(s => s.id === drag.hit.id)?.fields || [];
    const fieldX = fields.find(f => f.key === (drag.hit.xKey || 'x')), fieldY = fields.find(f => f.key === (drag.hit.yKey || 'y'));
    const x = clampPosition(drag.originalX + dx, fieldX?.min ?? -Infinity, fieldX?.max ?? Infinity);
    const y = clampPosition(drag.originalY + dy, fieldY?.min ?? -Infinity, fieldY?.max ?? Infinity);
    showGuides(x === drag.originalX + dx && y === drag.originalY + dy ? snapped.guides : []);
    commit(drag.id, drag.hit.id, drag.hit.xKey || 'x', drag.hit.yKey || 'y', x, y, true);
    const moved = elements().find(item => item.id === drag.hit.id); showHit(moved);
  });
  function finish(cancel = false) {
    if (!drag) return;
    drag.config.playback.paused = drag.paused;
    const holder = drag.config[drag.hit.id];
    if (holder && drag.mode === 'resize') commitScale(drag.id, drag.hit.id, drag.hit.scaleKey, cancel ? drag.originalScale : holder[drag.hit.scaleKey], false);
    else if (holder) commit(drag.id, drag.hit.id, drag.hit.xKey || 'x', drag.hit.yKey || 'y', cancel ? drag.originalX : holder[drag.hit.xKey || 'x'], cancel ? drag.originalY : holder[drag.hit.yKey || 'y'], false);
    drag = null; overlay.classList.remove('is-dragging'); showHit(elements().find(e => e.id === selectedId)); showGuides();
  }
  overlay.addEventListener('pointerup', () => finish());
  overlay.addEventListener('pointercancel', () => finish(true));
  window.addEventListener('keydown', event => { if (event.key === 'Escape' && drag) { finish(true); event.preventDefault(); } });
  return { cancel() { finish(true); }, sync() { finish(true); selectedId = null; if (enabled) { syncRect(); outline.hidden = true; } } };
}
