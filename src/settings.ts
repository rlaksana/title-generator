import { App, PluginSettingTab, Setting } from 'obsidian';
// Test 2: Consistency validation
import type { AIProvider, TitleGeneratorSettings } from './types';
import type TitleGeneratorPlugin from './main';
import { ModelService } from './modelService';

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
  ollama: {
    name: 'Ollama',
    requiresApiKey: false,
  },
  lmstudio: {
    name: 'LM Studio',
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
  lmstudioUrl: 'http://192.168.68.145:1234',

  // Models
  openAiModel: '',
  anthropicModel: '',
  googleModel: '',
  ollamaModel: '',
  lmstudioModel: '',

  // Dynamic Model Caching
  cachedModels: {},
  modelLoadingState: {},

  // Title
  lowerCaseTitles: false,
  removeForbiddenChars: true,

  // Prompt and Content
  customPrompt:
    'Create a concise title for this text. Respond with ONLY the title - no explanations, quotes, or extra text. Maximum {max_length} characters.',
  refinePrompt:
    'Make this title shorter (under {max_length} characters): "{title}". Respond with ONLY the new title.',
  temperature: 0.3,
  maxTitleLength: 60,
  maxContentLength: 2000,
};

export class TitleGeneratorSettingTab extends PluginSettingTab {
  plugin: TitleGeneratorPlugin;
  modelService: ModelService;

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

    containerEl.createEl('h2', { text: 'Enhanced Title Generator Settings' });

    /* --- General Settings --- */
    containerEl.createEl('h3', { text: 'General' });

    new Setting(containerEl)
      .setName('Lower-case titles')
      .setDesc(
        'If enabled, all generated titles will be converted to lower case.'
      )
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
      .setDesc(
        'If enabled, characters that are forbidden in filenames will be removed.'
      )
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
            const oldProvider = this.plugin.settings.aiProvider;
            this.plugin.settings.aiProvider = value as AIProvider;
            await this.plugin.saveSettings();

            // Auto-load models for new provider if it has valid configuration
            if (oldProvider !== value) {
              await this.autoLoadModelsForProvider(value as AIProvider);
            }

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

