/* SXML Studio — application: explorer, source editor, inspector, live run. */
'use strict';
const $ = id => document.getElementById(id);
const EXAMPLES = [
  '01 pause-and-resume', '02 spaghetti', '03 emotions', '04 clock', '05 pingpong', '06 parallel',
  '07 deferred-events', '08 closure', '09 gcd', '10 shared-database', '11 boxshop-1', '12 boxshop-2',
  '13 spawn-actor', '14 spawn-toplevel', '15 spawn-server', '16 spawn-supervisor', '17 spawn-statechart'
];
const EXPLORER_STORAGE = 'trinity-sxml-studio.explorer.v1';
const examplePrograms = () => EXAMPLES.map(name => ({ name: name + '.xml', url: 'examples/' + encodeURIComponent(name + '.xml'), source: null }));

function restoreExplorer() {
  try {
    const saved = JSON.parse(localStorage.getItem(EXPLORER_STORAGE));
    if (!saved || !Array.isArray(saved.files) || !saved.files.length) return null;
    const urls = new Set(examplePrograms().map(p => p.url));
    const files = saved.files.map(p => {
      if (!p || typeof p.name !== 'string' || (p.url != null && !urls.has(p.url)) ||
          (p.source != null && typeof p.source !== 'string') ||
          (p.draft != null && typeof p.draft !== 'string') || (!p.url && p.source == null)) throw new Error('Invalid Explorer data');
      return { name: p.name, url: p.url, source: p.source ?? null, draft: p.draft ?? null, spawnIndex: p.spawnIndex, workspaceId: p.workspaceId, local: !!p.local };
    });
    saved.files.forEach((p, i) => {
      if (p.parentIndex == null) return;
      if (!Number.isInteger(p.parentIndex) || p.parentIndex < 0 || p.parentIndex >= i || !Number.isInteger(p.spawnIndex)) throw new Error('Invalid nested document');
      files[i].parent = files[p.parentIndex];
    });
    return { files, selected: Number.isInteger(saved.selected) && files[saved.selected] ? saved.selected : 0 };
  } catch (e) {
    console.warn('Could not restore the Explorer:', e);
    return null;
  }
}

const restoredExplorer = restoreExplorer();
const programs = restoredExplorer ? restoredExplorer.files : examplePrograms();

function saveExplorer() {
  try {
    const files = programs.map((p, i) => {
      const draft = i === current && loadedIndex === current ? editor.getValue() : p.draft;
      // Reload unchanged bundled sources from the server so example updates stay visible.
      const modified = draft != null && draft !== p.source;
      return { name: p.name, url: p.url, source: p.url && !modified && !p.local ? null : p.source,
        draft: modified ? draft : null, parentIndex: p.parent ? programs.indexOf(p.parent) : null,
        spawnIndex: p.spawnIndex, workspaceId: p.workspaceId, local: !!p.local };
    });
    localStorage.setItem(EXPLORER_STORAGE, JSON.stringify({ files, selected: Math.max(0, current) }));
    return true;
  } catch (e) {
    console.warn('Could not save the Explorer:', e);
    status('Browser storage unavailable · Explorer changes will not survive reload');
    return false;
  }
}

/* ---------- source editor ---------- */

CodeMirror.defineMode('sxml', () => ({
  startState: () => ({ ctx: 'text' }),
  token(stream, st) {
    if (st.ctx === 'comment') {
      if (stream.skipTo('-->')) { stream.match('-->'); st.ctx = 'text'; } else stream.skipToEnd();
      return 'comment';
    }
    if (st.ctx === 'cdata') {
      if (stream.match(']]>')) { st.ctx = 'text'; return 'atom'; }
      if (stream.match(/^<\/?[A-Za-z][\w-]*/)) return 'tag';
      if (stream.match(/^"[^"]*"/)) return 'string';
      stream.next(); return null;
    }
    if (st.ctx === 'tag') {
      if (stream.eatSpace()) return null;
      if (stream.match(/^\/?>/)) { st.ctx = 'text'; return 'tag'; }
      if (stream.match(/^"[^"]*"?/) || stream.match(/^'[^']*'?/)) return 'string';
      if (stream.match(/^[\w:.-]+/)) return 'attribute';
      stream.next(); return null;
    }
    if (stream.match('<!--')) { st.ctx = 'comment'; return 'comment'; }
    if (stream.match('<![CDATA[')) { st.ctx = 'cdata'; return 'atom'; }
    if (stream.match(/^<\/?[A-Za-z][\w.-]*/)) { st.ctx = 'tag'; return 'tag'; }
    if (stream.eatSpace()) return null;
    if (stream.match(/^'(?:[^'\\]|\\.|'')*'/)) return 'string';
    if (stream.match(/^[a-z]\w*/)) return null;
    if (stream.match(/^[A-Z_]\w*/)) return 'variable-2';
    if (stream.match(/^\d+(?:\.\d+)?/)) return 'number';
    stream.next(); return null;
  }
}));
const editor = CodeMirror.fromTextArea($('source'), { lineNumbers: true, mode: 'sxml', indentUnit: 4, tabSize: 4, lineWrapping: false, extraKeys: { Tab: cm => cm.execCommand('insertSoftTab') } });
editor.getInputField().setAttribute('aria-label', 'SXML source');

/* ---------- state ---------- */

let current = 0, loadedIndex = -1;
let model = null;            // last model built from well-formed source
let located = null;          // element -> source range
let selEl = null;            // selected DOM element
let selKey = '#root';
let silent = false;          // suppress editor change handling during programmatic updates
let parseTimer = null;
let focusItem = null;        // item key to highlight in the inspector
let selectionLines = [], errLine = null, locatedText = null;
let snap = null;             // source text of every element, for format-preserving edits

const diagram = new SXMLDiagram.Diagram($('chart'), {
  onSelect(key) { onDiagramClick(key); },
  onOpen(key) { if (model.nested.has(key)) { openNested(key); return; } select(key, { reveal: false }); showSide('inspector'); const f = $('inspector').querySelector('.card.focus textarea, .card.focus input, input[data-f="id"], input[data-f="on"]'); if (f) f.focus(); },
  onConnect(source, target) { connect(source, target); },
  onMove(key, dx, dy) { moveState(key, dx, dy); },
  onZoom(k) { $('zoom').textContent = Math.round(k * 100) + '%'; },
  onKey(ev) { diagramKey(ev); }
});

function status(text) { $('status').textContent = '● ' + text; }
const SPACING_STORAGE = 'trinity-sxml-studio.spacing.v1';
try {
  const saved = JSON.parse(localStorage.getItem(SPACING_STORAGE));
  for (const axis of ['horizontal', 'vertical']) {
    const value = saved && saved[axis];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 && value % 5 === 0) diagram[axis + 'Spacing'] = value;
  }
} catch (e) { console.warn('Could not restore spacing preferences:', e); }

const EXPERIMENTS_STORAGE = 'trinity-sxml-studio.layout-experiments.v1';
try {
  diagram.layoutExperiments = SXMLDiagram.normalizeExperiments(JSON.parse(localStorage.getItem(EXPERIMENTS_STORAGE)));
} catch (e) { console.warn('Could not restore layout experiments:', e); }

function syncSpacingControls() {
  for (const axis of ['horizontal', 'vertical']) {
    const value = diagram[axis + 'Spacing'];
    $('spacing-' + axis).value = value;
    $('spacing-' + axis + '-value').textContent = value + '%';
  }
  for (const key of ['compaction', 'labels', 'order', 'loops', 'alignment', 'effort', 'padding', 'sides']) $('layout-' + key).value = diagram.layoutExperiments[key];
}
function showSpacingSize() {
  if (diagram.geo) $('spacing-status').textContent = 'Diagram size: ' + Math.round(diagram.geo.width) + ' × ' + Math.round(diagram.geo.height) + ' px' + (diagram.geo.fallbackNotes ? '\n' + diagram.geo.fallbackNotes.join(' ') : '');
  requestAnimationFrame(positionLayoutPopover);
}
let spacingTimer = null, spacingGeneration = 0;
function changeSpacing() {
  syncSpacingControls();
  try { localStorage.setItem(SPACING_STORAGE, JSON.stringify({ horizontal: diagram.horizontalSpacing, vertical: diagram.verticalSpacing })); }
  catch (e) { console.warn('Could not save spacing preferences:', e); }
  clearTimeout(spacingTimer);
  const generation = ++spacingGeneration;
  spacingTimer = setTimeout(async () => {
    if (run.pid || run.starting || !model || $('chart').classList.contains('stale')) return;
    $('spacing-status').textContent = 'Laying out…';
    try {
      await diagram.setModel(model, { preserveViewport: true });
      if (generation === spacingGeneration) showSpacingSize();
    } catch (e) {
      if (generation === spacingGeneration) $('spacing-status').textContent = 'Could not apply layout. Try resetting the experiments or spacing.';
      console.warn('Spacing layout failed:', e);
      requestAnimationFrame(positionLayoutPopover);
    }
  }, 120);
}
for (const axis of ['horizontal', 'vertical']) $('spacing-' + axis).oninput = e => {
  if (run.pid || run.starting) return;
  diagram[axis + 'Spacing'] = Number(e.target.value);
  changeSpacing();
};
$('spacing-reset').onclick = () => {
  if (run.pid || run.starting) return;
  diagram.horizontalSpacing = diagram.verticalSpacing = 50;
  changeSpacing();
};
function saveLayoutExperiments() {
  try { localStorage.setItem(EXPERIMENTS_STORAGE, JSON.stringify(diagram.layoutExperiments)); }
  catch (e) { console.warn('Could not save layout experiments:', e); }
  changeSpacing();
}
for (const key of ['compaction', 'labels', 'order', 'loops', 'alignment', 'effort', 'padding', 'sides']) $('layout-' + key).onchange = e => {
  if (run.pid || run.starting) return;
  diagram.layoutExperiments = SXMLDiagram.normalizeExperiments(Object.assign({}, diagram.layoutExperiments, { [key]: e.target.value }));
  saveLayoutExperiments();
};
$('layout-experiments-reset').onclick = () => {
  if (run.pid || run.starting) return;
  diagram.layoutExperiments = SXMLDiagram.normalizeExperiments();
  saveLayoutExperiments();
};
syncSpacingControls();

function positionLayoutPopover() {
  const popover = $('layout-popover');
  if (!popover.matches(':popover-open')) return;
  const button = $('layout-toggle').getBoundingClientRect();
  const panel = popover.getBoundingClientRect();
  popover.style.left = Math.max(12, Math.min(button.left, window.innerWidth - panel.width - 12)) + 'px';
  popover.style.top = Math.max(12, Math.min(button.bottom + 6, window.innerHeight - panel.height - 12)) + 'px';
}
function showLayoutTab(name, focus = false) {
  for (const tab of ['spacing', 'styling']) {
    const selected = tab === name;
    $('layout-' + tab).hidden = !selected;
    $('layout-tab-' + tab).setAttribute('aria-selected', String(selected));
    $('layout-tab-' + tab).tabIndex = selected ? 0 : -1;
  }
  $('layout-popover').scrollTop = 0;
  if (focus) $('layout-tab-' + name).focus();
  requestAnimationFrame(positionLayoutPopover);
}
for (const name of ['spacing', 'styling']) {
  const tab = $('layout-tab-' + name);
  tab.onclick = () => showLayoutTab(name);
  tab.onkeydown = event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'spacing' : event.key === 'End' ? 'styling' : name === 'spacing' ? 'styling' : 'spacing';
    showLayoutTab(next, true);
  };
}
$('layout-popover').addEventListener('toggle', event => {
  if (event.newState === 'open') {
    syncSpacingControls();
    syncAppearanceControls();
    showSpacingSize();
    showLayoutTab('spacing');
  }
});
window.addEventListener('resize', positionLayoutPopover);
$('layout-spacing').querySelector('details').addEventListener('toggle', positionLayoutPopover);

