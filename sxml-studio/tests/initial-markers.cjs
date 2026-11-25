const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function element(name) {
  return {name, attrs: {}, children: [], setAttribute(k,v) {this.attrs[k]=String(v);}, appendChild(e) {this.children.push(e);}, classList: {toggle() {}}};
}
global.window=global;
global.ELK=require('../vendor/elk.bundled.js');
global.document={createElement:()=>({getContext:()=>({measureText:t=>({width:t.length*7})})}),createElementNS:(_,name)=>element(name)};
vm.runInThisContext(fs.readFileSync(path.join(__dirname,'../js/sxml-diagram.js'),'utf8'));
const D=SXMLDiagram;
function state(id,kind='state',children=[],initial='') {
 const n={id,key:id,kind,children,initial,datamodels:[],spawns:[],onentry:[],onexit:[],defers:[],transitions:[]};children.forEach(c=>c.parent=n);return n;
}
function collect(e,cls) {return (e.attrs.class===cls?[e]:[]).concat(e.children.flatMap(c=>collect(c,cls)));}
(async()=>{
 let checks=0;
 for(const direction of ['RIGHT','DOWN']) for(const spacing of [0,50,100]) for(const saved of [false,true]) {
  const a=state('a'),b=state('b'),p=state('parent','state',[a,b],'a'),root=state('#root','statechart',[p],'parent');p.compound=true;
  const transition={key:'a/go0',source:a,to:['b'],on:'next',body:''};a.transitions=[transition];
  const model={root,nodes:[root,p,a,b],byId:new Map([p,a,b].map(n=>[n.id,n])),transitions:[transition],nested:new Map(),layout:saved?{parent:{a:[60,60],b:[200,140]}}:null};
  const geo=await D.layout(model,direction,D.spacingOptions(direction,spacing,spacing));
  const snapshot=()=>JSON.stringify({boxes:[...geo.boxes],edges:geo.edges,width:geo.width,height:geo.height,rel:[...geo.rel],shift:[...geo.shift]});
  const original=snapshot();
  const diagram={geo,model,direction,view:element('g'),svg:element('svg'),_init:D.Diagram.prototype._init,_paint() {}};
  D.Diagram.prototype._render.call(diagram);
  assert.equal(snapshot(),original,'Rendering must preserve all layout geometry.');
  const dots=collect(diagram.view,'init-dot'),paths=collect(diagram.view,'edge init');
  const edges=geo.edges.filter(e=>geo.info.get(e.id)?.type==='initEdge');
  assert.equal(dots.length,edges.length);assert.equal(paths.length,edges.length);
  dots.forEach(dot=>assert.equal(Number(dot.attrs.r),6.25,'Start dot must be 25% larger.'));
  paths.forEach((path,index)=>{
   assert(path.attrs.d.includes(' C'),'Initial arrow must be curved.');
   const numbers=path.attrs.d.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi).map(Number);
   assert(numbers.every(Number.isFinite));
   const end=edges[index].points.at(-1);
   assert.deepEqual(numbers.slice(-2),[end.x,end.y],'Arrival point must stay on the original state border.');
   assert(Math.hypot(numbers[0]-end.x,numbers[1]-end.y)<=23,'Visible initial line must stay compact.');
  });
  assert.equal(collect(diagram.view,'edge').length,1,'Ordinary transitions must still be drawn.');checks++;
 }
 console.log('Checked curved markers, larger dots, compact lines, original arrival points and unmodified layout geometry in '+checks+' layouts.');
})().catch(e=>{console.error(e);process.exitCode=1;});
