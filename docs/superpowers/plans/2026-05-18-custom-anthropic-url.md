# Custom Anthropic URL — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to set a custom base URL for the Anthropic provider, enabling proxies, gateways, or self-hosted endpoints. Falls back to the default `https://api.anthropic.com` when not set.

**Architecture:** Extend the existing `AnthropicStrategy` with a URL override from settings. A shared `normalizeCustomUrl()` helper (in `aiService.ts`) trims whitespace, strips trailing slashes, and validates http/https scheme before use. Both `buildRequest()` and `queryAnthropicModels()` use this helper to construct the base URL.

**Tech Stack:** TypeScript, Obsidian plugin API, existing Strategy Pattern

---

## Task 1: Add `customAnthropicUrl` to `TitleGeneratorSettings`

**Files:**
- Modify: `src/types.ts:268-319` (the `TitleGeneratorSettings` interface)

- [ ] **Step 1: Add field to interface**

Find `openRouterApiKey: string;` (line ~282) and add after it:
```typescript
customAnthropicUrl: string;
```

---

## Task 2: Add `customAnthropicUrl` to `DEFAULT_SETTINGS`

**Files:**
- Modify: `src/settings.ts:28-98` (the `DEFAULT_SETTINGS` constant)

- [ ] **Step 1: Add to DEFAULT_SETTINGS**

Find `openRouterApiKey: ''` (line ~34) and add after it:
```typescript
customAnthropicUrl: '',
```

---

## Task 3: Add URL input to settings UI

**Files:**
- Modify: `src/settings.ts:448-480` (inside `renderProviderSettings()`, in the `if (provider === 'anthropic')` block)

- [ ] **Step 1: Add URL input field after API key section**

In `renderProviderSettings()`, inside the `if (provider === 'anthropic')` block (after line 479, before the closing `}`), add:

```typescript
new Setting(containerEl)
  .setName('Custom API URL')
  .setDesc('Override the Anthropic API base URL (e.g., for proxies). Leave empty for default.')
  .addText((text) => {
    text
      .setPlaceholder('https://api.anthropic.com')
      .setValue(this.plugin.settings.customAnthropicUrl)
      .onChange(async (value) => {
        this.plugin.settings.customAnthropicUrl = value;
        await this.plugin.saveSettings();
      });
  });
```

---

## Task 4: Add URL normalization helper

**Files:**
- Modify: `src/aiService.ts` (anywhere at module scope, before the class definitions)

- [ ] **Step 1: Add normalizeCustomUrl helper**

At the top of `src/aiService.ts` (after imports, before the `OpenAIStrategy` class), add:

```typescript
/**
 * Normalize a custom Anthropic base URL: trim whitespace, strip trailing slashes.
 * Returns empty string if the input is falsy or invalid (non-http scheme).
 */
function normalizeCustomUrl(url: string): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    return parsed.origin; // strips path, query, hash, and trailing slash
  } catch {
    return '';
  }
}
```

This helper is placed in `aiService.ts` so it can be imported into `modelService.ts` — keeping URL normalization logic in one place.

- [ ] **Step 2: Export helper from aiService.ts**

Export the function so `modelService.ts` can use it:
```typescript
export function normalizeCustomUrl(url: string): string {
  // ... (same implementation as above)
}
```

---

## Task 5: Update `AnthropicStrategy.buildRequest()` to use normalized URL

**Files:**
- Modify: `src/aiService.ts:72-119` (`AnthropicStrategy.buildRequest()`)

- [ ] **Step 1: Use normalized URL in return statement**

Find the `return { url: 'https://api.anthropic.com/v1/messages', ... }` block inside `buildRequest()`. Replace:

```typescript
url: 'https://api.anthropic.com/v1/messages',
```
with:
```typescript
url: `${normalizeCustomUrl(settings.customAnthropicUrl) || 'https://api.anthropic.com'}/v1/messages`,
```

The `isReasoningModel` detection only inspects the model name string — no URL change needed there.

---

## Task 6: Update `queryAnthropicModels()` to use normalized URL

**Files:**
- Modify: `src/modelService.ts` (imports section)
- Modify: `src/modelService.ts:125-154` (`queryAnthropicModels()`)

- [ ] **Step 1: Import normalizeCustomUrl**

At the top of `modelService.ts`, add an import:
```typescript
import { normalizeCustomUrl } from './aiService';
```

- [ ] **Step 2: Use normalized URL in queryAnthropicModels()**

At the start of `queryAnthropicModels()`, replace the hardcoded URL:
```typescript
const response = await requestUrl({
  url: 'https://api.anthropic.com/v1/models',
```
with:
```typescript
const baseUrl = normalizeCustomUrl(settings.customAnthropicUrl) || 'https://api.anthropic.com';
const response = await requestUrl({
  url: `${baseUrl}/v1/models`,
```

---

## Task 7: Verify build

- [ ] **Step 1: Run build**

```bash
npm run build
```

Expected: no errors, `dist/` updated

---

## Task 8: Commit

```bash
git add src/types.ts src/settings.ts src/aiService.ts src/modelService.ts
git commit -m "$(cat <<'EOF'
feat: add custom Anthropic URL override

Allows setting a proxy or custom endpoint for the Anthropic
provider. Falls back to api.anthropic.com when not configured.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Checklist

- [ ] `customAnthropicUrl` added to both `TitleGeneratorSettings` interface and `DEFAULT_SETTINGS`?
- [ ] `normalizeCustomUrl()` helper added and exported from `aiService.ts`?
- [ ] `AnthropicStrategy.buildRequest()` uses `normalizeCustomUrl()` for URL construction?
- [ ] `queryAnthropicModels()` imports `normalizeCustomUrl` and uses it for URL construction?
- [ ] Settings UI shows URL input only when `provider === 'anthropic'`?
- [ ] No placeholder/TODO in the plan?
- [ ] Build passes?
