import type {
  AIProvider,
  CachedModels,
  ModelCapabilities,
  TitleGeneratorSettings,
} from './types';

/**
 * Canonical effort ladder, weakest to strongest. Provider tables and
 * API-reported levels are intersected with this list for display order.
 */
export const EFFORT_LEVELS = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
] as const;

export type EffortLevel = (typeof EFFORT_LEVELS)[number];

/** Sentinel stored in settings: do not send an effort field. */
export const DEFAULT_EFFORT = 'default';

/** Bump when capability parsing or the static tables change materially. */
export const CAPABILITIES_VERSION = 1;

export const EFFORT_LABELS: Record<string, string> = {
  none: 'None',
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra high',
  max: 'Max',
};

type TableEntry = { match: string; values: string[] };

// OpenAI publishes no capability API. Values below come from the official
// per-model docs (checked 2026-11). Longest prefix wins.
const OPENAI_TABLE: TableEntry[] = [
  { match: 'gpt-6.2-sol', values: ['low', 'medium', 'high', 'xhigh', 'max'] },
  { match: 'gpt-6.2-astra', values: ['low', 'medium', 'high', 'xhigh', 'max'] },
  { match: 'gpt-6.2-terra', values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'] },
  { match: 'gpt-6.2-luna', values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'] },
  { match: 'gpt-6.1-sol', values: ['low', 'medium', 'high', 'xhigh', 'max'] },
  { match: 'gpt-6.1-terra', values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'] },
  { match: 'gpt-6.1-luna', values: ['none', 'low', 'medium', 'high', 'xhigh', 'max'] },
  { match: 'gpt-5.5-pro', values: ['minimal', 'low', 'medium', 'high', 'xhigh'] },
  { match: 'gpt-5.5', values: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'] },
  { match: 'gpt-5.2-pro', values: ['low', 'medium', 'high', 'xhigh'] },
  { match: 'gpt-5.2', values: ['none', 'low', 'medium', 'high', 'xhigh'] },
  { match: 'gpt-5.1-codex-max', values: ['low', 'medium', 'high', 'xhigh'] },
  { match: 'gpt-5.1-codex', values: ['low', 'medium', 'high'] },
  { match: 'gpt-5.1', values: ['none', 'low', 'medium', 'high'] },
  { match: 'gpt-5-pro', values: ['high'] },
  { match: 'gpt-5-nano', values: ['none', 'low', 'medium', 'high'] },
  { match: 'gpt-5-mini', values: ['minimal', 'low', 'medium', 'high'] },
  { match: 'gpt-5-codex', values: ['low', 'medium', 'high'] },
  { match: 'gpt-5', values: ['minimal', 'low', 'medium', 'high'] },
];

// Google models.list exposes only a thinking boolean, never the level list.
// The per-model tables are documentation-only (checked 2026-11). Note that
// the REST schema omits xhigh even though gemini-4-neon/hydrogen accept it.
const GOOGLE_TABLE: TableEntry[] = [
  { match: 'gemini-4-neon', values: ['low', 'medium', 'high', 'xhigh'] },
  { match: 'gemini-4-hydrogen', values: ['low', 'medium', 'high', 'xhigh'] },
  { match: 'gemini-4-carbon', values: ['low', 'medium', 'high'] },
  { match: 'gemini-4-argon', values: ['low', 'medium', 'high'] },
  { match: 'gemini-3.8-flash', values: ['low', 'medium', 'high'] },
  { match: 'gemini-3.6-flash', values: ['minimal', 'low', 'medium', 'high'] },
  { match: 'gemini-3.5', values: ['minimal', 'low', 'medium', 'high'] },
  { match: 'gemini-3.1-flash-lite-image', values: ['minimal', 'high'] },
  { match: 'gemini-3.1-flash-lite', values: ['minimal', 'low', 'medium', 'high'] },
  { match: 'gemini-3.1-pro', values: ['low', 'medium', 'high'] },
  { match: 'gemini-3-pro-preview', values: ['low', 'high'] },
  { match: 'gemini-3-flash', values: ['minimal', 'low', 'medium', 'high'] },
  { match: 'gemini-3-pro', values: ['low', 'high'] },
  { match: 'robotics-er-2', values: ['minimal', 'low', 'medium', 'high'] },
];

// Kimi Code documents no capability endpoint; values are from its per-model
// table (checked 2026-11).
const KIMI_TABLE: TableEntry[] = [
  { match: 'kimi-for-coding-highspeed', values: [] },
  { match: 'kimi-for-coding', values: ['low', 'high', 'max'] },
  { match: 'k3.1-pro', values: ['low', 'high', 'max'] },
  { match: 'k3-256k', values: ['low', 'high', 'max'] },
  { match: 'k3', values: ['low', 'high', 'max'] },
];

const MINIMAX_TABLE: TableEntry[] = [
  { match: 'minimax-m3.1-flash', values: ['low', 'medium', 'high', 'xhigh', 'max'] },
];

// LiteLLM proxies arbitrary backends. Match both OpenAI-style ids and
// provider-prefixed ids (openai/gpt-5.1, anthropic/claude-*). Claude ids are
// enumerated by effort-capable family: Claude 3.x and 4.5 have no effort
// control, so a bare `claude` prefix would offer values that 400.
const LITELLM_CLAUDE_HIGH_MAX = ['low', 'medium', 'high', 'max'];
const LITELLM_CLAUDE_XHIGH = ['low', 'medium', 'high', 'xhigh', 'max'];

const LITELLM_TABLE: TableEntry[] = [
  ...OPENAI_TABLE,
  { match: 'claude-opus-4-7', values: LITELLM_CLAUDE_XHIGH },
  { match: 'claude-opus-4-6', values: LITELLM_CLAUDE_HIGH_MAX },
  { match: 'claude-sonnet-4-6', values: LITELLM_CLAUDE_HIGH_MAX },
  { match: 'claude-opus-4-5', values: ['low', 'medium', 'high'] },
  { match: 'claude-opus-5', values: LITELLM_CLAUDE_XHIGH },
  { match: 'claude-sonnet-5', values: LITELLM_CLAUDE_XHIGH },
  { match: 'claude-haiku-5', values: LITELLM_CLAUDE_XHIGH },
  { match: 'claude-fable-5', values: LITELLM_CLAUDE_XHIGH },
];

function tableFor(provider: AIProvider): TableEntry[] {
  switch (provider) {
    case 'openai':
      return OPENAI_TABLE;
    case 'google':
      return GOOGLE_TABLE;
    case 'kimi':
      return KIMI_TABLE;
    case 'minimax':
      return MINIMAX_TABLE;
    case 'litellm':
      return LITELLM_TABLE;
    default:
      return [];
  }
}

function matchTable(model: string, entries: TableEntry[]): string[] | undefined {
  const normalized = model.toLowerCase();
  const hit = entries
    .filter((entry) => normalized.startsWith(entry.match))
    .sort((a, b) => b.match.length - a.match.length)[0];
  return hit ? [...hit.values] : undefined;
}

export function sortEffortLevels(values: string[]): string[] {
  return [...new Set(values)]
    .filter((value) => (EFFORT_LEVELS as readonly string[]).includes(value))
    .sort(
      (a, b) =>
        EFFORT_LEVELS.indexOf(a as EffortLevel) -
        EFFORT_LEVELS.indexOf(b as EffortLevel)
    );
}

const ANTHROPIC_EFFORT_LEVELS = [
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
];

/** Parse `GET /v1/models` (Anthropic) into per-model capabilities. */
export function parseAnthropicCapabilities(
  models: any[]
): Record<string, ModelCapabilities> | undefined {
  const capabilities: Record<string, ModelCapabilities> = {};

  for (const model of models) {
    const cap = model?.capabilities;
    if (!cap) continue;

    const effort: string[] = [];
    if (cap.effort?.supported === true) {
      for (const level of ANTHROPIC_EFFORT_LEVELS) {
        if (cap.effort[level]?.supported === true) effort.push(level);
      }
    }

    capabilities[model.id] = {
      effort,
      thinking: {
        adaptive: cap.thinking?.types?.adaptive?.supported === true,
        enabled: cap.thinking?.types?.enabled?.supported === true,
        disabled: cap.thinking?.types?.disabled?.supported === true,
      },
    };
  }

  return Object.keys(capabilities).length > 0 ? capabilities : undefined;
}

/** Parse `GET /api/v1/models` (OpenRouter) into per-model capabilities. */
export function parseOpenRouterCapabilities(
  models: any[]
): Record<string, ModelCapabilities> | undefined {
  const capabilities: Record<string, ModelCapabilities> = {};

  for (const model of models) {
    const reasoning = model?.reasoning;
    if (!reasoning || typeof reasoning !== 'object') continue;

    // null supported_efforts means the model accepts the whole gateway ladder.
    const raw: string[] =
      reasoning.supported_efforts == null
        ? [...EFFORT_LEVELS]
        : (reasoning.supported_efforts as string[]).filter((value) =>
            (EFFORT_LEVELS as readonly string[]).includes(value)
          );

    capabilities[model.id] = {
      effort: reasoning.mandatory
        ? raw.filter((value) => value !== 'none')
        : raw,
    };
  }

  return Object.keys(capabilities).length > 0 ? capabilities : undefined;
}

export interface ResolvedEffort {
  values: string[];
  source: 'api' | 'table' | 'none';
  note?: string;
}

export function getCachedCapabilities(
  model: string,
  cached?: CachedModels
): ModelCapabilities | undefined {
  if (!cached || cached.capabilitiesVersion !== CAPABILITIES_VERSION) {
    return undefined;
  }
  return cached.capabilities?.[model];
}

function hasCurrentCapabilities(cached?: CachedModels): boolean {
  return cached?.capabilitiesVersion === CAPABILITIES_VERSION;
}

/**
 * Resolve the effort levels offered for a provider + model.
 * API data always wins over the static table.
 */
export function resolveEffort(
  provider: AIProvider,
  model: string,
  cached?: CachedModels
): ResolvedEffort {
  if (!model) {
    return { values: [], source: 'none' };
  }

  const cap = getCachedCapabilities(model, cached);

  if (provider === 'anthropic' || provider === 'openrouter') {
    if (cap?.effort) {
      return { values: sortEffortLevels(cap.effort), source: 'api' };
    }
    if (hasCurrentCapabilities(cached)) {
      return { values: [], source: 'api' };
    }
    return {
      values: [],
      source: 'none',
      note: 'Refresh the model list to detect effort levels.',
    };
  }

  if (provider === 'zai') {
    return {
      values: [],
      source: 'none',
      note: 'Effort is not documented for this endpoint.',
    };
  }

  if (provider === 'google' && cap?.supportsThinking === false) {
    return { values: [], source: 'api' };
  }

  const tableModel =
    provider === 'litellm'
      ? (model.split('/').pop() || model).replace(/^anthropic\./, '')
      : model;
  const table = matchTable(tableModel, tableFor(provider));

  if (table) {
    return { values: sortEffortLevels(table), source: 'table' };
  }

  return { values: [], source: 'none' };
}

/**
 * Build the provider-specific request fragment for the stored effort value.
 * Returns {} when the value is Default or the model does not accept it, so a
 * stale setting can never produce a 400.
 */
export function buildEffortPayload(
  provider: AIProvider,
  model: string,
  settings: TitleGeneratorSettings,
  cached?: CachedModels
): Record<string, unknown> {
  const value = settings.effort?.[provider];
  if (!value || value === DEFAULT_EFFORT) {
    return {};
  }

  const { values } = resolveEffort(provider, model, cached);
  if (!values.includes(value)) {
    return {};
  }

  switch (provider) {
    case 'openai':
    case 'kimi':
    case 'litellm':
      return { reasoning_effort: value };
    case 'anthropic':
    case 'minimax':
      return { output_config: { effort: value } };
    case 'google':
      return { thinkingConfig: { thinkingLevel: value.toUpperCase() } };
    case 'openrouter':
      return { reasoning: { effort: value } };
    default:
      return {};
  }
}

export type ThinkingType = 'adaptive' | 'enabled' | 'disabled' | 'legacy';

/**
 * Anthropic thinking mode for a model. Falls back to the legacy
 * model-id heuristic when the models endpoint returned no capabilities.
 */
export function resolveThinkingType(
  model: string,
  cached?: CachedModels
): ThinkingType {
  const cap = getCachedCapabilities(model, cached);
  if (cap?.thinking) {
    if (cap.thinking.adaptive) return 'adaptive';
    if (cap.thinking.enabled) return 'enabled';
    // Capabilities are authoritative: all flags false means no thinking.
    return 'disabled';
  }
  return 'legacy';
}

/** Select options for the settings row, or null when the row must be hidden. */
export function effortSelectOptions(
  resolved: ResolvedEffort
): Record<string, string> | null {
  if (!resolved.values.length) {
    return null;
  }

  const options: Record<string, string> = { [DEFAULT_EFFORT]: 'Default' };
  for (const value of resolved.values) {
    options[value] = EFFORT_LABELS[value] ?? value;
  }
  return options;
}

/** Stored value clamped to what the current model accepts. */
export function effectiveEffort(
  resolved: ResolvedEffort,
  current: string | undefined
): string {
  return current && resolved.values.includes(current)
    ? current
    : DEFAULT_EFFORT;
}

export const EFFORT_SOURCE_NOTE = 'Built-in table (checked 2026-11).';