const APPEARANCE_STORAGE = 'trinity-sxml-studio.appearance.v1';
const APPEARANCE_RANGES = ['lineWidth', 'arrowSize', 'borderWidth', 'labelSize', 'labelOpacity'];
try { diagram.applyAppearance(JSON.parse(localStorage.getItem(APPEARANCE_STORAGE))); }
catch (e) { console.warn('Could not restore diagram appearance:', e); }
function syncAppearanceControls() {
  const a = diagram.appearance;
  for (const key of APPEARANCE_RANGES) {
    $('appearance-' + key).value = a[key];
    $('appearance-' + key + '-value').textContent = key === 'labelOpacity' ? Math.round(a[key] * 100) + '%' : a[key] + ' px';
  }
  $('appearance-theme-color').checked = !a.lineColor;
  $('appearance-color').disabled = !a.lineColor;
  const themeColor = getComputedStyle(diagram.svg).getPropertyValue('--edge').trim();
  $('appearance-color').value = a.lineColor || (/^#[0-9a-f]{6}$/i.test(themeColor) ? themeColor : '#9fb1b4');
}
function saveAppearance() {
  try { localStorage.setItem(APPEARANCE_STORAGE, JSON.stringify(diagram.appearance)); }
  catch (e) { console.warn('Could not save diagram appearance:', e); }
}
let appearanceTimer = null, appearanceGeneration = 0;
function changeAppearance(settings) {
  const old = diagram.appearance;
  diagram.applyAppearance(settings);
  syncAppearanceControls(); saveAppearance();
  if (old.labelSize !== diagram.appearance.labelSize || old.lineWidth !== diagram.appearance.lineWidth) {
    clearTimeout(appearanceTimer);
    const generation = ++appearanceGeneration;
    appearanceTimer = setTimeout(async () => {
      appearanceTimer = null;
      if (!model || $('chart').classList.contains('stale')) return;
      $('appearance-status').textContent = 'Updating diagram…';
      try {
        await diagram.setModel(model, { preserveViewport: true });
        if (generation === appearanceGeneration) {
          $('appearance-status').textContent = 'Updated. Use Fit if needed.';
          showSpacingSize();
        }
      } catch (e) {
        if (generation === appearanceGeneration) {
          const previous = diagram.geo && diagram.geo.appearance;
          if (previous) {
            diagram.applyAppearance(Object.assign({}, diagram.appearance, { lineWidth: previous.lineWidth, labelSize: previous.labelSize }));
            syncAppearanceControls(); saveAppearance();
          }
          $('appearance-status').textContent = 'Could not update layout; previous text size and line thickness restored.';
        }
        console.warn('Appearance layout failed:', e);
      }
      requestAnimationFrame(positionLayoutPopover);
    }, 120);
  } else if (!appearanceTimer) $('appearance-status').textContent = '';
}
for (const key of APPEARANCE_RANGES) $('appearance-' + key).oninput = e => changeAppearance(Object.assign({}, diagram.appearance, { [key]: Number(e.target.value) }));
$('appearance-color').oninput = e => changeAppearance(Object.assign({}, diagram.appearance, { lineColor: e.target.value }));
$('appearance-theme-color').onchange = e => changeAppearance(Object.assign({}, diagram.appearance, { lineColor: e.target.checked ? null : $('appearance-color').value }));
$('appearance-reset').onclick = () => changeAppearance(SXMLDiagram.APPEARANCE_DEFAULTS);
syncAppearanceControls();

const SPLIT_STORAGE = 'trinity-sxml-studio.split.v1';
const splitSizes = { horizontal: 36, vertical: 45 };
try {
  const saved = JSON.parse(localStorage.getItem(SPLIT_STORAGE));
  for (const orientation of ['horizontal', 'vertical']) {
    const value = saved && saved[orientation];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 100) splitSizes[orientation] = value;
  }
} catch (e) { console.warn('Could not restore split sizes:', e); }
document.documentElement.style.setProperty('--source-height', splitSizes.horizontal + '%');
document.documentElement.style.setProperty('--source-width', splitSizes.vertical + '%');

function saveSplitSize(vertical, percent) {
  if (!Number.isFinite(percent) || percent <= 0 || percent >= 100) return;
  splitSizes[vertical ? 'vertical' : 'horizontal'] = percent;
  document.documentElement.style.setProperty(vertical ? '--source-width' : '--source-height', percent + '%');
  try { localStorage.setItem(SPLIT_STORAGE, JSON.stringify(splitSizes)); }
  catch (e) { console.warn('Could not save split sizes:', e); }
}

const PANEL_STORAGE = 'trinity-sxml-studio.panels.v1';
const panelWidths = {};
try {
  const saved = JSON.parse(localStorage.getItem(PANEL_STORAGE));
  for (const [name, min, max] of [['left', 120, 340], ['right', 280, 640]]) {
    const value = saved && saved[name];
    if (typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max) panelWidths[name] = value;
  }
} catch (e) { console.warn('Could not restore panel widths:', e); }

function applyPanelWidths() {
  const root = document.documentElement;
  root.style.removeProperty('--left'); root.style.removeProperty('--right');
  const styles = getComputedStyle(root);
  let left = panelWidths.left ?? parseFloat(styles.getPropertyValue('--left'));
  let right = panelWidths.right ?? parseFloat(styles.getPropertyValue('--right'));
  // Fit a smaller window without overwriting the user's preferred widths.
  const available = root.clientWidth - 280;
  right = Math.max(280, Math.min(right, available - left));
  left = Math.max(120, Math.min(left, available - right));
  if (panelWidths.left != null || left !== parseFloat(styles.getPropertyValue('--left'))) root.style.setProperty('--left', left + 'px');
  if (panelWidths.right != null || right !== parseFloat(styles.getPropertyValue('--right'))) root.style.setProperty('--right', right + 'px');
  $('left-divider').setAttribute('aria-valuenow', left);
  $('right-divider').setAttribute('aria-valuenow', right);
}
function savePanelWidth(property, value) {
  panelWidths[property === '--left' ? 'left' : 'right'] = value;
  try { localStorage.setItem(PANEL_STORAGE, JSON.stringify(panelWidths)); }
  catch (e) { console.warn('Could not save panel widths:', e); }
}
applyPanelWidths();
window.addEventListener('resize', () => { applyPanelWidths(); editor.refresh(); });

/* ---------- model lifecycle ---------- */

function entryFor(el) {
  if (!model || !el) return null;
  for (const n of model.nodes) if (n.el === el) return n;
  for (const it of model.items.values()) if (it.el === el) return it;
  return null;
}
function entryByKey(key) { return model ? (model.byKey.get(key) || model.items.get(key) || null) : null; }
function ownerNode(entry) { return entry && entry.owner ? entry.owner : entry; }

/* Parse the editor text and rebuild everything. */
function reparse(opts) {
  const text = editor.getValue();
  const { doc, error } = SXML.parse(text);
  if (errLine != null) { editor.removeLineClass(errLine, 'background', 'err-line'); errLine = null; }
  if (error) {
    $('chart').classList.add('stale');
    showProblems([{ severity: 'error', message: 'Not well-formed XML: ' + error.message, line: error.line }]);
    if (error.line) { errLine = editor.getLineHandle(error.line - 1); if (errLine) editor.addLineClass(errLine, 'background', 'err-line'); }
    status('XML error · the diagram shows the last valid source');
    updateChrome();
    return;
  }
  adopt(doc, text, opts);
}

/* Install a DOM as the current document. */
function adopt(doc, text, opts) {
  const wasRunning = run.pid && run.source !== text;
  model = SXML.build(doc);
  located = SXML.locate(text, doc);
  locatedText = text;
  snap = SXML.snapshot(text, doc);
  $('chart').classList.remove('stale');
  let entry = entryFor(selEl) || entryByKey(selKey) || model.root;
  selEl = entry.el; selKey = entry.key;
  focusItem = entry.owner && entry.kind !== 'go' ? entry.key : null;
  diagram.direction = model.layout && model.layout['@direction'] === 'DOWN' ? 'DOWN' : 'RIGHT';
  syncSplitOrientation();
  $('direction').textContent = diagram.direction === 'RIGHT' ? 'Direction ↓' : 'Direction →';
  $('direction').title = diagram.direction === 'RIGHT' ? 'Arrange the diagram vertically' : 'Arrange the diagram horizontally';
  showProblems(model.problems);
  diagram.setModel(model, opts).then(() => { diagram.select(selKey); });
  if (programs[current].parent) writeBack(programs[current], text);
  renderInspector();
  renderSuggestions();
  window.studioTools?.adopt();
  markSelection(false);
  updateChrome();
  if (wasRunning) stopRun('Source changed · run the chart again to apply');
  else if (!run.pid) status(model.problems.some(p => p.severity === 'error') ? 'Problems found · see the list under the diagram' : 'Ready · ' + programs[current].name);
  saveExplorer();
}

