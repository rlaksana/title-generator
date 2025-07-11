import { Notice, requestUrl } from 'obsidian';
import type { AIProvider, TitleGeneratorSettings, CachedModels } from './types';

/**
 * Service for querying and managing AI provider models
 */
export class ModelService {
  private getSettings: () => TitleGeneratorSettings;
  private saveSettings: () => Promise<void>;

  constructor(
    getSettings: () => TitleGeneratorSettings,
    saveSettings: () => Promise<void>
  ) {
    this.getSettings = getSettings;
    this.saveSettings = saveSettings;
  }

  /**
   * Get models for a provider from the cache.
   * This function does NOT query the API.
   */
  async getModels(provider: AIProvider): Promise<string[]> {
    const settings = this.getSettings();
    const cached = settings.cachedModels[provider];
    return cached?.models || [];
  }

  /**
   * Force refresh models for a provider
   */
  async refreshModels(
    provider: AIProvider,
    config?: Partial<TitleGeneratorSettings>
  ): Promise<string[]> {
    const settings = this.getSettings();

    // Set loading state
    settings.modelLoadingState[provider] = true;
    await this.saveSettings();

    try {
      const models = await this.queryModels(provider, config);
      await this.cacheModels(provider, models);
      return models;
    } catch (error) {
      console.error(`Failed to refresh models for ${provider}:`, error);
      const errorMessage = this.getErrorMessage(error);
      await this.cacheError(provider, errorMessage);
      new Notice(
        `Failed to load models for ${provider}: ${errorMessage}`,
        7000
      );
      return [];
    } finally {
      // Clear loading state
      settings.modelLoadingState[provider] = false;
      await this.saveSettings();
    }
  }

