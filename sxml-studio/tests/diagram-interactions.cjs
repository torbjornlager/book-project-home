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
const listeners = {}, selected = [], connected = [];
let edits = 0;
const svg = {
  addEventListener: (type, listener) => listeners[type] = listener,
  focus() {}, setPointerCapture() {}, releasePointerCapture() {},
  classList: {add() {}, remove() {}}
};
const diagram = {
  svg, tx: 0, ty: 0, k: 1, running: false, readOnly: false,
  h: {onSelect: key => selected.push(key), onMove: () => edits++, onRetarget: () => edits++, onConnect: (a,b) => connected.push([a,b])},
  overlay: {appendChild() {}}, nodeEls: new Map(),
  _point: event => ({x: event.clientX, y: event.clientY}),
  _stateAt: () => 'target', _apply() {}
};
SXMLDiagram.Diagram.prototype._bind.call(diagram);
function target(key, state = false) {
  return {getAttribute: () => key, closest(selector) {
    return selector === '[data-key]' || (state && selector === '[data-state]') ? this : null;
  }};
}
function gesture(object, moved = true, cancel = false) {
  const event = {button: 0, pointerId: 1, clientX: 10, clientY: 10, target: object, preventDefault() {}};
  listeners.pointerdown(event);
  if (moved) listeners.pointermove({...event, clientX: 110, clientY: 70});
  const type = cancel ? 'pointercancel' : 'pointerup';
  listeners[type]({...event, type, clientX: moved ? 110 : 10, clientY: moved ? 70 : 10});
}
for (const running of [false, true]) {
  diagram.running = running;
  for (const object of [target('state', true), target('transition'), target('label'), target('note')]) {
    const count = selected.length;
    gesture(object);
    gesture(object, true, true);
    assert.equal(selected.length, count, 'Dragging must not select or send an event.');
    assert.equal(diagram.tx, 0);
    assert.equal(diagram.ty, 0);
    gesture(object, false);
    assert.equal(selected.at(-1), object.getAttribute());
  }
}
assert.equal(edits, 0, 'Object drags must not move or retarget anything.');
gesture({closest(selector) { return selector === '.edge' ? this : null; }});
assert.equal(diagram.tx, 0, 'Initial transition arrows must not pan when dragged.');
diagram.running = false;
gesture({closest: () => null});
assert.equal(diagram.tx, 100, 'Empty-canvas dragging must still pan.');
assert.equal(diagram.ty, 60);
diagram.tool = 'connect';
gesture(target('source', true));
assert.deepEqual(connected, [['source', 'target']], 'The explicit Transition tool must still create transitions.');
console.log('Checked inert object drags, clicks during runs, cancellation, canvas panning and explicit transition creation.');
