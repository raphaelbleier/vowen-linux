// node port/tests/test_shim.js : shim against a fake helper (no devices needed)
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shim-'));
const fake = path.join(dir, 'fake');
fs.writeFileSync(fake, `#!/usr/bin/env node
console.log(JSON.stringify({type:4,time:1,altKey:false,ctrlKey:true,metaKey:false,shiftKey:false,keycode:29}));
process.stdin.on('data',d=>require('fs').appendFileSync(${JSON.stringify(dir + '/cmds')},d)).on('end',()=>process.exit(0));
`, { mode: 0o755 });
process.env.VOWEN_INPUT_BIN = fake;
const { uIOhook } = require('../shims/uiohook-napi/dist/index.js');
const seen = [];
uIOhook.on('keydown', e => seen.push(e));
uIOhook.start();
uIOhook.setSwallow('hotkeys', ['Ctrl+Shift+H', 'Escape', 'Ctrl+Shift', 'Alt+Return', 'CommandOrControl+F5']);
uIOhook.keyToggle(0x2F, 'down');
uIOhook.keyToggle(0x2F, 'up');
setTimeout(() => {
  assert.strictEqual(seen.length, 1); assert.strictEqual(seen[0].keycode, 29); assert.strictEqual(seen[0].ctrlKey, true);
  const cmds = fs.readFileSync(dir + '/cmds', 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepStrictEqual(cmds, [
    { cmd: 'swallow', source: 'hotkeys', chords: [
      { mods: ['ctrl', 'shift'], key: 0x23 }, { mods: [], key: 1 }, { mods: ['alt'], key: 0x1C }, { mods: ['ctrl'], key: 0x3F }] },
    { cmd: 'key', key: 47, toggle: 1 }, { cmd: 'key', key: 47, toggle: 2 }]);
  uIOhook.stop(); console.log('ok');
}, 800);
