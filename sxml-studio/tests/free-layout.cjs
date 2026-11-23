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
const t1={key:'a/go0',source:a,to:['b'],on:'next',body:'',index:0};
const t2={key:'b/go0',source:b,to:['outside'],on:'leave',body:'',index:0};
a.transitions=[t1];b.transitions=[t2];
const model={root,nodes:[root,p,a,b,c],byId:new Map([p,a,b,c].map(n=>[n.id,n])),transitions:[t1,t2],nested:new Map(),layout:null};
const near=(x,y,msg)=>assert(Math.abs(x-y)<0.6,msg+': '+x+' vs '+y);
(async()=>{
  const auto=await SXMLDiagram.layout(model,'RIGHT');
  assert(!auto.free,'Without saved positions ELK lays out the chart.');
  // Saving the effective offsets reproduces the automatic drawing.
  const layout={};
  for (const [k,r] of auto.rel) { const parent=auto.parentOf.get(k); (layout[parent]=layout[parent]||{})[k]=r; }
  model.layout=layout;
  const frozen=await SXMLDiagram.layout(model,'RIGHT');
  assert(frozen.free);
  for (const k of ['a','b','outside']) { near(frozen.boxes.get(k).x,auto.boxes.get(k).x,k+' x'); near(frozen.boxes.get(k).y,auto.boxes.get(k).y,k+' y'); }
  // Moving a child by (dx, dy) moves exactly it; its parent grows to wrap it.
  model.layout=JSON.parse(JSON.stringify(layout));
  model.layout.parent.b=[layout.parent.b[0]+30,layout.parent.b[1]+120];
  const moved=await SXMLDiagram.layout(model,'RIGHT');
  near(moved.boxes.get('b').x,frozen.boxes.get('b').x+30,'b moved x');
  near(moved.boxes.get('b').y,frozen.boxes.get('b').y+120,'b moved y');
  near(moved.boxes.get('a').x,frozen.boxes.get('a').x,'sibling stays');
  const P=moved.boxes.get('parent'), B=moved.boxes.get('b');
  assert(P.y+P.h>=B.y+B.h,'Parent wraps the moved child.');
  // Moving a child up-left past the parent's edge keeps it in place and grows the parent the other way.
  model.layout=JSON.parse(JSON.stringify(layout));
  model.layout.parent.a=[layout.parent.a[0]-100,layout.parent.a[1]-80];
  const left=await SXMLDiagram.layout(model,'RIGHT');
  near(left.boxes.get('a').x-left.boxes.get('b').x,frozen.boxes.get('a').x-frozen.boxes.get('b').x-100,'relative x kept');
  assert(left.boxes.get('parent').x<=left.boxes.get('a').x,'Parent extends left to wrap.');
  // Moved endpoints get a fresh route that starts and ends on the boxes.
  const e=moved.edges.find(x=>x.id.startsWith('a/go0'));
  const A=moved.boxes.get('a'), end=e.points.at(-1), start=e.points[0];
  assert(start.x>=A.x-0.6&&start.x<=A.x+A.w+0.6&&start.y>=A.y-0.6&&start.y<=A.y+A.h+0.6,'Route starts on the source.');
  assert(Math.abs(end.x-B.x)<0.6||Math.abs(end.x-B.x-B.w)<0.6||Math.abs(end.y-B.y)<0.6||Math.abs(end.y-B.y-B.h)<0.6,'Route ends on the target border.');
  // Labels are re-placed beside the route.
  assert(e.labels.length===1);
  console.log('free-layout: ok');
})().catch(error=>{console.error(error);process.exitCode=1;});
