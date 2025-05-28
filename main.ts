 // @ts-nocheck
/* eslint-disable import/order, no-nested-ternary, @typescript-eslint/lines-between-class-members */
import {
  App,
  Editor,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  normalizePath,
} from 'obsidian';
import OpenAI from 'openai';
import pMap from 'p-map';
import path from 'path-browserify';

type AIProvider = 'openai' | 'anthropic' | 'google' | 'ollama';

interface TitleGeneratorSettings {
  aiProvider: AIProvider;
  openAiApiKey: string;
  anthropicApiKey: string;
  googleApiKey: string;
  ollamaUrl: string;
  openAiModel: string;
  anthropicModel: string;
  googleModel: string;
  ollamaModel: string;
  lowerCaseTitles: boolean;
  maxTitleLength: number;
  removeForbiddenChars: boolean;
  temperature: number;
  customPrompt: string;
}

const AI_PROVIDERS: Record<AIProvider, { name: string; models: string[]; requiresApiKey: boolean }> = {
  openai: {
    name: 'OpenAI',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo-instruct', 'gpt-3.5-turbo'],
    requiresApiKey: true,
  },
  anthropic: {
    name: 'Anthropic',
    models: ['claude-v1', 'claude-2', 'claude-3', 'claude-instant'],
    requiresApiKey: true,
  },
  google: {
    name: 'Google Gemini',
    models: ['gemini', 'gemini-pro', 'gemini-ultra'],
    requiresApiKey: true,
  },
  ollama: {
    name: 'Ollama',
    models: ['llama2', 'mistral', 'alpaca'],
    requiresApiKey: false,
  },
};

const DEFAULT_SETTINGS: TitleGeneratorSettings = {
  aiProvider: 'openai',
  openAiApiKey: '',
  anthropicApiKey: '',
  googleApiKey: '',
  ollamaUrl: 'http://localhost:11434',
  openAiModel: 'gpt-3.5-turbo-instruct',
  anthropicModel: 'claude-v1',
  googleModel: 'gemini',
  ollamaModel: 'llama2',
  lowerCaseTitles: false,
  maxTitleLength: 200,
  removeForbiddenChars: true,
  temperature: 0.7,
  customPrompt: 'Generate a concise, descriptive title for the following text:',
};

class TitleGeneratorSettingTab extends PluginSettingTab {
  plugin: TitleGeneratorPlugin;

