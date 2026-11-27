const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const code = fs.readFileSync(path.join(__dirname,'../js/studio-workspace.js'),'utf8');
let stored;
function load(value, fail = false) {
  const context = {localStorage:{getItem(){if(fail)throw Error('blocked');return value;},setItem(key,text){if(fail)throw Error('blocked');stored=text;}}};
  context.window=context; vm.runInNewContext(code,context); return context.SXMLWorkspace;
}
const plain = value => JSON.parse(JSON.stringify(value));
const defaults = {view:'split',side:'inspector',section:'files',focus:false,consoleOpen:false,timelineOpen:true};
assert.deepEqual(plain(load(null).preferences),defaults);
const first = load(null);
first.save({view:'source',side:'run',section:'structure',focus:true,consoleOpen:true,timelineOpen:false});
assert.deepEqual(plain(load(stored).preferences),{view:'source',side:'run',section:'structure',focus:true,consoleOpen:true,timelineOpen:false});
const second = load(stored); second.save({view:'diagram'});
assert.equal(load(stored).preferences.view,'diagram');
assert.equal(load(stored).preferences.side,'run','Changing the view must not discard panel choices.');
second.save({view:'bad',side:[],focus:'yes'});
assert.equal(load(stored).preferences.view,'diagram');assert.equal(load(stored).preferences.focus,true);
assert.deepEqual(plain(load('{invalid').preferences),defaults);
assert.deepEqual(plain(load('null').preferences),defaults);
const blocked=load(null,true);blocked.save({view:'source'});assert.equal(blocked.preferences.view,'source');
const app=fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');
assert(app.includes('setView(SXMLWorkspace.preferences.view);'));
assert(app.includes('showSide(SXMLWorkspace.preferences.side);'));
assert(!app.includes("setView('diagram');\nconst wanted"));
console.log('Checked workspace defaults, all saved choices across reloads, partial updates, invalid/storage failures and restored startup view/panel.');
