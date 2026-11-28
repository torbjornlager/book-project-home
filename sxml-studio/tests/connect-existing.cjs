const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const app = fs.readFileSync(require('node:path').join(__dirname, '../js/app.js'), 'utf8');
const names = ['stateActions', 'stateAction', 'setTool', 'onDiagramClick'];
const code = names.map(name => app.match(new RegExp('function '+name+'\\([^]*?\\n\\}'))[0]).join('\n');
const state = {kind:'state'}, final = {kind:'final'}, parallel = {kind:'parallel'};
const connections = [], messages = [];
let allowed = true, focused = 0;
const sandbox = {model:{byKey:new Map([['source',state],['target',state],['final',final],['parallel',parallel]])},
  run:{pid:null}, diagram:{svg:{focus(){focused++;}}}, guard:()=>allowed,
  $:()=>({classList:{toggle(){}}}), status:message=>messages.push(message),
  connect:(...args)=>connections.push(args), entryByKey:()=>null, select(){}, showSide(){}};
vm.runInNewContext(code,sandbox);
assert(sandbox.stateActions('source').some(a=>a.id==='connect'));
assert(sandbox.stateActions('parallel').some(a=>a.id==='connect'));
assert(!sandbox.stateActions('final').some(a=>a.id==='connect'));
sandbox.stateAction('source','connect');
assert.equal(focused,1);
assert.equal(sandbox.diagram.connectSource,'source');
sandbox.onDiagramClick('#root');
assert.equal(connections.length,0);
assert.equal(sandbox.diagram.connectSource,'source','Non-state clicks must not consume the source.');
sandbox.onDiagramClick('target');
assert.equal(JSON.stringify(connections),JSON.stringify([['source','target',{inPlace:true}]]));
assert.equal(sandbox.diagram.tool,null,'Complete the action after choosing a target.');
assert.equal(sandbox.diagram.connectSource,null);
sandbox.stateAction('source','connect');
sandbox.setTool(null);
sandbox.onDiagramClick('target');
assert.equal(connections.length,1,'Cancellation must prevent a connection.');
allowed=false;
sandbox.stateAction('source','connect');
assert.equal(sandbox.diagram.tool,null,'Locked editing must not arm the action.');
sandbox.run.pid='running';
assert.equal(sandbox.stateActions('source').length,0);
console.log('Checked toolbar connection availability, source/target selection, non-state clicks, cancellation and locked editing.');
