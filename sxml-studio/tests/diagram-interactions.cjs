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
  svg, tx: 0, ty: 0, k: 1, running: false, readOnly: true,
  h: {onSelect: key => selected.push(key), onMove: () => edits++, onRetarget: () => edits++, onConnect: (a,b) => connected.push([a,b])},
  overlay: {appendChild() {}}, nodeEls: new Map(),
  _point: event => ({x: event.clientX, y: event.clientY}),
  _stateAt: () => 'target', _apply() {}
};
SXMLDiagram.Diagram.prototype._bind.call(diagram);
function target(key, state = false, note = false) {
  return {getAttribute: () => key, closest(selector) {
    return selector === '[data-key]' || (state && selector === '[data-state]') || (note && selector === '[data-note]') ? this : null;
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
assert.equal(edits, 0, 'Read-only or running object drags must not edit anything.');
diagram.running = false;
diagram.readOnly = false;
diagram.geo = {boxes: new Map([['state', {x: 10, y: 20, w: 100, h: 50}], ['note', {x: 0, y: 0, w: 80, h: 40}]])};
const moved = [];
diagram.h.onMove = (...args) => moved.push(args);
diagram.k = 2;
gesture(target('state', true));
gesture(target('note', false, true));
assert.deepEqual(moved, [['state', 50, 30], ['note', 50, 30]], 'Manual moves must account for zoom.');
gesture(target('state', true), true, true);
assert.equal(moved.length, 2, 'Cancelling a drag must not commit a move.');
gesture(target('transition'));
assert.equal(edits, 0, 'Transition retargeting must remain disabled.');
diagram.k = 1;
gesture({closest(selector) { return selector === '.edge' ? this : null; }});
assert.equal(diagram.tx, 0, 'Initial transition arrows must not pan when dragged.');
diagram.running = false;
gesture({closest: () => null});
assert.equal(diagram.tx, 100, 'Empty-canvas dragging must still pan.');
assert.equal(diagram.ty, 60);
diagram.tool = 'connect';
gesture(target('source', true));
assert.deepEqual(connected, [['source', 'target']], 'The explicit Transition tool must still create transitions.');
console.log('Checked manual state/note moves, zoom, cancellation, disabled transition retargeting, read-only runs, panning and transition creation.');

// Real diagrams preview the moved object and restore original geometry before
// the commit callback (or cancellation). Exercise this through pointer events.
diagram.tool = null;
const originalGeo = diagram.geo, previews = [];
diagram._render = () => {};
diagram._previewDrag = (drag, dx, dy) => {
  drag.originalGeo = originalGeo;
  previews.push([dx, dy]);
  diagram.geo = {preview: true};
};
diagram.h.onMove = () => assert.strictEqual(diagram.geo, originalGeo);
gesture(target('state', true));
assert.deepEqual(previews.at(-1), [100, 60]);
assert.strictEqual(diagram.geo, originalGeo);
gesture(target('state', true), true, true);
assert.strictEqual(diagram.geo, originalGeo, 'Cancel must restore the original drawing.');
console.log('Checked live state-drag dispatch and original geometry restoration before commit and cancellation.');
