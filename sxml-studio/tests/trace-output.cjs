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
{
  const classes=new Set(),controls={};
  const filteredLog={scrollTop:100,clientHeight:100,scrollHeight:200,classList:{toggle(name,on){if(on)classes.add(name);else classes.delete(name);}}};
  for(const kind of ['trace','output','prolog']) controls['log-'+kind]={checked:true};
  const filters={$:id=>id==='log'?filteredLog:controls[id]};
  vm.createContext(filters);vm.runInContext(app.match(/function applyLogFilters\(\) \{[\s\S]*?\n\}/)[0],filters);
  filters.applyLogFilters();assert.equal(classes.size,0,'All categories start visible.');
  for(const kind of ['trace','output','prolog']) {
    controls['log-'+kind].checked=false;filters.applyLogFilters();
    assert(classes.has('hide-'+kind));
    controls['log-'+kind].checked=true;filters.applyLogFilters();
    assert.equal(classes.size,0,'Each filter can be toggled independently without deleting entries.');
  }
  filteredLog.scrollTop=0;filteredLog.scrollHeight=500;
  controls['log-trace'].checked=false;filters.applyLogFilters();
  assert.equal(filteredLog.scrollTop,0,'Filtering must not force readers to the bottom.');
  for(const kind of ['trace','output','prolog']) assert(html.includes('id="log-'+kind+'" type="checkbox" checked'));
  console.log('Checked independent log filters, default visibility and reading-position preservation.');
}
console.log('Checked live trace/output ordering, startup queuing, message/error rendering, follow-scroll, bounded log and the simplified Run markup.');
// Compact trace labels retain event terms, transition direction, guard results and actions.
{
  const rows=[],s1={transitions:[{cond:'ready(X)'}]},s2={kind:'state'};
  const trace={window:{studioTools:{scope:()=>null}},model:{byId:new Map([['s1',s1],['s2',s2]]),nested:new Map()},
    run:{active:[],fired:new Set(),nested:new Map()},diagram:{setRun(){}},runControls(){},status(){},
    bold:text=>text,h:(tag,attrs,text)=>text,logRow:(kind,parts)=>rows.push(Array.isArray(parts)?parts.join(''):parts)};
  vm.createContext(trace);
  vm.runInContext(app.slice(app.indexOf('function splitTop('),app.indexOf('function firedTransition('))+app.match(/function play\(item\) \{[\s\S]*?\n\}/)[0],trace);
  for(const text of ['external_event(input([red]))','guard_result(s1,0,true)','transition(s1,[s2])',"execution(writeln('red'))",'configuration([s2])']) trace.play({type:'trace',text});
  assert.deepEqual(rows,['ON: input([red])','IF: ready(X) → true','TO: s1 → s2',"DO: writeln('red')",'IN: {s2}']);
  rows.length=0;
  trace.play({type:'trace',text:'internal_event(retry)'});
  trace.play({type:'trace',text:'transition(s1,[])'});
  trace.play({type:'output',text:'Plain program output'});
  assert.deepEqual(rows,['ON: (internal) retry','TO: s1 (stay)','Plain program output']);
  console.log('Checked ON/TO/IF/DO/IN labels, preserved details, internal events, targetless transitions and plain output.');
}
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

// Runtime emits a true result for unguarded transitions; show only real guards.
{
  const rows=[], state={transitions:[{cond:null},{cond:'  '},{cond:'ready(X)'},{cond:' true '},{cond:'X < 3,\n    allowed(X)'}]};
  const nested={byId:new Map([['s1',state]])};let scope=null;
  const trace={window:{studioTools:{scope:()=>scope}},model:{byId:new Map([['s1',state]]),nested:new Map([['child',nested]])},
    termOf:input=>({name:'guard_result',args:input.split('|')}),unquote:text=>text.replace(/^'|'$/g,''),logRow:(kind,text)=>rows.push(text)};
  vm.createContext(trace);vm.runInContext(app.match(/function play\(item\) \{[\s\S]*?\n\}/)[0],trace);
  for(const child of [null,'child']) {
    scope=child;rows.length=0;
    trace.play({type:'trace',text:'s1|0|true'});trace.play({type:'trace',text:'s1|1|true'});trace.play({type:'trace',text:'s1|3|true'});
    assert.equal(rows.length,0,'No explicit guard means no guard-result noise.');
    trace.play({type:'trace',text:"'s1'|2|true"});trace.play({type:'trace',text:'s1|2|false'});
    assert.equal(rows.length,2,'Keep both passed and failed outcomes for explicit guards.');
    assert.deepEqual(rows,['IF: ready(X) → true','IF: ready(X) → false']);
    trace.play({type:'trace',text:'unknown|0|true'});assert.equal(rows.length,3,'Do not silently hide unresolved guard results.');
    assert.equal(rows[2],'IF: (guard unavailable) → true');
    trace.play({type:'trace',text:'s1|4|false'});
    assert.equal(rows[3],'IF: X < 3,\n    allowed(X) → false','Keep the complete guard, including line breaks and operators.');
  }
  console.log('Checked implicit/empty guard suppression and explicit true/false guard results for root and inline charts.');
}

{
  const rows=[],trace={window:{studioTools:{scope:()=>null}},model:{},termOf:name=>({name,args:[]}),logRow:(kind,text)=>rows.push(text)};
  vm.createContext(trace);vm.runInContext(app.match(/function play\(item\) \{[\s\S]*?\n\}/)[0],trace);
  assert.equal(trace.play({type:'trace',text:'macrostep_complete'}),false);
  assert.equal(trace.play({type:'trace',text:'microstep'}),false);
  assert.equal(rows.length,0,'Routine step-completion markers should not appear in the log.');
  trace.play({type:'output',text:'Program output'});trace.play({type:'error',text:'An error'});
  assert.deepEqual(rows,['Program output','An error']);
  console.log('Checked hidden macrostep/microstep markers with program output and errors still visible.');
}
