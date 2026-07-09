#!/usr/bin/env node
// Regression test for transformTables separator injection.
//
// Bug: preTransform.transformTables used to inject a separator after EVERY
// pipe-delimited row, instead of only after the header row. The fix tracks
// inTable state so the separator is emitted exactly once per table.
//
// This test compiles src/gfmService.ts on the fly with esbuild's transform
// API and executes the result in a sandboxed VM context — no build artifacts
// are written to disk, no `obsidian` import is required (it is stubbed).

const vm = require('vm');
const path = require('path');
const esbuild = require('esbuild');

// Bundle the full dependency graph of gfmService.ts in-memory, mark
// `obsidian` as external (we provide a stub via a custom loader plugin).
const compiled = esbuild.buildSync({
  entryPoints: [path.join(__dirname, 'src', 'gfmService.ts')],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  write: false,
  external: ['obsidian'],
}).outputFiles[0].text;

const sandboxRequire = (id) => {
  if (id === 'obsidian') return OBSIDIAN_STUB;
  return require(id);
};
const OBSIDIAN_STUB = {
  Plugin: class {},
  PluginSettingTab: class {},
  Setting: class {},
  Notice: class { constructor() {} error() {} },
  TFile: class {},
  requestUrl: () => {},
  normalizePath: (p) => p,
};
const sandboxModule = { exports: {} };
const sandbox = {
  require: sandboxRequire,
  module: sandboxModule,
  exports: sandboxModule.exports,
  __filename: 'gfmService.ts',
  __dirname: __dirname,
  console,
};
vm.createContext(sandbox);
vm.runInContext(compiled, sandbox, { filename: 'gfmService.ts' });

const { GfmService } = sandboxModule.exports;

const gfm = new GfmService();

const cases = [
  {
    name: 'minimal 2x2 table with separator already present',
    input: '| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |',
    expectedSeparators: 1,
  },
  {
    name: 'minimal 2x2 table WITHOUT separator (header only)',
    input: '| A | B |\n| 1 | 2 |\n| 3 | 4 |',
    expectedSeparators: 1,
  },
  {
    name: 'real 4-column table with separator',
    input:
      '| A | B | C | D |\n' +
      '| --- | --- | --- | --- |\n' +
      '| 1 | 2 | 3 | 4 |\n' +
      '| 5 | 6 | 7 | 8 |\n',
    expectedSeparators: 1,
  },
  {
    name: 'blank lines between tables — each gets exactly one separator',
    input:
      '| A | B |\n| --- | --- |\n| 1 | 2 |\n\n| X | Y |\n| --- | --- |\n| z | w |\n',
    expectedSeparators: 2,
  },
];

let pass = 0;
let fail = 0;

for (const c of cases) {
  const out = gfm.preTransform(c.input, false);
  const lines = out.split('\n');
  const seps = lines.filter(l => /^\|\s*-+(\s*\|\s*-+)*\s*\|$/.test(l.trim()));
  const ok = seps.length === c.expectedSeparators;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${c.name}`);
  console.log(`    expected ${c.expectedSeparators} separator(s), got ${seps.length}`);
  if (!ok) {
    console.log(`    --- INPUT ---`);
    console.log(c.input.split('\n').map((l, i) => `    ${i}: ${l}`).join('\n'));
    console.log(`    --- OUTPUT ---`);
    console.log(out.split('\n').map((l, i) => `    ${i}: ${l}`).join('\n'));
    fail++;
  } else {
    pass++;
  }
}

console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
