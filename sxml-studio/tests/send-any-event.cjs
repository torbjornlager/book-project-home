const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname,'../js/studio-tools.js'),'utf8');
const sent = [], box = {children:[],contains:()=>false,replaceChildren(...children){this.children=children;},querySelector(tag){return this.children[0].children.find(el=>el.tag===tag);}};
let focused;
const context = {$:()=>box,document:{activeElement:null},run:{pid:'chart@localhost'},paused:false,eventDraft:'',sendGeneration:0,
  h:(tag,attrs,...children)=>({tag,...attrs,children,focus(){focused=this;}}),safeSend:text=>{sent.push(text);return {};}};
vm.createContext(context);vm.runInContext(source.match(/  function renderPalette\(\) \{[\s\S]*?\n  \}/)[0],context);
function render(){context.renderPalette(); const form=box.children[0];return {form,input:form.children[0],button:form.children[1]};}
function type(row,text){row.input.value=text;row.input.oninput({target:row.input});}
const event={preventDefault(){}};
(async()=>{
  let row=render();
  assert.equal(row.form.tag,'form');assert.equal(row.form.children.length,2);
  assert.equal(row.input.tag,'input');assert.equal(row.input['aria-label'],'Event as a Prolog term');
  assert.equal(row.button.children[0],'!');assert.equal(row.button['aria-label'],'Send event');
  assert(row.button.disabled);
  type(row,'input([a,red,box]).');assert.equal(row.button.disabled,false);
  let finish;
  context.safeSend=(text,options)=>{assert.equal(options.waitForPlayback,false);sent.push(text);return new Promise(resolve=>finish=resolve);};
  let prevented=0;
  const pending=row.form.onsubmit({preventDefault(){prevented++;}});
  row=render(); // Runtime state/trace updates replace the original input.
  assert.equal(row.input.value,'input([a,red,box]).');
  finish({});await pending;
  assert.deepEqual(sent,['input([a,red,box]).']);assert.equal(prevented,1,'Return/click must not navigate.');
  assert.equal(row.input.value,'');assert.equal(context.eventDraft,'');assert(row.button.disabled);
  assert.equal(focused,row.input,'Focus the replacement input after successful send.');
  context.safeSend=async text=>{sent.push(text);return undefined;};
  type(row,'invalid(');await row.form.onsubmit(event);
  assert.equal(row.input.value,'invalid(','Keep failed input available for correction.');assert.equal(focused,row.input);
  context.safeSend=text=>new Promise(resolve=>finish=resolve);
  type(row,'first');const concurrent=row.form.onsubmit(event);
  row=render();type(row,'next');finish({});await concurrent;
  assert.equal(row.input.value,'next','Do not erase a new event typed while the previous send settles.');
  type(row,'old_chart');const changed=row.form.onsubmit(event);
  context.sendGeneration++;focused=null;row=render();type(row,'new_chart');finish({});await changed;
  assert.equal(row.input.value,'new_chart');assert.equal(focused,null,'Do not steal focus after changing charts.');
  box.contains=()=>true;const old=box.children[0];context.renderPalette();assert.equal(box.children[0],old);box.contains=()=>false;
  let attempts=0;context.safeSend=()=>{attempts++;return {};};
  row=render();type(row,'   ');assert(row.button.disabled);await row.form.onsubmit(event);
  for(const state of [{pid:null},{starting:true},{busy:true},{done:true}]) {
    context.run={pid:'chart@localhost',...state};context.eventDraft='e';row=render();
    assert(row.input.disabled);assert(row.button.disabled);await row.form.onsubmit(event);
  }
  context.run={pid:'chart@localhost'};context.paused=true;row=render();assert(row.button.disabled);
  await row.form.onsubmit(event);assert.equal(attempts,0);
  // Delivery completion must not wait for queued timeline observations in manual mode.
  let waits=0;
  const delivery={run:{pid:'chart@localhost',queue:[{text:'pending playback'}],timer:1},paused:false,sendGeneration:4,
    quoteAtom:text=>JSON.stringify(text),runGoal:async()=>({type:'success'}),
    settled:async()=>{waits++;},snapshot:()=>({active:['s0']})};
  vm.createContext(delivery);
  vm.runInContext(source.match(/  async function send\(text, options = \{\}\) \{[\s\S]*?\n  \}/)[0],delivery);
  await delivery.send('e',{waitForPlayback:false});assert.equal(waits,0);
  assert.equal(delivery.run.queue.length,1,'Keep playback queued while the field is readied.');
  await delivery.send('e');assert.equal(waits,1,'Other callers retain the settled-snapshot behavior.');
  delivery.runGoal=async()=>({type:'failure'});
  await assert.rejects(delivery.send('invalid(',{waitForPlayback:false}),/Event failed/);
  assert(source.includes("'Send any event'"));
  console.log('Checked !/Return submission, clear/refocus after redraws, failed input, concurrent typing/chart changes, focused typing and run-state guards.');
})().catch(error=>{console.error(error);process.exitCode=1;});
