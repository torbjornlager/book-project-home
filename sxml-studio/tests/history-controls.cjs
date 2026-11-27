const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const app = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
const buttons = {undo: {}, redo: {}}, calls = [];
let history = {undo: 2, redo: 1}, sourceKeys;
const editor = {historySize: () => history, undo: () => calls.push('undo'), redo: () => calls.push('redo'), getInputField: () => ({setAttribute() {}})};
const context = {run: {pid: null, starting: false}, $: id => buttons[id], updateChrome() {},
  CodeMirror: {fromTextArea(el, options) {sourceKeys = options.extraKeys; return editor;}},
  diagram: {fit: () => calls.push('fit')}, removeSelected: () => calls.push('delete')};
vm.createContext(context);
vm.runInContext(app.slice(app.indexOf('const editor = CodeMirror.fromTextArea'), app.indexOf('/* ---------- state ---------- */')), context);
for (const name of ['syncHistoryControls', 'changeHistory', 'diagramKey']) vm.runInContext(app.match(new RegExp('function ' + name + '\\([^]*?\\n\\}'))[0], context);
for (const line of app.split('\n').filter(line => /^\$\('(undo|redo)'\)\.onclick/.test(line))) vm.runInContext(line, context);
function key(name, shiftKey = false, metaKey = true) {
  let prevented = false;
  context.diagramKey({key: name, shiftKey, metaKey, ctrlKey: !metaKey, preventDefault() {prevented = true;}});
  assert(prevented, 'History shortcuts must not fall through to browser history.');
}
context.syncHistoryControls();
assert.equal(buttons.undo.disabled, false); assert.equal(buttons.redo.disabled, false);
buttons.undo.onclick(); buttons.redo.onclick();
assert.deepEqual(calls, ['undo', 'redo']);
for (const state of [{pid: null, starting: true}, {pid: 'live', starting: false}]) {
  Object.assign(context.run, state); context.syncHistoryControls();
  assert(buttons.undo.disabled && buttons.redo.disabled);
  assert.match(buttons.undo.title, /Stop the chart to undo edits/);
  assert.match(buttons.redo.title, /Stop the chart to redo edits/);
  const before = calls.length, beforeHistory = JSON.stringify(history);
  buttons.undo.onclick(); buttons.redo.onclick();
  key('z'); key('z', true); key('y', false, false);
  for (const shortcut of ['Ctrl-Z', 'Cmd-Z', 'Shift-Ctrl-Z', 'Shift-Cmd-Z', 'Ctrl-Y', 'Cmd-Y']) sourceKeys[shortcut]();
  assert.equal(calls.length, before, 'Toolbar, diagram and source history actions must be inert while starting or running.');
  assert.equal(JSON.stringify(history), beforeHistory, 'Blocked shortcuts must preserve edit history.');
}
Object.assign(context.run, {pid: null, starting: false}); context.syncHistoryControls();
assert(!buttons.undo.disabled && !buttons.redo.disabled, 'Stop must restore available history actions.');
key('z'); key('z', true); key('y', false, false);
sourceKeys['Cmd-Z'](); sourceKeys['Shift-Ctrl-Z']();
assert.deepEqual(calls.slice(-5), ['undo', 'redo', 'redo', 'undo', 'redo']);
history = {undo: 0, redo: 0}; context.syncHistoryControls();
assert(buttons.undo.disabled && buttons.redo.disabled);
const before = calls.length; buttons.undo.onclick(); buttons.redo.onclick();
assert.equal(calls.length, before);
context.diagramKey({key: 'Delete', preventDefault() {}});
assert.equal(calls.at(-1), 'delete', 'Deleting through the canvas keyboard must remain available.');
console.log('Checked history button states, edit-only tooltips, guarded source/diagram shortcuts, preserved history across runs and retained canvas deletion.');
