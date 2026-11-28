const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
class Element {
  constructor(tag) { this.tag = tag; this.attrs = {}; this.children = []; this.style = {}; this.hidden = true; this.listeners = {}; this.classList = {toggle() {}}; }
  setAttribute(k,v) {this.attrs[k] = String(v);}
  getAttribute(k) {return this.attrs[k] ?? null;}
  removeAttribute(k) {delete this.attrs[k];}
  appendChild(e) {this.children.push(e); e.parent = this; return e;}
  remove() {this.parent.children = this.parent.children.filter(e => e !== this);}
  insertBefore(e) {this.children.unshift(e);}
  get firstChild() {return this.children[0];}
  get lastChild() {return this.children.at(-1);}
  get clientHeight() {return 196;}
  addEventListener(type, fn) {this.listeners[type] = fn;}
  getBoundingClientRect() {return {width: 300, height: 100};}
  querySelectorAll(selector) {return this.children.flatMap(e => [...((selector === '[data-tooltip]' && e.attrs['data-tooltip']) || (selector.startsWith('.') && selector === '.' + e.attrs.class) ? [e] : []), ...e.querySelectorAll(selector)]);}
  cloneNode() {const e = new Element(this.tag); e.attrs = {...this.attrs}; e.textContent = this.textContent; this.children.forEach(c=>e.appendChild(c.cloneNode())); return e;}
}
const realSetTimeout = global.setTimeout, realClearTimeout = global.clearTimeout;
let timer, delay;
global.window = global;
global.innerWidth = 800; global.innerHeight = 600;
global.setTimeout = (fn, ms) => {timer = fn; delay = ms; return 1;};
global.clearTimeout = () => {timer = null;};
global.document = {createElement: tag => tag === 'canvas' ? {getContext: () => ({measureText: text => ({width: text.length * 7})})} : new Element(tag), createElementNS: (_,tag) => new Element(tag)};
global.SXMLStudio = {description: () => 'Order completed', metadata: () => ({notes: []})};
global.XMLSerializer = class {serializeToString(e) {return JSON.stringify(e, (key, value) => key === 'parent' ? undefined : value);}};
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
const hover = {target: {closest: selector => selector === '[data-tooltip]' ? label : null}, clientX: 780, clientY: 590, buttons: 0};
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

