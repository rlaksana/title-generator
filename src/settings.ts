import { App, PluginSettingTab, Setting } from 'obsidian';
import type { AIProvider, TitleGeneratorSettings } from './types';
import type TitleGeneratorPlugin from './main';

export const AI_PROVIDERS: Record<
  AIProvider,
  { name: string; models: string[]; requiresApiKey: boolean }
> = {
  openai: {
    name: 'OpenAI',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'],
    requiresApiKey: true,
  },
  anthropic: {
    name: 'Anthropic',
    models: ['claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'],
    requiresApiKey: true,
  },
  google: {
    name: 'Google Gemini',
    models: ['gemini-1.5-pro-latest', 'gemini-1.5-flash-latest', 'gemini-1.0-pro'],
    requiresApiKey: true,
  },
  ollama: {
    name: 'Ollama',
    models: ['llama3', 'llama2', 'mistral', 'codellama', 'phi3'],
    requiresApiKey: false,
  },
  lmstudio: {
    name: 'LM Studio',
    models: ['llama-3', 'mistral-7b', 'codellama', 'phi-3', 'qwen2', 'gemma2'],
    requiresApiKey: false,
  },
};

export const DEFAULT_SETTINGS: TitleGeneratorSettings = {
  // Provider
  aiProvider: 'ollama',
  openAiApiKey: '',
  anthropicApiKey: '',
  googleApiKey: '',
  ollamaUrl: 'http://localhost:11434',
  lmstudioUrl: 'http://127.0.0.1:1234',

  // Models
  openAiModel: 'gpt-4o-mini',
  anthropicModel: 'claude-3-haiku-20240307',
  googleModel: 'gemini-1.5-flash-latest',
  ollamaModel: 'llama3',
  lmstudioModel: 'llama-3',

  // Title
  lowerCaseTitles: false,
  removeForbiddenChars: true,

  // Prompt and Content
  customPrompt: 'Generate a concise, descriptive title for the following text. The title must be a maximum of {max_length} characters.',
  refinePrompt: 'The following title is too long. Please shorten it to be under {max_length} characters, while preserving its core meaning: "{title}"',
  temperature: 0.7,
  maxTitleLength: 200,
  maxContentLength: 2000,
};

export class TitleGeneratorSettingTab extends PluginSettingTab {
  plugin: TitleGeneratorPlugin;

