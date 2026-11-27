const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
global.window = global;
global.ELK = require('../vendor/elk.bundled.js');
global.document = {
  createElement: () => ({getContext: () => ({measureText: text => ({width: text.length * 7})})}),
  createElementNS: () => ({attrs: {}, setAttribute(key, value) {this.attrs[key] = value;}})
};
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../js/sxml-diagram.js'), 'utf8'));
const D = SXMLDiagram;
function state(id, kind = 'state', children = [], initial = '') {
  const node = {id, key: kind === 'statechart' ? '#root' : id, kind, children, initial,
    datamodels: [], spawns: [], onentry: [], onexit: [], defers: [], transitions: []};
  children.forEach(child => child.parent = node);
  return node;
}
const anger = state('anger'), fear = state('fear');
const af = state('af', 'state', [anger, fear], 'anger');
const anticipation = state('anticipation'), surprise = state('surprise');
const as = state('as', 'state', [anticipation, surprise], 'anticipation');
const emotions = state('emotions', 'parallel', [af, as]);
const attacking = state('attacking'), fleeing = state('fleeing');
const behavior = state('behavior', 'state', [attacking, fleeing], 'attacking');
const agent = state('agent', 'parallel', [emotions, behavior]);
const root = state('', 'statechart', [agent], 'agent');
const model = {root, nodes: [], byId: new Map(), nested: new Map(), transitions: [], layout: null};
(function walk(n) {model.nodes.push(n); if(n.id) model.byId.set(n.id, n); n.children.forEach(walk);})(root);
function transition(source, target) {
  const edge = {key: source.key + '/go' + source.transitions.length, source, to: [target.id], on: 'e', body: ''};
  source.transitions.push(edge); model.transitions.push(edge); return edge;
}
transition(anger, fear); transition(attacking, fleeing);
function separators(geo, node) {
  const lines = [];
  D.Diagram.prototype._regions.call({geo}, {appendChild: e => lines.push(e.attrs)}, node, geo.boxes);
  return lines;
}
(async () => {
  model.layout = null;
  const defaultGeo = await D.layout(model, 'RIGHT', D.spacingOptions('RIGHT'));
  assert(defaultGeo.boxes.get('emotions').y + defaultGeo.boxes.get('emotions').h <= defaultGeo.boxes.get('behavior').y, 'Parallel states must default to stacked regions.');
  assert(defaultGeo.boxes.get('af').y + defaultGeo.boxes.get('af').h <= defaultGeo.boxes.get('as').y, 'Nested parallel states must also default to stacked.');
  model.layout = {agent: {'@regions': 'AUTO'}};
  const automaticGeo = await D.layout(model, 'RIGHT', D.spacingOptions('RIGHT'));
  assert(automaticGeo.boxes.get('emotions').x + automaticGeo.boxes.get('emotions').w <= automaticGeo.boxes.get('behavior').x, 'Explicit Follow chart must still follow horizontal layout.');
  for (const direction of ['RIGHT', 'DOWN']) for (const arrangement of ['RIGHT', 'DOWN']) {
    model.layout = {agent: {'@regions': arrangement}, emotions: {'@regions': 'RIGHT'}};
    const before = JSON.stringify(model.layout);
    const geo = await D.layout(model, direction, D.spacingOptions(direction));
    assert.equal(JSON.stringify(model.layout), before);
    const e = geo.boxes.get('emotions'), b = geo.boxes.get('behavior');
    if (arrangement === 'DOWN') assert(e.y + e.h <= b.y, 'Behavior must appear below emotions.');
    else assert(e.x + e.w <= b.x, 'Side-by-side regions must form a row.');
    const a = geo.boxes.get('af'), s = geo.boxes.get('as');
    assert(a.x + a.w <= s.x, 'Nested parallel regions must keep their own arrangement.');
    const [separator] = separators(geo, agent);
    assert(separator);
    assert.equal(arrangement === 'DOWN' ? separator.y1 : separator.x1, arrangement === 'DOWN' ? separator.y2 : separator.x2);
    for (const edge of model.transitions) assert(geo.edges.find(e => e.id === edge.key + '>0').points.length >= 2);
  }
  // Physical spacing axes must follow each container's own direction, even
  // when a nested parallel state runs across the overall chart direction.
  for (const direction of ['RIGHT', 'DOWN']) for (const arrangement of ['RIGHT', 'DOWN']) {
    const nestedArrangement = arrangement === 'RIGHT' ? 'DOWN' : 'RIGHT';
    model.layout = {agent: {'@regions': arrangement}, emotions: {'@regions': nestedArrangement}};
    for (const padding of ['50', '100', '150']) for (const axis of ['horizontal', 'vertical']) for (const spacing of [0, 100]) {
      const horizontal = axis === 'horizontal' ? spacing : 50;
      const vertical = axis === 'vertical' ? spacing : 50;
      const geo = await D.layout(model, direction, {...D.spacingOptions(direction, horizontal, vertical), ...D.experimentOptions({padding})});
      for (const [first, second, flow] of [['emotions', 'behavior', arrangement], ['af', 'as', nestedArrangement]]) {
        const a = geo.boxes.get(first), b = geo.boxes.get(second);
        const gap = flow === 'DOWN' ? b.y - a.y - a.h : b.x - a.x - a.w;
        const expected = 48 * (flow === 'DOWN' ? vertical : horizontal) / 100;
        assert(Math.abs(gap - expected) < .01,
          `${first}: ${flow} gap must follow its physical axis at padding ${padding}, chart ${direction}; got ${gap}, expected ${expected}`);
      }
    }
  }
  const cross = transition(anger, attacking);
  assert(!D.canArrangeRegions(model, agent));
  assert(!D.canArrangeRegions(model, emotions));
  // Unsupported independent layouts must retain cross-region routes.
  const geo = await D.layout(model, 'RIGHT', D.spacingOptions('RIGHT'));
  assert(geo.edges.find(e => e.id === cross.key + '>0').points.length >= 2);
  console.log('Checked independent and nested region directions, horizontal/vertical separators, unchanged metadata, physical spacing at all padding levels and cross-region routing.');
})().catch(error => {console.error(error); process.exitCode = 1;});
