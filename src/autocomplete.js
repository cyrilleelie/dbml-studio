// ---------- Autocomplétion DBML ----------
// Logique pure : à partir du texte, de la position du curseur et du dernier modèle valide (db),
// détermine le contexte et renvoie les suggestions. Aucune dépendance au DOM, testable sous Node.
//
// Syntaxe des insertions (façon snippets) : ${1:texte} champ à remplir, $1 champ vide, $0 position finale.

const AC_BASE_TYPES = [
  ['integer', 'integer', 'Entier 32 bits'],
  ['bigint', 'bigint', 'Entier 64 bits'],
  ['smallint', 'smallint', 'Entier 16 bits'],
  ['decimal(p,s)', 'decimal(${1:10},${2:2})', 'Décimal exact : p chiffres dont s après la virgule'],
  ['numeric', 'numeric', 'Décimal exact sans précision fixée'],
  ['real', 'real', 'Flottant simple précision'],
  ['boolean', 'boolean', 'Vrai / faux'],
  ['varchar(n)', 'varchar(${1:255})', 'Texte de longueur maximale n'],
  ['char(n)', 'char(${1:1})', 'Texte de longueur fixe n'],
  ['text', 'text', 'Texte sans limite de longueur'],
  ['date', 'date', 'Date sans heure'],
  ['time', 'time', 'Heure sans date'],
  ['timestamp', 'timestamp', 'Date et heure'],
  ['timestamptz', 'timestamptz', 'Date et heure avec fuseau'],
  ['uuid', 'uuid', 'Identifiant unique universel'],
  ['json', 'json', 'Document JSON (texte)'],
  ['jsonb', 'jsonb', 'Document JSON (binaire, indexable)'],
  ['bytea', 'bytea', 'Données binaires'],
  ['serial', 'serial', 'Entier auto-incrémenté (PostgreSQL)'],
  ['bigserial', 'bigserial', 'Grand entier auto-incrémenté (PostgreSQL)'],
];

const AC_SNIPPETS_TOP = [
  ['Table', 'Table ${1:nom} {\n  ${2:id} ${3:integer} [pk]\n  $0\n}', 'Nouvelle table'],
  ['Enum', 'Enum ${1:nom} {\n  ${2:valeur}\n}', 'Liste de valeurs autorisées'],
  ['Ref', 'Ref: ${1:table.colonne} > ${2:table.colonne}', 'Relation sur une ligne'],
  ['Ref { }', 'Ref ${1:nom} [color: ${2:#3b6ea8}] {\n  $0\n}', 'Bloc regroupant plusieurs relations, filtrable dans le panneau Affichage'],
  ['TableGroup', 'TableGroup ${1:nom} [color: ${2:#3b6ea8}] {\n  $0\n}', 'Région regroupant des tables'],
  ['Mapping', 'Mapping ${1:nom} [color: ${2:#7a4fb5}] {\n  $0\n}', 'Flux de données (extension DBML Studio)'],
  ['Lanes', 'Lanes {\n  ${1:sources}\n  ${2:staging} [color: ${3:#3b6ea8}]\n  $0\n}', 'Colonnes verticales orientant le placement des tables (extension DBML Studio)'],
  ['Project', "Project ${1:nom} {\n  database_type: '${2:PostgreSQL}'\n  Note: '$0'\n}", 'Informations sur le projet'],
  ['Note', "Note ${1:nom} {\n  '''\n  $0\n  '''\n}", 'Note libre'],
];
const AC_SNIPPETS_TABLE = [
  ['Note', "Note: '$0'", 'Description de la table'],
  ['indexes', 'indexes {\n  ${1:(colonne_a, colonne_b)} [${2:pk}]\n}', 'Index et clés composites'],
];

