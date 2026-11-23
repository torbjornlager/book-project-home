/* Navigation, observed execution history and executable scenario tooling. */
'use strict';
window.studioTools = (() => {
  let file = null, history = [], cursor = -1, paused = false, speed = 260;
  let recording = null, testing = false, replayToken = 0, lastSource = null;
  const drafts = new Map(), actors = new Map();
  let coverage = false;
  const visited = new Set(), fired = new Set();
  const button = (text, action, attrs = {}) => h('button', Object.assign({type: 'button', onclick: action}, attrs), text);
  const hint = text => h('p', {class: 'hint'}, text);
  function data() { return SXMLStudio.metadata(model.doc); }
  function changeMetadata(fn) { edit(() => { const value = data(); fn(value); SXMLStudio.setMetadata(model.doc, value); }); }
  function refreshLayout() { return diagram.setModel(model, {preserveViewport: true}); }
  function navigate(entry) {
    const owner = ownerNode(entry);
    let changed = false;
    for (let n = owner.parent; n; n = n.parent) if (diagram.collapsed.delete(n.key)) changed = true;
    const reveal = () => select(entry.key, {reveal: true});
    if (changed) refreshLayout().then(reveal); else reveal();
  }
  function tree() {
    const box = $('structure-tree'); box.replaceChildren();
    if (!model) return;
    const query = $('structure-search').value.toLowerCase().trim();
    const matches = entry => !query || [entry.id, entry.on, entry.cond, entry.body, entry.el?.textContent].join(' ').toLowerCase().includes(query);
    function walk(n, depth) {
      const nested = n.children.some(c => c.compound || c.children.length) || n.children.length;
      const descendantsMatch = query && n.children.some(c => c.el.textContent.toLowerCase().includes(query) || c.id.toLowerCase().includes(query));
      if (!query || matches(n) || descendantsMatch) {
        const row = h('div', {class: 'structure-row', style: '--depth:' + depth});
        if (nested && n !== model.root) row.append(button(diagram.collapsed.has(n.key) ? '+' : '−', () => toggle(n), {'aria-label': (diagram.collapsed.has(n.key) ? 'Expand ' : 'Collapse ') + (n.id || 'chart'), 'aria-expanded': String(!diagram.collapsed.has(n.key))}));
        row.append(button(n.id || 'statechart', () => navigate(n), {class: 'structure-name' + (selKey === n.key ? ' selected' : ''), title: n.kind}));
        box.append(row);
      }
      if (!diagram.collapsed.has(n.key) || query) {
        n.children.forEach(c => walk(c, depth + 1));
        if (query) for (const it of [...n.transitions, ...n.onentry, ...n.onexit, ...n.datamodels, ...n.defers]) if (matches(it)) {
          box.append(h('div', {class: 'structure-row', style: '--depth:' + (depth + 1)}, button(it.kind + ': ' + (it.on || it.body || it.cond || 'always'), () => navigate(it), {class: 'structure-name'})));
        }
        for (const spawn of n.spawns) {
          const nestedChart = model.nested.get(spawn.key);
          if (nestedChart) box.append(h('div', {class: 'structure-row', style: '--depth:' + (depth + 1)}, button('Open ' + nestedChart.title, () => openNested(spawn.key), {class: 'structure-name'})));
        }
      }
    }
    walk(model.root, 0);
  }
  function toggle(n) {
    if (n.kind === 'statechart') return;
    if (!diagram.collapsed.delete(n.key)) diagram.collapsed.add(n.key);
    refreshLayout(); tree(); renderInspector();
  }
  function inspector(entry) {
    const box = $('inspector'), meta = data();
    const description = area('studio-description', SXMLStudio.description(entry.el), value => edit(() => SXMLStudio.setDescription(model.doc, entry.el, value)), 2);
    description.setAttribute('aria-label', 'Description for ' + (entry.id || entry.key));
    box.append(h('div', {class: 'section-title'}, 'DESCRIPTION'), description);
    if (entry.kind !== 'statechart' && (entry.compound || entry.kind === 'parallel')) box.append(button(diagram.collapsed.has(entry.key) ? 'Expand children' : 'Collapse children', () => toggle(entry)));
    if (entry === model.root) {
      box.append(h('div', {class: 'section-title'}, 'DIAGRAM NOTES'));
      meta.notes.forEach((note, i) => {
        const control = area('studio-note-' + i, note, value => changeMetadata(m => { m.notes[i] = value; }), 2);
        control.setAttribute('aria-label', 'Diagram note ' + (i + 1));
        box.append(control, button('Remove note', () => changeMetadata(m => m.notes.splice(i, 1))));
      });
      box.append(button('Add note', () => changeMetadata(m => m.notes.push('New note'))));
      checkpoints(box);
    }
    if (entry.kind === 'go') {
      box.append(h('div', {class: 'section-title'}, 'PRIORITY'), hint('Source order ' + (entry.index + 1) + ' of ' + entry.source.transitions.length + '. Earlier matching handlers in this state have priority. Child handlers are considered before ancestor handlers.'));
    }
    if (SXML.isState(entry)) structuralEditing(box, entry);
  }
  function notes() {
    let box = $('diagram-notes');
    if (!box) { box = h('div', {id: 'diagram-notes', class: 'diagram-notes'}); $('chart').append(box); }
    box.replaceChildren();
    for (const note of data().notes) box.append(h('div', {class: 'diagram-note'}, note));
  }
  function adopt() {
    if (file !== programs[current]) { fileChanged(); file = programs[current]; }
    const source = editor.getValue();
    if (lastSource != null && source !== lastSource) {
      history = []; cursor = -1; visited.clear(); fired.clear(); recording = null;
      if (testing) { replayToken++; testing = false; speed = 260; }
    }
    lastSource = source;
    diagram.coveredStates = coverage ? visited : new Set(); diagram.coveredTransitions = coverage ? fired : new Set();
    tree(); notes(); renderInspector(); tests();
  }
  function selection(entry) {
    let changed = false;
    for (let n = ownerNode(entry)?.parent; n; n = n.parent) if (diagram.collapsed.delete(n.key)) changed = true;
    if (changed) refreshLayout().then(() => diagram.reveal(ownerNode(entry).key));
    tree();
  }
  function fileChanged() {
    replayToken++; testing = false; recording = null;
    file = programs[current]; lastSource = null; history = []; cursor = -1; paused = false;
    scenarioDraft = ''; resultText = ''; resultFailed = false;
    diagram.collapsed.clear(); visited.clear(); fired.clear(); actors.clear(); drafts.clear();
    diagram.coveredStates = new Set(); diagram.coveredTransitions = new Set();
  }

  function structuralEditing(box, entry) {
    box.append(h('div', {class: 'section-title'}, 'SUBCHART'), button('Duplicate subtree', () => edit(() => { selEl = SXMLStudio.duplicate(model.doc, entry.el); }), {disabled: !!run.pid}));
    const choices = model.nodes.filter(n => n !== entry.parent && !entry.el.contains(n.el) && (SXML.CHILDREN[n.kind] || []).includes(entry.kind));
    if (!choices.length) return;
    const preview = h('pre', {class: 'move-preview'});
    let destination = choices[0];
    function describe() {
      const doc = model.doc.cloneNode(true), el = Array.from(doc.querySelectorAll('[id]')).find(n => n.getAttribute('id') === entry.id);
      const target = destination === model.root ? doc.documentElement : Array.from(doc.querySelectorAll('[id]')).find(n => n.getAttribute('id') === destination.id);
      SXMLStudio.reparent(doc, el, target);
      const moved = SXML.build(doc);
      const parentInitial = el.parentNode.getAttribute('initial') || '(none)';
      preview.textContent = 'Move ' + entry.id + ' from ' + (entry.parent.id || 'root') + ' to ' + (destination.id || 'root') + '.\nDestination initial: ' + parentInitial + '.\nOld parent initial: ' + (entry.parent === model.root ? doc.documentElement : Array.from(doc.querySelectorAll('[id]')).find(n => n.getAttribute('id') === entry.parent.id)).getAttribute('initial') + '.\nExisting transition targets stay the same; ancestor handlers, entry/exit behavior and layout can change.\n' + moved.problems.map(p => p.message).join('\n');
    }
    const control = selectBox('move-parent', choices.map(n => [n.key, n.id || 'root']), destination.key, key => { destination = choices.find(n => n.key === key); describe(); });
    describe();
    box.append(h('details', {class: 'tools-card'}, h('summary', {}, 'Move to another parent'), field('Parent', control), preview,
      button('Apply move', () => edit(() => { SXMLStudio.reparent(model.doc, entry.el, destination.el); selEl = entry.el; }), {disabled: !!run.pid})));
  }
  const CHECKPOINTS = 'trinity-sxml-studio.checkpoints.v1.';
  function checkpointKey() {
    const program = programs[current];
    if (!program.workspaceId) { program.workspaceId = crypto.randomUUID(); saveExplorer(); }
    return CHECKPOINTS + program.workspaceId;
  }
  function savedCheckpoints() {
    try { const values = JSON.parse(localStorage.getItem(checkpointKey()) || '[]'); return Array.isArray(values) ? values.filter(v => typeof v.name === 'string' && typeof v.source === 'string') : []; }
    catch (_) { return []; }
  }
  function checkpoints(box) {
    const saved = savedCheckpoints(), result = h('pre', {class: 'checkpoint-preview'}), name = input('checkpoint-name', '', () => {}, {placeholder: 'Checkpoint name', 'aria-label': 'Checkpoint name'});
    box.append(h('div', {class: 'section-title'}, 'CHECKPOINTS'), hint('Versions are stored in this browser. Export them to keep a portable copy.'), name,
      h('div', {class: 'tools-actions'}, button('Save checkpoint', () => {
        try { const values = savedCheckpoints(); values.unshift({name: name.value.trim() || 'Checkpoint ' + (values.length + 1), date: new Date().toISOString(), source: editor.getValue()}); localStorage.setItem(checkpointKey(), JSON.stringify(values.slice(0, 30))); renderInspector(); }
        catch (_) { status('Could not save checkpoint: browser storage is full or unavailable'); }
      }), button('Export checkpoints', () => download('sxml-checkpoints.json', JSON.stringify(saved, null, 2), 'application/json'))),
      h('label', {}, 'Import checkpoints ', h('input', {type: 'file', accept: '.json,application/json', onchange: async e => {
        try { const values = JSON.parse(await e.target.files[0].text()); if (!Array.isArray(values) || values.some(v => !v || typeof v.name !== 'string' || typeof v.source !== 'string')) throw new Error('Invalid checkpoint file'); localStorage.setItem(checkpointKey(), JSON.stringify([...values, ...saved].slice(0, 30))); renderInspector(); }
        catch (error) { status(error.message); }
      }})));
    for (const item of saved) box.append(h('div', {class: 'tools-card'}, h('strong', {}, item.name), hint(item.date || ''), h('div', {class: 'tools-actions'},
      button('Preview / compare', () => {
        const currentLines = editor.getValue().split('\n'), old = item.source.split('\n');
        let prefix = 0, end = 0;
        while (prefix < Math.min(old.length, currentLines.length) && old[prefix] === currentLines[prefix]) prefix++;
        while (end < Math.min(old.length, currentLines.length) - prefix && old[old.length - 1 - end] === currentLines[currentLines.length - 1 - end]) end++;
        result.textContent = prefix === old.length && prefix === currentLines.length ? 'Source is identical.' : 'Checkpoint compared with current source at line ' + (prefix + 1) + ':\n' + old.slice(prefix, old.length - end).map(l => '− ' + l).join('\n') + '\n' + currentLines.slice(prefix, currentLines.length - end).map(l => '+ ' + l).join('\n');
      }), button('Restore', () => { if (run.node) stopRun('Stopped to restore checkpoint'); editor.setValue(item.source); clearTimeout(parseTimer); reparse(); }, {disabled: testing}),
      button('Open copy', () => { programs.push({name: item.name + '.xml', source: item.source}); renderFiles(); selectFile(programs.length - 1); }, {disabled: testing}))));
    box.append(result);
  }

  const actorKey = pid => String(pid || '').split('@')[0].replace(/[\s'"()]/g, '');
  function registerActors() {
    if (run.pid) actors.set(actorKey(run.pid), null);
    // Spawn completion can arrive after the child's initial trace. Resolve all
    // invocation records before consuming the queue, without guessing state IDs.
    for (const item of run.queue) {
      if (item.type !== 'trace' || !actors.has(actorKey(item.actor))) continue;
      const t = termOf(item.text);
      if (t.name !== 'chart_invoked') continue;
      const parentScope = actors.get(actorKey(item.actor));
      if (parentScope) continue; // Only the inline level displayed by the renderer.
      const owner = model.byId.get(unquote(t.args[0]));
      const spawn = owner?.spawns.filter(s => s.type === 'statechart')[Number(t.args[1])];
      if (spawn && model.nested.has(spawn.key)) actors.set(actorKey(unquote(t.args[2])), spawn.key);
    }
  }
  function scope(item) {
    if (item.type !== 'trace') return null;
    registerActors();
    const key = actorKey(item.actor);
    return actors.has(key) ? actors.get(key) : false;
  }
  function snapshot() {
    return {active: run.active.slice(), fired: [...run.fired], nested: [...run.nested].map(([k, ids]) => [k, ids.slice()]),
      facts: [...diagram.liveDatamodels].map(([key, d]) => {
        const nested = [...model.nested.values()].find(m => m.items.has(key));
        const owner = (model.items.get(key) || nested?.items.get(key))?.owner;
        return {key, owner: owner?.kind === 'statechart' ? '#root' : owner?.id, scope: nested?.owner.key || null, facts: d.facts.slice(), truncated: d.truncated};
      })};
  }
  function restore(s) {
    diagram.liveDatamodels.clear();
    for (const d of s.facts) diagram.liveDatamodels.set(d.key, {facts: d.facts.slice(), changed: [], truncated: d.truncated});
    diagram.setRun(true, s.active, s.fired, new Map(s.nested));
    refreshLayout();
  }
  function played(item) {
    if (item.type !== 'trace' || scope(item) === false) return;
    const t = termOf(item.text), s = snapshot(), chartScope = scope(item);
    if (t.name === 'configuration') {
      const m = chartScope ? model.nested.get(chartScope) : model;
      for (const id of listOf(t.args[0] || '[]')) { const n = m.byId.get(id); if (n) visited.add(n.key); }
    }
    if (t.name === 'transition_fired') for (const key of run.fired) fired.add(key);
    if (['configuration', 'transition_fired', 'external_event', 'internal_event', 'datamodel_snapshot', 'guard_result', 'macrostep_complete', 'unmatched', 'deferred'].includes(t.name)) {
      history.push({text: (chartScope ? model.nested.get(chartScope).title + ': ' : '') + item.text, snapshot: s});
      if (history.length > 1000) history.shift();
      cursor = history.length - 1;
    }
    diagram.coveredStates = coverage ? visited : new Set(); diagram.coveredTransitions = coverage ? fired : new Set();
    diagram._paint();
    renderTimeline();
    if (t.name === 'macrostep_complete' && !chartScope) renderPalette();
  }
  function controls() { registerActors(); renderDebug(); }
  function stopped() { paused = false; actors.clear(); }
  function newRun() {
    history = []; cursor = -1; paused = false; actors.clear();
    if (!testing) { visited.clear(); fired.clear(); }
  }
  function inspect(index) {
    if (!history.length) return;
    paused = true; clearTimeout(run.timer); run.timer = null;
    cursor = Math.max(0, Math.min(history.length - 1, index));
    restore(history[cursor].snapshot); renderDebug();
  }
  function resume() {
    paused = false;
    if (history.length && run.pid) { cursor = history.length - 1; restore(history[cursor].snapshot); }
    else if (!run.pid) diagram.setRun(false);
    renderDebug();
    if (run.queue.length && !run.timer) run.timer = setTimeout(drain, 0);
  }
  function renderTimeline() {
    const box = $('timeline-list'); if (!box) return;
    const scroll = box.scrollTop, end = scroll + box.clientHeight >= box.scrollHeight - 8;
    box.replaceChildren();
    history.forEach((item, index) => box.append(button((index + 1) + '. ' + item.text, () => inspect(index), {'aria-current': String(cursor === index), title: item.text})));
    box.scrollTop = !paused && end ? box.scrollHeight : scroll;
    const state = $('playback-state');
    if (state) state.textContent = paused ? 'Viewing observation ' + (cursor + 1) + (run.pid ? ' · interpreter continues running' : ' · engine stopped') : 'Following live trace';
    if ($('timeline-pause')) { $('timeline-pause').disabled = !history.length || testing; $('timeline-pause').textContent = paused ? 'Follow live' : 'Pause playback'; }
    if ($('timeline-previous')) $('timeline-previous').disabled = cursor <= 0 || testing;
    if ($('timeline-next')) $('timeline-next').disabled = testing || (!run.queue.length && cursor >= history.length - 1);
  }
  function renderPalette() {
    const box = $('event-palette'); if (!box) return;
    // Keep the active input intact while events and trace observations arrive.
    if (box.contains(document.activeElement)) return;
    box.replaceChildren();
    if (!run.pid || run.done) { box.append(hint('Run the chart to discover event handlers.')); return; }
    for (const t of SXMLStudio.candidates(model, run.active)) {
      const input = h('input', {value: drafts.get(t.key) ?? t.on, 'aria-label': 'Concrete event for ' + t.source.id + ' handler ' + (t.index + 1), oninput: e => drafts.set(t.key, e.target.value)});
      const row = h('div', {class: 'event-row'}, input, button('Send', () => safeSend(input.value), {disabled: run.busy || testing || paused}));
      box.append(h('div', {class: 'event-owner'}, t.source.id + ' #' + (t.index + 1) + (t.cond ? ' · if ' + t.cond : '')), row);
    }
    if (!box.children.length) box.append(hint('No event handlers in the active configuration.'));
  }
  function renderDebug() {
    const box = $('debug-tools'); if (!box || !model) return;
    // Rebuild controls, preserving event term drafts and timeline scroll.
    const scroll = $('timeline-list')?.scrollTop || 0;
    box.replaceChildren(h('div', {class: 'section-title'}, 'EXECUTION TIMELINE'),
      hint('Playback controls change the display. Timers and actors keep running.'),
      h('div', {class: 'tools-actions'},
        button(paused ? 'Follow live' : 'Pause playback', () => paused ? resume() : inspect(history.length - 1), {id: 'timeline-pause', disabled: !history.length || testing}),
        button('Previous', () => inspect(cursor - 1), {id: 'timeline-previous', disabled: cursor <= 0 || testing}),
        button('Next', () => {
          if (cursor < history.length - 1) inspect(cursor + 1);
          else if (run.queue.length) {
            paused = false; const last = history.at(-1);
            while (run.queue.length) { const item = run.queue.shift(); play(item); played(item); if (history.at(-1) !== last) break; }
            paused = true; renderDebug();
          }
        }, {id: 'timeline-next', disabled: testing || (!run.queue.length && cursor >= history.length - 1)})),
      h('label', {}, 'Playback speed ', selectBox('playback-speed', [['650', 'Slow'], ['260', 'Normal'], ['0', 'Instant']], String(speed), value => { speed = Number(value); })),
      h('p', {id: 'playback-state', class: 'hint'}), h('div', {id: 'timeline-list', class: 'timeline-list'}),
      h('div', {class: 'section-title'}, 'EVENT HANDLERS'), hint('Candidate handlers include ancestors. Guards are evaluated by the interpreter when an event is sent.'), h('div', {id: 'event-palette'}));
    renderTimeline(); $('timeline-list').scrollTop = scroll; renderPalette();
  }
  async function settled(token = replayToken) {
    const deadline = Date.now() + 15000;
    while (run.busy || run.queue.length || run.timer) {
      if (token !== replayToken) throw new Error('Scenario cancelled');
      if (Date.now() > deadline) throw new Error('Timed out waiting for trace playback');
      await new Promise(resolve => setTimeout(resolve, 15));
    }
    if (token !== replayToken) throw new Error('Scenario cancelled');
  }
  async function send(text) {
    if (run.busy || !run.pid || paused || run.done) return;
    text = text.trim().replace(/\.\s*$/, ''); if (!text) return;
    // read_term_from_atom plus ground/1 validates concrete data before sending it.
    // The reserved worker request acknowledges completion of this exact macrostep.
    const token = replayToken;
    const answer = await runGoal("read_term_from_atom(" + quoteAtom(text) + ", Event, []), ground(Event), self(From), make_ref(Ref), $Pid ! '$studio_step'(From, Ref, Event), receive({Ref-studio_done -> true}, [timeout(10), on_timeout(throw(studio_step_timeout))])");
    await settled(token);
    if (!answer || answer.type !== 'success') throw new Error('Event failed; provide a concrete Prolog term and check the trace.');
    if (recording && !testing) { const s = snapshot(); recording.steps.push({event: text, states: s.active.slice()}); tests(); }
    return snapshot();
  }
  function showError(error) { resultText = error.message; resultFailed = true; status(error.message); const box = $('test-result'); if (box) { box.classList.add('fail'); box.textContent = error.message; } }
  async function safeSend(text) { try { return await send(text); } catch (error) { showError(error); } }
  let scenarioDraft = '', resultText = '', resultFailed = false;
  async function record() {
    if (testing || !model || $('chart').classList.contains('stale')) return;
    const token = replayToken;
    try {
      history = []; visited.clear(); fired.clear(); paused = false;
      await startChart(); await settled(token);
      if (!run.pid) throw new Error('The chart did not start');
      recording = {name: 'Recorded scenario', steps: []}; tests();
    } catch (error) { if (token === replayToken) showError(error); }
  }
  function saveDraft() {
    let scenario;
    try { scenario = JSON.parse(scenarioDraft); if (!SXMLStudio.validScenario(scenario)) throw new Error('Use a name and up to 200 steps with event, optional states, and optional facts.'); }
    catch (error) { showError(error); return; }
    if (run.node) stopRun('Stopped to save scenario');
    changeMetadata(meta => {
      const index = meta.scenarios.findIndex(s => s.name === scenario.name);
      if (index < 0) meta.scenarios.push(scenario); else meta.scenarios[index] = scenario;
    });
  }
  async function replay(scenarios) {
    if (testing || !model || !scenarios.length) return;
    testing = true; recording = null; paused = false;
    const token = ++replayToken, oldSpeed = speed; speed = 0;
    visited.clear(); fired.clear(); resultText = ''; resultFailed = false; tests(); runControls();
    try {
      for (const scenario of scenarios) {
        if (token !== replayToken) throw new Error('Scenario cancelled');
        history = []; cursor = -1;
        const start = startChart(); showSide('tests'); await start; await settled(token);
        if (!run.pid) throw new Error('The chart did not start');
        let passed = true;
        for (let i = 0; i < scenario.steps.length; i++) {
          if (token !== replayToken) throw new Error('Scenario cancelled');
          const step = scenario.steps[i], s = await send(step.event);
          if (!s) throw new Error('Cannot send step ' + (i + 1) + ': chart has completed or stopped');
          const errors = SXMLStudio.assertions(step, s);
          if (errors.length) {
            passed = false; resultFailed = true;
            resultText += scenario.name + ' · step ' + (i + 1) + ' FAILED\n' + errors.join('\n') + '\n';
            tests(); break;
          }
          resultText += scenario.name + ' · step ' + (i + 1) + ' passed\n'; tests();
        }
        resultText += scenario.name + (passed ? ' PASSED\n' : ' FAILED\n'); tests();
        if (run.node) stopRun('Scenario complete');
      }
    } catch (error) { if (token === replayToken) { resultFailed = true; resultText += error.message + '\n'; if (run.node) stopRun('Scenario failed'); } }
    finally {
      if (token === replayToken) { testing = false; speed = oldSpeed; tests(); runControls(); }
    }
  }
  function tests() {
    const box = $('tests'); if (!model || !box) return;
    const meta = data();
    if (!scenarioDraft) scenarioDraft = JSON.stringify({name: 'My scenario', steps: [{event: 'start', states: [], facts: []}]}, null, 2);
    box.replaceChildren(h('h3', {}, 'Scenarios'), hint('Each replay starts a fresh engine. States must be active after the event; facts match stored clauses exactly. Use the event palette or diagram when recording.'),
      h('div', {class: 'tools-actions'}, button(recording ? 'Finish recording' : 'Record fresh run', () => {
        if (recording) { scenarioDraft = JSON.stringify(recording, null, 2); recording = null; tests(); }
        else record();
      }, {disabled: testing}), button('Run all saved', () => replay(meta.scenarios), {disabled: testing || !meta.scenarios.length}),
      button('Cancel tests', () => { replayToken++; testing = false; speed = 260; if (run.node) stopRun('Tests cancelled'); tests(); runControls(); }, {disabled: !testing})),
      recording ? hint('Recording ' + recording.steps.length + ' events. Finish recording to review and save.') : h('span', {hidden: true}),
      h('label', {}, h('input', {type: 'checkbox', checked: coverage, onchange: e => { coverage = e.target.checked; diagram.coveredStates = coverage ? visited : new Set(); diagram.coveredTransitions = coverage ? fired : new Set(); diagram._paint(); }}), ' Show coverage in purple'),
      hint(visited.size + '/' + [model, ...model.nested.values()].reduce((n, m) => n + m.nodes.filter(s => s !== m.root).length, 0) + ' states and ' + fired.size + '/' + [model, ...model.nested.values()].reduce((n, m) => n + m.transitions.length, 0) + ' transitions observed (including nested observations).'));
    for (const scenario of meta.scenarios) box.append(h('div', {class: 'tools-card'}, h('strong', {}, scenario.name), hint(scenario.steps.length + ' events'),
      h('div', {class: 'tools-actions'}, button('Edit', () => { scenarioDraft = JSON.stringify(scenario, null, 2); tests(); }), button('Replay', () => replay([scenario]), {disabled: testing}),
        button('Remove', () => changeMetadata(m => { m.scenarios = m.scenarios.filter(s => s.name !== scenario.name); }), {disabled: testing || !!run.pid}))));
    box.append(h('label', {for: 'scenario-json'}, 'Scenario JSON'), h('textarea', {id: 'scenario-json', value: scenarioDraft, disabled: testing, spellcheck: 'false', oninput: e => scenarioDraft = e.target.value}),
      h('div', {class: 'tools-actions'}, button('Save scenario', saveDraft, {disabled: testing}), button('Replay draft', () => {
        try { const s = JSON.parse(scenarioDraft); if (!SXMLStudio.validScenario(s)) throw new Error('Invalid scenario'); replay([s]); } catch (error) { showError(error); }
      }, {disabled: testing}), button('Export saved', () => download('sxml-scenarios.json', JSON.stringify(meta.scenarios, null, 2), 'application/json'))),
      h('label', {for: 'scenario-import'}, 'Import scenarios'), h('input', {id: 'scenario-import', type: 'file', accept: '.json,application/json', disabled: testing || !!run.pid, onchange: async e => {
        try { const values = JSON.parse(await e.target.files[0].text()); if (!Array.isArray(values) || !values.every(SXMLStudio.validScenario)) throw new Error('Invalid scenario file'); changeMetadata(m => { for (const s of values) { m.scenarios = m.scenarios.filter(old => old.name !== s.name); m.scenarios.push(s); } }); }
        catch (error) { showError(error); }
      }}),
      h('div', {id: 'test-result', class: 'test-result' + (resultFailed ? ' fail' : ''), role: 'status'}, resultText),
      h('h3', {}, 'Candidate test paths'), hint('Up to 40 structural paths, at most 6 events each, beginning at the root initial state. Suggestions do not evaluate guards or prove reachability. Nested, parallel, delayed and eventless behavior must be tested in the interpreter. Replace variables with concrete Prolog terms.'));
    const suggestions = SXMLStudio.paths(model);
    suggestions.forEach((steps, i) => box.append(button(steps.map(s => s.event).join(' → '), () => {
      scenarioDraft = JSON.stringify({name: 'Candidate path ' + (i + 1), steps: steps.map(s => ({event: s.event, states: []}))}, null, 2); tests();
    }, {class: 'path-suggestion', disabled: testing})));
    if (!suggestions.length) box.append(hint('No simple event paths found at the root initial state. Record a run for this chart.'));
  }
  $('structure-search').oninput = tree;
  const api = {adopt, selection, inspector, tests, controls, stopped, newRun, fileChanged, scope, played, send: safeSend, paused: () => paused, speed: () => speed, testing: () => testing};
  if (model) adopt();
  return api;
})();
