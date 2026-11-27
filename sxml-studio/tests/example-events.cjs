const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = {XMLSerializer: class {}}; context.window = context;
const source = fs.readFileSync(path.join(__dirname, '../js/sxml-model.js'), 'utf8');
vm.runInNewContext(source.replace('parse, build, validate,', 'exampleQueries, description, parse, build, validate,'), context);
const S = context.SXML;
const doc = comments => ({childNodes: [...comments.map(data => ({nodeType: 8, data})), {nodeType: 1}]});
const queries = comments => Array.from(S.exampleQueries(doc(comments)));
assert.deepEqual(queries([` <example events>

input([a, red, box]).

input([blue]).

input([a, big, box]).

input([a, small, box]).

`]), ['$Pid ! input([a, red, box])', '$Pid ! input([blue])', '$Pid ! input([a, big, box])', '$Pid ! input([a, small, box])']);
assert.deepEqual(queries([`<example events>

message('Keep this. And that.').

reading(1.25).

input([
    a, red, box
]).
`]), ["$Pid ! message('Keep this. And that.')", '$Pid ! reading(1.25)', '$Pid ! input([\n    a, red, box\n])']);
assert.deepEqual(queries(['<example events>\n\n']), []);
assert.deepEqual(queries(['<examples>\n\n?- statechart_spawn(Pid, [src_text(<editor>)]).\n\n?- $Pid ! old_event.\n\n?- statechart_halt($Pid, Reply, 1).']), ['statechart_spawn(Pid, [src_text(<editor>)])', '$Pid ! old_event', 'statechart_halt($Pid, Reply, 1)'], 'Previously saved files must keep working.');
assert.equal(S.description(doc(['<example events>\n\nplay.'])), '', 'Example events are not the chart description.');
assert.equal(S.description(doc(['Chart description', '<example events>\n\nplay.'])), 'Chart description');
let blocks = 0, events = 0;
for (const filename of fs.readdirSync(path.join(__dirname, '../examples'))) {
  if (!filename.endsWith('.xml')) continue;
  const xml = fs.readFileSync(path.join(__dirname, '../examples', filename), 'utf8');
  assert(!xml.includes('<examples>'), filename);
  const comments = [...xml.matchAll(/<!--([\s\S]*?)-->/g)].map(m=>m[1]);
  for (const comment of comments.filter(text => text.includes('<example events>'))) {
    blocks++;
    assert(!/\?-|\$Pid|statechart_spawn|statechart_halt/.test(comment), filename + ' must contain only bare events');
    events += queries([comment]).length;
  }
}
assert.equal(blocks, 8);
assert.equal(events, 30);
console.log('Checked all 17 examples: 8 event-only comments, 30 preserved events, multiline/quoted terms, description handling and legacy query support.');
