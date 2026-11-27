const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname,'../js/studio-tools.js'),'utf8');
const sent = [], box = {children:[],contains:()=>false,replaceChildren(...children){this.children=children;}};
const context = {$:()=>box,document:{activeElement:null},run:{pid:'chart@localhost'},paused:false,eventDraft:'',
  h:(tag,attrs,...children)=>({tag,...attrs,children}),safeSend:text=>sent.push(text)};
vm.createContext(context);vm.runInContext(source.match(/  function renderPalette\(\) \{[\s\S]*?\n  \}/)[0],context);
function render(){context.renderPalette(); const form=box.children[0];return {form,input:form.children[0],button:form.children[1]};}
let row=render();
assert.equal(row.form.tag,'form');assert.equal(row.form.children.length,2);
assert.equal(row.input.tag,'input');assert.equal(row.input['aria-label'],'Event as a Prolog term');
assert.equal(row.button.children[0],'!');assert.equal(row.button['aria-label'],'Send event');
assert(row.button.disabled);
row.input.value='input([a,red,box]).';row.input.oninput({target:row.input});
assert.equal(row.button.disabled,false);
let prevented=0;row.form.onsubmit({preventDefault(){prevented++;}});
assert.deepEqual(sent,['input([a,red,box]).']);assert.equal(prevented,1,'Enter/click submission must not navigate.');
row=render();assert.equal(row.input.value,'input([a,red,box]).','Preserve the entry after send and trace refresh.');
box.contains=()=>true;const old=box.children[0];context.renderPalette();assert.equal(box.children[0],old,'Do not replace a focused input during trace playback.');box.contains=()=>false;
row.input.value='   ';row.input.oninput({target:row.input});assert(row.button.disabled);
row.form.onsubmit({preventDefault(){}});assert.equal(sent.length,1);
for(const state of [{pid:null},{starting:true},{busy:true},{done:true}]) {
  context.run={pid:'chart@localhost',...state};context.eventDraft='e';row=render();
  assert(row.input.disabled);assert(row.button.disabled);row.form.onsubmit({preventDefault(){}});
}
context.run={pid:'chart@localhost'};context.paused=true;row=render();assert(row.button.disabled);
row.form.onsubmit({preventDefault(){}});assert.equal(sent.length,1);
assert(source.includes("'Send any event'"));
console.log('Checked one Prolog-term input, ! button, Enter submission, empty/stopped/busy/paused guards, retained drafts and focused typing.');
