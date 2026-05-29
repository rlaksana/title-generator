# LiteLLM Provider Integration — Design Spec

**Date:** 2026-05-29  
**Scope:** Add LiteLLM as a 6th AI provider in the Title Generator Obsidian plugin  
**Approach:** Dedicated Strategy (Pendekatan A)  
**Status:** Approved

---

## 1. Overview

LiteLLM is a proxy server (local or cloud) that unifies various LLM APIs into a single OpenAI-compatible format. This integration adds LiteLLM as a first-class provider, leveraging its OpenAI-compatible API to minimize architectural changes while supporting flexible local/remote deployment.

**Non-streaming only.** Streaming (SSE) is explicitly out of scope for this iteration; the existing `requestUrl`-based synchronous flow is reused.

---

## 2. Architecture

### 2.1 Strategy Pattern Extension

LiteLLM is added as the 6th strategy in the existing Strategy Pattern (`aiService.ts`).

```
┌─────────────────────────────────────┐
│           AIService                 │
│  ┌─────────────────────────────┐    │
│  │  strategies: Record<string, │    │
│  │    AIProviderStrategy>      │    │
│  │                             │    │
│  │  + openai                   │    │
│  │  + anthropic                │    │
│  │  + google                   │    │
│  │  + openrouter               │    │
│  │  + kimi                     │    │
│  │  + litellm  ← NEW          │    │
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
```

### 2.2 Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Reuse `OpenAIResponse` type** | LiteLLM proxies responses in OpenAI chat completions format. No new response interface needed. |
| **No model list fetching** | LiteLLM can proxy to Ollama, Bedrock, Azure, etc. Model names are free text (e.g., `ollama/llama3`). No reliable `/v1/models` endpoint to query. |
| **`requiresApiKey: false`** | Local LiteLLM servers often run without authentication. The UI still shows an API key input, but validation does not block on empty key. |
| **Base URL normalization** | Trailing slashes are stripped in `buildRequest()` to avoid double slashes in `{baseUrl}/v1/chat/completions`. |
| **No new files** | Changes are confined to 3 existing files: `types.ts`, `settings.ts`, `aiService.ts`. |

---

## 3. Data Model Changes

### 3.1 `AIProvider` Union Type (`types.ts:8`)

```typescript
export type AIProvider = 'openai' | 'anthropic' | 'google' | 'openrouter' | 'kimi' | 'litellm';
```

### 3.2 `TitleGeneratorSettings` Interface (`types.ts:276`)

Add three new fields:

```typescript
litellmBaseUrl: string;
litellmApiKey: string;
litellmModel: string;
```

### 3.3 `DEFAULT_SETTINGS` (`settings.ts:32`)

```typescript
litellmBaseUrl: 'http://localhost:4000',
litellmApiKey: '',
litellmModel: '',
```

### 3.4 `AI_PROVIDERS` Record (`settings.ts:6`)

```typescript
litellm: {
  name: 'LiteLLM',
  requiresApiKey: false,
},
```

---

## 4. API Specification

### 4.1 Request

**Endpoint:** `{litellmBaseUrl}/v1/chat/completions`

**Method:** `POST`

**Headers:**
```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer {litellmApiKey}"
}
```
*(If `litellmApiKey` is empty, header value becomes `Bearer ` with a trailing space.)*

**Body:**
```json
{
  "model": "{litellmModel}",
  "messages": [
    { "role": "user", "content": "{prompt}\n\n{content}" }
  ],
  "temperature": 0.3,
  "max_tokens": 240
}
```

### 4.2 Response

**Success (HTTP 200):**
Reuse existing `OpenAIResponse` interface. Extract text from:
```
choices[0].message.content
```

**Error:**
Any non-200 status is caught by `requestUrl` and thrown as `API error (${status}): ${text}`. The existing `handleError()` method displays it as an Obsidian toast notification.

---

## 5. Settings UI

When the user selects "LiteLLM" from the AI Provider dropdown, the following inputs are rendered below it (via `renderProviderSettings`):

| Setting | Type | Default | Validation / Behavior |
|---------|------|---------|----------------------|
| **LiteLLM Base URL** | Text input | `http://localhost:4000` | Strip trailing `/`. Required — empty value blocks generation. |
| **LiteLLM API Key** | Password input | (empty) | Optional. Uses existing Cancel/OK button pattern. If empty, request sends `Authorization: Bearer ` (empty token). |
| **Model Name** | Text input | (empty) | Free text, no dropdown. Placeholder: `ollama/llama3`. Required — empty value blocks generation. |

**No model search/dropdown** — unlike OpenAI/OpenRouter, there is no model list to fetch and display.

### 5.1 UI Rendering Flow

```
renderProviderSettings()
  └── provider === 'litellm'
        ├── render base URL input (direct save on change)
        ├── render API key input (Cancel/OK pattern)
        └── render model name input (direct save on change)
```

---

## 6. Data Flow

