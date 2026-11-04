// Assemble index.html à la racine : un seul fichier autonome, utilisable hors ligne.
// C'est le livrable versionné (tests Playwright, GitHub Pages) ; ne jamais l'éditer à la main.
// Usage : node build.mjs   (aucune dépendance, Node 18+)
import { readFileSync, writeFileSync } from 'node:fs';

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
inject('/*__SAMPLES__*/', JSON.stringify(samples).replace(/<\//g, '<\\/'));

writeFileSync(new URL('index.html', import.meta.url), html);
console.log(`index.html généré (${(html.length / 1024).toFixed(0)} Ko)`);
