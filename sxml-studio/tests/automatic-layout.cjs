const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
global.window = global;
global.XMLSerializer = class {};
global.ELK = require('../vendor/elk.bundled.js');
global.document = {createElement: () => ({getContext: () => ({measureText: text => ({width: text.length * 7})})})};
for (const file of ['sxml-model.js', 'sxml-diagram.js']) vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../js', file), 'utf8'));
function docWithLayout(layout) {
  const doc = {childNodes: [], getElementsByTagName: () => [], createComment(data) {
    return {nodeType: 8, data, remove() {doc.childNodes.splice(doc.childNodes.indexOf(this), 1);}};
  }, appendChild(node) {this.childNodes.push(node);}};
  doc.appendChild(doc.createComment(' <layout>\n' + JSON.stringify(layout) + '\n'));
  return doc;
}
for (const direction of ['RIGHT', 'DOWN']) for (const regions of ['RIGHT', 'DOWN', 'AUTO']) {
  const legacy = {'@direction': direction, '#root': {parent: [300, 800], '#root/datamodel0': [4000, 5000]}, parent: {a: [200, 400], 'a/go0>0': [500, 600], '@regions': regions}, other: {'@regions': 'RIGHT', b: [90, 100]}};
  const expected = {'@direction': direction, parent: {'@regions': regions}, other: {'@regions': 'RIGHT'}};
  const original = JSON.stringify(legacy), doc = docWithLayout(legacy);
  assert.deepEqual(SXML.getLayout(doc), expected, 'Reading old metadata must ignore every coordinate.');
  assert(SXML.discardManualPositions(doc));
  assert.deepEqual(JSON.parse(doc.childNodes[0].data.replace(/^\s*<layout>/, '')), expected);
  assert(!SXML.discardManualPositions(doc), 'Migration must be idempotent.');
  assert.equal(JSON.stringify(legacy), original, 'Filtering must not mutate the input.');
  SXML.setLayout(doc, legacy);
  assert.deepEqual(SXML.getLayout(doc), expected, 'Writing layout data must never reintroduce positions.');
}
const onlyPositions = docWithLayout({'#root': {a: [1, 2]}, a: {'a/go0>0': [3, 4]}});
assert(SXML.discardManualPositions(onlyPositions));
assert.equal(onlyPositions.childNodes.length, 0, 'Remove the layout comment when no preferences remain.');
function state(id, kind = 'state') {return {id, key: id, kind, children: [], initial: '', datamodels: [], spawns: [], onentry: [], onexit: [], defers: [], transitions: []};}
const root = state('#root', 'statechart'), parent = state('parent'), a = state('a'), b = state('b'), outside = state('outside');
root.children = [parent, outside]; root.initial = 'parent';
parent.children = [a, b]; parent.initial = 'a'; parent.parent = root; outside.parent = root; a.parent = parent; b.parent = parent;
const dm = {key: '#root/datamodel0', body: 'value(1).'}; root.datamodels = [dm];
const edge = {key: 'a/go0', source: a, to: ['b'], on: 'next', body: '', index: 0}; a.transitions = [edge];
const model = {root, nodes: [root, parent, a, b, outside], byId: new Map([parent, a, b, outside].map(n => [n.id, n])), transitions: [edge], nested: new Map(), layout: null};
function geometry(geo) {return {width: geo.width, height: geo.height, boxes: [...geo.boxes], edges: geo.edges};}
(async () => {
  for (const direction of ['RIGHT', 'DOWN']) {
    model.layout = null;
    const baseline = await SXMLDiagram.layout(model, direction);
    model.layout = {'@direction': direction, '#root': {parent: [900, 900], outside: [-100, -100], [dm.key]: [6000, 5000]}, parent: {a: [1000, 3000], b: [4000, 100]}, a: {'a/go0>0': [700, 600]}};
    const before = JSON.stringify(model.layout);
    const automatic = await SXMLDiagram.layout(model, direction);
    assert.deepEqual(geometry(automatic), geometry(baseline), 'Legacy state, label and note positions must not change ELK geometry or routing.');
    assert.equal(JSON.stringify(model.layout), before, 'Rendering must not mutate source metadata.');
  }
  console.log('Checked removal of legacy state/label/note positions, preserved direction/regions, idempotent migration and automatic routing in both directions.');
})().catch(error => {console.error(error); process.exitCode = 1;});