  /**
   * Query models from API for specific provider
   */
  private async queryModels(
    provider: AIProvider,
    config?: Partial<TitleGeneratorSettings>
  ): Promise<string[]> {
    // Use provided config first, then fall back to stored settings
    const settings = { ...this.getSettings(), ...config };

    switch (provider) {
      case 'openai':
        return this.queryOpenAIModels(settings);
      case 'anthropic':
        return this.queryAnthropicModels(settings);
      case 'google':
        return this.queryGoogleModels(settings);
      case 'ollama':
        return this.queryOllamaModels(settings);
      case 'lmstudio':
        return this.queryLMStudioModels(settings);
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  private async queryOpenAIModels(
    settings: TitleGeneratorSettings
  ): Promise<string[]> {
    if (!settings.openAiApiKey.trim()) {
      throw new Error('OpenAI API key not set');
    }

    const response = await requestUrl({
      url: 'https://api.openai.com/v1/models',
      method: 'GET',
      headers: {
        Authorization: `Bearer ${settings.openAiApiKey}`,
      },
    });

    if (response.status !== 200) {
      throw new Error(
        `OpenAI API error (${response.status}): ${response.text}`
      );
    }

    const data = response.json;

    if (!data.data || !Array.isArray(data.data)) {
      throw new Error('Invalid response format from OpenAI API');
    }

    return data.data
      .filter((model: any) => model.id && model.id.includes('gpt'))
      .map((model: any) => model.id)
      .sort();
  }

  private async queryAnthropicModels(
    settings: TitleGeneratorSettings
  ): Promise<string[]> {
    if (!settings.anthropicApiKey.trim()) {
      throw new Error('Anthropic API key not set');
    }

    const response = await requestUrl({
      url: 'https://api.anthropic.com/v1/models',
      method: 'GET',
      headers: {
        'x-api-key': settings.anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
    });

    if (response.status !== 200) {
      throw new Error(
        `Anthropic API error (${response.status}): ${response.text}`
      );
    }

    const data = response.json;

    if (!data.data || !Array.isArray(data.data)) {
      throw new Error('Invalid response format from Anthropic API');
    }

    return data.data
      .map((model: any) => model.id)
      .sort();
  }

  private async queryGoogleModels(
    settings: TitleGeneratorSettings
  ): Promise<string[]> {
    if (!settings.googleApiKey.trim()) {
      throw new Error('Google API key not set');
    }

    const response = await requestUrl({
      url: `https://generativelanguage.googleapis.com/v1beta/models?key=${settings.googleApiKey}`,
      method: 'GET',
    });

    if (response.status !== 200) {
      throw new Error(
        `Google API error (${response.status}): ${response.text}`
      );
    }

    const data = response.json;

    if (!data.models || !Array.isArray(data.models)) {
      throw new Error('Invalid response format from Google API');
    }

    return data.models
      .filter((model: any) =>
        model.supportedGenerationMethods?.includes('generateContent')
      )
      .map((model: any) => model.name.replace('models/', ''))
      .sort();
  }

  private async queryOllamaModels(
    settings: TitleGeneratorSettings
  ): Promise<string[]> {
    if (!settings.ollamaUrl.trim()) {
      throw new Error('Ollama URL not set');
    }

    const response = await requestUrl({
      url: new URL('/api/tags', settings.ollamaUrl).toString(),
      method: 'GET',
    });

    if (response.status !== 200) {
      throw new Error(`Ollama API error (${response.status}): ${response.text}`);
    }

    const data = response.json;

    if (!data.models || !Array.isArray(data.models)) {
      throw new Error('Invalid response format from Ollama API');
    }

    return data.models
      .filter((model: any) => model.name)
      .map((model: any) => model.name)
      .sort();
  }

  private async queryLMStudioModels(
    settings: TitleGeneratorSettings
  ): Promise<string[]> {
    if (!settings.lmstudioUrl.trim()) {
      throw new Error('LM Studio URL not set');
    }

    const response = await requestUrl({
      url: new URL('/v1/models', settings.lmstudioUrl).toString(),
      method: 'GET',
    });

    if (response.status !== 200) {
      throw new Error(
        `LM Studio API error (${response.status}): ${response.text}`
      );
    }

    const data = response.json;

    if (!data.data || !Array.isArray(data.data)) {
      throw new Error('Invalid response format from LM Studio API');
    }

    return data.data
      .filter((model: any) => model.id)
      .map((model: any) => model.id)
      .sort();
  }

  private async cacheModels(
    provider: AIProvider,
    models: string[]
  ): Promise<void> {
    const settings = this.getSettings();
    settings.cachedModels[provider] = {
      models,
      lastUpdated: Date.now(),
    };
    await this.saveSettings();
  }

  private async cacheError(provider: AIProvider, error: string): Promise<void> {
    const settings = this.getSettings();
    const existing = settings.cachedModels[provider];
    settings.cachedModels[provider] = {
      models: existing?.models || [],
      lastUpdated: existing?.lastUpdated || 0,
      error,
    };
    await this.saveSettings();
  }

  /**
   * Check if models are currently loading for a provider
   */
  isLoading(provider: AIProvider): boolean {
    const settings = this.getSettings();
    return settings.modelLoadingState[provider] || false;
  }

  /**
   * Get cached model info for a provider
   */
  getCachedInfo(provider: AIProvider): CachedModels | undefined {
    const settings = this.getSettings();
    return settings.cachedModels[provider];
  }

  private getErrorMessage(error: any): string {
    if (typeof error === 'string') {
      return error;
    }

    if (error?.message) {
      const message = error.message.toLowerCase();

      // Common error patterns
      if (message.includes('unauthorized') || message.includes('401')) {
        return 'Invalid API key. Please check your credentials.';
      }

      if (message.includes('forbidden') || message.includes('403')) {
        return 'Access denied. Please check your API key permissions.';
      }

      if (message.includes('not found') || message.includes('404')) {
        return 'API endpoint not found. Please check your configuration.';
      }

      if (message.includes('network') || message.includes('fetch')) {
        return 'Network error. Please check your internet connection.';
      }

      if (message.includes('timeout')) {
        return 'Request timed out. Please try again.';
      }

      if (message.includes('rate limit') || message.includes('429')) {
        return 'Rate limit exceeded. Please wait and try again.';
      }

      if (message.includes('server error') || message.includes('500')) {
        return 'Server error. Please try again later.';
      }

      return error.message;
    }

    return 'Unknown error occurred';
  }
}
