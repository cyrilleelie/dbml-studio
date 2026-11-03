import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseDBML } = require('../src/parser.js');
const { getCompletions, expandSnippet } = require('../src/autocomplete.js');
const base = readFileSync(new URL('../examples/cinematique-assurance.dbml', import.meta.url), 'utf8');
const db = parseDBML(base);
const at = (append, explicit = false) => {
  const text = base + append;
  const r = getCompletions(text, text.length, db, explicit);
  return r ? r.items.map(i => i.label) : [];
};

test('blocs en début de ligne', () => {
  assert.deepEqual(at('\nTa'), ['Table', 'TableGroup']);
  assert.ok(at('\nMap').includes('Mapping'));
});

test('tables puis colonnes dans une relation', () => {
  assert.equal(at('\nRef: dimass')[0], 'dwh.dim_assure');
  assert.deepEqual(at('\nRef: dwh.dim_contrat.pr'), ['produit', 'prime_annuelle']);
  assert.deepEqual(at('\nRef: dwh.dim_contrat.produit '), ['>', '<', '-', '<>']);
  assert.ok(at('\nRef: a.b > mart.prod').includes('mart.indicateur_sp.produit'));
});

test('types : enums et types déjà utilisés en premier', () => {
  const t = at('\nTable x {\n  id ');
  assert.equal(t[0], 'statut_sinistre');
  assert.equal(at('\nTable x {\n  code var')[0], 'varchar(20)');
  assert.deepEqual(at('\nTable x {\n  id integer'), []); // déjà complet : pas de liste
});

test('paramètres selon le contexte, sans doublon', () => {
  const col = at('\nTable x {\n  id int [pk, ');
  assert.ok(!col.includes('pk') && col.includes('not null') && col.includes('note'));
  assert.deepEqual(at('\nRef: a.b > c.d ['), ['delete', 'update']);
  assert.deepEqual(at('\nRef: a.b > c.d [delete: ca'), ['cascade']);
  assert.deepEqual(at('\nMapping m {\n  a.b > c.d [tr'), ['transform']);
  assert.ok(at('\nTable x {\n  id int [ref: > stg.pe').includes('stg.personne'));
});

test('mappings : étoile et colonnes composites', () => {
  assert.ok(at('\nMapping m {\n  stg.personne.').includes('*'));
  assert.deepEqual(at('\nMapping m {\n  stg.personne.(nom, pr'), ['prenom']);
});

test('rien dans une chaîne ou un commentaire', () => {
  assert.deepEqual(at("\nTable x {\n  id int [note: 'ab"), []);
  assert.deepEqual(at('\n// Tab'), []);
});

test('expansion des snippets', () => {
  const { text, stops } = expandSnippet('Table ${1:nom} {\n  ${2:id}\n  $0\n}', '  ');
  assert.equal(text, 'Table nom {\n    id\n    \n  }');
  assert.deepEqual(stops.map(s => text.slice(s.start, s.end)), ['nom', 'id', '']);
});

test('un paramètre entièrement tapé reste proposé (note, ref)', () => {
  const db = parseDBML('Table orders {\n  id int [pk]\n}');
  for (const [txt, want] of [['Table t {\n  a int [note', 'note'], ['Table t {\n  a int [pk, ref', 'ref']]) {
    const r = getCompletions(txt, txt.length, db, false);
    assert.ok(r && r.items.some(i => i.label === want), want);
  }
  const txt = 'Table t {\n  a int [pk, no';
  const r = getCompletions(txt, txt.length, db, false);
  assert.ok(!r.items.some(i => i.label === 'pk'));
});

test('snippet sans $0 : position finale ajoutée en fin', () => {
  const { text, stops } = expandSnippet('decimal(${1:10},${2:2})', '');
  assert.equal(text, 'decimal(10,2)');
  assert.deepEqual(stops.map(s => [s.start, s.end]), [[8, 10], [11, 12], [13, 13]]);
});

