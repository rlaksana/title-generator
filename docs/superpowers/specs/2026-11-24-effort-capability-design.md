# Unified Reasoning Effort — Capability-Query Design (2026-11-24)

## Goal

One "Reasoning effort" setting per provider. The option list for the selected
model comes from the provider when the provider exposes it, and from a
version-stamped built-in table (clearly labelled in the UI) otherwise. An
unknown model or an unknown capability never guesses: the control is hidden
and no effort field is sent.

## Verified capability sources

All claims below were confirmed against first-party docs by an adversarial
verification pass on 2026-11-24.

| Provider | Queryable per-model levels | Source | Request field |
|---|---|---|---|
| Anthropic | Yes | `GET /v1/models` → `capabilities.effort.{low,medium,high,xhigh,max}.supported`, `capabilities.thinking.types` | `output_config.effort` |
| OpenRouter | Yes | `GET /api/v1/models` → `reasoning.supported_efforts`, `default_effort`, `mandatory` | `reasoning.effort` |
| LiteLLM | Partial | `GET /model_group/info` → `supports_reasoning` only (levels not reliably exposed) | `reasoning_effort` |
| Google | Boolean only | `models.list` → `thinking: true/false`; levels are documentation-only | `thinkingConfig.thinkingLevel` |
| OpenAI | No | `/v1/models` has no capability metadata | `reasoning_effort` |
| Kimi | No | Kimi Code host documents no capability endpoint | `reasoning_effort` (path unverified on this host) |
| MiniMax | No | list-models has no capability metadata | `output_config.effort` (M3.1-Flash only) |
| Z.AI | No | Anthropic-compatible endpoint has no documented effort schema | not sent in v1 |

## Decisions (user-approved)

1. **Query + labelled static fallback.** Query for Anthropic/OpenRouter;
   version-stamped tables for OpenAI/Google/Kimi/MiniMax/LiteLLM; hidden for
   unknown models.
2. **OpenAI temperature coupling is removed.** Effort is explicit; temperature
   returns to being a creativity knob.
3. **One effort setting per provider** replaces the old Google thinking level,
   Anthropic thinking toggle/budget, and OpenRouter reasoning toggle in the UI.
   Legacy values are migrated on load.
4. **Kimi sends** `reasoning_effort` with an "unverified on this host" note;
   **Z.AI sends nothing** and shows "not documented for this endpoint".

## Architecture

- `CachedModels` gains optional `capabilities` (per model id) and
  `capabilitiesVersion`. Capability metadata rides the existing explicit
  model refresh — no network on render, no second cache. `capabilitiesVersion`
  is stamped only when capability data actually arrived; an empty response
  keeps the "refresh to detect" hint visible.
- New pure `effortService.ts` owns the ladder, the static tables,
  `resolveEffort()`, `buildEffortPayload()`, `resolveThinkingType()`, and the
  Anthropic/OpenRouter response parsers.
- Each strategy spreads `buildEffortPayload()`; one resolver enforces
  "never send a value the model rejects".
- Settings renders one effort row per provider from the resolved list.
  `display()` already runs on model selection and after refresh, so the row
  updates for free.
- Anthropic models GET tries `anthropic-version: 2026-10-21`; if that is
  rejected (older proxy), it retries with `2023-06-01` and returns models
  without capabilities so refresh never regresses.
- Google `gemini-2.5` is deliberately absent from the table: it uses
  `thinkingBudget`, not `thinkingLevel`, and the pre-change code never sent a
  level for it.
- LiteLLM Claude entries are enumerated by effort-capable family (4.6/4.7,
  Opus 4.5, Claude 5); a bare `claude` prefix would offer effort to
  non-reasoning 3.x/4.5 models.

## Known risks

- Anthropic capability fields require `anthropic-version: 2026-10-21` on the
  models GET only. If absent, the control hides (no silent hardcoded fallback).
- Google's REST schema omits `xhigh`, but `gemini-4-neon/hydrogen` accept it;
  the table (not the schema) is authoritative.
- Static tables drift on new model releases. Unknown model → hidden, and the
  UI labels the table with its checked date.
- Kimi's effort path on `api.kimi.com/coding` is unverified; a 400 would
  surface at use.
- `cacheError` must carry the previous capabilities forward or an error
  refresh would silently erase them.