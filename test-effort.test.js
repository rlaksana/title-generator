#!/usr/bin/env node
// Unit tests for the unified reasoning-effort resolver.
//
// Compiles src/effortService.ts on the fly via esbuild + VM (same pattern as
// test-gfm-paste.test.js). The module is pure — it imports types only — so no
// Obsidian stub is required.

const vm = require('vm');
const path = require('path');
const esbuild = require('esbuild');

const compiled = esbuild.buildSync({
  entryPoints: [path.join(__dirname, 'src', 'effortService.ts')],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  write: false,
}).outputFiles[0].text;

const sandboxModule = { exports: {} };
const sandbox = {
  require,
  module: sandboxModule,
  exports: sandboxModule.exports,
  __filename: 'effortService.ts',
  __dirname: __dirname,
  console,
};
vm.createContext(sandbox);
vm.runInContext(compiled, sandbox, { filename: 'effortService.ts' });

const {
  resolveEffort,
  buildEffortPayload,
  resolveThinkingType,
  effectiveEffort,
  effortSelectOptions,
  parseAnthropicCapabilities,
  parseOpenRouterCapabilities,
  CAPABILITIES_VERSION,
} = sandboxModule.exports;

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

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const cached = (capabilities, version = CAPABILITIES_VERSION) => ({
  models: [],
  lastUpdated: 1,
  capabilities,
  capabilitiesVersion: version,
});

const settings = (provider, value) => ({ effort: { [provider]: value } });

// ---------------------------------------------------------------------------
// Static tables
// ---------------------------------------------------------------------------

{
  const r = resolveEffort('openai', 'gpt-5.5', undefined);
  check(
    'openai gpt-5.5 table values',
    r.source === 'table' &&
      eq(r.values, ['none', 'minimal', 'low', 'medium', 'high', 'xhigh']),
    JSON.stringify(r)
  );
}

{
  const r = resolveEffort('openai', 'gpt-5.5-pro', undefined);
  check(
    'openai gpt-5.5-pro has no none',
    eq(r.values, ['minimal', 'low', 'medium', 'high', 'xhigh']),
    JSON.stringify(r)
  );
}

{
  const r = resolveEffort('openai', 'o3', undefined);
  check(
    'openai o-series unknown -> no effort',
    eq(r.values, []) && r.source === 'none',
    JSON.stringify(r)
  );
}

{
  const r = resolveEffort('google', 'gemini-3.5-flash', undefined);
  check(
    'google gemini-3.5-flash table',
    eq(r.values, ['minimal', 'low', 'medium', 'high']),
    JSON.stringify(r)
  );
}

{
  const r = resolveEffort('google', 'gemini-3-pro-preview', undefined);
  check(
    'google gemini-3-pro-preview only low/high',
    eq(r.values, ['low', 'high']),
    JSON.stringify(r)
  );
}

{
  const r = resolveEffort(
    'google',
    'gemini-3.5-flash',
    cached({ 'gemini-3.5-flash': { supportsThinking: false } })
  );
  check(
    'google thinking=false hides control',
    eq(r.values, []) && r.source === 'api',
    JSON.stringify(r)
  );
}

{
  const r = resolveEffort('kimi', 'kimi-for-coding-highspeed', undefined);
  check(
    'kimi highspeed has no adjustable effort',
    eq(r.values, []) && r.source === 'table',
    JSON.stringify(r)
  );
}

{
  const r = resolveEffort('minimax', 'MiniMax-M3.1-Flash', undefined);
  check(
    'minimax M3.1-Flash table',
    eq(r.values, ['low', 'medium', 'high', 'xhigh', 'max']),
    JSON.stringify(r)
  );
}

{
  const r = resolveEffort('minimax', 'MiniMax-M2.7-highspeed', undefined);
  check(
    'minimax other models -> no effort',
    eq(r.values, []),
    JSON.stringify(r)
  );
}

{
  const r = resolveEffort('litellm', 'openai/gpt-5.1', undefined);
  check(
    'litellm strips provider prefix',
    eq(r.values, ['none', 'low', 'medium', 'high']),
    JSON.stringify(r)
  );
}

