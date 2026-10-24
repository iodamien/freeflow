'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

function isWayland() {
  return process.platform === 'linux' && (process.env.XDG_SESSION_TYPE === 'wayland' || !!process.env.WAYLAND_DISPLAY);
}

function xdgDirectory(name, fallback) {
  const value = process.env[name];
  return value && path.isAbsolute(value) ? value : path.join(os.homedir(), fallback);
}

function modelCachePath(userData) {
  if (process.platform === 'linux') return path.join(xdgDirectory('XDG_CACHE_HOME', '.cache'), 'FreeFlow', 'models');
  return path.join(process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'FreeFlow') : userData, 'models');
}

function desktopQuote(value) {
  // Exec quoting is applied after Desktop Entry string unescaping.
  // Escape percent signs too: literal paths must never become field codes.
  const text = String(value);
  if (/[\r\n\0]/.test(text)) throw new Error('Chemin de lancement invalide');
  return '"' + text.replace(/[\\"$\x60]/g, '\\$&').replace(/\\/g, '\\\\').replace(/%/g, '%%') + '"';
}

function setLaunchAtLogin(app, root, enabled) {
  if (process.platform !== 'linux') {
    app.setLoginItemSettings({ openAtLogin: !!enabled, path: process.execPath, args: app.isPackaged ? [] : [root] });
    return;
  }
  const dir = path.join(xdgDirectory('XDG_CONFIG_HOME', '.config'), 'autostart');
  const file = path.join(dir, 'com.alan.freeflow.desktop');
  if (!enabled) {
    try { fs.unlinkSync(file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    return;
  }
  const exe = app.isPackaged && process.env.APPIMAGE ? process.env.APPIMAGE : process.execPath;
  const args = app.isPackaged ? [] : [root];
  const entry = '[Desktop Entry]\nType=Application\nVersion=1.0\nName=FreeFlow\nExec=' +
    [exe, ...args].map(desktopQuote).join(' ') + '\nTerminal=false\nX-GNOME-Autostart-enabled=true\n';
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, entry, { mode: 0o600 });
}

module.exports = { isWayland, modelCachePath, setLaunchAtLogin, desktopQuote };
