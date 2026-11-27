const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const app=fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');
const seen=[],context={run:{queue:[{text:'event'},{text:'configuration'},{text:'output'}],timer:1,busy:false,pid:'chart@localhost'},
  play:item=>{seen.push(item.text);return true;},window:{studioTools:{controls(){seen.push('controls');}}},
  setTimeout(){throw Error('Live output must not be delayed for animation.');}};
vm.createContext(context);vm.runInContext(app.match(/function drain\(\) \{[\s\S]*?\n\}/)[0],context);
context.drain();assert.deepEqual(seen,['event','configuration','output','controls']);assert.equal(context.run.queue.length,0);assert.equal(context.run.timer,null);
let scheduled;
context.setTimeout=(fn,delay)=>{scheduled={fn,delay};return 1;};
context.run.queue=[{text:'startup trace'}];context.run.busy=true;context.run.pid=null;context.drain();
assert.equal(context.run.queue.length,1,'Keep startup observations until the chart identity is known.');
context.run.busy=false;context.run.pid='chart@localhost';scheduled.fn();assert.equal(context.run.queue.length,0);
const log={children:[],scrollTop:100,clientHeight:100,scrollHeight:200,
  append(el){this.children.push(el);this.scrollHeight+=20;},get childElementCount(){return this.children.length;},
  get firstChild(){return {remove:()=>this.children.shift()};}};
const logging={$:()=>log,document:{createElement:()=>({parts:[],append(value){this.parts.push(value);}})}};
vm.createContext(logging);vm.runInContext(app.match(/function logRow\(cls, parts\) \{[\s\S]*?\n\}/)[0],logging);
logging.logRow('trace',['event ','e']);logging.logRow('out','Hello');logging.logRow('err','An error');
assert.deepEqual(log.children.map(row=>row.className),['trace','out','err']);
assert.equal(log.scrollTop,log.scrollHeight,'Follow live entries while at the bottom.');
log.scrollTop=0;log.scrollHeight=500;logging.logRow('out','Another line');assert.equal(log.scrollTop,0,'Do not interrupt reading older output.');
for(let i=0;i<1500;i++)logging.logRow('out',String(i));assert.equal(log.children.length,1500,'Keep the live log bounded.');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
assert(html.includes('Trace and output'));assert(html.includes('role="log"'));
assert(!/id="(?:suggestions|show-trace)"/.test(html));
console.log('Checked live trace/output ordering, startup queuing, message/error rendering, follow-scroll, bounded log and the simplified Run markup.');
// The displayed event uses its event term, while transport-only bindings stay hidden.
(async()=>{
  const entries=[], answer={type:'success',data:[{Ref:'internal-ref',From:'worker@localhost',Event:'e'}]};
  const sandbox={run:{pid:'chart@localhost',generation:1,busy:false,starting:false},window:{},editor:{getValue:()=>'<statechart/>'},
    ensureNode:async()=>({query:async()=>answer}),runControls(){},enqueue:item=>entries.push(item),status(){},showSide(){},logRow(){}};
  vm.createContext(sandbox);vm.runInContext(app.match(/async function runGoal\(raw, options = \{\}\) \{[\s\S]*?\n\}/)[0],sandbox);
  await sandbox.runGoal('transport_request',{label:'$Pid ! e',hideAnswer:true});
  assert.equal(entries.length,1);assert.equal(entries[0].text,'?- $Pid ! e.');
  entries.length=0;await sandbox.runGoal('ordinary_query');
  assert.equal(entries[1].type,'answer','Normal query results must still be logged.');
  entries.length=0;answer.type='failure';await sandbox.runGoal('bad_event',{label:'$Pid ! invalid',hideAnswer:true});
  assert.equal(entries[1].text,'false','Failure feedback must remain visible.');
  console.log('Checked readable event entries, hidden transport-only bindings and preserved results/failure feedback.');
})().catch(error=>{console.error(error);process.exitCode=1;});
