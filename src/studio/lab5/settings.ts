export interface FilmSettings {
  title: string; subtitle: string; titleFont: 'Prata' | 'Forum' | 'Inter'; subtitleFont: 'Prata' | 'Forum' | 'Inter';
  titleScale: number; subtitleScale: number; titleSpacing: number; subtitleSpacing: number; titlePosition: number;
  titleLight: string; titleMid: string; titleGold: string; titleDark: string; subtitleColor: string;
  logoScale: number; logoOpacity: number; showTitle: boolean; showSubtitle: boolean; showLogo: boolean;
  revealSpeed: number; exitMotion: number;
  ringsEnabled: boolean; ringColor: string; ringSize: number; ringOpacity: number; ringSpeed: number;
  antialias: boolean;
  exposure: number; bloom: number; dust: number; beams: number; blast: number; sigil: number; sky: number; rays: number; grain: number; vignette: number;
  hue: number; saturation: number; cameraFov: number; cameraDrift: number;
  videoBrightness: number; videoOrder: number[];
}
export const DEFAULT_SETTINGS: FilmSettings = {
  title: 'ЯНТАРНЫЙ ЦИРКУЛЬ', subtitle: 'ВЕЧЕР РЕТРОСПЕКТИВА', titleFont: 'Prata', subtitleFont: 'Forum',
  titleScale: 1, subtitleScale: 1, titleSpacing: .055, subtitleSpacing: .34, titlePosition: 49,
  titleLight: '#fff6d6', titleMid: '#ffe3a0', titleGold: '#f0b24a', titleDark: '#c98a22', subtitleColor: '#ffe0a8',
  logoScale: 1, logoOpacity: 1, showTitle: true, showSubtitle: true, showLogo: true,
  revealSpeed: 1, exitMotion: 1,
  ringsEnabled: true, ringColor: '#edc67c', ringSize: 1, ringOpacity: 1, ringSpeed: 1,
  antialias: true,
  exposure: 1, bloom: 1, dust: 1, beams: 1, blast: 1, sigil: 1, sky: 1, rays: 1, grain: 1, vignette: 1,
  hue: 0, saturation: 1, cameraFov: 1, cameraDrift: 1, videoBrightness: 1,
  videoOrder: [0,1,2,3,4,5,6,7,8,9],
};
const KEY = 'cinematic-film-settings-v1';
const ranges: Partial<Record<keyof FilmSettings, [number, number]>> = {
  titleScale: [.55, 1.5], subtitleScale: [.6, 1.5], titleSpacing: [0, .2], subtitleSpacing: [0, .6], titlePosition: [38, 68], logoScale: [.5, 1.5], logoOpacity: [0, 1],
  revealSpeed: [.5, 2], exitMotion: [0, 2], ringSize: [.5, 1.5], ringOpacity: [0, 1.5], ringSpeed: [0, 2],
  exposure: [.35, 2], bloom: [0, 2], dust: [0, 2], beams: [0, 2], blast: [0, 2], sigil: [0, 2], sky: [0, 2], rays: [0, 2], grain: [0, 2], vignette: [0, 2],
  hue: [-180, 180], saturation: [0, 2], cameraFov: [.75, 1.3], cameraDrift: [0, 2], videoBrightness: [0, 2],
};
export function normalizeSettings(value: unknown): FilmSettings {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const result = { ...DEFAULT_SETTINGS, videoOrder: [...DEFAULT_SETTINGS.videoOrder] };
  for (const key of Object.keys(result) as (keyof FilmSettings)[]) {
    const v = source[key];
    if (key === 'videoOrder') {
      if (Array.isArray(v) && v.length === 10 && new Set(v).size === 10 && v.every(n => Number.isInteger(n) && n >= 0 && n < 10)) result.videoOrder = [...v];
    } else if (key === 'title' || key === 'subtitle') {
      if (typeof v === 'string') result[key] = v.replace(/[\r\n]/g, ' ').slice(0, key === 'title' ? 30 : 45);
    } else if (key === 'titleFont' || key === 'subtitleFont') {
      if (v === 'Prata' || v === 'Forum' || v === 'Inter') result[key] = v;
    } else if (key === 'titleLight' || key === 'titleMid' || key === 'titleGold' || key === 'titleDark' || key === 'subtitleColor' || key === 'ringColor') {
      if (typeof v === 'string' && /^#[\da-f]{6}$/i.test(v)) result[key] = v;
    } else if (key === 'showTitle' || key === 'showSubtitle' || key === 'showLogo' || key === 'ringsEnabled' || key === 'antialias') {
      if (typeof v === 'boolean') result[key] = v;
    } else if (ranges[key] && typeof v === 'number' && Number.isFinite(v)) {
      const [min, max] = ranges[key]!;
      (result as unknown as Record<string, unknown>)[key] = Math.min(max, Math.max(min, v));
    }
  }
  return result;
}
export function loadSettings(): FilmSettings {
  try {
    // A private snapshot in iframe.name freezes settings for an entire export.
    const raw = new URLSearchParams(location.search).get('export') === '1' && window.name ? window.name : localStorage.getItem(KEY);
    return normalizeSettings(raw ? JSON.parse(raw) : null);
  } catch { return normalizeSettings(null); }
}
export function saveSettings(settings: FilmSettings) {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* The current session still works without storage. */ }
}
