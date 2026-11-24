const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
global.window = global;
global.ELK = require(path.join(root, 'vendor/elk.bundled.js'));
// Approximate font metrics for geometry checks; browser QA uses real metrics.
global.document = { createElement: () => ({ getContext: () => ({ measureText: text => ({ width: text.length * 7 }) }) }) };
vm.runInThisContext(fs.readFileSync(path.join(root, 'js/sxml-diagram.js'), 'utf8'));
const D = global.SXMLDiagram;
function state(id, kind = 'state', children = [], initial = '') {
  return { id, key: kind === 'statechart' ? '#root' : id, kind, children, initial,
    datamodels: [], spawns: [], onentry: [], onexit: [], defers: [], transitions: [] };
}
const s1 = state('s1'), s2 = state('s2'), history = state('h', 'history');
const play = state('play', 'state', [history, s1, s2], 's1');
const interrupted = state('interrupted');
const game = state('game', 'state', [play, interrupted], 'play');
const final = state('final', 'final');
const chart = state('', 'statechart', [game, final], 'game');
play.onentry.push({key: 'play/onentry', body: 'write(started)'});
const nodes = [chart, game, play, history, s1, s2, interrupted, final];
const model = { root: chart, byId: new Map(nodes.map(n => [n.id, n])), nested: new Map(), layout: null, transitions: [] };
function edge(source, target, on) {
  const t = { key: source.key + '/go' + source.transitions.length, source, to: [target.id], on, body: '' };
  source.transitions.push(t); model.transitions.push(t);
}
edge(history, s1, null); edge(s1, s2, 'play'); edge(s2, s1, 'reset');
edge(s2, s2, 'again'); edge(play, interrupted, 'pause'); edge(interrupted, history, 'resume'); edge(game, final, 'stop');
const originalOrder = nodes.map(n => n.transitions.map(t => t.key));
(async () => {
  assert.deepEqual(D.normalizeExperiments({compaction: 'unsupported', labels: null}), D.normalizeExperiments());
  const defaults = D.normalizeExperiments();
  assert.deepEqual(D.normalizeExperiments({crossings: '1', flexibility: 'NODE_SIZE'}), defaults, 'Ignore obsolete saved experiment preferences.');
  assert.equal(D.experimentOptions({loops: '0'})['elk.spacing.nodeSelfLoop'], '0');
  assert.equal(D.experimentOptions({alignment: 'balanced'})['elk.layered.nodePlacement.favorStraightEdges'], 'false');
  assert.equal(D.experimentOptions({effort: '20'})['elk.layered.thoroughness'], '20');
  assert.equal(D.experimentOptions({padding: '50'})['studio.nestedPadding'], '50');
  assert.equal(D.experimentOptions({sides: 'ALWAYS_UP'})['elk.layered.edgeLabels.sideSelection'], 'ALWAYS_UP');
  const modes = [];
  for (const compaction of ['NONE', 'EDGE_LENGTH']) for (const labels of ['MEDIAN_LAYER', 'SPACE_EFFICIENT_LAYER']) for (const order of ['NONE', 'NODES_AND_EDGES']) modes.push(D.normalizeExperiments({compaction, labels, order}));
  for (const profile of [{loops: '0'}, {loops: '40'}, {alignment: 'balanced'}, {effort: '1'}, {effort: '20'}, {padding: '50'}, {padding: '150'}, {sides: 'SMART_UP'}, {sides: 'ALWAYS_UP'}, {sides: 'ALWAYS_DOWN'}, {padding: '50', sides: 'ALWAYS_UP', compaction: 'EDGE_LENGTH', labels: 'SPACE_EFFICIENT_LAYER', order: 'NODES_AND_EDGES', loops: '40', alignment: 'balanced', effort: '20'}]) modes.push(D.normalizeExperiments(profile));
  let layouts = 0, fallbacks = 0;
  const warn = console.warn;
  console.warn = () => {};
  try {
    for (const direction of ['RIGHT', 'DOWN']) for (const spacing of [0, 50]) {
      const baseOptions = D.spacingOptions(direction, spacing, spacing);
      const base = await D.layout(model, direction, baseOptions);
      const labels = new Map(base.edges.map(e => [e.id, e.labels.map(l => [l.w, l.h])]));
      for (const mode of modes) {
        const options = D.experimentOptions(mode);
        const geo = await D.layout(model, direction, {...baseOptions, ...options});
        assert(Number.isFinite(geo.width) && Number.isFinite(geo.height));
        assert.equal(geo.edges.length, base.edges.length);
        for (const e of geo.edges) {
          assert.deepEqual(e.labels.map(l => [l.w, l.h]), labels.get(e.id));
          assert(e.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
        }
        for (const n of nodes) {
          const box = geo.boxes.get(n.key), original = base.boxes.get(n.key);
          if (!n.children.length) {
            assert.equal(box.w, original.w); assert.equal(box.h, original.h);
          }
          if (n.kind === 'statechart') continue;
          const heading = geo.info.get(n.key).top;
          for (const child of n.children) {
            const b = geo.boxes.get(child.key);
            assert(b.y >= box.y + heading, 'Children must stay below headings and actions.');
            assert(b.x >= box.x && b.x + b.w <= box.x + box.w, 'Children stay within their parent.');
          }
        }
        if (JSON.stringify(mode) === JSON.stringify(defaults)) {
          assert.equal(geo.width, base.width); assert.equal(geo.height, base.height);
        }
        if (geo.fallbackNotes) { fallbacks++; assert(geo.fallbackNotes.every(note => typeof note === 'string' && note.length)); }
        layouts++;
      }
    }
  } finally { console.warn = warn; }
  assert(fallbacks > 0, 'Exercise the nested-chart fallback in the bundled ELK.');
  assert.deepEqual(nodes.map(n => n.transitions.map(t => t.key)), originalOrder);
  console.log(`Checked ${layouts} experimental layouts, unchanged labels and ordering, and ${fallbacks} fallbacks.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
