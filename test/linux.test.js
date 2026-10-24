'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers');

function pasteFixture({ wayland = false, app = 'firefox', changed = false, missing = false } = {}) {
  const calls = [];
  let focusReads = 0;
  const paste = load('lib/paste.js', { env: { DISPLAY: ':99' }, mocks: {
    './platform': { isWayland: () => wayland },
    fs: { readFileSync: () => app + '\n' },
    child_process: { execFile: (exe, args, options, callback) => {
      calls.push({ exe, args: Array.from(args) });
      if (missing) return callback(Object.assign(new Error('xdotool missing'), { code: 'ENOENT' }), '');
      let out = '';
      if (args[0] === 'getactivewindow') out = String(changed && focusReads++ > 0 ? 43 : 42);
      if (args[0] === 'getwindowpid') out = '123';
      callback(null, out);
    } },
  } });
  return { paste: paste.paste, calls };
}

test('X11 pastes into an application using Ctrl+V', async () => {
  const f = pasteFixture();
  const result = await f.paste('unused', { delayMs: 1 });
  assert.equal(result.outcome, 'pasted');
  assert.equal(result.process, 'firefox');
  assert.deepEqual(f.calls.at(-1), { exe: 'xdotool', args: ['key', '--clearmodifiers', 'ctrl+v'] });
});

test('X11 uses Ctrl+Shift+V in a terminal', async () => {
  const f = pasteFixture({ app: 'gnome-terminal-' });
  assert.equal((await f.paste('unused', { delayMs: 1 })).outcome, 'pasted');
  assert.equal(f.calls.at(-1).args.at(-1), 'ctrl+shift+v');
});

test('a focus change cancels key injection', async () => {
  const f = pasteFixture({ changed: true });
  assert.equal((await f.paste('unused', { delayMs: 1 })).outcome, 'blocked');
  assert.equal(f.calls.some((call) => call.args[0] === 'key'), false);
});

test('Wayland keeps the text available for manual paste without invoking X11', async () => {
  const f = pasteFixture({ wayland: true });
  assert.equal((await f.paste('unused')).outcome, 'blocked');
  assert.equal(f.calls.length, 0);
});

test('missing xdotool falls back without throwing', async () => {
  const f = pasteFixture({ missing: true });
  assert.equal((await f.paste('unused')).outcome, 'blocked');
});

test('dry-run never injects keys', async () => {
  const f = pasteFixture();
  assert.equal((await f.paste('unused', { dryRun: true })).outcome, 'dry-run');
  assert.equal(f.calls.some((call) => call.args[0] === 'key'), false);
});

test('Windows retains PasteHelper and terminal overrides', async () => {
  const calls = [];
  const p = load('lib/paste.js', { platform: 'win32', mocks: {
    './platform': { isWayland: () => false },
    child_process: { execFile: (exe, args, options, callback) => {
      calls.push({ exe, args: Array.from(args) });
      callback(null, JSON.stringify(args[0] === '--info' ? { process: 'powershell' } : { outcome: 'pasted' }));
    } },
  } });
  const result = await p.paste('PasteHelper.exe');
  assert.equal(result.outcome, 'pasted');
  assert.equal(result.shiftInsert, true);
  assert.equal(calls.at(-1).exe, 'PasteHelper.exe');
  assert.equal(calls.at(-1).args.includes('--shift-insert'), true);
});

test('STT resolves the Linux executable and Windows exe separately', () => {
  for (const [platform, binary] of [['linux', 'freeflow-stt'], ['win32', 'freeflow-stt.exe']]) {
    const expected = '/resources/freeflow-stt/' + binary;
    const { Sidecar } = load('lib/sidecar.js', { platform, mocks: { fs: { existsSync: (p) => p === expected } } });
    const sidecar = new Sidecar({ appPath: '/app', resourcesPath: '/resources' });
    assert.equal(sidecar.resolveCommand().cmd, expected);
  }
});

test('development STT prefers .venv then python3; packaged apps never depend on Python', () => {
  for (const venv of [false, true]) {
    const { Sidecar } = load('lib/sidecar.js', { mocks: { fs: { existsSync: (p) => p.endsWith('stt_server.py') || (venv && p === '/app/.venv/bin/python') } } });
    const sidecar = new Sidecar({ appPath: '/app', resourcesPath: '/resources' });
    assert.equal(sidecar.resolveCommand().cmd, venv ? '/app/.venv/bin/python' : 'python3');
    sidecar.isPackaged = true;
    assert.equal(sidecar.resolveCommand(), null);
  }
});

test('Linux respects absolute XDG cache paths and detects XWayland sessions', () => {
  const p = load('lib/platform.js', { env: { XDG_CACHE_HOME: '/cache', WAYLAND_DISPLAY: 'wayland-0', DISPLAY: ':0' } });
  assert.equal(p.modelCachePath('/config/FreeFlow'), '/cache/FreeFlow/models');
  assert.equal(p.isWayland(), true);
  const fallback = load('lib/platform.js', { env: { XDG_CACHE_HOME: 'relative' }, mocks: { os: { homedir: () => '/home/example' } } });
  assert.equal(fallback.modelCachePath('/config'), '/home/example/.cache/FreeFlow/models');
});

test('autostart creates and removes only the FreeFlow entry with quoted arguments', () => {
  const writes = [], removals = [];
  const p = load('lib/platform.js', { env: { XDG_CONFIG_HOME: '/config' }, mocks: { fs: {
    mkdirSync: () => {},
    writeFileSync: (name, content) => writes.push({ name, content }),
    unlinkSync: (name) => removals.push(name),
  } } });
  p.setLaunchAtLogin({ isPackaged: false }, '/src/Free Flow', true);
  assert.equal(writes[0].name, '/config/autostart/com.alan.freeflow.desktop');
  assert.equal(writes[0].content.includes('Exec="/opt/Free Flow/electron" "/src/Free Flow"\n'), true);
  assert.equal(p.desktopQuote('/opt/100%/FreeFlow'), '"/opt/100%%/FreeFlow"');
  assert.throws(() => p.desktopQuote('/opt/bad\npath'));
  p.setLaunchAtLogin({ isPackaged: false }, '/src/Free Flow', false);
  assert.deepEqual(removals, ['/config/autostart/com.alan.freeflow.desktop']);
});
