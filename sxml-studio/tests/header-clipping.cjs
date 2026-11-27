const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
global.window = global;
global.ELK = require('../vendor/elk.bundled.js');
global.document = {createElement: () => ({getContext: () => ({measureText: text => ({width: text.length * 7})})})};
const code = fs.readFileSync(path.join(__dirname, '../js/sxml-diagram.js'), 'utf8');
class Element {
  constructor(tag) {this.tag = tag; this.attrs = {}; this.children = []; this.classList = {toggle() {}};}
  setAttribute(key, value) {this.attrs[key] = String(value);}
  getAttribute(key) {return this.attrs[key] ?? null;}
  removeAttribute(key) {delete this.attrs[key];}
  appendChild(child) {this.children.push(child); return child;}
  removeChild(child) {this.children.splice(this.children.indexOf(child), 1);}
  insertBefore(child) {this.children.unshift(child);}
  get firstChild() {return this.children[0];}
  get lastChild() {return this.children.at(-1);}
  querySelectorAll(selector) {return this.children.flatMap(child => [...(selector === '[data-tooltip]' && child.attrs['data-tooltip'] ? [child] : []), ...child.querySelectorAll(selector)]);}
  cloneNode() {const e = new Element(this.tag); e.attrs = {...this.attrs}; e.textContent = this.textContent; e.children = this.children.map(child => child.cloneNode()); return e;}
}
global.document.createElementNS = (_, tag) => new Element(tag);
global.XMLSerializer = class {serializeToString(el) {return JSON.stringify(el);}};
vm.runInThisContext(code);
const D = SXMLDiagram;
function state(id, kind = 'state', children = [], initial = '') {
  const n = {id, key: id, kind, children, initial, datamodels: [], spawns: [], onentry: [], onexit: [], defers: [], transitions: []};
  children.forEach(c => c.parent = n); return n;
}
function fixture(rich = false) {
  const history = state('h', 'history'), color = state('color'), size = state('size');
  const start = state('start', 'state', [history, color, size], 'color'), final = state('final', 'final');
  const outside = state('outside_with_a_long_heading');
  const root = state('#root', 'statechart', rich ? [start, final, outside] : [start, final], 'start');
  start.compound = true;
  color.onentry = [{body: "writeln('What color do you want?')"}];
  size.onentry = [{body: "writeln('What size do you want?')"}];
  final.onentry = [{body: 'report_order(Size, Color)'}];
  const transitions = [];
  function edge(source, target, on, body = '', cond = null) {
    const t = {key: source.key + '/go' + source.transitions.length, source, to: [target.id], on, body, cond, index: source.transitions.length};
    source.transitions.push(t); transitions.push(t);
  }
  edge(history, color, null);
  edge(color, size, 'input(Input)', 'assert(color(Color))', 'phrase(np(color(Color)), Input)');
  edge(size, final, 'input(Input)', 'assert(size(Size))', 'phrase(np(size(Size)), Input)');
  edge(start, history, 'input(Input)', "writeln('I did not understand.')");
  if (rich) {edge(outside, color, 'retry'); edge(size, outside, 'leave'); edge(outside, outside, 'again');}
  const nodes = [root, start, history, color, size, final, ...(rich ? [outside] : [])];
  return {root, nodes, byId: new Map(nodes.map(n => [n.id,n])), transitions, nested: new Map(), layout: null};
}
function headings(geo) {
  return [...geo.info].flatMap(([key, inf]) => {
    const b = geo.boxes.get(key), n = inf.node;
    if (!b || !n || !['state','parallel','final'].includes(n.kind)) return [];
    let cx = b.x + b.w / 2, baseline = b.y + 17.5;
    if (n.kind === 'final') {const label = b.labels[0]; cx = b.x + label.x + label.width / 2; baseline = b.y + label.y + 11.5;}
    const half = (n.id || '(no id)').length * 7 / 2;
    return [{key, left: cx - half - 2, right: cx + half + 2, top: baseline - 13, bottom: baseline + 4}];
  });
}
function collisions(geo) {
  const hits = [];
  for (const edge of geo.edges) for (let i = 1; i < edge.points.length; i++) {
    const a = edge.points[i - 1], b = edge.points[i];
    assert(a.x === b.x || a.y === b.y, 'Routes must remain orthogonal.');
    for (const r of headings(geo)) {
      const hit = a.x === b.x ? a.x > r.left && a.x < r.right && Math.max(a.y,b.y) > r.top && Math.min(a.y,b.y) < r.bottom
        : a.y > r.top && a.y < r.bottom && Math.max(a.x,b.x) > r.left && Math.min(a.x,b.x) < r.right;
      if (hit) hits.push(edge.id + ' crosses ' + r.key);
    }
  }
  return hits;
}
function collect(el, predicate) {return [...(predicate(el) ? [el] : []), ...el.children.flatMap(child => collect(child, predicate))];}
(async () => {
  let crossingsCovered = 0, checks = 0;
  for (const direction of ['RIGHT','DOWN']) for (const spacing of [0,50,100]) for (const padding of ['50','100','150']) for (const collapsed of [false,true]) for (const rich of [false,true]) {
    const model = fixture(rich), source = JSON.stringify(model.transitions.map(t => ({key:t.key,to:t.to,on:t.on})));
    const options = {...D.spacingOptions(direction, spacing, spacing), ...D.experimentOptions({padding}), 'studio.collapsed': new Set(collapsed ? ['start'] : [])};
    const geo = await D.layout(model, direction, options);
    crossingsCovered += collisions(geo).length;
    const geometry = JSON.stringify({boxes:[...geo.boxes], edges:geo.edges, width:geo.width, height:geo.height});
    const svg = new Element('svg'), view = svg.appendChild(new Element('g'));
    view.setAttribute('transform', 'translate(20,20) scale(1)');
    const diagram = {geo, model, svg, view, _init:D.Diagram.prototype._init, _paint() {}};
    D.Diagram.prototype._render.call(diagram);
    const clip = collect(view, el => el.tag === 'clipPath')[0], cutout = clip.firstChild;
    assert.equal(clip.attrs.clipPathUnits, 'userSpaceOnUse');
    assert.equal(cutout.attrs['clip-rule'], 'evenodd');
    const headers = collect(view, el => el.attrs.class === 'state-header');
    assert(headers.length > 0);
    for (const header of headers) assert(cutout.attrs.d.includes(header.attrs.d), 'The entire rounded gray area must be excluded, not just its text.');
    const layers = view.children.filter(el => el.attrs['clip-path']);
    assert.equal(layers.length, 2, 'Both transition paths and labels must stay behind headers.');
    for (const layer of layers) assert.equal(layer.attrs['clip-path'], 'url(#' + clip.attrs.id + ')');
    assert.equal(JSON.stringify({boxes:[...geo.boxes], edges:geo.edges, width:geo.width, height:geo.height}), geometry, 'Rendering must preserve the original routes, labels and node positions.');
    assert.equal(JSON.stringify(model.transitions.map(t => ({key:t.key,to:t.to,on:t.on}))), source);
    const exported = D.Diagram.prototype.exportSVG.call(diagram, '');
    assert(exported.includes('"tag":"clipPath"'));
    assert(exported.includes('url(#' + clip.attrs.id + ')'), 'SVG downloads must retain header clipping.');
    const id = clip.attrs.id;
    D.Diagram.prototype._render.call(diagram);
    assert.equal(collect(view, el => el.tag === 'clipPath').length, 1, 'Redraws must replace stale header cutouts.');
    assert.equal(collect(view, el => el.tag === 'clipPath')[0].attrs.id, id);
    checks++;
  }
  assert(crossingsCovered > 0, 'Exercise routes that actually pass behind headings.');
  console.log('Checked gray-header clipping in ' + checks + ' layouts, both directions, rounded corners, paths/labels, unchanged routes, redraws and standalone SVGs; covered ' + crossingsCovered + ' hidden crossings.');
})().catch(error => {console.error(error); process.exitCode = 1;});
