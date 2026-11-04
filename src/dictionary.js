// Dictionnaire de données : génère un document HTML autonome ou Markdown à partir du schéma analysé
// (résultat de parseDBML). Sans dépendance au DOM : utilisable dans le navigateur et sous Node.
// Le dictionnaire documente le modèle, pas la vue : tout est inclus, y compris ce qui est masqué dans le canvas.
const DICT_DEFAULT_TITLE = 'Dictionnaire de données';
const DICT_CARD = { '>': 'plusieurs-à-un (n:1)', '<': 'un-à-plusieurs (1:n)', '-': 'un-à-un (1:1)', '<>': 'plusieurs-à-plusieurs (n:n)' };

// Modèle commun aux deux formats : mêmes sections, mêmes valeurs, rendues ensuite en HTML ou en Markdown.
function dictionaryModel(db) {
  const colsTxt = cols => cols.length > 1 ? '(' + cols.join(', ') + ')' : cols[0];
  const endTxt = e => `${e.resolved || e.table}.${colsTxt(e.cols)}`;
  const tables = db.tables.map((t, i) => ({ t, id: 'table-' + i }));
  const idOf = new Map(tables.map(x => [x.t.name, x.id]));
  const owner = new Map(); // table -> région directe
  for (const g of db.groups) for (const m of g.tables) owner.set(m.resolved || m.name, g.name);
  // contrainte « réf. » : portée par le côté enfant (plusieurs) de chaque relation
  const refsOf = new Map();
  const addRef = (tb, col, target) => { const k = tb + '\u0000' + col; (refsOf.get(k) || refsOf.set(k, []).get(k)).push(target); };
  for (const r of db.refs) {
    const sides = r.op === '>' || r.op === '-' ? [[r.from, r.to]] : r.op === '<' ? [[r.to, r.from]] : [[r.from, r.to], [r.to, r.from]];
    for (const [c, p] of sides) c.cols.forEach((col, i) => addRef(c.resolved || c.table, col, `${p.resolved || p.table}.${p.cols[i]}`));
  }
  return {
    project: db.project || null,
    tables: tables.map(({ t, id }) => ({
      id, name: t.name, alias: t.alias, note: t.note, region: owner.get(t.name) || null,
      cols: t.cols.map(c => {
        const cons = [];
        if (c.pk) cons.push('PK');
        if (c.nn) cons.push('NOT NULL');
        if (c.unique) cons.push('UNIQUE');
        if (c.inc) cons.push('INCREMENT');
        if (c.def != null) cons.push('DEFAULT ' + (c.defShow != null ? c.defShow : c.def));
        for (const r of refsOf.get(t.name + '\u0000' + c.name) || []) cons.push('REF → ' + r);
        return { name: c.name, type: c.type, cons, note: c.note };
      }),
      indexes: (t.indexes || []).map(x => ({
        cols: x.cols.length > 1 ? '(' + x.cols.join(', ') + ')' : x.cols[0] || '',
        name: x.name, type: x.type, kind: x.pk ? 'PK' : x.unique ? 'UNIQUE' : '', note: x.note,
      })),
    })),
    enums: db.enums.map(e => ({ name: e.name, values: e.values })),
    relations: db.refs.map(r => ({
      from: endTxt(r.from), to: endTxt(r.to), fromId: idOf.get(r.from.resolved), toId: idOf.get(r.to.resolved),
      card: DICT_CARD[r.op] || r.op, group: r.group || '', onDelete: r.onDelete || '', onUpdate: r.onUpdate || '',
    })),
    regions: db.groups.map(g => ({
      name: g.name, note: g.note, parent: g.parent,
      tables: g.tables.map(m => ({ name: m.resolved || m.name, id: idOf.get(m.resolved || m.name) })),
    })),
    flows: db.mappings.map(m => ({
      name: m.name, note: m.note,
      rows: m.flows.map(f => ({ from: endTxt(f.from), to: endTxt(f.to), transform: f.transform || '', note: f.note || '' })),
    })),
  };
}

