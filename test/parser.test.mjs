import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseDBML, stripMappings, flattenGroups } = require('../src/parser.js');
const ex = f => readFileSync(new URL(`../examples/${f}`, import.meta.url), 'utf8');

test('les exemples fournis sont valides', () => {
  const shop = parseDBML(ex('boutique.dbml'));
  assert.equal(shop.tables.length, 9);
  assert.equal(shop.refs.length, 10);
  const flow = parseDBML(ex('cinematique-assurance.dbml'));
  assert.equal(flow.mappings.length, 3);
  assert.equal(flow.mappings.reduce((a, m) => a + m.flows.length, 0), 21);
});

test('colonnes, paramètres et valeurs par défaut', () => {
  const db = parseDBML(`Table t {
    id integer [pk, increment]
    prix decimal(10,2) [not null, default: 0]
    cree timestamp [default: \`now()\`]
    statut varchar [default: 'actif', note: 'état']
  }`);
  const [id, prix, cree, statut] = db.tables[0].cols;
  assert.ok(id.pk && id.inc);
  assert.equal(prix.type, 'decimal(10,2)');
  assert.ok(prix.nn);
  assert.equal(cree.def, 'now()');
  assert.equal(statut.def, "'actif'");
  assert.equal(statut.note, 'état');
});

test('relations : inline, alias, composite, actions', () => {
  const db = parseDBML(`
    Table a as A {
      id int [pk]
      x int
      y int
    }
    Table b {
      id int
      a_id int [ref: > A.id]
      x int
      y int
    }
    Ref: b.(x, y) > a.(x, y) [delete: cascade]`);
  assert.equal(db.refs.length, 2);
  assert.equal(db.refs[0].to.resolved, 'a');
  assert.deepEqual(db.refs[1].from.cols, ['x', 'y']);
  assert.equal(db.refs[1].onDelete, 'cascade');
});

test('erreurs localisées à la bonne ligne', () => {
  const cases = [
    ['Table a {\n  id int\n', 1, /accolade/],
    ['Table a { id int }\nRef: a.x > a.id', 2, /colonne « x »/],
    ['Table a {\n  id\n}', 2, /type manquant/],
    ['Tabel a {}', 1, /Mot-clé inconnu/],
  ];
  for (const [src, line, re] of cases) {
    assert.throws(() => parseDBML(src), e => e.dbml && e.line === line && re.test(e.message));
  }
});

test('Mapping : colonnes, N→1, table entière, transform', () => {
  const db = parseDBML(`
    Table s {
      a int
      b int
    }
    Table c {
      a int
      b int
      ab int
    }
    Mapping m [color: #123456] {
      s.a > c.a
      s.(a, b) -> c.ab [transform: 'a + b']
      s.* > c.*
    }`);
  const f = db.mappings[0].flows;
  assert.equal(f.length, 3);
  assert.equal(f[1].transform, 'a + b');
  assert.deepEqual(f[2].from.cols, ['*']);
  assert.throws(() => parseDBML('Table s {\n  a int\n}\nMapping {\n  s.a > s.zz\n}'), /zz/);
});

test('stripMappings produit du DBML standard', () => {
  const src = ex('cinematique-assurance.dbml');
  const out = stripMappings(src, parseDBML(src));
  assert.doesNotMatch(out, /^Mapping /m);
  assert.equal(parseDBML(out).tables.length, 10);
});

test('descriptions de champs : note simple et multiligne', () => {
  const db = parseDBML(`Table t {
  a int [note: 'Description courte']
  b int [not null, note: '''
    Première ligne.
    Deuxième ligne.
  ''']
}`);
  assert.equal(db.tables[0].cols[0].note, 'Description courte');
  assert.equal(db.tables[0].cols[1].note, 'Première ligne.\nDeuxième ligne.');
  assert.ok(db.tables[0].cols[1].nn);
});

test('les relations inline sur colonne portent un marqueur inline, pas les autres', () => {
  const db = parseDBML(`
    Table a { id int [pk] }
    Table b {
      id int [pk]
      a_id int [ref: > a.id]
    }
    Ref: b.id > a.id
  `);
  const inline = db.refs.find(r => r.from.cols[0] === 'a_id');
  const named = db.refs.find(r => r.from.cols[0] === 'id');
  assert.equal(inline.inline, true);
  assert.ok(!named.inline);
});

test('groupement des relations : Ref nommé fusionne par nom, couleur/note, refs tagués', () => {
  const db = parseDBML(`
    Table a { id int [pk] }
    Table b { id int [pk]  a_id int }
    Table c { id int [pk] }
    Ref: a.id > c.id
    Ref commandes [color: #b5651d, note: 'Liens de commande'] {
      b.a_id > a.id
    }
    Ref commandes {
      c.id > b.id
    }
  `);
  assert.equal(db.refGroups.length, 1);
  assert.deepEqual(db.refGroups[0], { name: 'commandes', color: '#b5651d', note: 'Liens de commande', line: 6 });
  const grouped = db.refs.filter(r => r.group === 'commandes');
  assert.equal(grouped.length, 2);
  assert.equal(db.refs.find(r => r.from.resolved === 'a').group, null);
});

