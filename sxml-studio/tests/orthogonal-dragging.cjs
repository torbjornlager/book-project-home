const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
global.window = global;
global.ELK = require('../vendor/elk.bundled.js');
global.document = {createElement: () => ({getContext: () => ({measureText: text => ({width:text.length*7})})})};
vm.runInThisContext(fs.readFileSync(require('node:path').join(__dirname,'../js/sxml-diagram.js'),'utf8'));
function state(id,kind='state') { return {key:id,id,kind,children:[],datamodels:[],spawns:[],onentry:[],onexit:[],defers:[],transitions:[],initial:''}; }
function orthogonal(geo) {
  for (const e of geo.edges) for (let i=1;i<e.points.length;i++) {
    const a=e.points[i-1],b=e.points[i];
    assert(a.x===b.x || a.y===b.y, `${e.id} contains a diagonal ${JSON.stringify([a,b])}`);
  }
}
(async()=>{
  const root=state('#root','statechart'), a=state('a'), b=state('b'), obstacle=state('obstacle');
  root.children=[a,b,obstacle];root.initial='a';
  for (const n of root.children) n.parent=root;
  const transition=(source,target,index)=>({key:`${source.id}/go${index}`,source,to:[target.id],on:'next',body:'',index});
  const ts=[transition(a,b,0),transition(b,a,0),transition(a,a,1)];
  a.transitions=[ts[0],ts[2]];b.transitions=[ts[1]];
  const model={root,nodes:[root,a,b,obstacle],byId:new Map(root.children.map(n=>[n.id,n])),transitions:ts,nested:new Map(),layout:null};
  for (const direction of ['RIGHT','DOWN']) {
    const auto=await SXMLDiagram.layout(model,direction); orthogonal(auto);
    const saved={};for(const [k,r] of auto.rel) (saved[auto.parentOf.get(k)] ||= {})[k]=r;
    model.layout=saved;
    saved['#root'].a=[40,40];saved['#root'].b=[480,220];saved['#root'].obstacle=[250,80];
    const moved=await SXMLDiagram.layout(model,direction);orthogonal(moved);
    const edge=moved.edges.find(e=>e.id.startsWith('a/go0'));
    const O=moved.boxes.get('obstacle');
    for (let i=1;i<edge.points.length;i++) {
      const p=edge.points[i-1],q=edge.points[i];
      assert(!(p.x===q.x ? p.x>O.x&&p.x<O.x+O.w&&Math.max(p.y,q.y)>O.y&&Math.min(p.y,q.y)<O.y+O.h : p.y>O.y&&p.y<O.y+O.h&&Math.max(p.x,q.x)>O.x&&Math.min(p.x,q.x)<O.x+O.w),'Route should clear the unrelated state.');
    }
    saved.a={[edge.id]:[140,400,'absolute']};
    let pinned=await SXMLDiagram.layout(model,direction);orthogonal(pinned);
    let routed=pinned.edges.find(e=>e.id===edge.id);
    assert.equal(routed.labels[0].x,140);assert.equal(routed.labels[0].y,400);
    assert(routed.routedLabel);assert(routed.points.length>=4,'Dragging a label must bend the route.');
    saved['#root'].b=[620,40];
    pinned=await SXMLDiagram.layout(model,direction);orthogonal(pinned);
    routed=pinned.edges.find(e=>e.id===edge.id);
    assert.equal(routed.labels[0].x,140,'Endpoint motion must preserve the label anchor.');
    const diagram={geo:pinned,model,_render(){orthogonal(this.geo);}};
    const drag={type:'move',key:'a'};
    SXMLDiagram.Diagram.prototype._previewDrag.call(diagram,drag,50,80);
    assert.equal(diagram.geo.boxes.get('a').x,pinned.boxes.get('a').x+50);
    SXMLDiagram.Diagram.prototype._previewDrag.call(diagram,drag,70,90);
    assert.equal(diagram.geo.boxes.get('a').x,pinned.boxes.get('a').x+70,'Preview deltas must not accumulate.');
    assert.strictEqual(drag.originalGeo,pinned);
    const labelDrag={type:'label',edge:edge.id};diagram.geo=pinned;
    SXMLDiagram.Diagram.prototype._previewDrag.call(diagram,labelDrag,-80,60);
    assert.equal(diagram.geo.edges.find(e=>e.id===edge.id).labels[0].x,60);
    assert.equal(pinned.edges.find(e=>e.id===edge.id).labels[0].x,140,'Preview must not mutate the saved geometry.');
    // Exercise all four label sides independently of the automatic layout.
    const label = routed.labels[0], cx = label.x + label.w / 2, cy = label.y + label.h / 2;
    const offsets = {top:[0,-180],right:[240,0],bottom:[0,180],left:[-240,0]};
    for (const [from,to] of [['top','right'],['right','bottom'],['bottom','left'],['left','top'],['top','top'],['right','right'],['bottom','bottom'],['left','left']]) {
      const boxes = new Map(pinned.boxes);
      for (const [key,side] of [['a',from],['b',to]]) {
        const [dx,dy] = offsets[side];
        boxes.set(key, {x:cx+dx-40,y:cy+dy-20,w:80,h:40});
      }
      const original = {...pinned,boxes};
      const preview = {geo:original,model,_render(){orthogonal(this.geo);}};
      SXMLDiagram.Diagram.prototype._previewDrag.call(preview,{type:'label',edge:edge.id},0,0);
      const route = preview.geo.edges.find(e=>e.id===edge.id);
      const onSide = (p,side) => side==='top' ? p.y===label.y : side==='bottom' ? p.y===label.y+label.h
        : side==='left' ? p.x===label.x : p.x===label.x+label.w;
      assert(onSide(route.labelPorts.entry,from), `Expected entry on ${from}`);
      assert(onSide(route.labelPorts.exit,to), `Expected exit on ${to}`);
      if (from===to) assert.notDeepEqual(route.labelPorts.entry,route.labelPorts.exit,'Same-side connections need separate attachment points.');
    }
    saved.a[edge.id]=[20,30];
    const legacy=await SXMLDiagram.layout(model,direction);orthogonal(legacy);
    assert(legacy.edges.find(e=>e.id===edge.id).routedLabel,'Legacy offsets should also steer the route.');
    model.layout=null;
  }
  console.log('Checked right-angle routing, obstacle clearance, reverse and self transitions, pinned and legacy labels, live previews and immutable geometry in both directions.');
})().catch(e=>{console.error(e);process.exitCode=1;});
