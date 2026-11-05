// Rend assets/icon.svg en PNG (192, 512 et variante « maskable » 512) avec Chromium (Playwright).
// Usage : npm run icons   (PW_CHROMIUM=/chemin/chrome pour utiliser un Chromium préinstallé)
// Les PNG sont versionnés : le déploiement Pages n'a pas besoin de Chromium.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const { chromium } = createRequire(import.meta.url)('@playwright/test');
const svg = readFileSync(new URL('../assets/icon.svg', import.meta.url));
const src = 'data:image/svg+xml;base64,' + svg.toString('base64');

// Icône normale : le SVG occupe toute la surface (coins arrondis transparents).
// Maskable : fond plein couleur de l'icône, motif réduit à 70 % (zone de sécurité de 80 %).
const BG = '#16324a';
const jobs = [
  { file: 'icon-192.png', size: 192, scale: 1, bg: 'transparent' },
  { file: 'icon-512.png', size: 512, scale: 1, bg: 'transparent' },
  { file: 'icon-maskable-512.png', size: 512, scale: 0.7, bg: BG },
];

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
try {
  for (const { file, size, scale, bg } of jobs) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    const w = Math.round(size * scale);
    await page.setContent(`<body style="margin:0;width:${size}px;height:${size}px;background:${bg};display:grid;place-items:center">` +
      `<img src="${src}" width="${w}" height="${w}"></body>`);
    await page.locator('img').evaluate(i => i.decode());
    await page.screenshot({ path: new URL(`../assets/${file}`, import.meta.url).pathname, omitBackground: true });
    await page.close();
    console.log(`assets/${file} (${size}×${size})`);
  }
} finally {
  await browser.close();
}
