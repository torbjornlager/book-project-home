const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const app = fs.readFileSync(require('node:path').join(__dirname, '../js/app.js'), 'utf8');
const handlers = {}, classes = new Set();
let capture = null;
const heading = {
  addEventListener(name, fn) { handlers[name] = fn; },
  setPointerCapture(id) { capture = id; }, hasPointerCapture(id) { return capture === id; },
  releasePointerCapture() { capture = null; },
  classList: { add(name) { classes.add(name); }, remove(name) { classes.delete(name); } }
};
const panel = { style: {}, matches: () => true, getBoundingClientRect: () => ({ left: parseFloat(panel.style.left) || 100, top: parseFloat(panel.style.top) || 80, width: 280, height: 500 }) };
const context = { window: { innerWidth: 1000, innerHeight: 800 }, $: id => id === 'layout-title' ? heading : id === 'layout-popover' ? panel : { getBoundingClientRect: () => ({ left: 100, bottom: 74 }) } };
vm.runInNewContext(app.slice(app.indexOf('let layoutPopoverPosition = null;'), app.indexOf("$('layout-popover').addEventListener")), context);
const emit = (type, props = {}) => handlers[type]({button: 0, isPrimary: true, pointerId: 1, clientX: 120, clientY: 100, preventDefault() {}, ...props});
context.positionLayoutPopover();
emit('pointerdown'); emit('pointermove', {clientX: 320, clientY: 200});
assert.equal(panel.style.left, '300px'); assert.equal(panel.style.top, '180px');
emit('pointermove', {pointerId: 2, clientX: 0}); assert.equal(panel.style.left, '300px');
emit('pointermove', {clientX: 2000, clientY: 2000});
assert.equal(panel.style.left, '708px'); assert.equal(panel.style.top, '288px');
emit('pointercancel'); assert.equal(capture, null); assert(!classes.has('dragging'));
emit('pointermove', {clientX: 0}); assert.equal(panel.style.left, '708px');
context.positionLayoutPopover(); assert.equal(panel.style.left, '708px', 'Reopening retains the chosen position.');
emit('keydown', {key: 'ArrowLeft', shiftKey: true}); assert.equal(panel.style.left, '668px');
context.window.innerWidth = 500; context.positionLayoutPopover(); assert.equal(panel.style.left, '208px');
emit('pointerdown', {button: 2}); assert.equal(capture, null);
console.log('Checked dragging, pointer cancellation, viewport limits, retained placement and keyboard movement.');