/* Write the (edited) DOM back to the editor and refresh the views. */
function commit() {
  const spaceSlash = (editor.getValue().match(/" \/>/g) || []).length > (editor.getValue().match(/"\/>/g) || []).length;
  const text = SXML.serialize(model.doc, { spaceSlash, snapshot: snap });
  silent = true;
  const scroll = editor.getScrollInfo();
  editor.setValue(text);
  editor.scrollTo(scroll.left, scroll.top);
  silent = false;
  adopt(model.doc, text);
}

function showProblems(list) {
  const box = $('problems');
  box.replaceChildren();
  box.hidden = !list.length;
  for (const p of list) {
    const b = document.createElement('button');
    b.className = p.severity; b.textContent = p.message;
    b.onclick = () => {
      if (p.key) select(p.key, { reveal: true, scroll: true });
      else if (p.line) { editor.setCursor(p.line - 1, 0); editor.focus(); }
    };
    box.append(b);
  }
  diagram.fit && requestAnimationFrame(() => { if (!diagram.userMoved) diagram.fit(); });
}

function updateChrome() {
  const p = programs[current];
  $('filename').textContent = p.name;
  $('dirty').textContent = p.source != null && editor.getValue() !== p.source ? '●' : '';
  $('filename').textContent = p.parent ? p.name.replace(/^↳ /, '') + '  ·  in ' + p.parent.name : p.name;
  if (model) {
    const states = model.nodes.filter(n => n.kind !== 'statechart').length;
    $('stats').textContent = 'SXML 0.2 · ' + states + ' state' + (states === 1 ? '' : 's') + ' · ' + model.transitions.length + ' transition' + (model.transitions.length === 1 ? '' : 's');
  }
  const hist = editor.historySize();
  $('undo').disabled = !hist.undo; $('redo').disabled = !hist.redo;
  $('auto-layout').disabled = !arranged() || !!run.pid || run.starting;
  $('direction').disabled = !!run.pid || run.starting;
  for (const id of ['spacing-horizontal', 'spacing-vertical', 'spacing-reset', 'layout-compaction', 'layout-labels', 'layout-order', 'layout-loops', 'layout-alignment', 'layout-effort', 'layout-padding', 'layout-sides', 'layout-experiments-reset']) $(id).disabled = !!run.pid || run.starting;
  $('layout-run-hint').hidden = !(run.pid || run.starting);
  const regionControl = $('inspector').querySelector('[data-f="region-arrangement"]');
  if (regionControl) regionControl.disabled = !!run.pid || run.starting;
  const entry = entryFor(selEl);
  $('delete').disabled = !entry || entry === model.root || !!run.pid;
  for (const b of document.querySelectorAll('[data-add],#tool-connect')) b.disabled = !!run.pid;
  diagram.readOnly = !!run.pid;
}

editor.on('change', () => {
  if (silent) return;
  clearSelectionMarker();
  clearTimeout(parseTimer);
  parseTimer = setTimeout(() => reparse(), 280);
  updateChrome();
  saveExplorer();
});

/* ---------- selection ---------- */

function select(key, opts) {
  const entry = entryByKey(key) || model.root;
  selEl = entry.el; selKey = entry.key;
  focusItem = entry.owner && entry.kind !== 'go' ? entry.key : null;
  diagram.select(selKey);
  window.studioTools?.selection(entry);
  if (opts && opts.reveal) diagram.reveal(ownerNode(entry).key);
  renderInspector();
  markSelection(!opts || opts.scroll !== false);
  updateChrome();
}

function clearSelectionMarker() {
  editor.operation(() => {
    for (const line of selectionLines) editor.removeLineClass(line, 'gutter', 'source-selection-gutter');
    selectionLines = [];
  });
}

function markSelection(scroll) {
  clearSelectionMarker();
  const r = located && located.map.get(selEl);
  if (!r || selEl === model.doc.documentElement) return;
  const from = editor.posFromIndex(r.start), to = editor.posFromIndex(r.end);
  const lastLine = to.line > from.line && to.ch === 0 ? to.line - 1 : to.line;
  editor.operation(() => {
    for (let line = from.line; line <= lastLine; line++) {
      selectionLines.push(editor.addLineClass(line, 'gutter', 'source-selection-gutter'));
    }
  });
  if (scroll && !editor.hasFocus()) {
    const view = editor.getScrollInfo();
    if (!view.clientHeight) return; // The source pane may be hidden.
    const top = editor.charCoords(from, 'local').top;
    const bottom = editor.charCoords({ line: lastLine, ch: 0 }, 'local').bottom;
    // Keep the view still whenever any part of the selected element is visible.
    if (bottom <= view.top || top >= view.top + view.clientHeight) {
      editor.scrollTo(null, Math.max(0, top - Math.min(60, view.clientHeight / 4)));
    }
  }
}

/* Cursor in the source selects the enclosing element in the diagram. */
editor.on('cursorActivity', () => {
  if (silent || !editor.hasFocus() || !located || !located.ranges.length || locatedText !== editor.getValue()) return;
  const at = editor.indexFromPos(editor.getCursor());
  let best = -1;
  located.ranges.forEach((r, i) => { if (r.start <= at && at <= r.end) best = i; });
  if (best < 0) return;
  let el = located.els[best], entry = null;
  while (el && el.nodeType === 1 && !(entry = entryFor(el))) el = el.parentNode;
  if (entry && entry.key !== selKey) {
    selEl = entry.el; selKey = entry.key;
    focusItem = entry.owner && entry.kind !== 'go' ? entry.key : null;
    diagram.select(selKey); window.studioTools?.selection(entry); diagram.reveal(ownerNode(entry).key);
    renderInspector(); markSelection(false); updateChrome();
  }
});

function onDiagramClick(key) {
  const entry = entryByKey(key);
  if (run.pid && entry && entry.kind === 'go' && entry.on != null) { sendTransition(entry); return; }
  select(key, { reveal: false });
  if (!run.pid && $('settings').hidden) showSide('inspector');
}

/* ---------- editing ---------- */

function guard() {
  if (run.pid) { status('Halt the running chart before editing'); return false; }
  if (!model || $('chart').classList.contains('stale')) { status('Fix the XML error in the source first'); return false; }
  return true;
}

function containerFor(kind) {
  let entry = entryFor(selEl) || model.root;
  let n = ownerNode(entry);
  while (n && !(SXML.CHILDREN[n.kind] || []).includes(kind)) n = n.parent;
  return n || model.root;
}

function addState(kind) {
  if (!guard()) return;
  const parent = containerFor(kind);
  if (kind === 'history' && parent.kind === 'statechart') { status('Select a compound state to add a history state'); return; }
  const el = SXML.addState(model.doc, parent.el, kind);
  selEl = el; commit();
  showSide('inspector');
  const f = $('inspector').querySelector('input[data-f="id"]');
  if (f) { f.focus(); f.select(); }
}

function connect(sourceKey, targetKey) {
  if (!guard()) return;
  const s = model.byKey.get(sourceKey), t = model.byKey.get(targetKey);
  if (!s || !t || !t.id) return;
  if (s.kind === 'final') { status('A final state cannot have transitions'); return; }
  if (s.kind === 'history' && s.transitions.length) { s.transitions[0].el.setAttribute('to', t.id); selEl = s.transitions[0].el; commit(); return; }
  selEl = SXML.addTransition(model.doc, s.el, t.id);
  commit();
  showSide('inspector');
  const f = $('inspector').querySelector('input[data-f="on"]');
  if (f) f.focus();
  status('Transition ' + s.id + ' → ' + t.id + ' added · give it an event, guard or delay');
}

/* Dragging a state rearranges it among its siblings.  The arrangement is a
   set of position hints for the layout engine, kept in a <layout> comment. */
function moveState(key, dx, dy) {
  if (!guard()) return;
  const n = model.byKey.get(key) || model.items.get(key);
  const parent = n ? (n.parent || n.owner) : null;
  if (!parent) return;
  const boxes = diagram.geo.boxes, pb = boxes.get(parent.key);
  const layout = Object.assign({}, model.layout || {});
  const rootNote = parent === model.root && n.kind === 'datamodel';
  let hint = layout[parent.key] && layout[parent.key]['@regions'] ? { '@regions': layout[parent.key]['@regions'] } : {};
  if (rootNote) {
    /* A datamodel note of the root has no edges, so it simply stays where it is dropped. */
    const b = boxes.get(key);
    hint = Object.assign({}, layout['#root'] || {});
    hint[key] = [Math.max(4, Math.round(b.x + dx)), Math.max(4, Math.round(b.y + dy))];
  } else {
    const siblings = [parent.key + '/init', ...parent.datamodels.map(d => d.key), ...parent.children.map(c => c.key)];
    for (const k of siblings) { const b = boxes.get(k); if (b && !(parent === model.root && k.includes('/datamodel'))) hint[k] = [Math.round(b.x - pb.x), Math.round(b.y - pb.y)]; }
    for (const k in layout[parent.key] || {}) if (parent === model.root && k.includes('/datamodel')) hint[k] = layout[parent.key][k];
    if (!hint[key]) return;
    hint[key] = [Math.round(hint[key][0] + dx), Math.round(hint[key][1] + dy)];
  }
  layout[parent.key] = hint;
  SXML.setLayout(model.doc, layout);
  selEl = n.el;
  /* Rearranging states changes the chart's size, so refit.  A note is placed
     freely: keep the view still, or the note seems not to have moved. */
  diagram.userMoved = rootNote;
  commit();
  status('Arrangement saved in the <layout> comment · “Auto” returns to automatic layout');
}

function removeSelected() {
  if (!guard()) return;
  const entry = entryFor(selEl);
  if (!entry || entry === model.root) return;
  const parent = ownerNode(entry) === entry ? entry.parent : entry.owner;
  SXML.removeElement(model.doc, entry.el);
  selEl = parent ? parent.el : model.doc.documentElement;
  commit();
}

