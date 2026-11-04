// Assemble dist/dbml-studio.html : un seul fichier autonome, utilisable hors ligne.
// Usage : node build.mjs   (aucune dépendance, Node 18+)
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';

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

mkdirSync(new URL('dist/', import.meta.url), { recursive: true });
writeFileSync(new URL('dist/dbml-studio.html', import.meta.url), html);
console.log(`dist/dbml-studio.html généré (${(html.length / 1024).toFixed(0)} Ko)`);
