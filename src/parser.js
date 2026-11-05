// ---------- Parser DBML ----------
function dbmlErr(msg, line) { const e = new Error(msg); e.line = line; e.dbml = true; return e; }

function dedent(s) {
  s = s.replace(/^\n/, '').replace(/\n\s*$/, '');
  const lines = s.split('\n');
  const ind = Math.min(...lines.filter(l => l.trim()).map(l => l.match(/^\s*/)[0].length));
  return lines.map(l => l.slice(isFinite(ind) ? ind : 0)).join('\n');
}

function tokenize(src) {
  const toks = []; let i = 0, line = 1; const n = src.length;
  const isW = ch => /[A-Za-z0-9_]/.test(ch) || ch.charCodeAt(0) > 127;
  while (i < n) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\uFEFF') { i++; continue; } // \uFEFF : BOM UTF-8
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') {
      const s = line; i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') line++; i++; }
      if (i >= n) throw dbmlErr('Commentaire /* non fermé', s);
      i += 2; continue;
    }
    if (src.startsWith("'''", i)) {
      const s = line, st = i; i += 3; let v = '';
      while (i < n && !src.startsWith("'''", i)) { if (src[i] === '\n') line++; v += src[i++]; }
      if (i >= n) throw dbmlErr("Texte ''' non fermé", s);
      i += 3; toks.push({ t: 'str', v: dedent(v.replace(/\r\n/g, '\n')), line: s, s: st, e: i }); continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const s = line, st = i, q = c; i++; let v = '';
      while (i < n && src[i] !== q) {
        if (src[i] === '\\' && i + 1 < n) { v += src[i + 1]; i += 2; continue; }
        if (src[i] === '\n') { if (q !== '`') throw dbmlErr(`Chaîne ${q}…${q} non fermée`, s); line++; }
        v += src[i++];
      }
      if (i >= n) throw dbmlErr(`Chaîne ${q}…${q} non fermée`, s);
      i++;
      toks.push({ t: q === '`' ? 'expr' : (q === '"' ? 'qid' : 'str'), v, line: s, s: st, e: i }); continue;
    }
    if (isW(c)) {
      const st = i; let v = '';
      while (i < n && isW(src[i])) v += src[i++];
      toks.push({ t: 'id', v, line, s: st, e: i }); continue;
    }
    if (c === '<' && src[i + 1] === '>') { toks.push({ t: 'sym', v: '<>', line, s: i, e: i + 2 }); i += 2; continue; }
    if ('{}[]():,.<>-~#+*/=;?!@%'.includes(c)) { toks.push({ t: 'sym', v: c, line, s: i, e: i + 1 }); i++; continue; }
    throw dbmlErr(`Caractère inattendu « ${c} »`, line);
  }
  toks.push({ t: 'eof', v: '', line, s: n, e: n });
  return toks;
}

// Lit un point de relation : table.col, schema.table.col, table.(a, b)
function readEndpoint(A, k, allowStar) {
  const parts = []; let cols = null;
  const nm = () => {
    const t = A[k];
    if (!t || (t.t !== 'id' && t.t !== 'qid')) throw dbmlErr(`Relation : nom attendu, trouvé « ${t && t.v || 'rien'} »`, t ? t.line : (A[k - 1] || {}).line);
    k++; return t.v;
  };
  parts.push(nm());
  while (A[k] && A[k].t === 'sym' && A[k].v === '.') {
    k++;
    if (allowStar && A[k] && A[k].t === 'sym' && A[k].v === '*') { k++; cols = ['*']; break; }
    if (A[k] && A[k].t === 'sym' && A[k].v === '(') {
      const open = A[k]; k++; cols = [];
      while (true) {
        cols.push(nm());
        const t = A[k++];
        if (!t || t.t === 'eof') throw dbmlErr('Parenthèse ( non fermée', open.line);
        if (t.v === ')') break;
        if (t.v !== ',') throw dbmlErr(`« , » ou « ) » attendu, trouvé « ${t.v} »`, t.line);
      }
      break;
    }
    parts.push(nm());
  }
  if (!cols) {
    if (parts.length < 2) throw dbmlErr('Relation : format « table.colonne » attendu', A[k - 1].line);
    cols = [parts.pop()];
  }
  return { ep: { table: parts.join('.'), cols }, k };
}

const REL_OPS = ['>', '<', '-', '<>'];

