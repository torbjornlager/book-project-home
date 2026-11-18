const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../js/ui-preferences.js'), 'utf8');
function boot(saved, blocked = false) {
  const styles = {}, classes = new Set(['light']), button = {};
  let stored = saved;
  const sandbox = {
    console: { warn() {} },
    localStorage: {
      getItem() { if (blocked) throw new Error('Storage unavailable'); return stored; },
      setItem(key, value) { if (blocked) throw new Error('Storage unavailable'); stored = value; }
    },
    document: {
      documentElement: { style: { setProperty: (key, value) => styles[key] = value } },
      body: { style: {}, classList: { toggle: (key, on) => on ? classes.add(key) : classes.delete(key) } },
      getElementById: () => button
    }
  };
  sandbox.window = sandbox;
  vm.runInNewContext(source, sandbox);
  return { ui: sandbox.SXMLUI, styles, classes, button, stored: () => stored };
}
const defaults = boot(null);
assert(defaults.classes.has('light'));
assert.equal(defaults.styles['--ui-font-scale'], 1);
assert.equal(defaults.styles['--ui-font-weight'], 500);
assert.equal(defaults.button.textContent, 'Dark mode');
defaults.ui.apply({fontSize: 150, fontWeight: 700, theme: 'dark'});
assert.equal(defaults.styles['--ui-font-scale'], 1.5);
assert.equal(defaults.styles['--ui-font-weight'], 700);
assert(!defaults.classes.has('light'));
const restored = boot(defaults.stored());
assert.equal(restored.ui.preferences.fontSize, 150);
assert.equal(restored.ui.preferences.fontWeight, 700);
assert.equal(restored.ui.preferences.theme, 'dark');
for (const saved of ['invalid json', JSON.stringify({fontSize: 10000, fontWeight: 9999, theme: 'bad'}), null]) {
  const result = boot(saved);
  assert.equal(result.ui.preferences.fontSize, 100);
  assert.equal(result.ui.preferences.fontWeight, 500);
  assert(result.classes.has('light'));
}
const blocked = boot(null, true);
blocked.ui.apply({fontSize: 120, fontWeight: 500, theme: 'dark'});
assert.equal(blocked.styles['--ui-font-scale'], 1.2);
console.log('Checked light default, font preferences, reload restoration, invalid data and unavailable storage.');
