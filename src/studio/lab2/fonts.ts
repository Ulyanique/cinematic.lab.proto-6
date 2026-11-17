import '@fontsource/forum/cyrillic-400.css';
import '@fontsource/forum/latin-400.css';
import '@fontsource/prata/cyrillic-400.css';
import '@fontsource/prata/latin-400.css';
import '@fontsource/playfair-display/cyrillic-700.css';
import '@fontsource/playfair-display/latin-700.css';
import '@fontsource/cormorant/cyrillic-600.css';
import '@fontsource/cormorant/latin-600.css';
import '@fontsource/montserrat/cyrillic-600.css';
import '@fontsource/montserrat/latin-600.css';
import '@fontsource/old-standard-tt/cyrillic-400.css';
import '@fontsource/old-standard-tt/latin-400.css';

import forumC from '@fontsource/forum/files/forum-cyrillic-400-normal.woff?url';
import forumL from '@fontsource/forum/files/forum-latin-400-normal.woff?url';
import prataC from '@fontsource/prata/files/prata-cyrillic-400-normal.woff?url';
import prataL from '@fontsource/prata/files/prata-latin-400-normal.woff?url';
import playC from '@fontsource/playfair-display/files/playfair-display-cyrillic-700-normal.woff?url';
import playL from '@fontsource/playfair-display/files/playfair-display-latin-700-normal.woff?url';
import corC from '@fontsource/cormorant/files/cormorant-cyrillic-600-normal.woff?url';
import corL from '@fontsource/cormorant/files/cormorant-latin-600-normal.woff?url';
import monC from '@fontsource/montserrat/files/montserrat-cyrillic-600-normal.woff?url';
import monL from '@fontsource/montserrat/files/montserrat-latin-600-normal.woff?url';
import oldC from '@fontsource/old-standard-tt/files/old-standard-tt-cyrillic-400-normal.woff?url';
import oldL from '@fontsource/old-standard-tt/files/old-standard-tt-latin-400-normal.woff?url';

export interface FontDef { label: string; family: string; weight: number; urls: string[] }

/** Каждый шрифт состоит из кириллического и латинского подмножества: символ берётся из того, где он есть. */
export const FONTS: Record<string, FontDef> = {
  forum: { label: 'Forum', family: 'Forum', weight: 400, urls: [forumC, forumL] },
  prata: { label: 'Prata', family: 'Prata', weight: 400, urls: [prataC, prataL] },
  playfair: { label: 'Playfair Display', family: 'Playfair Display', weight: 700, urls: [playC, playL] },
  cormorant: { label: 'Cormorant', family: 'Cormorant', weight: 600, urls: [corC, corL] },
  oldstandard: { label: 'Old Standard TT', family: 'Old Standard TT', weight: 400, urls: [oldC, oldL] },
  montserrat: { label: 'Montserrat', family: 'Montserrat', weight: 600, urls: [monC, monL] },
};

export const FONT_OPTIONS: [string, string][] = Object.entries(FONTS).map(([k, v]) => [k, v.label]);

export const fontOf = (key: string): FontDef => FONTS[key] ?? FONTS.forum;

export async function loadFontFace(key: string, sample: string) {
  const f = fontOf(key);
  await document.fonts.load(`${f.weight} 100px "${f.family}"`, sample + 'ABCabc');
}