{
  const r = resolveEffort(
    'litellm',
    'bedrock/anthropic.claude-sonnet-4-6',
    undefined
  );
  check(
    'litellm strips anthropic. prefix for effort-capable claude',
    eq(r.values, ['low', 'medium', 'high', 'max']),
    JSON.stringify(r)
  );
}

{
  const r = resolveEffort('litellm', 'anthropic/claude-3-haiku', undefined);
  check(
    'litellm does not offer effort for non-reasoning claude',
    eq(r.values, []),
    JSON.stringify(r)
  );
}

{
  const r = resolveEffort('google', 'gemini-2.5-flash', undefined);
  check(
    'google 2.5 stays on thinkingBudget with no effort control',
    eq(r.values, []),
    JSON.stringify(r)
  );
}

// ---------------------------------------------------------------------------
// API capabilities
// ---------------------------------------------------------------------------

const anthropicModel = 'claude-sonnet-4-6-20251001';
{
  const r = resolveEffort(
    'anthropic',
    anthropicModel,
    cached({
      [anthropicModel]: {
        effort: ['max', 'high', 'low'],
        thinking: { adaptive: true },
      },
    })
  );
  check(
    'anthropic uses API capabilities',
    r.source === 'api' && eq(r.values, ['low', 'high', 'max']),
    JSON.stringify(r)
  );
}

{
  const r = resolveEffort(
    'anthropic',
    anthropicModel,
    cached({}, 0)
  );
  check(
    'anthropic stale cache asks for refresh',
    eq(r.values, []) && !!r.note,
    JSON.stringify(r)
  );
}

{
  const r = resolveEffort(
    'openrouter',
    'x/model',
    cached({
      'x/model': { effort: ['high', 'medium', 'none'], effortMandatory: false },
    })
  );
  check(
    'openrouter API values are sorted to the ladder',
    r.source === 'api' && eq(r.values, ['none', 'medium', 'high']),
    JSON.stringify(r)
  );
}

{
  const r = resolveEffort('zai', 'glm-5.3', undefined);
  check(
    'zai never offers effort',
    eq(r.values, []) && !!r.note,
    JSON.stringify(r)
  );
}

// ---------------------------------------------------------------------------
// Payload building
// ---------------------------------------------------------------------------

{
  const r = buildEffortPayload(
    'anthropic',
    anthropicModel,
    settings('anthropic', 'high'),
    cached({
      [anthropicModel]: { effort: ['low', 'medium', 'high', 'max'] },
    })
  );
  check(
    'anthropic payload uses output_config.effort',
    eq(r, { output_config: { effort: 'high' } }),
    JSON.stringify(r)
  );
}

{
  const r = buildEffortPayload(
    'anthropic',
    anthropicModel,
    settings('anthropic', 'xhigh'),
    cached({ [anthropicModel]: { effort: ['low', 'high'] } })
  );
  check(
    'unsupported value is never sent',
    eq(r, {}),
    JSON.stringify(r)
  );
}

{
  const r = buildEffortPayload(
    'openai',
    'gpt-5.5',
    settings('openai', 'default'),
    undefined
  );
  check('default sends nothing', eq(r, {}), JSON.stringify(r));
}

{
  const r = buildEffortPayload(
    'google',
    'gemini-3.5-flash',
    settings('google', 'high'),
    undefined
  );
  check(
    'google payload uppercases the level',
    eq(r, { thinkingConfig: { thinkingLevel: 'HIGH' } }),
    JSON.stringify(r)
  );
}

{
  const r = buildEffortPayload(
    'openrouter',
    'x/model',
    settings('openrouter', 'medium'),
    cached({ 'x/model': { effort: ['low', 'medium', 'high'] } })
  );
  check(
    'openrouter payload uses reasoning.effort',
    eq(r, { reasoning: { effort: 'medium' } }),
    JSON.stringify(r)
  );
}

