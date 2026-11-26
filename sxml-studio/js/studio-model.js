/* Editor metadata, descriptions and structural edits. */
(function (global) {
  'use strict';
  const marker = /^\s*<studio>/;
  function metadata(doc) {
    const comment = Array.from(doc.childNodes).find(n => n.nodeType === 8 && marker.test(n.data));
    if (!comment) return { descriptions: {}, notes: [] };
    try {
      const data = JSON.parse(comment.data.replace(marker, ''));
      return { ...data, descriptions: data.descriptions && typeof data.descriptions === 'object' ? data.descriptions : {},
        notes: Array.isArray(data.notes) ? data.notes.filter(n => typeof n === 'string') : [] };
    } catch (_) { return { descriptions: {}, notes: [] }; }
  }
  function setMetadata(doc, value) {
    const comment = Array.from(doc.childNodes).find(n => n.nodeType === 8 && marker.test(n.data));
    // XML comments cannot contain --. JSON Unicode escapes preserve the text exactly.
    const body = ' <studio>\n' + JSON.stringify(value, null, 2).replace(/-/g, '\\u002d').replace(/</g, '\\u003c') + '\n';
    if (comment) comment.data = body;
    else doc.appendChild(doc.createComment(body));
  }
  function candidates(model, active) {
    const seen = new Set(), result = [];
    for (const id of active.slice().sort((a, b) => (model.byId.get(b)?.depth || 0) - (model.byId.get(a)?.depth || 0))) for (let n = model.byId.get(id); n; n = n.parent) {
      if (seen.has(n.key)) continue;
      seen.add(n.key);
      for (const t of n.transitions) if (t.on != null) result.push(t);
    }
    return result;
  }
  function description(el) {
    const comment = Array.from(el.childNodes).find(n => n.nodeType === 8 && /^\s*<description>/.test(n.data));
    if (!comment) return '';
    try { const value = JSON.parse(comment.data.replace(/^\s*<description>/, '')); return typeof value === 'string' ? value : ''; } catch (_) { return ''; }
  }
  function setDescription(doc, el, text) {
    const old = Array.from(el.childNodes).find(n => n.nodeType === 8 && /^\s*<description>/.test(n.data));
    if (!text) { if (old) old.remove(); return; }
    const body = ' <description> ' + JSON.stringify(text).replace(/-/g, '\\u002d').replace(/</g, '\\u003c') + ' ';
    if (old) old.data = body; else el.insertBefore(doc.createComment(body), el.firstChild);
  }
  function duplicate(doc, el) {
    const copy = el.cloneNode(true), used = new Set(Array.from(doc.querySelectorAll('[id]')).map(e => e.getAttribute('id'))), ids = new Map();
    for (const state of [copy, ...copy.querySelectorAll('state,parallel,final,history')]) {
      const old = state.getAttribute('id'); if (!old) continue;
      let id = old + '_copy', count = 2;
      while (used.has(id)) id = old + '_copy' + count++;
      used.add(id); ids.set(old, id); state.setAttribute('id', id);
    }
    for (const node of [copy, ...copy.querySelectorAll('*')]) {
      for (const attr of ['initial', 'to']) if (node.hasAttribute(attr)) node.setAttribute(attr, node.getAttribute(attr).split(/\s+/).map(id => ids.get(id) || id).join(' '));
    }
    SXML.insertChild(el.parentNode, copy); return copy;
  }
  function reparent(doc, el, parent) {
    if (el === doc.documentElement || el === parent || el.contains(parent) || !(SXML.CHILDREN[parent.localName] || []).includes(el.localName)) throw new Error('Invalid destination');
    const previous = el.parentNode;
    SXML.insertChild(parent, el);
    if (previous.getAttribute('initial') === el.getAttribute('id')) {
      const next = Array.from(previous.children).find(c => ['state', 'parallel', 'final'].includes(c.localName));
      if (next) previous.setAttribute('initial', next.getAttribute('id')); else previous.removeAttribute('initial');
    }
    if (['state', 'statechart'].includes(parent.localName) && !parent.hasAttribute('initial') && el.localName !== 'history') parent.setAttribute('initial', el.getAttribute('id'));
    // Coordinates belong to the old containment hierarchy. Independent region
    // choices remain valid, but positional hints are discarded for the move.
    const layout = SXML.getLayout(doc);
    if (layout) {
      for (const key of Object.keys(layout)) if (!key.startsWith('@')) {
        for (const child of Object.keys(layout[key])) if (!child.startsWith('@')) delete layout[key][child];
      }
      SXML.setLayout(doc, layout);
    }
  }
  global.SXMLStudio = {metadata, setMetadata, candidates, description, setDescription, duplicate, reparent};
})(typeof window === 'undefined' ? globalThis : window);
