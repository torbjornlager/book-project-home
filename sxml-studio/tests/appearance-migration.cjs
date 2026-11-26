const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const app = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
const restore = app.match(/function restoreAppearance\(\) \{[\s\S]*?\n\}/)[0];
const save = app.match(/function saveAppearance\(\) \{[\s\S]*?\n\}/)[0];
function boot(settings, failRead = false, failWrite = false) {
  let stored = JSON.stringify(settings), applied, writes = 0;
  const context = {
    APPEARANCE_STORAGE: 'appearance', console: {warn() {}},
    localStorage: {
      getItem() {if (failRead) throw Error('Blocked'); return stored;},
      setItem(key, value) {if (failWrite) throw Error('Full'); stored = value; writes++;}
    },
    diagram: {applyAppearance(value) {applied = value;}, appearance: settings}
  };
  vm.runInNewContext(restore + '\n' + save + '\nrestoreAppearance();', context);
  return {applied: () => applied, stored: () => JSON.parse(stored), writes: () => writes, context};
}
const original = {headerColor: '#e5e7eb', activeHeaderColor: '#aabbcc', lineWidth: 2.7, lineColor: '#123456', arrowSize: 12, borderWidth: 3, labelSize: 15, labelOpacity: .4};
const migrated = boot(original);
assert.deepEqual(migrated.stored(), {...original, headerColor: '#f5f5f5', headerColorDefaultVersion: 2});
assert.equal(migrated.applied().headerColor, '#f5f5f5');
assert.equal(boot({...original, headerColor: '#E5E7EB'}).applied().headerColor, '#f5f5f5');
const reload = boot(migrated.stored());
assert.equal(reload.writes(), 0, 'Migration must not repeat.');
for (const settings of [null, {}, {...original, headerColor: '#abcdef'}, {...original, headerColorDefaultVersion: 2}]) {
  const result = boot(settings);
  assert.deepEqual(result.stored(), settings);
  assert.equal(result.writes(), 0);
}
const unavailable = boot(original, false, true);
assert.equal(unavailable.applied().headerColor, '#f5f5f5', 'Storage failure must not prevent applying the migrated colour.');
assert.doesNotThrow(() => boot(original, true));
// A later explicit choice of the old gray must survive the next reload.
vm.runInNewContext('saveAppearance();', migrated.context);
assert.equal(migrated.stored().headerColorDefaultVersion, 2);
assert.equal(boot(migrated.stored()).applied().headerColor, '#e5e7eb');
console.log('Checked one-time old-default migration, preservation of all other settings, custom colours, reloads and storage failures.');
