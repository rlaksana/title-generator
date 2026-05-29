# LiteLLM Provider Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add LiteLLM as a 6th AI provider strategy, with configurable base URL, optional API key, and free-text model name.

**Architecture:** Dedicated `LiteLLMStrategy` class that sends OpenAI-compatible chat completions requests to a user-configurable base URL. Reuses existing `OpenAIResponse` type for response parsing. Settings UI renders a simple text input for model name instead of the searchable dropdown (LiteLLM has no reliable model list endpoint).

**Tech Stack:** TypeScript, Obsidian Plugin API (`requestUrl`, `PluginSettingTab`)

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/types.ts` | Extend `AIProvider` union and `TitleGeneratorSettings` interface |
| `src/aiService.ts` | Add `LiteLLMStrategy` class; register in `AIService.strategies`; update validation |
| `src/settings.ts` | Add provider metadata, defaults, UI rendering, and validation for LiteLLM |

---

## Background: Existing Patterns to Follow

### Strategy Pattern (`src/aiService.ts`)
Each provider has a class implementing `AIProviderStrategy` with two methods:
- `buildRequest(prompt, content, settings)` → returns `ApiRequestConfig`
- `parseResponse(response)` → returns `string`

Strategies are registered in `AIService.strategies` record keyed by provider name.

### Settings Constants (`src/settings.ts`)
- `AI_PROVIDERS`: `Record<AIProvider, { name: string; requiresApiKey: boolean }>`
- `DEFAULT_SETTINGS`: must include every field from `TitleGeneratorSettings`
- `cachedModels` and `modelLoadingState` are typed as `Record<AIProvider, ...>` — must include an entry for every provider in the union

### Settings UI (`src/settings.ts`)
- `renderProviderSettings()` renders provider-specific inputs below the provider dropdown
- API key inputs use the Cancel/OK button pattern (3 components: text input, Cancel button, OK button)
- Direct-save inputs (text, dropdown) use `onChange` + `saveSettings()` without Cancel/OK
- `renderModelSelection()` renders a searchable model dropdown with a refresh button — **LiteLLM skips this** and uses a simple text input instead

### Validation (`src/aiService.ts`)
`isConfigurationValid()` checks that the selected provider has a non-empty API key (if required) and a non-empty model. LiteLLM requires base URL and model, but API key is optional.

---

## Task 1: Extend Types (`src/types.ts`)

**Files:**
- Modify: `src/types.ts`

**Prerequisite:** None.

- [ ] **Step 1: Add `'litellm'` to the `AIProvider` union type**

  Locate line 8. Change:
  ```typescript
  export type AIProvider = 'openai' | 'anthropic' | 'google' | 'openrouter' | 'kimi';
  ```
  To:
  ```typescript
  export type AIProvider = 'openai' | 'anthropic' | 'google' | 'openrouter' | 'kimi' | 'litellm';
  ```

- [ ] **Step 2: Add LiteLLM fields to `TitleGeneratorSettings`**

  Locate the `TitleGeneratorSettings` interface (around line 276). After the Kimi settings block (lines 294–296), add:
  ```typescript
  // LiteLLM Settings
  litellmBaseUrl: string;
  litellmApiKey: string;
  litellmModel: string;
  ```

  The full Kimi → LiteLLM block should look like:
  ```typescript
  // Kimi Settings
  kimiApiKey: string;
  kimiModel: string;

  // LiteLLM Settings
  litellmBaseUrl: string;
  litellmApiKey: string;
  litellmModel: string;
  ```

- [ ] **Step 3: Verify with TypeScript compilation**

  Run: `npm run build`
  Expected: **FAIL** — `DEFAULT_SETTINGS` is missing `litellm` entries for `cachedModels` and `modelLoadingState`. This is expected; Task 4 fixes it.

---

## Task 2: Create LiteLLM Strategy (`src/aiService.ts`)

**Files:**
- Modify: `src/aiService.ts`

**Prerequisite:** Task 1 (types compile).

- [ ] **Step 1: Add `LiteLLMStrategy` class after `OpenRouterStrategy`**

  Locate `OpenRouterStrategy` (ends around line 269). Insert the following class **after** `OpenRouterStrategy` and **before** the `AIService` class (which starts around line 275):

  ```typescript
  /**
   * LiteLLM Strategy Implementation
   * LiteLLM proxies multiple LLM backends through an OpenAI-compatible API.
   */
  class LiteLLMStrategy implements AIProviderStrategy {
    buildRequest(
      prompt: string,
      content: string,
      settings: TitleGeneratorSettings
    ): ApiRequestConfig {
      const fullPrompt = `${prompt}\n\n${content}`.trim();

      // Normalize base URL: trim whitespace and strip trailing slashes
      let baseUrl = settings.litellmBaseUrl.trim();
      if (baseUrl.endsWith('/')) {
        baseUrl = baseUrl.slice(0, -1);
      }

      const body: any = {
        model: settings.litellmModel,
        messages: [{ role: 'user', content: fullPrompt }],
        temperature: settings.temperature,
        max_tokens: settings.maxTitleLength * 4,
      };

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // Send Authorization header even if key is empty (local servers may ignore it)
      headers['Authorization'] = `Bearer ${settings.litellmApiKey}`;

      return {
        url: `${baseUrl}/v1/chat/completions`,
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      };
    }

    parseResponse(response: OpenAIResponse): string {
      return response.choices[0]?.message?.content?.trim() ?? '';
    }
  }
  ```

  > **Why not reuse `normalizeCustomUrl`?** That function returns `parsed.origin` which strips the path entirely. LiteLLM may be served behind a path prefix (e.g., `http://localhost:4000/proxy`), so we only strip the trailing slash, not the entire path.

