import { App, PluginSettingTab, TextComponent } from 'obsidian';
import type { AIProvider, TitleGeneratorSettings } from './types';
import type TitleGeneratorPlugin from './main';
import { ModelService } from './modelService';
import { updateLoggerConfig } from './logger';

export const AI_PROVIDERS: Record<
  AIProvider,
  { name: string; requiresApiKey: boolean }
> = {
  openai: {
    name: 'OpenAI',
    requiresApiKey: true,
  },
  anthropic: {
    name: 'Anthropic',
    requiresApiKey: true,
  },
  google: {
    name: 'Google Gemini',
    requiresApiKey: true,
  },
  openrouter: {
    name: 'OpenRouter',
    requiresApiKey: true,
  },
  kimi: {
    name: 'Kimi',
    requiresApiKey: true,
  },
  litellm: {
    name: 'LiteLLM',
    requiresApiKey: false,
  },
  minimax: {
    name: 'MiniMax',
    requiresApiKey: true,
  },
};

export const DEFAULT_SETTINGS: TitleGeneratorSettings = {
  // Provider
  aiProvider: 'openai',
  openAiApiKey: '',
  anthropicApiKey: '',
  googleApiKey: '',
  openRouterApiKey: '',
  customAnthropicUrl: '',
  kimiApiKey: '',

  // Models
  openAiModel: 'gpt-5.5',
  anthropicModel: 'claude-sonnet-4-6-20251001',
  googleModel: 'gemini-3.5-flash',
  openRouterModel: 'openai/gpt-5.5',
  kimiModel: 'kimi-for-coding',

  // LiteLLM
  litellmBaseUrl: 'http://localhost:4000',
  litellmApiKey: '',
  litellmModel: '',

  // MiniMax
  minimaxApiKey: '',
  minimaxModel: 'MiniMax-M2.7-highspeed',

  // Google Thinking Settings
  googleThinkingLevel: 'OFF',

  // Anthropic Thinking Settings
  anthropicThinkingEnabled: true,
  anthropicThinkingBudget: 1024,

  // OpenRouter Thinking Settings
  openRouterReasoningEnabled: true,

  // Dynamic Model Caching
  cachedModels: {
    openai: { models: [], lastUpdated: 0 },
    anthropic: { models: [], lastUpdated: 0 },
    google: { models: [], lastUpdated: 0 },
    openrouter: { models: [], lastUpdated: 0 },
    kimi: { models: [], lastUpdated: 0 },
    litellm: { models: [], lastUpdated: 0 },
    minimax: { models: [], lastUpdated: 0 },
  },
  modelLoadingState: {
    openai: false,
    anthropic: false,
    google: false,
    openrouter: false,
    kimi: false,
    litellm: false,
    minimax: false,
  },

  // Title
  lowerCaseTitles: false,
  removeForbiddenChars: true,
  /** Enable detailed console log output for debugging */
  debugMode: false,

  // Prompt and Content
  customPrompt:
    'Create a concise title for this text. Respond with ONLY the title - no explanations, quotes, or extra text. Maximum {max_length} characters.',
  refinePrompt:
    'Make this title shorter (under {max_length} characters): "{title}". Respond with ONLY the new title.',
  temperature: 0.3,
  maxTitleLength: 60,
  maxContentLength: 2000,
  maxOutputTokens: 8192,

  // GFM Reformatting Settings
  enableGfmReformatting: false,
  stripCitations: true,
  cleanQAPrefix: false,
  gfmPrompt:
    'You are a GitHub Flavored Markdown (GFM) formatter. Transform the following content to be fully GFM-compliant:\n' +
    '- Use fenced code blocks (```) with language hints instead of indented code\n' +
    '- Ensure tables use proper GFM syntax with alignment (|:---|:---:|---:)\n' +
    '- Normalize task lists to - [ ] and - [x]\n' +
    '- Convert <del> tags to ~~strikethrough~~\n' +
    '- Ensure URLs are properly formatted for auto-linking\n' +
    '- Remove any HTML tags that are not allowed in Gist\n\n' +
    'CRITICAL: Output ONLY the transformed content. Do NOT repeat these instructions. Do NOT include the original prompt. Do NOT add explanations.',

  // Gist Auto-Share Settings
  enableGistAutoShare: false,
  githubPat: '',
  gistFileMap: {},
};

/* ============================================================
 * Settings UI — Forge Settings Redesign
 * Dark palette + 4-tab layout (Provider / Prompt / Output / Gist),
 * section cards with label-desc rows. Follows the approved design:
 * C:\Users\Richard\Downloads\Forge Settings Redesign.html
 * ============================================================ */

type TabId = 'provider' | 'prompt' | 'output' | 'gist';

