'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers');

// PasteHelperMac stand-in: --info describes the frontmost app, any other call
// answers with `outcome` (exit code 2 when blocked, like the real helper).
function macPaste({ app = 'TextEdit', pid = 501, outcome = 'pasted' } = {}) {
  const calls = [];
  const paste = load('lib/paste.js', { platform: 'darwin', mocks: {
    './platform': { isWayland: () => false },
    child_process: { execFile: (exe, args, options, callback) => {
      args = Array.from(args);
      calls.push({ exe, args });
      if (args[0] === '--info') return callback(null, JSON.stringify({ process: app, bundleId: 'com.example.' + app, pid, trusted: outcome !== 'blocked' }) + '\n');
      const result = args.includes('--dry-run') ? 'dry-run' : outcome;
      const error = result === 'blocked' ? Object.assign(new Error('exit 2'), { code: 2 }) : null;
      callback(error, JSON.stringify({ outcome: result, error: result === 'blocked' ? 'Accessibilité non autorisée pour FreeFlow' : undefined }) + '\n');
    } },
  } });
  return { paste: paste.paste, calls };
}

test('macOS pastes with PasteHelperMac and pins the frontmost application', async () => {
  const f = macPaste();
  const result = await f.paste('/Applications/FreeFlow.app/Contents/Resources/PasteHelperMac', { delayMs: 60 });
  assert.equal(result.outcome, 'pasted');
  assert.equal(result.process, 'TextEdit');
  assert.equal(result.bundleId, 'com.example.TextEdit');
  assert.deepEqual(f.calls.map((c) => c.args), [['--info'], ['--delay', '60', '--expect-pid', '501']]);
  assert.equal(f.calls.every((c) => c.exe.endsWith('PasteHelperMac')), true);
});

test('macOS keeps the chat-app delays but never uses Shift+Insert', async () => {
  const slack = macPaste({ app: 'Slack' });
  assert.equal((await slack.paste('helper', { delayMs: 60 })).delayMs, 120);
  const term = macPaste({ app: 'Alacritty' });
  await term.paste('helper', {});
  assert.equal(term.calls.at(-1).args.includes('--shift-insert'), false);
});

test('macOS reports a missing Accessibility permission as blocked', async () => {
  const f = macPaste({ outcome: 'blocked' });
  const result = await f.paste('helper', {});
  assert.equal(result.outcome, 'blocked');
  assert.match(result.error, /Accessibilité/);
});

test('macOS dry-run is forwarded to the helper', async () => {
  const f = macPaste();
  assert.equal((await f.paste('helper', { dryRun: true })).outcome, 'dry-run');
  assert.equal(f.calls.at(-1).args.includes('--dry-run'), true);
});

test('macOS avoids the input-source shortcut and keeps models in Application Support', () => {
  const mac = load('lib/platform.js', { platform: 'darwin' });
  assert.equal(mac.defaultShortcut(), 'Ctrl+Shift+Space');
  assert.equal(mac.autoPasteAvailable(), true);
  assert.equal(mac.modelCachePath('/Users/me/Library/Application Support/FreeFlow'), '/Users/me/Library/Application Support/FreeFlow/models');
  assert.equal(load('lib/platform.js', { platform: 'win32' }).defaultShortcut(), 'Ctrl+Alt+Space');
  assert.equal(load('lib/platform.js', { platform: 'linux', env: { WAYLAND_DISPLAY: 'wayland-0' } }).autoPasteAvailable(), false);
});

test('macOS launch at login goes through Electron login items', () => {
  const calls = [];
  const mac = load('lib/platform.js', { platform: 'darwin' });
  mac.setLaunchAtLogin({ isPackaged: true, setLoginItemSettings: (o) => calls.push(o) }, '/src', true);
  assert.equal(calls[0].openAtLogin, true);
});

test('STT resolves the bundled macOS executable without the .exe suffix', () => {
  const expected = '/Applications/FreeFlow.app/Contents/Resources/freeflow-stt/freeflow-stt';
  const { Sidecar } = load('lib/sidecar.js', { platform: 'darwin', mocks: { fs: { existsSync: (p) => p === expected } } });
  const sidecar = new Sidecar({ appPath: '/app', resourcesPath: '/Applications/FreeFlow.app/Contents/Resources', isPackaged: true });
  assert.equal(sidecar.resolveCommand().cmd, expected);
});