```
User selects "LiteLLM" in settings
  ↓
settings.ts renders Base URL, API Key, Model inputs
  ↓
User triggers title generation (command / file-menu / batch)
  ↓
main.ts → processSingleFile() → aiService.generateTitle()
  ↓
aiService.isConfigurationValid('litellm')
  ├── Base URL non-empty? ✓
  ├── Model non-empty? ✓
  └── API key optional — no check
  ↓
aiService.callAI() → strategies['litellm'].buildRequest()
  ├── Normalize base URL (strip trailing slash)
  ├── Build endpoint: {baseUrl}/v1/chat/completions
  ├── Build headers with Bearer token
  └── Build OpenAI-format body
  ↓
requestUrl(config) → LiteLLM server
  ↓
HTTP 200 → strategies['litellm'].parseResponse()
  └── Extract choices[0].message.content
  ↓
Title returned → main.ts → file rename / gist publish
```

---

## 7. Error Handling

| Scenario | Detection | User Feedback |
|----------|-----------|---------------|
| Base URL empty | `isConfigurationValid()` | Toast: "LiteLLM Base URL is not set" (8000ms) |
| Model name empty | `isConfigurationValid()` | Toast: "LiteLLM Model is not selected" (8000ms) |
| Invalid URL (non-http) | `normalizeCustomUrl()` returns empty | Request fails, toast shows API error with status |
| Server unreachable | `requestUrl` throws | Toast: "Title generation failed: ${message}" (5000ms) |
| HTTP 401 / 403 | `response.status !== 200` | Toast: "AI service error: API error (401): ..." (6000ms) |
| HTTP 404 (model not found) | `response.status !== 200` | Toast shows LiteLLM's error message (e.g., "Model not found") |
| Malformed response (no choices) | `parseResponse()` returns `''` | Empty title triggers refine attempt (up to 3x) |

All errors funnel through the existing `handleError()` method in `AIService`.

---

## 8. File Changes

### 8.1 `src/types.ts`
- Add `'litellm'` to `AIProvider` union type.
- Add `litellmBaseUrl: string`, `litellmApiKey: string`, `litellmModel: string` to `TitleGeneratorSettings`.

### 8.2 `src/settings.ts`
- Add `litellm` entry to `AI_PROVIDERS` record (`requiresApiKey: false`).
- Add default values to `DEFAULT_SETTINGS`.
- Update `renderModelSelection()` switch to include `litellm` → `litellmModel` mapping.
- Update `createModelSearchComponent()` switch to include `litellm` (or short-circuit since no model list).
- Update `hasValidConfiguration()` switch to validate `litellmBaseUrl` and `litellmModel` (API key optional).
- Add `litellm` branch in `renderProviderSettings()` to render:
  - Base URL text input
  - API key password input (Cancel/OK pattern)
  - Model name text input

### 8.3 `src/aiService.ts`
- Create `LiteLLMStrategy` class implementing `AIProviderStrategy`:
  - `buildRequest()`: normalize base URL, build OpenAI-format request to `{baseUrl}/v1/chat/completions`
  - `parseResponse()`: reuse `OpenAIResponse` parsing (same as `OpenAIStrategy.parseResponse`)
- Register `litellm: new LiteLLMStrategy()` in `AIService.strategies`.
- Update `isConfigurationValid()` to handle `litellm` provider.

---

## 9. Verification

No test suite exists. Verification is manual + build:

1. **`npm run build`** — TypeScript compilation must pass with zero errors (`tsc --noEmit --skipLibCheck`).
2. **Manual test — happy path:**
   - Set Base URL to a running LiteLLM instance (e.g., `http://localhost:4000`).
   - Set Model to a valid LiteLLM-routed model (e.g., `ollama/llama3`).
   - Generate a title → verify HTTP request hits `{baseUrl}/v1/chat/completions` with correct body.
3. **Manual test — no API key:**
   - Leave API Key empty.
   - Generate a title → verify request sends `Authorization: Bearer ` (empty token after space).
4. **Manual test — error handling:**
   - Set Base URL to non-existent server → verify toast shows connection error.
   - Set invalid model → verify LiteLLM error message appears in toast.

---

## 10. Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Base URL double-slash if user inputs trailing `/` | High | Strip trailing slash in `buildRequest()` using existing `normalizeCustomUrl()` logic. |
| Empty Bearer token causes 401 on servers that require auth | Medium | This is expected behavior — user must fill API Key if their server requires it. Error toast will guide them. |
| Model name typo / invalid model | Medium | LiteLLM returns 404 with descriptive message; existing error handling displays it. |
| TypeScript compilation fails due to union type expansion | Low | `npm run build` catches this before runtime. |

---

## 11. Out of Scope

The following are explicitly **not** included in this design:

- **Streaming / SSE** — The existing codebase uses synchronous `requestUrl`; adding streaming would require a new HTTP client infrastructure.
- **Model list fetching** — LiteLLM's `/v1/models` returns proxy-supported models, but the list varies by backend configuration. Free text input is simpler and more reliable.
- **LiteLLM-specific features** — Cost tracking, load balancing, rate limiting, and fallbacks are LiteLLM server-side concerns; the plugin treats it as a standard OpenAI-compatible endpoint.
- **Custom headers / extra body parameters** — No support for passing LiteLLM-specific metadata (e.g., `user`, `metadata`) in this iteration.

---

*End of design spec.*
