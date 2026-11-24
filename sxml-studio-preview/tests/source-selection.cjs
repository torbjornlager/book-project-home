const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
const functions = source.slice(source.indexOf('function clearSelectionMarker()'), source.indexOf('/* Cursor in the source selects'));
const element = {}, root = {}, added = [], removed = [], scrolled = [];
let focused = false, height = 100, range = {start: 5, end: 8};
const sandbox = {
  selectionLines: [], selEl: element, located: {map: new Map([[element, range]])},
  model: {doc: {documentElement: root}},
  editor: {
    operation: fn => fn(),
    posFromIndex: index => ({line: Math.floor(index), ch: index % 1 ? 5 : 0}),
    addLineClass: (line, where, name) => { assert.equal(where, 'gutter'); assert.equal(name, 'source-selection-gutter'); added.push(line); return line; },
    removeLineClass: line => removed.push(line),
    hasFocus: () => focused,
    getScrollInfo: () => ({top: 100, clientHeight: height}),
    charCoords: pos => ({top: pos.line * 20, bottom: (pos.line + 1) * 20}),
    scrollTo: (left, top) => scrolled.push({left, top})
  }
};
vm.createContext(sandbox);
vm.runInContext(functions, sandbox);
function mark(start, end, scroll = true) {
  Object.assign(range, {start, end});
  added.length = scrolled.length = 0;
  sandbox.markSelection(scroll);
}
mark(5, 8);
assert.deepEqual(added, [5,6,7], 'An exclusive range end must not mark the next line.');
assert.equal(scrolled.length, 0, 'Visible selections must not scroll.');
mark(3, 6);
assert.equal(scrolled.length, 0, 'Partly visible selections must not scroll.');
assert.deepEqual(removed, [5,6,7], 'Changing selection must clear the previous gutter marker.');
mark(1, 20);
assert.equal(scrolled.length, 0, 'Large compound states spanning the viewport must not scroll.');
mark(15, 16);
assert.deepEqual(scrolled, [{left: null, top: 275}], 'Off-screen selections must reveal the opening line and preserve horizontal scroll.');
mark(1, 2);
assert.deepEqual(scrolled, [{left: null, top: 0}]);
focused = true;
mark(15, 16);
assert.equal(scrolled.length, 0, 'Typing in source must not move the viewport.');
focused = false; height = 0;
mark(15, 16);
assert.equal(scrolled.length, 0, 'Hidden source panes must not scroll.');
height = 100;
mark(15, 16, false);
assert.equal(scrolled.length, 0);
sandbox.selEl = root;
sandbox.markSelection(true);
assert.equal(sandbox.selectionLines.length, 0);
console.log('Checked gutter ranges, clearing, visible and off-screen selections, focus, hidden panes and horizontal scroll preservation.');