function parseDBML(src) {
  const T = tokenize(src); let p = 0;
  const peek = (o = 0) => T[Math.min(p + o, T.length - 1)];
  const next = () => T[p < T.length - 1 ? p++ : p];
  const isSym = (t, v) => t.t === 'sym' && t.v === v;
  const isKw = (t, v) => t.t === 'id' && t.v.toLowerCase() === v;
  const expect = v => {
    const t = next();
    if (!isSym(t, v)) throw dbmlErr(`« ${v} » attendu, trouvé « ${t.v || 'fin du fichier'} »`, t.line);
    return t;
  };
  const name = () => {
    const t = next();
    if (t.t !== 'id' && t.t !== 'qid') throw dbmlErr(`Nom attendu, trouvé « ${t.v || 'fin du fichier'} »`, t.line);
    return t.v;
  };
  const dotted = () => { const a = [name()]; while (isSym(peek(), '.')) { next(); a.push(name()); } return a; };
  const raw = toks => toks.length ? src.slice(toks[0].s, toks[toks.length - 1].e) : '';
  const valStr = toks => (toks.length === 1 && (toks[0].t === 'str' || toks[0].t === 'qid')) ? toks[0].v : raw(toks);
  const skipBlock = () => {
    const s = expect('{'); let d = 1;
    while (d > 0) {
      const t = next();
      if (t.t === 'eof') throw dbmlErr('Bloc { non fermé', s.line);
      if (isSym(t, '{')) d++; else if (isSym(t, '}')) d--;
    }
  };
  let lastRange = null; // étendue [s, e] des derniers crochets lus (sert à retirer « lane: » du DBML standard)
  const settings = () => {
    const open = expect('['); const groups = []; let cur = []; let depth = 0;
    while (true) {
      const t = next();
      if (t.t === 'eof') throw dbmlErr('Crochet [ non fermé', open.line);
      if (isSym(t, '(')) depth++;
      if (isSym(t, ')')) depth--;
      if (isSym(t, ']') && depth <= 0) { if (cur.length) groups.push(cur); lastRange = { s: open.s, e: t.e }; break; }
      if (isSym(t, ',') && depth <= 0) { if (!cur.length) throw dbmlErr('Paramètre vide entre crochets', t.line); groups.push(cur); cur = []; continue; }
      cur.push(t);
    }
    return groups.map(toks => {
      const ci = toks.findIndex(x => isSym(x, ':'));
      if (ci < 0) return { key: toks.map(x => x.v).join(' ').toLowerCase(), val: null, toks, line: toks[0].line };
      return { key: toks.slice(0, ci).map(x => x.v).join(' ').toLowerCase(), val: toks.slice(ci + 1), toks, line: toks[0].line };
    });
  };
  const noteValue = () => {
    if (isSym(peek(), ':')) {
      next(); const t = next();
      if (t.t !== 'str') throw dbmlErr('Note : texte entre apostrophes attendu', t.line);
      return t.v;
    }
    const o = expect('{'); const t = next();
    if (t.t !== 'str') throw dbmlErr('Note : texte entre apostrophes attendu', t.line);
    const c = next(); if (!isSym(c, '}')) throw dbmlErr('Note : « } » attendu', o.line);
    return t.v;
  };

  const db = { tables: [], refs: [], enums: [], groups: [], mappings: [], refGroups: [], lanes: [], lanesBlocks: [], hasDomain: false, project: null };
  const partials = new Map(); // TablePartial nommés, injectés par « ~nom » dans les tables
  let currentRefGroup = null;

  const relSettings = (ref, list) => {
    for (const s of list) {
      if (s.key === 'delete') ref.onDelete = valStr(s.val);
      else if (s.key === 'update') ref.onUpdate = valStr(s.val);
    }
  };

  const applyCol = (col, s, tbl) => {
    switch (s.key) {
      case 'pk': case 'primary key': col.pk = true; break;
      case 'not null': col.nn = true; break;
      case 'null': col.nn = false; break;
      case 'unique': col.unique = true; break;
      case 'increment': col.inc = true; break;
      case 'note': col.note = valStr(s.val || []); break;
      case 'default': {
        const v = s.val || [];
        if (!v.length) throw dbmlErr('default : valeur manquante', s.line);
        if (v.length === 1 && v[0].t === 'str') { col.def = `'${v[0].v.replace(/'/g, "''")}'`; col.defShow = `'${v[0].v}'`; }
        else if (v.length === 1 && v[0].t === 'expr') { col.def = v[0].v; col.defShow = v[0].v; }
        else { col.def = raw(v); col.defShow = col.def; }
        break;
      }
      case 'ref': {
        const v = s.val || [];
        if (!v.length || v[0].t !== 'sym' || !REL_OPS.includes(v[0].v)) throw dbmlErr('ref : opérateur >, <, - ou <> attendu', s.line);
        const r = readEndpoint(v, 1);
        db.refs.push({ from: { table: tbl.name, cols: [col.name] }, op: v[0].v, to: r.ep, line: s.line, inline: true, group: null });
        break;
      }
      default: break; // paramètres inconnus ignorés
    }
  };

  const parseRelation = () => {
    const start = peek();
    const a = readEndpoint(T, p); p = a.k;
    const op = next();
    if (op.t !== 'sym' || !REL_OPS.includes(op.v)) throw dbmlErr(`Opérateur de relation attendu (>, <, - ou <>), trouvé « ${op.v} »`, op.line);
    const b = readEndpoint(T, p); p = b.k;
    const ref = { from: a.ep, op: op.v, to: b.ep, line: start.line, group: currentRefGroup };
    if (isSym(peek(), '[') && peek().line === start.line) relSettings(ref, settings());
    db.refs.push(ref);
  };

  // TableGroup, imbrication comprise : une région peut en contenir d'autres. « db.groups » reste
  // une liste à plat (pratique pour les recherches par nom) ; le lien de parenté se lit via
  // g.parent, et g.groups liste les noms des sous-régions directes.
  function parseTableGroup(parentName) {
    const startTok = peek();
    next();
    const gName = dotted().join('.');
    const g = { name: gName, tables: [], groups: [], parent: parentName, line: startTok.line, color: null, note: null, s: startTok.s, e: null };
    if (isSym(peek(), '[')) for (const s of settings()) {
      if (s.key === 'color') g.color = valStr(s.val || []);
      else if (s.key === 'note') g.note = valStr(s.val || []);
    }
    const o = expect('{');
    while (!isSym(peek(), '}')) {
      if (peek().t === 'eof') throw dbmlErr(`TableGroup « ${gName} » : accolade } manquante`, o.line);
      if (isKw(peek(), 'note') && (isSym(peek(1), ':') || isSym(peek(1), '{'))) { next(); g.note = noteValue(); continue; }
      if (isKw(peek(), 'tablegroup')) {
        const child = parseTableGroup(gName);
        if (db.groups.some(x => x.name === child.name)) throw dbmlErr(`Région « ${child.name} » déclarée deux fois`, child.line);
        g.groups.push(child.name);
        db.groups.push(child);
        continue;
      }
      const ln = peek().line;
      g.tables.push({ name: dotted().join('.'), line: ln });
    }
    g.e = next().e;
    return g;
  }

  while (peek().t !== 'eof') {
    const t = peek();
    if (t.t !== 'id') throw dbmlErr(`Déclaration inattendue « ${t.v} » — attendu Table, Ref, Enum…`, t.line);
    const kw = t.v.toLowerCase();

    if (kw === 'table' || kw === 'tablepartial') {
      next();
      const isPartial = kw === 'tablepartial';
      const refsBefore = db.refs.length;
      const parts = dotted();
      const tbl = { name: parts.join('.'), alias: null, cols: [], note: null, color: null, lane: null, laneIndex: -1, domain: null, line: t.line, injects: [], indexes: [] };
      if (isKw(peek(), 'as')) { next(); tbl.alias = name(); }
      if (isSym(peek(), '[')) {
        const list = settings(), range = lastRange;
        for (const s of list) {
          if (s.key === 'headercolor') tbl.color = valStr(s.val || []);
          else if (s.key === 'note') tbl.note = valStr(s.val || []);
          else if (s.key === 'lane' || s.key === 'colonne') {
            if (!s.val || !s.val.length) throw dbmlErr('lane : nom de colonne manquant', s.line);
            tbl.lane = valStr(s.val); tbl.laneLine = s.line;
          } else if (s.key === 'domain' || s.key === 'domaine') {
            const v = valStr(s.val || []).toLowerCase();
            if (['in', 'inside', 'interne', 'true', 'oui'].includes(v)) tbl.domain = 'in';
            else if (['out', 'outside', 'externe', 'ext', 'false', 'non'].includes(v)) tbl.domain = 'out';
            else throw dbmlErr('domain : valeur attendue in (dans le domaine) ou out (hors domaine)', s.line);
            db.hasDomain = true;
          }
        }
        // paramètres propres à DBML Studio, retirés du DBML standard
        const ext = x => ['lane', 'colonne', 'domain', 'domaine'].includes(x.key);
        if (list.some(ext)) tbl.laneStrip = { s: range.s, e: range.e, rest: list.filter(x => !ext(x)).map(x => raw(x.toks)) };
      }
      const ob = expect('{');
      while (true) {
        const c = peek();
        if (c.t === 'eof') throw dbmlErr(`Table « ${tbl.name} » : accolade } manquante`, ob.line);
        if (isSym(c, '}')) { next(); break; }
        if (isKw(c, 'indexes') && isSym(peek(1), '{')) {
          next(); const io = expect('{');
          while (!isSym(peek(), '}')) {
            if (peek().t === 'eof') throw dbmlErr('indexes : accolade } manquante', io.line);
            const ln = peek().line; const names = [];
            while (peek().line === ln && !isSym(peek(), '[') && !isSym(peek(), '}') && peek().t !== 'eof') {
              const x = next(); if (x.t === 'id' || x.t === 'qid') names.push(x.v); else if (x.t === 'expr') names.push('`' + x.v + '`');
            }
            const idx = { cols: names.slice(), name: null, type: null, unique: false, pk: false, note: null };
            tbl.indexes.push(idx);
            if (isSym(peek(), '[') && peek().line === ln) {
              const st = settings();
              for (const s of st) {
                if (s.key === 'name') idx.name = valStr(s.val || []);
                else if (s.key === 'type') idx.type = valStr(s.val || []);
                else if (s.key === 'note') idx.note = valStr(s.val || []);
                else if (s.key === 'unique') idx.unique = true;
                else if (s.key === 'pk') idx.pk = true;
                if (s.key === 'pk') names.forEach(nm => { const col = tbl.cols.find(c2 => c2.name === nm); if (col) col.pk = true; });
                if (s.key === 'unique' && names.length === 1) { const col = tbl.cols.find(c2 => c2.name === names[0]); if (col) col.unique = true; }
              }
            }
          }
          next(); continue;
        }
        if (isKw(c, 'note') && (isSym(peek(1), ':') || isSym(peek(1), '{'))) { next(); tbl.note = noteValue(); continue; }
        if (isSym(c, '~')) { next(); tbl.injects.push({ name: dotted().join('.'), at: tbl.cols.length, line: c.line }); continue; } // ~partial
        const ct = next();
        if (ct.t !== 'id' && ct.t !== 'qid') throw dbmlErr(`Nom de colonne attendu, trouvé « ${ct.v} »`, ct.line);
        const ln = ct.line; const typeToks = [];
        while (peek().line === ln && !isSym(peek(), '}') && peek().t !== 'eof') {
          // « [ ] » et « [ 3 ] » après le type sont des tableaux (int[], varchar(10)[]), pas des paramètres
          if (isSym(peek(), '[')) {
            const a1 = peek(1), a2 = peek(2);
            if (isSym(a1, ']')) { typeToks.push(next(), next()); continue; }
            if (a1.t === 'id' && /^\d+$/.test(a1.v) && isSym(a2, ']')) { typeToks.push(next(), next(), next()); continue; }
            break;
          }
          typeToks.push(next());
        }
        if (!typeToks.length) throw dbmlErr(`Colonne « ${ct.v} » : type manquant`, ln);
        const col = {
          name: ct.v, type: (typeToks.length === 1 && typeToks[0].t === 'qid') ? typeToks[0].v : raw(typeToks),
          pk: false, nn: false, unique: false, inc: false, def: null, defShow: null, note: null, line: ln
        };
        if (tbl.cols.some(c2 => c2.name === col.name)) throw dbmlErr(`Colonne « ${col.name} » déclarée deux fois dans « ${tbl.name} »`, ln);
        tbl.cols.push(col);
        if (isSym(peek(), '[') && peek().line === ln) for (const s of settings()) applyCol(col, s, tbl);
      }
      if (isPartial) {
        db.refs.length = refsBefore; // refs en ligne d'un partial : ignorées (la table cible n'existe pas)
        if (partials.has(tbl.name)) throw dbmlErr(`TablePartial « ${tbl.name} » déclaré deux fois`, t.line);
        partials.set(tbl.name, tbl);
      } else db.tables.push(tbl);
    }

    else if (kw === 'ref') {
      next();
      let refName = null;
      const nameTok = peek();
      if ((nameTok.t === 'id' || nameTok.t === 'qid') && (isSym(peek(1), ':') || isSym(peek(1), '{') || isSym(peek(1), '['))) {
        refName = nameTok.v; next();
      }
      let refColor = null, refNote = null;
      if (isSym(peek(), '[')) for (const s of settings()) {
        if (s.key === 'color') refColor = valStr(s.val || []);
        else if (s.key === 'note') refNote = valStr(s.val || []);
      }
      if (refName) {
        const existing = db.refGroups.find(g => g.name === refName);
        if (existing) { if (refColor) existing.color = refColor; if (refNote) existing.note = refNote; }
        else db.refGroups.push({ name: refName, color: refColor, note: refNote, line: t.line });
      }
      currentRefGroup = refName;
      if (isSym(peek(), ':')) { next(); parseRelation(); }
      else if (isSym(peek(), '{')) {
        const o = next();
        while (!isSym(peek(), '}')) {
          if (peek().t === 'eof') throw dbmlErr('Ref : accolade } manquante', o.line);
          parseRelation();
        }
        next();
      } else throw dbmlErr('Ref : « : » ou « { » attendu', peek().line);
      currentRefGroup = null;
    }

    else if (kw === 'enum') {
      next();
      const en = { name: dotted().join('.'), values: [], line: t.line };
      const o = expect('{');
      while (!isSym(peek(), '}')) {
        const v = next();
        if (v.t === 'eof') throw dbmlErr(`Enum « ${en.name} » : accolade } manquante`, o.line);
        if (v.t !== 'id' && v.t !== 'qid' && v.t !== 'str') throw dbmlErr(`Valeur d'enum attendue, trouvé « ${v.v} »`, v.line);
        const val = { name: v.v, note: null, line: v.line };
        if (isSym(peek(), '[') && peek().line === v.line) for (const s of settings()) if (s.key === 'note') val.note = valStr(s.val || []);
        en.values.push(val);
      }
      next();
      db.enums.push(en);
    }

    // Lanes { nom [width: 420, color: #xxx] … } : colonnes verticales qui orientent le placement des
    // tables (extension DBML Studio, retirée du DBML standard)
    else if (kw === 'lanes' || kw === 'colonnes') {
      next();
      const o = expect('{');
      while (!isSym(peek(), '}')) {
        const lt = next();
        if (lt.t === 'eof') throw dbmlErr('Lanes : accolade } manquante', o.line);
        if (lt.t !== 'id' && lt.t !== 'qid' && lt.t !== 'str') throw dbmlErr(`Lanes : nom de colonne attendu, trouvé « ${lt.v} »`, lt.line);
        const ln = { name: lt.v, width: null, color: null, note: null, line: lt.line };
        if (isSym(peek(), '[') && peek().line === lt.line) for (const st of settings()) {
          if (st.key === 'width' || st.key === 'largeur') {
            const w = parseFloat(valStr(st.val || []));
            if (!(w >= 120 && w <= 2000)) throw dbmlErr('Lanes : width doit être un nombre entre 120 et 2000', st.line);
            ln.width = w;
          } else if (st.key === 'color') ln.color = valStr(st.val || []);
          else if (st.key === 'note') ln.note = valStr(st.val || []);
        }
        if (db.lanes.some(x => x.name === ln.name)) throw dbmlErr(`Colonne « ${ln.name} » déclarée deux fois`, ln.line);
        db.lanes.push(ln);
      }
      const ce = next();
      db.lanesBlocks.push({ s: t.s, e: ce.e });
    }

    else if (kw === 'tablegroup') {
      const g = parseTableGroup(null);
      if (db.groups.some(x => x.name === g.name)) throw dbmlErr(`Région « ${g.name} » déclarée deux fois`, g.line);
      db.groups.push(g);
    }

    else if (kw === 'mapping') {
      next();
      const mp = { name: null, color: null, note: null, flows: [], line: t.line, s: t.s, e: t.e };
      if (peek().t === 'id' || peek().t === 'qid') mp.name = dotted().join('.');
      if (isSym(peek(), '[')) for (const st of settings()) {
        if (st.key === 'color') mp.color = valStr(st.val || []);
        else if (st.key === 'note') mp.note = valStr(st.val || []);
      }
      const o = expect('{');
      while (!isSym(peek(), '}')) {
        if (peek().t === 'eof') throw dbmlErr('Mapping : accolade } manquante', o.line);
        const st = peek();
        const a = readEndpoint(T, p, true); p = a.k;
        const op = next();
        if (isSym(op, '-') && isSym(peek(), '>')) next();
        else if (!isSym(op, '>')) throw dbmlErr(`Mapping : « > » attendu entre la source et la cible, trouvé « ${op.v} »`, op.line);
        const b = readEndpoint(T, p, true); p = b.k;
        const fl = { from: a.ep, to: b.ep, transform: null, note: null, line: st.line };
        if (isSym(peek(), '[') && peek().line === st.line) for (const x of settings()) {
          if (x.key === 'transform' || x.key === 'rule' || x.key === 'règle') fl.transform = valStr(x.val || []);
          else if (x.key === 'note') fl.note = valStr(x.val || []);
        }
        mp.flows.push(fl);
      }
      mp.e = next().e;
      if (!mp.name) mp.name = 'mapping ' + (db.mappings.length + 1);
      if (db.mappings.some(m => m.name === mp.name)) throw dbmlErr(`Mapping « ${mp.name} » déclaré deux fois`, mp.line);
      db.mappings.push(mp);
    }

    else if (kw === 'project' || kw === 'records') {
      next();
      let pname = null;
      while (!isSym(peek(), '{')) { if (peek().t === 'eof') throw dbmlErr(`${t.v} : bloc { attendu`, t.line); const x = next(); if (kw === 'project' && pname === null && (x.t === 'id' || x.t === 'qid')) pname = x.v; }
      if (kw !== 'project') { skipBlock(); continue; }
      const po = expect('{'); const pr = { name: pname, note: null }; let d = 1;
      while (d > 0) {
        if (peek().t === 'eof') throw dbmlErr('Bloc { non fermé', po.line);
        if (d === 1 && isKw(peek(), 'note') && (isSym(peek(1), ':') || isSym(peek(1), '{'))) { next(); pr.note = noteValue(); continue; }
        const x = next();
        if (isSym(x, '{')) d++; else if (isSym(x, '}')) d--;
      }
      db.project = pr;
    }

    else if (kw === 'note') {
      next();
      if (peek().t === 'id' || peek().t === 'qid') next();
      skipBlock();
    }

    else throw dbmlErr(`Mot-clé inconnu « ${t.v} » — attendu Table, Ref, Enum, TableGroup, Mapping, Lanes, Project ou Note`, t.line);
  }

  // ---- Injection des TablePartial (~nom) : les colonnes propres à la table l'emportent ----
  const expanded = new Set();
  const expand = tb => {
    if (expanded.has(tb)) return;
    expanded.add(tb);
    if (!tb.injects.length) return;
    const own = tb.cols, out = []; const names = new Set(own.map(c => c.name));
    const addAt = pos => tb.injects.filter(x => x.at === pos).forEach(inj => {
      const pt = partials.get(inj.name);
      if (!pt) throw dbmlErr(`TablePartial « ${inj.name} » introuvable`, inj.line);
      if (pt === tb) throw dbmlErr(`TablePartial « ${inj.name} » s'injecte lui-même`, inj.line);
      expand(pt);
      for (const c of pt.cols) if (!names.has(c.name)) { names.add(c.name); out.push({ ...c }); }
    });
    own.forEach((c, i) => { addAt(i); out.push(c); });
    addAt(own.length);
    tb.cols = out;
  };
  db.tables.forEach(expand);

  // ---- Validation / résolution ----
  const byName = new Map();
  for (const tb of db.tables) {
    for (const key of [tb.name, tb.alias].filter(Boolean)) {
      if (byName.has(key)) throw dbmlErr(`Nom de table « ${key} » déjà utilisé`, tb.line);
      byName.set(key, tb);
    }
  }
  const findTable = nm => byName.get(nm) || byName.get(nm.replace(/^public\./, '')) || byName.get('public.' + nm);
  db.findTable = findTable;
  for (const r of db.refs) {
    for (const side of [r.from, r.to]) {
      const tb = findTable(side.table);
      if (!tb) throw dbmlErr(`Relation : table « ${side.table} » introuvable`, r.line);
      for (const c of side.cols) if (!tb.cols.some(x => x.name === c)) throw dbmlErr(`Relation : colonne « ${c} » absente de « ${tb.name} »`, r.line);
      side.resolved = tb.name;
    }
    if (r.from.cols.length !== r.to.cols.length) throw dbmlErr('Relation composite : nombre de colonnes différent de chaque côté', r.line);
  }
  for (const mp of db.mappings) for (const f of mp.flows) {
    for (const side of [f.from, f.to]) {
      const tb = findTable(side.table);
      if (!tb) throw dbmlErr(`Mapping : table « ${side.table} » introuvable`, f.line);
      if (side.cols.includes('*') && side.cols.length > 1) throw dbmlErr('Mapping : « * » doit être utilisé seul', f.line);
      for (const c of side.cols) if (c !== '*' && !tb.cols.some(x => x.name === c)) throw dbmlErr(`Mapping : colonne « ${c} » absente de « ${tb.name} »`, f.line);
      side.resolved = tb.name;
    }
    const na = f.from.cols.length, nb = f.to.cols.length;
    if (na !== nb && na !== 1 && nb !== 1) throw dbmlErr('Mapping : il faut autant de colonnes des deux côtés, ou une seule d\'un côté', f.line);
  }
  for (const tb of db.tables) if (tb.lane !== null) {
    const li = db.lanes.findIndex(l => l.name === tb.lane);
    if (li < 0) throw dbmlErr(`Table « ${tb.name} » : colonne « ${tb.lane} » introuvable — déclarez-la dans un bloc Lanes { }`, tb.laneLine || tb.line);
    tb.laneIndex = li;
  }
  const tableOwner = new Map();
  for (const g of db.groups) for (const m of g.tables) {
    const tb = findTable(m.name);
    if (!tb) throw dbmlErr(`TableGroup « ${g.name} » : table « ${m.name} » introuvable`, m.line);
    m.resolved = tb.name;
    if (tableOwner.has(tb.name)) throw dbmlErr(`Table « ${tb.name} » déjà présente dans la région « ${tableOwner.get(tb.name)} »`, m.line);
    tableOwner.set(tb.name, g.name);
  }
  return db;
}

