const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const app = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
const elements = Object.fromEntries(['layout-selection-title', 'layout-region-options', 'layout-region-hint', 'layout-region-arrangement'].map(id => [id, {}]));
elements['layout-region-arrangement'].options = ['DOWN', 'RIGHT', 'AUTO'].map(value => ({value}));
let selected = null, safe = true, commits = 0;
const context = {
  $: id => elements[id], selEl: {}, entryFor: () => selected,
  model: {doc: {}, layout: {first: {'@regions': 'RIGHT', child: [10, 20]}, second: {'@regions': 'AUTO'}, '@direction': 'DOWN'}},
  run: {pid: null, starting: false}, guard: () => !context.run.pid,
  SXMLDiagram: {canArrangeRegions: () => safe},
  SXML: {setLayout(doc, layout) {assert.equal(doc, context.model.doc); context.model.layout = layout;}},
  diagram: {userMoved: true, pending: Promise.resolve()},
  commit() {commits++;}, showSpacingSize() {}
};
for (const name of ['syncRegionArrangement', 'changeRegionArrangement']) vm.runInNewContext(app.match(new RegExp('function ' + name + '\\([^]*?\\n\\}'))[0], context);
const sync = () => context.syncRegionArrangement();
const control = elements['layout-region-arrangement'];
sync();
assert(elements['layout-region-options'].hidden);
assert(control.disabled);
assert.match(elements['layout-region-hint'].textContent, /Select a parallel state/);
selected = {kind: 'state', id: 'ordinary', key: 'ordinary'}; sync();
assert(elements['layout-region-options'].hidden);
selected = {kind: 'parallel', id: 'first', key: 'first'}; sync();
assert(!elements['layout-region-options'].hidden);
assert.equal(elements['layout-selection-title'].textContent, 'Selected parallel state — first');
assert.equal(control.value, 'RIGHT');
assert(!control.disabled);
context.changeRegionArrangement('DOWN');
assert.equal(commits, 1);
assert.equal(JSON.stringify(context.model.layout.first), '{"child":[10,20]}', 'Resetting this state must preserve saved child positions.');
assert.equal(context.model.layout.second['@regions'], 'AUTO', 'Another parallel state must retain its arrangement.');
assert.equal(context.model.layout['@direction'], 'DOWN');
assert(!context.diagram.userMoved);
sync(); assert.equal(control.value, 'DOWN');
selected = {kind: 'parallel', id: 'second', key: 'second'}; sync();
assert.equal(control.value, 'AUTO');
context.changeRegionArrangement('RIGHT');
assert.equal(context.model.layout.second['@regions'], 'RIGHT', 'The control must use the current selection.');
assert.equal(JSON.stringify(context.model.layout.first), '{"child":[10,20]}');
safe = false; sync();
assert(control.options.filter(o => o.value !== 'AUTO').every(o => o.disabled));
assert(!control.options.find(o => o.value === 'AUTO').disabled);
assert.match(elements['layout-region-hint'].textContent, /transitions cross region boundaries/);
const beforeBlocked = commits;
context.changeRegionArrangement('DOWN'); assert.equal(commits, beforeBlocked);
context.changeRegionArrangement('AUTO'); assert.equal(commits, beforeBlocked + 1);
for (const state of [{pid: 'running', starting: false}, {pid: null, starting: true}]) {
  Object.assign(context.run, state); sync(); assert(control.disabled);
  const before = commits; context.changeRegionArrangement('AUTO'); assert.equal(commits, before);
}
Object.assign(context.run, {pid: null, starting: false});
selected = {kind: 'state'};
const before = commits; context.changeRegionArrangement('RIGHT'); assert.equal(commits, before);
console.log('Checked selection scope, saved arrangements, preservation of other layout data, cross-region restrictions and run/start guards.');