const AC_SETTINGS = {
  column: [
    ['pk', 'pk', 'Clé primaire'],
    ['not null', 'not null', 'Valeur obligatoire'],
    ['unique', 'unique', 'Valeur unique dans la table'],
    ['increment', 'increment', 'Auto-incrément'],
    ['default', 'default: $0', "Valeur par défaut : 'texte', nombre ou `expression()`"],
    ['note', "note: '$0'", 'Description du champ, affichée en infobulle'],
    ['ref', 'ref: $0', 'Relation vers une autre colonne', true],
    ['null', 'null', 'Valeur facultative (comportement par défaut)'],
  ],
  table: [
    ['headercolor', 'headercolor: ${1:#2f7d5b}', "Couleur de l'en-tête de la table"],
    ['lane', 'lane: $0', 'Colonne verticale de la table, déclarée dans Lanes { } (extension DBML Studio)', true],
    ['domain', 'domain: $0', 'Appartenance au domaine fonctionnel : in (dans le domaine) ou out (hors domaine, relié) — vue conceptuelle (extension DBML Studio)', true],
    ['note', "note: '$0'", 'Description de la table'],
  ],
  ref: [
    ['delete', 'delete: $0', 'Action à la suppression de la ligne référencée', true],
    ['update', 'update: $0', 'Action à la modification de la clé référencée', true],
  ],
  mapline: [
    ['transform', "transform: '$0'", 'Règle de transformation appliquée au flux'],
    ['note', "note: '$0'", 'Commentaire sur le flux'],
  ],
  header: [
    ['color', 'color: ${1:#3b6ea8}', 'Couleur de la région ou du mapping'],
    ['note', "note: '$0'", 'Description'],
  ],
  lane: [
    ['width', 'width: ${1:420}', 'Largeur de la colonne en pixels (120 à 2000)'],
    ['color', 'color: ${1:#3b6ea8}', 'Teinte de la colonne'],
    ['note', "note: '$0'", 'Description, affichée en infobulle'],
  ],
  enumval: [['note', "note: '$0'", 'Description de la valeur']],
  index: [
    ['pk', 'pk', 'Clé primaire composite'],
    ['unique', 'unique', 'Index unique'],
    ['name', "name: '$0'", "Nom de l'index"],
    ['note', "note: '$0'", "Description de l'index"],
  ],
};
const AC_ACTIONS = [
  ['cascade', 'Propage la suppression ou la modification'],
  ['set null', 'Met la clé étrangère à NULL'],
  ['restrict', "Interdit l'opération"],
  ['no action', "Interdit l'opération (vérification différée)"],
  ['set default', 'Remet la valeur par défaut'],
];
const AC_REF_OPS = [
  ['>', 'plusieurs-à-un'],
  ['<', 'un-à-plusieurs'],
  ['-', 'un-à-un'],
  ['<>', 'plusieurs-à-plusieurs'],
];

// Parcourt le texte jusqu'au curseur : blocs ouverts (avec leur en-tête et leur position
// d'ouverture), chaîne ou commentaire en cours
function acScan(text, caret) {
  const stack = [];
  let i = 0, lineStart = 0, str = null, block = false;
  while (i < caret) {
    const c = text[i];
    if (block) { if (c === '*' && text[i + 1] === '/') { block = false; i += 2; continue; } i++; continue; }
    if (str) {
      if (str === "'''") { if (text.startsWith("'''", i)) { str = null; i += 3; continue; } i++; continue; }
      if (c === '\\') { i += 2; continue; }
      if (c === str || (c === '\n' && str !== '`')) str = null;
      if (c === '\n') lineStart = i + 1;
      i++; continue;
    }
    if (c === '/' && text[i + 1] === '/') {
      const nl = text.indexOf('\n', i);
      if (nl === -1 || nl >= caret) return { stack, inText: true };
      i = nl; continue;
    }
    if (c === '/' && text[i + 1] === '*') { block = true; i += 2; continue; }
    if (text.startsWith("'''", i)) { str = "'''"; i += 3; continue; }
    if (c === "'" || c === '"' || c === '`') { str = c; i++; continue; }
    if (c === '\n') lineStart = i + 1;
    else if (c === '{') {
      const header = text.slice(lineStart, i).trim();
      stack.push({ kw: ((header.match(/^[A-Za-z]+/) || [''])[0]).toLowerCase(), header, start: i + 1 });
    } else if (c === '}') stack.pop();
    i++;
  }
  return { stack, inText: !!str || block };
}