              // Auto-reload models if API key changed and is now valid
              if (value.trim()) {
                await this.autoReloadModels(provider);
              }
            });
        });
    } else {
      // Ollama and LM Studio specific settings
      if (provider === 'ollama') {
        this.renderUrlSettingWithConfirmation(
          containerEl,
          'ollama',
          'Ollama Server URL',
          'The URL of your local Ollama server.',
          'e.g., http://localhost:11434'
        );
      } else if (provider === 'lmstudio') {
        this.renderUrlSettingWithConfirmation(
          containerEl,
          'lmstudio',
          'LM Studio Server URL',
          'The URL of your local LM Studio server.',
          'e.g., http://127.0.0.1:1234 or http://192.168.68.145:1234'
        );

        // Add LM Studio setup instructions
        const lmStudioInfo = containerEl.createEl('div', {
          cls: 'setting-item-description',
        });
        lmStudioInfo.innerHTML = `
          <div style="margin-top: 10px; padding: 10px; background: #f5f5f5; border-radius: 4px; font-size: 12px;">
            <strong>LM Studio Setup:</strong><br>
            1. Start LM Studio and load a model<br>
            2. Go to "Local Server" tab<br>
            3. Enable "CORS" (Cross-Origin Resource Sharing)<br>
            4. Set port to 1234 (or your preferred port)<br>
            5. Click "Start Server"<br>
            <br>
            <strong>Network Issues:</strong><br>
            • If using WSL, use Windows host IP (e.g., 192.168.68.145:1234)<br>
            • If using localhost fails, try your computer's IP address<br>
            • Ensure firewall allows the connection
          </div>
        `;
      }
    }

    // Model selection with reload button
    this.renderModelSelection(containerEl, provider, providerInfo);
  }

  private async renderModelSelection(
    containerEl: HTMLElement,
    provider: AIProvider,
    providerInfo: { name: string; requiresApiKey: boolean }
  ): Promise<void> {
    const modelName = `${provider}Model` as keyof TitleGeneratorSettings;
    const currentModel = this.plugin.settings[modelName] as string;
    const isLoading = this.modelService.isLoading(provider);
    const cachedInfo = this.modelService.getCachedInfo(provider);

    // Model selection setting
    const modelSetting = new Setting(containerEl)
      .setName('Model')
      .setDesc(`The ${providerInfo.name} model to use for generation.`);

    // Add model dropdown
    let dropdown: any;
    modelSetting.addDropdown((d) => {
      dropdown = d;
      this.populateModelDropdown(d, provider, currentModel, isLoading);
    });

    // Add reload button
    modelSetting.addButton((btn) => {
      btn
        .setIcon('refresh-cw')
        .setTooltip('Reload models')
        .setDisabled(isLoading)
        .onClick(async () => {
          btn.setDisabled(true);
          try {
            const models = await this.modelService.refreshModels(provider);
            this.populateModelDropdown(
              dropdown,
              provider,
              currentModel,
              false,
              models
            );
          } catch (error) {
            console.error('Failed to reload models:', error);
          } finally {
            btn.setDisabled(false);
          }
        });
    });

    // Add cache info
    if (cachedInfo) {
      const lastUpdated = new Date(cachedInfo.lastUpdated);
      const timeAgo = this.getTimeAgo(lastUpdated);

      let desc = `The ${providerInfo.name} model to use for generation.`;
      if (cachedInfo.error) {
        desc += ` Error: ${cachedInfo.error}`;
      } else if (cachedInfo.models.length > 0) {
        desc += ` (${cachedInfo.models.length} models, updated ${timeAgo})`;
      }

      modelSetting.setDesc(desc);
    }
  }

  private async populateModelDropdown(
    dropdown: any,
    provider: AIProvider,
    currentModel: string,
    isLoading: boolean,
    models?: string[]
  ): Promise<void> {
    dropdown.selectEl.empty();

    if (isLoading) {
      dropdown.addOption('loading', 'Loading models...');
      dropdown.setValue('loading');
      dropdown.setDisabled(true);
      return;
    }

    dropdown.setDisabled(false);

    const availableModels =
      models || (await this.modelService.getModels(provider));
    const modelName = `${provider}Model` as keyof TitleGeneratorSettings;

    if (availableModels.length === 0) {
      const cachedInfo = this.modelService.getCachedInfo(provider);
      if (cachedInfo?.error) {
        dropdown.addOption(
          'no-models',
          `Error: ${cachedInfo.error.substring(0, 50)}...`
        );
      } else {
        dropdown.addOption(
          'no-models',
          'No models found. Check config & refresh.'
        );
      }
      dropdown.setValue('no-models');
      dropdown.setDisabled(true);
      return;
    }

    // Add a placeholder
    dropdown.addOption('', 'Select a model...');

    // Add models to dropdown
    availableModels.forEach((model) => {
      dropdown.addOption(model, model);
    });

    // Set current value if it's valid, otherwise use placeholder
    if (currentModel && availableModels.includes(currentModel)) {
      dropdown.setValue(currentModel);
    } else {
      dropdown.setValue('');
    }

    // Set change handler
    dropdown.onChange(async (value: string) => {
      (this.plugin.settings as any)[modelName] = value;
      await this.plugin.saveSettings();
    });
  }

  private getTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  }

  private async autoReloadModels(provider: AIProvider): Promise<void> {
    try {
      // Small delay to ensure UI is updated
      setTimeout(async () => {
        await this.modelService.refreshModels(provider);
        // Re-render the settings to update the dropdown
        this.display();
      }, 100);
    } catch (error) {
      console.error(`Failed to auto-reload models for ${provider}:`, error);
    }
  }

  private async autoLoadModelsForProvider(provider: AIProvider): Promise<void> {
    try {
      // Check if provider has valid configuration
      if (this.hasValidConfiguration(provider)) {
        // Load models in background
        setTimeout(async () => {
          await this.modelService.getModels(provider);
          // Re-render to update dropdown if still on same provider
          if (this.plugin.settings.aiProvider === provider) {
            this.display();
          }
        }, 100);
      }
    } catch (error) {
      console.error(`Failed to auto-load models for ${provider}:`, error);
    }
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
      case 'ollama':
        return !!settings.ollamaUrl.trim();
      case 'lmstudio':
        return !!settings.lmstudioUrl.trim();
      default:
        return false;
    }
  }

  private renderUrlSettingWithConfirmation(
    containerEl: HTMLElement,
    provider: 'ollama' | 'lmstudio',
    name: string,
    description: string,
    placeholder: string
  ): void {
    const urlKey = provider === 'ollama' ? 'ollamaUrl' : 'lmstudioUrl';
    const currentUrl = this.plugin.settings[urlKey];
    let tempUrl = currentUrl;
    let hasUnsavedChanges = false;

    const setting = new Setting(containerEl).setName(name).setDesc(description);

    let textComponent: any;
    setting.addText((text) => {
      textComponent = text;
      text
        .setPlaceholder(placeholder)
        .setValue(currentUrl)
        .onChange((value) => {
          tempUrl = value;
          hasUnsavedChanges = value !== currentUrl;

          // Update button states
          okButton.setDisabled(!hasUnsavedChanges);
          cancelButton.setDisabled(!hasUnsavedChanges);

          // Visual feedback for unsaved changes
          if (hasUnsavedChanges) {
            text.inputEl.style.borderColor = '#ff6b6b';
          } else {
            text.inputEl.style.borderColor = '';
          }
        });
    });

    // OK button
    let okButton: any;
    setting.addButton((btn) => {
      okButton = btn;
      btn
        .setButtonText('OK')
        .setDisabled(true)
        .onClick(async () => {
          if (!tempUrl.trim()) {
            return;
          }

          // Save the URL
          this.plugin.settings[urlKey] = tempUrl;
          await this.plugin.saveSettings();

          // Reset state
          hasUnsavedChanges = false;
          okButton.setDisabled(true);
          cancelButton.setDisabled(true);
          textComponent.inputEl.style.borderColor = '';

          // Load models
          await this.autoReloadModels(provider);
        });
    });

    // Cancel button
    let cancelButton: any;
    setting.addButton((btn) => {
      cancelButton = btn;
      btn
        .setButtonText('Cancel')
        .setDisabled(true)
        .onClick(() => {
          // Reset to saved value
          tempUrl = currentUrl;
          textComponent.setValue(currentUrl);
          hasUnsavedChanges = false;

          // Update button states
          okButton.setDisabled(true);
          cancelButton.setDisabled(true);
          textComponent.inputEl.style.borderColor = '';
        });
    });
  }
}
