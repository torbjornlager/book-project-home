/* SXML Studio — statechart diagram: layout (ELK) and SVG rendering.
 *
 * Notation follows the figures of the book's statechart chapter: rounded
 * states with a name compartment, nested states, dashed lines between the
 * regions of a parallel state, a filled dot for the initial state, a circled
 * H for history, and a bullseye for final states.  Targetless transitions,
 * entry/exit actions, deferrals and spawns are listed inside their state.
 */
(function (global) {
  'use strict';
  const SVGNS = 'http://www.w3.org/2000/svg';
  const F_HEAD = '600 12.5px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
  const F_MONO = '11px "SFMono-Regular",Consolas,"Liberation Mono",Menlo,monospace';
  const F_NOTE = '10.5px "SFMono-Regular",Consolas,"Liberation Mono",Menlo,monospace';
  const HEAD_H = 26, LINE_H = 16, PAD = 14, FINAL_R = 11, HIST_R = 13, INIT_R = 5;
  const MAX_LINE = 42, MAX_LABEL = 30, MAX_NOTE = 46, MAX_NOTE_LINES = 8;

  const APPEARANCE_DEFAULTS = Object.freeze({ lineWidth: 1.3, lineColor: null, arrowSize: 8.5, borderWidth: 1.25, labelSize: 11, labelOpacity: 0 });
  function normalizeAppearance(settings = {}) {
    settings = settings || {};
    const number = (key, min, max) => typeof settings[key] === 'number' && Number.isFinite(settings[key]) && settings[key] >= min && settings[key] <= max ? settings[key] : APPEARANCE_DEFAULTS[key];
    return {
      lineWidth: number('lineWidth', 0.5, 4),
      lineColor: typeof settings.lineColor === 'string' && /^#[0-9a-f]{6}$/i.test(settings.lineColor) ? settings.lineColor.toLowerCase() : null,
      arrowSize: number('arrowSize', 5, 16), borderWidth: number('borderWidth', 0.5, 3.5),
      labelSize: number('labelSize', 8, 18), labelOpacity: number('labelOpacity', 0, 1)
    };
  }

  const ctx = document.createElement('canvas').getContext('2d');
  function width(text, font) { ctx.font = font; return Math.ceil(ctx.measureText(text).width); }
  const one = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const cut = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;

  function trigger(t) {
    let s = '';
    if (t.on != null) s = one(t.on);
    else if (t.after != null) s = 'after ' + one(t.after) + 's';
    if (t.cond != null && one(t.cond)) s += (s ? ' ' : '') + '[' + one(t.cond) + ']';
    return s;
  }

  /* In-place editing of a transition label uses the label's own notation:
     "event [guard]", "after 2 [guard]", or "[guard]" alone for an eventless
     transition.  A trailing bracket is a guard only when it starts the text or
     follows a space, as trigger() writes it, so list-valued patterns survive. */
  function editableTrigger(t) {
    let s = t.on != null ? one(t.on) : t.after != null ? 'after ' + one(t.after) : '';
    if (t.cond != null && one(t.cond)) s += (s ? ' ' : '') + '[' + one(t.cond) + ']';
    return s;
  }

  function parseTrigger(text) {
    let s = one(text), cond = null;
    if (s.endsWith(']')) {
      let depth = 0, quote = null;
      for (let i = s.length - 1; i >= 0; i--) {
        const c = s[i];
        if (quote) { if (c === quote) quote = null; continue; }
        if (c === "'" || c === '"') quote = c;
        else if (c === ']') depth++;
        else if (c === '[' && --depth === 0) {
          if (i === 0 || s[i - 1] === ' ') { cond = s.slice(i + 1, -1).trim() || null; s = s.slice(0, i).trim(); }
          break;
        }
      }
    }
    const m = /^after\s+(\d+(?:\.\d*)?|\.\d+)\s*s?$/i.exec(s);
    if (m) return { on: null, after: m[1], cond };
    return { on: s || null, after: null, cond };
  }

  /* What a double-click on a state means: rename it from its name compartment,
     add a child inside the body of an expanded compound or parallel state, and
     otherwise open it in the Inspector. */
  function doubleClickIntent(n, b, point, onName, collapsed) {
    if (!n || n.kind === 'history') return 'open';
    if (n.kind === 'final' || onName) return 'rename';
    if (b && point && point.y <= b.y + HEAD_H) return 'rename';
    if ((n.compound || n.kind === 'parallel') && !collapsed) return 'add';
    return 'open';
  }

  /* Text lines shown inside a state. */
  function compartment(n) {
    const lines = [];
    for (const s of n.spawns) {
      const what = s.el.getAttribute('goal') || s.el.getAttribute('callback') || '';
      lines.push({ kw: 'spawn', text: s.type + (what ? ': ' + one(what) : ''), item: s });
    }
    for (const e of n.onentry) lines.push({ kw: 'entry /', text: one(e.body), item: e });
    for (const d of n.defers) lines.push({ kw: 'defer', text: one(d.on) + (d.cond ? ' [' + one(d.cond) + ']' : ''), item: d });
    if (n.kind !== 'history') {
      for (const t of n.transitions) if (!t.to.length) {
        const trig = (t.source.transitions.length > 1 ? (t.index + 1) + ". " : "") + trigger(t), body = one(t.body);
        lines.push({ kw: trig ? '' : 'always', text: trig + (body ? (trig ? ' / ' : '/ ') + body : ''), item: t, internal: true });
      }
    }
    for (const e of n.onexit) lines.push({ kw: 'exit /', text: one(e.body), item: e });
    for (const l of lines) {
      l.full = (l.kw ? l.kw + ' ' : '') + l.text;
      l.shown = cut(l.full, MAX_LINE);
      l.w = width(l.shown, F_MONO);
    }
    return lines;
  }

  function edgeLabel(t, appearance) {
    const size = appearance.labelSize, lineHeight = size + 3;
    const font = F_MONO.replace('11px', size + 'px');
    const trig = (t.source.transitions.length > 1 ? (t.index + 1) + ". " : "") + trigger(t), body = one(t.body);
    let lines = [];
    if (trig && body && (trig + ' / ' + body).length <= MAX_LABEL) lines = [trig + ' / ' + body];
    else { if (trig) lines.push(trig); if (body) lines.push('/ ' + body); }
    lines = lines.map(l => cut(l, MAX_LABEL));
    return { lines, full: trig + (body ? ' / ' + body : ''), w: Math.max(0, ...lines.map(l => width(l, font))) + 10, h: lines.length * lineHeight + 4, lineHeight, baseline: size + 1.5 };
  }

  /* ---------- ELK graph ---------- */

  const INTERACTIVE = {
    'elk.layered.cycleBreaking.strategy': 'INTERACTIVE',
    'elk.layered.layering.strategy': 'INTERACTIVE',
    'elk.layered.crossingMinimization.strategy': 'INTERACTIVE'
  };

  function canArrangeRegions(model, parallel) {
    const region = node => {
      for (let child = node; child && child !== parallel; child = child.parent) {
        if (child.parent === parallel) return child;
      }
      return null;
    };
    for (const m of [model, ...(model.nested ? model.nested.values() : [])]) {
      for (const transition of m.transitions) {
        const source = region(transition.source);
        for (const id of transition.to) {
          const target = region(m.byId.get(id));
          if ((source || target) && source !== target) return false;
        }
      }
    }
    return true;
  }

  function toElk(model, direction, base, paddingPercent = 100, appearance = APPEARANCE_DEFAULTS, liveDatamodels = new Map(), collapsed = new Set()) {
    const nestedPad = PAD * Math.max(50, Math.min(150, Number(paddingPercent) || 100)) / 100;
    const edges = [];
    const hints = base ? model.layout : null;
    const rootNotes = [];
    const info = new Map();      // elk id -> description
    function noteNode(dm, owner) {
      const live = liveDatamodels.get(dm.key);
      const all = [], changedLines = [];
      if (live) {
        live.facts.forEach((clause, index) => {
          if (index && clause.includes('\n')) { all.push(''); changedLines.push(false); }
          const lines = clause.split('\n');
          all.push(...lines); changedLines.push(...lines.map(() => live.changed[index]));
        });
        if (!all.length) all.push('(no clauses)');
      } else all.push(...dm.body.replace(/\t/g, '    ').split('\n'));
      let lines = all.slice(0, MAX_NOTE_LINES).map(l => cut(l.replace(/\s+$/, ''), MAX_NOTE));
      if (all.length > MAX_NOTE_LINES || live?.truncated) lines.push('… more clauses (hover to view)');
      const w = Math.max(76, ...lines.map(l => width(l, F_NOTE))) + 22;
      const h = 24 + lines.length * 14 + 8;
      info.set(dm.key, { type: 'note', item: dm, lines, live, changedLines, fullText: all.join('\n') });
      return { id: dm.key, width: w, height: h };
    }
    function node(n) {
      const kids = [];
      const lines = n.kind === 'history' || n.kind === 'final' ? [] : compartment(n);
      const headW = width(n.id || '(no id)', F_HEAD) + 30;
      const linesW = lines.length ? Math.max(...lines.map(l => l.w)) + 2 * PAD - 4 : 0;
      const top = HEAD_H + (lines.length ? lines.length * LINE_H + 8 : 0);
      info.set(n.key, { type: n.kind, node: n, lines, top });
      if (n.kind === 'history') return { id: n.key, width: HIST_R * 2, height: HIST_R * 2 };
      if (n.kind === 'final') {
        const entry = n.onentry.map(e => cut('entry / ' + one(e.body), 30));
        const labels = [n.id || '(no id)', ...entry];
        info.get(n.key).labels = labels;
        return {
          id: n.key, width: FINAL_R * 2, height: FINAL_R * 2,
          layoutOptions: { 'elk.nodeLabels.placement': 'OUTSIDE V_BOTTOM H_CENTER' },
          labels: labels.map((t, i) => ({ id: n.key + '/l' + i, text: t, width: width(t, i ? F_NOTE : F_HEAD) + 4, height: 15 }))
        };
      }
      if (collapsed.has(n.key) && n.kind !== 'statechart') {
        info.get(n.key).collapsed = true;
        return {id: n.key, width: Math.max(140, headW, linesW), height: top + 26};
      }
      const realKids = n.children.filter(c => c.kind !== 'history');
      /* Notes of the root are placed outside the layout engine (see run). */
      for (const dm of n.datamodels) { const note = noteNode(dm, n); if (n.kind === 'statechart' && !n.scope) rootNotes.push(note); else kids.push(note); }
      for (const sp of n.spawns) { const nm = model.nested && model.nested.get(sp.key); if (nm) kids.push(node(nm.root)); }
      if ((n.kind === 'statechart' || n.kind === 'state') && n.initial && realKids.some(c => c.id === n.initial)) {
        const id = n.key + '/init';
        kids.push({ id, width: INIT_R * 2, height: INIT_R * 2 });
        info.set(id, { type: 'init', owner: n });
        const target = realKids.find(c => c.id === n.initial);
        edges.push({ id: id + '>', sources: [id], targets: [target.key] });
        info.set(id + '>', { type: 'initEdge', owner: n });
      }
      for (const c of n.children) kids.push(node(c));
      if (n.kind === 'parallel' && realKids.length > 1) {
        for (let i = 0; i + 1 < realKids.length; i++) {
          const id = n.key + '/chain' + i;
          edges.push({ id, sources: [realKids[i].key], targets: [realKids[i + 1].key], layoutOptions: { 'elk.layered.priority.direction': '0' } });
          info.set(id, { type: 'chain' });
        }
      }
      if (hints) {
        const hint = hints[n.key] || {}, me = base.get(n.key);
        kids.forEach((k, i) => {
          const h = hint[k.id], b = base.get(k.id);
          if (h) { k.x = h[0]; k.y = h[1]; }
          else if (b && me) { k.x = b.x - me.x; k.y = b.y - me.y; }
          else { k.x = 100000 + i; k.y = 100000 + i; }
        });
      }
      const requestedDirection = n.kind === 'parallel' ? (model.layout && model.layout[n.key] && model.layout[n.key]['@regions']) || 'DOWN' : null;
      const independent = ['RIGHT', 'DOWN'].includes(requestedDirection) && canArrangeRegions(model, n);
      const inter = { 'elk.direction': independent ? requestedDirection : direction };
      if (n.kind === 'parallel') info.get(n.key).regions = independent ? requestedDirection : direction;
      if (independent) inter['elk.hierarchyHandling'] = 'SEPARATE_CHILDREN';
      if (n.kind === 'statechart' && n.scope) {
        const title = 'statechart · ' + model.nested.get(n.scope).title;
        const minW = width(title, F_NOTE) + 44;
        info.get(n.key).type = 'nested'; info.get(n.key).title = title;
        if (!kids.length) return { id: n.key, width: minW, height: 46 };
        return { id: n.key, children: kids, layoutOptions: {
          'elk.padding': '[top=' + (20 + nestedPad) + ',left=' + nestedPad + ',bottom=' + nestedPad + ',right=' + nestedPad + ']',
          'elk.nodeSize.constraints': 'MINIMUM_SIZE', 'elk.nodeSize.minimum': '(' + minW + ',46)' } };
      }
      if (n.kind === 'statechart') return { id: n.key, children: kids, layoutOptions: Object.assign({ 'elk.padding': '[top=24,left=24,bottom=24,right=24]' }, inter) };
      if (!kids.length) {
        return { id: n.key, width: Math.max(72, headW, linesW), height: top + (lines.length ? 4 : 20) };
      }
      return {
        id: n.key, children: kids,
        layoutOptions: Object.assign({}, inter, {
          'elk.padding': '[top=' + (top + nestedPad) + ',left=' + nestedPad + ',bottom=' + nestedPad + ',right=' + nestedPad + ']',
          'elk.nodeSize.constraints': 'MINIMUM_SIZE',
          'elk.nodeSize.minimum': '(' + Math.max(72, headW, linesW) + ',' + (top + 20) + ')'
        })
      };
    }
    const root = node(model.root);
    function visible(n) {
      let result = n;
      for (let p = n.parent; p; p = p.parent) if (collapsed.has(p.key)) result = p;
      if (n.scope) {
        const owner = model.items.get(n.scope)?.owner;
        for (let p = owner; p; p = p.parent) if (collapsed.has(p.key)) return p;
      }
      return result;
    }
    const all = [model, ...(model.nested ? model.nested.values() : [])];
    for (const m of all) for (const t of m.transitions) {
      if (!t.to.length) continue;
      t.to.forEach((id, i) => {
        const target = m.byId.get(id);
        if (!target) return;
        const sourceNode = visible(t.source), targetNode = visible(target);
        if (sourceNode === targetNode && (sourceNode !== t.source || targetNode !== target)) return;
        const eid = t.key + '>' + i;
        const lab = edgeLabel(t, appearance);
        const e = { id: eid, sources: [sourceNode.key], targets: [targetNode.key] };
        if (lab.lines.length) e.labels = [{ id: eid + '/label', text: lab.full, width: lab.w, height: lab.h }];
        edges.push(e);
        info.set(eid, { type: 'edge', item: t, label: lab, historyDefault: t.source.kind === 'history' });
      });
    }
    for (const edge of edges) {
      if (info.get(edge.id).type !== 'chain') edge.layoutOptions = Object.assign({}, edge.layoutOptions, { 'elk.edge.thickness': String(appearance.lineWidth) });
    }
    root.edges = edges;
    return { graph: root, info, rootNotes };
  }

  // Physical axes stay the same when the chart's flow direction changes.
  function spacingOptions(direction, horizontal = 50, vertical = 50) {
    const h = Math.max(0, Math.min(100, horizontal)) / 100;
    const v = Math.max(0, Math.min(100, vertical)) / 100;
    const along = direction === 'DOWN' ? v : h;
    const across = direction === 'DOWN' ? h : v;
    return {
      'elk.layered.spacing.nodeNodeBetweenLayers': String(48 * along),
      'elk.spacing.nodeNode': String(30 * across),
      'elk.spacing.edgeNode': String(20 * across),
      'elk.spacing.edgeEdge': String(14 * across),
      'elk.layered.spacing.edgeNodeBetweenLayers': String(20 * along),
      'elk.layered.spacing.edgeEdgeBetweenLayers': String(14 * along)
    };
  }

  function normalizeExperiments(settings = {}) {
    return {
      compaction: settings && settings.compaction === 'EDGE_LENGTH' ? 'EDGE_LENGTH' : 'NONE',
      labels: settings && settings.labels === 'SPACE_EFFICIENT_LAYER' ? 'SPACE_EFFICIENT_LAYER' : 'MEDIAN_LAYER',
      order: settings && settings.order === 'NODES_AND_EDGES' ? 'NODES_AND_EDGES' : 'NONE',
      loops: settings && ['0', '5', '10', '20', '40'].includes(settings.loops) ? settings.loops : '10',
      alignment: settings && settings.alignment === 'balanced' ? 'balanced' : 'straight',
      effort: settings && ['1', '7', '20'].includes(settings.effort) ? settings.effort : '7',
      padding: settings && ['50', '100', '150'].includes(settings.padding) ? settings.padding : '100',
      sides: settings && ['SMART_DOWN', 'SMART_UP', 'ALWAYS_UP', 'ALWAYS_DOWN'].includes(settings.sides) ? settings.sides : 'SMART_DOWN'
    };
  }

  function experimentOptions(settings) {
    const value = normalizeExperiments(settings);
    return {
      'elk.layered.compaction.postCompaction.strategy': value.compaction,
      'elk.layered.edgeLabels.centerLabelPlacementStrategy': value.labels,
      'elk.layered.considerModelOrder.strategy': value.order,
      'elk.spacing.nodeSelfLoop': value.loops,
      'elk.layered.nodePlacement.favorStraightEdges': value.alignment === 'straight' ? 'true' : 'false',
      'elk.layered.thoroughness': value.effort,
      'elk.layered.edgeLabels.sideSelection': value.sides,
      'studio.nestedPadding': value.padding
    };
  }

  function globalOptions(direction) {
    return {
      'elk.algorithm': 'layered',
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.direction': direction || 'RIGHT',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.layered.spacing.nodeNodeBetweenLayers': '48',
      'elk.spacing.nodeNode': '30',
      'elk.spacing.edgeNode': '20',
      'elk.spacing.edgeEdge': '14',
      'elk.layered.spacing.edgeNodeBetweenLayers': '20',
      'elk.layered.spacing.edgeEdgeBetweenLayers': '14',
      'elk.spacing.edgeLabel': '3',
      'elk.edgeLabels.placement': 'CENTER',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      'elk.layered.mergeEdges': 'false',
      'elk.layered.cycleBreaking.strategy': 'DEPTH_FIRST',
      'elk.spacing.componentComponent': '34'
    };
  }


  let elk = null;
  async function layout(model, direction, extra) {
    try { return await layoutOnce(model, direction, extra); }
    catch (originalError) {
      const controls = [
        ['elk.layered.considerModelOrder.strategy', ['NODES_AND_EDGES'], 'NONE', 'Source ordering unavailable at these settings; using automatic order.'],
        ['elk.layered.compaction.postCompaction.strategy', ['EDGE_LENGTH'], 'NONE', 'Post-compaction unavailable at these settings; using normal routing.'],
      ].filter(([key, active]) => extra && active.includes(extra[key]));
      if (!controls.length) throw originalError;
      // ELK 0.12.1 rejects some nested-chart and zero-gap combinations.
      // Disable the fewest experimental controls that recover a valid drawing.
      for (let count = 1; count <= controls.length; count++) {
        for (let mask = 1; mask < (1 << controls.length); mask++) {
          const disabled = controls.filter((_, i) => mask & (1 << i));
          if (disabled.length !== count) continue;
          const options = Object.assign({}, extra);
          for (const [key, , value] of disabled) options[key] = value;
          try {
            const geo = await layoutOnce(model, direction, options);
            geo.fallbackNotes = disabled.map(control => control[3]);
            console.warn('ELK layout experiment fallback:', geo.fallbackNotes.join(' '), originalError);
            return geo;
          } catch (_) { /* Try another combination, then surface the original error. */ }
        }
      }
      throw originalError;
    }
  }

  async function layoutOnce(model, direction, extra) {
    if (!elk) elk = new global.ELK();
    const noteKeys = new Set(model.root.datamodels.map(d => d.key));
    const hinted = !!model.layout && Object.keys(model.layout).some(pk => pk[0] !== '@' && Object.keys(model.layout[pk]).some(k => k[0] !== '@' && !(pk === '#root' && noteKeys.has(k))));
    const geo = await run(model, direction, extra, null);
    /* Saved positions are exact: ELK supplies sizes and the positions of
       anything not yet placed, and the saved arrangement is applied on top. */
    return freeLayout(geo, model, hinted);
  }

  /* ---------- free (saved) positions ----------

     A position saved in the <layout> comment is a child's offset in its
     parent's frame: layout[parentKey][childKey] = [x, y].  A parent always
     wraps its children tightly (with its padding and header), so moving a
     child never moves its siblings, and moving it by (dx, dy) adds exactly
     (dx, dy) to its saved offset.  `shift` is how far a parent's top-left
     moved to wrap its children; offsets are corrected by it when drawing. */
  function freeLayout(geo, model, apply) {
    const { boxes, meta } = geo, saved = (model.layout) || {};
    const rel = new Map(), shift = new Map(), size = new Map();
    const rootKey = meta.root;
    function fit(p) {
      const kids = meta.kids.get(p) || [], b = boxes.get(p);
      for (const k of kids) fit(k);
      if (!kids.length) { size.set(p, [b.w, b.h]); shift.set(p, [0, 0]); return; }
      const hint = apply ? (saved[p] || {}) : {};
      const placed = kids.filter(k => Array.isArray(hint[k]) && hint[k].length === 2 && hint[k].every(Number.isFinite));
      for (const k of placed) rel.set(k, hint[k].slice());
      if (placed.length) {
        /* Children without a saved place go in a column beside the placed ones. */
        let right = -Infinity, y = Infinity;
        for (const k of placed) { right = Math.max(right, rel.get(k)[0] - shift.get(k)[0] + size.get(k)[0]); y = Math.min(y, rel.get(k)[1] - shift.get(k)[1]); }
        for (const k of kids) if (!rel.has(k)) { rel.set(k, [right + 40 + shift.get(k)[0], y + shift.get(k)[1]]); y += size.get(k)[1] + 24; }
      } else for (const k of kids) { const c = boxes.get(k); rel.set(k, [c.x - b.x + shift.get(k)[0], c.y - b.y + shift.get(k)[1]]); }
      if (!apply) { size.set(p, [b.w, b.h]); shift.set(p, [0, 0]); return; }
      /* Regions of a parallel state stay in a tidy row or column, in the order
         of their saved positions, so dragging a region reorders it. */
      const pinf = geo.info.get(p);
      if (pinf && pinf.type === 'parallel') {
        const regs = kids.filter(k => { const t = geo.info.get(k); return t && (t.type === 'state' || t.type === 'parallel'); });
        if (regs.length > 1) {
          const down = pinf.regions !== 'RIGHT', ax = down ? 1 : 0;
          const elkSorted = regs.slice().sort((a, c) => boxes.get(a)[down ? 'y' : 'x'] - boxes.get(c)[down ? 'y' : 'x']);
          const e0 = boxes.get(elkSorted[0]), e1 = boxes.get(elkSorted[1]);
          const gap = Math.max(0, down ? e1.y - e0.y - e0.h : e1.x - e0.x - e0.w);
          const order = regs.slice().sort((a, c) => (rel.get(a)[ax] - shift.get(a)[ax]) - (rel.get(c)[ax] - shift.get(c)[ax]));
          /* Each region keeps its place unless the one before it now reaches it. */
          let along = -Infinity;
          for (const k of order) {
            const r = rel.get(k).slice(), sk = shift.get(k), sz = size.get(k);
            const pos = Math.max(r[ax] - sk[ax], along);
            r[ax] = pos + sk[ax]; rel.set(k, r);
            along = pos + sz[ax] + gap;
          }
        }
      }
      const pad = meta.pad.get(p) || { top: 24, left: 24, right: 24, bottom: 24 };
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const k of kids) {
        const [rx, ry] = rel.get(k), [sx, sy] = shift.get(k), [w, h] = size.get(k);
        x0 = Math.min(x0, rx - sx); y0 = Math.min(y0, ry - sy); x1 = Math.max(x1, rx - sx + w); y1 = Math.max(y1, ry - sy + h);
      }
      /* Grow, never shrink, relative to ELK's box, so an unchanged arrangement
         is drawn exactly as ELK drew it. */
      const left = Math.min(0, x0 - pad.left), top = Math.min(0, y0 - pad.top);
      const right = Math.max(b.w, x1 + pad.right), bottom = Math.max(b.h, y1 + pad.bottom);
      shift.set(p, [-left, -top]);
      size.set(p, [right - left, bottom - top]);
    }
    fit(rootKey);
    geo.rel = rel; geo.shift = shift; geo.parentOf = meta.parent;
    if (!apply) return offsetLabels(geo, saved);
    const abs = new Map([[rootKey, [0, 0]]]);
    (function place(p) {
      for (const k of meta.kids.get(p) || []) {
        const a = abs.get(p), r = rel.get(k), sk = shift.get(k), sp = shift.get(p);
        abs.set(k, [a[0] + r[0] - sk[0] + sp[0], a[1] + r[1] - sk[1] + sp[1]]);
        place(k);
      }
    })(rootKey);
    const before = new Map(boxes);
    const next = new Map(boxes);
    for (const [k, a] of abs) { const b = boxes.get(k), sz = size.get(k); next.set(k, Object.assign({}, b, { x: a[0], y: a[1], w: sz[0], h: sz[1] })); }
    /* Saved offsets are rounded to whole pixels at each nesting level, so allow a few pixels' drift. */
    const near = (u, v) => Math.abs(u - v) < 3;
    const same = k => { const a = before.get(k), b = next.get(k); return a && b && near(a.x, b.x) && near(a.y, b.y) && near(a.w, b.w) && near(a.h, b.h); };
    const pairs = new Map();
    for (const e of geo.edges) if (e.source && e.target) { const id = [e.source, e.target].sort().join('|'); pairs.set(id, (pairs.get(id) || []).concat(e)); }
    for (const e of geo.edges) {
      if (!e.source || !e.target || (same(e.source) && same(e.target))) continue;
      const group = pairs.get([e.source, e.target].sort().join('|'));
      routeEdge(e, next.get(e.source), next.get(e.target), group.indexOf(e), group.length);
    }
    geo.boxes = next;
    let width = 0, height = 0;
    for (const b of next.values()) { width = Math.max(width, b.x + b.w + 24); height = Math.max(height, b.y + b.h + 24); }
    geo.width = width; geo.height = height;
    geo.free = true;
    return offsetLabels(geo, saved);
  }

  /* A dragged transition label keeps its offset from where it would sit by
     default, saved with the transition's source: layout[source][edgeId]. */
  function offsetLabels(geo, saved) {
    geo.labelOwner = new Map();
    for (const e of geo.edges) {
      const inf = geo.info.get(e.id);
      if (!inf || !inf.item || !inf.item.source || !e.labels || !e.labels.length) continue;
      const owner = inf.item.source.key;
      geo.labelOwner.set(e.id, owner);
      const off = saved[owner] && saved[owner][e.id];
      if (Array.isArray(off) && off.length === 2 && off.every(Number.isFinite)) {
        const l = e.labels[0];
        e.labels = [Object.assign({}, l, { x: l.x + off[0], y: l.y + off[1], home: { x: l.x + l.w / 2, y: l.y + l.h / 2 } })];
      }
    }
    return geo;
  }

  const contains = (o, i) => i.x >= o.x - 0.5 && i.y >= o.y - 0.5 && i.x + i.w <= o.x + o.w + 0.5 && i.y + i.h <= o.y + o.h + 0.5;
  const isRound = b => b.w === b.h && b.w <= 2 * HIST_R + 0.5;
  /* Where the ray from the centre of b along (vx, vy) leaves b. */
  function exitPoint(b, vx, vy) {
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2, len = Math.hypot(vx, vy) || 1;
    if (isRound(b)) return { x: cx + vx / len * b.w / 2, y: cy + vy / len * b.w / 2 };
    const t = Math.min(vx ? (b.w / 2) / Math.abs(vx) : Infinity, vy ? (b.h / 2) / Math.abs(vy) : Infinity);
    return { x: cx + vx * t, y: cy + vy * t };
  }
  /* The point of the outer box's border nearest to the inner box, and the inner box's matching exit. */
  function nestedRoute(outer, inner, outward) {
    const d = [['left', inner.x - outer.x], ['right', outer.x + outer.w - inner.x - inner.w], ['top', inner.y - outer.y], ['bottom', outer.y + outer.h - inner.y - inner.h]].sort((a, b) => a[1] - b[1])[0][0];
    const cx = inner.x + inner.w / 2, cy = inner.y + inner.h / 2;
    const v = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] }[d];
    const a = exitPoint(inner, v[0], v[1]);
    const b = { left: { x: outer.x, y: cy }, right: { x: outer.x + outer.w, y: cy }, top: { x: cx, y: outer.y }, bottom: { x: cx, y: outer.y + outer.h } }[d];
    return outward ? [a, b] : [b, a];
  }
  function routeEdge(e, s, t, index, count) {
    let pts;
    const off = (index - (count - 1) / 2) * 18;
    if (s === t || (s.x === t.x && s.y === t.y && s.w === t.w)) {
      const k = 22 + index * 12, r = s.x + s.w, top = s.y;
      pts = [{ x: r - 16, y: top }, { x: r - 16, y: top - k }, { x: r + k, y: top - k }, { x: r + k, y: top + 16 }, { x: r, y: top + 16 }];
    } else if (contains(t, s)) pts = nestedRoute(t, s, true);
    else if (contains(s, t)) pts = nestedRoute(s, t, false);
    else {
      const sc = { x: s.x + s.w / 2, y: s.y + s.h / 2 }, tc = { x: t.x + t.w / 2, y: t.y + t.h / 2 };
      const dx = tc.x - sc.x, dy = tc.y - sc.y, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
      if (off) {
        const m = { x: (sc.x + tc.x) / 2 + nx * off * 2, y: (sc.y + tc.y) / 2 + ny * off * 2 };
        pts = [exitPoint(s, m.x - sc.x, m.y - sc.y), m, exitPoint(t, m.x - tc.x, m.y - tc.y)];
      } else pts = [exitPoint(s, dx, dy), exitPoint(t, -dx, -dy)];
    }
    e.points = pts;
    if (e.labels && e.labels.length) {
      const i = Math.floor((pts.length - 1) / 2), a = pts[i], b = pts[i + 1];
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, l = e.labels[0];
      const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
      e.labels = [Object.assign({}, l, horizontal ? { x: mx - l.w / 2, y: my - l.h - 3 } : { x: mx + 5, y: my - l.h / 2 })];
    }
  }

  async function run(model, direction, extra, base) {
    const { 'studio.nestedPadding': paddingPercent = 100, 'studio.appearance': appearanceSettings, 'studio.liveDatamodels': liveDatamodels, 'studio.collapsed': collapsed, ...elkOptions } = extra || {};
    const appearance = normalizeAppearance(appearanceSettings);
    const { graph, info, rootNotes } = toElk(model, direction, base, paddingPercent, appearance, liveDatamodels, collapsed);
    const meta = { root: graph.id, parent: new Map(), kids: new Map(), min: new Map(), pad: new Map() };
    (function scan(n) {
      const o = n.layoutOptions || {};
      const pad = /top=([\d.]+),left=([\d.]+),bottom=([\d.]+),right=([\d.]+)/.exec(o['elk.padding'] || '');
      if (pad) meta.pad.set(n.id, { top: +pad[1], left: +pad[2], bottom: +pad[3], right: +pad[4] });
      const min = /\(([\d.]+),([\d.]+)\)/.exec(o['elk.nodeSize.minimum'] || '');
      meta.min.set(n.id, min ? [+min[1], +min[2]] : [n.width || 0, n.height || 0]);
      meta.kids.set(n.id, (n.children || []).map(c => c.id));
      for (const c of n.children || []) { meta.parent.set(c.id, n.id); scan(c); }
    })(graph);
    const res = await elk.layout(graph, { layoutOptions: Object.assign(globalOptions(direction), elkOptions) });
    const boxes = new Map();
    (function walk(n, ox, oy) {
      const b = { x: ox + (n.x || 0), y: oy + (n.y || 0), w: n.width, h: n.height, labels: n.labels || [] };
      boxes.set(n.id, b);
      for (const c of n.children || []) walk(c, b.x, b.y);
    })(res, 0, 0);
    const edges = [];
    (function collect(n) {
      for (const e of n.edges || []) {
        const c = boxes.get(e.container || n.id) || { x: 0, y: 0 };
        const pts = [];
        for (const s of e.sections || []) {
          pts.push(s.startPoint, ...(s.bendPoints || []), s.endPoint);
        }
        edges.push({
          id: e.id, source: (e.sources || [])[0], target: (e.targets || [])[0], container: e.container || n.id, points: pts.map(p => ({ x: p.x + c.x, y: p.y + c.y })),
          labels: (e.labels || []).map(l => ({ x: l.x + c.x, y: l.y + c.y, w: l.width, h: l.height }))
        });
      }
      for (const c of n.children || []) collect(c);
    })(res);
    /* Root datamodel notes: where the user dropped them, else in a row under the
       chart (or, in a top-down layout, in a column to its right). */
    let width = res.width, height = res.height, x = 24, y = 24;
    const down = direction === 'DOWN';
    const placed = (model.layout && model.layout['#root']) || {};
    const bottom = res.height;
    for (const note of rootNotes) {
      const h = placed[note.id];
      const b = h ? { x: Math.max(4, h[0]), y: Math.max(4, h[1]), w: note.width, h: note.height, labels: [] }
                  : down ? { x: res.width, y, w: note.width, h: note.height, labels: [] }
                  : { x, y: bottom, w: note.width, h: note.height, labels: [] };
      if (!h) { x += note.width + 20; y += note.height + 20; }
      boxes.set(note.id, b);
      width = Math.max(width, b.x + b.w + 24); height = Math.max(height, b.y + b.h + 24);
    }
    return { boxes, edges, info, width, height, appearance, meta };
  }

  /* ---------- SVG helpers ---------- */

  // Anchor the visible marker to the target's upper-left corner, independently
  // of ELK's initial node and route. This must never change layout geometry.
  function initialMarker(target) {
    if (!target) return null;
    const r = INIT_R * 1.25;
    const corner = 13 - 13 / Math.SQRT2;
    const end = isRound(target) ? exitPoint(target, -1, -1) : { x: target.x + corner, y: target.y + corner };
    const dot = isRound(target) ? { x: end.x - 28, y: end.y - 4 } : { x: target.x - 24, y: target.y };
    const start = { x: dot.x + r / Math.SQRT2, y: dot.y - r / Math.SQRT2 };
    const c1 = { x: start.x + 6, y: start.y - 10 }, c2 = { x: end.x - 7, y: end.y - 16 };
    const transform = 'translate(' + end.x + ' ' + end.y + ') scale(0.3) translate(' + (-end.x) + ' ' + (-end.y) + ')';
    return { ...dot, r, transform, path: 'M' + start.x + ' ' + start.y + ' C' + c1.x + ' ' + c1.y + ' ' + c2.x + ' ' + c2.y + ' ' + end.x + ' ' + end.y };
  }

  function el(name, attrs, parent, text) {
    const e = document.createElementNS(SVGNS, name);
    for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }

  function roundedPath(pts, r) {
    if (pts.length < 2) return '';
    let d = 'M' + pts[0].x + ' ' + pts[0].y;
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i - 1], b = pts[i], c = pts[i + 1];
      const l1 = Math.hypot(b.x - a.x, b.y - a.y), l2 = Math.hypot(c.x - b.x, c.y - b.y);
      const rr = Math.min(r, l1 / 2, l2 / 2);
      if (rr < 0.5) { d += ' L' + b.x + ' ' + b.y; continue; }
      const p1 = { x: b.x - (b.x - a.x) / l1 * rr, y: b.y - (b.y - a.y) / l1 * rr };
      const p2 = { x: b.x + (c.x - b.x) / l2 * rr, y: b.y + (c.y - b.y) / l2 * rr };
      d += ' L' + p1.x + ' ' + p1.y + ' Q' + b.x + ' ' + b.y + ' ' + p2.x + ' ' + p2.y;
    }
    const z = pts[pts.length - 1];
    return d + ' L' + z.x + ' ' + z.y;
  }

  /* ---------- the diagram widget ---------- */

  function Diagram(host, handlers) {
    this.host = host;
    this.h = handlers || {};
    this.svg = el('svg', { class: 'chart', tabindex: 0, role: 'img', 'aria-label': 'Statechart diagram' }, host);
    const defs = el('defs', {}, this.svg);
    for (const [id, cls] of [['arrow', 'arrowhead'], ['arrow-init', 'arrowhead'], ['arrow-sel', 'arrowhead sel'], ['arrow-fired', 'arrowhead fired'], ['arrow-mute', 'arrowhead mute']]) {
      const size = id === 'arrow-init' ? 17 : 8.5;
      const m = el('marker', { id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: size, markerHeight: size, orient: 'auto-start-reverse', markerUnits: 'userSpaceOnUse' }, defs);
      if (id === 'arrow-init') m.setAttribute('overflow', 'visible');
      el('path', { d: 'M0 0.8 L10 5 L0 9.2 z', class: cls, transform: id === 'arrow-init' ? 'rotate(-15 10 5)' : null }, m);
    }
    this.view = el('g', {}, this.svg);
    this.tx = 20; this.ty = 20; this.k = 1;
    this.model = null; this.geo = null;
    this.selected = null; this.active = new Set(); this.fired = new Set();
    this.direction = 'RIGHT';
    this.horizontalSpacing = 50; this.verticalSpacing = 50;
    this.layoutExperiments = normalizeExperiments();
    this.appearance = normalizeAppearance();
    this.liveDatamodels = new Map();
    this.collapsed = new Set();
    this.coveredStates = new Set(); this.coveredTransitions = new Set();
    this.applyAppearance(this.appearance);
    this.seq = 0;
    this.userMoved = false;
    this._bind();
  }

  Diagram.prototype.applyAppearance = function (settings) {
    this.appearance = normalizeAppearance(settings);
    const a = this.appearance, style = this.svg.style;
    style.setProperty('--transition-width', a.lineWidth);
    style.setProperty('--state-border-width', a.borderWidth);
    style.setProperty('--transition-label-size', a.labelSize + 'px');
    style.setProperty('--transition-label-opacity', a.labelOpacity);
    style.setProperty('--edge-hit-width', Math.max(12, a.lineWidth + 8));
    if (a.lineColor) style.setProperty('--edge', a.lineColor);
    else style.removeProperty('--edge');
    for (const marker of this.svg.querySelectorAll('marker')) {
      const size = a.arrowSize * (marker.id === 'arrow-init' ? 2 : 1);
      marker.setAttribute('markerWidth', size);
      marker.setAttribute('markerHeight', size);
    }
  };

  Diagram.prototype._apply = function () {
    this.view.setAttribute('transform', 'translate(' + this.tx + ',' + this.ty + ') scale(' + this.k + ')');
    if (this.h.onZoom) this.h.onZoom(this.k);
    this._placeStateBar();
  };

  Diagram.prototype.fit = function () {
    if (!this.geo) return;
    const r = this.host.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const k = Math.min(1.25, (r.width - 24) / this.geo.width, (r.height - 24) / this.geo.height);
    this.k = Math.max(0.2, k);
    this.tx = (r.width - this.geo.width * this.k) / 2;
    this.ty = Math.max(8, (r.height - this.geo.height * this.k) / 2);
    this.userMoved = false;
    this._apply();
  };

  Diagram.prototype.zoomBy = function (f, cx, cy) {
    const r = this.host.getBoundingClientRect();
    if (cx == null) { cx = r.width / 2; cy = r.height / 2; }
    const k = Math.max(0.2, Math.min(3, this.k * f));
    this.tx = cx - (cx - this.tx) * (k / this.k);
    this.ty = cy - (cy - this.ty) * (k / this.k);
    this.k = k; this.userMoved = true;
    this._apply();
  };

  /* `pending` resolves once the latest requested model has been drawn. */
  Diagram.prototype.setModel = function (model, opts) {
    const p = this._setModel(model, opts);
    this.pending = p.catch(() => {});
    return p;
  };

  Diagram.prototype._setModel = async function (model, opts) {
    this.pendingModel = model;
    const seq = ++this.seq;
    const geo = await layout(model, this.direction, Object.assign({}, spacingOptions(this.direction, this.horizontalSpacing, this.verticalSpacing), experimentOptions(this.layoutExperiments), { 'studio.appearance': this.appearance, 'studio.liveDatamodels': this.liveDatamodels, 'studio.collapsed': this.collapsed }));
    if (seq !== this.seq) return;
    const first = !this.geo;
    this.model = model; this.geo = geo;
    this._render();
    if (!(opts && opts.preserveViewport) && (first || (opts && opts.fit) || !this.userMoved)) this.fit();
  };

  Diagram.prototype._render = function () {
    const { boxes, edges, info } = this.geo, model = this.model, g = this.view;
    while (g.firstChild) g.removeChild(g.firstChild);
    this.nodeEls = new Map(); this.edgeEls = new Map(); this.itemEls = new Map(); this.edgeGeo = new Map();
    this.nodeOf = new Map(); this.frameEls = new Map();
    const gStates = el('g', {}, g), gEdges = el('g', {}, g), gLabels = el('g', {}, g);
    const gNotes = el('g', {}, g);       // root notes go on top, so a note dropped onto the chart stays visible
    this.overlay = el('g', {}, g);
    this.handleLayer = el('g', { class: 'handles' }, this.overlay);

    const draw = n => {
      const b = boxes.get(n.key), inf = info.get(n.key);
      if (!b) return;
      if (n.kind === 'statechart' && n.scope) {
        const f = el('g', { class: 'nested', 'data-key': n.scope, 'data-item': n.scope }, gStates);
        el('rect', { class: 'shape', x: b.x, y: b.y, width: b.w, height: b.h, rx: 7 }, f);
        el('path', { class: 'nested-icon', d: 'M' + (b.x + 10) + ' ' + (b.y + 9) + ' h9 v8 h-9 z M' + (b.x + 13) + ' ' + (b.y + 12) + ' h9 v8 h-9 z' }, f);
        el('text', { class: 'note-title', x: b.x + 28, y: b.y + 18 }, f, inf.title.toUpperCase());
        el('title', {}, f, 'Chart spawned by this state · double-click to open it');
        this.frameEls.set(n.scope, f);
      }
      if (n.kind === 'statechart') {
        for (const dm of n.datamodels) this._note(n.scope ? gStates : gNotes, dm, boxes.get(dm.key), info.get(dm.key));
        this._init(gStates, n, boxes);
        n.children.forEach(draw);
        return;
      }
      const grp = el('g', { class: 'state k-' + n.kind + (n.compound ? ' compound' : '') + (n.scope ? ' inner' : ''), 'data-key': n.scope || n.key, 'data-state': n.scope ? null : n.key }, gStates);
      this.nodeEls.set(n.key, grp);
      this.nodeOf.set(n.key, n);
      const description = global.SXMLStudio?.description(n.el);
      if (description) el('title', {}, grp, description);
      if (n.kind === 'history') {
        el('circle', { class: 'shape', cx: b.x + HIST_R, cy: b.y + HIST_R, r: HIST_R }, grp);
        el('text', { class: 'hist', x: b.x + HIST_R, y: b.y + HIST_R + 4.5, 'text-anchor': 'middle' }, grp, n.htype === 'deep' ? 'H*' : 'H');
        el('title', {}, grp, (n.htype === 'deep' ? 'deep' : 'shallow') + ' history "' + n.id + '"');
        return;
      }
      if (n.kind === 'final') {
        const cx = b.x + FINAL_R, cy = b.y + FINAL_R;
        el('circle', { class: 'shape', cx, cy, r: FINAL_R }, grp);
        el('circle', { class: 'final-dot', cx, cy, r: FINAL_R - 4.5 }, grp);
        (inf.labels || []).forEach((t, i) => {
          const lb = b.labels[i];
          const x = lb ? b.x + lb.x + lb.width / 2 : cx, y = lb ? b.y + lb.y + 11.5 : cy + FINAL_R + 14 + i * 15;
          el('text', { class: i ? 'line' : 'name', x, y, 'text-anchor': 'middle' }, grp, t);
        });
        if (n.onentry.length) el('title', {}, grp, n.onentry.map(e => 'entry / ' + one(e.body)).join('\n'));
        return;
      }
      el('rect', { class: 'shape', x: b.x, y: b.y, width: b.w, height: b.h, rx: 13, ry: 13 }, grp);
      if (n.compound || n.kind === 'parallel') {
        el('path', { class: 'state-header', d: 'M' + b.x + ' ' + (b.y + HEAD_H) + 'V' + (b.y + 13) + 'Q' + b.x + ' ' + b.y + ' ' + (b.x + 13) + ' ' + b.y + 'H' + (b.x + b.w - 13) + 'Q' + (b.x + b.w) + ' ' + b.y + ' ' + (b.x + b.w) + ' ' + (b.y + 13) + 'V' + (b.y + HEAD_H) + 'Z' }, grp);
      }
      el('text', { class: 'name', x: b.x + b.w / 2, y: b.y + 17.5, 'text-anchor': 'middle' }, grp, n.id || '(no id)');
      el('line', { class: 'rule', x1: b.x, y1: b.y + HEAD_H, x2: b.x + b.w, y2: b.y + HEAD_H }, grp);
      inf.lines.forEach((l, i) => {
        const y = b.y + HEAD_H + 6 + i * LINE_H;
        const lg = el('g', { class: 'item', 'data-key': n.scope || l.item.key, 'data-item': n.scope || l.item.key }, grp);
        el('rect', { class: 'item-bg', x: b.x + 5, y, width: b.w - 10, height: LINE_H, rx: 3 }, lg);
        const t = el('text', { class: 'line', x: b.x + PAD - 2, y: y + 11.5 }, lg);
        const kw = l.kw && l.shown.startsWith(l.kw) ? l.kw : '';
        if (kw) el('tspan', { class: 'kw' }, t, kw + ' ');
        el('tspan', {}, t, kw ? l.shown.slice(kw.length + 1) : l.shown);
        el('title', {}, lg, l.full);
        if (!n.scope) this.itemEls.set(l.item.key, lg);
      });
      if (inf.lines.length && n.compound) {
        el('line', { class: 'rule soft', x1: b.x, y1: b.y + inf.top, x2: b.x + b.w, y2: b.y + inf.top }, grp);
      }
      if (inf.collapsed) {
        el('text', {class: 'note-title collapse-status', x: b.x + 10, y: b.y + b.h - 8}, grp, '+ ' + n.children.length + ' children');
        return;
      }
      for (const dm of n.datamodels) this._note(gStates, dm, boxes.get(dm.key), info.get(dm.key));
      this._init(gStates, n, boxes);
      if (n.kind === 'parallel') this._regions(grp, n, boxes);
      for (const sp of n.spawns) { const nm = model.nested.get(sp.key); if (nm) draw(nm.root); }
      n.children.forEach(draw);
    };
    draw(model.root);

    for (const e of edges) {
      const inf = info.get(e.id);
      if (!inf || inf.type === 'chain' || e.points.length < 2) continue;
      if (inf.type === 'initEdge') {
        const marker = initialMarker(boxes.get(e.target));
        if (marker) el('path', { class: 'edge init', d: marker.path, transform: marker.transform, 'marker-end': 'url(#arrow-init)' }, gEdges);
        continue;
      }
      const scope = inf.item.scope || null;
      const key = scope || inf.item.key;
      const eventless = inf.item.on == null && inf.item.after == null;
      const grp = el('g', { class: 'transition' + (inf.historyDefault ? ' hdefault' : '') + (eventless ? ' eventless' : '') + (scope ? ' inner' : ''), 'data-key': key, 'data-item': key }, gEdges);
      const d = roundedPath(e.points, 7);
      el('path', { class: 'edge-hit', d }, grp);
      el('path', { class: 'edge', d, 'marker-end': 'url(#arrow)' }, grp);
      let entry = scope ? [] : this.edgeEls.get(key);
      if (!entry) this.edgeEls.set(key, entry = []);
      if (!scope && !this.edgeGeo.has(key)) this.edgeGeo.set(key, []);
      if (!scope) this.edgeGeo.get(key).push({ points: e.points, index: +e.id.slice(e.id.lastIndexOf('>') + 1), fixedTail: inf.historyDefault });
      entry.push(grp);
      const lb = e.labels[0];
      if (lb && inf.label.lines.length) {
        /* A label dragged well away from its arrow gets a faint leader line back to it. */
        if (lb.home && Math.hypot(lb.x + lb.w / 2 - lb.home.x, lb.y + lb.h / 2 - lb.home.y) > Math.max(lb.w, lb.h) * 0.75 + 12) {
          el('line', { class: 'label-leader', x1: lb.x + lb.w / 2, y1: lb.y + lb.h / 2, x2: lb.home.x, y2: lb.home.y }, gLabels);
        }
        const lg = el('g', { class: 'tlabel' + (scope ? ' inner' : ''), 'data-key': key, 'data-item': key, 'data-edge': scope ? null : e.id }, gLabels);
        el('rect', { class: 'tlabel-bg', x: lb.x, y: lb.y, width: lb.w, height: lb.h, rx: 4 }, lg);
        inf.label.lines.forEach((t, i) => el('text', { class: 'line', x: lb.x + 5, y: lb.y + inf.label.baseline + i * inf.label.lineHeight }, lg, t));
        const description = global.SXMLStudio?.description(inf.item.el);
        el('title', {}, lg, inf.label.full + (description ? '\n' + description : ''));
        entry.push(lg);
      }
    }
    this.svg.classList.toggle('empty', !model.root.children.length);
    this._paint();
  };

  Diagram.prototype._note = function (parent, dm, b, inf) {
    if (!b) return;
    const grp = el('g', { class: 'note', 'data-key': dm.scope || dm.key, 'data-item': dm.scope || dm.key, 'data-note': dm.scope ? null : dm.key }, parent);
    const f = 9;
    el('path', { class: 'shape', d: 'M' + b.x + ' ' + b.y + ' h' + (b.w - f) + ' l' + f + ' ' + f + ' v' + (b.h - f) + ' h' + (-b.w) + ' z' }, grp);
    el('path', { class: 'fold', d: 'M' + (b.x + b.w - f) + ' ' + b.y + ' v' + f + ' h' + f }, grp);
    el('text', { class: 'note-title', x: b.x + 10, y: b.y + 15 }, grp, 'DATAMODEL');
    inf.lines.forEach((t, i) => {
      const y = b.y + 32 + i * 14;
      if (inf.live && inf.changedLines[i]) el('rect', {class: 'fact-change', x: b.x + 6, y: y - 11, width: b.w - 12, height: 14, rx: 3}, grp);
      el('text', { class: 'note-line', x: b.x + 10, y, 'xml:space': 'preserve' }, grp, t);
    });
    el('title', {}, grp, inf.fullText + (inf.live?.truncated ? '\n… snapshot limited to 40 clauses' : ''));
    if (!dm.scope) this.itemEls.set(dm.key, grp);
  };

  Diagram.prototype._init = function (parent, n, boxes) {
    if (!boxes.has(n.key + '/init')) return;
    const edge = this.geo.edges.find(e => e.source === n.key + '/init');
    const marker = edge && initialMarker(boxes.get(edge.target));
    if (marker) el('circle', { class: 'init-dot', cx: marker.x, cy: marker.y, r: marker.r, transform: marker.transform }, parent);
  };

  /* Dashed separators between orthogonal regions laid out in a row or column. */
  Diagram.prototype._regions = function (grp, n, boxes) {
    const me = boxes.get(n.key), inf = this.geo.info.get(n.key);
    const rs = n.children.filter(c => c.kind !== 'history').map(c => boxes.get(c.key)).filter(Boolean);
    if (rs.length < 2) return;
    const byX = rs.slice().sort((a, b) => a.x - b.x), byY = rs.slice().sort((a, b) => a.y - b.y);
    const row = byX.every((r, i) => !i || byX[i - 1].x + byX[i - 1].w <= r.x);
    const col = byY.every((r, i) => !i || byY[i - 1].y + byY[i - 1].h <= r.y);
    const top = me.y + inf.top;
    if (row) for (let i = 1; i < byX.length; i++) {
      const x = (byX[i - 1].x + byX[i - 1].w + byX[i].x) / 2;
      el('line', { class: 'region', x1: x, y1: top, x2: x, y2: me.y + me.h }, grp);
    } else if (col) for (let i = 1; i < byY.length; i++) {
      const y = (byY[i - 1].y + byY[i - 1].h + byY[i].y) / 2;
      el('line', { class: 'region', x1: me.x, y1: y, x2: me.x + me.w, y2: y }, grp);
    }
  };

  function infDescendants(n) { return n ? n.children.flatMap(c => [c, ...infDescendants(c)]) : []; }

  /* Selection, active configuration and fired transitions are CSS classes. */
  Diagram.prototype._paint = function () {
    if (!this.nodeEls) return;
    const sel = this.selected;
    for (const [k, g] of this.nodeEls) {
      const n = this.nodeOf.get(k);
      const act = n && n.scope ? (this.activeNested && this.activeNested.get(n.scope)) : this.active;
      g.classList.toggle('selected', k === sel);
      const activeBelow = !!(n && this.collapsed?.has(k) && infDescendants(n).some(c => act?.has(c.id)));
      g.classList.toggle('active', !!(n && n.id && act && act.has(n.id)) || activeBelow);
      g.classList.toggle('covered', !!this.coveredStates?.has(k));
      const label = g.querySelector('.collapse-status');
      if (label) label.textContent = '+ ' + n.children.length + ' children' + (activeBelow ? ' · active inside' : '');
    }
    for (const [k, g] of this.frameEls) g.classList.toggle('selected', k === sel);
    for (const [k, g] of this.itemEls) {
      g.classList.toggle('selected', k === sel);
      g.classList.toggle('fired', this.fired.has(k));
    }
    for (const [k, parts] of this.edgeEls) for (const g of parts) {
      const s = k === sel, f = this.fired.has(k);
      g.classList.toggle('covered', !!this.coveredTransitions?.has(k));
      g.classList.toggle('selected', s);
      g.classList.toggle('fired', f);
      const p = g.querySelector('.edge');
      if (p) p.setAttribute('marker-end', 'url(#' + (f ? 'arrow-fired' : s ? 'arrow-sel' : 'arrow') + ')');
    }
    this.svg.classList.toggle('running', this.running === true);
    this._drawSelectionTools();
  };

  /* Selected-state affordances: a handle on each side (click to add a
     connected state in that direction, drag to connect or to place a new
     state) and a small floating toolbar of state actions. */
  Diagram.prototype._editable = function () { return !this.running && !this.readOnly && !!this.h.onHandle; };

  Diagram.prototype._drawSelectionTools = function () {
    const layer = this.handleLayer;
    if (!layer) return;
    while (layer.firstChild) layer.removeChild(layer.firstChild);
    const key = this.selected, n = key && this.nodeOf && this.nodeOf.get(key), b = n && this.geo && this.geo.boxes.get(key);
    const ok = !!(b && !n.scope && this._editable() && this.nodeEls.has(key));
    if (ok && (n.kind === 'state' || n.kind === 'parallel')) {
      const mid = { up: [b.x + b.w / 2, b.y], right: [b.x + b.w, b.y + b.h / 2], down: [b.x + b.w / 2, b.y + b.h], left: [b.x, b.y + b.h / 2] };
      const titles = { up: 'above', right: 'to the right', down: 'below', left: 'to the left' };
      for (const dir of Object.keys(mid)) {
        const g = el('g', { class: 'handle', 'data-handle': dir, 'data-source': key }, layer);
        el('circle', { class: 'handle-hit', cx: mid[dir][0], cy: mid[dir][1], r: 11 }, g);
        el('circle', { class: 'handle-dot', cx: mid[dir][0], cy: mid[dir][1], r: 5 }, g);
        el('title', {}, g, 'Click: new transition to a new state ' + titles[dir] + ' · drag: connect to a state, or drop on empty space');
      }
    }
    this._stateBarKey = ok ? key : null;
    this._renderStateBar();
  };

  Diagram.prototype._renderStateBar = function () {
    const key = this._stateBarKey;
    const actions = key && this.h.stateActions ? this.h.stateActions(key) : [];
    if (!actions.length) { if (this.stateBar) this.stateBar.hidden = true; return; }
    if (!this.stateBar) {
      this.stateBar = document.createElement('div');
      this.stateBar.className = 'state-bar';
      this.stateBar.setAttribute('role', 'toolbar');
      this.stateBar.setAttribute('aria-label', 'State actions');
      this.stateBar.addEventListener('pointerdown', ev => ev.stopPropagation());
      this.host.append(this.stateBar);
    }
    const bar = this.stateBar;
    bar.replaceChildren();
    for (const a of actions) {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.title = a.label; btn.setAttribute('aria-label', a.label); btn.dataset.action = a.id;
      const icon = global.SXMLChrome && global.SXMLChrome.icon ? global.SXMLChrome.icon(a.icon) : null;
      if (icon) btn.append(icon); else btn.textContent = a.text || a.label[0];
      btn.onclick = () => this.h.onStateAction(key, a.id);
      bar.append(btn);
    }
    bar.hidden = false;
    this._placeStateBar();
  };

  Diagram.prototype._placeStateBar = function () {
    const bar = this.stateBar;
    if (!bar || bar.hidden || !this._stateBarKey) return;
    const r = this.boxRect(this._stateBarKey);
    if (!r) { bar.hidden = true; return; }
    const w = bar.offsetWidth || 180, hgt = bar.offsetHeight || 32, host = this.host.getBoundingClientRect();
    let top = r.top - hgt - 14;
    if (top < 4) top = r.top + r.height + 14;
    const left = Math.max(4, Math.min(r.left + r.width / 2 - w / 2, host.width - w - 4));
    bar.style.left = left + 'px'; bar.style.top = top + 'px';
  };

  Diagram.prototype.select = function (key) { this.selected = key; this._paint(); };
  Diagram.prototype.setDatamodelFacts = function (updates) {
    for (const update of updates) {
      const counts = new Map();
      for (const fact of this.liveDatamodels.get(update.key)?.facts || []) counts.set(fact, (counts.get(fact) || 0) + 1);
      const changed = update.facts.map(fact => {
        const count = counts.get(fact) || 0;
        if (count) counts.set(fact, count - 1);
        return !count;
      });
      this.liveDatamodels.set(update.key, {facts: update.facts.slice(), truncated: update.truncated, changed});
    }
    const model = this.pendingModel || this.model;
    return model ? this.setModel(model, {preserveViewport: true}) : Promise.resolve();
  };

  Diagram.prototype.setRun = function (running, activeIds, firedKeys, nested) {
    if (!running && this.liveDatamodels.size) {
      this.liveDatamodels.clear();
      const model = this.pendingModel || this.model;
      if (model) this.setModel(model, {preserveViewport: true}).catch(error => console.warn('Could not clear live facts:', error));
    }
    this.running = running;
    this.active = new Set(activeIds || []);
    this.fired = new Set(firedKeys || []);
    this.activeNested = new Map();
    if (running && nested) for (const [k, ids] of nested) this.activeNested.set(k, new Set(ids));
    this._paint();
  };

  Diagram.prototype._point = function (ev) {
    const r = this.host.getBoundingClientRect();
    return { x: (ev.clientX - r.left - this.tx) / this.k, y: (ev.clientY - r.top - this.ty) / this.k };
  };

  Diagram.prototype._bind = function () {
    const svg = this.svg;
    let drag = null;
    const last = { key: null, time: 0 };
    svg.addEventListener('wheel', ev => {
      ev.preventDefault();
      this.closeEditor(true);
      const r = this.host.getBoundingClientRect();
      if (ev.ctrlKey || ev.metaKey) {
        this.zoomBy(Math.exp(-ev.deltaY * 0.01), ev.clientX - r.left, ev.clientY - r.top);
      } else {
        this.tx -= ev.deltaX; this.ty -= ev.deltaY; this.userMoved = true; this._apply();
      }
    }, { passive: false });

    svg.addEventListener('pointerdown', ev => {
      if (ev.button !== 0) return;
      svg.focus({ preventScroll: true });
      const stateEl = ev.target.closest('[data-state]');
      const handleEl = ev.target.closest('[data-handle]');
      if (handleEl && this._editable()) {
        drag = { type: 'handle', source: handleEl.getAttribute('data-source'), dir: handleEl.getAttribute('data-handle'), start: this._point(ev), x: ev.clientX, y: ev.clientY, moved: false };
        svg.setPointerCapture(ev.pointerId);
        ev.preventDefault();
        return;
      }
      if (this.tool === 'connect' && stateEl && !this.running && !this.readOnly) {
        const key = stateEl.getAttribute('data-state');
        const start = this._point(ev);
        drag = { type: 'connect', source: key, start, line: el('path', { class: 'rubber', 'marker-end': 'url(#arrow-sel)' }, this.overlay) };
        svg.setPointerCapture(ev.pointerId);
        ev.preventDefault();
        return;
      }
      const labelEl = ev.target.closest('[data-edge]');
      if (labelEl && this._editable() && this.h.onMoveLabel && this.tool !== 'connect') {
        drag = { type: 'label', edge: labelEl.getAttribute('data-edge'), el: labelEl, x: ev.clientX, y: ev.clientY, moved: false, target: ev.target };
        svg.setPointerCapture(ev.pointerId);
        return;
      }
      const object = ev.target.closest('[data-key]') || ev.target.closest('.edge');
      const noteEl = ev.target.closest('[data-note]');
      const movable = (stateEl || noteEl) && !this.running && !this.readOnly && this.h.onMove;
      drag = { type: movable ? 'move' : object ? 'object' : 'pan', key: movable ? (noteEl ? noteEl.getAttribute('data-note') : stateEl.getAttribute('data-state')) : null, x: ev.clientX, y: ev.clientY, tx: this.tx, ty: this.ty, moved: false, target: ev.target };
      svg.setPointerCapture(ev.pointerId);
    });
    svg.addEventListener('pointermove', ev => {
      if (!drag) return;
      if (drag.type === 'object') {
        if (Math.hypot(ev.clientX - drag.x, ev.clientY - drag.y) >= 5) drag.moved = true;
        return;
      }
      if (drag.type === 'label') {
        const dx = (ev.clientX - drag.x) / this.k, dy = (ev.clientY - drag.y) / this.k;
        if (!drag.moved && Math.hypot(dx, dy) * this.k < 4) return;
        drag.moved = true; svg.classList.add('moving');
        drag.dx = dx; drag.dy = dy;
        drag.el.setAttribute('transform', 'translate(' + dx + ',' + dy + ')');
        return;
      }
      if (drag.type === 'move') {
        const dx = (ev.clientX - drag.x) / this.k, dy = (ev.clientY - drag.y) / this.k;
        if (!drag.moved && Math.hypot(dx, dy) * this.k < 5) return;
        const b = this.geo.boxes.get(drag.key);
        if (!drag.moved) { drag.moved = true; svg.classList.add('moving'); drag.ghost = el('rect', { class: 'ghost', width: b.w, height: b.h, rx: 13 }, this.overlay); }
        drag.dx = dx; drag.dy = dy;
        drag.ghost.setAttribute('x', b.x + dx); drag.ghost.setAttribute('y', b.y + dy);
      } else if (drag.type === 'pan') {
        const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
        if (!drag.moved && Math.hypot(dx, dy) < 4) return;
        drag.moved = true; svg.classList.add('panning');
        this.tx = drag.tx + dx; this.ty = drag.ty + dy; this.userMoved = true; this._apply();
      } else {
        if (drag.type === 'handle' && !drag.moved) {
          if (Math.hypot(ev.clientX - drag.x, ev.clientY - drag.y) < 6) return;
          drag.moved = true; svg.classList.add('moving');
        }
        const p = this._point(ev);
        if (!drag.line) drag.line = el('path', { class: 'rubber', 'marker-end': 'url(#arrow-sel)' }, this.overlay);
        const from = drag.start, to = p;
        drag.line.setAttribute('d', 'M' + from.x + ' ' + from.y + ' L' + to.x + ' ' + to.y);
        const over = this._stateAt(ev);
        if (drag.over !== over) {
          if (drag.over && this.nodeEls.get(drag.over)) this.nodeEls.get(drag.over).classList.remove('drop');
          drag.over = over;
          if (over && this.nodeEls.get(over)) this.nodeEls.get(over).classList.add('drop');
        }
      }
    });
    const finish = ev => {
      if (!drag) return;
      const d = drag; drag = null;
      svg.classList.remove('panning');
      try { svg.releasePointerCapture(ev.pointerId); } catch (e) { /* not captured */ }
      if (d.type === 'label' && d.moved) {
        svg.classList.remove('moving');
        if (ev.type === 'pointerup') this.h.onMoveLabel(d.edge, d.dx, d.dy);
        else d.el.removeAttribute('transform');
        return;
      }
      if (d.type === 'handle') {
        svg.classList.remove('moving');
        if (d.line) d.line.remove();
        if (d.over && this.nodeEls.get(d.over)) this.nodeEls.get(d.over).classList.remove('drop');
        if (ev.type !== 'pointerup') return;
        if (!d.moved) { this.h.onHandle(d.source, d.dir, null); return; }
        const over = this._stateAt(ev);
        if (over) this.h.onConnect(d.source, over, { inPlace: true });
        else this.h.onHandle(d.source, d.dir, this._point(ev));
        return;
      }
      if (d.type === 'connect') {
        if (d.line) d.line.remove();
        if (d.over && this.nodeEls.get(d.over)) this.nodeEls.get(d.over).classList.remove('drop');
        const over = ev.type === 'pointerup' && d.line ? this._stateAt(ev) : null;
        if (over && d.type === 'connect' && this.h.onConnect) this.h.onConnect(d.source, over);
        return;
      }
      if (d.type === 'move' && d.moved) {
        svg.classList.remove('moving');
        d.ghost.remove();
        if (ev.type === 'pointerup') this.h.onMove(d.key, d.dx, d.dy);
        return;
      }
      if (d.moved || ev.type !== 'pointerup') return;
      const t = d.target.closest ? d.target.closest('[data-key]') : null;
      const key = t ? t.getAttribute('data-key') : '#root';
      /* Pointer capture retargets native dblclick to the svg, so detect it here. */
      const now = Date.now(), twice = last.key === key && now - last.time < 450;
      last.key = key; last.time = twice ? 0 : now;
      if (twice && this.h.onDouble) {
        const point = this._point(ev), cls = d.target.classList;
        this.h.onDouble(key, { point, anchor: t, onName: !!(cls && cls.contains('name')) });
      } else if (twice && key !== '#root' && this.h.onOpen) this.h.onOpen(key);
      else if (this.h.onSelect) this.h.onSelect(key, ev);
    };
    svg.addEventListener('pointerup', finish);
    svg.addEventListener('pointercancel', finish);
    svg.addEventListener('keydown', ev => { if (this.h.onKey) this.h.onKey(ev); });
  };

  /* Saved positions (see freeLayout): every drawn child's offset in its
     parent's frame, merged into a copy of `layout`. */
  Diagram.prototype.positions = function (layout) {
    const out = Object.assign({}, layout || {});
    if (!this.geo || !this.geo.rel) return out;
    for (const [k, r] of this.geo.rel) {
      const p = this.geo.parentOf.get(k);
      if (!p) continue;
      out[p] = Object.assign({}, out[p] || {});
      if (!Array.isArray(out[p][k])) out[p][k] = [Math.round(r[0]), Math.round(r[1])];
    }
    return out;
  };
  /* The saved offset that puts a new, childless node's top-left at (x, y). */
  Diagram.prototype.offsetAt = function (parentKey, x, y) {
    const b = this.geo && this.geo.boxes.get(parentKey), sh = (this.geo && this.geo.shift && this.geo.shift.get(parentKey)) || [0, 0];
    return b ? [Math.round(x - b.x - sh[0]), Math.round(y - b.y - sh[1])] : [Math.round(x), Math.round(y)];
  };
  Diagram.prototype.offsetOf = function (key) {
    const r = this.geo && this.geo.rel && this.geo.rel.get(key);
    return r ? r.slice() : null;
  };

  /* Centre a box in the view, zooming so that it fills about half of it. */
  Diagram.prototype.zoomTo = function (key) {
    const b = this.geo && this.geo.boxes.get(key);
    if (!b) return;
    const r = this.host.getBoundingClientRect();
    this.k = Math.max(0.2, Math.min(2, (r.width * 0.5) / b.w, (r.height * 0.5) / b.h));
    this.tx = r.width / 2 - (b.x + b.w / 2) * this.k; this.ty = r.height / 2 - (b.y + b.h / 2) * this.k;
    this.userMoved = true; this._apply();
  };

  /* Screen rectangle of a diagram box, relative to the host. */
  Diagram.prototype.boxRect = function (key, header) {
    const b = this.geo && this.geo.boxes.get(key);
    if (!b) return null;
    return { left: b.x * this.k + this.tx, top: b.y * this.k + this.ty, width: b.w * this.k, height: (header ? Math.min(b.h, HEAD_H) : b.h) * this.k };
  };

  /* A one-line text field over part of the drawing.  Enter or leaving the
     field commits; Escape cancels.  Redrawing the diagram cancels it. */
  Diagram.prototype.editInPlace = function (where, value, opts) {
    this.closeEditor();
    opts = opts || {};
    const hostRect = this.host.getBoundingClientRect();
    let r = where && where.getBoundingClientRect ? where.getBoundingClientRect() : where;
    if (!r) return null;
    if (where && where.getBoundingClientRect) r = { left: r.left - hostRect.left, top: r.top - hostRect.top, width: r.width, height: r.height };
    const box = document.createElement('div');
    box.className = 'inplace';
    const field = document.createElement('input');
    field.value = value || '';
    field.spellcheck = false;
    field.autocomplete = 'off';
    field.setAttribute('aria-label', opts.label || 'Edit');
    if (opts.placeholder) field.placeholder = opts.placeholder;
    const w = Math.max(opts.minWidth || 140, r.width + 16);
    const left = Math.max(4, Math.min(r.left + r.width / 2 - w / 2, hostRect.width - w - 4));
    const top = Math.max(4, Math.min(r.top + r.height / 2 - 14, hostRect.height - 32));
    Object.assign(box.style, { left: left + 'px', top: top + 'px', width: w + 'px' });
    box.append(field);
    if (opts.hint) { const hint = document.createElement('div'); hint.className = 'inplace-hint'; hint.textContent = opts.hint; box.append(hint); }
    let done = false;
    const close = save => {
      if (done) return;
      done = true;
      if (this.editor === box) this.editor = null;
      box.remove();
      if (save && opts.onCommit) opts.onCommit(field.value);
      else if (!save && opts.onCancel) opts.onCancel();
      if (!save || !opts.keepFocus) this.svg.focus({ preventScroll: true });
    };
    box.close = close;
    field.addEventListener('keydown', ev => {
      ev.stopPropagation();
      if (ev.key === 'Enter') { ev.preventDefault(); close(true); }
      else if (ev.key === 'Escape') { ev.preventDefault(); close(false); }
    });
    field.addEventListener('blur', () => close(true));
    this.host.append(box);
    this.editor = box;
    field.focus();
    field.select();
    return field;
  };

  Diagram.prototype.closeEditor = function (save) {
    if (this.editor) this.editor.close(!!save);
  };

  Diagram.prototype._stateAt = function (ev) {
    const prev = this.overlay.style.pointerEvents;
    this.overlay.style.pointerEvents = 'none';
    const hit = document.elementFromPoint(ev.clientX, ev.clientY);
    this.overlay.style.pointerEvents = prev;
    const s = hit && hit.closest ? hit.closest('[data-state]') : null;
    return s ? s.getAttribute('data-state') : null;
  };

  /* Bring an element into view if it lies outside the visible area. */
  Diagram.prototype.reveal = function (key) {
    const b = this.geo && this.geo.boxes.get(key);
    if (!b) return;
    const r = this.host.getBoundingClientRect();
    const x0 = b.x * this.k + this.tx, y0 = b.y * this.k + this.ty, x1 = x0 + b.w * this.k, y1 = y0 + b.h * this.k;
    if (x0 >= 0 && y0 >= 0 && x1 <= r.width && y1 <= r.height) return;
    this.tx += r.width / 2 - (x0 + x1) / 2; this.ty += r.height / 2 - (y0 + y1) / 2;
    this._apply();
  };

  /* Standalone SVG text of the current drawing (for export). */
  Diagram.prototype.exportSVG = function (cssText) {
    const clone = this.svg.cloneNode(true);
    clone.setAttribute('xmlns', SVGNS);
    clone.setAttribute('viewBox', '0 0 ' + Math.ceil(this.geo.width) + ' ' + Math.ceil(this.geo.height));
    clone.setAttribute('width', Math.ceil(this.geo.width));
    clone.setAttribute('height', Math.ceil(this.geo.height));
    clone.removeAttribute('tabindex');
    clone.lastChild.removeAttribute('transform');
    for (const o of clone.querySelectorAll('.handle,.rubber,.ghost,.end')) o.remove();
    const notes = global.SXMLStudio?.metadata(this.model.doc).notes || [];
    if (notes.length) {
      let y = Math.ceil(this.geo.height) + 16;
      const group = el('g', {}, clone);
      for (const note of notes) {
        const lines = note.split('\n').flatMap(line => line.match(/.{1,60}(?:\s|$)|\S{1,60}/g) || ['']);
        const w = Math.min(560, Math.max(180, ...lines.map(line => width(line, F_NOTE) + 24))), height = lines.length * 16 + 20;
        el('rect', {x: 16, y, width: w, height, rx: 4, fill: 'var(--note)', stroke: 'var(--stroke)'}, group);
        lines.forEach((line, i) => el('text', {class: 'note-line', x: 28, y: y + 18 + i * 16}, group, line));
        y += height + 12;
      }
      const w = Math.max(600, Math.ceil(this.geo.width));
      clone.setAttribute('viewBox', '0 0 ' + w + ' ' + y); clone.setAttribute('width', w); clone.setAttribute('height', y);
    }
    const style = document.createElementNS(SVGNS, 'style');
    style.textContent = cssText;
    clone.insertBefore(style, clone.firstChild);
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
  };

  global.SXMLDiagram = { Diagram, layout, trigger, editableTrigger, parseTrigger, doubleClickIntent, spacingOptions, normalizeExperiments, experimentOptions, normalizeAppearance, APPEARANCE_DEFAULTS, canArrangeRegions };
})(window);
