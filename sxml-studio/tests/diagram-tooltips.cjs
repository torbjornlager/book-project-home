const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
class Element {
  constructor(tag) { this.tag = tag; this.attrs = {}; this.children = []; this.style = {}; this.hidden = true; this.listeners = {}; this.classList = {toggle() {}}; }
  setAttribute(k,v) {this.attrs[k] = String(v);}
  getAttribute(k) {return this.attrs[k] ?? null;}
  removeAttribute(k) {delete this.attrs[k];}
  appendChild(e) {this.children.push(e); return e;}
  insertBefore(e) {this.children.unshift(e);}
  get firstChild() {return this.children[0];}
  get lastChild() {return this.children.at(-1);}
  addEventListener(type, fn) {this.listeners[type] = fn;}
  getBoundingClientRect() {return {width: 300, height: 100};}
  querySelectorAll(selector) {return this.children.flatMap(e => [...(selector === '[data-tooltip]' && e.attrs['data-tooltip'] ? [e] : []), ...e.querySelectorAll(selector)]);}
  cloneNode() {const e = new Element(this.tag); e.attrs = {...this.attrs}; e.textContent = this.textContent; e.children = this.children.map(c=>c.cloneNode()); return e;}
}
let timer, delay;
global.window = global;
global.innerWidth = 800; global.innerHeight = 600;
global.setTimeout = (fn, ms) => {timer = fn; delay = ms; return 1;};
global.clearTimeout = () => {timer = null;};
global.document = {createElement: tag => tag === 'canvas' ? {getContext: () => ({})} : new Element(tag), createElementNS: (_,tag) => new Element(tag)};
global.SXMLStudio = {description: () => 'Order completed', metadata: () => ({notes: []})};
global.XMLSerializer = class {serializeToString(e) {return JSON.stringify(e);}};
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../js/sxml-diagram.js'), 'utf8'));
// Read the actual multiline action from the reported example.
const xml = fs.readFileSync(path.join(__dirname, '../examples/11 boxshop-1.xml'), 'utf8');
const body = xml.match(/<final id="final">\s*<onentry>([\s\S]*?)<\/onentry>/)[1];
const final = {kind: 'final', key: 'final', id: 'final', el: {}, onentry: [{body}]};
const root = {kind: 'statechart', key: '#root', children: [final], datamodels: []};
const diagram = {view: new Element('g'), svg: new Element('svg'), host: new Element('div'), model: {root, doc: {}}, geo: {width: 400, height: 300, boxes: new Map([['#root',{}],['final',{x: 0,y: 0,w: 22,h: 22,labels: []}]]), edges: [], info: new Map([['#root',{}],['final',{labels: ['final','entry / size(Size), color…']} ]])}, _init() {}, _paint() {}};
SXMLDiagram.Diagram.prototype._render.call(diagram);
const state = diagram.nodeEls.get('final'), label = state.children.find(e => e.tag === 'text' && e.attrs.class === 'line'), text = label.getAttribute('data-tooltip');
assert(text.includes(body.trim()), 'The final state tooltip must retain the entire entry action, including line breaks.');
assert(text.includes("format('You want a ~p ~p box!\\n', [Size, Color])"));
assert.equal(state.getAttribute('data-tooltip'), 'Order completed', 'The symbol must not show entry actions.');
assert.equal(label.getAttribute('aria-label'), text);
assert.match(fs.readFileSync(path.join(__dirname, '../chart.css'), 'utf8'), /\.k-final text\{pointer-events:all\}/, 'Final-state text must receive hover events.');
assert(!state.children.some(e=>e.tag==='title'), 'No native tooltip should compete with the controlled delay.');
SXMLDiagram.Diagram.prototype._bindTooltip.call(diagram);
const tip = diagram.host.lastChild;
const hover = {target: {closest: () => label}, clientX: 780, clientY: 590, buttons: 0};
diagram.svg.listeners.pointermove(hover);
assert.equal(delay, 1000);
assert(tip.hidden);
timer();
assert.equal(tip.hidden, false);
assert.equal(tip.textContent, text);
assert.equal(tip.style.left, '492px');
assert.equal(tip.style.top, '492px');
diagram.svg.listeners.pointermove({...hover, target: {closest: () => null}});
assert(tip.hidden, 'Moving from text to the symbol must dismiss the action tooltip.');
assert.equal(timer, null);
diagram.svg.listeners.pointerleave();
assert(tip.hidden);
diagram.svg.listeners.pointermove(hover);
diagram.svg.listeners.pointerdown();
assert.equal(timer, null, 'Clicking must cancel a pending tooltip.');
assert(tip.hidden);
diagram.svg.listeners.pointermove(hover);
diagram._hideTooltip();
assert.equal(timer, null, 'Redrawing must cancel stale hover text.');
// Saved SVGs still contain standard title elements with all the source text.
diagram.svg.appendChild(diagram.view);
const output = SXMLDiagram.Diagram.prototype.exportSVG.call(diagram, '');
assert(output.includes('"tag":"title"'));
assert(!output.includes('data-tooltip'));
assert(output.includes('You want a ~p ~p box!'));
console.log('Checked complete boxshop final-state action, text-only action hover, one-second delay, cancellation, viewport placement and SVG titles.');
