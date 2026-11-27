const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const app = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
const saving = app.slice(app.indexOf('async function saveFile('), app.indexOf("$('undo').onclick"));
function setup(picker) {
  const calls = [], buttons = {}, files = [{name: '↳ example.xml', source: '<old/>'}, {name: 'second.xml', source: '<second/>'}];
  let source = '<edited/>', drawing = 'drawing-A';
  const context = {
    window: {isSecureContext: true}, Blob,
    $: id => buttons[id] ||= {}, programs: files, current: 0,
    editor: {getValue: () => source},
    download: (...args) => calls.push(['download', ...args]),
    status: text => calls.push(['status', text]),
    updateChrome: () => calls.push(['chrome']), saveExplorer: () => calls.push(['explorer']),
    console: {warn: () => {}},
    getComputedStyle: () => ({getPropertyValue: () => '#fff'}),
    diagram: {geo: {}, svg: {}, exportSVG: css => {calls.push(['snapshot', drawing]); return drawing + css;}},
    fetch: async () => {calls.push(['fetch']); return {ok: true, text: async () => 'svg.chart { color: red; }'};},
    DOMParser: class {parseFromString(text) {calls.push(['parse', text]); const style = {textContent: ''}; return {documentElement: {text, style}, querySelector: () => style};}},
    XMLSerializer: class {serializeToString(el) {return el.text + el.style.textContent;}}
  };
  if (picker) context.window.showSaveFilePicker = options => {calls.push(['picker', options]); return picker(options);};
  vm.runInNewContext(saving, context);
  return {context, calls, buttons, files, source: value => source = value, drawing: value => drawing = value};
}
function writableHandle(calls, failAt) {
  return {name: 'chosen.xml', async createWritable() {
    calls.push(['create']);
    if (failAt === 'create') throw Error('denied');
    return {async write(blob) {calls.push(['write', blob.type, await blob.text()]); if (failAt === 'write') throw Error('disk full');},
      async close() {calls.push(['close']); if (failAt === 'close') throw Error('disk full');}, async abort() {calls.push(['abort']);}};
  }};
}
(async () => {
  const io = [], native = setup(() => Promise.resolve(writableHandle(io)));
  await native.buttons.save.onclick();
  const options = native.calls.find(c => c[0] === 'picker')[1];
  assert.equal(options.suggestedName, 'example.xml');
  assert.equal(options.types[0].accept['application/xml'][0], '.xml');
  assert.deepEqual(io, [['create'], ['write', 'application/xml;charset=utf-8', '<edited/>'], ['close']]);
  assert.equal(native.files[0].source, '<edited/>');
  assert(!native.calls.some(c => c[0] === 'download'));
  for (const name of ['AbortError', 'NotAllowedError']) {
    const cancelled = setup(() => Promise.reject(Object.assign(Error(name), {name})));
    await cancelled.buttons.save.onclick();
    assert.equal(cancelled.files[0].source, '<old/>');
    assert(!cancelled.calls.some(c => ['download', 'explorer'].includes(c[0])));
    await cancelled.buttons.export.onclick();
    assert(!cancelled.calls.some(c => ['fetch', 'download'].includes(c[0])), 'Cancelling SVG saving must not generate or download a file.');
  }
  for (const failAt of ['create', 'write', 'close']) {
    const io = [], failed = setup(() => Promise.resolve(writableHandle(io, failAt)));
    await failed.buttons.save.onclick();
    assert.equal(failed.files[0].source, '<old/>', 'Mark saved only after the file has been closed successfully.');
    assert(!failed.calls.some(c => ['download', 'explorer'].includes(c[0])));
    if (failAt !== 'create') assert(io.some(c => c[0] === 'abort'));
  }
  for (const name of [null, 'SecurityError', 'NotSupportedError']) {
    const fallback = setup(name && (() => Promise.reject(Object.assign(Error(name), {name}))));
    await fallback.buttons.save.onclick();
    assert.deepEqual(fallback.calls.find(c => c[0] === 'download').slice(1), ['example.xml', '<edited/>', 'application/xml;charset=utf-8']);
    assert.equal(fallback.files[0].source, '<edited/>');
  }
  const insecure = setup(() => {throw Error('Picker must not be called');});
  insecure.context.window.isSecureContext = false;
  await insecure.buttons.save.onclick();
  assert(insecure.calls.some(c => c[0] === 'download'));
  let resolve;
  const delayed = setup(() => new Promise(r => resolve = r));
  const pending = delayed.buttons.save.onclick();
  delayed.source('<changed during save/>'); delayed.context.current = 1;
  resolve(writableHandle([])); await pending;
  assert.equal(delayed.files[0].source, '<edited/>', 'Save the source captured when the button was clicked.');
  assert.equal(delayed.files[1].source, '<second/>', 'Do not mark a different document as saved.');
  let resolveSVG;
  const svgIO = [], svg = setup(() => new Promise(r => resolveSVG = r));
  const svgPending = svg.buttons.export.onclick();
  assert(!svg.calls.some(c => c[0] === 'fetch'), 'Open the picker before fetching SVG styles to preserve user activation.');
  const svgOptions = svg.calls.find(c => c[0] === 'picker')[1];
  assert.equal(svgOptions.suggestedName, 'example.svg');
  assert.equal(svgOptions.types[0].accept['image/svg+xml'][0], '.svg');
  svg.drawing('drawing-B'); svg.context.current = 1;
  resolveSVG(writableHandle(svgIO)); await svgPending;
  const output = svgIO.find(c => c[0] === 'write');
  assert.equal(output[1], 'image/svg+xml');
  assert(output[2].includes('drawing-A') && !output[2].includes('drawing-B'));
  assert(output[2].includes('svg { color: red; }'), 'The saved SVG must embed chart styles.');
  assert.equal(svg.files[0].source, '<old/>', 'Saving SVG must not mark XML source as saved.');
  const fallbackSVG = setup(); await fallbackSVG.buttons.export.onclick();
  assert.equal(fallbackSVG.calls.find(c => c[0] === 'download')[1], 'example.svg');
  console.log('Checked XML/SVG save dialogs, file types, cancellation, failures, download fallbacks, user activation and snapshots during asynchronous saves.');
})().catch(error => {console.error(error); process.exitCode = 1;});
