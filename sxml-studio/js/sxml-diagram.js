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
        const trig = trigger(t), body = one(t.body);
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

  function edgeLabel(t) {
    const trig = trigger(t), body = one(t.body);
    let lines = [];
    if (trig && body && (trig + ' / ' + body).length <= MAX_LABEL) lines = [trig + ' / ' + body];
    else { if (trig) lines.push(trig); if (body) lines.push('/ ' + body); }
    lines = lines.map(l => cut(l, MAX_LABEL));
    return { lines, full: trig + (body ? ' / ' + body : ''), w: Math.max(0, ...lines.map(l => width(l, F_MONO))) + 10, h: lines.length * 14 + 4 };
  }

  /* ---------- ELK graph ---------- */

  const INTERACTIVE = {
    'elk.layered.cycleBreaking.strategy': 'INTERACTIVE',
    'elk.layered.layering.strategy': 'INTERACTIVE',
    'elk.layered.crossingMinimization.strategy': 'INTERACTIVE'
  };

  function toElk(model, direction, base) {
    const edges = [];
    const hints = base ? model.layout : null;
    const info = new Map();      // elk id -> description
    function noteNode(dm, owner) {
      const all = dm.body.split('\n');
      let lines = all.slice(0, MAX_NOTE_LINES).map(l => cut(l.replace(/\s+$/, ''), MAX_NOTE));
      if (all.length > MAX_NOTE_LINES) lines.push('…');
      const w = Math.max(76, ...lines.map(l => width(l, F_NOTE))) + 22;
      const h = 24 + lines.length * 14 + 8;
      info.set(dm.key, { type: 'note', item: dm, lines });
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
      const realKids = n.children.filter(c => c.kind !== 'history');
      for (const dm of n.datamodels) kids.push(noteNode(dm, n));
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
      const inter = {};
      if (n.kind === 'statechart') return { id: n.key, children: kids, layoutOptions: Object.assign({ 'elk.padding': '[top=24,left=24,bottom=24,right=24]' }, inter) };
      if (!kids.length) {
        return { id: n.key, width: Math.max(72, headW, linesW), height: top + (lines.length ? 4 : 20) };
      }
      return {
        id: n.key, children: kids,
        layoutOptions: Object.assign({}, inter, {
          'elk.padding': '[top=' + (top + 14) + ',left=' + PAD + ',bottom=' + PAD + ',right=' + PAD + ']',
          'elk.nodeSize.constraints': 'MINIMUM_SIZE',
          'elk.nodeSize.minimum': '(' + Math.max(72, headW, linesW) + ',' + (top + 20) + ')'
        })
      };
    }
    const root = node(model.root);
    for (const t of model.transitions) {
      if (!t.to.length) continue;
      t.to.forEach((id, i) => {
        const target = model.byId.get(id);
        if (!target) return;
        const eid = t.key + '>' + i;
        const lab = edgeLabel(t);
        const e = { id: eid, sources: [t.source.key], targets: [target.key] };
        if (lab.lines.length) e.labels = [{ id: eid + '/label', text: lab.full, width: lab.w, height: lab.h }];
        edges.push(e);
        info.set(eid, { type: 'edge', item: t, label: lab, historyDefault: t.source.kind === 'history' });
      });
    }
    root.edges = edges;
    return { graph: root, info };
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
    if (!elk) elk = new global.ELK();
    const hinted = model.layout && Object.keys(model.layout).length > 0;
    let geo = await run(model, direction, extra, null);
    if (hinted) {
      try { geo = await run(model, direction, Object.assign({}, INTERACTIVE, extra), geo.boxes); }
      catch (e) { console.warn('Manual arrangement could not be applied; using automatic layout.', e); }
    }
    return geo;
  }

  async function run(model, direction, extra, base) {
    const { graph, info } = toElk(model, direction, base);
    const res = await elk.layout(graph, { layoutOptions: Object.assign(globalOptions(direction), extra || {}) });
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
          id: e.id, points: pts.map(p => ({ x: p.x + c.x, y: p.y + c.y })),
          labels: (e.labels || []).map(l => ({ x: l.x + c.x, y: l.y + c.y, w: l.width, h: l.height }))
        });
      }
      for (const c of n.children || []) collect(c);
    })(res);
    return { boxes, edges, info, width: res.width, height: res.height };
  }

  /* ---------- SVG helpers ---------- */

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
    for (const [id, cls] of [['arrow', 'arrowhead'], ['arrow-sel', 'arrowhead sel'], ['arrow-fired', 'arrowhead fired'], ['arrow-mute', 'arrowhead mute']]) {
      const m = el('marker', { id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 8.5, markerHeight: 8.5, orient: 'auto-start-reverse', markerUnits: 'userSpaceOnUse' }, defs);
      el('path', { d: 'M0 0.8 L10 5 L0 9.2 z', class: cls }, m);
    }
    this.view = el('g', {}, this.svg);
    this.tx = 20; this.ty = 20; this.k = 1;
    this.model = null; this.geo = null;
    this.selected = null; this.active = new Set(); this.fired = new Set();
    this.direction = 'RIGHT';
    this.seq = 0;
    this.userMoved = false;
    this._bind();
  }

  Diagram.prototype._apply = function () {
    this.view.setAttribute('transform', 'translate(' + this.tx + ',' + this.ty + ') scale(' + this.k + ')');
    if (this.h.onZoom) this.h.onZoom(this.k);
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

  Diagram.prototype.setModel = async function (model, opts) {
    const seq = ++this.seq;
    const geo = await layout(model, this.direction);
    if (seq !== this.seq) return;
    const first = !this.geo;
    this.model = model; this.geo = geo;
    this._render();
    if (first || (opts && opts.fit) || !this.userMoved) this.fit();
  };

  Diagram.prototype._render = function () {
    const { boxes, edges, info } = this.geo, model = this.model, g = this.view;
    while (g.firstChild) g.removeChild(g.firstChild);
    this.nodeEls = new Map(); this.edgeEls = new Map(); this.itemEls = new Map(); this.edgeGeo = new Map();
    const gStates = el('g', {}, g), gEdges = el('g', {}, g), gLabels = el('g', {}, g);
    this.overlay = el('g', {}, g);

    const draw = n => {
      const b = boxes.get(n.key), inf = info.get(n.key);
      if (!b) return;
      if (n.kind === 'statechart') {
        for (const dm of n.datamodels) this._note(gStates, dm, boxes.get(dm.key), info.get(dm.key));
        this._init(gStates, n, boxes);
        n.children.forEach(draw);
        return;
      }
      const grp = el('g', { class: 'state k-' + n.kind + (n.compound ? ' compound' : ''), 'data-key': n.key, 'data-state': n.key }, gStates);
      this.nodeEls.set(n.key, grp);
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
      el('text', { class: 'name', x: b.x + b.w / 2, y: b.y + 17.5, 'text-anchor': 'middle' }, grp, n.id || '(no id)');
      el('line', { class: 'rule', x1: b.x, y1: b.y + HEAD_H, x2: b.x + b.w, y2: b.y + HEAD_H }, grp);
      inf.lines.forEach((l, i) => {
        const y = b.y + HEAD_H + 6 + i * LINE_H;
        const lg = el('g', { class: 'item', 'data-key': l.item.key, 'data-item': l.item.key }, grp);
        el('rect', { class: 'item-bg', x: b.x + 5, y, width: b.w - 10, height: LINE_H, rx: 3 }, lg);
        const t = el('text', { class: 'line', x: b.x + PAD - 2, y: y + 11.5 }, lg);
        const kw = l.kw && l.shown.startsWith(l.kw) ? l.kw : '';
        if (kw) el('tspan', { class: 'kw' }, t, kw + ' ');
        el('tspan', {}, t, kw ? l.shown.slice(kw.length + 1) : l.shown);
        el('title', {}, lg, l.full);
        this.itemEls.set(l.item.key, lg);
      });
      if (inf.lines.length && n.compound) {
        el('line', { class: 'rule soft', x1: b.x, y1: b.y + inf.top, x2: b.x + b.w, y2: b.y + inf.top }, grp);
      }
      for (const dm of n.datamodels) this._note(gStates, dm, boxes.get(dm.key), info.get(dm.key));
      this._init(gStates, n, boxes);
      if (n.kind === 'parallel') this._regions(grp, n, boxes);
      n.children.forEach(draw);
    };
    draw(model.root);

    for (const e of edges) {
      const inf = info.get(e.id);
      if (!inf || inf.type === 'chain' || e.points.length < 2) continue;
      if (inf.type === 'initEdge') {
        el('path', { class: 'edge init', d: roundedPath(e.points, 7), 'marker-end': 'url(#arrow)' }, gEdges);
        continue;
      }
      const key = inf.item.key;
      const grp = el('g', { class: 'transition' + (inf.historyDefault ? ' hdefault' : ''), 'data-key': key, 'data-item': key }, gEdges);
      const d = roundedPath(e.points, 7);
      el('path', { class: 'edge-hit', d }, grp);
      el('path', { class: 'edge', d, 'marker-end': 'url(#arrow)' }, grp);
      let entry = this.edgeEls.get(key);
      if (!entry) this.edgeEls.set(key, entry = []);
      if (!this.edgeGeo.has(key)) this.edgeGeo.set(key, []);
      this.edgeGeo.get(key).push({ points: e.points, index: +e.id.slice(e.id.lastIndexOf('>') + 1), fixedTail: inf.historyDefault });
      entry.push(grp);
      const lb = e.labels[0];
      if (lb && inf.label.lines.length) {
        const lg = el('g', { class: 'tlabel', 'data-key': key, 'data-item': key }, gLabels);
        el('rect', { class: 'tlabel-bg', x: lb.x, y: lb.y, width: lb.w, height: lb.h, rx: 4 }, lg);
        inf.label.lines.forEach((t, i) => el('text', { class: 'line', x: lb.x + 5, y: lb.y + 12.5 + i * 14 }, lg, t));
        el('title', {}, lg, inf.label.full);
        entry.push(lg);
      }
    }
    this.svg.classList.toggle('empty', !model.root.children.length);
    this._paint();
  };

  Diagram.prototype._note = function (parent, dm, b, inf) {
    if (!b) return;
    const grp = el('g', { class: 'note', 'data-key': dm.key, 'data-item': dm.key }, parent);
    const f = 9;
    el('path', { class: 'shape', d: 'M' + b.x + ' ' + b.y + ' h' + (b.w - f) + ' l' + f + ' ' + f + ' v' + (b.h - f) + ' h' + (-b.w) + ' z' }, grp);
    el('path', { class: 'fold', d: 'M' + (b.x + b.w - f) + ' ' + b.y + ' v' + f + ' h' + f }, grp);
    el('text', { class: 'note-title', x: b.x + 10, y: b.y + 15 }, grp, 'DATAMODEL');
    inf.lines.forEach((t, i) => el('text', { class: 'note-line', x: b.x + 10, y: b.y + 32 + i * 14, 'xml:space': 'preserve' }, grp, t));
    el('title', {}, grp, dm.body);
    this.itemEls.set(dm.key, grp);
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

  /* Selection, active configuration and fired transitions are CSS classes. */
  Diagram.prototype._paint = function () {
    if (!this.nodeEls) return;
    const sel = this.selected;
    for (const [k, g] of this.nodeEls) {
      const n = this.model.byKey.get(k);
      g.classList.toggle('selected', k === sel);
      g.classList.toggle('active', !!(n && n.id && this.active.has(n.id)));
    }
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
    this._handle();
  };

  Diagram.prototype.select = function (key) { this.selected = key; this._paint(); };
  Diagram.prototype.setRun = function (running, activeIds, firedKeys) {
    this.running = running;
    this.active = new Set(activeIds || []);
    this.fired = new Set(firedKeys || []);
    this._paint();
  };

  /* Connection handle on the selected state. */
  Diagram.prototype._handle = function () {
    const o = this.overlay;
    if (!o) return;
    while (o.firstChild) o.removeChild(o.firstChild);
    if (this.running || this.readOnly) return;
    for (const g of this.edgeGeo.get(this.selected) || []) {
      const a = g.points[0], z = g.points[g.points.length - 1];
      if (!g.fixedTail) el('title', {}, el('circle', { class: 'end', cx: a.x, cy: a.y, r: 5.5, 'data-end': 'tail', 'data-eidx': g.index }, o), 'Drag onto another state to move this transition there');
      el('title', {}, el('circle', { class: 'end', cx: z.x, cy: z.y, r: 5.5, 'data-end': 'head', 'data-eidx': g.index }, o), 'Drag onto another state to change the target');
    }
    const n = this.model.byKey.get(this.selected);
    if (!n || n.kind === 'statechart' || n.kind === 'final') return;
    const b = this.geo.boxes.get(n.key);
    if (!b) return;
    const cx = b.x + b.w, cy = n.kind === 'history' ? b.y + HIST_R : b.y + Math.min(b.h / 2, 13);
    const h = el('g', { class: 'handle', 'data-handle': n.key }, o);
    el('circle', { cx, cy, r: 8 }, h);
    el('path', { d: 'M' + (cx - 3.5) + ' ' + cy + ' h7 M' + (cx + 1) + ' ' + (cy - 3) + ' l3 3 l-3 3' }, h);
    el('title', {}, h, 'Drag to another state to add a transition');
  };

  Diagram.prototype._point = function (ev) {
    const r = this.host.getBoundingClientRect();
    return { x: (ev.clientX - r.left - this.tx) / this.k, y: (ev.clientY - r.top - this.ty) / this.k };
  };

  Diagram.prototype._bind = function () {
    const svg = this.svg;
    let drag = null;
    svg.addEventListener('wheel', ev => {
      ev.preventDefault();
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
      const handle = ev.target.closest('[data-handle]');
      const stateEl = ev.target.closest('[data-state]');
      const endEl = ev.target.closest('[data-end]');
      const lineEl = ev.target.closest('.transition, .tlabel');
      if (endEl) {
        drag = this._retarget(this.selected, endEl.getAttribute('data-end'), +endEl.getAttribute('data-eidx'));
        if (drag) { svg.setPointerCapture(ev.pointerId); ev.preventDefault(); return; }
      }
      if (lineEl && this.tool !== 'connect') {
        drag = { type: 'edge', key: lineEl.getAttribute('data-key'), onLine: lineEl.classList.contains('transition'), x: ev.clientX, y: ev.clientY, at: this._point(ev), moved: false, target: ev.target };
        svg.setPointerCapture(ev.pointerId);
        return;
      }
      if (handle || (this.tool === 'connect' && stateEl && !this.running)) {
        const key = handle ? handle.getAttribute('data-handle') : stateEl.getAttribute('data-state');
        const b = this.geo.boxes.get(key);
        const start = handle ? { x: b.x + b.w, y: b.y + Math.min(b.h / 2, 13) } : this._point(ev);
        drag = { type: 'connect', source: key, start, line: el('path', { class: 'rubber', 'marker-end': 'url(#arrow-sel)' }, this.overlay) };
        svg.setPointerCapture(ev.pointerId);
        ev.preventDefault();
        return;
      }
      const movable = stateEl && !this.running && !this.readOnly && this.h.onMove;
      drag = { type: movable ? 'move' : 'pan', key: movable ? stateEl.getAttribute('data-state') : null, x: ev.clientX, y: ev.clientY, tx: this.tx, ty: this.ty, moved: false, target: ev.target };
      svg.setPointerCapture(ev.pointerId);
    });
    svg.addEventListener('pointermove', ev => {
      if (!drag) return;
      if (drag.type === 'edge') {
        if (Math.hypot(ev.clientX - drag.x, ev.clientY - drag.y) < 5) return;
        /* A drag that starts near one end of a line retargets that end; elsewhere it does nothing. */
        let next = null;
        if (drag.onLine && !this.running && !this.readOnly) {
          let best = 26 / this.k;
          for (const g of this.edgeGeo.get(drag.key) || []) {
            const a = g.points[0], z = g.points[g.points.length - 1];
            const da = Math.hypot(a.x - drag.at.x, a.y - drag.at.y), dz = Math.hypot(z.x - drag.at.x, z.y - drag.at.y);
            if (dz < best) { best = dz; next = this._retarget(drag.key, 'head', g.index); }
            if (da < best && !g.fixedTail) { best = da; next = this._retarget(drag.key, 'tail', g.index); }
          }
        }
        drag = next || { type: 'inert', moved: true };
      }
      if (drag.type === 'inert') return;
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
        const p = this._point(ev);
        if (!drag.line) drag.line = el('path', { class: 'rubber', 'marker-end': 'url(#arrow-sel)' }, this.overlay);
        const from = drag.end === 'tail' ? p : drag.start, to = drag.end === 'tail' ? drag.start : p;
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
      if (d.type === 'inert') return;
      if (d.type === 'connect' || d.type === 'retarget') {
        if (d.line) d.line.remove();
        if (d.over && this.nodeEls.get(d.over)) this.nodeEls.get(d.over).classList.remove('drop');
        const over = ev.type === 'pointerup' && d.line ? this._stateAt(ev) : null;
        if (over && d.type === 'connect' && this.h.onConnect) this.h.onConnect(d.source, over);
        if (over && d.type === 'retarget' && this.h.onRetarget) this.h.onRetarget(d.key, d.end, d.index, over);
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
      if (this.h.onSelect) this.h.onSelect(key, ev);
    };
    svg.addEventListener('pointerup', finish);
    svg.addEventListener('pointercancel', finish);
    svg.addEventListener('dblclick', ev => {
      const t = ev.target.closest('[data-key]');
      if (t && this.h.onOpen) this.h.onOpen(t.getAttribute('data-key'));
    });
    svg.addEventListener('keydown', ev => { if (this.h.onKey) this.h.onKey(ev); });
  };

  /* Start dragging one end of a transition; the other end stays put. */
  Diagram.prototype._retarget = function (key, end, index) {
    const g = (this.edgeGeo.get(key) || []).find(x => x.index === index);
    if (!g || (end === 'tail' && g.fixedTail) || !this.h.onRetarget) return null;
    return { type: 'retarget', key, end, index, moved: true, start: end === 'head' ? g.points[0] : g.points[g.points.length - 1] };
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
    const style = document.createElementNS(SVGNS, 'style');
    style.textContent = cssText;
    clone.insertBefore(style, clone.firstChild);
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
  };

  global.SXMLDiagram = { Diagram, layout, trigger };
})(window);
