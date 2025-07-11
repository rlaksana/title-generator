import { Notice } from 'obsidian';
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
   * Get models for a provider, using cache if available or querying API
   */
  async getModels(provider: AIProvider): Promise<string[]> {
    const settings = this.getSettings();
    const cached = settings.cachedModels[provider];

    // Check if we have fresh cached data (less than 1 hour old)
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    if (cached && cached.lastUpdated > oneHourAgo && cached.models.length > 0) {
      return cached.models;
    }

    // Try to query fresh models
    try {
      const models = await this.queryModels(provider);
      if (models.length > 0) {
        await this.cacheModels(provider, models);
        return models;
      }
    } catch (error) {
      console.warn(`Failed to query models for ${provider}:`, error);
      const errorMessage = this.getErrorMessage(error);
      await this.cacheError(provider, errorMessage);
    }

    // Fallback to cached models if available
    if (cached && cached.models.length > 0) {
      return cached.models;
    }

    // Final fallback to empty array
    return [];
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
    console.log('queryModels received config:', JSON.stringify(config));
    // Use provided config first, then fall back to stored settings
    const settings = { ...this.getSettings(), ...config };
    console.log(
      `Final settings for provider ${provider}. API Key present: ${!!settings.openAiApiKey}`
    );

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
    const apiKey = settings.openAiApiKey;
    console.log(
      `Querying OpenAI models. API Key present: ${!!apiKey}. Key starts with: ${apiKey.slice(0, 5)}...`
    );

    if (!apiKey.trim()) {
      throw new Error('OpenAI API key not set');
    }

    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();

      if (!data.data || !Array.isArray(data.data)) {
        throw new Error('Invalid response format from OpenAI API');
      }

      return data.data
        .filter((model: any) => model.id && model.id.includes('gpt'))
        .map((model: any) => model.id)
        .sort();
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error(
          'Request timed out. Please check your internet connection.'
        );
      }
      throw error;
    }
  }

  private async queryAnthropicModels(
    settings: TitleGeneratorSettings
  ): Promise<string[]> {
    // Anthropic doesn't have a public models API, return static list
    return [
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307',
      'claude-3-5-sonnet-20240620',
    ];
  }

  private async queryGoogleModels(
    settings: TitleGeneratorSettings
  ): Promise<string[]> {
    if (!settings.googleApiKey.trim()) {
      throw new Error('Google API key not set');
    }

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${settings.googleApiKey}`,
        {
          signal: AbortSignal.timeout(10000), // 10 second timeout
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Google API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();

      if (!data.models || !Array.isArray(data.models)) {
        throw new Error('Invalid response format from Google API');
      }

      return data.models
        .filter((model: any) =>
          model.supportedGenerationMethods?.includes('generateContent')
        )
        .map((model: any) => model.name.replace('models/', ''))
        .sort();
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error(
          'Request timed out. Please check your internet connection.'
        );
      }
      throw error;
    }
  }

  private async queryOllamaModels(
    settings: TitleGeneratorSettings
  ): Promise<string[]> {
    if (!settings.ollamaUrl.trim()) {
      throw new Error('Ollama URL not set');
    }

    try {
      const response = await fetch(
        new URL('/api/tags', settings.ollamaUrl).toString(),
        {
          signal: AbortSignal.timeout(10000), // 10 second timeout
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();

      if (!data.models || !Array.isArray(data.models)) {
        throw new Error('Invalid response format from Ollama API');
      }

      return data.models
        .filter((model: any) => model.name)
        .map((model: any) => model.name)
        .sort();
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error(
          'Request timed out. Please check if Ollama is running.'
        );
      }
      throw error;
    }
  }

  private async queryLMStudioModels(
    settings: TitleGeneratorSettings
  ): Promise<string[]> {
    if (!settings.lmstudioUrl.trim()) {
      throw new Error('LM Studio URL not set');
    }

    try {
      const url = new URL('/v1/models', settings.lmstudioUrl).toString();
      console.log('LM Studio: Attempting to connect to:', url);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `LM Studio API error (${response.status}): ${errorText}`
        );
      }

      const data = await response.json();

      if (!data.data || !Array.isArray(data.data)) {
        throw new Error('Invalid response format from LM Studio API');
      }

      const models = data.data
        .filter((model: any) => model.id)
        .map((model: any) => model.id)
        .sort();

      console.log('LM Studio: Successfully loaded models:', models);
      return models;
    } catch (error) {
      console.error('LM Studio connection error:', error);

      if (error.name === 'AbortError') {
        throw new Error(
          'Request timed out. Please check if LM Studio server is running.'
        );
      }

      // Handle CORS errors specifically
      if (
        error.message.includes('CORS') ||
        error.message.includes('cross-origin')
      ) {
        throw new Error(
          'CORS error: LM Studio server needs to allow cross-origin requests. Please check LM Studio CORS settings.'
        );
      }

      // Handle network errors
      if (
        error.message.includes('fetch') ||
        error.message.includes('Failed to fetch')
      ) {
        const urlCheck = settings.lmstudioUrl.toLowerCase();
        let suggestions = [];

        if (urlCheck.includes('localhost') || urlCheck.includes('127.0.0.1')) {
          suggestions.push(
            "Try using your computer's IP address instead of localhost"
          );
        }

        if (!urlCheck.includes('192.168.')) {
          suggestions.push(
            'For WSL users, try using the Windows host IP (e.g., 192.168.68.145:1234)'
          );
        }

        suggestions.push('Ensure LM Studio server is running and accessible');
        suggestions.push('Check if firewall is blocking the connection');

        throw new Error(
          `Cannot connect to LM Studio server at ${settings.lmstudioUrl}. ${suggestions.join('. ')}.`
        );
      }

      throw error;
    }
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