- [ ] **Step 2: Register `LiteLLMStrategy` in `AIService.strategies`**

  Locate the `AIService` constructor (around line 279). Change:
  ```typescript
    this.strategies = {
      openai: new OpenAIStrategy(),
      anthropic: new AnthropicStrategy(),
      google: new GoogleStrategy(),
      openrouter: new OpenRouterStrategy(),
      kimi: new KimiStrategy(),
    };
  ```
  To:
  ```typescript
    this.strategies = {
      openai: new OpenAIStrategy(),
      anthropic: new AnthropicStrategy(),
      google: new GoogleStrategy(),
      openrouter: new OpenRouterStrategy(),
      kimi: new KimiStrategy(),
      litellm: new LiteLLMStrategy(),
    };
  ```

---

## Task 3: Update AI Service Validation (`src/aiService.ts`)

**Files:**
- Modify: `src/aiService.ts`

**Prerequisite:** Task 2.

- [ ] **Step 1: Add `litellm` to `isConfigurationValid()`**

  Locate `isConfigurationValid()` (around line 387). The `keys` object currently has 5 providers. Add the `litellm` entry:

  Change:
  ```typescript
      kimi: {
        key: settings.kimiApiKey,
        model: settings.kimiModel,
        name: 'Kimi',
      },
    };
  ```
  To:
  ```typescript
      kimi: {
        key: settings.kimiApiKey,
        model: settings.kimiModel,
        name: 'Kimi',
      },
      litellm: {
        key: settings.litellmApiKey,
        model: settings.litellmModel,
        name: 'LiteLLM',
      },
    };
  ```

- [ ] **Step 2: Change API key validation to allow empty keys for LiteLLM**

  Locate the API key check (around line 423):
  ```typescript
    if (!config.key.trim()) {
      new Notice(`${config.name} API key is not set.`, 8000);
      return false;
    }
  ```

  Change to:
  ```typescript
    if (!config.key.trim() && provider !== 'litellm') {
      new Notice(`${config.name} API key is not set.`, 8000);
      return false;
    }
  ```

  > LiteLLM local servers often run without authentication. The header is still sent (`Bearer ` with empty token), but the user is not blocked.

- [ ] **Step 3: Add base URL validation for LiteLLM**

  After the model check (around line 428):
  ```typescript
    if (!config.model) {
      new Notice(`${config.name} model is not selected.`, 8000);
      return false;
    }
  ```

  Add:
  ```typescript
    if (provider === 'litellm') {
      if (!settings.litellmBaseUrl.trim()) {
        new Notice('LiteLLM Base URL is not set.', 8000);
        return false;
      }
    }
  ```

---

## Task 4: Update Settings Constants (`src/settings.ts`)

**Files:**
- Modify: `src/settings.ts`

**Prerequisite:** Task 1.

- [ ] **Step 1: Add `litellm` to `AI_PROVIDERS`**

  Locate `AI_PROVIDERS` (around line 6). After the `kimi` entry, add:
  ```typescript
  litellm: {
    name: 'LiteLLM',
    requiresApiKey: false,
  },
  ```

  The full record should look like:
  ```typescript
  export const AI_PROVIDERS: Record<
    AIProvider,
    { name: string; requiresApiKey: boolean }
  > = {
    openai: { name: 'OpenAI', requiresApiKey: true },
    anthropic: { name: 'Anthropic', requiresApiKey: true },
    google: { name: 'Google Gemini', requiresApiKey: true },
    openrouter: { name: 'OpenRouter', requiresApiKey: true },
    kimi: { name: 'Kimi', requiresApiKey: true },
    litellm: { name: 'LiteLLM', requiresApiKey: false },
  };
  ```

