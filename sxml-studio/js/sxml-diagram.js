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
  let nextHeaderClip = 0;
  const F_HEAD = '600 12.5px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
  const F_MONO = '11px "SFMono-Regular",Consolas,"Liberation Mono",Menlo,monospace';
  const F_NOTE = '10.5px "SFMono-Regular",Consolas,"Liberation Mono",Menlo,monospace';
  const HEAD_H = 26, LINE_H = 16, PAD = 14, FINAL_R = 11, HIST_R = 13, INIT_R = 5;
  const MAX_LINE = 42, MAX_LABEL = 30, MAX_NOTE = 46, MAX_NOTE_LINES = 48, NOTE_TOP = 38;

  const APPEARANCE_DEFAULTS = Object.freeze({ lineWidth: 1.3, lineColor: null, arrowSize: 8.5, borderWidth: 1.25, labelSize: 11, labelOpacity: 0, headerColor: '#f5f5f5', activeHeaderColor: '#e6f3ee', darkHeaderColor: '#2b343a', darkActiveHeaderColor: '#203f34' });
  function normalizeAppearance(settings = {}) {
    settings = settings || {};
    const number = (key, min, max) => typeof settings[key] === 'number' && Number.isFinite(settings[key]) && settings[key] >= min && settings[key] <= max ? settings[key] : APPEARANCE_DEFAULTS[key];
    const color = key => typeof settings[key] === 'string' && /^#[0-9a-f]{6}$/i.test(settings[key]) ? settings[key].toLowerCase() : APPEARANCE_DEFAULTS[key];
    return {
      headerColor: color('headerColor'), activeHeaderColor: color('activeHeaderColor'),
      darkHeaderColor: color('darkHeaderColor'), darkActiveHeaderColor: color('darkActiveHeaderColor'),
      lineWidth: number('lineWidth', 0.5, 4),
      lineColor: typeof settings.lineColor === 'string' && /^#[0-9a-f]{6}$/i.test(settings.lineColor) ? settings.lineColor.toLowerCase() : null,
      arrowSize: number('arrowSize', 5, 16), borderWidth: number('borderWidth', 0.5, 3.5),
      labelSize: number('labelSize', 8, 18), labelOpacity: number('labelOpacity', 0, 1)
    };
  }

  // Keep the selected hue and saturation: darker on light backgrounds, brighter on dark ones.
  function activeStrokeColor(color, dark = false) {
    if (dark && color === APPEARANCE_DEFAULTS.darkActiveHeaderColor) return '#76c7a4';
    const [r, g, b] = color.slice(1).match(/../g).map(hex => parseInt(hex, 16) / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
    const lightness = (max + min) / 2;
    let hue = 0, saturation = 0;
    if (delta) {
      saturation = delta / (1 - Math.abs(2 * lightness - 1));
      hue = max === r ? ((g - b) / delta + 6) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
      hue *= 60;
    }
    return 'hsl(' + hue.toFixed(2) + ' ' + Math.min(100, saturation * 120).toFixed(2) + '% ' + ((dark ? lightness + (1 - lightness) * 0.5 : lightness * 0.6) * 100).toFixed(2) + '%)';
  }

  const ctx = document.createElement('canvas').getContext('2d');
  function width(text, font) { ctx.font = font; return Math.ceil(ctx.measureText(text).width); }
  function emptyStateSize(id) {
    return { width: Math.max(72, width(id || '(no id)', F_HEAD) + 30), height: HEAD_H + 20 };
  }
  const one = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const cut = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;

  function trigger(t) {
    let s = '';
    if (t.on != null) s = one(t.on);
    else if (t.after != null) s = 'after ' + one(t.after);
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
        const trig = (t.source.transitions.length > 1 ? (t.index + 1) + "." : "") + trigger(t), body = one(t.body);
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
    const trig = (t.source.transitions.length > 1 ? (t.index + 1) + "." : "") + trigger(t), body = one(t.body);
    let lines = [];
    if (trig && body && (trig + ' / ' + body).length <= MAX_LABEL) lines = [trig + ' / ' + body];
    else { if (trig) lines.push(trig); if (body) lines.push('/ ' + body); }
    lines = lines.map(l => cut(l, MAX_LABEL));
    return { lines, full: trig + (body ? ' / ' + body : ''), w: Math.max(0, ...lines.map(l => width(l, font))) + 10, h: lines.length * lineHeight + 4, lineHeight, baseline: size + 1.5 };
  }

  /* ---------- ELK graph ---------- */

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

  function toElk(model, direction, paddingPercent = 100, appearance = APPEARANCE_DEFAULTS, liveDatamodels = new Map(), collapsed = new Set(), spacing = null) {
    const nestedPad = PAD * Math.max(50, Math.min(150, Number(paddingPercent) || 100)) / 100;
    const edges = [];
    const rootNotes = [];
    const info = new Map();      // elk id -> description
    function noteNode(dm, owner) {
      const live = liveDatamodels.get(dm.key);
      const all = [], changedLines = [];
      if (live) {
        live.facts.forEach((clause, index) => {
          if (index) { all.push(''); changedLines.push(false); }
          const lines = clause.split('\n');
          all.push(...lines); changedLines.push(...lines.map(() => live.changed[index]));
        });
        if (!all.length) all.push('(no clauses)');
      } else all.push(...dm.body.replace(/\t/g, '    ').split('\n'));
      let lines = all.slice(0, MAX_NOTE_LINES).map(l => cut(l.replace(/\s+$/, ''), MAX_NOTE));
      if (all.length > MAX_NOTE_LINES || live?.truncated) lines.push('… more clauses (hover to view)');
      const w = Math.max(76, ...lines.map(l => width(l, F_NOTE))) + 22;
      const h = NOTE_TOP + lines.length * 14;
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
      const requestedDirection = n.kind === 'parallel' ? (model.layout && model.layout[n.key] && model.layout[n.key]['@regions']) || 'DOWN' : null;
      const independent = ['RIGHT', 'DOWN'].includes(requestedDirection) && canArrangeRegions(model, n);
      const localDirection = independent ? requestedDirection : direction;
      const inter = { 'elk.direction': localDirection };
      if (spacing) {
        const localSpacing = spacingOptions(localDirection, spacing.horizontal, spacing.vertical);
        delete localSpacing['studio.spacing'];
        Object.assign(inter, localSpacing);
      }
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
        if (!lines.length) return Object.assign({ id: n.key }, emptyStateSize(n.id));
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
      'studio.spacing': { horizontal: h * 100, vertical: v * 100 },
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
      // Disable the fewest layout options that recover a valid drawing.
      for (let count = 1; count <= controls.length; count++) {
        for (let mask = 1; mask < (1 << controls.length); mask++) {
          const disabled = controls.filter((_, i) => mask & (1 << i));
          if (disabled.length !== count) continue;
          const options = Object.assign({}, extra);
          for (const [key, , value] of disabled) options[key] = value;
          try {
            const geo = await layoutOnce(model, direction, options);
            geo.fallbackNotes = disabled.map(control => control[3]);
            console.warn('ELK layout fallback:', geo.fallbackNotes.join(' '), originalError);
            return geo;
          } catch (_) { /* Try another combination, then surface the original error. */ }
        }
      }
      throw originalError;
    }
  }

  async function layoutOnce(model, direction, extra) {
    if (!elk) elk = new global.ELK();
    return run(model, direction, extra);
  }

  async function run(model, direction, extra) {
    const { 'studio.spacing': spacing, 'studio.nestedPadding': paddingPercent = 100, 'studio.appearance': appearanceSettings, 'studio.liveDatamodels': liveDatamodels, 'studio.collapsed': collapsed, ...elkOptions } = extra || {};
    const appearance = normalizeAppearance(appearanceSettings);
    const { graph, info, rootNotes } = toElk(model, direction, paddingPercent, appearance, liveDatamodels, collapsed, spacing);
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
    /* Root datamodel notes follow the chart: a row below or a column to its right. */
    let width = res.width, height = res.height, x = 24, y = 24;
    const down = direction === 'DOWN';
    const bottom = res.height;
    for (const note of rootNotes) {
      const b = down ? { x: res.width, y, w: note.width, h: note.height, labels: [] }
                  : { x, y: bottom, w: note.width, h: note.height, labels: [] };
      x += note.width + 20; y += note.height + 20;
      boxes.set(note.id, b);
      width = Math.max(width, b.x + b.w + 24); height = Math.max(height, b.y + b.h + 24);
    }
    return { boxes, edges, info, width, height, appearance };
  }

  /* ---------- SVG helpers ---------- */

  function el(name, attrs, parent, text) {
    if (name === 'title' && parent) {
      const full = [parent.getAttribute('data-tooltip'), text].filter(Boolean).join('\n\n');
      parent.setAttribute('data-tooltip', full);
      parent.setAttribute('aria-label', full);
      return parent;
    }
    const e = document.createElementNS(SVGNS, name);
    for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }

  function stateHeaderPath(b) {
    return 'M' + b.x + ' ' + (b.y + HEAD_H) + 'V' + (b.y + 13) + 'A13 13 0 0 1 ' + (b.x + 13) + ' ' + b.y + 'H' + (b.x + b.w - 13) + 'A13 13 0 0 1 ' + (b.x + b.w) + ' ' + (b.y + 13) + 'V' + (b.y + HEAD_H) + 'Z';
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
    for (const [id, cls] of [['arrow', 'arrowhead'], ['arrow-sel', 'arrowhead sel'], ['arrow-fired', 'arrowhead fired'], ['arrow-mute', 'arrowhead mute']]) {
      const m = el('marker', { id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 8.5, markerHeight: 8.5, orient: 'auto-start-reverse', markerUnits: 'userSpaceOnUse' }, defs);
      el('path', { d: 'M0 0.8 L10 5 L0 9.2 z', class: cls }, m);
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
    this.applyAppearance(this.appearance);
    this.seq = 0;
    this.userMoved = false;
    this._bindTooltip();
    this._bind();
  }

  Diagram.prototype.applyAppearance = function (settings) {
    this.appearance = normalizeAppearance(settings);
    const a = this.appearance, style = this.svg.style, dark = this.appearanceTheme === 'dark';
    const headerKey = dark ? 'darkHeaderColor' : 'headerColor', activeKey = dark ? 'darkActiveHeaderColor' : 'activeHeaderColor';
    for (const [key, variable] of [[headerKey, '--state-header'], [activeKey, '--state-header-active']]) {
      const color = a[key];
      style.setProperty(variable, color);
      const rgb = color.slice(1).match(/../g).map(hex => {
        const v = parseInt(hex, 16) / 255;
        return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      const luminance = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
      style.setProperty(variable + '-text', luminance > 0.179 ? '#000000' : dark ? '#dce5e3' : '#ffffff');
    }
    style.setProperty('--active-stroke', activeStrokeColor(a[activeKey], dark));
    style.setProperty('--transition-width', a.lineWidth);
    style.setProperty('--state-border-width', a.borderWidth);
    style.setProperty('--transition-label-size', a.labelSize + 'px');
    style.setProperty('--transition-label-opacity', a.labelOpacity);
    style.setProperty('--edge-hit-width', Math.max(12, a.lineWidth + 8));
    if (a.lineColor) style.setProperty('--edge', a.lineColor);
    else style.removeProperty('--edge');
    for (const marker of this.svg.querySelectorAll('marker')) {
      const size = a.arrowSize * (marker.getAttribute('id') === 'arrow-fired' ? 1.25 : 1);
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
    this._hideTooltip?.();
    const { boxes, edges, info } = this.geo, model = this.model, g = this.view;
    while (g.firstChild) g.removeChild(g.firstChild);
    this.nodeEls = new Map(); this.edgeEls = new Map(); this.itemEls = new Map(); this.edgeGeo = new Map();
    this.nodeOf = new Map(); this.frameEls = new Map();
    // Exclude gray headers from transition drawing and hit testing. The clip
    // travels with the diagram and is retained in standalone SVG downloads.
    this.headerClipId ||= 'state-headers-' + (++nextHeaderClip);
    const defs = el('defs', {}, g), clip = el('clipPath', {id: this.headerClipId, clipPathUnits: 'userSpaceOnUse'}, defs);
    const clearHeaders = el('path', {'clip-rule': 'evenodd'}, clip), headerHoles = [];
    const gStates = el('g', {}, g), gEdges = el('g', {'clip-path': 'url(#' + this.headerClipId + ')'}, g),
      gLabels = el('g', {'clip-path': 'url(#' + this.headerClipId + ')'}, g);
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
          const label = el('text', { class: i ? 'line' : 'name', x, y, 'text-anchor': 'middle' }, grp, t);
          if (i && n.onentry[i - 1]) el('title', {}, label, 'entry /\n' + n.onentry[i - 1].body.trim());
        });
        return;
      }
      el('rect', { class: 'state-fill', x: b.x, y: b.y, width: b.w, height: b.h, rx: 13, ry: 13 }, grp);
      const header = stateHeaderPath(b);
      headerHoles.push(header);
      el('path', { class: 'state-header', d: header }, grp);
      // Paint the outline above both fills so even thick borders remain intact.
      el('rect', { class: 'shape', style: 'fill:none', x: b.x, y: b.y, width: b.w, height: b.h, rx: 13, ry: 13 }, grp);
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
    clearHeaders.setAttribute('d', 'M-32 -32H' + (this.geo.width + 32) + 'V' + (this.geo.height + 32) + 'H-32Z' + headerHoles.join(''));

    for (const e of edges) {
      const inf = info.get(e.id);
      if (!inf || inf.type === 'chain' || e.points.length < 2) continue;
      if (inf.type === 'initEdge') {
        el('path', { class: 'edge init', d: roundedPath(e.points, 7), 'marker-end': 'url(#arrow)' }, gEdges);
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
      const y = b.y + NOTE_TOP + i * 14;
      if (inf.live && inf.changedLines[i]) el('rect', {class: 'fact-change', x: b.x + 6, y: y - 11, width: b.w - 12, height: 14, rx: 3}, grp);
      el('text', { class: 'note-line', x: b.x + 10, y, 'xml:space': 'preserve' }, grp, t);
    });
    el('title', {}, grp, inf.fullText + (inf.live?.truncated ? '\n… snapshot limited to 40 clauses' : ''));
    if (!dm.scope) this.itemEls.set(dm.key, grp);
  };

  Diagram.prototype._init = function (parent, n, boxes) {
    const b = boxes.get(n.key + '/init');
    if (b) el('circle', { class: 'init-dot', cx: b.x + INIT_R, cy: b.y + INIT_R, r: INIT_R }, parent);
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
      g.classList.toggle('selected', s);
      g.classList.toggle('fired', f);
      const p = g.querySelector('.edge');
      if (p) p.setAttribute('marker-end', 'url(#' + (f ? 'arrow-fired' : s ? 'arrow-sel' : 'arrow') + ')');
    }
    this.svg.classList.toggle('running', this.running === true);
    this._drawSelectionTools();
  };

  /* Selected-state affordances: a handle on each side (click to add a
     connected state, drag to connect or to create a new
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
      for (const dir of Object.keys(mid)) {
        const g = el('g', { class: 'handle', 'data-handle': dir, 'data-source': key }, layer);
        el('circle', { class: 'handle-hit', cx: mid[dir][0], cy: mid[dir][1], r: 11 }, g);
        el('circle', { class: 'handle-dot', cx: mid[dir][0], cy: mid[dir][1], r: 5 }, g);
        el('title', {}, g, 'Click: new transition to a new state · drag: connect to a state, or create a new state on empty space');
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

  /* Diagram tooltips use a predictable delay and wrap complete source text. */
  Diagram.prototype._bindTooltip = function () {
    const tip = document.createElement('div');
    tip.className = 'diagram-tooltip';
    tip.setAttribute('role', 'tooltip');
    tip.hidden = true;
    this.host.appendChild(tip);
    let timer = null, owner = null;
    this._hideTooltip = () => {
      clearTimeout(timer); timer = null; owner = null; tip.hidden = true;
    };
    const hide = this._hideTooltip;
    this.svg.addEventListener('pointermove', ev => {
      if (ev.buttons) { hide(); return; }
      const target = ev.target.closest('[data-tooltip]');
      if (target === owner) return;
      hide();
      if (!target) return;
      owner = target;
      const x = ev.clientX, y = ev.clientY;
      timer = setTimeout(() => {
        tip.textContent = target.getAttribute('data-tooltip');
        tip.hidden = false;
        const box = tip.getBoundingClientRect(), gap = 8;
        tip.style.left = Math.max(gap, Math.min(x + 12, global.innerWidth - box.width - gap)) + 'px';
        tip.style.top = Math.max(gap, Math.min(y + 16, global.innerHeight - box.height - gap)) + 'px';
      }, 1000);
    });
    for (const type of ['pointerleave', 'pointerdown', 'wheel', 'keydown']) this.svg.addEventListener(type, hide);
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
      const object = ev.target.closest('[data-key]') || ev.target.closest('.edge');
      drag = { type: object ? 'object' : 'pan', x: ev.clientX, y: ev.clientY, tx: this.tx, ty: this.ty, moved: false, target: ev.target };
      svg.setPointerCapture(ev.pointerId);
    });
    svg.addEventListener('pointermove', ev => {
      if (!drag) return;
      if (drag.type === 'object') {
        if (Math.hypot(ev.clientX - drag.x, ev.clientY - drag.y) >= 5) drag.moved = true;
        return;
      }
      if (drag.type === 'pan') {
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
    const w = Math.max(opts.minWidth || 140, r.width + 16) * (opts.widthScale || 1);
    const left = Math.max(4, Math.min(r.left + r.width / 2 - w / 2, hostRect.width - w - 4));
    const top = Math.max(4, Math.min(r.top + r.height / 2 - 14, hostRect.height - 32));
    Object.assign(box.style, { left: left + 'px', top: top + 'px', width: w + 'px' });
    box.append(field);
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
    for (const target of clone.querySelectorAll('[data-tooltip]')) {
      const title = document.createElementNS(SVGNS, 'title');
      title.textContent = target.getAttribute('data-tooltip');
      target.insertBefore(title, target.firstChild);
      target.removeAttribute('data-tooltip');
    }
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

  global.SXMLDiagram = { Diagram, layout, trigger, editableTrigger, parseTrigger, doubleClickIntent, emptyStateSize, spacingOptions, normalizeExperiments, experimentOptions, normalizeAppearance, APPEARANCE_DEFAULTS, canArrangeRegions };
})(window);
