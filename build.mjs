// Assemble index.html à la racine : un seul fichier autonome, utilisable hors ligne.
// C'est le livrable versionné (tests Playwright, GitHub Pages) ; ne jamais l'éditer à la main.
// Génère aussi manifest.webmanifest et sw.js (PWA), versionnés à côté de index.html.
// Usage : node build.mjs   (aucune dépendance, Node 18+)
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');

// Exemples : un fichier .dbml = une entrée du menu « Exemples ».
// L'ordre et les libellés du menu sont définis dans src/index.html (attribut data-ex).
const EXAMPLES = { shop: 'examples/boutique.dbml', flow: 'examples/cinematique-assurance.dbml' };
const samples = Object.fromEntries(Object.entries(EXAMPLES).map(([k, f]) => [k, read(f)]));

// Remplacements par fonction : évite que des séquences « $& » ou « $' » du code injecté soient interprétées.
let html = read('src/index.html');
const inject = (marker, content) => {
  if (!html.includes(marker)) throw new Error(`Marqueur ${marker} absent de src/index.html`);
  html = html.replace(marker, () => content);
};
inject('/*__DAGRE__*/', read('vendor/dagre.min.js'));
inject('/*__PARSER__*/', read('src/parser.js'));
inject('/*__AUTOCOMPLETE__*/', read('src/autocomplete.js'));
inject('/*__DICTIONARY__*/', read('src/dictionary.js'));
inject('/*__SAMPLES__*/', JSON.stringify(samples).replace(/<\//g, '<\\/'));

writeFileSync(new URL('index.html', import.meta.url), html);
console.log(`index.html généré (${(html.length / 1024).toFixed(0)} Ko)`);

// --- PWA : manifeste et service worker ---
const ICONS = [
  { src: 'assets/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: 'assets/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  { src: 'assets/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
];
const manifest = {
  name: 'DBML Studio',
  short_name: 'DBML Studio',
  description: 'Éditeur et visualiseur de schémas DBML, local et hors ligne.',
  lang: 'fr',
  start_url: './',
  scope: './',
  display: 'standalone',
  background_color: '#e9eef1',
  theme_color: '#1c3550',
  icons: ICONS,
};
writeFileSync(new URL('manifest.webmanifest', import.meta.url), JSON.stringify(manifest, null, 2) + '\n');

// Le nom du cache dépend du contenu d'index.html : un nouveau déploiement remplace l'ancien cache.
const version = createHash('sha256').update(html).digest('hex').slice(0, 12);
const precache = ['./', 'index.html', 'manifest.webmanifest', ...ICONS.map(i => i.src)];
const sw = `// généré par build.mjs, ne pas éditer
const CACHE = 'dbml-studio-${version}';
const PRECACHE = ${JSON.stringify(precache)};

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  // Autres origines (Google Fonts…) et méthodes non GET : on laisse passer, sans cache.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    // Réseau d'abord (pour récupérer les mises à jour), repli sur le cache hors ligne.
    e.respondWith(
      fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put('index.html', copy)); }
        return res;
      }).catch(() => caches.match('index.html').then(r => r || caches.match('./')))
    );
    return;
  }
  // Ressources du même origine : cache d'abord.
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }))
  );
});
`;
writeFileSync(new URL('sw.js', import.meta.url), sw);
console.log(`manifest.webmanifest et sw.js générés (cache dbml-studio-${version})`);
