const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
global.window = global;
global.ELK = require(path.join(root, 'vendor/elk.bundled.js'));
const context = {font: '', measureText(text) { return {width: text.length * parseFloat(this.font.match(/[\d.]+px/)[0]) * .61}; }};
global.document = {createElement: () => ({getContext: () => context})};
vm.runInThisContext(fs.readFileSync(path.join(root, 'js/sxml-diagram.js'), 'utf8'));
const D = global.SXMLDiagram;
assert.equal(D.APPEARANCE_DEFAULTS.labelOpacity, 0);
assert.deepEqual(D.normalizeAppearance(null), D.APPEARANCE_DEFAULTS);
assert.deepEqual(D.normalizeAppearance({lineWidth: Infinity, labelSize: 1000, lineColor: 'url(bad)', labelOpacity: -1}), D.APPEARANCE_DEFAULTS);
assert.equal(D.normalizeAppearance({lineColor: '#AABBCC'}).lineColor, '#aabbcc');
assert.equal(D.normalizeAppearance({headerColor: '#ABCDEF'}).headerColor, '#abcdef');
assert.equal(D.normalizeAppearance({activeHeaderColor: 'invalid'}).activeHeaderColor, D.APPEARANCE_DEFAULTS.activeHeaderColor);
const vars = {}, markers = Array.from({length: 4}, () => ({attrs: {}, setAttribute(k,v) {this.attrs[k] = String(v);}}));
const fake = {svg: {style: {setProperty: (k,v) => vars[k] = String(v), removeProperty: k => delete vars[k]}, querySelectorAll: () => markers}};
D.Diagram.prototype.applyAppearance.call(fake, {lineWidth: 4, arrowSize: 16, lineColor: '#f012ab', borderWidth: 3.5, labelSize: 18, labelOpacity: 0});
assert.equal(vars['--edge'], '#f012ab');
assert.equal(vars['--transition-width'], '4');
assert.equal(vars['--transition-label-size'], '18px');
assert.equal(vars['--transition-label-opacity'], '0');
assert(markers.every(m => m.attrs.markerWidth === '16' && m.attrs.markerHeight === '16'));
D.Diagram.prototype.applyAppearance.call(fake, D.APPEARANCE_DEFAULTS);
assert(!Object.hasOwn(vars, '--edge'));
assert.equal(vars['--state-header'], '#f5f5f5');
assert.equal(vars['--state-header-active'], '#e6f3ee');
D.Diagram.prototype.applyAppearance.call(fake, {headerColor: '#000000', activeHeaderColor: '#ffffff'});
assert.equal(vars['--state-header-text'], '#ffffff');
assert.equal(vars['--state-header-active-text'], '#000000');
assert(markers.every(m => m.attrs.markerWidth === '8.5'));
function state(id, kind='state', children=[], initial='') { return {id,kind,key:kind==='statechart'?'#root':id,children,initial,datamodels:[],spawns:[],onentry:[],onexit:[],defers:[],transitions:[]}; }
const a=state('a'),b=state('b'),chart=state('','statechart',[a,b],'a');
const edge={key:'a/go0',source:a,to:['b'],on:'long_event(Value)',body:'write(result)'};
a.transitions.push(edge);
const model={root:chart,byId:new Map([['a',a],['b',b]]),nested:new Map(),layout:null,transitions:[edge]};
(async()=>{
 let checks=0;
 for(const direction of ['RIGHT','DOWN']) {
  const sizes=[];
  for(const labelSize of [8,11,18]) for(const lineWidth of [.5,1.3,4]) {
   const settings=D.normalizeAppearance({labelSize,lineWidth});
   const geo=await D.layout(model,direction,{...D.spacingOptions(direction), 'studio.appearance':settings});
   const e=geo.edges.find(e=>e.id==='a/go0>0');
   const label=geo.info.get(e.id).label;
   assert.equal(label.lineHeight,labelSize+3);
   assert.equal(label.h,label.lines.length*(labelSize+3)+4);
   assert.equal(e.labels[0].h,label.h);
   assert.equal(e.labels[0].w,label.w);
   assert(label.baseline+(label.lines.length-1)*label.lineHeight<label.h);
   assert(e.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
   assert.equal(geo.appearance.lineWidth,lineWidth);
   assert.equal(model.transitions[0],edge);
   if(lineWidth===1.3)sizes.push(e.labels[0].w);
   checks++;
  }
  assert(sizes[0]<sizes[1]&&sizes[1]<sizes[2], 'Font size must change measured label width.');
 }
 console.log(`Checked appearance normalization, theme reset, all arrowheads, and ${checks} measured label/line layouts.`);
})().catch(error=>{console.error(error);process.exitCode=1});
