const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../js/studio-tools.js'), 'utf8');
const sent = [], context = {model:{examples:['$Pid ! input([a, red, box])','$Pid ! input([blue])','inspect_chart($Pid)']},run:{pid:'chart@localhost'},paused:false,
  h:(tag,attrs,...children)=>({tag,attrs,children}),button:(text,onclick,attrs)=>({text,onclick,...attrs}),safeSend:event=>sent.push(event)};
vm.createContext(context);
vm.runInContext(source.match(/  function exampleEventButtons\(\) \{[\s\S]*?\n  \}/)[0], context);
let section = context.exampleEventButtons();
assert.equal(section.attrs['aria-label'],'Example events');
const buttons = section.children[1].children;
assert.deepEqual(Array.from(buttons,b=>b.text),['input([a, red, box])','input([blue])']);
assert(buttons.every(b=>!b.disabled));
buttons[0].onclick(); buttons[1].onclick();
assert.deepEqual(sent,['input([a, red, box])','input([blue])']);
for (const state of [{pid:null},{starting:true},{busy:true},{done:true}]) {
  context.run = {pid:'chart@localhost',...state};
  assert(context.exampleEventButtons().children[1].children.every(b=>b.disabled));
}
context.run = {pid:'chart@localhost'}; context.paused = true;
assert(context.exampleEventButtons().children[1].children.every(b=>b.disabled));
context.paused = false; context.model.examples = ['inspect_chart($Pid)'];
assert.equal(context.exampleEventButtons(),null);
// Event shortcuts have moved out of the collapsed query console; custom queries remain.
const app = fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');
const box = {children:[],parentElement:{},replaceChildren(){this.children=[];},append(el){this.children.push(el);}};
const goals = [], ctx = {model:{examples:['$Pid ! e','inspect_chart($Pid)']},$:()=>box,document:{createElement:()=>({})},runGoal:goal=>goals.push(goal)};
vm.createContext(ctx);vm.runInContext(app.match(/function renderSuggestions\(\) \{[\s\S]*?\n\}/)[0],ctx);
ctx.renderSuggestions(); assert.equal(box.children.length,1);
assert.equal(box.children[0].textContent,'?- inspect_chart($Pid).');
box.children[0].onclick(); assert.deepEqual(goals,['inspect_chart($Pid)']);
console.log('Checked visible example-event labels/payloads, stopped/start/busy/done/paused states, empty lists and preserved custom query suggestions.');