function diagramKey(ev) {
  const mod = ev.ctrlKey || ev.metaKey;
  if ((ev.key === 'Delete' || ev.key === 'Backspace') && !mod) { ev.preventDefault(); removeSelected(); }
  else if (ev.key === 'Escape') { setTool(null); select('#root'); }
  else if (mod && ev.key.toLowerCase() === 'z') { ev.preventDefault(); ev.shiftKey ? editor.redo() : editor.undo(); }
  else if (mod && ev.key.toLowerCase() === 'y') { ev.preventDefault(); editor.redo(); }
  else if (ev.key === 't' && !mod) setTool(diagram.tool === 'connect' ? null : 'connect');
  else if (ev.key === '0' && !mod) diagram.fit();
}

function setTool(tool) {
  diagram.tool = tool;
  $('tool-connect').setAttribute('aria-pressed', String(tool === 'connect'));
  $('chart').classList.toggle('connect', tool === 'connect');
  if (tool === 'connect') status('Transition tool · drag from the source state to the target state');
}

/* ---------- nested charts as documents ---------- */

const chartSpawns = doc => Array.from(doc.querySelectorAll('spawn')).filter(e => e.getAttribute('type') === 'statechart');

/* Open the inline chart of a <spawn type="statechart"> as a document of its own. */
function openNested(spawnKey) {
  const s = model.items.get(spawnKey);
  if (!s || s.kind !== 'spawn') return;
  if (run.pid) { status('Halt the running chart before opening the nested one'); return; }
  const parent = programs[current], index = chartSpawns(model.doc).indexOf(s.el), nm = model.nested.get(spawnKey);
  let i = programs.findIndex(p => p.parent === parent && p.spawnIndex === index);
  const source = s.body + '\n';
  if (i < 0) { programs.push({ name: '↳ ' + (nm ? nm.title : 'nested chart') + '.xml', source, parent, spawnIndex: index }); i = programs.length - 1; }
  else { programs[i].source = source; programs[i].draft = null; }
  selectFile(i);
}

/* Store an edited nested chart back into its parent's CDATA section. */
function writeBack(p, text) {
  const P = p.parent, ptext = P.draft != null ? P.draft : P.source;
  if (ptext == null) return;
  const r = SXML.parse(ptext);
  const el = r.doc ? chartSpawns(r.doc)[p.spawnIndex] : null;
  if (!el) { status('The parent no longer has this nested chart · changes stay in this document only'); return; }
  if (SXML.dedent(el.textContent) === SXML.dedent(text)) return;
  const sn = SXML.snapshot(ptext, r.doc), o = sn && sn.map.get(el);
  SXML.setNested(r.doc, el, text, o ? o.indent : '        ');
  P.draft = SXML.serialize(r.doc, { spaceSlash: (ptext.match(/" \/>/g) || []).length > (ptext.match(/"\/>/g) || []).length, snapshot: sn });
}

/* ---------- inspector ---------- */

function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const k in attrs || {}) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e[k] = v;
    else if (k === 'value') e.value = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null) e.append(kid);
  return e;
}

/* Apply an edit, then refresh; keeps keyboard focus on the same field. */
function edit(fn) {
  if (!guard()) { renderInspector(); return; }
  setTimeout(() => {
    const a = document.activeElement, f = a && a.dataset ? a.dataset.f : null;
    fn();
    commit();
    if (f) { const again = $('inspector').querySelector('[data-f="' + CSS.escape(f) + '"]'); if (again) again.focus(); }
  }, 0);
}

function input(f, value, onchange, extra) {
  return h('input', Object.assign({ 'data-f': f, value: value == null ? '' : value, spellcheck: 'false', autocomplete: 'off', onchange: ev => onchange(ev.target.value.trim()) }, extra || {}));
}
function area(f, value, onchange, rows) {
  const lines = String(value || '').split('\n').length;
  return h('textarea', { 'data-f': f, value: value || '', rows: Math.max(rows || 1, Math.min(12, lines)), spellcheck: 'false', onchange: ev => onchange(ev.target.value) });
}
function selectBox(f, options, value, onchange) {
  const s = h('select', { 'data-f': f, onchange: ev => onchange(ev.target.value) }, options.map(o => h('option', { value: o[0] }, o[1])));
  s.value = value;
  return s;
}
const field = (label, control, block) => h('div', { class: 'field' + (block ? ' block' : '') }, h('label', {}, label), control);

function renderInspector() {
  const box = $('inspector');
  const scroll = box.scrollTop;
  box.replaceChildren();
  if (!model) return;
  const entry = entryFor(selEl) || model.root;
  if (entry.kind === 'go') transitionInspector(box, entry);
  else stateInspector(box, ownerNode(entry));
  box.scrollTop = scroll;
  const focus = box.querySelector('.card.focus');
  if (focus) focus.scrollIntoView({ block: 'nearest' });
  window.studioTools?.inspector(entry);
  window.SXMLChrome?.inspector(box);
}

function pathOf(n) {
  const parts = [];
  for (let p = n; p; p = p.parent) parts.unshift(p);
  const out = h('div', { class: 'insp-path' });
  parts.forEach((p, i) => {
    if (i) out.append(' › ');
    out.append(h('a', { onclick: () => select(p.key, { reveal: true }) }, p.kind === 'statechart' ? 'statechart' : p.id || '(no id)'));
  });
  return out;
}

function scriptCards(box, n, list, name, title) {
  box.append(h('div', { class: 'section-title' }, title, h('button', { onclick: () => edit(() => { selEl = SXML.addItem(model.doc, n.el, name); }) }, '+ Add')));
  list.forEach((it, i) => {
    box.append(h('div', { class: 'card' + (focusItem === it.key ? ' focus' : '') },
      h('div', { class: 'card-top' }, h('span', {}, '<' + name + '>' + (list.length > 1 ? ' ' + (i + 1) : '')),
        h('button', { class: 'mini', title: 'Remove', onclick: () => edit(() => { it.el.remove(); selEl = n.el; }) }, '×')),
      area(it.key, it.body, v => edit(() => SXML.setScript(model.doc, it.el, v)), name === 'datamodel' ? 3 : 1)));
  });
}

function datamodelField(box, n) {
  box.append(h('div', { class: 'section-title' }, 'DATAMODEL · PROLOG SOURCE'));
  const control = area(n.key + '/datamodel', n.datamodels.map(it => it.body).join('\n\n'), v => edit(() => {
    if (v.trim()) {
      const el = n.datamodels.length ? n.datamodels[0].el : SXML.addItem(model.doc, n.el, 'datamodel');
      SXML.setScript(model.doc, el, v);
      n.datamodels.slice(1).forEach(it => it.el.remove());
    } else {
      n.datamodels.forEach(it => it.el.remove());
    }
    selEl = n.el;
  }), 3);
  control.setAttribute('aria-label', 'Datamodel Prolog source');
  control.placeholder = 'No datamodel';
  box.append(control);
}

function summary(t) {
  const trig = SXMLDiagram.trigger(t) || 'always';
  return [h('b', {}, trig), t.to.length ? ' → ' + t.to.join(' ') : ' (stay)'];
}

