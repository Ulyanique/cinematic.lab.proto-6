#!/usr/bin/env node
/**
 * Скриншот сцены в headless-Chromium (@sparticuz/chromium + playwright-core).
 *
 * В песочнице нет системного браузера и root-доступа на apt, поэтому
 * используется @sparticuz/chromium: сам бинарник + swiftshader + шрифты,
 * а системные библиотеки (libnss3 и пр.) берутся из al2023.tar.br, который
 * пакет распаковывает только на Amazon Linux 2023. Здесь мы распаковываем
 * его вручную и подставляем через LD_LIBRARY_PATH — вне AWS Lambda
 * isRunningInAmazonLinux2023() возвращает false, иначе /tmp/chromium не
 * стартует (libnspr4.so: cannot open shared object file).
 *
 * Использование:
 *   node scripts/preview-shot.mjs <url|scene-id> [timeSec] [output.png]
 *
 * Примеры:
 *   node scripts/preview-shot.mjs gallery                 # полный кадр сцены
 *   node scripts/preview-shot.mjs sponsor-keaz 17.23 /tmp/keaz.png
 *
 * Требуется запущенный dev-сервер (npm run dev) на порту из PREVIEW_BASE
 * (по умолчанию http://127.0.0.1:5174).
 */
import { inflate } from '../node_modules/@sparticuz/chromium/build/lambdafs.js';
import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = dirname(fileURLToPath(import.meta.url)) + '/..';
const bin = join(root, 'node_modules/@sparticuz/chromium/bin');
const base = process.env.PREVIEW_BASE ?? 'http://127.0.0.1:5174';
const target = process.argv[2];
const time = process.argv[3];
const output = process.argv[4] ?? '/tmp/preview-shot.png';

if (!target) {
  console.error('usage: node scripts/preview-shot.mjs <url|scene-id> [timeSec] [output.png]');
  process.exit(1);
}

// Распаковка идемпотентна: существующий файл/папка пропускается.
for (const f of ['chromium.br', 'fonts.tar.br', 'swiftshader.tar.br', 'al2023.tar.br']) {
  await inflate(join(bin, f));
}
if (!existsSync('/tmp/al2023/lib')) {
  console.error('/tmp/al2023/lib not found after inflate');
  process.exit(1);
}

const url = target.startsWith('http') ? target : `${base}/?scene=${encodeURIComponent(target)}`;
const browser = await chromium.launch({
  executablePath: '/tmp/chromium',
  env: { ...process.env, LD_LIBRARY_PATH: '/tmp/al2023/lib', FONTCONFIG_PATH: '/tmp/fonts', HOME: '/tmp' },
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--force-color-profile=srgb', '--hide-scrollbars'],
});

try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  // Дать движку собрать шрифты, текстуры и первый кадр.
  await page.waitForTimeout(7_000);
  if (time) {
    await page.evaluate((t) => {
      const app = window.__logo;
      if (app && typeof app.renderAt === 'function') app.renderAt(Number(t));
      else console.warn('renderAt missing');
    }, time);
    await page.waitForTimeout(800);
  }
  await page.screenshot({ path: output });
  console.log('saved', output);
} finally {
  await browser.close();
}
