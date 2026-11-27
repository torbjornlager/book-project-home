/* Browser-local workspace arrangement, independent of the chart document. */
(function (global) {
  'use strict';
  const STORAGE = 'trinity-sxml-studio.workspace.v1';
  const defaults = {view: 'split', side: 'inspector', section: 'files', focus: false, consoleOpen: false, timelineOpen: true};
  const choices = {view: ['source', 'split', 'diagram'], side: ['inspector', 'run', 'settings'], section: ['files', 'structure']};
  function normalize(value, base = defaults) {
    const result = {...base};
    for (const key of Object.keys(defaults)) {
      if (choices[key] ? choices[key].includes(value?.[key]) : typeof value?.[key] === 'boolean') result[key] = value[key];
    }
    return result;
  }
  let saved;
  try { saved = JSON.parse(localStorage.getItem(STORAGE)); } catch (_) { /* Use the default arrangement. */ }
  const preferences = normalize(saved);
  function save(changes) {
    Object.assign(preferences, normalize(changes, preferences));
    try { localStorage.setItem(STORAGE, JSON.stringify(preferences)); } catch (_) { /* Keep preferences for this session. */ }
  }
  global.SXMLWorkspace = {preferences, save};
})(window);