function stateInspector(box, n) {
  const root = n.kind === 'statechart';
  box.append(h('div', { class: 'insp-head' }, h('span', { class: 'insp-kind' }, n.kind), h('span', { class: 'insp-title' }, root ? n.id : n.id || '(no id)')));
  if (!root) box.append(pathOf(n));
  if (!root) {
    box.append(field('Type', selectBox('kind', [['state', 'state'], ['parallel', 'parallel'], ['final', 'final'], ['history', 'history']], n.kind,
      v => edit(() => { selEl = SXML.retag(model.doc, n.el, v); }))));
  }
  box.append(field('Id', input('id', n.id, v => edit(() => {
    if (root) SXML.setAttr(n.el, 'id', v);
    else if (v && !/\s/.test(v)) SXML.renameState(model.doc, n.el, v);
  }), root ? { placeholder: 'statechart_actor' } : {})));
  if (root) box.append(field('Version', input('version', n.el.getAttribute('version'), v => edit(() => SXML.setAttr(n.el, 'version', v)))));
  if (n.kind === 'parallel') {
    const saved = model.layout && model.layout[n.key] && model.layout[n.key]['@regions'];
    const safe = SXMLDiagram.canArrangeRegions(model, n);
    const control = selectBox('region-arrangement', [['DOWN', 'Stacked'], ['RIGHT', 'Side by side'], ['AUTO', 'Follow chart']], saved || (safe ? 'DOWN' : 'AUTO'), value => edit(() => {
      const layout = Object.assign({}, model.layout || {});
      const hints = Object.assign({}, layout[n.key] || {});
      if (value !== 'DOWN') hints['@regions'] = value;
      else delete hints['@regions'];
      if (Object.keys(hints).length) layout[n.key] = hints;
      else delete layout[n.key];
      SXML.setLayout(model.doc, layout);
      selEl = n.el;
      diagram.userMoved = false;
    }));
    control.setAttribute('aria-label', 'Region arrangement');
    for (const option of control.options) if (option.value !== 'AUTO') option.disabled = !safe;
    control.disabled = !!run.pid || run.starting;
    box.append(field('Region arrangement', control, true));
    if (!safe) box.append(h('p', { class: 'hint' }, 'Regions follow the chart direction because transitions cross region boundaries.'));
  }
  const kids = n.children.filter(c => c.kind !== 'history');
  if ((root || n.kind === 'state') && (kids.length || n.initial)) {
    const opts = kids.map(c => [c.id, c.id]);
    if (!kids.some(c => c.id === n.initial)) opts.unshift([n.initial, n.initial ? n.initial + ' (missing)' : '(choose)']);
    box.append(field('Initial', selectBox('initial', opts, n.initial, v => edit(() => SXML.setAttr(n.el, 'initial', v)))));
  }
  if (n.kind === 'history') {
    box.append(field('History', selectBox('htype', [['shallow', 'shallow — immediate children'], ['deep', 'deep — full configuration']], n.htype,
      v => edit(() => SXML.setAttr(n.el, 'type', v === 'shallow' ? '' : v)))));
    const t = n.transitions[0];
    const ids = n.parent.children.filter(c => c.kind !== 'history').map(c => [c.id, c.id]);
    box.append(field('Default', selectBox('hdefault', t && !ids.some(o => o[0] === t.to[0]) ? [[t.to.join(' '), t.to.join(' ')], ...ids] : ids, t ? t.to.join(' ') : '',
      v => edit(() => { const go = t ? t.el : SXML.addTransition(model.doc, n.el, v); go.setAttribute('to', v); }))));
    box.append(h('p', { class: 'hint' }, 'A transition to “' + n.id + '” restores what was active in “' + (n.parent.id || 'the root') + '” when it was last exited. The default target is used before any history exists.'));
  }
  const allow = SXML.CHILDREN[n.kind];
  if (allow.includes('datamodel')) datamodelField(box, n);
  if (allow.includes('onentry')) scriptCards(box, n, n.onentry, 'onentry', 'ENTRY ACTIONS');
  if (allow.includes('onexit')) scriptCards(box, n, n.onexit, 'onexit', 'EXIT ACTIONS');

  if (allow.includes('go') && n.kind !== 'history') {
    box.append(h('div', { class: 'section-title' }, 'TRANSITIONS · IN PRIORITY ORDER', h('button', { onclick: () => edit(() => { selEl = SXML.addTransition(model.doc, n.el, ''); }) }, '+ Add')));
    n.transitions.forEach((t, i) => {
      box.append(h('div', { class: 'trow' },
        h('button', { class: 'tsum', title: 'Edit this transition', onclick: () => select(t.key, { reveal: false }) }, summary(t)),
        h('button', { class: 'mini', title: 'Higher priority', disabled: i === 0, onclick: () => edit(() => SXML.move(t.el, -1)) }, '↑'),
        h('button', { class: 'mini', title: 'Lower priority', disabled: i === n.transitions.length - 1, onclick: () => edit(() => SXML.move(t.el, 1)) }, '↓')));
    });
    if (!n.transitions.length) box.append(h('p', { class: 'hint' }, 'None. Use the Transition tool to connect states, or use + Add for a reaction that stays in this state.'));
  }

  if (allow.includes('defer')) {
    box.append(h('div', { class: 'section-title' }, 'DEFERRED EVENTS', h('button', { onclick: () => edit(() => { selEl = SXML.addItem(model.doc, n.el, 'defer'); }) }, '+ Add')));
    for (const d of n.defers) {
      box.append(h('div', { class: 'card' + (focusItem === d.key ? ' focus' : '') },
        h('div', { class: 'card-top' }, h('span', {}, '<defer>'), h('button', { class: 'mini', title: 'Remove', onclick: () => edit(() => { d.el.remove(); selEl = n.el; }) }, '×')),
        field('On', input(d.key + '/on', d.on, v => edit(() => SXML.setAttr(d.el, 'on', v)))),
        field('If', input(d.key + '/if', d.cond, v => edit(() => SXML.setAttr(d.el, 'if', v)), { placeholder: 'true' }))));
    }
  }
  if (allow.includes('spawn')) {
    box.append(h('div', { class: 'section-title' }, 'SPAWNED ACTORS', h('button', { onclick: () => edit(() => { selEl = SXML.addItem(model.doc, n.el, 'spawn'); }) }, '+ Add')));
    for (const s of n.spawns) {
      const card = h('div', { class: 'card' + (focusItem === s.key ? ' focus' : '') },
        h('div', { class: 'card-top' }, h('span', {}, '<spawn>'), h('button', { class: 'mini', title: 'Remove', onclick: () => edit(() => { s.el.remove(); selEl = n.el; }) }, '×')),
        field('Type', selectBox(s.key + '/type', SXML.SPAWN_TYPES.map(t => [t, t]), s.type, v => edit(() => {
          s.el.setAttribute('type', v);
          for (const a of ['goal', 'callback', 'state', 'children']) if (!SXML.SPAWN_REQUIRED[v].includes(a)) s.el.removeAttribute(a);
          for (const a of SXML.SPAWN_REQUIRED[v]) if (!s.el.hasAttribute(a)) s.el.setAttribute(a, a === 'children' ? '[]' : a === 'state' ? '0' : 'worker');
        }))));
      for (const a of SXML.SPAWN_REQUIRED[s.type] || []) {
        card.append(field(a[0].toUpperCase() + a.slice(1), input(s.key + '/' + a, s.el.getAttribute(a), v => edit(() => SXML.setAttr(s.el, a, v)))));
      }
      card.append(field('Options', input(s.key + '/options', s.el.getAttribute('options'), v => edit(() => SXML.setAttr(s.el, 'options', v)), { placeholder: '[monitor(true)]' })));
      card.append(field(s.type === 'statechart' ? 'Nested SXML (kept in CDATA)' : 'Prolog source', area(s.key, s.body, v => edit(() => SXML.setScript(model.doc, s.el, v)), 3), true));
      if (s.type === 'statechart' && s.body.trim()) card.append(h('div', { class: 'insp-actions' }, h('button', { onclick: () => openNested(s.key) }, 'Open nested chart ↗')));
      box.append(card);
    }
  }

  if (!root) box.append(h('div', { class: 'insp-actions', style: 'margin-top:18px' }, h('button', { class: 'danger', onclick: removeSelected }, 'Delete ' + n.kind)));
  if (root && model.description) box.append(h('div', { class: 'section-title' }, 'ABOUT THIS CHART'), h('p', { class: 'about' }, model.description.replace(/\n(?!\n)/g, ' ').replace(/\n /g, '\n\n')));
}

function transitionInspector(box, t) {
  const n = t.source;
  box.append(h('div', { class: 'insp-head' }, h('span', { class: 'insp-kind' }, 'transition'), h('span', { class: 'insp-title' }, (n.id || 'statechart') + (t.to.length ? ' → ' + t.to.join(' ') : ' (stay)'))));
  box.append(pathOf(n));
  const ids = h('datalist', { id: 'state-ids' }, model.nodes.filter(x => x.id).map(x => h('option', { value: x.id })));
  box.append(ids);
  box.append(field('To', input('to', t.to.join(' '), v => edit(() => SXML.setAttr(t.el, 'to', v.split(/\s+/).filter(Boolean).join(' '))), { list: 'state-ids', placeholder: 'none — stay in ' + (n.id || 'place') })));
  box.append(field('On', input('on', t.on, v => edit(() => { SXML.setAttr(t.el, 'on', v); if (v) t.el.removeAttribute('after'); }), { placeholder: 'event pattern, e.g. start(Job)' })));
  box.append(field('If', input('if', t.cond, v => edit(() => SXML.setAttr(t.el, 'if', v)), { placeholder: 'guard goal · default true' })));
  box.append(field('After', input('after', t.after, v => edit(() => { SXML.setAttr(t.el, 'after', v); if (v) t.el.removeAttribute('on'); }), { placeholder: 'seconds · instead of an event', inputmode: 'decimal' })));
  box.append(field('Action · Prolog goal run when the transition is taken', area('body', t.body, v => edit(() => SXML.setScript(model.doc, t.el, v)), 3), true));
  const kind = t.on != null ? 'Triggered by an event that unifies with the pattern.' : t.after != null ? 'Fires ' + t.after + ' s after its source state is entered; cancelled on exit.' : 'Eventless: taken as soon as its guard holds.';
  box.append(h('p', { class: 'hint' }, kind + (t.to.length ? (t.to.length === 1 && t.to[0] === n.id ? ' Targets its own source, so the state is exited and re-entered.' : '') : ' Without a target the action runs and no state is exited or entered.')));
  if (n.kind !== 'history') {
    box.append(h('div', { class: 'section-title' }, 'PRIORITY AMONG TRANSITIONS OF ' + (n.id || 'ROOT').toUpperCase()));
    n.transitions.forEach((x, i) => {
      const row = h('div', { class: 'trow' },
        h('button', { class: 'tsum', onclick: () => select(x.key, { reveal: false }) }, (i + 1) + '. ', summary(x)),
        h('button', { class: 'mini', title: 'Higher priority', disabled: i === 0, onclick: () => edit(() => SXML.move(x.el, -1)) }, '↑'),
        h('button', { class: 'mini', title: 'Lower priority', disabled: i === n.transitions.length - 1, onclick: () => edit(() => SXML.move(x.el, 1)) }, '↓'));
      if (x === t) row.firstChild.style.borderColor = 'var(--blue)';
      box.append(row);
    });
  }
  box.append(h('div', { class: 'insp-actions' }, h('button', { class: 'danger', onclick: removeSelected }, 'Delete transition')));
}

/* ---------- live run ---------- */

const run = { nested: new Map(), node: null, pid: null, source: null, busy: false, starting: false, generation: 0, active: [], fired: new Set(), lastEvent: null, queue: [], timer: null, done: false };
let inputResolve = null;

function logRow(cls, parts) {
  if (cls === 'err' && $('runtime-console')) $('runtime-console').open = true;
  const log = $('log');
  const stick = log.scrollTop + log.clientHeight >= log.scrollHeight - 8;
  const d = document.createElement('div');
  d.className = cls;
  for (const p of [].concat(parts)) d.append(p);
  log.append(d);
  while (log.childElementCount > 1500) log.firstChild.remove();
  if (stick) log.scrollTop = log.scrollHeight;
}
const bold = t => { const b = document.createElement('b'); b.textContent = t; return b; };

function runControls() {
  $('run-start').disabled = run.starting || run.busy || !!window.studioTools?.testing();
  $('run-start').textContent = run.pid ? '↻ Restart chart' : '▷ Run chart';
  $('run-halt').disabled = !run.node || run.starting;
  const badge = $('run-badge');
  badge.textContent = run.starting ? 'starting' : run.pid ? (run.done ? 'done' : 'live') : 'idle';
  badge.classList.toggle('live', !!run.pid && !run.done);
  updateChrome();
  window.studioTools?.controls();
  window.SXMLChrome?.decorate(document.querySelector('.query-pane'));
  window.SXMLChrome?.syncRun();
}

function cancelInput() {
  if (inputResolve) { const r = inputResolve; inputResolve = null; r(null); }
  if ($('input-dialog').open) $('input-dialog').close();
}
$('input-dialog').addEventListener('close', () => {
  if (!inputResolve) return;
  const r = inputResolve; inputResolve = null;
  r($('input-dialog').returnValue === 'send' ? $('input-value').value : null);
});

function disposeNode() {
  window.studioTools?.stopped();
  run.generation++;
  cancelInput();
  if (run.node) { try { run.node.dispose(); } catch (e) { /* already gone */ } }
  run.node = null; run.pid = null; run.busy = false; run.starting = false; run.done = false;
  run.queue = []; clearTimeout(run.timer); run.timer = null;
  run.active = []; run.fired = new Set(); run.lastEvent = null; run.nested = new Map();
  diagram.setRun(false);
}