// Generate real layout/label metadata, then check the rendered hover targets.
(async () => {
  global.setTimeout = realSetTimeout; global.clearTimeout = realClearTimeout;
  global.ELK = require('../vendor/elk.bundled.js');
  const makeState = (id, kind = 'state') => ({id, key: id, kind, el: {}, children: [], datamodels: [], spawns: [], onentry: [], onexit: [], defers: [], transitions: []});
  const chart = makeState('#root', 'statechart'), source = makeState('source'), target = makeState('target');
  chart.children = [source, target]; chart.initial = 'source';
  const long = name => name + '(' + 'complete_content_'.repeat(8) + 'tail)';
  const entry = {key: 'source/entry', body: long('entry_action')};
  const exit = {key: 'source/exit', body: long('exit_action')};
  const defer = {key: 'source/defer', on: long('deferred_event'), cond: long('defer_guard')};
  const spawn = {key: 'source/spawn', type: 'actor', el: {getAttribute: name => name === 'goal' ? long('spawn_goal') : null}};
  const internal = {key: 'source/internal', el: {}, source, to: [], on: long('internal_event'), cond: long('internal_guard'), body: long('internal_action'), index: 0};
  const external = {key: 'source/external', el: {}, source, to: ['target'], on: long('external_event'), cond: long('external_guard'), body: long('external_action'), index: 1};
  source.onentry = [entry]; source.onexit = [exit]; source.defers = [defer]; source.spawns = [spawn]; source.transitions = [internal, external];
  const dm = {key: '#root/datamodel0', body: Array.from({length: 60}, (_, i) => long('fact_' + i) + '.').join('\n')};
  chart.datamodels = [dm];
  const model = {root: chart, nodes: [chart, source, target], byId: new Map([['source',source],['target',target]]), nested: new Map(), transitions: [internal, external], layout: null};
  const geo = await SXMLDiagram.layout(model, 'RIGHT');
  const drawing = {...diagram, view: new Element('g'), svg: new Element('svg'), host: new Element('div'), geo, model, _note: SXMLDiagram.Diagram.prototype._note};
  SXMLDiagram.Diagram.prototype._render.call(drawing);
  global.setTimeout = (fn, ms) => {timer = fn; delay = ms; return 1;};
  global.clearTimeout = () => {timer = null;};
  SXMLDiagram.Diagram.prototype._bindTooltip.call(drawing);
  const popup = drawing.host.lastChild;
  function check(owner, expected, name) {
    const full = owner.getAttribute('data-tooltip');
    for (const value of expected) assert(full.includes(value), name + ' must retain ' + value);
    drawing.svg.listeners.pointermove({target: {closest: selector => selector === '[data-tooltip]' ? owner : null}, clientX: 20, clientY: 30, buttons: 0});
    assert.equal(delay, 1000, name + ' delay');
    assert(popup.hidden, name + ' must wait');
    timer();
    assert.equal(popup.hidden, false);
    assert.equal(popup.textContent, full, name + ' popup content');
    drawing.svg.listeners.pointerleave();
  }
  for (const [item, expected, name] of [
    [entry, [entry.body], 'entry action'], [exit, [exit.body], 'exit action'],
    [defer, [defer.on, defer.cond], 'deferred event and guard'],
    [spawn, [long('spawn_goal')], 'spawn goal'],
    [internal, [internal.on, internal.cond, internal.body], 'internal transition']
  ]) {
    const line = geo.info.get('source').lines.find(line => line.item === item);
    assert(line.shown.endsWith('…'), name + ' must actually be truncated in the drawing');
    check(drawing.itemEls.get(item.key), expected, name);
  }
  const labelInfo = [...geo.info.values()].find(info => info.item === external && info.label);
  assert(labelInfo.label.lines.some(line => line.endsWith('…')));
  const edgeLabel = drawing.edgeEls.get(external.key).find(el => el.attrs.class.includes('tlabel'));
  check(edgeLabel, [external.on, external.cond, external.body], 'transition event, guard and action');
  assert(geo.info.get(dm.key).lines.some(line => line.endsWith('…')));
  assert(geo.info.get(dm.key).lines.length < dm.body.split('\n').length);
  const note = drawing.itemEls.get(dm.key);
  const heading = note.children.find(el => el.attrs.class === 'note-title');
  const preview = note.children.find(el => el.attrs.class === 'note-preview');
  const clauses = preview.children.filter(el => el.attrs.class === 'note-line');
  assert.equal(Number(clauses[0].attrs.y) - Number(heading.attrs.y), 23, 'Datamodel clauses must have extra space below the heading.');
  const box = geo.boxes.get(dm.key);
  assert(Number(clauses.at(-1).attrs.y) < box.y + box.h, 'The expanded note must contain its final visible line.');
  const viewport = note.children.find(el => el.attrs.class === 'note-scroll');
  const content = viewport.firstChild;
  assert.equal(content.attrs.tabindex, '0');
  assert.equal(content.children.length, 60, 'The scrollable content must include every source line.');
  assert.equal(content.children.at(-1).textContent, dm.body.split('\n').at(-1), 'Long lines must remain complete.');
  content.scrollTop = 120; content.scrollLeft = 35;
  content.listeners.scroll();
  assert.deepEqual(drawing.noteScrollPositions.get(dm.key), {top:120, left:35});
  const rerendered = new Element('g');
  drawing._note(rerendered, dm, box, geo.info.get(dm.key));
  const restored = rerendered.firstChild.children.find(el => el.attrs.class === 'note-scroll').firstChild;
  assert.equal(restored.scrollTop, 120, 'Redrawing must preserve the scroll position.');
  assert.equal(restored.scrollLeft, 35);
  const live = {facts: [], changed: []};
  const liveInfo = {...geo.info.get(dm.key), live, changedLines: Array.from({length:60}, (_, i) => i >= 58)};
  function renderLive(info) {
    const parent = new Element('g');
    drawing._note(parent, dm, box, info);
    return parent.firstChild.children.find(el => el.attrs.class === 'note-scroll').firstChild;
  }
  const followed = renderLive(liveInfo);
  assert.equal(followed.scrollTop, 60 * 14 - followed.clientHeight, 'The last line of a new multiline clause must be visible.');
  assert.equal(followed.scrollLeft, 35, 'Following additions must preserve horizontal scrolling.');
  followed.scrollTop = 95; followed.listeners.scroll();
  assert.equal(renderLive(liveInfo).scrollTop, 95, 'Redrawing the same snapshot must let the user scroll back.');
  assert.equal(renderLive({...liveInfo, live:{facts:[]}, changedLines:[]}).scrollTop, 95, 'Updates with no additions must preserve scrolling.');
  const inserted = renderLive({...liveInfo, live:{facts:[]}, changedLines:Array.from({length:60}, (_, i) => i === 20)});
  assert.equal(inserted.scrollTop, 21 * 14 - inserted.clientHeight, 'An addition before existing clauses must also scroll into view.');
  const sourceAgain = renderLive(geo.info.get(dm.key));
  assert.equal(sourceAgain.scrollTop, inserted.scrollTop, 'Static source notes must retain their scroll position.');
  drawing.svg.listeners.pointermove({target: {closest: selector => selector === '.note-scroll' ? viewport : null}, buttons: 0});
  assert.equal(timer, null, 'Reading scrollable content must not open an obstructing tooltip.');
  drawing.svg.appendChild(drawing.view);
  const saved = SXMLDiagram.Diagram.prototype.exportSVG.call(drawing, '');
  assert(!saved.includes('foreignObject'), 'Saved SVGs must use the compatible SVG preview.');
  assert(!saved.includes('display:none'), 'The exported preview must be visible.');
  assert(saved.includes('fact_59'), 'Saved SVG hover text must retain omitted clauses.');
  check(drawing.itemEls.get(dm.key), [dm.body], 'datamodel including omitted lines');
  console.log('Checked truncated entry/exit actions, spawn goals, deferred events, internal/external transition events, guards/actions and datamodel lines: full hover text after 1000 ms.');
})().catch(error => {console.error(error); process.exitCode = 1;});