function dictionaryDate(d) {
  return new Date(d || Date.now()).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

// opts : { title, date, format: 'html' | 'md' }. Titre : opts.title, sinon nom du Project, sinon titre par défaut.
function buildDictionary(db, opts = {}) {
  const m = dictionaryModel(db);
  const title = (m.project && m.project.name) || opts.title || DICT_DEFAULT_TITLE;
  const date = dictionaryDate(opts.date);
  return opts.format === 'md' ? dictionaryMarkdown(m, title, date) : dictionaryHtml(m, title, date);
}

function dictionaryMarkdown(m, title, date) {
  const cell = s => String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/[|`*]/g, '\\$&').replace(/</g, '&lt;').replace(/\r?\n/g, '<br>').trim();
  const para = s => String(s).replace(/</g, '&lt;').trim();
  const table = (head, rows) => ['| ' + head.join(' | ') + ' |', '|' + head.map(() => ' --- |').join(''), ...rows.map(r => '| ' + r.map(cell).join(' | ') + ' |')].join('\n');
  const link = (label, id) => id ? `[${cell(label)}](#${id})` : cell(label);
  const out = [`# ${cell(title)}`, `*Généré le ${date} par DBML Studio.*`];
  if (m.project && m.project.note) out.push(para(m.project.note));
  if (m.tables.length) out.push('## Sommaire des tables', m.tables.map(t => `- ${link(t.name, t.id)}${t.alias ? ` (alias ${cell(t.alias)})` : ''}`).join('\n'));
  out.push('## Tables');
  for (const t of m.tables) {
    out.push(`### <a id="${t.id}"></a>${cell(t.name)}`);
    const meta = [];
    if (t.alias) meta.push(`**Alias** : ${cell(t.alias)}`);
    if (t.region) meta.push(`**Région** : ${cell(t.region)}`);
    if (meta.length) out.push(meta.join(' · '));
    if (t.note) out.push(para(t.note));
    out.push(t.cols.length ? table(['Champ', 'Type', 'Contraintes', 'Description'], t.cols.map(c => [c.name, c.type, c.cons.join(', '), c.note])) : '*Aucun champ.*');
    if (t.indexes.length) out.push('**Index**', table(['Colonnes', 'Nom', 'Type', 'Unicité', 'Description'], t.indexes.map(x => [x.cols, x.name, x.type, x.kind, x.note])));
  }
  if (m.enums.length) {
    out.push('## Énumérations');
    for (const e of m.enums) out.push(`### ${cell(e.name)}`, table(['Valeur', 'Description'], e.values.map(v => [v.name, v.note])));
  }
  if (m.relations.length) out.push('## Relations', table(['Source', 'Cible', 'Cardinalité', 'Groupe', 'Suppression', 'Mise à jour'], m.relations.map(r => [r.from, r.to, r.card, r.group, r.onDelete, r.onUpdate])));
  if (m.regions.length) {
    out.push('## Régions');
    for (const g of m.regions) {
      out.push(`### ${cell(g.name)}`);
      if (g.parent) out.push(`Sous-région de ${cell(g.parent)}.`);
      if (g.note) out.push(para(g.note));
      out.push(g.tables.length ? g.tables.map(t => `- ${link(t.name, t.id)}`).join('\n') : '*Aucune table.*');
    }
  }
  if (m.flows.length) {
    out.push('## Flux de données');
    for (const f of m.flows) {
      out.push(`### ${cell(f.name)}`);
      if (f.note) out.push(para(f.note));
      out.push(f.rows.length ? table(['Source', 'Cible', 'Transformation', 'Description'], f.rows.map(r => [r.from, r.to, r.transform, r.note])) : '*Aucun flux.*');
    }
  }
  return out.join('\n\n') + '\n';
}

function dictionaryHtml(m, title, date) {
  const e = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const ml = s => e(s).trim().replace(/\r?\n/g, '<br>'); // texte multiligne
  const link = (label, id) => id ? `<a href="#${id}">${e(label)}</a>` : e(label);
  const table = (head, rows) => `<table><thead><tr>${head.map(h => `<th>${e(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const code = s => s ? `<code>${e(s)}</code>` : '';
  const note = s => s ? `<p class="note">${ml(s)}</p>` : '';
  const h = [];
  h.push(`<h1>${e(title)}</h1>`, `<p class="meta">Généré le ${e(date)} par DBML Studio.</p>`);
  if (m.project && m.project.note) h.push(note(m.project.note));
  if (m.tables.length) h.push('<h2>Sommaire des tables</h2>', `<ul class="toc">${m.tables.map(t => `<li>${link(t.name, t.id)}${t.alias ? ` <span class="muted">(alias ${e(t.alias)})</span>` : ''}</li>`).join('')}</ul>`);
  h.push('<h2>Tables</h2>');
  for (const t of m.tables) {
    h.push(`<section class="tbl"><h3 id="${t.id}">${e(t.name)}</h3>`);
    const meta = [];
    if (t.alias) meta.push(`<b>Alias</b> : ${e(t.alias)}`);
    if (t.region) meta.push(`<b>Région</b> : ${e(t.region)}`);
    if (meta.length) h.push(`<p class="meta">${meta.join(' · ')}</p>`);
    h.push(note(t.note));
    h.push(t.cols.length ? table(['Champ', 'Type', 'Contraintes', 'Description'], t.cols.map(c => [`<b>${e(c.name)}</b>`, code(c.type), c.cons.map(x => `<span class="tag">${e(x)}</span>`).join(' '), ml(c.note)])) : '<p class="muted">Aucun champ.</p>');
    if (t.indexes.length) h.push('<h4>Index</h4>', table(['Colonnes', 'Nom', 'Type', 'Unicité', 'Description'], t.indexes.map(x => [code(x.cols), e(x.name), e(x.type), e(x.kind), ml(x.note)])));
    h.push('</section>');
  }
  if (m.enums.length) {
    h.push('<h2>Énumérations</h2>');
    for (const en of m.enums) h.push(`<section><h3>${e(en.name)}</h3>`, table(['Valeur', 'Description'], en.values.map(v => [code(v.name), ml(v.note)])), '</section>');
  }
  if (m.relations.length) h.push('<h2>Relations</h2>', table(['Source', 'Cible', 'Cardinalité', 'Groupe', 'Suppression', 'Mise à jour'], m.relations.map(r => [link(r.from, r.fromId), link(r.to, r.toId), e(r.card), e(r.group), e(r.onDelete), e(r.onUpdate)])));
  if (m.regions.length) {
    h.push('<h2>Régions</h2>');
    for (const g of m.regions) h.push(`<section><h3>${e(g.name)}</h3>`, g.parent ? `<p class="meta">Sous-région de ${e(g.parent)}.</p>` : '', note(g.note), g.tables.length ? `<ul>${g.tables.map(t => `<li>${link(t.name, t.id)}</li>`).join('')}</ul>` : '<p class="muted">Aucune table.</p>', '</section>');
  }
  if (m.flows.length) {
    h.push('<h2>Flux de données</h2>');
    for (const f of m.flows) h.push(`<section><h3>${e(f.name)}</h3>`, note(f.note), f.rows.length ? table(['Source', 'Cible', 'Transformation', 'Description'], f.rows.map(r => [e(r.from), e(r.to), ml(r.transform), ml(r.note)])) : '<p class="muted">Aucun flux.</p>', '</section>');
  }
  const css = 'body{font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;color:#1d2433;max-width:960px;margin:0 auto;padding:24px 16px}'
    + 'h1{font-size:28px;margin:0 0 4px}h2{font-size:21px;margin:36px 0 10px;padding-bottom:4px;border-bottom:2px solid #d5dbe6}h3{font-size:17px;margin:0 0 6px}h4{font-size:14px;margin:14px 0 6px}'
    + 'a{color:#2456a6}.meta,.muted{color:#5b6579}.note{margin:6px 0 10px;padding:6px 10px;border-left:3px solid #c3ccdb;background:#f4f6fa}'
    + 'table{border-collapse:collapse;width:100%;margin:8px 0 4px;font-size:14px}th,td{border:1px solid #d5dbe6;padding:5px 8px;text-align:left;vertical-align:top}th{background:#eef1f7}'
    + 'code{font:13px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}.tag{display:inline-block;padding:0 6px;border-radius:4px;background:#e8edf6;font-size:12px;white-space:nowrap}'
    + '.tbl,section{margin:0 0 22px;break-inside:avoid-page}.toc{columns:2}'
    + '@media print{body{max-width:none;padding:0;font-size:12px}a{color:inherit;text-decoration:none}h2{break-after:avoid}tr{break-inside:avoid}}';
  return `<!doctype html>\n<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(title)}</title><style>${css}</style></head><body>\n${h.filter(Boolean).join('\n')}\n</body></html>\n`;
}

if (typeof module !== 'undefined') module.exports = { buildDictionary, dictionaryModel };
