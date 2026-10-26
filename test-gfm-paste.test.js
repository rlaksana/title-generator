#!/usr/bin/env node
// Regression test for D+guardrail content preservation pipeline.
//
// Covers:
//   - F3: validateGfmOutput guards (sentinel leak, fence parity, mid-list,
//         length delta, heading-shrunk warning)
//   - F3: postTransform minimal behavior (collapses 3+ blank lines, no other
//         regex passes applied — `## References` and `Output: 42` preserved)
//
// Does NOT cover F1/F2 (removals) or F5 (vault adapter writes) — those are
// additive/subtractive changes validated by `npm run build` and manual paste
// tests.
//
// Compiles src/gfmService.ts on the fly via esbuild + VM, same pattern as
// test-gfm-tables.test.js — no build artifacts, no `obsidian` import required.

const vm = require('vm');
const path = require('path');
const esbuild = require('esbuild');

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

let pass = 0;
let fail = 0;
function check(name, condition, detail) {
  if (condition) {
    console.log(`PASS ${name}`);
    pass++;
  } else {
    console.log(`FAIL ${name}${detail ? ': ' + detail : ''}`);
    fail++;
  }
}

// ---------------------------------------------------------------------------
// F3: postTransform minimal behavior
// ---------------------------------------------------------------------------

// 1. Collapses 3+ blank lines to 2.
{
  const input = 'a\n\n\n\nb';
  const out = gfm.postTransform(input);
  check(
    'postTransform collapses 3+ blank lines to 2',
    out === 'a\n\nb',
    `got: ${JSON.stringify(out)}`
  );
}

// 2. Preserves `## References` heading (was eaten by old stripCitations in preTransform).
{
  const input = '# Title\n\n## Intro\n\nstuff\n\n## References\n\n1. Foo\n2. Bar\n';
  const out = gfm.postTransform(input);
  check(
    'postTransform preserves ## References heading',
    out.includes('## References') && out.includes('1. Foo') && out.includes('2. Bar'),
    `got: ${JSON.stringify(out)}`
  );
}

// 3. Preserves `Output:` line (was eaten by old stripPromptEcho).
{
  const input = 'Some prose\n\nOutput: 42 widgets per cluster\n\nMore prose';
  const out = gfm.postTransform(input);
  check(
    'postTransform preserves "Output:" body line',
    out.includes('Output: 42 widgets per cluster'),
    `got: ${JSON.stringify(out)}`
  );
}

// 4. Preserves `Format the following ...` line (was eaten by old stripInstructions).
{
  const input = 'Some prose\n\nFormat the following table:\n\n| A | B |\n';
  const out = gfm.postTransform(input);
  check(
    'postTransform preserves "Format the following..." body line',
    out.includes('Format the following table'),
    `got: ${JSON.stringify(out)}`
  );
}

// 5. Preserves smart quotes, HTML entities, inline HTML (T1 root cause).
{
  const input = '<details><summary>Click</summary>\n&copy; 2026 &mdash; "hello"\n</details>';
  const out = gfm.postTransform(input);
  check(
    'postTransform preserves smart quotes / HTML entities / inline HTML',
    out.includes('<details>') &&
      out.includes('&copy;') &&
      out.includes('&mdash;') &&
      out.includes('"hello"'),
    `got: ${JSON.stringify(out)}`
  );
}

// 6. ChatGPT citation chip (favicon link + source name + "+N") is removed.
{
  const input = 'Untuk opsi 1–3, dasarnya PP 46/2015.\n\n[image](https://www.google.com/s2/favicons?domain=https://www.bpjsketenagakerjaan.go.id\\&sz=32)\n\nBPJS Ketenagakerjaan\n\n+2\n\nOpsi 5 tersedia melalui menu Dana Siaga.';
  const out = gfm.postTransform(input);
  check(
    'postTransform strips citation chip (favicon + name + "+N")',
    !out.includes('favicons') &&
      !out.includes('BPJS Ketenagakerjaan') &&
      !out.includes('+2') &&
      out.includes('Untuk opsi 1–3') &&
      out.includes('Opsi 5 tersedia'),
    `got: ${JSON.stringify(out)}`
  );
}

// 7. Chip without "+N" (favicon + name only) is removed too.
{
  const input = 'Prose satu.\n\n[image](https://www.google.com/s2/favicons?domain=example.com&sz=32)\n\nExample Site\n\nProse dua.';
  const out = gfm.postTransform(input);
  check(
    'postTransform strips chip without "+N"',
    !out.includes('favicons') && !out.includes('Example Site') &&
      out.includes('Prose satu.') && out.includes('Prose dua.'),
    `got: ${JSON.stringify(out)}`
  );
}

// 8. Legit non-favicon image link is preserved.
{
  const input = 'Lihat [image](https://example.com/logo.png) dan ![foto](https://cdn.example.com/a.jpg).';
  const out = gfm.postTransform(input);
  check(
    'postTransform preserves non-favicon image links',
    out.includes('https://example.com/logo.png') &&
      out.includes('![foto](https://cdn.example.com/a.jpg)'),
    `got: ${JSON.stringify(out)}`
  );
}

