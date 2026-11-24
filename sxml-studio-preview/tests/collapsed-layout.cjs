const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
global.window = global;
global.ELK = require('../vendor/elk.bundled.js');
global.document = {createElement: () => ({getContext: () => ({measureText: text => ({width: text.length * 7})})})};
vm.runInThisContext(fs.readFileSync(require('node:path').join(__dirname, '../js/sxml-diagram.js'), 'utf8'));
function state(id, kind='state') { return {key:id,id,kind,children:[],datamodels:[],spawns:[],onentry:[],onexit:[],defers:[],transitions:[],initial:''}; }
const root=state('#root','statechart'), p=state('parent'), a=state('a'), b=state('b'), c=state('outside');
root.children=[p,c];root.initial='parent';p.parent=root;c.parent=root;p.children=[a,b];p.initial='a';p.compound=true;a.parent=p;b.parent=p;
const internal={key:'a/go0',source:a,to:['b'],on:'next',body:'',index:0};
const exit={key:'b/go0',source:b,to:['outside'],on:'leave',body:'',index:0};
const enter={key:'outside/go0',source:c,to:['a'],on:'enter',body:'',index:0};
a.transitions=[internal];b.transitions=[exit];c.transitions=[enter];
const model={root,nodes:[root,p,a,b,c],byId:new Map([p,a,b,c].map(n=>[n.id,n])),transitions:[internal,exit,enter],nested:new Map(),layout:null};
(async()=>{
  for (const direction of ['RIGHT','DOWN']) {
    const full=await SXMLDiagram.layout(model,direction);
    const compact=await SXMLDiagram.layout(model,direction,{'studio.collapsed':new Set(['parent'])});
    assert(full.boxes.has('a'));
    assert(!compact.boxes.has('a'));
    assert(!compact.boxes.has('b'));
    assert(compact.boxes.has('parent'));
    assert(!compact.edges.some(e=>e.id.startsWith('a/go0')),'Hidden internal transitions must not become misleading self-loops.');
    assert(compact.edges.some(e=>e.id.startsWith('b/go0')),'Outbound transition must remain visible.');
    assert(compact.edges.some(e=>e.id.startsWith('outside/go0')),'Inbound transition must remain visible.');
    assert(compact.info.get('parent').collapsed);
    assert.equal(model.transitions[2].to[0],'a','View collapse must never change source targets.');
    const expanded=await SXMLDiagram.layout(model,direction);
    assert(expanded.boxes.has('a'));
  }
  console.log('Checked collapse, boundary routing, hidden internal edges, expansion and source preservation in both directions.');
})().catch(error=>{console.error(error);process.exitCode=1;});
