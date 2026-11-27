const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = {XMLSerializer: class {}}; context.window = context;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/sxml-model.js'), 'utf8'), context);
const S = context.SXML;
const old = `<!-- <examples>

?- statechart_spawn(Pid, [
       src_text(<editor>)
   ]).

?- $Pid ! e.

?- $Pid ! input([a, red, box]).

?- statechart_halt($Pid, Reply, 1).

-->`;
const updated = '<!-- <example events>\n\ne.\ninput([a, red, box]).\n\n-->';
const chart = '<statechart initial="mine"><datamodel>t.</datamodel><state id="mine"/></statechart>\n';
const layout = '\n<!-- <layout> {"@direction":"DOWN","mine":{"@regions":"RIGHT"}} -->';
const edited = chart + old + layout;
assert.equal(S.upgradeExampleEvents(edited), chart + updated + layout);
assert.equal(S.upgradeExampleEvents(chart + updated.replace('e.\ninput', 'e.\n\ninput') + layout), chart + updated + layout, 'Update the previous bundled spacing in already converted browser copies.');
const annotated = '<!-- <example events>\n\ne. % keep this note\n\nf.\n\n-->';
assert.equal(S.upgradeExampleEvents(chart + annotated), chart + annotated);
const multiline = '<!-- <example events>\n\ninput([a,\n\nred, box]).\n\nf.\n\n-->';
assert.equal(S.upgradeExampleEvents(chart + multiline), chart + multiline);
assert.equal(S.upgradeExampleEvents(S.upgradeExampleEvents(edited)), chart + updated + layout);
assert.equal(S.upgradeExampleEvents('<statechart/>'), '<statechart/>');
const custom = old.replace('?- $Pid ! e.', '?- inspect_my_chart($Pid).');
assert.equal(S.upgradeExampleEvents(chart + custom), chart + custom, 'Preserve custom query examples.');
const autonomous = '<!-- <examples>\n\n?- statechart_spawn(Pid, [src_text(<editor>)]),\n sleep(0.1),\n flush.\n\n-->';
assert.equal(S.upgradeExampleEvents(chart + autonomous + layout), chart + layout);
const app = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
const selectFile = app.match(/async function selectFile\(index\) \{[\s\S]*?\n\}/)[0];
async function open(file) {
  let shown;
  const sandbox = {programs:[file],current:0,loadedIndex:0,run:{},window:{},SXML:S,parseTimer:null,clearTimeout(){},
    editor:{getValue:()=>file.draft ?? file.source, setValue:value=>shown=value, clearHistory(){}},
    updateFileSelection(){},diagram:{},$:()=>({replaceChildren(){}}),reparse(){},showSide(){},runControls(){},saveExplorer(){}};
  vm.createContext(sandbox); vm.runInContext(selectFile, sandbox);
  await sandbox.selectFile(0); return shown;
}
(async () => {
  const bundled = {url:'examples/03%20emotions.xml',source:'<statechart/>' + old,draft:edited,local:true};
  assert.equal(await open(bundled), chart + updated + layout);
  assert.equal(bundled.source, '<statechart/>' + updated);
  assert.equal(bundled.local,true);
  const local = {source:edited}; assert.equal(await open(local),edited, 'Leave user-created files untouched.');
  const nested = {url:'examples/03%20emotions.xml',source:edited,parent:{}};
  assert.equal(await open(nested),edited, 'Leave nested documents untouched.');
  console.log('Checked saved bundled sources/drafts, comment-only migration, preserved chart/layout edits, idempotence, custom queries and untouched local/nested documents.');
})().catch(error=>{console.error(error);process.exitCode=1;});