function stopRun(message) {
  if (!run.node) return;
  disposeNode();
  logRow('note', message || 'Engine stopped.');
  status(message || 'Chart stopped');
  runControls();
}

async function ensureNode() {
  if (run.node) return run.node;
  run.starting = true; runControls(); status('Starting a fresh engine…');
  const token = ++run.generation;
  const abs = p => new URL(p, location.href).href;
  const node = SwiWasmNode.create({
    workerUrl: abs('runtime/swi_wasm_actor_worker.js?v=20261123-studio-tools'),
    engineUrl: abs('runtime/swipl-bundle.js'),
    prologBaseUrl: abs('runtime/wasm/'),
    sharedDatabaseUrl: abs('runtime/wasm/shared_db.pl'),
    onEvent(event) {
      if (token !== run.generation) return false;
      if (event.type === 'output') { enqueue({ type: 'output', text: String(event.data) }); return true; }
      if (event.type === 'statechart_trace') { enqueue({ type: 'trace', text: String(event.data), actor: event.actor }); return true; }
      if (event.type === 'shell_error' || event.type === 'error') logRow('err', 'Runtime: ' + event.error);
    },
    onInput: text => new Promise(resolve => {
      if (token !== run.generation) return resolve(null);
      $('input-prompt').textContent = text; $('input-value').value = ''; $('input-dialog').returnValue = '';
      inputResolve = resolve; $('input-dialog').showModal(); $('input-value').focus();
    })
  });
  run.node = node;
  try {
    await node.open({ source: '' });
    if (token !== run.generation) throw new Error('cancelled');
  } catch (error) {
    if (token === run.generation) { disposeNode(); logRow('err', 'Could not start the engine: ' + error); status('Could not start the engine'); runControls(); }
    throw error;
  }
  run.starting = false;
  return node;
}

const quoteAtom = text => "'" + text.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";

async function runGoal(raw) {
  raw = String(raw).trim().replace(/^\?-\s*/, '').replace(/\.\s*$/, '');
  if (!raw || run.busy || run.starting) return;
  const spawns = /<editor>/.test(raw);
  if (spawns) {
    if (!model || $('chart').classList.contains('stale')) { status('Fix the XML error before running'); return; }
    window.studioTools?.newRun();
    if (run.node) disposeNode();
    $('log').replaceChildren();
  }
  if (/\$Pid\b/.test(raw) && !run.pid) { showSide('run'); logRow('err', 'No chart is running. Press “Run chart” first.'); status('No chart is running'); return; }
  let node;
  try { node = await ensureNode(); } catch (e) { return; }
  const token = run.generation;
  let goal = raw.replace(/\$Pid\b/g, run.pid || '_');
  const source = editor.getValue();
  if (spawns) {
    const atom = quoteAtom(source), traced = /\btrace\(/.test(goal);
    goal = goal.replace(/src_text\(\s*<editor>\s*\)|<editor>/g, m => m.length > 8 ? 'src_text(' + atom + ')' + (traced ? '' : ', trace(true)') : atom);
    run.source = source;
  }
  run.busy = true; runControls();
  enqueue({ type: 'goal', text: '?- ' + raw + '.' });
  status(spawns ? 'Spawning the chart…' : 'Running query…');
  try {
    const answer = await node.query(goal, { limit: 1 });
    if (token !== run.generation) return;
    if (answer.type === 'success') {
      const row = Array.isArray(answer.data) ? answer.data[0] : null;
      const text = row && typeof row === 'object' ? Object.entries(row).map(([k, v]) => k + ' = ' + v).join(',\n') : '';
      enqueue({ type: 'answer', text: text || 'true' });
      if (spawns && row) {
        run.pid = String(row.Pid || Object.values(row).find(v => /@/.test(String(v))) || '');
        if (run.pid) { diagram.setRun(true, run.active, run.fired, run.nested); status('Chart running as ' + run.pid + ' · send it events'); }
      } else status('Query complete');
    } else if (answer.type === 'failure') { enqueue({ type: 'answer', text: 'false' }); status('Query failed'); }
    else {
      const data = typeof answer.data === 'string' ? answer.data : JSON.stringify(answer.data);
      enqueue({ type: 'error', text: tidyError(data) });
      status(spawns ? 'The chart did not start · see the log' : 'Prolog exception');
      if (spawns) diagram.setRun(false);
    }
    return answer;
  } catch (error) {
    if (token === run.generation) { logRow('err', String(error)); status('Query failed · see the log'); }
  } finally {
    if (token === run.generation) { run.busy = false; runControls(); }
  }
}

/* Startup errors arrive as character lists; make them readable. */
function tidyError(text) {
  return text.replace(/\[((?:(?:'(?:[^'\\]|\\.)*'|[^,\[\]']+),){6,}(?:'(?:[^'\\]|\\.)*'|[^,\[\]']+))\]/g, (m, body) => {
    const chars = body.match(/'(?:[^'\\]|\\.)*'|[^,]+/g) || [];
    if (!chars.every(c => c.replace(/^'|'$/g, '').replace(/\\(.)/g, '$1').length === 1)) return m;
    return '"' + chars.map(c => c.replace(/^'|'$/g, '').replace(/\\(.)/g, '$1')).join('') + '"';
  });
}

function startChart() {
  showSide('run');
  const spawn = (model && model.examples.find(g => /statechart_spawn/.test(g) && /<editor>/.test(g))) || 'statechart_spawn(Pid, [\n       src_text(<editor>)\n   ])';
  return runGoal(spawn);
}

async function haltChart() {
  if (!run.node) return;
  if (run.pid && !run.busy && !run.done) {
    await runGoal('statechart_halt($Pid, Reply, 1)');
    await new Promise(r => setTimeout(r, 150));
  }
  stopRun('Chart halted · engine disposed');
}

function sendTransition(t) {
  const pattern = String(t.on).trim();
  const bare = pattern.replace(/'(?:[^'\\]|\\.)*'/g, '');
  if (/(^|[^\w])[A-Z_]\w*/.test(bare)) {
    showSide('run');
    const event = window.prompt('Enter a concrete event for this transition:', pattern);
    if (event && event.trim()) window.studioTools ? window.studioTools.send(event.trim()) : runGoal('$Pid ! ' + event.trim());
    return;
  }
  if (window.studioTools) window.studioTools.send(pattern); else runGoal('$Pid ! ' + pattern);
}

/* ----- trace playback ----- */

function enqueue(item) {
  run.queue.push(item);
  if (!run.timer) run.timer = setTimeout(drain, 0);
}

function drain() {
  run.timer = null;
  if (run.busy && !run.pid) { run.timer = setTimeout(drain, 20); return; }
  if (window.studioTools?.paused()) return;
  while (run.queue.length) {
    const item = run.queue.shift();
    const pause = play(item);
    window.studioTools?.played(item);
    if (pause && run.queue.length < 400) {
      run.timer = setTimeout(drain, run.queue.length > 40 ? 30 : (window.studioTools?.speed() ?? 260));
      return;
    }
  }
  window.studioTools?.controls();
}

