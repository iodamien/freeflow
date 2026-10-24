'use strict';
// Loads a lib module in a fresh VM context with a fake process.platform/env and
// mocked requires, so platform branches can be exercised on any OS.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load(file, { platform = 'linux', env = {}, mocks = {} } = {}) {
  const module = { exports: {} };
  const context = {
    module,
    require: (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name),
    process: { platform, env, execPath: '/opt/Free Flow/electron' },
    setTimeout, clearTimeout, setInterval: () => 1, clearInterval: () => {},
    URLSearchParams, AbortController, fetch,
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file });
  return module.exports;
}

module.exports = { load };