const svg = (inner: string): string =>
  `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

// Compile-time SVG constants only — injected via innerHTML, never fed by
// user or external input (XSS-safe by construction).
const ICONS = {
  provider: svg(
    '<rect x="4" y="4" width="8" height="8" rx="1"></rect><path d="M6.5 1.5v2.5M9.5 1.5v2.5M6.5 12v2.5M9.5 12v2.5M1.5 6.5H4M1.5 9.5H4M12 6.5h2.5M12 9.5h2.5"></path>'
  ),
  prompt: svg('<path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z"></path>'),
  output: svg(
    '<path d="M4 1.5h5.5l3 3v10H4z"></path><path d="M9.5 1.5v3h3M6 8.5h4M6 11h4"></path>'
  ),
  gist: svg(
    '<circle cx="4" cy="8" r="1.8"></circle><circle cx="12" cy="4" r="1.8"></circle><circle cx="12" cy="12" r="1.8"></circle><path d="M5.6 7l4.8-2.2M5.6 9l4.8 2.2"></path>'
  ),
  eye: svg(
    '<path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"></path><circle cx="8" cy="8" r="2"></circle>'
  ),
  refresh: svg(
    '<path d="M13 2.5v3.5h-3.5M3 13.5V10h3.5M12.4 6A5 5 0 0 0 3.6 5M3.6 10a5 5 0 0 0 8.8 1"></path>'
  ),
  reset: svg('<path d="M3 2.5v3.5h3.5M3.6 6A5 5 0 1 1 3 8"></path>'),
  check: svg('<path d="M3 8.5l3.2 3L13 4.5"></path>'),
  warn: svg(
    '<path d="M8 2l6.5 11.5h-13z"></path><path d="M8 6.5v3M8 11.6v.01"></path>'
  ),
};

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'provider', label: 'Provider', icon: ICONS.provider },
  { id: 'prompt', label: 'Prompt', icon: ICONS.prompt },
  { id: 'output', label: 'Output', icon: ICONS.output },
  { id: 'gist', label: 'Gist', icon: ICONS.gist },
];

const FORGE_CSS = `
.forge-settings { color: #e8e8e8; }
.forge-settings .fs-header .fs-title { font-size: 22px; font-weight: 600; color: #ffffff; }
.forge-settings .fs-header .fs-sub { font-size: 13px; color: #a3a3a3; margin-top: 4px; }
.forge-settings .fs-tabs { display: flex; gap: 4px; border-bottom: 1px solid #333333; margin-top: 16px; }
.forge-settings .fs-tab { display: inline-flex; align-items: center; gap: 8px; padding: 10px 16px; background: transparent; border: 0; border-bottom: 2px solid transparent; margin-bottom: -1px; color: #a3a3a3; font-family: inherit; font-size: 14px; font-weight: 500; cursor: pointer; }
.forge-settings .fs-tab.active { border-bottom-color: #8b6cef; color: #ffffff; }
.forge-settings .fs-section-head { margin: 24px 0 10px 2px; }
.forge-settings .fs-section-title { font-size: 14px; font-weight: 600; color: #ffffff; }
.forge-settings .fs-section-desc { font-size: 12.5px; color: #a3a3a3; margin-top: 2px; }
.forge-settings .fs-card { border: 1px solid #303030; border-radius: 10px; padding: 0 20px; background: #232323; }
.forge-settings .fs-row { display: flex; align-items: center; justify-content: space-between; gap: 28px; padding: 14px 0; border-top: 1px solid #303030; }
.forge-settings .fs-row:first-child, .forge-settings .fs-row-block:first-child { border-top: 0; }
.forge-settings .fs-row-block { padding: 14px 0; border-top: 1px solid #303030; }
.forge-settings .fs-name { font-size: 14px; color: #e8e8e8; font-weight: 500; }
.forge-settings .fs-desc { font-size: 12.5px; color: #a3a3a3; margin-top: 3px; line-height: 1.45; }
.forge-settings .fs-ctl { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
.forge-settings .fs-input, .forge-settings .fs-select { height: 32px; box-sizing: border-box; background: #1a1a1a; border: 1px solid #3d3d3d; border-radius: 6px; color: #e8e8e8; font-size: 13px; padding: 0 10px; font-family: inherit; }
.forge-settings .fs-mono { font-family: 'Cascadia Code', Consolas, 'SF Mono', monospace; }
.forge-settings textarea.fs-textarea { display: block; width: 100%; box-sizing: border-box; margin-top: 10px; min-height: 112px; background: #1a1a1a; border: 1px solid #3d3d3d; border-radius: 6px; color: #e8e8e8; font-family: 'Cascadia Code', Consolas, 'SF Mono', monospace; font-size: 12.5px; line-height: 1.55; padding: 10px 12px; resize: vertical; }
.forge-settings .fs-switch { position: relative; width: 40px; height: 22px; border-radius: 11px; background: #3d3d3d; border: 0; padding: 0; cursor: pointer; flex: 0 0 auto; }
.forge-settings .fs-switch::after { content: ''; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: #ffffff; transition: left 0.15s; }
.forge-settings .fs-switch.on { background: #8b6cef; }
.forge-settings .fs-switch.on::after { left: 21px; }
.forge-settings .fs-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; background: #2c2c2c; border: 1px solid #3d3d3d; border-radius: 6px; color: #cfcfcf; cursor: pointer; padding: 0; flex: 0 0 auto; }
.forge-settings .fs-chip { font-family: 'Cascadia Code', Consolas, 'SF Mono', monospace; font-size: 12px; color: #d6ccff; background: #2c2c2c; border: 1px solid #4a4170; border-radius: 5px; padding: 3px 8px; cursor: pointer; }
.forge-settings .fs-warn { display: flex; gap: 10px; align-items: flex-start; margin: 0 0 14px; padding: 10px 12px; border: 1px solid #6b4f24; border-radius: 8px; background: #2b2418; color: #ebcf9c; font-size: 12.5px; line-height: 1.5; }
.forge-settings .fs-warn span.fs-warn-icon { display: inline-flex; margin-top: 1px; flex: 0 0 auto; }
.forge-settings .fs-footer { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: #a3a3a3; margin-top: 24px; }
.forge-settings .fs-footer .fs-check { color: #5fc58a; display: inline-flex; }
.forge-settings input[type='range'] { accent-color: #8b6cef; width: 150px; }
.forge-settings .fs-val { font-size: 13px; color: #e8e8e8; width: 34px; text-align: right; font-variant-numeric: tabular-nums; }
.forge-settings .fs-num { width: 110px; text-align: right; font-variant-numeric: tabular-nums; }
.forge-settings .fs-unit { font-size: 12.5px; color: #a3a3a3; width: 52px; }
.forge-settings .model-search-container { width: 230px; flex: 0 0 auto; position: relative; }
.forge-settings .model-search-container input { height: 32px; box-sizing: border-box; background: #1a1a1a; border: 1px solid #3d3d3d; border-radius: 6px; color: #e8e8e8; font-size: 13px; padding: 0 10px; font-family: 'Cascadia Code', Consolas, 'SF Mono', monospace; width: 100%; }
`;

export class TitleGeneratorSettingTab extends PluginSettingTab {
  plugin: TitleGeneratorPlugin;
  modelService: ModelService;
  private activeTab: TabId = 'provider';

  constructor(app: App, plugin: TitleGeneratorPlugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.modelService = new ModelService(
      () => this.plugin.settings,
      () => this.plugin.saveSettings()
    );
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    const root = containerEl.createDiv('forge-settings');
    root.createEl('style', { text: FORGE_CSS });

    // Header
    const header = root.createDiv('fs-header');
    header.createDiv({ cls: 'fs-title', text: 'Forge' });
    header.createDiv({
      cls: 'fs-sub',
      text: 'Buat judul catatan otomatis dengan AI.',
    });

    // Tab bar
    const tabsEl = root.createDiv('fs-tabs');
    const contentEl = root.createDiv('fs-content');
    const renderActiveTab = () => {
      contentEl.empty();
      switch (this.activeTab) {
        case 'provider':
          this.renderProviderTab(contentEl);
          break;
        case 'prompt':
          this.renderPromptTab(contentEl);
          break;
        case 'output':
          this.renderOutputTab(contentEl);
          break;
        case 'gist':
          this.renderGistTab(contentEl);
          break;
      }
    };
    for (const tab of TABS) {
      const btn = tabsEl.createEl('button', { cls: 'fs-tab' });
      if (tab.id === this.activeTab) btn.addClass('active');
      // icons are static SVG constants — textContent would escape the markup
      btn.createSpan().innerHTML = tab.icon;
      btn.createSpan({ text: tab.label });
      btn.addEventListener('click', () => {
        this.activeTab = tab.id;
        renderActiveTab();
        tabsEl.querySelectorAll('.fs-tab').forEach((b) => b.removeClass('active'));
        btn.addClass('active');
      });
    }

    renderActiveTab();

    // Footer
    const footer = root.createDiv('fs-footer');
    footer.createSpan({ cls: 'fs-check' }).innerHTML = ICONS.check;
    footer.createSpan({ text: 'Perubahan tersimpan otomatis.' });
  }

  /* ---------- shared builders ---------- */

  private section(
    container: HTMLElement,
    title: string,
    desc?: string
  ): HTMLElement {
    const head = container.createDiv('fs-section-head');
    head.createDiv({ cls: 'fs-section-title', text: title });
    if (desc) head.createDiv({ cls: 'fs-section-desc', text: desc });
    return container.createDiv('fs-card');
  }

  private row(
    card: HTMLElement,
    name: string,
    desc?: string
  ): { ctl: HTMLElement; nameEl: HTMLElement } {
    const rowEl = card.createDiv('fs-row');
    const text = rowEl.createDiv();
    text.createDiv({ cls: 'fs-name', text: name });
    if (desc) text.createDiv({ cls: 'fs-desc', text: desc });
    return { ctl: rowEl.createDiv('fs-ctl'), nameEl: text };
  }

  private rowBlock(
    card: HTMLElement,
    name: string,
    desc?: string
  ): HTMLElement {
    const rowEl = card.createDiv('fs-row-block');
    rowEl.createDiv({ cls: 'fs-name', text: name });
    if (desc) rowEl.createDiv({ cls: 'fs-desc', text: desc });
    return rowEl;
  }

  private mkSelect(
    ctl: HTMLElement,
    width: number,
    options: Record<string, string>,
    value: string,
    onChange: (value: string) => void
  ): HTMLSelectElement {
    const select = ctl.createEl('select', { cls: 'fs-select' });
    select.style.width = `${width}px`;
    for (const [key, label] of Object.entries(options)) {
      select.add(new Option(label, key));
    }
    select.value = value;
    select.addEventListener('change', () => onChange(select.value));
    return select;
  }

  private mkInput(
    ctl: HTMLElement,
    opts: {
      width: number;
      value: string;
      onChange: (value: string) => void;
      mono?: boolean;
      password?: boolean;
      numeric?: boolean;
      placeholder?: string;
      cls?: string;
    }
  ): HTMLInputElement {
    const input = ctl.createEl('input', { cls: 'fs-input' });
    if (opts.cls) input.addClass(opts.cls);
    if (opts.mono) input.addClass('fs-mono');
    input.type = opts.password ? 'password' : 'text';
    if (opts.numeric) input.inputMode = 'numeric';
    input.style.width = `${opts.width}px`;
    if (opts.placeholder) input.placeholder = opts.placeholder;
    input.value = opts.value;
    input.addEventListener('input', () => opts.onChange(input.value));
    return input;
  }

  private mkNumericInput(
    ctl: HTMLElement,
    value: number,
    onChange: (value: number) => void
  ): HTMLInputElement {
    return this.mkInput(ctl, {
      width: 110,
      value: value.toString(),
      numeric: true,
      cls: 'fs-num',
      onChange: (v) => {
        const parsed = parseInt(v, 10);
        if (!isNaN(parsed)) onChange(parsed);
      },
    });
  }

  private mkEye(ctl: HTMLElement, input: HTMLInputElement): void {
    const btn = ctl.createEl('button', { cls: 'fs-icon-btn' });
    btn.setAttribute('aria-label', 'Tampilkan atau sembunyikan');
    btn.innerHTML = ICONS.eye;
    btn.addEventListener('click', () => {
      input.type = input.type === 'password' ? 'text' : 'password';
    });
  }

  private mkSwitch(
    ctl: HTMLElement,
    name: string,
    on: boolean,
    onChange: (value: boolean) => void
  ): void {
    const btn = ctl.createEl('button', { cls: 'fs-switch' });
    btn.setAttribute('role', 'switch');
    btn.setAttribute('aria-label', name);
    if (on) btn.addClass('on');
    btn.addEventListener('click', () => {
      const next = !btn.hasClass('on');
      btn.toggleClass('on', next);
      btn.setAttribute('aria-checked', String(next));
      onChange(next);
    });
  }

  private mkIconBtn(
    ctl: HTMLElement,
    icon: string,
    label: string,
    onClick: () => void
  ): HTMLButtonElement {
    const btn = ctl.createEl('button', { cls: 'fs-icon-btn' });
    btn.setAttribute('aria-label', label);
    btn.innerHTML = icon;
    btn.addEventListener('click', onClick);
    return btn;
  }

  private mkTextarea(
    block: HTMLElement,
    value: string,
    onChange: (value: string) => void
  ): HTMLTextAreaElement {
    const ta = block.createEl('textarea', { cls: 'fs-textarea' });
    ta.rows = 5;
    ta.value = value;
    ta.addEventListener('input', () => onChange(ta.value));
    return ta;
  }

  private mkChips(
    block: HTMLElement,
    vars: string[],
    ta: HTMLTextAreaElement
  ): void {
    const chipRow = block.createDiv();
    chipRow.style.display = 'flex';
    chipRow.style.alignItems = 'center';
    chipRow.style.gap = '8px';
    chipRow.style.marginTop = '10px';
    chipRow.createSpan({
      cls: 'fs-desc',
      text: 'Sisipkan di kursor:',
    });
    for (const v of vars) {
      const chip = chipRow.createEl('button', { cls: 'fs-chip', text: v });
      chip.addEventListener('click', () => {
        const start = ta.selectionStart ?? ta.value.length;
        const end = ta.selectionEnd ?? start;
        ta.setRangeText(v, start, end, 'end');
        ta.dispatchEvent(new Event('input'));
        ta.focus();
      });
    }
  }

  private save = async (): Promise<void> => {
    await this.plugin.saveSettings();
  };

  /* ---------- tabs ---------- */

  private renderProviderTab(container: HTMLElement): void {
    const s = this.plugin.settings;
    const provider = s.aiProvider;
    const providerInfo = AI_PROVIDERS[provider];

    // --- Layanan AI ---
    const card = this.section(
      container,
      'Layanan AI',
      'Dipakai untuk membuat judul catatan.'
    );

    const providerRow = this.row(card, 'Provider', 'Layanan AI yang membuat judul.');
    this.mkSelect(
      providerRow.ctl,
      170,
      Object.fromEntries(
        Object.entries(AI_PROVIDERS).map(([key, p]) => [key, p.name])
      ),
      provider,
      async (value) => {
        s.aiProvider = value as AIProvider;
        await this.save();
        this.display(); // swap provider-specific rows
      }
    );

    if (providerInfo.requiresApiKey) {
      const keyName =
        provider === 'openai'
          ? 'openAiApiKey'
          : provider === 'openrouter'
            ? 'openRouterApiKey'
            : (`${provider}ApiKey` as keyof TitleGeneratorSettings);
      const keyRow = this.row(
        card,
        'API key',
        'Disimpan di data.json plugin, tidak terenkripsi.'
      );
      const keyInput = this.mkInput(keyRow.ctl, {
        width: 230,
        value: s[keyName] as string,
        password: true,
        mono: true,
        placeholder: 'Enter API key',
        onChange: async (v) => {
          (s as any)[keyName] = v;
          await this.save();
        },
      });
      this.mkEye(keyRow.ctl, keyInput);
    }

    // Model row (LiteLLM uses a free-text model, others use search + refresh)
    if (provider === 'litellm') {
      const modelRow = this.row(
        card,
        'Model',
        'Model LiteLLM (mis. ollama/llama3, bedrock/anthropic.claude-v3, gpt-4o).'
      );
      this.mkInput(modelRow.ctl, {
        width: 230,
        value: s.litellmModel,
        mono: true,
        placeholder: 'ollama/llama3',
        onChange: async (v) => {
          s.litellmModel = v;
          await this.save();
        },
      });
    } else {
      const cachedInfo = this.modelService.getCachedInfo(provider);
      let desc = 'Model yang dipakai untuk membuat judul.';
      if (cachedInfo?.error) {
        desc += ` Gagal memuat: ${cachedInfo.error}`;
      } else if (cachedInfo && cachedInfo.models.length > 0) {
        desc = `${cachedInfo.models.length} model tersedia · diperbarui ${this.getTimeAgo(new Date(cachedInfo.lastUpdated))}.`;
      }
      const modelRow = this.row(card, 'Model', desc);
      const searchWrap = modelRow.ctl.createDiv('model-search-container');
      this.createModelSearchComponent(searchWrap, provider);
      const refreshBtn = this.mkIconBtn(
        modelRow.ctl,
        ICONS.refresh,
        'Muat ulang daftar model',
        async () => {
          refreshBtn.style.opacity = '0.5';
          try {
            await this.modelService.refreshModels(provider);
            this.display();
          } catch (error) {
            console.error('Failed to reload models:', error);
          }
        }
      );
    }

    // Provider-specific rows
    if (provider === 'google') {
      const thinkRow = this.row(
        card,
        'Tingkat berpikir',
        'Lebih tinggi = judul lebih akurat, tetapi lebih lambat dan mahal. Hanya untuk Gemini 3.'
      );
      this.mkSelect(
        thinkRow.ctl,
        130,
        { OFF: 'Mati', LOW: 'Rendah', MEDIUM: 'Sedang', HIGH: 'Tinggi' },
        s.googleThinkingLevel,
        async (value) => {
          s.googleThinkingLevel = value as 'OFF' | 'LOW' | 'MEDIUM' | 'HIGH';
          await this.save();
        }
      );
    }

    if (provider === 'anthropic') {
      const thinkRow = this.row(
        card,
        'Extended thinking',
        'Aktifkan reasoning untuk model Claude 4.5+.'
      );
      this.mkSwitch(
        thinkRow.ctl,
        'Extended thinking',
        s.anthropicThinkingEnabled,
        async (value) => {
          s.anthropicThinkingEnabled = value;
          await this.save();
          this.display();
        }
      );
      if (s.anthropicThinkingEnabled) {
        const budgetRow = this.row(
          card,
          'Thinking budget',
          'Maksimum token untuk reasoning.'
        );
        this.mkNumericInput(budgetRow.ctl, s.anthropicThinkingBudget, async (v) => {
          s.anthropicThinkingBudget = v;
          await this.save();
        });
      }
      const urlRow = this.row(
        card,
        'Custom API URL',
        'Ganti base URL Anthropic (mis. untuk proxy). Kosongkan untuk default.'
      );
      this.mkInput(urlRow.ctl, {
        width: 230,
        value: s.customAnthropicUrl,
        mono: true,
        placeholder: 'https://api.anthropic.com',
        onChange: async (v) => {
          s.customAnthropicUrl = v;
          await this.save();
        },
      });
    }

    if (provider === 'openrouter') {
      const reasonRow = this.row(
        card,
        'Reasoning',
        'Aktifkan reasoning untuk model OpenRouter yang mendukung.'
      );
      this.mkSwitch(
        reasonRow.ctl,
        'Reasoning',
        s.openRouterReasoningEnabled,
        async (value) => {
          s.openRouterReasoningEnabled = value;
          await this.save();
        }
      );
    }

    if (provider === 'litellm') {
      const urlRow = this.row(
        card,
        'LiteLLM Base URL',
        'Base URL server LiteLLM. Trailing slash dihapus otomatis.'
      );
      this.mkInput(urlRow.ctl, {
        width: 230,
        value: s.litellmBaseUrl,
        mono: true,
        placeholder: 'http://localhost:4000',
        onChange: async (v) => {
          s.litellmBaseUrl = v;
          await this.save();
        },
      });
      const keyRow = this.row(
        card,
        'LiteLLM API key',
        'Opsional. Kosongkan untuk server lokal tanpa autentikasi.'
      );
      const keyInput = this.mkInput(keyRow.ctl, {
        width: 230,
        value: s.litellmApiKey,
        password: true,
        mono: true,
        placeholder: 'Opsional',
        onChange: async (v) => {
          s.litellmApiKey = v;
          await this.save();
        },
      });
      this.mkEye(keyRow.ctl, keyInput);
    }

    // --- Parameter generasi ---
    const paramCard = this.section(container, 'Parameter generasi');

    const tempRow = this.row(
      paramCard,
      'Temperature',
      'Rendah = konsisten, tinggi = lebih kreatif.'
    );
    const valSpan = tempRow.ctl.createSpan({ cls: 'fs-val' });
    valSpan.textContent = s.temperature.toFixed(2);
    const range = tempRow.ctl.createEl('input');
    range.type = 'range';
    range.min = '0';
    range.max = '2';
    range.step = '0.05';
    range.value = String(s.temperature);
    range.setAttribute('aria-label', 'Temperature');
    range.addEventListener('input', () => {
      const v = parseFloat(range.value);
      valSpan.textContent = v.toFixed(2);
      s.temperature = v;
      void this.save();
    });
    this.mkIconBtn(tempRow.ctl, ICONS.reset, 'Reset temperature', async () => {
      const def = DEFAULT_SETTINGS.temperature;
      s.temperature = def;
      range.value = String(def);
      valSpan.textContent = def.toFixed(2);
      await this.save();
    });

    const titleLenRow = this.row(
      paramCard,
      'Panjang judul maksimum',
      'Batas karakter judul hasil.'
    );
    this.mkNumericInput(titleLenRow.ctl, s.maxTitleLength, async (v) => {
      s.maxTitleLength = v;
      await this.save();
    });
    titleLenRow.ctl.createSpan({ cls: 'fs-unit', text: 'karakter' });

    const contentLenRow = this.row(
      paramCard,
      'Panjang isi catatan maksimum',
      'Catatan lebih panjang dipotong sebelum dikirim, menghemat biaya.'
    );
    this.mkNumericInput(contentLenRow.ctl, s.maxContentLength, async (v) => {
      s.maxContentLength = v;
      await this.save();
    });
    contentLenRow.ctl.createSpan({ cls: 'fs-unit', text: 'karakter' });

    const tokenRow = this.row(
      paramCard,
      'Token output maksimum',
      'Berlaku untuk semua provider.'
    );
    this.mkNumericInput(tokenRow.ctl, s.maxOutputTokens, async (v) => {
      s.maxOutputTokens = v;
      await this.save();
    });
    tokenRow.ctl.createSpan({ cls: 'fs-unit', text: 'token' });
  }

  private renderPromptTab(container: HTMLElement): void {
    const s = this.plugin.settings;

    const card = this.section(
      container,
      'Prompt',
      'Teks yang dikirim ke AI. Variabel diganti otomatis saat judul dibuat.'
    );

    const initialBlock = this.rowBlock(
      card,
      'Prompt awal',
      'Dipakai pertama kali. Gunakan {max_length} untuk batas panjang judul.'
    );
    const initialTa = this.mkTextarea(initialBlock, s.customPrompt, async (v) => {
      s.customPrompt = v;
      await this.save();
    });
    this.mkChips(initialBlock, ['{max_length}'], initialTa);

    const refineBlock = this.rowBlock(
      card,
      'Prompt perbaikan',
      'Dipakai saat judul melebihi batas. Gunakan {max_length} dan {title}.'
    );
    const refineTa = this.mkTextarea(refineBlock, s.refinePrompt, async (v) => {
      s.refinePrompt = v;
      await this.save();
    });
    this.mkChips(refineBlock, ['{max_length}', '{title}'], refineTa);
  }

  private renderOutputTab(container: HTMLElement): void {
    const s = this.plugin.settings;

    const fileCard = this.section(container, 'Nama file');

    const lowerRow = this.row(
      fileCard,
      'Judul huruf kecil',
      'Ubah semua judul hasil menjadi huruf kecil.'
    );
    this.mkSwitch(lowerRow.ctl, 'Judul huruf kecil', s.lowerCaseTitles, async (v) => {
      s.lowerCaseTitles = v;
      await this.save();
    });

    const forbiddenRow = this.row(
      fileCard,
      'Hapus karakter terlarang',
      'Karakter yang tidak valid di nama file dihapus.'
    );
    this.mkSwitch(
      forbiddenRow.ctl,
      'Hapus karakter terlarang',
      s.removeForbiddenChars,
      async (v) => {
        s.removeForbiddenChars = v;
        await this.save();
      }
    );

    const gfmCard = this.section(
      container,
      'Format isi',
      'Pembersihan otomatis saat judul dibuat.'
    );

    const gfmRow = this.row(
      gfmCard,
      'Ubah isi ke GFM',
      'Format ulang seluruh isi catatan menjadi GitHub Flavored Markdown.'
    );
    this.mkSwitch(gfmRow.ctl, 'Ubah isi ke GFM', s.enableGfmReformatting, async (v) => {
      s.enableGfmReformatting = v;
      await this.save();
    });

    const citeRow = this.row(
      gfmCard,
      'Hapus penanda sitasi',
      'Hapus [1], ^[2]^ dan sejenisnya. Berguna untuk hasil riset AI.'
    );
    this.mkSwitch(citeRow.ctl, 'Hapus penanda sitasi', s.stripCitations, async (v) => {
      s.stripCitations = v;
      await this.save();
    });

    const qaRow = this.row(
      gfmCard,
      'Hapus awalan Q&A',
      'Hapus \u201cQ:\u201d atau \u201cQuestion:\u201d. Berguna untuk hasil Perplexity.'
    );
    this.mkSwitch(qaRow.ctl, 'Hapus awalan Q&A', s.cleanQAPrefix, async (v) => {
      s.cleanQAPrefix = v;
      await this.save();
    });

    const diagCard = this.section(container, 'Diagnostik');

    const debugRow = this.row(
      diagCard,
      'Mode debug',
      'Tulis log rinci ke konsol untuk pemecahan masalah.'
    );
    this.mkSwitch(debugRow.ctl, 'Mode debug', s.debugMode, async (v) => {
      s.debugMode = v;
      await this.save();
      updateLoggerConfig({ debugMode: v });
    });
  }

  private renderGistTab(container: HTMLElement): void {
    const s = this.plugin.settings;

    const card = this.section(container, 'Bagikan ke Gist');

    const autoRow = this.row(
      card,
      'Bagikan otomatis',
      'Setelah judul dibuat, catatan langsung dipublikasikan sebagai secret Gist.'
    );
    this.mkSwitch(
      autoRow.ctl,
      'Bagikan otomatis',
      s.enableGistAutoShare,
      async (v) => {
        s.enableGistAutoShare = v;
        await this.save();
        this.display(); // show/hide warning + PAT row
      }
    );

    if (s.enableGistAutoShare) {
      const warn = card.createDiv('fs-warn');
      // icons are static SVG constants — textContent would escape the markup
      warn.createSpan({ cls: 'fs-warn-icon' }).innerHTML = ICONS.warn;
      warn.createSpan({
        text: 'Secret Gist tidak muncul di pencarian, tetapi siapa pun yang memegang tautannya bisa membukanya.',
      });

      const patRow = this.row(
        card,
        'GitHub personal access token',
        'Perlu izin \u201cgist\u201d. Buat di github.com/settings/tokens.'
      );
      const patInput = this.mkInput(patRow.ctl, {
        width: 230,
        value: s.githubPat,
        password: true,
        mono: true,
        placeholder: 'ghp_xxxxxxxxxxxx',
        onChange: async (v) => {
          s.githubPat = v;
          await this.save();
        },
      });
      this.mkEye(patRow.ctl, patInput);
    }
  }

  /* ---------- model search (reused from previous UI) ---------- */

  private createModelSearchComponent(
    containerEl: HTMLElement,
    provider: AIProvider
  ): void {
    let modelName: keyof TitleGeneratorSettings;
    switch (provider) {
      case 'openai':
        modelName = 'openAiModel';
        break;
      case 'anthropic':
        modelName = 'anthropicModel';
        break;
      case 'google':
        modelName = 'googleModel';
        break;
      case 'openrouter':
        modelName = 'openRouterModel';
        break;
      case 'minimax':
        modelName = 'minimaxModel';
        break;
      default:
        return;
    }
    const currentModel = this.plugin.settings[modelName] as string;
    const isLoading = this.modelService.isLoading(provider);

    containerEl.addClass('model-search-container');

    const searchInput = new TextComponent(containerEl)
      .setPlaceholder('Search or select a model...')
      .setValue(currentModel);

    const resultsEl = containerEl.createDiv('search-results');
    resultsEl.style.display = 'none'; // Initially hidden

    const populateList = async (filter: string) => {
      // We pass the *currently selected* model to populateModelList
      // so it can be highlighted, but the input might have a different value
      // which is used as the filter.
      const selectedModel = this.plugin.settings[modelName] as string;
      await this.populateModelList(
        resultsEl,
        provider,
        selectedModel,
        isLoading,
        filter
      );
    };

    searchInput.inputEl.addEventListener('focus', () => {
      resultsEl.style.display = 'block';
      populateList(searchInput.getValue());
    });

    searchInput.inputEl.addEventListener('blur', () => {
      // Delay to allow click on results
      setTimeout(() => {
        resultsEl.style.display = 'none';
      }, 150);
    });

    searchInput.onChange(populateList);
  }

  private async populateModelList(
    listEl: HTMLElement,
    provider: AIProvider,
    currentModel: string,
    isLoading: boolean,
    filter: string = ''
  ): Promise<void> {
    listEl.empty();

    if (isLoading) {
      listEl.createDiv({ text: 'Loading models...' });
      return;
    }

    const availableModels = (
      await this.modelService.getModels(provider)
    ).filter((m) => m.toLowerCase().includes(filter.toLowerCase()));

    let modelName: keyof TitleGeneratorSettings;
    switch (provider) {
      case 'openai':
        modelName = 'openAiModel';
        break;
      case 'anthropic':
        modelName = 'anthropicModel';
        break;
      case 'google':
        modelName = 'googleModel';
        break;
      case 'openrouter':
        modelName = 'openRouterModel';
        break;
      case 'minimax':
        modelName = 'minimaxModel';
        break;
      default:
        return; // Should not happen
    }

    // Ensure the currently saved model is always in the list if it matches the filter,
    // or if there is no filter.
    if (
      currentModel &&
      !availableModels.includes(currentModel) &&
      currentModel.toLowerCase().includes(filter.toLowerCase())
    ) {
      availableModels.unshift(currentModel);
    }

    if (availableModels.length === 0) {
      const cachedInfo = this.modelService.getCachedInfo(provider);
      if (cachedInfo?.error) {
        listEl.createDiv({
          text: `Error: ${cachedInfo.error.substring(0, 50)}...`,
        });
      } else if (filter) {
        listEl.createDiv({ text: 'No matching models found.' });
      } else {
        listEl.createDiv({ text: 'Click refresh icon to load models' });
      }
      return;
    }

    availableModels.forEach((model) => {
      const modelEl = listEl.createDiv({
        text: model,
        cls: 'search-result-item',
      });
      if (model === currentModel) {
        modelEl.addClass('is-selected');
      }
      modelEl.addEventListener('mousedown', async (e) => {
        e.preventDefault(); // Prevent blur event from firing too early
        (this.plugin.settings as any)[modelName] = model;
        await this.plugin.saveSettings();
        this.display(); // Re-render to show selection and update input
      });
    });
  }

  private getTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));

    if (diffMins < 1) return 'baru saja';
    if (diffMins < 60) return `${diffMins} menit lalu`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} jam lalu`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} hari lalu`;
  }

  private hasValidConfiguration(provider: AIProvider): boolean {
    const settings = this.plugin.settings;

    switch (provider) {
      case 'openai':
        return !!settings.openAiApiKey.trim();
      case 'anthropic':
        return !!settings.anthropicApiKey.trim();
      case 'google':
        return !!settings.googleApiKey.trim();
      case 'openrouter':
        return !!settings.openRouterApiKey.trim();
      case 'kimi':
        return !!settings.kimiApiKey.trim();
      case 'litellm':
        return (
          !!settings.litellmBaseUrl.trim() && !!settings.litellmModel.trim()
        );
      case 'minimax':
        return !!settings.minimaxApiKey.trim();
      default:
        return false;
    }
  }
}
