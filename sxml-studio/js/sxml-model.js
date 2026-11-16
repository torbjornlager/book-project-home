/* SXML Studio — document model.
 *
 * The XML DOM is the single source of truth.  This module parses SXML source,
 * derives a light view model for layout and rendering, checks the rules of
 * Appendix C that can be checked without a Prolog engine, performs structural
 * edits on the DOM, and writes the DOM back as tidy SXML source.
 */
(function (global) {
  'use strict';

  const STATE_TAGS = ['state', 'parallel', 'final', 'history'];
  const SCRIPT_TAGS = ['onentry', 'onexit', 'go', 'datamodel', 'spawn'];
  const ATTRS = {
    statechart: ['version', 'initial', 'id'],
    state: ['id', 'initial'],
    parallel: ['id'],
    final: ['id'],
    history: ['id', 'type'],
    go: ['to', 'on', 'if', 'after'],
    onentry: [], onexit: [], datamodel: [],
    defer: ['on', 'if'],
    spawn: ['type', 'options', 'goal', 'callback', 'state', 'children']
  };
  const CHILDREN = {
    statechart: ['datamodel', 'state', 'parallel', 'final'],
    state: ['onentry', 'onexit', 'go', 'defer', 'spawn', 'datamodel', 'history', 'state', 'parallel', 'final'],
    parallel: ['onentry', 'onexit', 'go', 'defer', 'spawn', 'datamodel', 'history', 'state', 'parallel', 'final'],
    final: ['onentry'],
    history: ['go'],
    go: [], onentry: [], onexit: [], datamodel: [], defer: [], spawn: []
  };
  const SPAWN_TYPES = ['actor', 'toplevel', 'server', 'supervisor', 'statechart'];
  const SPAWN_REQUIRED = { actor: ['goal'], toplevel: [], server: ['callback', 'state'], supervisor: ['children'], statechart: [] };

  /* ---------- parsing ---------- */

  function parse(text) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    const err = doc.getElementsByTagName('parsererror')[0];
    if (err) {
      const div = err.querySelector('div');
      let message = (div ? div.textContent : err.textContent).trim().replace(/\s+/g, ' ');
      const m = /line (\d+) at column (\d+)/.exec(message);
      return { doc: null, error: { message, line: m ? +m[1] : null, column: m ? +m[2] : null } };
    }
    return { doc, error: null };
  }

  const collapse = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

  /* Text of a script element with common indentation removed. */
  function scriptText(el) {
    return dedent(el.textContent);
  }
  function dedent(text) {
    let lines = String(text).replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    let min = Infinity;
    for (const l of lines) if (l.trim()) min = Math.min(min, l.match(/^ */)[0].length);
    if (!isFinite(min)) min = 0;
    return lines.map(l => l.slice(min).replace(/\s+$/, '')).join('\n');
  }

  /* ---------- view model ---------- */

  function build(doc) {
    const model = { doc, root: null, byId: new Map(), byKey: new Map(), nodes: [], transitions: [], items: new Map() };
    const usedKeys = new Set();
    let anon = 0;
    function key(base) {
      let k = base, i = 2;
      while (usedKeys.has(k)) k = base + '~' + (i++);
      usedKeys.add(k);
      return k;
    }
    function item(kind, el, owner, extra) {
      const it = Object.assign({ kind, el, owner, key: key(owner.key + '/' + kind + (owner.itemCount++)) }, extra);
      model.items.set(it.key, it);
      return it;
    }
    function mk(el, parent) {
      const kind = el.localName;
      const id = el.getAttribute('id') || '';
      const n = {
        el, kind, id, parent, depth: parent ? parent.depth + 1 : 0,
        key: kind === 'statechart' ? '#root' : key(id || '#anon' + (anon++)),
        initial: el.getAttribute('initial') || '',
        htype: el.getAttribute('type') || 'shallow',
        children: [], transitions: [], onentry: [], onexit: [], defers: [], spawns: [], datamodels: [],
        itemCount: 0
      };
      model.nodes.push(n);
      model.byKey.set(n.key, n);
      if (id && !model.byId.has(id)) model.byId.set(id, n);
      for (const c of Array.from(el.children)) {
        const t = c.localName;
        if (STATE_TAGS.includes(t)) n.children.push(mk(c, n));
        else if (t === 'go') {
          const to = (c.getAttribute('to') || '').split(/\s+/).filter(Boolean);
          const tr = item('go', c, n, {
            source: n, to, on: c.getAttribute('on'), cond: c.getAttribute('if'), after: c.getAttribute('after'),
            body: scriptText(c), index: n.transitions.length
          });
          n.transitions.push(tr);
          model.transitions.push(tr);
        }
        else if (t === 'onentry') n.onentry.push(item('onentry', c, n, { body: scriptText(c) }));
        else if (t === 'onexit') n.onexit.push(item('onexit', c, n, { body: scriptText(c) }));
        else if (t === 'defer') n.defers.push(item('defer', c, n, { on: c.getAttribute('on'), cond: c.getAttribute('if') }));
        else if (t === 'spawn') n.spawns.push(item('spawn', c, n, { type: c.getAttribute('type') || '', body: scriptText(c) }));
        else if (t === 'datamodel') n.datamodels.push(item('datamodel', c, n, { body: scriptText(c) }));
      }
      n.compound = n.children.some(c => c.kind !== 'history');
      return n;
    }
    const rootEl = doc.documentElement;
    model.root = mk(rootEl, null);
    model.problems = validate(model);
    model.layout = getLayout(doc);
    model.examples = exampleQueries(doc);
    model.description = description(doc);
    return model;
  }

  function isState(n) { return n && STATE_TAGS.includes(n.kind); }

  /* ---------- validation (the engine remains the final authority) ---------- */

  function validate(model) {
    const out = [];
    const add = (severity, message, key) => out.push({ severity, message, key });
    const root = model.root;
    if (root.kind !== 'statechart') {
      add('error', 'The document root must be <statechart>, found <' + root.kind + '>.', root.key);
      return out;
    }
    if (root.el.getAttribute('version') !== '0.2') add('error', '<statechart> needs version="0.2".', root.key);
    const seen = new Map();
    (function walk(n) {
      const allowedAttrs = ATTRS[n.kind] || [];
      for (const a of Array.from(n.el.attributes)) {
        if (!allowedAttrs.includes(a.name)) add('error', 'Unknown attribute "' + a.name + '" on <' + n.kind + '>.', n.key);
      }
      for (const c of Array.from(n.el.children)) {
        if (!ATTRS[c.localName]) add('error', 'Unknown element <' + c.localName + '> in ' + label(n) + '.', n.key);
        else if (!(CHILDREN[n.kind] || []).includes(c.localName)) add('error', '<' + c.localName + '> is not allowed inside <' + n.kind + '>.', n.key);
        else if (!STATE_TAGS.includes(c.localName)) {
          for (const a of Array.from(c.attributes)) {
            if (!ATTRS[c.localName].includes(a.name)) add('error', 'Unknown attribute "' + a.name + '" on <' + c.localName + '> in ' + label(n) + '.', n.key);
          }
        }
      }
      if (n.kind !== 'statechart') {
        if (!n.id) add('error', '<' + n.kind + '> needs an id.', n.key);
        else if (seen.has(n.id)) add('error', 'Duplicate id "' + n.id + '".', n.key);
        else seen.set(n.id, n);
      }
      const realChildren = n.children.filter(c => c.kind !== 'history');
      if (n.kind === 'statechart' || n.kind === 'state') {
        if (realChildren.length) {
          if (!n.initial) add('error', label(n) + ' has child states and needs an initial attribute.', n.key);
          else if (!realChildren.some(c => c.id === n.initial)) {
            add('error', 'initial="' + n.initial + '" of ' + label(n) + ' must name one of its direct child states.', n.key);
          }
        } else if (n.kind === 'statechart') add('error', '<statechart> has no states.', n.key);
        else if (n.initial) add('warning', label(n) + ' has an initial attribute but no child states.', n.key);
      }
      if (n.kind === 'history') {
        if (!['shallow', 'deep'].includes(n.htype)) add('error', 'History type must be "shallow" or "deep".', n.key);
        if (n.transitions.length !== 1) add('warning', 'History state "' + n.id + '" should have exactly one fallback <go>.', n.key);
        else {
          const t = n.transitions[0];
          if (t.on != null || t.after != null) add('error', 'The fallback <go> of history "' + n.id + '" must be eventless.', t.key);
          if (collapse(t.body)) add('warning', 'The body of a history fallback <go> is not executed; use the target\'s <onentry>.', t.key);
        }
      }
      for (const t of n.transitions) {
        if (t.on != null && t.after != null) add('error', 'A <go> cannot have both "on" and "after" (' + label(n) + ').', t.key);
        if (t.after != null && !(isFinite(+t.after) && +t.after >= 0 && String(t.after).trim() !== '')) {
          add('error', 'after="' + t.after + '" must be a non-negative number of seconds.', t.key);
        }
        if (t.on == null && t.cond == null && t.after == null && !t.to.length) {
          add('warning', 'An empty <go> in ' + label(n) + ' is always enabled and loops forever.', t.key);
        }
        if (t.on != null && !t.on.trim()) add('error', 'Empty "on" pattern in ' + label(n) + '.', t.key);
      }
      for (const d of n.defers) if (!d.on || !d.on.trim()) add('error', '<defer> in ' + label(n) + ' needs an "on" pattern.', d.key);
      for (const s of n.spawns) {
        if (!s.type) add('error', '<spawn> in ' + label(n) + ' needs a type.', s.key);
        else if (!SPAWN_TYPES.includes(s.type)) add('error', 'Unknown spawn type "' + s.type + '".', s.key);
        else for (const req of SPAWN_REQUIRED[s.type]) {
          if (!s.el.hasAttribute(req)) add('error', '<spawn type="' + s.type + '"> needs the attribute "' + req + '".', s.key);
        }
      }
      n.children.forEach(walk);
    })(root);
    for (const t of model.transitions) {
      for (const id of t.to) if (!seen.has(id)) add('error', 'Transition target "' + id + '" does not exist (from ' + label(t.source) + ').', t.key);
    }
    return out;
  }

  function label(n) {
    return n.kind === 'statechart' ? 'the statechart root' : '<' + n.kind + ' id="' + n.id + '">';
  }

  /* ---------- leading description and trailing example queries ---------- */

  function description(doc) {
    for (const n of Array.from(doc.childNodes)) {
      if (n.nodeType === 8 && !/<examples>|<layout>/.test(n.data)) return dedent(n.data);
      if (n.nodeType === 1) break;
    }
    return '';
  }

  function exampleQueries(doc) {
    const out = [];
    for (const n of Array.from(doc.childNodes)) {
      if (n.nodeType !== 8 || !/<examples>/.test(n.data)) continue;
      const body = n.data.replace(/<examples>/, '');
      for (const part of body.split(/^\s*\?-/m).slice(1)) {
        const goal = dedent(part).replace(/\.\s*$/, '').trim();
        if (goal) out.push(goal);
      }
    }
    return out;
  }

  /* ---------- manual arrangement, kept in a trailing <layout> comment ---------- */

  function layoutComment(doc) {
    return Array.from(doc.childNodes).find(n => n.nodeType === 8 && /^\s*<layout>/.test(n.data)) || null;
  }

  /* { parentKey: { childKey: [x, y], ... }, ... } or null */
  function getLayout(doc) {
    const c = layoutComment(doc);
    if (!c) return null;
    try {
      const obj = JSON.parse(c.data.replace(/^\s*<layout>/, ''));
      return obj && typeof obj === 'object' && Object.keys(obj).length ? obj : null;
    } catch (e) { return null; }
  }

  function setLayout(doc, layout) {
    const old = layoutComment(doc);
    const keys = layout ? Object.keys(layout) : [];
    if (!keys.length) { if (old) old.remove(); return; }
    const body = ' <layout>\n{' + keys.map(k => JSON.stringify(k) + ': ' + JSON.stringify(layout[k])).join(',\n ') + '}\n';
    if (old) old.data = body;
    else doc.appendChild(doc.createComment(body));
  }

  /* ---------- serialisation ---------- */

  const escText = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const escAttr = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

  function attrsOf(el, pad) {
    const attrs = Array.from(el.attributes);
    if (!attrs.length) return '';
    const parts = attrs.map(a => a.name + '="' + escAttr(a.value) + '"');
    const flat = ' ' + parts.join(' ');
    if (pad.length + el.localName.length + flat.length <= 92 || parts.length < 2) return flat;
    const hang = pad + ' '.repeat(el.localName.length + 2);
    return ' ' + parts.join('\n' + hang);
  }

  function serialize(doc, opts) {
    const out = [];
    const SLASH = opts && opts.spaceSlash ? ' />' : '/>';
    const IND = '    ';
    function emit(node, depth) {
      const pad = IND.repeat(depth);
      if (node.nodeType === 8) {            // comment
        out.push(pad + '<!--' + node.data + '-->');
        return;
      }
      if (node.nodeType !== 1) return;
      const name = node.localName;
      const open = '<' + name + attrsOf(node, pad);
      const kids = Array.from(node.childNodes);
      const hasElements = kids.some(k => k.nodeType === 1 || k.nodeType === 8);
      if (!hasElements) {
        const cdata = kids.some(k => k.nodeType === 4);
        if (cdata) {
          let raw = '';
          for (const k of kids) raw += k.nodeType === 4 ? '<![CDATA[' + k.data + ']]>' : (k.data.trim() ? escText(k.data) : '');
          out.push(pad + open + '>' + raw + '</' + name + '>');
          return;
        }
        const original = node.textContent;
        const text = dedent(original);
        if (!text) { out.push(pad + open + SLASH); return; }
        if (!/\n/.test(text) && !/\n/.test(original.replace(/^\s+|\s+$/g, '')) && !/^\s*\n/.test(original)) {
          out.push(pad + open + '>' + escText(text) + '</' + name + '>');
          return;
        }
        out.push(pad + open + '>');
        for (const line of text.split('\n')) out.push(line ? pad + IND + escText(line) : '');
        out.push(pad + '</' + name + '>');
        return;
      }
      out.push(pad + open + '>');
      let gap = false, first = true;
      for (const k of kids) {
        if (k.nodeType === 3) {
          if (k.data.trim()) { out.push(pad + IND + escText(collapse(k.data))); first = false; }
          else if ((k.data.match(/\n/g) || []).length >= 2) gap = true;
          continue;
        }
        if (k.nodeType === 4) { out.push(pad + IND + '<![CDATA[' + k.data + ']]>'); first = false; continue; }
        if (gap && !first) out.push('');
        gap = false; first = false;
        emit(k, depth + 1);
      }
      out.push(pad + '</' + name + '>');
    }
    const top = Array.from(doc.childNodes).filter(n => n.nodeType === 1 || n.nodeType === 8);
    top.forEach((n, i) => {
      if (i) out.push('', ...(n.nodeType === 8 && top[i - 1].nodeType === 1 ? [''] : []));
      emit(n, 0);
    });
    return out.join('\n') + '\n';
  }

  /* ---------- source positions: map DOM elements to offsets in the text ---------- */

  function locate(text, doc) {
    const ranges = [];           // in document order of start tags
    const stack = [];
    const re = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<\/([A-Za-z_][\w.-]*)\s*>|<([A-Za-z_][\w.-]*)(?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*\s*(\/?)>/g;
    let m;
    while ((m = re.exec(text))) {
      if (m[2]) {
        const r = { start: m.index, openEnd: re.lastIndex, end: re.lastIndex };
        ranges.push(r);
        if (!m[3]) stack.push(r);
      } else if (m[1]) {
        const r = stack.pop();
        if (r) r.end = re.lastIndex;
      }
    }
    const map = new Map();
    const els = [doc.documentElement, ...doc.documentElement.querySelectorAll('*')];
    if (els.length !== ranges.length) return { map, ranges: [], els: [] };
    els.forEach((el, i) => map.set(el, ranges[i]));
    return { map, ranges, els };
  }

  /* ---------- structural edits (all operate on the DOM) ---------- */

  function uniqueId(doc, base) {
    const ids = new Set(Array.from(doc.querySelectorAll('[id]')).map(e => e.getAttribute('id')));
    if (!ids.has(base)) return base;
    let i = 2;
    while (ids.has(base + i)) i++;
    return base + i;
  }

  const ORDER = ['datamodel', 'spawn', 'onentry', 'defer', 'history', 'state', 'parallel', 'final', 'go', 'onexit'];

  /* Insert a new child where SXML authors conventionally put it. */
  function insertChild(parent, child) {
    const name = child.localName;
    const kids = Array.from(parent.children);
    const same = kids.filter(k => k.localName === name || (STATE_TAGS.includes(name) && ['state', 'parallel', 'final'].includes(k.localName) && name !== 'history'));
    if (same.length) { same[same.length - 1].after(child); return; }
    if (name === 'onentry') {
      const anchor = kids.find(k => !['datamodel', 'spawn'].includes(k.localName));
      if (anchor) parent.insertBefore(child, anchor); else parent.appendChild(child);
      return;
    }
    if (name === 'datamodel' || name === 'history') { parent.insertBefore(child, parent.firstElementChild); return; }
    if (name === 'spawn') {
      const anchor = kids.find(k => k.localName !== 'datamodel');
      if (anchor) parent.insertBefore(child, anchor); else parent.appendChild(child);
      return;
    }
    if (name === 'defer') {
      const anchor = kids.find(k => !['datamodel', 'spawn', 'onentry'].includes(k.localName));
      if (anchor) parent.insertBefore(child, anchor); else parent.appendChild(child);
      return;
    }
    if (STATE_TAGS.includes(name)) {
      const anchor = kids.find(k => ['go', 'onexit'].includes(k.localName));
      if (anchor) parent.insertBefore(child, anchor); else parent.appendChild(child);
      return;
    }
    if (name === 'go') {
      const anchor = kids.find(k => k.localName === 'onexit');
      if (anchor) parent.insertBefore(child, anchor); else parent.appendChild(child);
      return;
    }
    parent.appendChild(child);
  }

  function addState(doc, parentEl, kind) {
    const base = { state: 'state', parallel: 'parallel', final: 'final', history: 'h' }[kind];
    const el = doc.createElement(kind);
    el.setAttribute('id', uniqueId(doc, base + (kind === 'history' ? '' : '1')));
    const hadStates = Array.from(parentEl.children).some(k => ['state', 'parallel', 'final'].includes(k.localName));
    insertChild(parentEl, el);
    if (kind === 'history') {
      const first = Array.from(parentEl.children).find(k => ['state', 'parallel', 'final'].includes(k.localName));
      const go = doc.createElement('go');
      go.setAttribute('to', first ? first.getAttribute('id') : parentEl.getAttribute('initial') || '');
      el.appendChild(go);
    } else if (!hadStates && ['statechart', 'state'].includes(parentEl.localName) && !parentEl.getAttribute('initial') && kind !== 'final') {
      parentEl.setAttribute('initial', el.getAttribute('id'));
    } else if (!hadStates && ['statechart', 'state'].includes(parentEl.localName) && !parentEl.getAttribute('initial')) {
      parentEl.setAttribute('initial', el.getAttribute('id'));
    }
    return el;
  }

  function addTransition(doc, sourceEl, targetId) {
    const go = doc.createElement('go');
    if (targetId) go.setAttribute('to', targetId);
    insertChild(sourceEl, go);
    return go;
  }

  function addItem(doc, ownerEl, name) {
    const el = doc.createElement(name);
    if (name === 'defer') el.setAttribute('on', 'event(_)');
    if (name === 'spawn') { el.setAttribute('type', 'actor'); el.setAttribute('goal', 'worker'); }
    if (name === 'onentry' || name === 'onexit') el.textContent = 'true';
    insertChild(ownerEl, el);
    return el;
  }

  /* Rename a state and every reference to it. */
  function renameState(doc, el, newId) {
    const old = el.getAttribute('id');
    el.setAttribute('id', newId);
    if (!old || old === newId) return;
    for (const go of Array.from(doc.getElementsByTagName('go'))) {
      const to = go.getAttribute('to');
      if (to == null) continue;
      const parts = to.split(/\s+/).filter(Boolean);
      if (parts.includes(old)) go.setAttribute('to', parts.map(p => p === old ? newId : p).join(' '));
    }
    const parent = el.parentNode;
    if (parent && parent.nodeType === 1 && parent.getAttribute('initial') === old) parent.setAttribute('initial', newId);
    const layout = getLayout(doc);
    if (layout) {
      const re = k => k === old ? newId : k.startsWith(old + '/') ? newId + k.slice(old.length) : k;
      const next = {};
      for (const pk in layout) { next[re(pk)] = {}; for (const ck in layout[pk]) next[re(pk)][re(ck)] = layout[pk][ck]; }
      setLayout(doc, next);
    }
  }

  /* Delete an element.  Deleting a state also removes transitions that target
     it or its descendants, and repairs the parent's initial attribute. */
  function removeElement(doc, el) {
    if (el === doc.documentElement) return false;
    const parent = el.parentNode;
    if (STATE_TAGS.includes(el.localName)) {
      const gone = new Set([el, ...el.querySelectorAll('state,parallel,final,history')].map(e => e.getAttribute('id')).filter(Boolean));
      el.remove();
      for (const go of Array.from(doc.getElementsByTagName('go'))) {
        const to = go.getAttribute('to');
        if (to == null) continue;
        const parts = to.split(/\s+/).filter(Boolean);
        const kept = parts.filter(p => !gone.has(p));
        if (kept.length === parts.length) continue;
        if (kept.length) go.setAttribute('to', kept.join(' '));
        else go.remove();
      }
      if (parent.nodeType === 1 && gone.has(parent.getAttribute('initial'))) {
        const next = Array.from(parent.children).find(k => ['state', 'parallel', 'final'].includes(k.localName));
        if (next) parent.setAttribute('initial', next.getAttribute('id'));
        else parent.removeAttribute('initial');
      }
    } else el.remove();
    return true;
  }

  /* Change the element type of a state (state ↔ parallel ↔ final ↔ history). */
  function retag(doc, el, kind) {
    if (el.localName === kind) return el;
    const neu = doc.createElement(kind);
    for (const a of Array.from(el.attributes)) if (ATTRS[kind].includes(a.name)) neu.setAttribute(a.name, a.value);
    while (el.firstChild) neu.appendChild(el.firstChild);
    for (const k of Array.from(neu.children)) if (!CHILDREN[kind].includes(k.localName)) k.remove();
    el.replaceWith(neu);
    if (kind === 'state') {
      const first = Array.from(neu.children).find(k => ['state', 'parallel', 'final'].includes(k.localName));
      if (first && !neu.getAttribute('initial')) neu.setAttribute('initial', first.getAttribute('id'));
    }
    return neu;
  }

  function setAttr(el, name, value) {
    if (value == null || value === '') el.removeAttribute(name);
    else el.setAttribute(name, value);
  }

  /* Replace the script text of an element, keeping CDATA when the text needs it. */
  function setScript(doc, el, text) {
    const hadCdata = Array.from(el.childNodes).some(k => k.nodeType === 4);
    while (el.firstChild) el.removeChild(el.firstChild);
    text = String(text).replace(/\s+$/, '');
    if (!text.trim()) return;
    const isXml = el.localName === 'spawn' && el.getAttribute('type') === 'statechart';
    if (hadCdata || isXml) el.appendChild(doc.createCDATASection('\n' + text + '\n'));
    else el.appendChild(doc.createTextNode(/\n/.test(text) ? '\n' + text + '\n' : text));
  }

  function move(el, delta) {
    const sib = el.parentNode ? Array.from(el.parentNode.children).filter(k => k.localName === el.localName) : [];
    const i = sib.indexOf(el), j = i + delta;
    if (j < 0 || j >= sib.length) return false;
    if (delta < 0) sib[j].before(el); else sib[j].after(el);
    return true;
  }

  function blank() {
    return '<statechart version="0.2" initial="idle">\n    <state id="idle"/>\n</statechart>\n';
  }

  global.SXML = {
    STATE_TAGS, SCRIPT_TAGS, ATTRS, CHILDREN, SPAWN_TYPES, SPAWN_REQUIRED,
    parse, build, validate, serialize, locate, collapse, dedent, scriptText, isState, label,
    getLayout, setLayout, addState, addTransition, addItem, renameState, removeElement, retag, setAttr, setScript, move, uniqueId, blank
  };
})(window);