// Correspondance approximative : préfixe > début de mot > sous-séquence
function acFuzzy(query, target) {
  if (!query) return { score: 0, idx: [] };
  const q = query.toLowerCase(), t = target.toLowerCase();
  if (t.startsWith(q)) return { score: 1000 - t.length * 0.2, idx: [...Array(q.length).keys()] };
  const sub = t.indexOf(q);
  if (sub > 0) return { score: 600 - t.length - sub, idx: [...Array(q.length).keys()].map(k => k + sub) };
  let ti = 0, prev = -2, score = 0;
  const idx = [];
  for (const ch of q) {
    const f = t.indexOf(ch, ti);
    if (f < 0) return null;
    const boundary = f === 0 || /[._\s(]/.test(t[f - 1]);
    score += boundary ? 30 : f === prev + 1 ? 15 : 1;
    idx.push(f); prev = f; ti = f + 1;
  }
  return { score: score - t.length * 0.5, idx };
}

function acTableItems(db, opts = {}) {
  if (!db) return [];
  const grouped = new Map();
  for (const g of db.groups || []) for (const m of g.tables) grouped.set(m.resolved, g.name);
  const items = [];
  for (const t of db.tables) {
    if (opts.exclude && opts.exclude.has(t.name.toLowerCase())) continue;
    const g = grouped.get(t.name);
    items.push({
      label: t.name, kind: 'table', insert: opts.dot ? t.name + '.' : t.name, retrigger: !!opts.dot,
      detail: `${t.cols.length} champ${t.cols.length > 1 ? 's' : ''}`,
      doc: [t.note, t.alias && `Alias : ${t.alias}`, opts.groups && (g ? `Dans la région « ${g} »` : 'Hors région')].filter(Boolean).join('\n'),
      boost: opts.groups && !g ? 50 : 0,
    });
    if (t.alias && opts.dot) items.push({ label: t.alias, kind: 'alias', insert: t.alias + '.', retrigger: true, detail: 'alias de ' + t.name, doc: t.note || '' });
  }
  return items;
}
// covered : Set optionnel de « table.colonne » déjà alimentées par un mapping — sert à faire
// remonter en premier les colonnes cibles pas encore couvertes (voir acCoverage)
function acColumnItems(tb, covered) {
  return tb.cols.map(c => {
    const key = tb.name + '.' + c.name;
    const isCovered = covered ? covered.has(key) : null;
    const doc = [c.note, [c.pk && 'clé primaire', c.nn && 'non nul', c.unique && 'unique', c.defShow && 'défaut : ' + c.defShow].filter(Boolean).join(', ')];
    if (isCovered === true) doc.push('Déjà alimentée par ce mapping');
    else if (isCovered === false) doc.push('Pas encore alimentée dans ce mapping');
    return {
      label: c.name, kind: 'column', insert: c.name,
      detail: c.type + (c.pk ? ' · PK' : ''),
      doc: doc.filter(Boolean).join('\n'),
      boost: isCovered === false ? 25 : isCovered === true ? -25 : 0,
    };
  });
}

// Suggestions pour un point de relation en cours de saisie (table, table.colonne, table.(a, b))
// opts.allowStar : autorise « table.* » (mapping). opts.covered : voir acColumnItems.
function acEndpoint(partial, db, opts = {}) {
  if (!db) return null;
  const { allowStar, covered } = opts;
  let m = partial.match(/^(.*)\.\(([^)]*)$/);
  if (m) {
    const tb = db.findTable(m[1]); if (!tb) return null;
    const typed = m[2].split(',').map(s => s.trim()); const cur = typed.pop();
    return { offset: partial.length - cur.length, filter: cur, items: acColumnItems(tb, covered).filter(c => !typed.includes(c.label)) };
  }
  const dot = partial.lastIndexOf('.');
  if (dot > 0) {
    const tb = db.findTable(partial.slice(0, dot));
    if (tb) {
      const items = acColumnItems(tb, covered);
      if (allowStar) items.unshift({ label: '*', kind: 'column', insert: '*', detail: 'toute la table', doc: 'Flux au niveau de la table : chaque colonne suit celle de même nom.' });
      return { offset: dot + 1, filter: partial.slice(dot + 1), items };
    }
  }
  const items = acTableItems(db, { dot: true });
  // Au-delà d'un point, on propose aussi directement « table.colonne » (utile avec les schémas : « mart.prod… »)
  if (partial.includes('.')) for (const t of db.tables) for (const c of acColumnItems(t)) {
    items.push({ ...c, label: `${t.name}.${c.label}`, insert: `${t.name}.${c.label}`, boost: -5 });
  }
  return { offset: 0, filter: partial, items };
}

// Ligne de relation : « a.b > c.d », avec suggestion d'opérateur entre les deux.
// covered : ne s'applique qu'au membre de droite (la cible), voir acCoverage.
function acRelationLine(rest, db, mapping, covered) {
  const ops = mapping ? [['>', 'flux de la source vers la cible']] : AC_REF_OPS;
  let m = rest.match(/^(.+?)\s*(<>|->|>|<|-)\s*(\S*)$/);
  if (m && !/\.\([^)]*$/.test(m[1] + m[2])) {
    const r = acEndpoint(m[3], db, { allowStar: mapping, covered: mapping ? covered : null });
    return r && { start: rest.length - m[3].length + r.offset, filter: r.filter, items: r.items, empty: true };
  }
  if (/^\S+\s+$/.test(rest)) {
    return {
      start: rest.length, filter: '', empty: true,
      items: ops.map(([op, d]) => ({ label: op, kind: 'operator', insert: op + ' ', detail: d, retrigger: true })),
    };
  }
  if (/^\S*$/.test(rest) || /^\S*\.\([^)]*$/.test(rest)) {
    const r = acEndpoint(rest, db, { allowStar: mapping });
    return r && { start: r.offset, filter: r.filter, items: r.items, empty: true };
  }
  return null;
}

// Colonnes cibles déjà alimentées par le mapping dont l'en-tête de bloc est `header`
// (ex. « Mapping calcul_indicateurs [...] »). Renvoie null si le mapping n'est pas identifiable
// (nom non trouvé dans le dernier modèle valide) : dans ce cas, pas de mise en avant.
function acCoverage(db, header) {
  if (!db || !header) return null;
  const m = /^mapping\s+([\w.]+)/i.exec(header.trim());
  if (!m) return null;
  const mp = (db.mappings || []).find(x => x.name === m[1]);
  if (!mp) return null;
  const set = new Set();
  for (const f of mp.flows) {
    if (f.to.cols.includes('*')) { const tb = db.findTable(f.to.resolved); if (tb) tb.cols.forEach(c => set.add(f.to.resolved + '.' + c.name)); continue; }
    for (const c of f.to.cols) set.add(f.to.resolved + '.' + c);
  }
  return set;
}

// Développe « source.* > cible.* » en une ligne par colonne de même nom présente des deux côtés
function acExpandByName(srcName, tgtName, db) {
  const src = db.findTable(srcName), tgt = db.findTable(tgtName);
  if (!src || !tgt) return null;
  const tgtNames = new Set(tgt.cols.map(c => c.name));
  const common = src.cols.filter(c => tgtNames.has(c.name)).map(c => c.name);
  return { common, text: common.map(n => `${src.name}.${n} > ${tgt.name}.${n}`).join('\n') };
}

// Devine une clé étrangère à partir du nom d'une colonne (convention table_id / id_table) :
// renvoie la table et sa clé primaire (simple) si la correspondance est unique et sans ambiguïté.
function acGuessFK(colName, db) {
  if (!db) return null;
  let m = /^(.+)_id$/i.exec(colName) || /^id_(.+)$/i.exec(colName);
  if (!m) return null;
  const base = m[1].toLowerCase();
  const variants = new Set([base, base + 's', base.replace(/s$/, '')]);
  const hits = db.tables.filter(t => {
    const last = t.name.split('.').pop().toLowerCase();
    return variants.has(last) || (t.alias && variants.has(t.alias.toLowerCase()));
  });
  if (hits.length !== 1) return null;
  const pks = hits[0].cols.filter(c => c.pk);
  if (pks.length !== 1) return null;
  return { table: hits[0], pk: pks[0] };
}

// Nom et type de la colonne décrite par la ligne en cours, à partir du texte qui précède
// le crochet ouvrant (ex. « amount decimal(10,2) » → { name: 'amount', type: 'decimal(10,2)' })
function acLineColumn(headPart) {
  const m = headPart.match(/^\s*("[^"]+"|[\w]+)\s+([^\s]+)\s*$/);
  if (!m) return null;
  return { name: m[1].replace(/^"|"$/g, ''), type: m[2] };
}

// Point d'entrée : renvoie { from, items } ou null
function getCompletions(text, caret, db, explicit) {
  const scan = acScan(text, caret);
  if (scan.inText) return null;
  const lineStart = text.lastIndexOf('\n', caret - 1) + 1;
  const pre = text.slice(lineStart, caret);
  const topFrame = scan.stack.length ? scan.stack[scan.stack.length - 1] : null;
  const block = topFrame ? topFrame.kw : 'top';
  let res = null;

  // 1. Entre crochets : paramètres, ou relation en ligne après « ref: > »
  let depth = 0, segStart = -1, q = null, firstBracket = -1;
  for (let i = 0; i < pre.length; i++) {
    const c = pre[i];
    if (q) { if (c === q) q = null; continue; }
    if (c === "'" || c === '"' || c === '`') q = c;
    else if (c === '[') { if (depth === 0) firstBracket = i; depth++; segStart = i + 1; }
    else if (c === ']') depth = Math.max(0, depth - 1);
    else if (c === ',' && depth > 0) segStart = i + 1;
  }
  if (depth > 0) {
    const seg = pre.slice(segStart);
    const lead = seg.match(/^\s*/)[0].length;
    const colInfo = firstBracket >= 0 ? acLineColumn(pre.slice(0, firstBracket)) : null;
    let m;
    if ((m = seg.match(/^\s*ref\s*:\s*(<>|<|>|-)\s*(\S*)$/i))) {
      const r = acEndpoint(m[2], db, {});
      if (r) res = { from: caret - m[2].length + r.offset, filter: r.filter, items: r.items, empty: true };
    } else if ((m = seg.match(/^\s*ref\s*:\s*$/i))) {
      res = { from: caret, filter: '', empty: true, items: AC_REF_OPS.map(([op, d]) => ({ label: op, kind: 'operator', insert: op + ' ', detail: d, retrigger: true })) };
    } else if ((m = seg.match(/^\s*(delete|update)\s*:\s*([a-z ]*)$/i))) {
      res = { from: caret - m[2].length, filter: m[2], empty: true, items: AC_ACTIONS.map(([a, d]) => ({ label: a, kind: 'value', insert: a, detail: d })) };
    } else if (db && db.lanes && db.lanes.length && /^table\b/.test(pre.trimStart().toLowerCase()) && (m = seg.match(/^\s*lane\s*:\s*(\S*)$/i))) {
      res = {
        from: caret - m[1].length, filter: m[1], empty: true,
        items: db.lanes.map(l => ({ label: l.name, kind: 'value', insert: l.name, detail: 'colonne', doc: l.note || '' })),
      };
    } else if (/^table\b/.test(pre.trimStart().toLowerCase()) && (m = seg.match(/^\s*domain\s*:\s*(\S*)$/i))) {
      res = { from: caret - m[1].length, filter: m[1], empty: true, items: [['in', 'dans le domaine fonctionnel'], ['out', 'hors domaine, mais relié']].map(([v, d]) => ({ label: v, kind: 'value', insert: v, detail: d })) };
    } else if (block === 'table' && (m = seg.match(/^\s*default\s*:\s*(\S*)$/i)) && colInfo && db) {
      const en = db.enums.find(e => e.name === colInfo.type || e.name === colInfo.type.replace(/"/g, ''));
      if (en) res = {
        from: caret - m[1].length, filter: m[1], empty: true,
        items: en.values.map(v => ({ label: `'${v.name}'`, kind: 'value', insert: `'${v.name}'`, detail: 'valeur enum', doc: v.note || '' })),
      };
    } else if (!seg.includes(':')) {
      const trimmedLine = pre.trimStart().toLowerCase();
      let owner = null;
      if (block === 'top') owner = /^table\b/.test(trimmedLine) ? 'table' : /^ref\s*:/.test(trimmedLine) ? 'ref' : /^(ref|mapping|tablegroup)\b/.test(trimmedLine) ? 'header' : null;
      else if (block === 'table') owner = 'column';
      else owner = { indexes: 'index', ref: 'ref', mapping: 'mapline', enum: 'enumval', lanes: 'lane' }[block] || null;
      if (owner) {
        // paramètres déjà saisis dans les crochets, hors segment en cours de frappe
        const done = pre.slice(pre.lastIndexOf('[') + 1).split(','); done.pop();
        const present = new Set(done.map(s => s.split(':')[0].trim().toLowerCase()));
        const items = AC_SETTINGS[owner]
          .filter(([k]) => !present.has(k) && !(k === 'null' && present.has('not null')) && !(k === 'not null' && present.has('null')))
          .map(([label, insert, doc, retrigger]) => ({ label, kind: 'setting', insert, doc, retrigger: !!retrigger }));
        // Clé étrangère déduite du nom de la colonne (convention table_id / id_table)
        if (owner === 'column' && !present.has('ref') && colInfo) {
          const fk = acGuessFK(colInfo.name, db);
          if (fk) items.unshift({
            label: `ref: > ${fk.table.name}.${fk.pk.name}`, kind: 'setting', insert: `ref: > ${fk.table.name}.${fk.pk.name}`,
            detail: 'déduit du nom', doc: `Relation détectée depuis le nom de la colonne « ${colInfo.name} ».`, boost: 200,
          });
        }
        res = { from: segStart + lead + lineStart, filter: seg.slice(lead), items, empty: true };
      }
    }
  }
  // 2. Lignes de relation et de mapping
  else if (block === 'top' && /^\s*ref\b[^:{\[]*:/i.test(pre)) {
    const colon = pre.indexOf(':');
    const rest = pre.slice(colon + 1).replace(/^\s+/, '');
    const r = acRelationLine(rest, db, false);
    if (r) res = { from: caret - rest.length + r.start, filter: r.filter, items: r.items, empty: r.empty };
  }
  else if (block === 'ref' || block === 'mapping') {
    const rest = pre.replace(/^\s+/, '');
    const isMapping = block === 'mapping';
    // Développer « source.* > cible.* » en lignes une-à-une par colonne de même nom
    const full = rest.match(/^(\S+)\.\*\s*>\s*(\S+)\.\*$/);
    if (isMapping && full && db) {
      const exp = acExpandByName(full[1], full[2], db);
      if (exp) res = {
        from: lineStart + (pre.length - rest.length), filter: '', empty: true,
        items: [{
          label: 'Développer par colonnes identiques', kind: 'action', insert: exp.text || `// aucune colonne commune entre ${full[1]} et ${full[2]}`,
          detail: `${exp.common.length} correspondance${exp.common.length > 1 ? 's' : ''}`,
          doc: exp.common.length ? exp.common.join(', ') : 'Aucune colonne ne porte le même nom des deux côtés.',
        }],
      };
    }
    if (!res && (rest || explicit)) {
      const covered = isMapping ? acCoverage(db, topFrame.header) : null;
      const r = acRelationLine(rest, db, isMapping, covered);
      if (r) res = { from: caret - rest.length + r.start, filter: r.filter, items: r.items, empty: !!rest };
    }
  }
  // 3. Type d'une colonne
  else if (block === 'table' && /^\s*("[^"]+"|[\w]+)\s+([\w]*)$/.test(pre) && !/^\s*(note|indexes)\b/i.test(pre)) {
    const partial = pre.match(/([\w]*)$/)[1];
    const items = [], seen = new Set();
    const add = it => { if (!seen.has(it.label)) { seen.add(it.label); items.push(it); } };
    if (db) {
      for (const en of db.enums) add({ label: en.name, kind: 'enum', insert: en.name, detail: `enum · ${en.values.length} valeurs`, doc: en.values.map(v => v.name).join(', '), boost: 40 });
      const freq = new Map();
      for (const t of db.tables) for (const c of t.cols) freq.set(c.type, (freq.get(c.type) || 0) + 1);
      [...freq.entries()].sort((a, b) => b[1] - a[1]).forEach(([ty, n]) => {
        if (!db.enums.some(e => e.name === ty)) add({ label: ty, kind: 'type', insert: ty, detail: `utilisé ${n} fois`, boost: 20 + Math.min(n, 30) });
      });
    }
    for (const [label, insert, doc] of AC_BASE_TYPES) add({ label, kind: 'type', insert, doc });
    res = { from: caret - partial.length, filter: partial, items, empty: true };
  }
  // 4. Blocs et mots-clés en début de ligne
  else if (block === 'top' && /^\s*[A-Za-z]*$/.test(pre)) {
    const partial = pre.trim();
    if (partial || explicit) res = { from: caret - partial.length, filter: partial, prefixOnly: true, items: AC_SNIPPETS_TOP.map(([label, insert, doc]) => ({ label, kind: 'snippet', insert, detail: doc, doc: insert.replace(/\$\{\d+:([^}]*)\}/g, '$1').replace(/\$\d/g, '') })) };
  }
  else if (block === 'table' && /^\s*[A-Za-z]*$/.test(pre)) {
    const partial = pre.trim();
    if (partial.length >= 2 || explicit) res = { from: caret - partial.length, filter: partial, prefixOnly: true, items: AC_SNIPPETS_TABLE.map(([label, insert, doc]) => ({ label, kind: 'snippet', insert, detail: doc, doc: insert.replace(/\$\{\d+:([^}]*)\}/g, '$1').replace(/\$\d/g, '') })) };
  }
  // 5. Tables d'une région : celles hors de toute région d'abord, celles déjà tapées dans
  // le bloc courant exclues (elles ne sont pas encore dans le dernier modèle valide)
  else if (block === 'tablegroup' && /^\s*[\w.]*$/.test(pre)) {
    const partial = pre.trim();
    if (partial || explicit) {
      const already = new Set(text.slice(topFrame.start, lineStart).split('\n').map(l => l.trim().toLowerCase()).filter(l => l && !/^(note|\/\/)/i.test(l)));
      res = { from: caret - partial.length, filter: partial, items: acTableItems(db, { groups: true, exclude: already }) };
    }
  }

  if (!res) return null;
  if (!explicit && !res.filter && !res.empty) return null;
  const f = res.filter || '';
  let items = res.items
    .map((it, order) => {
      if (res.prefixOnly && f && !it.label.toLowerCase().startsWith(f.toLowerCase())) return null;
      const m = acFuzzy(f, it.label);
      return m && { ...it, score: m.score + (it.boost || 0), idx: m.idx, order };
    })
    .filter(Boolean)
    // inutile de proposer exactement ce qui est déjà tapé
    .filter(it => !(f && it.label === f && (it.insert || it.label) === f));
  items.sort((a, b) => b.score - a.score || a.order - b.order);
  items = items.slice(0, 60);
  return items.length ? { from: res.from, to: caret, items } : null;
}

// Développe un snippet : remplace les champs par leur texte et renvoie leurs positions
function expandSnippet(snippet, indent) {
  const src = snippet.replace(/\n/g, '\n' + indent);
  const re = /\$\{(\d+):([^}]*)\}|\$(\d+)/g;
  let out = '', last = 0, m;
  const stops = [];
  while ((m = re.exec(src))) {
    out += src.slice(last, m.index);
    const ph = m[2] || '';
    stops.push({ n: +(m[1] || m[3]), start: out.length, end: out.length + ph.length });
    out += ph; last = re.lastIndex;
  }
  out += src.slice(last);
  // position finale implicite en fin de snippet : Tab après le dernier champ sort du snippet
  if (stops.length && !stops.some(st => st.n === 0)) stops.push({ n: 0, start: out.length, end: out.length });
  stops.sort((a, b) => (a.n === 0) - (b.n === 0) || a.n - b.n);
  return { text: out, stops };
}

if (typeof module !== 'undefined') module.exports = { getCompletions, expandSnippet, acScan, acFuzzy, acGuessFK, acExpandByName, acCoverage };
