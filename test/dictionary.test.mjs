import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseDBML } = require('../src/parser.js');
const { buildDictionary } = require('../src/dictionary.js');
const ex = f => readFileSync(new URL(`../examples/${f}`, import.meta.url), 'utf8');
const gen = (src, o = {}) => buildDictionary(parseDBML(src), { date: '2026-03-04T12:00:00Z', ...o });

const SRC = `Project demo { Note: 'Note <projet> & co' }
Table app.users as U [note: '''Un <b>&"x" 'y'
ligne 2'''] {
  id int [pk, increment]
  email varchar(80) [not null, unique, note: '''a|b
c''']
  role_id int [ref: > app.roles.id, default: 3]
  indexes { (email, role_id) [unique, name: 'ux'] }
}
Table app.roles { id int [pk] }
Enum st { on [note: 'actif'] off }
Ref grp: app.users.id - app.roles.id [delete: cascade]
TableGroup g1 [note: 'Région 1'] { app.users }
Table hidden_t { x int }
`;

test('HTML : autonome, sans ressource externe, échappé', () => {
  const h = gen(SRC);
  assert.match(h, /^<!doctype html>/);
  assert.ok(!/https?:|<link|<script|@import|url\(/.test(h));
  assert.match(h, /<title>demo<\/title>/);
  assert.ok(h.includes('Un &lt;b&gt;&amp;&quot;x&quot; &#39;y&#39;<br>ligne 2'));
  assert.ok(h.includes('Note &lt;projet&gt; &amp; co'));
  assert.ok(!h.includes('<b>&"x"'));
  assert.match(h, /4 mars 2026/);
  assert.ok(h.includes('REF → app.roles.id') && h.includes('DEFAULT 3'));
  assert.ok(h.includes('PK') && h.includes('NOT NULL') && h.includes('UNIQUE') && h.includes('INCREMENT'));
  assert.ok(h.includes('hidden_t') && h.includes('Alias</b> : U') && h.includes('Région</b> : g1'));
  assert.ok(h.includes('(email, role_id)') && h.includes('ux'));
  assert.ok(h.includes('un-à-un (1:1)') && h.includes('grp') && h.includes('cascade'));
});

test('Markdown : tableaux GFM, | et retours à la ligne échappés', () => {
  const md = gen(SRC, { format: 'md' });
  assert.match(md, /^# demo\n/);
  assert.ok(md.includes('| Champ | Type | Contraintes | Description |\n| --- | --- | --- | --- |'));
  assert.ok(md.includes('a\\|b<br>c'));
  assert.ok(md.includes('Un &lt;b>&"x"'));
  assert.ok(md.includes('## Sommaire des tables') && md.includes('(#table-0)'));
  assert.ok(md.includes('## Relations') && md.includes('## Régions') && md.includes('## Énumérations'));
  assert.ok(!md.includes('## Flux de données'));
});

test('titre : Project, puis option title, puis défaut ; jamais le commentaire de layout', () => {
  assert.match(gen('Table t { a int }', { format: 'md' }), /^# Dictionnaire de données/);
  assert.match(gen('Table t { a int }', { format: 'md', title: 'mon-fichier' }), /^# mon-fichier/);
  assert.match(gen(SRC, { title: 'autre' }), /<h1>demo<\/h1>/);
  const withLayout = SRC + '\n/* dbml-studio:layout — x\n{"pos":{}}\n*/\n';
  for (const format of ['html', 'md']) assert.ok(!gen(withLayout, { format }).includes('dbml-studio:layout'));
});

test('exemple boutique : tables, régions, relations ; exemple cinématique : flux', () => {
  const shop = gen(ex('boutique.dbml'), { format: 'md' });
  assert.equal((shop.match(/^### <a id="table-/gm) || []).length, 9);
  assert.match(shop, /## Régions[\s\S]*### comptes/);
  const flow = gen(ex('cinematique-assurance.dbml'), { format: 'md' });
  assert.match(flow, /## Flux de données/);
  assert.equal((flow.match(/^### /gm) || []).length > 3, true);
});

test('le parseur expose les index et le Project', () => {
  const db = parseDBML(SRC);
  assert.deepEqual(db.project, { name: 'demo', note: 'Note <projet> & co' });
  assert.deepEqual(db.tables[0].indexes[0], { cols: ['email', 'role_id'], name: 'ux', type: null, unique: true, pk: false, note: null });
});