{
  const r = buildEffortPayload(
    'kimi',
    'kimi-for-coding',
    settings('kimi', 'max'),
    undefined
  );
  check(
    'kimi payload uses reasoning_effort',
    eq(r, { reasoning_effort: 'max' }),
    JSON.stringify(r)
  );
}

{
  const r = buildEffortPayload(
    'litellm',
    'anthropic/claude-sonnet-4-6',
    settings('litellm', 'high'),
    undefined
  );
  check(
    'litellm claude payload',
    eq(r, { reasoning_effort: 'high' }),
    JSON.stringify(r)
  );
}

{
  const r = buildEffortPayload(
    'zai',
    'glm-5.3',
    settings('zai', 'high'),
    undefined
  );
  check('zai sends nothing', eq(r, {}), JSON.stringify(r));
}

// ---------------------------------------------------------------------------
// Provider API parsing
// ---------------------------------------------------------------------------

{
  const caps = parseAnthropicCapabilities([
    {
      id: 'claude-a',
      capabilities: {
        effort: {
          supported: true,
          low: { supported: true },
          medium: { supported: false },
          high: { supported: true },
          max: { supported: true },
        },
        thinking: {
          types: {
            adaptive: { supported: true },
            enabled: { supported: true },
            disabled: { supported: false },
          },
        },
      },
    },
    { id: 'claude-b' },
    { id: 'claude-c', capabilities: null },
  ]);
  check(
    'anthropic parse keeps only supported effort levels',
    !!caps &&
      eq(caps['claude-a'].effort, ['low', 'high', 'max']) &&
      !caps['claude-b'] &&
      !caps['claude-c'],
    JSON.stringify(caps)
  );
  check(
    'anthropic parse reads thinking types',
    eq(caps['claude-a'].thinking, {
      adaptive: true,
      enabled: true,
      disabled: false,
    })
  );
}

{
  const caps = parseOpenRouterCapabilities([
    {
      id: 'a',
      reasoning: {
        supported_efforts: ['high', 'medium', 'minimal'],
        mandatory: false,
      },
    },
    { id: 'b', reasoning: { supported_efforts: null, mandatory: true } },
    { id: 'c' },
    {
      id: 'd',
      reasoning: { supported_efforts: ['bogus', 'low'], mandatory: false },
    },
  ]);
  check(
    'openrouter parse keeps API order',
    eq(caps['a'].effort, ['high', 'medium', 'minimal'])
  );
  check(
    'openrouter null supported_efforts expands to ladder minus none when mandatory',
    eq(caps['b'].effort, ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
  );
  check(
    'openrouter parse drops unknown levels and absent reasoning',
    !caps['c'] && eq(caps['d'].effort, ['low']),
    JSON.stringify(caps)
  );
}

// ---------------------------------------------------------------------------
// Thinking mode + UI helpers
// ---------------------------------------------------------------------------

{
  check(
    'thinking type adaptive from capabilities',
    resolveThinkingType(
      anthropicModel,
      cached({ [anthropicModel]: { thinking: { adaptive: true } } })
    ) === 'adaptive'
  );
  check(
    'thinking type enabled from capabilities',
    resolveThinkingType(
      anthropicModel,
      cached({ [anthropicModel]: { thinking: { enabled: true } } })
    ) === 'enabled'
  );
  check(
    'thinking type legacy without capabilities',
    resolveThinkingType(anthropicModel, undefined) === 'legacy'
  );
  check(
    'thinking type disabled when capabilities report all false',
    resolveThinkingType(
      anthropicModel,
      cached({
        [anthropicModel]: {
          thinking: { adaptive: false, enabled: false, disabled: false },
        },
      })
    ) === 'disabled'
  );
}

{
  const resolved = resolveEffort('openai', 'gpt-5.5', undefined);
  check(
    'effective effort clamps invalid stored value',
    effectiveEffort(resolved, 'xhigh') === 'xhigh' &&
      effectiveEffort(resolved, 'bogus') === 'default'
  );
  check(
    'select options include Default first',
    Object.keys(effortSelectOptions(resolved))[0] === 'default'
  );
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);