// 9. Favicon chip inside a code fence passes through verbatim.
{
  const input = 'Contoh:\n\n```\n[image](https://www.google.com/s2/favicons?domain=example.com&sz=32)\nBPJS Ketenagakerjaan\n```\n';
  const out = gfm.postTransform(input);
  check(
    'postTransform preserves favicon chip inside code fence',
    out.includes('favicons') && out.includes('BPJS Ketenagakerjaan'),
    `got: ${JSON.stringify(out)}`
  );
}

// 10. Anchor-less "+2" line is preserved (only chip-following "+N" is removed).
{
  const input = 'Skor hasil:\n\n+2\n\npoin untuk tim kedua.';
  const out = gfm.postTransform(input);
  check(
    'postTransform preserves "+2" line without a chip before it',
    out.includes('+2'),
    `got: ${JSON.stringify(out)}`
  );
}

// 11. Prose with terminal punctuation after an orphan favicon link survives
//     (the source-name heuristic must not eat a paragraph).
{
  const input = '[image](https://www.google.com/s2/favicons?domain=example.com&sz=32)\n\nKlaim sebagian hanya bisa dilakukan satu kali sesuai ketentuan.';
  const out = gfm.postTransform(input);
  check(
    'postTransform keeps prose paragraph after orphan favicon link',
    out.includes('Klaim sebagian hanya bisa dilakukan satu kali sesuai ketentuan.'),
    `got: ${JSON.stringify(out)}`
  );
}

// ---------------------------------------------------------------------------
// F4: validateGfmOutput guards
// ---------------------------------------------------------------------------

// G1. Sentinel leak → invalid
{
  const input = '# Hello\n\nbody';
  const output = '<<GFM_BODY_START_abc123>>\n# Hello\n\nbody\n<<GFM_BODY_END_abc123>>';
  const result = gfm.validateGfmOutput(input, output);
  check(
    'validateGfmOutput rejects sentinel leak',
    !result.valid && /Sentinel/i.test(result.reason ?? ''),
    `got: ${JSON.stringify(result)}`
  );
}

// G2. Unclosed fence (odd ``` count) → invalid
{
  const input = '# Hello\n\n```js\ncode\n';
  const output = '# Hello\n\n```js\ncode\nmore code\n'; // 1 fence marker total
  const result = gfm.validateGfmOutput(input, output);
  check(
    'validateGfmOutput rejects unclosed fence',
    !result.valid && /fence/i.test(result.reason ?? ''),
    `got: ${JSON.stringify(result)}`
  );
}

// G3. Dangling list marker → invalid
{
  const input = '- item 1\n- item 2\n- item 3';
  const output = '- item 1\n- item 2\n- ';  // ends with dangling marker
  const result = gfm.validateGfmOutput(input, output);
  check(
    'validateGfmOutput rejects dangling list marker',
    !result.valid && /list marker/i.test(result.reason ?? ''),
    `got: ${JSON.stringify(result)}`
  );
}

// G4. Length delta < 50% → invalid
{
  const input = 'a'.repeat(1000);
  const output = 'b'.repeat(400); // 40% of input
  const result = gfm.validateGfmOutput(input, output);
  check(
    'validateGfmOutput rejects < 50% length delta',
    !result.valid && /length/i.test(result.reason ?? ''),
    `got: ${JSON.stringify(result)}`
  );
}

// G5. Empty output → invalid
{
  const result = gfm.validateGfmOutput('anything', '');
  check(
    'validateGfmOutput rejects empty output',
    !result.valid,
    `got: ${JSON.stringify(result)}`
  );
}

// G6. Heading-shrunk → warning (not invalid). Use long output so length
//     delta guard does not fire first.
{
  const input = '# A\n## B\n### C\n## D';
  const output = '# A\n\nLots of filler text here to push length above 50% threshold so the length-delta guard does not preempt the heading-shrunk check.';
  const result = gfm.validateGfmOutput(input, output);
  check(
    'validateGfmOutput emits heading-shrunk warning (not invalid)',
    result.valid && /heading/i.test(result.warning ?? ''),
    `got: ${JSON.stringify(result)}`
  );
}

// G7. Clean output → valid, no warning
{
  const input = '# A\n\nbody\n\n## B\n\nbody2';
  const output = '# A\n\nbody\n\n## B\n\nbody2';
  const result = gfm.validateGfmOutput(input, output);
  check(
    'validateGfmOutput accepts clean output',
    result.valid && !result.warning,
    `got: ${JSON.stringify(result)}`
  );
}

// G8. Headings preserved (not shrunk) → valid, no warning
{
  const input = '# A\n## B\n### C';
  const output = '# A\n## B\n### C';
  const result = gfm.validateGfmOutput(input, output);
  check(
    'validateGfmOutput accepts preserved headings',
    result.valid && !result.warning,
    `got: ${JSON.stringify(result)}`
  );
}

// G9. Real paste with smart quotes + HTML entities + `## References` → valid
{
  const input = '<details><summary>Hi</summary>\n&copy; 2026\n\n## References\n\n1. A\n</details>';
  const output = '<details><summary>Hi</summary>\n&copy; 2026\n\n## References\n\n1. A\n</details>';
  const result = gfm.validateGfmOutput(input, output);
  check(
    'validateGfmOutput accepts pasted content with HTML/entities/References intact',
    result.valid,
    `got: ${JSON.stringify(result)}`
  );
}

console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);