- [ ] **Step 2: Add default values to `DEFAULT_SETTINGS`**

  Locate `DEFAULT_SETTINGS` (around line 32). After the `kimiModel` line, add:
  ```typescript
  // LiteLLM
  litellmBaseUrl: 'http://localhost:4000',
  litellmApiKey: '',
  litellmModel: '',
  ```

- [ ] **Step 3: Add `litellm` entries to `cachedModels` and `modelLoadingState`**

  Locate `cachedModels` (around line 60). Add `litellm` entry:
  ```typescript
  cachedModels: {
    openai: { models: [], lastUpdated: 0 },
    anthropic: { models: [], lastUpdated: 0 },
    google: { models: [], lastUpdated: 0 },
    openrouter: { models: [], lastUpdated: 0 },
    kimi: { models: [], lastUpdated: 0 },
    litellm: { models: [], lastUpdated: 0 },
  },
  ```

  Locate `modelLoadingState` (around line 67). Add `litellm` entry:
  ```typescript
  modelLoadingState: {
    openai: false,
    anthropic: false,
    google: false,
    openrouter: false,
    kimi: false,
    litellm: false,
  },
  ```

- [ ] **Step 4: Verify TypeScript compilation**

  Run: `npm run build`
  Expected: **PASS** — type errors from Task 1 should now be resolved.

---

## Task 5: Render LiteLLM Settings UI (`src/settings.ts`)

**Files:**
- Modify: `src/settings.ts`

**Prerequisite:** Task 4.

- [ ] **Step 1: Conditionally skip `renderModelSelection` for LiteLLM**

  Locate `renderProviderSettings()` (around line 375). Find the line:
  ```typescript
    this.renderProviderSettings(containerEl);
  ```
  Wait — actually the structure is:
  1. Provider dropdown
  2. `this.renderProviderSettings(containerEl)` — wait no, looking at the code it's `this.renderProviderSettings(containerEl)` AFTER the dropdown, but inside `renderProviderSettings` it calls `this.renderModelSelection`. Let me re-read.

  Actually looking at `display()` (line 123), after the provider dropdown it calls `this.renderProviderSettings(containerEl)` (line 191).

  Inside `renderProviderSettings()` (line 375):
  - API key input
  - `this.renderModelSelection(containerEl, provider, providerInfo)`
  - Provider-specific settings (Google thinking, Anthropic thinking, etc.)

  We need to change the model selection call to be conditional. Locate line 433:
  ```typescript
    // Model selection with reload button
    this.renderModelSelection(containerEl, provider, providerInfo);
  ```

  Change to:
  ```typescript
    // Model selection with reload button (LiteLLM uses free text input instead)
    if (provider === 'litellm') {
      this.renderLiteLLMModelInput(containerEl);
    } else {
      this.renderModelSelection(containerEl, provider, providerInfo);
    }
  ```

- [ ] **Step 2: Add `renderLiteLLMModelInput` method**

  Insert this new private method **after** `renderProviderSettings` (before `renderModelSelection`):

  ```typescript
  private renderLiteLLMModelInput(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName('Model')
      .setDesc('The LiteLLM model to use (e.g., ollama/llama3, bedrock/anthropic.claude-v3, gpt-4o).')
      .addText((text) => {
        text
          .setPlaceholder('ollama/llama3')
          .setValue(this.plugin.settings.litellmModel)
          .onChange(async (value) => {
            this.plugin.settings.litellmModel = value;
            await this.plugin.saveSettings();
          });
      });
  }
  ```

