'use strict';
// Simulated paste through native/PasteHelper.exe (SendInput). Mirrors Wispr's
// PasteText -> PasteOutcome {pasted|blocked|failed} with per-app overrides.
const { execFile } = require('child_process');
const { isWayland } = require('./platform');

// Per-app overrides keyed by foreground process name (lowercase, no .exe).
// Wispr keeps a similar list (bundle IDs / windowsUri for Slack, Teams, Telegram,
// Discord, Signal...). Terminals want Shift+Insert, chat apps a longer delay.
const PER_APP = {
  windowsterminal: { shiftInsert: true },
  mintty: { shiftInsert: true },
  conhost: { shiftInsert: true },
  cmd: { shiftInsert: true },
  powershell: { shiftInsert: true },
  pwsh: { shiftInsert: true },
  alacritty: { shiftInsert: true },
  wezterm: { shiftInsert: true },
  slack: { delayMs: 120 },
  teams: { delayMs: 120 },
  'ms-teams': { delayMs: 120 },
  telegram: { delayMs: 100 },
  discord: { delayMs: 100 },
  signal: { delayMs: 100 },
};

function run(exe, args) {
  return new Promise((resolve) => {
    execFile(exe, args, { windowsHide: true, timeout: 5000 }, (err, stdout) => {
      let out = null;
      try { out = JSON.parse(String(stdout).trim().split(/\r?\n/).pop()); } catch { /* ignore */ }
      if (!out) out = { outcome: err ? 'failed' : 'unknown', error: err ? String(err.message) : undefined };
      if (err && err.code && !out.exitCode) out.exitCode = err.code;
      resolve(out);
    });
  });
}

function xdotool(args) {
  return new Promise((resolve) => {
    execFile('xdotool', args, { timeout: 5000 }, (error, stdout) => {
      resolve({ error, stdout: String(stdout || '').trim() });
    });
  });
}

async function probeLinuxForeground() {
  const active = await xdotool(['getactivewindow']);
  if (active.error || !/^\d+$/.test(active.stdout)) {
    return { outcome: 'blocked', error: active.error ? active.error.message : 'Fenêtre active introuvable' };
  }
  const windowId = active.stdout;
  const app = await xdotool(['getwindowclassname', windowId]);
  return { windowId, process: app.stdout || null };
}

async function probeForeground(exe) {
  if (process.platform === 'linux') {
    if (isWayland() || !process.env.DISPLAY) return { outcome: 'blocked', error: 'Collage automatique disponible uniquement sous X11' };
    return probeLinuxForeground();
  }
  return run(exe, ['--info']);
}

async function pasteLinux(opts) {
  // XWayland cannot inject keys into native Wayland clients. Keep the clipboard
  // intact for manual paste rather than reporting a misleading success.
  if (isWayland() || !process.env.DISPLAY) {
    return { outcome: 'blocked', error: 'Collage automatique disponible uniquement sous X11' };
  }
  const fg = await probeLinuxForeground();
  if (!fg.windowId) {
    (opts.log || (() => {}))('paste: ' + fg.error + ' (installer xdotool sous X11)');
    return fg;
  }
  const proc = String(fg.process || '').toLowerCase();
  const terminal = /terminal|konsole|alacritty|wezterm|kitty|tilix|terminator|xfce4-terminal/.test(proc);
  const key = opts.shiftInsert ? 'shift+Insert' : terminal ? 'ctrl+shift+v' : 'ctrl+v';
  const delayMs = Math.max(0, Math.min(2000, Number(opts.delayMs) || 60));
  if (opts.dryRun) return { ...fg, outcome: 'dry-run', key, delayMs };
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  const active = await xdotool(['getactivewindow']);
  if (active.error || active.stdout !== fg.windowId) {
    return { ...fg, outcome: 'blocked', error: 'La fenêtre active a changé' };
  }
  const res = await xdotool(['key', '--clearmodifiers', key]);
  const outcome = res.error ? 'blocked' : 'pasted';
  (opts.log || (() => {}))('paste -> ' + outcome + ' (app=' + proc + ' key=' + key + ')');
  return { ...fg, outcome, error: res.error ? res.error.message : undefined, key, delayMs };
}

/**
 * @param {string} exe path to PasteHelper.exe
 * @param {{dryRun?:boolean, delayMs?:number, shiftInsert?:boolean, log?:Function}} opts
 */
async function paste(exe, opts = {}) {
  if (process.platform === 'linux') return pasteLinux(opts);
  if (process.platform !== 'win32') return { outcome: 'blocked', error: 'Plateforme non prise en charge' };
  const log = opts.log || (() => {});
  const fg = await probeForeground(exe);
  const proc = String(fg.process || '').toLowerCase();
  const override = PER_APP[proc] || {};
  const delayMs = override.delayMs ?? opts.delayMs ?? 60;
  const shiftInsert = override.shiftInsert ?? opts.shiftInsert ?? false;
  const args = ['--delay', String(delayMs)];
  if (shiftInsert) args.push('--shift-insert');
  if (opts.dryRun) args.push('--dry-run');
  const res = await run(exe, args);
  log(`paste -> ${res.outcome} (app=${fg.process || '?'} mode=${shiftInsert ? 'Shift+Insert' : 'Ctrl+V'} delay=${delayMs}ms)`);
  return { ...res, process: fg.process, title: fg.title, shiftInsert, delayMs };
}

module.exports = { paste, probeForeground, PER_APP };
