const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context={XMLSerializer:class {}};context.window=context;
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../js/sxml-model.js'),'utf8'),context);
const S=context.SXML;
const machine='<statechart><state id="s0"><onentry>assert(value(1))</onentry></state></statechart>';
const before=machine+'\n<!-- <example events>\ninput([red]).\n-->\n';
const after=machine+'\n<!-- <example events>\ninput([blue]).\ninput([green]).\n-->\n';
assert.equal(S.machineSource(before),S.machineSource(after));
assert.equal(S.machineSource(before),S.machineSource(machine));
assert.notEqual(S.machineSource(before),S.machineSource(after.replace('value(1)','value(2)')));
const script=body=>'<statechart><onentry><![CDATA['+body+']]></onentry></statechart>';
assert.notEqual(S.machineSource(script('<!-- <example events> one -->')),S.machineSource(script('<!-- <example events> two -->')), 'CDATA script changes must never be treated as editor comments.');
assert.notEqual(S.machineSource(machine+'<!-- ordinary note -->'),S.machineSource(machine+'<!-- changed note -->'));
const app=fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');
const tools=fs.readFileSync(path.join(__dirname,'../js/studio-tools.js'),'utf8');
const root={key:'#root',kind:'statechart',el:{}};
let text=before, stopped=0, shown=0;
const originalHistory=[{text:'existing trace'}];
Object.assign(context,{run:{pid:'same-chart@localhost',source:before},programs:[{}],current:0,lastSource:before,
  history:originalHistory,cursor:0,sendGeneration:7,model:{root},editor:{getValue:()=>text},
  tree(){},notes(){},renderInspector(){},renderDebug(){shown++;},
  SXML:{...S,snapshot:()=>({}),discardManualPositions:()=>false,build:()=>({root,layout:null,problems:[]}),locate:()=>({})},
  entryFor:()=>null,entryByKey:()=>null,selEl:null,selKey:'#root',syncSplitOrientation(){},
  $:()=>({classList:{remove(){}},dataset:{},setAttribute(){},parentNode:{}}),
  showProblems(){},diagram:{setModel:()=>Promise.resolve(),select(){}},renderSuggestions(){},
  markSelection(){},updateChrome(){},stopRun(){stopped++;context.run.pid=null;},status(){},saveExplorer(){}});
context.file=context.programs[0];
vm.runInContext(tools.match(/  function adopt\(\) \{[\s\S]*?\n  \}/)[0].replace('function adopt()', 'function adoptTools()'),context);
context.studioTools={adopt:context.adoptTools};
vm.runInContext(app.match(/function adopt\(doc, text, opts\) \{[\s\S]*?\n\}/)[0].replace('function adopt(', 'function adoptDocument('),context);
text=after; context.adoptDocument({},text);
assert.equal(stopped,0);assert.equal(context.run.pid,'same-chart@localhost');
assert.equal(context.run.source,after);
assert.equal(context.history,originalHistory);assert.equal(context.sendGeneration,7);assert.equal(context.cursor,0);
assert.equal(shown,1,'Example buttons must still refresh.');
text=machine;context.adoptDocument({},text);assert.equal(stopped,0,'Removing the event block must keep the run alive too.');
text=machine.replace('value(1)','value(2)');context.adoptDocument({},text);
assert.equal(stopped,1,'Actual executable changes must still stop the old machine.');
assert.equal(context.history.length,0);assert.equal(context.sendGeneration,8);
console.log('Checked adding/editing/removing example comments without stopping or losing history/send state, while executable and CDATA changes still invalidate runs.');
