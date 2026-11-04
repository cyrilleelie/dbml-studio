const { test, expect } = require('@playwright/test');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };

let server, origin, errors, external;

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }).end(fs.readFileSync(file));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  origin = `http://127.0.0.1:${server.address().port}`;
});
test.afterAll(() => new Promise(r => server.close(r)));

test.beforeEach(async ({ page }) => {
  errors = [];
  external = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  // Only the local test server is allowed; any other http(s) origin is blocked and reported.
  await page.route(/^https?:/, r => {
    if (r.request().url().startsWith(origin)) return r.fallback();
    external.push(r.request().url());
    return r.abort();
  });
});
test.afterEach(() => {
  expect(external, 'no external network request expected').toEqual([]);
  expect(errors).toEqual([]);
});

test('file:// : no console error and no service worker', async ({ page, baseURL }) => {
  expect(baseURL).toMatch(/^file:/);
  await page.goto(baseURL);
  await expect(page.locator('#status')).toHaveClass(/ok/);
  // On file:// the API is either absent or refuses (SecurityError): both mean "no service worker".
  const regs = await page.evaluate(async () => {
    try { return 'serviceWorker' in navigator ? (await navigator.serviceWorker.getRegistrations()).length : 0; } catch { return 0; }
  });
  expect(regs).toBe(0);
  expect(await page.evaluate(() => navigator.serviceWorker && navigator.serviceWorker.controller)).toBeFalsy();
});

test('http : manifest, icons, service worker and offline reload', async ({ page, context, request }) => {
  await page.goto(origin + '/');
  await expect(page.locator('#status')).toHaveClass(/ok/);

  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const mres = await request.get(new URL(href, origin + '/').href);
  expect(mres.status()).toBe(200);
  const manifest = await mres.json();
  expect(manifest).toMatchObject({ name: 'DBML Studio', lang: 'fr', display: 'standalone', start_url: './', scope: './' });
  for (const size of ['192x192', '512x512']) {
    const icon = manifest.icons.find(i => i.sizes === size && i.purpose === 'any');
    expect(icon, `icon ${size}`).toBeTruthy();
    const r = await request.get(new URL(icon.src, origin + '/').href);
    expect(r.status()).toBe(200);
    expect(r.headers()['content-type']).toBe('image/png');
  }

  // The service worker registers and becomes active.
  await page.evaluate(() => navigator.serviceWorker.ready);
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).active.state)).toBe('activated');
  const cacheNames = await page.evaluate(() => caches.keys());
  expect(cacheNames).toHaveLength(1);
  expect(cacheNames[0]).toMatch(/^dbml-studio-[0-9a-f]{12}$/);

  // Offline: the page still loads from the cache.
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#status')).toHaveClass(/ok/);
  await context.setOffline(false);
});