function splitTop(s) {
  const out = []; let depth = 0, start = 0, q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '\\') i++; else if (c === "'") q = false; continue; }
    if (c === "'") q = true;
    else if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (c === ',' && depth === 0) { out.push(s.slice(start, i)); start = i + 1; }
  }
  out.push(s.slice(start));
  return out.map(x => x.trim()).filter(x => x !== '');
}
const unquote = a => /^'[\s\S]*'$/.test(a) ? a.slice(1, -1).replace(/''|\\(u[\da-fA-F]{4}|U[\da-fA-F]{8}|x[\da-fA-F]+\\|[0-7]{1,3}\\|[\s\S])/g, (all, escaped) => {
  if (all === "''") return "'";
  if (/^[uUx]/.test(escaped) && escaped.length > 1) return String.fromCodePoint(parseInt(escaped.slice(1).replace(/\\$/, ''), 16));
  if (/^[0-7]+\\$/.test(escaped)) return String.fromCodePoint(parseInt(escaped, 8));
  return ({n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', a: '\x07'}[escaped]) ?? escaped;
}) : a;
const listOf = t => /^\[.*\]$/.test(t) ? splitTop(t.slice(1, -1)).map(unquote) : [];
function termOf(text) {
  const m = /^([a-z]\w*)\(([\s\S]*)\)$/.exec(text);
  return m ? { name: m[1], args: splitTop(m[2]) } : { name: text, args: [] };
}

function firedTransition(sourceId, targets) {
  if (!model) return null;
  const cands = model.transitions.filter(t => t.source.id === sourceId && t.to.length === targets.length && t.to.every((x, i) => x === targets[i]));
  if (cands.length < 2) return cands[0] || null;
  const ev = run.lastEvent;
  if (ev && ev.name === 'after' && ev.args.length === 2) {
    return cands.find(t => t.after != null && +t.after === +ev.args[1]) || cands.find(t => t.after != null) || cands[0];
  }
  if (ev) {
    const same = cands.filter(t => { if (t.on == null) return false; const p = termOf(t.on.trim()); return p.name === ev.name && p.args.length === ev.args.length; });
    if (same.length) return same[0];
    const vars = cands.filter(t => t.on != null && /^[A-Z_]/.test(t.on.trim()));
    if (vars.length) return vars[0];
  }
  return cands.find(t => t.on == null && t.after == null) || cands[0];
}

/* Show one queued item; returns true when the diagram changed (worth a pause). */
function play(item) {
  if (item.type === 'output') { logRow(/^Shell got down\(/.test(item.text) ? 'note' : 'out', item.text); return false; }
  if (item.type === 'answer') { logRow('answer', item.text); return false; }
  if (item.type === 'goal') { logRow('goal', item.text); return false; }
  if (item.type === 'error') { logRow('err', item.text); return false; }
  const t = termOf(item.text);
  const scope = window.studioTools?.scope(item);
  if (scope === false) { logRow('trace', 'Unmapped actor ' + item.actor + ' (root ' + run.pid + '): ' + item.text); return false; }
  const traceModel = scope ? model.nested.get(scope) : model;
  if (t.name === 'transition_fired') {
    const state = traceModel?.byId.get(unquote(t.args[0] || ''));
    const tr = state?.transitions[Number(t.args[1])];
    if (tr) { run.fired.add(tr.key); diagram.setRun(true, run.active, run.fired, run.nested); }
    return false;
  }
  if (t.name === 'guard_result') { logRow('trace', '  guard ' + t.args[0] + ' #' + (Number(t.args[1]) + 1) + ': ' + t.args[2]); return false; }
  if (t.name === 'datamodel_snapshot') {
    const ids = listOf(t.args[0] || '[]');
    const candidates = window.studioTools ? (traceModel ? [traceModel] : []) : model ? [model, ...model.nested.values()] : [];
    const chart = candidates.find(candidate => {
      const states = candidate.nodes.filter(node => !['statechart', 'history'].includes(node.kind));
      return states.length === ids.length && ids.every(id => candidate.byId.has(id));
    });
    if (!chart) return false;
    const updates = [];
    for (const item of listOf(t.args[1] || '[]')) {
      const data = termOf(item), owner = unquote(data.args[0] || '');
      if (data.name !== 'data') continue;
      const node = owner === '#root' ? chart.root : chart.byId.get(owner);
      for (const dm of node?.datamodels || []) updates.push({key: dm.key, facts: listOf(data.args[1] || '[]'), truncated: data.args[2] === 'true'});
    }
    if (!updates.length) return false;
    diagram.setDatamodelFacts(updates).catch(error => console.warn('Could not display live facts:', error));
    return true;
  }
  if (t.name === 'configuration') {
    const ids = listOf(t.args[0] || '[]');
    /* A traced nested chart reports on the same channel; tell the two apart by their state names. */
    if (scope) {
      run.nested.set(scope, ids); diagram.setRun(true, run.active, run.fired, run.nested); return true;
    }
    if (!window.studioTools && model && !ids.every(id => model.byId.has(id))) {
      for (const [k, nm] of model.nested) if (ids.every(id => nm.byId.has(id))) {
        run.nested.set(k, ids);
        logRow('trace conf', ['configuration of ' + nm.title + ' ', bold('{' + ids.join(', ') + '}')]);
        diagram.setRun(true, run.active, run.fired, run.nested);
        return true;
      }
    }
    run.active = ids;
    logRow('trace conf', ['configuration ', bold('{' + run.active.join(', ') + '}')]);
    diagram.setRun(true, run.active, run.fired, run.nested);
    const only = run.active.length === 1 && model && model.byId.get(run.active[0]);
    run.done = !!(only && only.kind === 'final' && only.parent === model.root);
    if (run.done) status('The chart reached its final state “' + run.active[0] + '”');
    runControls();
    return true;
  }
  if (t.name === 'external_event' || t.name === 'internal_event') {
    const inner = item.text.slice(t.name.length + 1, -1);
    run.lastEvent = termOf(inner);
    run.fired = new Set();
    logRow('trace', [t.name === 'external_event' ? 'event ' : 'internal ', bold(inner)]);
    return false;
  }
  if (t.name === 'transition') {
    const src = unquote(t.args[0] || ''), targets = listOf(t.args[1] || '[]');
    const tr = window.studioTools ? null : firedTransition(src, targets);
    if (tr) run.fired.add(tr.key);
    logRow('trace', ['  transition ', bold(src + (targets.length ? ' → ' + targets.join(' ') : ' (stay)'))]);
    if (!targets.length) { diagram.setRun(true, run.active, run.fired, run.nested); return true; }
    return false;
  }
  if (t.name === 'microstep') return false;
  if (t.name === 'execution') { logRow('trace', '  run ' + item.text.slice(10, -1)); return false; }
  if (t.name === 'unmatched') { logRow('trace', ['  unmatched ', bold(item.text.slice(10, -1))]); return false; }
  logRow('trace', '  ' + item.text);
  return false;
}

function renderSuggestions() {
  const box = $('suggestions');
  box.replaceChildren();
  const goals = model ? model.examples.filter(g => !/<editor>|\bstatechart_halt\s*\(/.test(g)) : [];
  box.parentElement.hidden = !goals.length;
  for (const goal of goals) {
    const b = document.createElement('button');
    b.textContent = '?- ' + goal.replace(/\s+/g, ' ') + '.';
    b.onclick = () => runGoal(goal);
    box.append(b);
  }
}

/* ---------- side panel, files, chrome ---------- */

function showSide(name) {
  for (const v of ['inspector', 'run', 'tests', 'settings']) {
    $(v).hidden = v !== name;
    $('tab-' + v).setAttribute('aria-selected', String(v === name));
    $('tab-' + v).tabIndex = v === name ? 0 : -1;
  }
}
$('tab-inspector').onclick = () => showSide('inspector');
$('tab-run').onclick = () => showSide('run');
$('tab-tests').onclick = () => { showSide('tests'); window.studioTools?.tests(); };
$('tab-settings').onclick = () => showSide('settings');

function renderFiles() {
  $('files').replaceChildren();
  programs.forEach((p, i) => {
    const b = document.createElement('button');
    b.textContent = p.name.replace(/\.xml$/, '');
    b.title = p.name + ' · double-click to rename';
    b.className = (i === current ? 'active' : '') + (p.parent ? ' nested' : '');
    if (p.parent) b.title = 'Nested chart of ' + p.parent.name + ' · edits are stored back into it';
    b.setAttribute('aria-pressed', String(i === current));
    b.onclick = () => { if (programs[current] !== p) selectFile(programs.indexOf(p)); };
    b.ondblclick = () => renameFile(p, b);
    b.onkeydown = e => { if (e.key === 'F2') { e.preventDefault(); renameFile(p, b); } };
    const remove = h('button', {
      class: 'file-remove', title: 'Remove ' + p.name + ' from the Explorer',
      'aria-label': 'Remove ' + p.name + ' from the Explorer',
      onclick: () => removeFile(p)
    });
    remove.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg>';
    $('files').append(h('div', { class: 'file-row' + (i === current ? ' active' : '') }, b, remove));
  });
  window.SXMLChrome?.decorate($('files'));
}

function renameFile(file, button) {
  const prefix = file.parent ? '↳ ' : '';
  const control = h('input', {
    class: 'file-name-input', 'aria-label': 'Rename SXML file',
    value: file.name.replace(/^↳ /, ''), spellcheck: 'false'
  });
  let finished = false;
  function finish(cancel) {
    if (finished) return;
    if (!cancel) {
      let name = control.value.trim();
      if (!name || /[\\/\x00-\x1f]/.test(name)) {
        control.setCustomValidity('Enter a filename without slashes.');
        control.reportValidity();
        control.focus();
        return;
      }
      if (!/\.xml$/i.test(name)) name += '.xml';
      if (programs.some(p => p !== file && p.name === prefix + name)) {
        control.setCustomValidity('A file with this name is already in the Explorer.');
        control.reportValidity();
        control.focus();
        return;
      }
      file.name = prefix + name;
    }
    finished = true;
    saveExplorer();
    renderFiles();
    updateChrome();
    const row = $('files').children[programs.indexOf(file)];
    if (row) row.firstElementChild.focus();
  }
  control.oninput = () => control.setCustomValidity('');
  control.onkeydown = e => {
    if (e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault();
      finish(e.key === 'Escape');
    }
  };
  control.onblur = () => finish(false);
  button.replaceWith(control);
  control.focus();
  control.setSelectionRange(0, control.value.replace(/\.xml$/i, '').length);
}

function updateFileSelection() {
  if ($('files').children.length !== programs.length) { renderFiles(); return; }
  [...$('files').children].forEach((row, i) => {
    row.classList.toggle('active', i === current);
    const button = row.querySelector('button:first-child');
    if (button) {
      button.classList.toggle('active', i === current);
      button.setAttribute('aria-pressed', String(i === current));
    }
  });
}

function removeFile(file) {
  const active = programs[current];
  const removed = new Set([file]);
  // Nested documents are views into their parent, so close those views too.
  for (const p of programs) if (removed.has(p.parent)) removed.add(p);
  const unsaved = [...removed].some(p => p.source != null &&
    (p === active && loadedIndex === current ? editor.getValue() : p.draft != null ? p.draft : p.source) !== p.source);
  if (unsaved && !confirm('Remove “' + file.name + '” from the Explorer and discard unsaved edits' + (removed.size > 1 ? ' in it and its nested charts' : '') + '?')) return;
  const oldIndex = current;
  const activeRemoved = removed.has(active);
  if (activeRemoved) {
    clearTimeout(parseTimer);
    if (run.node) stopRun('Engine stopped.');
    loadedIndex = -1;
  }
  for (let i = programs.length - 1; i >= 0; i--) if (removed.has(programs[i])) programs.splice(i, 1);
  if (!programs.length) programs.push({ name: 'untitled-1.xml', source: SXML.blank() });
  if (activeRemoved) {
    current = -1;
    selectFile(Math.min(oldIndex, programs.length - 1));
  } else {
    const wasLoaded = loadedIndex === oldIndex;
    current = programs.indexOf(active);
    if (wasLoaded) loadedIndex = current;
    saveExplorer();
    renderFiles();
  }
}

async function selectFile(index) {
  if (programs[current] && programs[current].source != null && loadedIndex === current) programs[current].draft = editor.getValue();
  if (run.node) stopRun('Engine stopped.');
  current = index;
  const p = programs[index];
  window.studioTools?.fileChanged();
  updateFileSelection();
  if (p.source == null) {
    status('Loading ' + p.name + '…');
    try {
      const res = await fetch(p.url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      p.source = (await res.text()).replace(/\r\n?/g, '\n');
    } catch (e) { p.source = SXML.blank(); status('Could not load ' + p.name + ' (' + e.message + ')'); }
    if (programs[current] !== p) return;
    index = current;
  }
  clearTimeout(parseTimer);
  loadedIndex = index;
  silent = true;
  editor.setValue(p.draft != null ? p.draft : p.source);
  editor.clearHistory();
  silent = false;
  selEl = null; selKey = '#root'; focusItem = null;
  diagram.userMoved = false;
  $('log').replaceChildren();
  reparse({ fit: true });
  showSide('inspector');
  runControls();
  saveExplorer();
}

$('restore-examples').onclick = () => {
  const present = new Set(programs.filter(p => !p.parent).map(p => p.url));
  const missing = examplePrograms().filter(p => !present.has(p.url));
  for (const p of missing) {
    // Keep user-created or renamed files even if they use an example's original name.
    const original = p.name.replace(/\.xml$/, '');
    let suffix = 1;
    while (programs.some(other => other.name === p.name)) p.name = original + ' (restored ' + suffix++ + ').xml';
    programs.push(p);
  }
  renderFiles();
  const saved = saveExplorer();
  $('restore-examples-status').textContent = missing.length
    ? 'Restored ' + missing.length + ' example' + (missing.length === 1 ? '.' : 's.') + (saved ? '' : ' Browser storage is unavailable; this change may not survive reload.')
    : 'All original examples are already in the Explorer.';
};

$('new').onclick = () => {
  let i = 1; while (programs.some(p => p.name === 'untitled-' + i + '.xml')) i++;
  programs.push({ name: 'untitled-' + i + '.xml', source: SXML.blank() });
  selectFile(programs.length - 1);
};
$('open').onclick = () => $('file-input').click();
$('file-input').onchange = async e => {
  const file = e.target.files[0];
  if (!file) return;
  programs.push({ name: file.name, source: (await file.text()).replace(/\r\n?/g, '\n') });
  selectFile(programs.length - 1);
  e.target.value = '';
};
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('save').onclick = () => { download(programs[current].name.replace(/^↳ /, ''), editor.getValue(), 'application/xml;charset=utf-8'); const p = programs[current]; p.local = !!p.local || p.source !== editor.getValue(); p.source = editor.getValue(); updateChrome(); saveExplorer(); };

$('export').onclick = async () => {
  if (!diagram.geo) return;
  const cs = getComputedStyle(diagram.svg);
  const vars = ['--fg', '--muted', '--line', '--accent', '--accent-bg', '--blue', '--editor', '--raised', '--state', '--state-compound', '--stroke', '--edge', '--note', '--transition-width', '--state-border-width', '--transition-label-size', '--transition-label-opacity', '--edge-hit-width'];
  let css = 'svg{' + vars.map(v => v + ':' + cs.getPropertyValue(v).trim()).join(';') + ';background:' + cs.getPropertyValue('--editor').trim() + '}\n';
  try { css += (await (await fetch('chart.css')).text()).replace(/svg\.chart/g, 'svg'); } catch (e) { /* unstyled export */ }
  download(programs[current].name.replace(/\.\w+$/, '') + '.svg', diagram.exportSVG(css), 'image/svg+xml');
};

for (const b of document.querySelectorAll('[data-add]')) b.onclick = () => addState(b.dataset.add);
$('tool-connect').onclick = () => setTool(diagram.tool === 'connect' ? null : 'connect');
$('delete').onclick = removeSelected;
$('undo').onclick = () => editor.undo();
$('redo').onclick = () => editor.redo();
$('fit').onclick = () => diagram.fit();
$('auto-layout').onclick = () => { if (!guard()) return; SXML.setLayout(model.doc, automaticArrangement(diagram.direction)); diagram.userMoved = false; commit(); status('Automatic layout restored'); };
$('zoom-in').onclick = () => diagram.zoomBy(1.2);
$('zoom-out').onclick = () => diagram.zoomBy(1 / 1.2);
/* The layout direction is part of the saved arrangement.  Position hints
   mean different things in the two directions, so switching starts afresh. */
const arranged = () => !!model && !!model.layout && Object.keys(model.layout).some(k => k[0] !== '@' && Object.keys(model.layout[k]).some(child => child[0] !== '@'));
function automaticArrangement(direction) {
  const layout = direction === 'DOWN' ? { '@direction': 'DOWN' } : {};
  for (const key in model.layout || {}) {
    if (key[0] === '@') continue;
    const regions = model.layout[key]['@regions'];
    if (['RIGHT', 'DOWN', 'AUTO'].includes(regions)) layout[key] = { '@regions': regions };
  }
  return layout;
}
$('direction').onclick = () => {
  if (!guard()) return;
  const next = diagram.direction === 'RIGHT' ? 'DOWN' : 'RIGHT', had = arranged();
  SXML.setLayout(model.doc, automaticArrangement(next));
  diagram.userMoved = false;
  commit();
  status((next === 'DOWN' ? 'Top-down layout' : 'Left-to-right layout') + (had ? ' · the manual arrangement was dropped, because it does not carry over (Undo restores it)' : ''));
};

function syncSplitOrientation() {
  const vertical = diagram.direction === 'DOWN';
  const layout = vertical ? 'vertical' : 'horizontal';
  if (document.body.dataset.layout !== layout) {
    document.body.dataset.layout = layout;
    requestAnimationFrame(() => editor.refresh());
  }
  $('source-divider').setAttribute('aria-orientation', vertical ? 'vertical' : 'horizontal');
  requestAnimationFrame(updateSourceDividerValue);
}
function updateSourceDividerValue() {
  const vertical = diagram.direction === 'DOWN';
  const content = document.querySelector('.editor-content');
  const pane = document.querySelector('.source-pane');
  const total = vertical ? content.clientWidth : content.clientHeight;
  const size = vertical ? pane.clientWidth : pane.clientHeight;
  if (total && document.body.dataset.view === 'split') $('source-divider').setAttribute('aria-valuenow', Math.round(size / total * 100));
}

function setView(view) {
  document.body.dataset.view = view;
  for (const b of document.querySelectorAll('.view-switch button')) b.setAttribute('aria-pressed', String(b.dataset.view === view));
  editor.refresh();
  requestAnimationFrame(() => diagram.fit());
}
for (const b of document.querySelectorAll('.view-switch button')) b.onclick = () => setView(b.dataset.view);

$('run-start').onclick = startChart;
$('run-halt').onclick = haltChart;
$('clear').onclick = () => $('log').replaceChildren();
$('show-trace').onchange = () => $('log').classList.toggle('no-trace', !$('show-trace').checked);
function updateUI(settings) {
  const preferences = SXMLUI.apply(settings);
  $('ui-font-size').value = preferences.fontSize;
  $('ui-font-size-value').textContent = preferences.fontSize + '%';
  $('ui-font-weight').value = preferences.fontWeight;
  syncAppearanceControls();
  editor.refresh();
  requestAnimationFrame(() => { positionLayoutPopover(); });
}
$('ui-font-size').oninput = event => updateUI(Object.assign({}, SXMLUI.preferences, { fontSize: Number(event.target.value) }));
$('ui-font-weight').onchange = event => updateUI(Object.assign({}, SXMLUI.preferences, { fontWeight: Number(event.target.value) }));
$('ui-font-reset').onclick = () => updateUI(Object.assign({}, SXMLUI.preferences, { fontSize: 100, fontWeight: 500 }));
$('theme').onchange = event => updateUI(Object.assign({}, SXMLUI.preferences, { theme: event.target.value }));
updateUI(SXMLUI.preferences);

/* resizable panes */
for (const [id, property, direction, min, max] of [['left-divider', '--left', 1, 120, 340], ['right-divider', '--right', -1, 280, 640]]) {
  const divider = $(id); let start = 0, width = 0;
  const get = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(property));
  const resize = delta => {
    const other = getComputedStyle(document.documentElement).getPropertyValue(property === '--left' ? '--right' : '--left');
    const available = document.documentElement.clientWidth - parseFloat(other) - 280;
    const value = Math.max(min, Math.min(max, available, width + direction * delta));
    document.documentElement.style.setProperty(property, value + 'px');
    savePanelWidth(property, value);
    divider.setAttribute('aria-valuenow', value); editor.refresh();
  };
  divider.onpointerdown = e => { start = e.clientX; width = get(); divider.setPointerCapture(e.pointerId); };
  divider.onpointermove = e => { if (divider.hasPointerCapture(e.pointerId)) resize(e.clientX - start); };
  divider.onpointerup = e => { if (divider.hasPointerCapture(e.pointerId)) divider.releasePointerCapture(e.pointerId); };
  divider.onkeydown = e => { if (['ArrowLeft', 'ArrowRight'].includes(e.key)) { e.preventDefault(); width = get(); resize(e.key === 'ArrowRight' ? 15 : -15); } };
}
{
  const divider = $('source-divider'); let start = 0, size = 0;
  const pane = document.querySelector('.source-pane');
  const vertical = () => diagram.direction === 'DOWN';
  const currentSize = () => vertical() ? pane.clientWidth : pane.clientHeight;
  const coordinate = e => vertical() ? e.clientX : e.clientY;
  const set = px => {
    const content = document.querySelector('.editor-content');
    const total = vertical() ? content.clientWidth : content.clientHeight;
    if (!total) return;
    const minimum = Math.min(vertical() ? 120 : 60, total * .3);
    const chartMinimum = Math.min(vertical() ? 200 : document.querySelector('.chart-toolbar').offsetHeight + 100, total * .5);
    const value = Math.max(minimum, Math.min(total - chartMinimum - 5, px));
    saveSplitSize(vertical(), value / total * 100);
    updateSourceDividerValue();
    editor.refresh();
  };
  divider.onpointerdown = e => { start = coordinate(e); size = currentSize(); divider.setPointerCapture(e.pointerId); };
  divider.onpointermove = e => { if (divider.hasPointerCapture(e.pointerId)) set(size - (coordinate(e) - start)); };
  divider.onpointerup = e => { if (divider.hasPointerCapture(e.pointerId)) divider.releasePointerCapture(e.pointerId); };
  divider.onkeydown = e => {
    const keys = vertical() ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
    if (keys.includes(e.key)) { e.preventDefault(); set(currentSize() + (e.key === keys[1] ? -20 : 20)); }
  };
}

new ResizeObserver(() => { if (!diagram.userMoved) diagram.fit(); }).observe($('chart'));
window.addEventListener('pagehide', disposeNode);
window.addEventListener('beforeunload', e => { if (programs.some(p => p.source != null && (p === programs[current] ? editor.getValue() : p.draft != null ? p.draft : p.source) !== p.source)) { e.preventDefault(); e.returnValue = ''; } });

setView('diagram');
const wanted = examplePrograms().find(p => decodeURIComponent(location.hash.slice(1)).startsWith(p.name.slice(0, 2)) && location.hash.length > 2);
const wantedIndex = wanted ? programs.findIndex(p => p.url === wanted.url) : -1;
selectFile(wantedIndex >= 0 ? wantedIndex : restoredExplorer ? restoredExplorer.selected : 0);
