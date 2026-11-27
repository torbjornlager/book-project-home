/* Navigation, observed execution history and event sending. */
'use strict';
window.studioTools = (() => {
  let file = null, history = [], cursor = -1, paused = false, speed = 260;
  let sendGeneration = 0, lastSource = null, timelineOpen = SXMLWorkspace.preferences.timelineOpen;
  let eventDraft = '';
  const actors = new Map();
  const button = (text, action, attrs = {}) => h('button', Object.assign({type: 'button', onclick: action}, attrs), text);
  const hint = text => h('p', {class: 'hint'}, text);
  function data() { return SXMLStudio.metadata(model.doc); }
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
    window.SXMLChrome?.decorate(box);
  }
  function toggle(n) {
    if (n.kind === 'statechart') return;
    if (!diagram.collapsed.delete(n.key)) diagram.collapsed.add(n.key);
    refreshLayout(); tree(); renderInspector();
  }
  function inspector(entry) {
    const box = $('inspector');
    if (entry.kind !== 'statechart' && (entry.compound || entry.kind === 'parallel')) box.append(button(diagram.collapsed.has(entry.key) ? 'Expand children' : 'Collapse children', () => toggle(entry)));
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
    if (lastSource != null && SXML.machineSource(source) !== SXML.machineSource(lastSource)) {
      history = []; cursor = -1; sendGeneration++;
    }
    lastSource = source;
    tree(); notes(); renderInspector(); renderDebug();
  }
  function selection(entry) {
    let changed = false;
    for (let n = ownerNode(entry)?.parent; n; n = n.parent) if (diagram.collapsed.delete(n.key)) changed = true;
    if (changed) refreshLayout().then(() => diagram.reveal(ownerNode(entry).key));
    tree();
  }
  function fileChanged() {
    sendGeneration++;
    file = programs[current]; lastSource = null; history = []; cursor = -1; paused = false;
    diagram.collapsed.clear(); actors.clear(); eventDraft = '';
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
    if (['configuration', 'transition_fired', 'external_event', 'internal_event', 'datamodel_snapshot', 'guard_result', 'macrostep_complete', 'unmatched', 'deferred'].includes(t.name)) {
      history.push({text: (chartScope ? model.nested.get(chartScope).title + ': ' : '') + item.text, term: t, snapshot: s});
      if (history.length > 1000) history.shift();
      cursor = history.length - 1;
    }
    diagram._paint();
    renderTimeline();
    if (t.name === 'macrostep_complete' && !chartScope) renderPalette();
  }
  function controls() { registerActors(); renderDebug(); }
  function stopped() { paused = false; actors.clear(); sendGeneration++; }
  function newRun() {
    history = []; cursor = -1; paused = false; actors.clear();
    sendGeneration++;
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
    history.forEach((item, index) => {
      const t=item.term, name=t.name;
      const text=name==='configuration' ? 'Active · '+listOf(t.args[0]).join(', ') :
        name==='transition_fired' ? 'Transition · '+unquote(t.args[0])+' #'+(Number(t.args[1])+1) :
        name==='guard_result' ? 'Guard · '+unquote(t.args[0])+' #'+(Number(t.args[1])+1)+' '+(t.args[2]==='true'?'passed':'failed') :
        name==='datamodel_snapshot' ? 'Data updated' : name==='macrostep_complete' ? 'Step complete' :
        name==='external_event' || name==='internal_event' ? 'Event · '+t.args.join(', ') : name+' · '+t.args.join(', ');
      box.append(button(text, () => inspect(index), {'aria-current': String(cursor === index), title: item.text, 'data-icon':name==='configuration'?'state':name==='transition_fired'?'transition':name==='datamodel_snapshot'?'code':name==='guard_result'?(t.args[2]==='true'?'check':'close'):name==='macrostep_complete'?'check':'play'}));
    });
    box.scrollTop = !paused && end ? box.scrollHeight : scroll;
    const state = $('playback-state');
    if (state) state.textContent = paused ? 'Viewing observation ' + (cursor + 1) + (run.pid ? ' · interpreter continues running' : ' · engine stopped') : 'Following live trace';
    if ($('timeline-pause')) { $('timeline-pause').disabled = !history.length; $('timeline-pause').textContent = paused ? 'Follow live' : 'Pause playback'; }
    if ($('timeline-previous')) $('timeline-previous').disabled = cursor <= 0;
    if ($('timeline-next')) $('timeline-next').disabled = (!run.queue.length && cursor >= history.length - 1);
    window.SXMLChrome?.decorate($('debug-tools'));
  }
  function renderPalette() {
    const box = $('event-palette'); if (!box) return;
    // Keep typing uninterrupted when trace playback refreshes the event controls.
    if (box.contains(document.activeElement)) return;
    const disabled = !run.pid || run.starting || run.busy || run.done || paused;
    const input = h('input', {value: eventDraft, disabled, placeholder: 'Prolog term, e.g. input([red])',
      'aria-label': 'Event as a Prolog term', spellcheck: false, autocomplete: 'off',
      oninput: e => { eventDraft = e.target.value; submit.disabled = disabled || !eventDraft.trim(); }});
    const submit = h('button', {type: 'submit', class: 'event-send', 'aria-label': 'Send event', title: 'Send event',
      disabled: disabled || !eventDraft.trim()}, '!');
    box.replaceChildren(h('form', {class: 'event-row', onsubmit: e => {
      e.preventDefault();
      if (!disabled && input.value.trim()) safeSend(input.value);
    }}, input, submit));
  }
  function exampleEventButtons() {
    const events = (model.examples || []).flatMap(goal => {
      const match = /^\$Pid\s*!\s*([\s\S]+)$/.exec(goal);
      return match ? [match[1].trim()] : [];
    });
    if (!events.length) return null;
    const disabled = !run.pid || run.starting || run.busy || run.done || paused;
    return h('section', {class: 'example-events', 'aria-label': 'Example events'},
      h('div', {class: 'debug-heading'}, 'Example events'),
      h('div', {class: 'example-event-buttons'}, ...events.map(event =>
        button(event.replace(/\s+/g, ' '), () => safeSend(event), {disabled, title: 'Send ' + event}))));
  }
  function renderDebug() {
    const box = $('debug-tools'); if (!box || !model) return;
    const scroll = $('timeline-list')?.scrollTop || 0;
    const timeline = h('details', {class:'ui-section', open:timelineOpen},
      h('summary', {}, SXMLChrome.icon('clock'), 'Execution timeline'),
      h('div', {class:'ui-section-body'},
        h('div', {class:'playback-toolbar'},
          button(paused ? 'Follow live' : 'Pause playback', () => paused ? resume() : inspect(history.length - 1), {id:'timeline-pause', class:'compact-action', disabled:!history.length}),
          button('Previous', () => inspect(cursor - 1), {id:'timeline-previous', class:'compact-action', disabled:cursor <= 0}),
          button('Next', () => {
            if (cursor < history.length - 1) inspect(cursor + 1);
            else if (run.queue.length) {
              paused = false; const last = history.at(-1);
              while (run.queue.length) { const item = run.queue.shift(); play(item); played(item); if (history.at(-1) !== last) break; }
              paused = true; renderDebug();
            }
          }, {id:'timeline-next', class:'compact-action', disabled:(!run.queue.length && cursor >= history.length - 1)}),
          h('label', {class:'sr-label', for:'playback-speed'}, 'Playback speed'),
          selectBox('playback-speed', [['650','Slow'],['260','Normal'],['0','Instant']], String(speed), value => {speed=Number(value);})),
        h('p', {id:'playback-state', class:'hint'}), h('div', {id:'timeline-list', class:'timeline-list'}),
        hint('Playback only. Timers and actors continue running.')));
    timeline.querySelector('summary').onclick=()=>setTimeout(()=>{timelineOpen=timeline.open; SXMLWorkspace.save({timelineOpen});},0);
    box.replaceChildren(...[exampleEventButtons()].filter(Boolean),
      h('div', {class:'debug-heading'}, 'Send any event'),
      h('div', {id:'event-palette'}), timeline);
    const speedControl=box.querySelector('[data-f="playback-speed"]'); speedControl.id='playback-speed';
    renderTimeline(); $('timeline-list').scrollTop=scroll; renderPalette();
    window.SXMLChrome?.decorate(box);
  }
  async function settled(token = sendGeneration) {
    const deadline = Date.now() + 15000;
    while (run.busy || run.queue.length || run.timer) {
      if (token !== sendGeneration) throw new Error('Chart changed while sending the event');
      if (Date.now() > deadline) throw new Error('Timed out waiting for trace playback');
      await new Promise(resolve => setTimeout(resolve, 15));
    }
    if (token !== sendGeneration) throw new Error('Chart changed while sending the event');
  }
  async function send(text) {
    if (run.starting || run.busy || !run.pid || paused || run.done) return;
    text = text.trim().replace(/\.\s*$/, ''); if (!text) return;
    // read_term_from_atom plus ground/1 validates concrete data before sending it.
    // The reserved worker request acknowledges completion of this exact macrostep.
    const token = sendGeneration;
    const answer = await runGoal("read_term_from_atom(" + quoteAtom(text) + ", Event, []), ground(Event), self(From), make_ref(Ref), $Pid ! '$studio_step'(From, Ref, Event), receive({Ref-studio_done -> true}, [timeout(10), on_timeout(throw(studio_step_timeout))])");
    await settled(token);
    if (!answer || answer.type !== 'success') throw new Error('Event failed; provide a concrete Prolog term and check the trace.');
    return snapshot();
  }
  function showError(error) { status(error.message); }
  async function safeSend(text) { try { return await send(text); } catch (error) { showError(error); } }
  $('structure-search').oninput = tree;
  const api = {adopt, selection, inspector, controls, stopped, newRun, fileChanged, scope, played, send: safeSend, paused: () => paused, speed: () => speed};
  if (model) adopt();
  return api;
})();