test('déduction de clé étrangère (FK) depuis le nom de colonne', () => {
  const db = parseDBML(`
    Table users { id integer [pk] }
    Table order_items { id integer [pk] }
    Table addresses { id integer [pk] }
  `);
  const txt = 'Table orders {\n  user_id integer [';
  const r = getCompletions(txt, txt.length, db, false);
  assert.ok(r.items[0].insert.includes('ref: > users.id'));
  const txt2 = 'Table x {\n  id_users integer [';
  const r2 = getCompletions(txt2, txt2.length, db, false);
  assert.ok(r2.items.some(i => i.insert === 'ref: > users.id'));
  // pas de devinette si déjà présent ou ambigu / table introuvable
  const txt3 = 'Table orders {\n  random_field integer [';
  const r3 = getCompletions(txt3, txt3.length, db, false);
  assert.ok(!r3.items.some(i => i.detail === 'déduit du nom'));
});

test('valeurs enum proposées pour default: sur une colonne typée par un enum', () => {
  const db = parseDBML(`
    Enum statut { ouvert paid clos }
    Table t { s statut }
  `);
  const txt = 'Table t {\n  s statut [default: ';
  const r = getCompletions(txt, txt.length, db, false);
  assert.deepEqual(r.items.map(i => i.label), ["'ouvert'", "'paid'", "'clos'"]);
});

test('couverture des cibles dans un Mapping : les colonnes non alimentées remontent', () => {
  const db = parseDBML(`
    Table s {
      a int
      b int
      c int
    }
    Table t {
      a int
      b int
      c int
    }
    Mapping m {
      s.a > t.a
    }
  `);
  const txt = "Mapping m {\n  s.a > t.a\n  s.b > t.";
  const r = getCompletions(txt, txt.length, db, false);
  const labels = r.items.map(i => i.label);
  assert.ok(labels.indexOf('b') < labels.indexOf('a'), labels.join(','));
  const a = r.items.find(i => i.label === 'a'), b = r.items.find(i => i.label === 'b');
  assert.match(a.doc, /Déjà alimentée/);
  assert.match(b.doc, /Pas encore alimentée/);
});

test('expansion « table.* > table.* » par colonnes de même nom', () => {
  const db = parseDBML(`
    Table s {
      a int
      b int
      z int
    }
    Table t {
      a int
      b int
      w int
    }
  `);
  const txt = 'Mapping m {\n  s.* > t.*';
  const r = getCompletions(txt, txt.length, db, true);
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].kind, 'action');
  assert.equal(r.items[0].insert, 's.a > t.a\ns.b > t.b');
});

test('TableGroup : tables hors région en premier, celles déjà tapées dans le bloc exclues', () => {
  const db = parseDBML(`
    Table a { id int }
    Table b { id int }
    Table c { id int }
    TableGroup g1 { a }
  `);
  const txt = 'TableGroup g2 {\n  b\n  ';
  const r = getCompletions(txt, txt.length, db, true);
  const labels = r.items.map(i => i.label);
  assert.ok(!labels.includes('b'));
  assert.ok(labels.includes('c'));
  assert.ok(labels.indexOf('c') < labels.indexOf('a'));
});

test("Ref groupé : [ après le nom propose color/note, [ après Ref: propose delete/update", () => {
  const db = parseDBML('Table a { id int [pk] }\nTable b { id int [pk] }');
  const grp = getCompletions('Ref grp [', 9, db, false);
  assert.deepEqual(grp.items.map(i => i.label), ['color', 'note']);
  const rel = getCompletions('Ref: a.id > b.id [', 19, db, false);
  assert.deepEqual(rel.items.map(i => i.label), ['delete', 'update']);
});

test('Lanes : snippet, paramètre lane et noms de colonnes', () => {
  assert.ok(at('\nLan').includes('Lanes'));
  assert.ok(at('\nTable x [la', true).includes('lane'));
  assert.equal(at('\nTable x [lane: st')[0], 'staging');
  assert.ok(at('\nLanes {\n  a [wi', true).includes('width'));
});
