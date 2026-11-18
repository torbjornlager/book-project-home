/* Restore UI preferences before the interface is drawn. */
(function (global) {
  'use strict';
  const STORAGE = 'trinity-sxml-studio.ui.v1';
  const DEFAULTS = Object.freeze({ fontSize: 100, fontWeight: 500, theme: 'light' });
  function normalize(value) {
    value = value || {};
    return {
      fontSize: typeof value.fontSize === 'number' && Number.isFinite(value.fontSize) && value.fontSize >= 90 && value.fontSize <= 150 ? value.fontSize : 100,
      fontWeight: [300, 400, 500, 600, 700].includes(value.fontWeight) ? value.fontWeight : 500,
      theme: value.theme === 'dark' ? 'dark' : 'light'
    };
  }
  let preferences = DEFAULTS;
  try { preferences = normalize(JSON.parse(localStorage.getItem(STORAGE))); }
  catch (error) { console.warn('Could not restore UI preferences:', error); }
  function apply(value, save = true) {
    preferences = normalize(value);
    document.documentElement.style.setProperty('--ui-font-scale', preferences.fontSize / 100);
    document.documentElement.style.setProperty('--ui-font-weight', preferences.fontWeight);
    document.body.style.fontWeight = 'var(--ui-font-weight,500)';
    document.body.classList.toggle('light', preferences.theme === 'light');
    const selector = document.getElementById('theme');
    if (selector) selector.value = preferences.theme;
    if (save) {
      try { localStorage.setItem(STORAGE, JSON.stringify(preferences)); }
      catch (error) { console.warn('Could not save UI preferences:', error); }
    }
    return preferences;
  }
  apply(preferences, false);
  global.SXMLUI = { DEFAULTS, normalize, apply, get preferences() { return preferences; } };
})(window);