  constructor(app: App, plugin: TitleGeneratorPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // AI Provider dropdown
    new Setting(containerEl)
      .setName('AI Provider')
      .setDesc('Select which AI provider to use')
      .addDropdown((dropdown) => {
        Object.entries(AI_PROVIDERS).forEach(([key, prov]) => {
          dropdown.addOption(key, prov.name);
        });
        dropdown
          .setValue(this.plugin.settings.aiProvider)
          .onChange(async (value) => {
            this.plugin.settings.aiProvider = value as AIProvider;
            await this.plugin.saveSettings();
            this.display();
          });
      });

    const provider = this.plugin.settings.aiProvider;

    // API Key or Ollama URL
    if (AI_PROVIDERS[provider].requiresApiKey) {
      new Setting(containerEl)
        .setName(`${AI_PROVIDERS[provider].name} API Key`)
        .addText((text) => {
          text.inputEl.type = 'password';
          text.setPlaceholder('API Key');
          let current: string;
          if (provider === 'openai') {
            current = this.plugin.settings.openAiApiKey;
          } else if (provider === 'anthropic') {
            current = this.plugin.settings.anthropicApiKey;
          } else {
            current = this.plugin.settings.googleApiKey;
          }
          text.setValue(current).onChange(async (value) => {
            if (provider === 'openai') this.plugin.settings.openAiApiKey = value;
            if (provider === 'anthropic') this.plugin.settings.anthropicApiKey = value;
            if (provider === 'google') this.plugin.settings.googleApiKey = value;
            await this.plugin.saveSettings();
          });
        });
    } else {
      new Setting(containerEl)
        .setName('Ollama Server URL')
        .setDesc('e.g., http://localhost:11434')
        .addText((text) => {
          text.setPlaceholder('Server URL')
            .setValue(this.plugin.settings.ollamaUrl)
            .onChange(async (value) => {
              this.plugin.settings.ollamaUrl = value;
              await this.plugin.saveSettings();
            });
        });
    }

    // Model selection
    new Setting(containerEl)
      .setName('Model')
      .setDesc(`Select model for ${AI_PROVIDERS[provider].name}`)
      .addDropdown((dropdown) => {
        AI_PROVIDERS[provider].models.forEach((m) => dropdown.addOption(m, m));
        let currentModel: string;
        if (provider === 'openai') {
          currentModel = this.plugin.settings.openAiModel;
        } else if (provider === 'anthropic') {
          currentModel = this.plugin.settings.anthropicModel;
        } else if (provider === 'google') {
          currentModel = this.plugin.settings.googleModel;
        } else {
          currentModel = this.plugin.settings.ollamaModel;
        }
        dropdown
          .setValue(currentModel)
          .onChange(async (value) => {
            if (provider === 'openai') this.plugin.settings.openAiModel = value;
            if (provider === 'anthropic') this.plugin.settings.anthropicModel = value;
            if (provider === 'google') this.plugin.settings.googleModel = value;
            if (provider === 'ollama') this.plugin.settings.ollamaModel = value;
            await this.plugin.saveSettings();
          });
      });

    // Custom prompt
    new Setting(containerEl)
      .setName('Custom Prompt')
      .setDesc('Customize the prompt sent to the AI')
      .addTextArea((ta) => {
        ta.setPlaceholder(DEFAULT_SETTINGS.customPrompt)
          .setValue(this.plugin.settings.customPrompt)
          .onChange(async (value) => {
            this.plugin.settings.customPrompt = value;
            await this.plugin.saveSettings();
          });
      });

    // Temperature
    new Setting(containerEl)
      .setName('Temperature')
      .setDesc('Creativity of AI (0 to 1)')
      .addSlider((slider) => {
        slider
          .setLimits(0, 1, 0.01)
          .setValue(this.plugin.settings.temperature)
          .onChange(async (value) => {
            this.plugin.settings.temperature = value;
            await this.plugin.saveSettings();
          });
      });

    // Max title length
    new Setting(containerEl)
      .setName('Max Title Length')
      .setDesc('Maximum characters for title')
      .addText((text) => {
        text.inputEl.type = 'number';
        text.setValue(this.plugin.settings.maxTitleLength.toString())
            .onChange(async (value) => {
            this.plugin.settings.maxTitleLength = parseInt(value, 10);
            await this.plugin.saveSettings();
          });
      });

    // Remove forbidden characters
    new Setting(containerEl)
      .setName('Remove Forbidden Characters')
      .setDesc('Strip OS forbidden characters from title')
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.removeForbiddenChars)
          .onChange(async (value) => {
            this.plugin.settings.removeForbiddenChars = value;
            await this.plugin.saveSettings();
          });
      });

    // Lower-case titles
    new Setting(containerEl)
      .setName('Lower-case Titles')
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.lowerCaseTitles)
          .onChange(async (value) => {
            this.plugin.settings.lowerCaseTitles = value;
            await this.plugin.saveSettings();
          });
      });
  }
}

export default class TitleGeneratorPlugin extends Plugin {
  settings: TitleGeneratorSettings;
  openai: OpenAI;