  constructor(app: App, plugin: TitleGeneratorPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Enhanced Title Generator Settings' });

    /* --- General Settings --- */
    containerEl.createEl('h3', { text: 'General' });

    new Setting(containerEl)
      .setName('Lower-case titles')
      .setDesc('If enabled, all generated titles will be converted to lower case.')
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.lowerCaseTitles)
          .onChange(async (value) => {
            this.plugin.settings.lowerCaseTitles = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Remove forbidden characters')
      .setDesc('If enabled, characters that are forbidden in filenames will be removed.')
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.removeForbiddenChars)
          .onChange(async (value) => {
            this.plugin.settings.removeForbiddenChars = value;
            await this.plugin.saveSettings();
          });
      });

    /* --- AI Provider Settings --- */
    containerEl.createEl('h3', { text: 'AI Provider' });

    new Setting(containerEl)
      .setName('AI Provider')
      .setDesc('Select the AI service you want to use to generate titles.')
      .addDropdown((dropdown) => {
        Object.entries(AI_PROVIDERS).forEach(([key, provider]) => {
          dropdown.addOption(key, provider.name);
        });
        dropdown
          .setValue(this.plugin.settings.aiProvider)
          .onChange(async (value) => {
            this.plugin.settings.aiProvider = value as AIProvider;
            await this.plugin.saveSettings();
            this.display(); // Re-render the settings tab
          });
      });

    this.renderProviderSettings(containerEl);

    /* --- Prompt and Content Settings --- */
    containerEl.createEl('h3', { text: 'Prompts and Content' });

    new Setting(containerEl)
      .setName('Initial Prompt')
      .setDesc(
        'The prompt sent to the AI. Use {max_length} to insert the max title length.'
      )
      .addTextArea((ta) => {
        ta.setPlaceholder(DEFAULT_SETTINGS.customPrompt)
          .setValue(this.plugin.settings.customPrompt)
          .onChange(async (value) => {
            this.plugin.settings.customPrompt = value;
            await this.plugin.saveSettings();
          });
      });
      
    new Setting(containerEl)
      .setName('Refinement Prompt')
      .setDesc(
        'The prompt used to shorten a title if it exceeds the length limit. Use {max_length} and {title}.'
      )
      .addTextArea((ta) => {
        ta.setPlaceholder(DEFAULT_SETTINGS.refinePrompt)
          .setValue(this.plugin.settings.refinePrompt)
          .onChange(async (value) => {
            this.plugin.settings.refinePrompt = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Temperature')
      .setDesc(
        'Controls the creativity of the AI. Lower values are more predictable, higher values are more creative.'
      )
      .addSlider((slider) => {
        slider
          .setLimits(0, 1, 0.01)
          .setValue(this.plugin.settings.temperature)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.temperature = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Max Title Length')
      .setDesc('The maximum number of characters for the generated title.')
      .addText((text) => {
        text.inputEl.type = 'number';
        text
          .setValue(this.plugin.settings.maxTitleLength.toString())
          .onChange(async (value) => {
            const parsed = parseInt(value, 10);
            if (!isNaN(parsed)) {
              this.plugin.settings.maxTitleLength = parsed;
              await this.plugin.saveSettings();
            }
          });
      });

    new Setting(containerEl)
      .setName('Max Content Length for AI')
      .setDesc(
        'The maximum number of characters from the note to send to the AI. Helps save costs on long notes.'
      )
      .addText((text) => {
        text.inputEl.type = 'number';
        text
          .setValue(this.plugin.settings.maxContentLength.toString())
          .onChange(async (value) => {
            const parsed = parseInt(value, 10);
            if (!isNaN(parsed)) {
              this.plugin.settings.maxContentLength = parsed;
              await this.plugin.saveSettings();
            }
          });
      });
  }

  private renderProviderSettings(containerEl: HTMLElement): void {
    const provider = this.plugin.settings.aiProvider;
    const providerInfo = AI_PROVIDERS[provider];

    // API Key or Ollama URL
    if (providerInfo.requiresApiKey) {
      const keyName = `${provider}ApiKey` as keyof TitleGeneratorSettings;
      new Setting(containerEl)
        .setName(`${providerInfo.name} API Key`)
        .setDesc(`Your API key for the ${providerInfo.name} service.`)
        .addText((text) => {
          text.inputEl.type = 'password';
          text.setPlaceholder('Enter your API key');
          text
            .setValue(this.plugin.settings[keyName] as string)
            .onChange(async (value) => {
              (this.plugin.settings as any)[keyName] = value;
              await this.plugin.saveSettings();
            });
        });
    } else {
      // Ollama and LM Studio specific settings
      if (provider === 'ollama') {
        new Setting(containerEl)
          .setName('Ollama Server URL')
          .setDesc('The URL of your local Ollama server.')
          .addText((text) => {
            text
              .setPlaceholder('e.g., http://localhost:11434')
              .setValue(this.plugin.settings.ollamaUrl)
              .onChange(async (value) => {
                this.plugin.settings.ollamaUrl = value;
                await this.plugin.saveSettings();
              });
          });
      } else if (provider === 'lmstudio') {
        new Setting(containerEl)
          .setName('LM Studio Server URL')
          .setDesc('The URL of your local LM Studio server.')
          .addText((text) => {
            text
              .setPlaceholder('e.g., http://127.0.0.1:1234')
              .setValue(this.plugin.settings.lmstudioUrl)
              .onChange(async (value) => {
                this.plugin.settings.lmstudioUrl = value;
                await this.plugin.saveSettings();
              });
          });
      }
    }

    // Model selection
    const modelName = `${provider}Model` as keyof TitleGeneratorSettings;
    new Setting(containerEl)
      .setName('Model')
      .setDesc(`The ${providerInfo.name} model to use for generation.`)
      .addDropdown((dropdown) => {
        providerInfo.models.forEach((m) => dropdown.addOption(m, m));
        dropdown
          .setValue(this.plugin.settings[modelName] as string)
          .onChange(async (value) => {
            (this.plugin.settings as any)[modelName] = value;
            await this.plugin.saveSettings();
          });
      });
  }
}