- [ ] **Step 3: Add LiteLLM-specific settings (Base URL + API Key)**

  Locate the end of `renderProviderSettings()` (around line 506, before the closing brace). After the OpenRouter settings block, add a new block for LiteLLM:

  ```typescript
    // LiteLLM specific settings
    if (provider === 'litellm') {
      new Setting(containerEl)
        .setName('LiteLLM Base URL')
        .setDesc('The base URL of your LiteLLM server. Trailing slashes will be stripped automatically.')
        .addText((text) => {
          text
            .setPlaceholder('http://localhost:4000')
            .setValue(this.plugin.settings.litellmBaseUrl)
            .onChange(async (value) => {
              this.plugin.settings.litellmBaseUrl = value;
              await this.plugin.saveSettings();
            });
        });

      // API Key input using Cancel/OK pattern
      let textEl: any, cancelBtn: any, okBtn: any;
      let initialValue = this.plugin.settings.litellmApiKey;
      let currentValue = initialValue;

      const apiKeySetting = new Setting(containerEl)
        .setName('LiteLLM API Key')
        .setDesc('Optional. Leave empty for local servers without authentication.');
      apiKeySetting.addText((text) => {
        textEl = text;
        text.inputEl.type = 'password';
        text
          .setPlaceholder('Optional')
          .setValue(initialValue)
          .onChange((value) => {
            currentValue = value;
            const changed = currentValue !== initialValue;
            cancelBtn.setDisabled(!changed);
            okBtn.setDisabled(!changed);
          });
      });
      apiKeySetting.addButton((btn) => {
        cancelBtn = btn;
        btn.setButtonText('Cancel').setDisabled(true).onClick(() => {
          textEl.setValue(initialValue);
          currentValue = initialValue;
          cancelBtn.setDisabled(true);
          okBtn.setDisabled(true);
        });
      });
      apiKeySetting.addButton((btn) => {
        okBtn = btn;
        btn.setButtonText('OK').setDisabled(true).onClick(async () => {
          this.plugin.settings.litellmApiKey = currentValue;
          await this.plugin.saveSettings();
          initialValue = currentValue;
          cancelBtn.setDisabled(true);
          okBtn.setDisabled(true);
        });
      });
    }
  ```

  > **Why put Base URL here instead of at the top?** `renderProviderSettings` is already called after the provider dropdown. Adding LiteLLM settings inside this method keeps them grouped with other provider-specific settings. The Base URL input renders above the model input because this block comes before the model selection call.

---

## Task 6: Update Settings Validation (`src/settings.ts`)

**Files:**
- Modify: `src/settings.ts`

**Prerequisite:** Task 5.

- [ ] **Step 1: Add `litellm` to `hasValidConfiguration()`**

  Locate `hasValidConfiguration()` (around line 739). Add a `litellm` case to the switch:

  Change:
  ```typescript
      case 'kimi':
        return !!settings.kimiApiKey.trim();
      default:
        return false;
  ```
  To:
  ```typescript
      case 'kimi':
        return !!settings.kimiApiKey.trim();
      case 'litellm':
        return !!settings.litellmBaseUrl.trim() && !!settings.litellmModel.trim();
      default:
        return false;
  ```

  > Note: API key is NOT checked for LiteLLM because it's optional. Only base URL and model are required.

---

## Task 7: Final Build Verification

**Files:**
- None (verification only)

**Prerequisite:** All previous tasks.

- [ ] **Step 1: Run TypeScript compilation**

  Run: `npm run build`
  Expected: **PASS** — zero TypeScript errors.

- [ ] **Step 2: Verify no runtime imports are broken**

  Run: `npm run build` (full build including esbuild)
  Expected: **PASS** — dist files generated successfully.

---

## Self-Review Checklist

### 1. Spec Coverage

| Spec Section | Implementing Task |
|--------------|-------------------|
| Add "LiteLLM" to provider dropdown | Task 4 (AI_PROVIDERS) |
| LiteLLM Base URL input with default `http://localhost:4000` | Task 5 (Base URL setting) |
| Strip trailing slash validation | Task 2 (buildRequest strips trailing `/`) |
| LiteLLM API Key input (password, optional) | Task 5 (API key setting with `type='password'`) |
| Model Name free text input | Task 5 (renderLiteLLMModelInput) |
| Endpoint `{Base_URL}/v1/chat/completions` | Task 2 (LiteLLMStrategy.buildRequest) |
| Headers: `Content-Type`, `Authorization: Bearer {key}` | Task 2 (headers in buildRequest) |
| Payload: model, messages, temperature | Task 2 (body in buildRequest) |
| Non-streaming response: `choices[0].message.content` | Task 2 (parseResponse) |
| CORS-safe via `requestUrl` | Task 2 (returns ApiRequestConfig for requestUrl) |
| Error handling: toast for non-200 | Inherited from existing `callAI` → `handleError` flow |
| **Out of scope: streaming** | Not implemented (as designed) |

**Coverage: Complete. No gaps.**

### 2. Placeholder Scan

- [x] No "TBD", "TODO", or "implement later"
- [x] No vague instructions like "add appropriate error handling"
- [x] No "write tests for the above" without test code (no test suite exists)
- [x] No "Similar to Task N" references
- [x] Every code-changing step includes the actual code

### 3. Type Consistency

- [x] Property names consistent across all files:
  - `litellmBaseUrl` — used in `types.ts`, `aiService.ts`, `settings.ts`
  - `litellmApiKey` — used in `types.ts`, `aiService.ts`, `settings.ts`
  - `litellmModel` — used in `types.ts`, `aiService.ts`, `settings.ts`
- [x] `AIProvider` union includes `'litellm'` — used in `types.ts`, referenced implicitly in `settings.ts` and `aiService.ts`
- [x] `requiresApiKey: false` for `litellm` — consistent with optional key handling in Task 3 and Task 6

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-29-litellm-provider.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