test('groupement des relations : bloc Ref anonyme et forme courte restent sans groupe', () => {
  const db = parseDBML(`
    Table a { id int [pk] }
    Table b { id int [pk]  a_id int [ref: > a.id] }
    Ref { a.id > b.a_id }
  `);
  assert.equal(db.refGroups.length, 0);
  assert.ok(db.refs.every(r => r.group == null));
});

test('régions imbriquées : hiérarchie, couleur, note, positions de caractères', () => {
  const db = parseDBML(`
    Table orders { id int [pk] }
    Table returns { id int [pk] }
    TableGroup commandes [color: #b5651d] {
      orders
      Note: 'Parent'
      TableGroup retours [color: #999999] {
        returns
        Note: 'Enfant'
      }
    }
  `);
  assert.equal(db.groups.length, 2);
  const parent = db.groups.find(g => g.name === 'commandes');
  const child = db.groups.find(g => g.name === 'retours');
  assert.equal(parent.parent, null);
  assert.deepEqual(parent.groups, ['retours']);
  assert.equal(parent.note, 'Parent');
  assert.equal(child.parent, 'commandes');
  assert.equal(child.note, 'Enfant');
  assert.equal(parent.tables.map(t => t.resolved).join(), 'orders');
  assert.equal(child.tables.map(t => t.resolved).join(), 'returns');
  // Les offsets du parent englobent entièrement ceux de l'enfant
  assert.ok(parent.s < child.s && child.e < parent.e);
});

test('régions imbriquées : une table dans deux régions est une erreur, y compris via une sous-région', () => {
  assert.throws(() => parseDBML('Table a { id int }\nTableGroup g1 { a }\nTableGroup g2 { a }'), /déjà présente dans la région « g1 »/);
  assert.throws(() => parseDBML('Table a { id int }\nTableGroup g1 { TableGroup sub { a } }\nTableGroup g2 { a }'), /déjà présente dans la région « sub »/);
});

test('régions imbriquées : un nom de région dupliqué est une erreur', () => {
  assert.throws(() => parseDBML('Table a { id int }\nTableGroup g1 { TableGroup g1 { a } }'), /Région « g1 » déclarée deux fois/);
});

test('flattenGroups aplatit une région imbriquée en DBML standard ré-analysable', () => {
  const src = `Table orders { id int [pk] }
Table returns { id int [pk] }
TableGroup commandes [color: #b5651d] {
  orders
  TableGroup retours {
    returns
  }
}`;
  const db = parseDBML(src);
  const flat = flattenGroups(src, db);
  assert.doesNotMatch(flat, /TableGroup retours/);
  const db2 = parseDBML(flat);
  assert.equal(db2.groups.length, 1);
  assert.deepEqual(db2.groups[0].tables.map(t => t.resolved).sort(), ['orders', 'returns']);
});

test('Lanes : colonnes déclarées et affectées aux tables', () => {
  const db = parseDBML(`Lanes {
  sources [width: 300, color: #667a8b]
  dwh [note: 'Entrepôt']
}
Table a [lane: sources, headercolor: #123456] { id int }
Table b [lane: dwh] { id int }
Table c { id int }`);
  assert.deepEqual(db.lanes.map(l => [l.name, l.width, l.color]), [['sources', 300, '#667a8b'], ['dwh', null, null]]);
  assert.deepEqual(db.tables.map(t => t.laneIndex), [0, 1, -1]);
  assert.equal(db.tables[0].color, '#123456');
});

test('Lanes : erreurs (colonne inconnue, doublon, largeur invalide)', () => {
  assert.throws(() => parseDBML('Table a [lane: x] { id int }'), /introuvable/);
  assert.throws(() => parseDBML('Lanes {\n a\n a\n}'), /deux fois/);
  assert.throws(() => parseDBML('Lanes {\n a [width: 5]\n}'), /width/);
});

test('stripMappings retire Lanes et lane: en conservant les autres paramètres', () => {
  const src = `Lanes {\n  s\n}\nTable a [lane: s, headercolor: #123456] { id int }\nTable b [lane: s] { id int }\n`;
  const out = stripMappings(src, parseDBML(src));
  assert.doesNotMatch(out, /Lanes|lane/i);
  assert.match(out, /Table a \[headercolor: #123456\] \{/);
  assert.match(out, /Table b \{/);
  assert.equal(parseDBML(out).tables.length, 2);
});

test('domain : appartenance au domaine fonctionnel, retirée du DBML standard', () => {
  const src = `Table a [domain: out, headercolor: #123456] { id int }
Table b [domain: in] { id int }
Table c { id int }
`;
  const db = parseDBML(src);
  assert.deepEqual(db.tables.map(t => t.domain), ['out', 'in', null]);
  assert.equal(db.hasDomain, true);
  assert.equal(parseDBML('Table a { id int }').hasDomain, false);
  const std = stripMappings(src, db);
  assert.ok(!/domain/.test(std));
  assert.ok(std.includes('headercolor: #123456'));
  assert.throws(() => parseDBML('Table a [domain: peut-etre] { id int }'), /domain/);
});
