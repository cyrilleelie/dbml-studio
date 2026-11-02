// Robustness audit of the DBML parser against the official DBML syntax.
// Each case types DBML in the editor, checks #status, and inspects the parsed model via parseDBML.
const { test, expect } = require('@playwright/test');

let errors;
test.beforeEach(async ({ page, baseURL }) => {
  errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.route(/^https?:/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.goto(baseURL);
  await expect(page.locator('#status')).toHaveClass(/ok/);
});
test.afterEach(() => { expect(errors).toEqual([]); });

// Type the source in the editor, force the (debounced) parse, return status + parsed model summary.
async function run(page, src) {
  // blank the status so we can wait for the debounced parse to rewrite it
  await page.evaluate(() => { document.getElementById('status').textContent = ''; });
  await page.locator('#src').fill(src);
  await expect(page.locator('#status')).not.toHaveText('');
  return page.evaluate(() => {
    const st = document.getElementById('status');
    const out = { ok: st.classList.contains('ok'), text: st.textContent, db: null };
    try {
      const d = parseDBML(document.getElementById('src').value);
      out.db = {
        tables: d.tables.map(t => ({
          name: t.name, alias: t.alias, note: t.note, color: t.color,
          cols: t.cols.map(c => ({ name: c.name, type: c.type, pk: c.pk, nn: c.nn, unique: c.unique, inc: c.inc, def: c.def, note: c.note })),
        })),
        refs: d.refs.map(r => ({ from: r.from.table + '.' + r.from.cols.join(','), op: r.op, to: r.to.table + '.' + r.to.cols.join(','), onDelete: r.onDelete, onUpdate: r.onUpdate })),
        enums: d.enums.map(e => ({ name: e.name, values: e.values.map(v => [v.name, v.note]) })),
        groups: d.groups.map(g => ({ name: g.name, tables: g.tables.map(m => m.name) })),
      };
    } catch (e) { out.thrown = e.message; }
    return out;
  });
}
const okCase = async (page, src) => { const r = await run(page, src); expect(r.text).toBe('Syntaxe valide'); expect(r.ok).toBe(true); return r.db; };
const errCase = async (page, src, line, re) => {
  const r = await run(page, src);
  expect(r.ok).toBe(false);
  expect(r.text).toMatch(new RegExp(`^Ligne ${line} : `));
  if (re) expect(r.text).toMatch(re);
  expect(r.text).not.toMatch(/Erreur interne/);
};
const col = (db, t, c) => db.tables.find(x => x.name === t).cols.find(x => x.name === c);

test('empty file is valid and yields nothing', async ({ page }) => {
  const db = await okCase(page, '');
  expect(db.tables).toEqual([]);
});

test('Project block is accepted and ignored', async ({ page }) => {
  const db = await okCase(page, `Project shop {\n  database_type: 'PostgreSQL'\n  Note: 'x'\n}\nTable a { id int }`);
  expect(db.tables.map(t => t.name)).toEqual(['a']);
});

test('table alias, schema.table, quoted names', async ({ page }) => {
  const db = await okCase(page, `Table public.users as U {\n  "user id" int [pk]\n}\nTable "my table" {\n  id int\n}\nRef: "my table".id > U."user id"`);
  expect(db.tables[0]).toMatchObject({ name: 'public.users', alias: 'U' });
  expect(db.tables[1].name).toBe('my table');
  expect(db.refs[0]).toMatchObject({ from: 'my table.id', to: 'U.user id' });
});

test('column settings: pk, increment, not null, null, unique', async ({ page }) => {
  const db = await okCase(page, `Table t {\n  a int [pk, increment]\n  b varchar [not null, unique]\n  c int [null]\n  d int [primary key]\n}`);
  expect(col(db, 't', 'a')).toMatchObject({ pk: true, inc: true });
  expect(col(db, 't', 'b')).toMatchObject({ nn: true, unique: true });
  expect(col(db, 't', 'c').nn).toBe(false);
  expect(col(db, 't', 'd').pk).toBe(true);
});

test('column default: number, string, expression, true/false/null', async ({ page }) => {
  const db = await okCase(page, "Table t {\n  a int [default: 123]\n  b varchar [default: 'x y']\n  c timestamp [default: `now()`]\n  d bool [default: true]\n  e bool [default: false]\n  f int [default: null]\n  g decimal [default: -1.5]\n}");
  expect(col(db, 't', 'a').def).toBe('123');
  expect(col(db, 't', 'b').def).toBe("'x y'");
  expect(col(db, 't', 'c').def).toBe('now()');
  expect(col(db, 't', 'd').def).toBe('true');
  expect(col(db, 't', 'e').def).toBe('false');
  expect(col(db, 't', 'f').def).toBe('null');
  expect(col(db, 't', 'g').def).toBe('-1.5');
});

test('column note and inline refs (> < - <>)', async ({ page }) => {
  const db = await okCase(page, "Table a {\n  id int [pk]\n  x int [ref: > b.id, note: 'hi']\n  y int [ref: < b.id]\n  z int [ref: - b.id]\n  w int [ref: <> b.id]\n}\nTable b { id int }");
  expect(col(db, 'a', 'x').note).toBe('hi');
  expect(db.refs.map(r => r.op)).toEqual(['>', '<', '-', '<>']);
});

test('types with arguments and arrays', async ({ page }) => {
  const db = await okCase(page, 'Table t {\n  a varchar(255)\n  b decimal(10,2)\n  c int[]\n  d "double precision"\n  e varchar(10)[] [not null]\n  f int[3]\n}');
  expect(col(db, 't', 'a').type).toBe('varchar(255)');
  expect(col(db, 't', 'b').type).toBe('decimal(10,2)');
  expect(col(db, 't', 'c').type).toBe('int[]');
  expect(col(db, 't', 'f').type).toBe('int[3]');
  expect(col(db, 't', 'd').type).toBe('double precision');
  expect(col(db, 't', 'e')).toMatchObject({ type: 'varchar(10)[]', nn: true });
});

test('indexes: composite, expression, settings', async ({ page }) => {
  const db = await okCase(page, "Table t {\n  a int\n  b int\n  Indexes {\n    (a, b) [pk]\n    `lower(b)` [name: 'idx_lower', type: hash, note: 'n']\n    a [unique, type: btree]\n    (a, `b*2`) [unique]\n  }\n}");
  expect(col(db, 't', 'a').unique).toBe(true);
});

test('short Ref with settings and long Ref block', async ({ page }) => {
  const db = await okCase(page, "Table a { id int\n x int }\nTable b { id int }\nRef: a.x > b.id [delete: cascade, update: set null]\nRef r2 {\n  a.id - b.id [delete: restrict]\n}");
  expect(db.refs[0]).toMatchObject({ onDelete: 'cascade', onUpdate: 'set null' });
  expect(db.refs[1]).toMatchObject({ op: '-', onDelete: 'restrict' });
});

test('composite refs (a,b) > t.(c,d)', async ({ page }) => {
  const db = await okCase(page, 'Table a { x int\n y int }\nTable b { c int\n d int }\nRef: a.(x, y) > b.(c, d)');
  expect(db.refs[0]).toMatchObject({ from: 'a.x,y', to: 'b.c,d' });
});

test('composite ref with mismatched column counts is a localised error', async ({ page }) => {
  const r = await run(page, 'Table a { x int\n y int }\nTable b { c int\n d int }\nRef: a.(x, y) > b.(c)');
  expect(r.ok).toBe(false);
  expect(r.text).toMatch(/^Ligne 5 : /);
});

test('Enum with quoted values and notes', async ({ page }) => {
  const db = await okCase(page, "Enum job_status {\n  created [note: 'Waiting']\n  \"running now\"\n  done\n}");
  expect(db.enums[0].values).toEqual([['created', 'Waiting'], ['running now', null], ['done', null]]);
});

test('table notes: inline and block, multi-line and escapes', async ({ page }) => {
  const db = await okCase(page, "Table a {\n  id int\n  Note: 'it\\'s fine'\n}\nTable b {\n  id int\n  Note {\n    '''\n    line1\n    line2\n    '''\n  }\n}\nTable c { id int [note: '''x\n y''']\n}");
  expect(db.tables[0].note).toBe("it's fine");
  expect(db.tables[1].note).toBe('line1\nline2');
});

test('top-level Note and Note with name', async ({ page }) => {
  await okCase(page, "Note my_note {\n  'hello'\n}\nTable a { id int }");
});

test('comments // and /* */ everywhere', async ({ page }) => {
  const db = await okCase(page, "// head\nTable a { // trailing\n  id int /* inline */ [pk] // c\n  /* multi\n  line */\n  x int\n}\n/* end */");
  expect(db.tables[0].cols).toHaveLength(2);
});

test('TableGroup and table settings headercolor + note', async ({ page }) => {
  const db = await okCase(page, "Table a [headercolor: #3498DB, note: 'tbl'] {\n  id int\n}\nTable b { id int }\nTableGroup g1 [color: #e74c3c] {\n  a\n  b\n}");
  expect(db.tables[0]).toMatchObject({ color: '#3498DB', note: 'tbl' });
  expect(db.groups[0]).toMatchObject({ name: 'g1', tables: ['a', 'b'] });
});

test('TablePartial and ~partial injection', async ({ page }) => {
  const db = await okCase(page, "TablePartial timestamps {\n  created_at timestamp [default: `now()`]\n}\nTable a {\n  id int [pk]\n  ~timestamps\n}");
  expect(db.tables[0].cols.map(c => c.name)).toEqual(['id', 'created_at']);
});

test('TablePartial injection with several partials and a trailing column', async ({ page }) => {
  const db = await okCase(page, "TablePartial p1 {\n  a int\n}\nTablePartial p2 {\n  b int\n}\nTable t {\n  ~p1\n  ~p2\n  z int\n}");
  expect(db.tables[0].cols.map(c => c.name)).toEqual(['a', 'b', 'z']);
});

test('keywords in mixed case', async ({ page }) => {
  const db = await okCase(page, 'TABLE a {\n  id int [PK, Not Null]\n}\ntable b { id int }\nREF: a.id > b.id\nENUM e { v }\nTableGroup g { a }');
  expect(db.tables).toHaveLength(2);
  expect(col(db, 'a', 'id')).toMatchObject({ pk: true, nn: true });
});

test('Windows CRLF line endings', async ({ page }) => {
  const db = await okCase(page, "Table a {\r\n  id int [pk]\r\n  n text [note: '''a\r\nb''']\r\n  Note: 'x'\r\n}\r\nRef: a.id > a.id\r\n");
  expect(db.tables[0].cols).toHaveLength(2);
  expect(col(db, 'a', 'n').note).toBe('a\nb');
});

test('CRLF: error reports the right line', async ({ page }) => {
  await errCase(page, 'Table a {\r\n  id int\r\n}\r\nRef: a.id > zz.id\r\n', 4, /zz/);
});

test('UTF-8 BOM at file start', async ({ page }) => {
  const db = await okCase(page, '﻿Table a {\n  id int\n}');
  expect(db.tables[0].name).toBe('a');
});

test('accents in names, notes and enum values', async ({ page }) => {
  const db = await okCase(page, "Table clients_é {\n  prénom varchar [note: 'Prénom — déjà utilisé']\n}\nEnum état { créé\n archivé }");
  expect(col(db, 'clients_é', 'prénom').note).toBe('Prénom — déjà utilisé');
  expect(db.enums[0].values.map(v => v[0])).toEqual(['créé', 'archivé']);
});

test('trailing commas in settings do not crash', async ({ page }) => {
  const r = await run(page, 'Table t {\n  a int [pk,]\n}');
  expect(r.text).not.toMatch(/Erreur interne/);
  expect(r.text).toMatch(/^(Syntaxe valide|Ligne 2 : )/);
});

test('unknown reference table gives a localised error', async ({ page }) => {
  await errCase(page, 'Table a { id int }\n\nRef: a.id > nope.id', 3, /nope/);
});

test('unknown reference column gives a localised error', async ({ page }) => {
  await errCase(page, 'Table a { id int }\nTable b { id int }\nRef: a.zz > b.id', 3, /zz/);
});

test('inline ref to unknown table gives a localised error', async ({ page }) => {
  await errCase(page, 'Table a {\n  x int [ref: > ghost.id]\n}', 2, /ghost/);
});

test('duplicate table is reported with its line', async ({ page }) => {
  await errCase(page, 'Table a { id int }\n\nTable a { id int }', 3, /déjà utilisé/);
});

test('duplicate column is reported', async ({ page }) => {
  await errCase(page, 'Table a {\n  id int\n  id int\n}', 3);
});

test('unclosed table / string / comment give localised errors', async ({ page }) => {
  await errCase(page, 'Table a {\n  id int\n', 1, /accolade/);
  await errCase(page, "Table a {\n  id int [note: 'oops]\n}", 2);
  await errCase(page, 'Table a { id int }\n/* oops', 2);
});

test('garbage input never crashes', async ({ page }) => {
  for (const s of ['}', '{{{', 'Table', 'Table a', 'Ref:', 'Ref: a.b >', 'Enum', 'Table a { id }', '@@@', 'Table a { id int [', 'Table a { id int } }']) {
    const r = await run(page, s);
    expect(r.ok, s).toBe(false);
    expect(r.text, s).toMatch(/^Ligne \d+ : /);
    expect(r.text, s).not.toMatch(/Erreur interne/);
  }
});

test('~partial: own column wins over the injected one; unknown partial is a localised error', async ({ page }) => {
  const db = await okCase(page, "TablePartial p {\n  id bigint\n  at timestamp\n}\nTable t {\n  id int [pk]\n  ~p\n}");
  expect(db.tables.map(t => t.name)).toEqual(['t']);
  expect(db.tables[0].cols.map(c => [c.name, c.type])).toEqual([['id', 'int'], ['at', 'timestamp']]);
  await errCase(page, 'Table t {\n  id int\n  ~nope\n}', 3, /nope/);
});