// Retire les blocs Mapping pour obtenir du DBML standard
function stripMappings(src, db) {
  let out = src;
  // Mapping, blocs Lanes et paramètres « lane: » : tout ce qui est propre à DBML Studio
  const cuts = db.mappings.map(m => ({ s: m.s, e: m.e, rep: '' }));
  (db.lanesBlocks || []).forEach(b => cuts.push({ s: b.s, e: b.e, rep: '' }));
  db.tables.forEach(tb => {
    if (tb.laneStrip) cuts.push({ s: tb.laneStrip.s, e: tb.laneStrip.e, rep: tb.laneStrip.rest.length ? '[' + tb.laneStrip.rest.join(', ') + ']' : '' });
  });
  cuts.sort((a, b) => b.s - a.s).forEach(m => { out = out.slice(0, m.s) + m.rep + out.slice(m.e); });
  out = out.replace(/^(\s*Table\b[^\n{]*?)[ \t]+\{/gm, '$1 {');
  return out.replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

// Aplatit les TableGroup imbriqués (extension DBML Studio) en régions à plat : chaque région de
// premier niveau qui contient des sous-régions est réécrite en une seule liste de tables (les
// siennes propres et celles de ses sous-régions, réunies), pour rester lisible par dbdiagram.io
// et @dbml/core, qui ne connaissent pas l'imbrication.
function flattenGroups(src, db) {
  const byName = new Map(db.groups.map(g => [g.name, g]));
  const collect = g => g.tables.map(m => m.resolved).concat(...g.groups.map(n => { const c = byName.get(n); return c ? collect(c) : []; }));
  const topNested = db.groups.filter(g => g.parent === null && g.groups.length > 0);
  let out = src;
  [...topNested].sort((a, b) => b.s - a.s).forEach(g => {
    const names = [...new Set(collect(g))];
    const color = g.color ? ` [color: ${g.color}]` : '';
    const block = `TableGroup ${g.name}${color} {\n${names.map(n => '  ' + n).join('\n')}\n}`;
    out = out.slice(0, g.s) + block + out.slice(g.e);
  });
  return out;
}

if (typeof module !== 'undefined') module.exports = { parseDBML, tokenize, stripMappings, flattenGroups };
