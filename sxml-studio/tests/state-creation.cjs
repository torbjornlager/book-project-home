const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
global.window = global;
global.ELK = require('../vendor/elk.bundled.js');
global.document = {createElement: () => ({getContext: () => ({measureText: text => ({width: text.length * 7})})})};
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../js/sxml-diagram.js'), 'utf8'));
const D = SXMLDiagram;
const app = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
const extend = app.match(/async function extendFrom\(key, dir, point\) \{[\s\S]*?\n\}/)[0];
function state(id, kind = 'state') {
  return {id, key: id, kind, children: [], initial: '', datamodels: [], spawns: [], onentry: [], onexit: [], defers: [], transitions: []};
}
(async () => {
  for (const id of ['s', 'state1', 'state123456']) {
    const root = state('#root', 'statechart'), target = state(id);
    root.children = [target]; target.parent = root;
    const model = {root, nodes: [root, target], byId: new Map([[id, target]]), nested: new Map(), transitions: [], layout: null};
    const geo = await D.layout(model, 'RIGHT'), box = geo.boxes.get(id);
    assert.deepEqual(D.emptyStateSize(id), {width: box.w, height: box.h}, 'Placement must use the rendered state dimensions.');
    for (const dir of ['up', 'down', 'left', 'right']) {
      let layoutWrites = 0, additions = 0;
      const source = {key: 'source', kind: 'state', parent: {key: '#root', kind: 'statechart', el: {}}};
      const sb = {x: 100, y: 100, w: 120, h: 80};
      const sandbox = {
        SXMLDiagram: D, model: {doc: {}, byKey: new Map([['source', source]]), layout: null},
        guard: () => true, uniqueEvent: () => 'event_1', commit() {}, entryFor: () => null, status() {},
        SXML: {addState: () => { additions++; return {getAttribute: () => id}; }, addTransition: () => ({setAttribute() {}}), setLayout() { layoutWrites++; }},
        diagram: {geo: {boxes: new Map([['source', sb]])}, pending: Promise.resolve()}
      };
      vm.runInNewContext(extend, sandbox);
      await sandbox.extendFrom('source', dir, null);
      await sandbox.extendFrom('source', dir, {x: 300, y: 450});
      assert.equal(additions, 2, 'Handle clicks and drops must still create states.');
      assert.equal(layoutWrites, 0, 'New states must remain in automatic layout regardless of the handle or drop point.');
    }
    const go = {key: id + '/go0', source: target, to: [id], on: 'event_1', index: 0, body: ''};
    target.transitions = [go, {...go, key: id + '/go1', on: 'event_2', index: 1}];
    model.transitions = target.transitions;
    const numbered = await D.layout(model, 'RIGHT');
    assert.equal(numbered.info.get(go.key + '>0').label.full, '1.event_1', 'Numbered labels must have no space after the dot.');
  }
  console.log('Checked measured sizes, automatic layout after handle creation in all directions and compact numbering for short and long state ids.');
})().catch(error => {console.error(error); process.exitCode = 1;});