  async onload() {
    await this.loadSettings();
    this.openai = new OpenAI({
      apiKey: this.settings.openAiApiKey,
      dangerouslyAllowBrowser: true,
    });

    this.addCommand({
      id: 'title-generator-generate-title',
      name: 'Generate title',
      editorCallback: (editor: Editor) => this.generateTitleFromEditor(editor),
    });

    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (!(file instanceof TFile)) return;
        menu.addItem((item) =>
          item
            .setTitle('Generate title')
            .setIcon('lucide-edit-3')
            .onClick(() => this.generateTitleFromFile(file))
        );
      })
    );

    this.registerEvent(
      this.app.workspace.on('files-menu', (menu, files) => {
        const tFiles = files.filter((f) => f instanceof TFile) as TFile[];
        if (tFiles.length < 1) return;
        menu.addItem((item) =>
          item
            .setTitle('Generate titles')
            .setIcon('lucide-edit-3')
            .onClick(() =>
              pMap<TFile, void>(
                tFiles,
                (f) => this.generateTitleFromFile(f),
                { concurrency: 1 }
              )
            )
        );
      })
    );

    this.addSettingTab(new TitleGeneratorSettingTab(this.app, this));
  }

  async loadSettings() {
    this.settings = { ...DEFAULT_SETTINGS, ...(await this.loadData()) };
  }

  async saveSettings() {
    await this.saveData(this.plugin.settings ?? this.settings);
    this.openai.apiKey = this.settings.openAiApiKey;
  }

  private sanitizeFilename(title: string): string {
    let safe = title;
    if (this.settings.removeForbiddenChars) {
      // eslint-disable-next-line no-control-regex, no-useless-escape
      safe = safe.replace(/[<>:"\/\\|?*\x00-\x1F]/g, '');
      safe = safe.replace(/\s+/g, ' ').trim();
      safe = safe.replace(/^[ .]+|[ .]+$/g, '');
      if (!safe.length) safe = 'Untitled';
    }
    return safe;
  }

  private truncateTitle(title: string): string {
    if (title.length <= this.settings.maxTitleLength) {
      return title;
    }
    let truncated = title.slice(0, this.settings.maxTitleLength);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > 0) {
      truncated = truncated.slice(0, lastSpace);
    }
    return truncated;
  }

  private async callAI(content: string): Promise<string> {
    const prompt = `${this.settings.customPrompt}\n\n${content}`;
    switch (this.settings.aiProvider) {
      case 'openai':
        return this.callOpenAI(prompt);
      case 'anthropic':
        return this.callAnthropic(prompt);
      case 'google':
        return this.callGoogle(prompt);
      case 'ollama':
        return this.callOllama(prompt);
      default:
        throw new Error('Unsupported AI provider');
    }
  }

  private async callOpenAI(prompt: string): Promise<string> {
    const model = this.settings.openAiModel;
    if (model.includes('turbo') || model.includes('gpt-4')) {
      const res = await this.openai.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: this.settings.temperature,
      });
      return res.choices[0].message?.content.trim() ?? '';
    }
    const res = await this.openai.completions.create({
      model,
      prompt,
      temperature: this.settings.temperature,
      max_tokens: this.settings.maxTitleLength,
    });
    return res.choices[0].text.trim();
  }

  private async callAnthropic(prompt: string): Promise<string> {
    const url = 'https://api.anthropic.com/v1/chat/completions';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.settings.anthropicApiKey,
        'Anthropic-Version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.settings.anthropicModel,
        messages: [{ role: 'user', content: prompt }],
        temperature: this.settings.temperature,
      }),
    });
    if (!response.ok) {
      throw new Error(`Anthropic API error ${response.status}`);
    }
    const data = await response.json();
    return data.choices?.[0]?.message?.content.trim() ?? data.completion?.trim() ?? '';
  }

  private async callGoogle(prompt: string): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.settings.googleModel}:generateContent?key=${this.settings.googleApiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });
    if (!response.ok) {
      throw new Error(`Google Gemini API error ${response.status}`);
    }
    const data = await response.json();
    return data.candidates?.[0]?.content.trim() ?? '';
  }

  private async callOllama(prompt: string): Promise<string> {
    const url = `${this.settings.ollamaUrl}/api/generate`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.settings.ollamaModel,
        prompt,
        stream: false,
        options: { temperature: this.settings.temperature },
      }),
    });
    if (!response.ok) {
      throw new Error(`Ollama API error ${response.status}`);
    }
    const data = await response.json();
    return data.choices?.[0]?.text.trim() ?? data.text.trim() ?? '';
  }

  private async generateTitle(file: TFile, content: string) {
    const status = this.addStatusBarItem();
    status.createEl('span', { text: 'Generating title...' });
    try {
      const title = await this.callAI(content);
      let processed = title.trim();
      if (this.settings.lowerCaseTitles) {
        processed = processed.toLowerCase();
      }
      processed = this.truncateTitle(processed);
      processed = this.sanitizeFilename(processed);
      const { dir, ext } = path.parse(file.path);
      const newPath = normalizePath(`${dir}/${processed}${ext}`);
      await this.app.fileManager.renameFile(file, newPath);
    } catch (err) {
      new Notice(`Unable to generate title:\n${err}`);
    } finally {
      status.remove();
    }
  }

  private async generateTitleFromFile(file: TFile) {
    const content = await file.vault.cachedRead(file);
    return this.generateTitle(file, content);
  }

  private async generateTitleFromEditor(editor: Editor) {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      throw new Error('No active file');
    }
    const content = editor.getValue();
    return this.generateTitle(activeFile, content);
  }
}
