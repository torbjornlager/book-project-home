const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
global.window = global;
global.ELK = require('../vendor/elk.bundled.js');
global.document = {createElement: () => ({getContext: () => ({measureText: text => ({width: text.length * 7})})})};
const code = fs.readFileSync(path.join(__dirname, '../js/sxml-diagram.js'), 'utf8');
vm.runInThisContext(code.replace('    protectHeadings(boxes, edges, info);', ''));
const baseline = SXMLDiagram;
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
(async () => {
  let reproduced = 0, checks = 0;
  for (const direction of ['RIGHT','DOWN']) for (const spacing of [0,50,100]) for (const padding of ['50','100','150']) for (const collapsed of [false,true]) for (const rich of [false,true]) {
    const model = fixture(rich), snapshot = JSON.stringify(model.transitions.map(t => ({key:t.key,to:t.to,on:t.on})));
    const options = {...D.spacingOptions(direction, spacing, spacing), ...D.experimentOptions({padding}), 'studio.collapsed': new Set(collapsed ? ['start'] : [])};
    const before = await baseline.layout(model, direction, options), after = await D.layout(model, direction, options);
    reproduced += collisions(before).length;
    assert.deepEqual(collisions(after), [], direction + ' spacing ' + spacing + ' padding ' + padding);
    assert.deepEqual([...after.boxes], [...before.boxes], 'Routing must not move states, headings or initial dots.');
    assert.equal(after.width, before.width); assert.equal(after.height, before.height);
    for (const edge of after.edges) {
      const old = before.edges.find(e => e.id === edge.id);
      assert.deepEqual(edge.points[0], old.points[0], 'Keep the source attached to its original node port.');
      assert.deepEqual(edge.points.at(-1), old.points.at(-1), 'Keep the target attached to its original node port.');
      assert.deepEqual(edge.labels, old.labels, 'Keep transition labels in place.');
      if (!collisions({...before, edges:[old]}).length) assert.deepEqual(edge.points, old.points, 'Leave clear routes untouched.');
    }
    assert.equal(JSON.stringify(model.transitions.map(t => ({key:t.key,to:t.to,on:t.on}))), snapshot);
    checks++;
  }
  assert(reproduced > 0, 'The regression must reproduce heading crossings before the fix.');
  console.log('Checked ' + checks + ' layouts in both directions, spacing/padding extremes, history, initial arrows, compound boundaries, self-loops, final names and collapse; repaired ' + reproduced + ' heading crossings.');
})().catch(error => {console.error(error); process.exitCode = 1;});
