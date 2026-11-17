import '@fontsource/prata/cyrillic-400.css';
import '@fontsource/prata/latin-400.css';
import '@fontsource/forum/cyrillic-400.css';
import '@fontsource/forum/latin-400.css';
import '@fontsource/inter/cyrillic-500.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/cyrillic-400.css';
import '@fontsource/inter/latin-400.css';

/** Дождаться шрифтов, которыми рисуются надписи фильма. */
export async function loadLab5Fonts(text: string) {
  if (!document.fonts) return;
  const faces = ['400 40px "Prata"', '400 20px "Forum"', '500 40px "Inter"', '400 40px "Inter"'];
  await Promise.all(faces.map((f) => document.fonts.load(f, text).catch(() => [])));
  await document.fonts.ready;
}
