/* Navigation, live diagram state and event sending. */
'use strict';
window.studioTools = (() => {
  let file = null;
  let sendGeneration = 0, lastSource = null;
  let eventDraft = '';
  const actors = new Map();
  const button = (text, action, attrs = {}) => h('button', Object.assign({type: 'button', onclick: action}, attrs), text);
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
      sendGeneration++;
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
    file = programs[current]; lastSource = null;
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
  function controls() { registerActors(); renderDebug(); }
  function stopped() { actors.clear(); sendGeneration++; }
  function newRun() { actors.clear(); sendGeneration++; }
  function renderPalette() {
    const box = $('event-palette'); if (!box) return;
    // Keep typing uninterrupted when live updates refresh the event controls.
    if (box.contains(document.activeElement)) return;
    const disabled = !run.pid || run.starting || run.busy || run.done;
    const input = h('input', {value: eventDraft, disabled, placeholder: 'Prolog term',
      'aria-label': 'Event as a Prolog term', spellcheck: false, autocomplete: 'off',
      oninput: e => { eventDraft = e.target.value; submit.disabled = disabled || !eventDraft.trim(); }});
    const submit = h('button', {type: 'submit', class: 'event-send', 'aria-label': 'Send event', title: 'Send event',
      disabled: disabled || !eventDraft.trim()}, '!');
    box.replaceChildren(h('form', {class: 'event-row', onsubmit: async e => {
      e.preventDefault();
      if (disabled || !input.value.trim()) return;
      const value = input.value, token = sendGeneration;
      const result = await safeSend(value, {waitForTrace: false});
      if (token !== sendGeneration) return;
      // Sending and live updates rebuild the controls; focus the current input.
      const current = $('event-palette')?.querySelector('input');
      if (result && eventDraft === value) {
        eventDraft = '';
        if (current) {
          current.value = '';
          $('event-palette').querySelector('button').disabled = true;
        }
      }
      if (current && !current.disabled) current.focus({preventScroll: true});
    }}, input, submit));
  }
  function exampleEventButtons() {
    const events = (model.examples || []).flatMap(goal => {
      const match = /^\$Pid\s*!\s*([\s\S]+)$/.exec(goal);
      return match ? [match[1].trim()] : [];
    });
    if (!events.length) return null;
    const disabled = !run.pid || run.starting || run.busy || run.done;
    return h('section', {class: 'example-events', 'aria-label': 'Example events'},
      h('div', {class: 'debug-heading'}, 'Example events'),
      h('div', {class: 'example-event-buttons'}, ...events.map(event =>
        button(event.replace(/\s+/g, ' '), () => safeSend(event), {disabled, title: 'Send ' + event}))));
  }
  function renderDebug() {
    const box = $('debug-tools'); if (!box || !model) return;
    const activeInput = $('event-palette')?.querySelector('input');
    const caret = activeInput && document.activeElement === activeInput
      ? [activeInput.selectionStart, activeInput.selectionEnd, activeInput.selectionDirection] : null;
    box.replaceChildren(...[exampleEventButtons()].filter(Boolean),
      h('div', {class:'debug-heading'}, 'Send any event'),
      h('div', {id:'event-palette'}));
    renderPalette();
    const input = $('event-palette')?.querySelector('input');
    if (caret && input && !input.disabled) {
      input.focus({preventScroll: true});
      input.setSelectionRange(...caret);
    }
    window.SXMLChrome?.decorate(box);
  }
  async function settled(token = sendGeneration) {
    const deadline = Date.now() + 15000;
    while (run.busy || run.queue.length || run.timer) {
      if (token !== sendGeneration) throw new Error('Chart changed while sending the event');
      if (Date.now() > deadline) throw new Error('Timed out waiting for trace updates');
      await new Promise(resolve => setTimeout(resolve, 15));
    }
    if (token !== sendGeneration) throw new Error('Chart changed while sending the event');
  }
  async function send(text, options = {}) {
    if (run.starting || run.busy || !run.pid || run.done) return;
    text = text.trim().replace(/\.\s*$/, ''); if (!text) return;
    // read_term_from_atom plus ground/1 validates concrete data before sending it.
    // The reserved worker request acknowledges completion of this exact macrostep.
    const token = sendGeneration;
    const answer = await runGoal("read_term_from_atom(" + quoteAtom(text) + ", Event, []), ground(Event), self(From), make_ref(Ref), $Pid ! '$studio_step'(From, Ref, Event), receive({Ref-studio_done -> true}, [timeout(10), on_timeout(throw(studio_step_timeout))])", {label: '$Pid ! ' + text, hideAnswer: true});
    if (token !== sendGeneration) throw new Error('Chart changed while sending the event');
    if (!answer || answer.type !== 'success') throw new Error('Event failed; provide a concrete Prolog term and check the trace.');
    if (options.waitForTrace !== false) await settled(token);
    return snapshot();
  }
  function showError(error) { status(error.message); }
  async function safeSend(text, options) { try { return await send(text, options); } catch (error) { showError(error); } }
  $('structure-search').oninput = tree;
  const api = {adopt, selection, inspector, controls, stopped, newRun, fileChanged, scope, send: safeSend};
  if (model) adopt();
  return api;
})();
