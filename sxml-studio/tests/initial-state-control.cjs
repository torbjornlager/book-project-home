const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const context = {run: {pid: null, starting: false}, edit: fn => fn(), h: (tag, attrs, ...children) => ({tag, attrs, children})};
context.XMLSerializer = class {};
context.window = context;
vm.runInNewContext(fs.readFileSync(path.join(root, 'js/sxml-model.js'), 'utf8'), context);
assert.equal(context.SXML.blank(), '<statechart version="0.2" initial="s0">\n    <state id="s0"/>\n</statechart>\n');
const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
vm.runInNewContext(app.match(/function initialStateField\(n\) \{[\s\S]*?\n\}/)[0], context);
function element() {return {attrs: {}, setAttribute(k,v) {this.attrs[k]=v;}};}
for (const parentKind of ['statechart', 'state']) {
  const parent = {kind: parentKind, initial: 'first', el: element()};
  for (const kind of ['state', 'parallel']) {
    const n = {id: 'second', kind, parent, el: element()};
    const field = context.initialStateField(n), radio = field.children[1];
    assert.equal(field.children[0].attrs.for, radio.attrs.id, 'Label must activate the radio.');
    assert.equal(radio.attrs.type, 'radio');
    assert.equal(radio.attrs.checked, false, 'A noninitial state must be unselected by default.');
    radio.attrs.onchange({target: {checked: false}});
    assert.equal(parent.el.attrs.initial, undefined);
    radio.attrs.onchange({target: {checked: true}});
    assert.equal(parent.el.attrs.initial, n.id, 'Selecting must update the parent initial attribute.');
    assert.equal(context.selEl, n.el);
    parent.initial = n.id;
    assert.equal(context.initialStateField(n).children[1].attrs.checked, true, 'Existing initial states must be selected.');
    assert.equal(context.initialStateField({...n, id: 'first'}).children[1].attrs.checked, false, 'The previous initial state must be unselected.');
    parent.initial = 'first'; parent.el = element();
  }
}
for (const kind of ['statechart', 'history', 'final']) assert.equal(context.initialStateField({kind}), null);
const regionParent = {kind: 'parallel', el: element()};
const region = {id: 'region', kind: 'state', parent: regionParent, el: element()};
const regionRadio = context.initialStateField(region).children[1];
assert(regionRadio.attrs.disabled, 'Parallel regions enter together and cannot have an initial sibling.');
regionRadio.attrs.onchange({target: {checked: true}});
assert.equal(regionParent.el.attrs.initial, undefined);
context.run.pid = 'running';
assert(context.initialStateField({...region, parent: {kind: 'state', el: element()}}).children[1].attrs.disabled);
console.log('Checked s0 template, initial-state selection for states and parallels, switching siblings, nested parents and disabled controls.');
