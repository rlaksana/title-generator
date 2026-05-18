# Custom Anthropic URL — Design Spec

## Context

Allow users to configure a custom base URL for the Anthropic provider. This enables use with:
- Proxies or API gateways that forward to Anthropic
- Self-hosted Anthropic-compatible endpoints (e.g., local proxies)
- Regional or custom endpoint infrastructure

When no custom URL is set, the plugin uses the default `https://api.anthropic.com`.

## Changes

### 1. `src/types.ts`

Add `customAnthropicUrl: ''` to `TitleGeneratorSettings` interface.

### 2. `src/settings.ts`

When `aiProvider === 'anthropic'`, render an additional text input field for the custom URL. Persist via `settings.customAnthropicUrl`.

### 3. `src/aiService.ts`

In `AnthropicStrategy.buildRequest()`: if `settings.customAnthropicUrl` is set and non-empty, replace the base URL (`https://api.anthropic.com`) with the custom URL. The path `/v1/messages` remains the same.

### 4. `src/modelService.ts`

In `queryAnthropicModels()`: if `settings.customAnthropicUrl` is set, query `{customAnthropicUrl}/v1/models` instead of `https://api.anthropic.com/v1/models`. On any failure, cache the error — the existing settings UI already falls back to free-text model input when the model list is empty and an error is cached.

### 5. `DEFAULT_SETTINGS` in `settings.ts`

Add `customAnthropicUrl: ''` as a default.

## Data Flow

```
User fills custom URL → saveSettings()
  → user triggers model refresh → modelService.refreshModels('anthropic')
    → queryAnthropicModels(url=customUrl or default)
      → success: populate dropdown
      → failure: cache error → settings shows "Click refresh to load models"
        → user types model name manually in the search input
```

## Verification

- `npm run build` passes
- Existing `anthropic` provider works unchanged when `customAnthropicUrl` is empty (default)
- Custom URL is used only when explicitly set and non-empty
