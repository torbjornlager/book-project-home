const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
global.window = global;
global.document = {
  createElement: () => ({getContext: () => ({})}),
  createElementNS: () => ({setAttribute() {}, remove() {}})
};
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../js/sxml-diagram.js'), 'utf8'));
const {parseTrigger, editableTrigger, doubleClickIntent} = SXMLDiagram;

// Label notation round-trips.
const cases = [
  ['start(Job)', {on: 'start(Job)', after: null, cond: null}],
  ['start(Job) [Job > 2]', {on: 'start(Job)', after: null, cond: 'Job > 2'}],
  ['after 2', {on: null, after: '2', cond: null}],
  ['after 0.5s [ready]', {on: null, after: '0.5', cond: 'ready'}],
  ['[X == a]', {on: null, after: null, cond: 'X == a'}],
  ['', {on: null, after: null, cond: null}],
  ['data([1,2])', {on: 'data([1,2])', after: null, cond: null}],
  ['[a,b]', {on: null, after: null, cond: 'a,b'}],
  ['msg(L) [member(x, [a,b])]', {on: 'msg(L)', after: null, cond: 'member(x, [a,b])'}],
  ["say(X) [X \\== ']']", {on: 'say(X)', after: null, cond: "X \\== ']'"}],
  ['  tick   [ n  >  1 ] ', {on: 'tick', after: null, cond: 'n > 1'}],
  ['after', {on: 'after', after: null, cond: null}],
];
for (const [text, expected] of cases) assert.deepEqual(parseTrigger(text), expected, text);
for (const t of [{on: 'go(X)', cond: 'X > 1'}, {after: '3'}, {cond: 'ok'}, {on: 'e'}])
  assert.deepEqual(parseTrigger(editableTrigger(t)), {on: t.on ?? null, after: t.after ?? null, cond: t.cond ?? null});
assert.equal(editableTrigger({on: 'go', cond: '   '}), 'go');

// Double-click intent.
const box = {x: 0, y: 0, w: 100, h: 120};
const atomic = {kind: 'state', compound: false}, compound = {kind: 'state', compound: true}, par = {kind: 'parallel', compound: true};
assert.equal(doubleClickIntent(atomic, box, {x: 10, y: 10}), 'rename', 'name compartment');
assert.equal(doubleClickIntent(atomic, box, {x: 10, y: 60}), 'open', 'atomic body opens the Inspector');
assert.equal(doubleClickIntent(atomic, box, {x: 10, y: 60}, true), 'rename', 'name text');
assert.equal(doubleClickIntent(compound, box, {x: 10, y: 60}), 'add');
assert.equal(doubleClickIntent(par, box, {x: 10, y: 60}), 'add');
assert.equal(doubleClickIntent(compound, box, {x: 10, y: 60}, false, true), 'open', 'collapsed compound');
assert.equal(doubleClickIntent({kind: 'final'}, box, {x: 10, y: 60}), 'rename');
assert.equal(doubleClickIntent({kind: 'history'}, box, {x: 10, y: 10}), 'open');

// The pointer handler reports double-clicks, including on empty canvas.
const listeners = {}, doubles = [], selects = [];
const svg = {addEventListener: (type, fn) => listeners[type] = fn, focus() {}, setPointerCapture() {}, releasePointerCapture() {}, classList: {add() {}, remove() {}}};
const diagram = {svg, tx: 0, ty: 0, k: 1, readOnly: false, running: false, nodeEls: new Map(), overlay: {},
  h: {onSelect: key => selects.push(key), onDouble: (key, info) => doubles.push([key, info.onName, info.point])},
  _point: e => ({x: e.clientX, y: e.clientY}), _apply() {}, closeEditor() {}, _editable: SXMLDiagram.Diagram.prototype._editable};
SXMLDiagram.Diagram.prototype._bind.call(diagram);
function click(target) {
  const e = {button: 0, pointerId: 1, clientX: 5, clientY: 7, target, preventDefault() {}};
  listeners.pointerdown(e); listeners.pointerup({...e, type: 'pointerup'});
}
const canvas = {closest: () => null, classList: {contains: () => false}};
click(canvas); click(canvas);
assert.deepEqual(doubles, [['#root', false, {x: 5, y: 7}]]);
const name = {getAttribute: () => 'idle', closest(sel) { return sel === '[data-key]' ? this : null; }, classList: {contains: c => c === 'name'}};
click(name); click(name);
assert.deepEqual(doubles[1].slice(0, 2), ['idle', true]);
console.log('canvas-editing: ok');
