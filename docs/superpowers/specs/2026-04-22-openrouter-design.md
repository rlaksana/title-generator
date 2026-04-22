# OpenRouter Provider Integration — Design Spec

## Context

Add OpenRouter as a fourth AI provider alongside OpenAI, Anthropic, and Google. OpenRouter acts as a gateway to many LLM providers with a unified OpenAI-compatible API.

## What

**New provider: `openrouter`**

- `OpenRouterStrategy` class implementing `AIProviderStrategy`
- Three new settings: `openRouterApiKey`, `openRouterModel`, `openRouterReasoningEnabled`
- Model fetched from OpenRouter's `/models` endpoint with searchable dropdown
- Reasoning toggle sends `reasoning: { enabled: true }` in request body when enabled (default: `true`)

## API Details

**Endpoint:** `POST https://openrouter.ai/api/v1/chat/completions`

**Auth:** `Authorization: Bearer {openRouterApiKey}`

**Request body:**
```json
{
  "model": "<provider>/<model>",   // e.g. "openai/gpt-oss-120b"
  "messages": [{ "role": "user", "content": "<prompt>" }],
  "temperature": 0.3,
  "reasoning": { "enabled": true }
}
```

**Response:** Same shape as OpenAI — `choices[0].message.content`

## Files to Change

| File | Change |
|------|--------|
| `src/types.ts` | Add `openrouter` to `AIProvider`, add `OpenRouterResponse`, add `openRouter*` fields to `TitleGeneratorSettings` |
| `src/settings.ts` | Add `openrouter` to `AI_PROVIDERS`, add default values, add `renderOpenRouterSettings()`, wire up in `renderProviderSettings()` |
| `src/aiService.ts` | Add `OpenRouterStrategy` class, register in `AIService.strategies` |
| `src/modelService.ts` | Add `openrouter` case for model fetching via `GET /api/v1/models` |

## Default Models

- `openai/gpt-oss-120b`
- `xiaomi/mimo-v2-flash`

## Reasoning Toggle

When `openRouterReasoningEnabled` is `true`, include `reasoning: { enabled: true }` in request body. OpenRouter API will reject with an error if model doesn't support it — no client-side filtering.
