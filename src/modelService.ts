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
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
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

    // Final fallback to hardcoded models
    return this.getFallbackModels(provider);
  }

  /**
   * Force refresh models for a provider
   */
  async refreshModels(provider: AIProvider): Promise<string[]> {
    const settings = this.getSettings();
    
    // Set loading state
    settings.modelLoadingState[provider] = true;
    await this.saveSettings();

    try {
      const models = await this.queryModels(provider);
      await this.cacheModels(provider, models);
      return models;
    } catch (error) {
      console.error(`Failed to refresh models for ${provider}:`, error);
      const errorMessage = this.getErrorMessage(error);
      await this.cacheError(provider, errorMessage);
      new Notice(`Failed to load models for ${provider}: ${errorMessage}`, 7000);
      return this.getFallbackModels(provider);
    } finally {
      // Clear loading state
      settings.modelLoadingState[provider] = false;
      await this.saveSettings();
    }
  }

  /**
   * Query models from API for specific provider
   */
  private async queryModels(provider: AIProvider): Promise<string[]> {
    const settings = this.getSettings();

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

  private async queryOpenAIModels(settings: TitleGeneratorSettings): Promise<string[]> {
    if (!settings.openAiApiKey.trim()) {
      throw new Error('OpenAI API key not set');
    }

    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${settings.openAiApiKey}`,
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
        throw new Error('Request timed out. Please check your internet connection.');
      }
      throw error;
    }
  }

  private async queryAnthropicModels(settings: TitleGeneratorSettings): Promise<string[]> {
    // Anthropic doesn't have a public models API, return static list
    return [
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307',
      'claude-3-5-sonnet-20240620',
    ];
  }

  private async queryGoogleModels(settings: TitleGeneratorSettings): Promise<string[]> {
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
        .filter((model: any) => model.supportedGenerationMethods?.includes('generateContent'))
        .map((model: any) => model.name.replace('models/', ''))
        .sort();
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Request timed out. Please check your internet connection.');
      }
      throw error;
    }
  }

  private async queryOllamaModels(settings: TitleGeneratorSettings): Promise<string[]> {
    if (!settings.ollamaUrl.trim()) {
      throw new Error('Ollama URL not set');
    }

    try {
      const response = await fetch(new URL('/api/tags', settings.ollamaUrl).toString(), {
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

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
        throw new Error('Request timed out. Please check if Ollama is running.');
      }
      throw error;
    }
  }

  private async queryLMStudioModels(settings: TitleGeneratorSettings): Promise<string[]> {
    if (!settings.lmstudioUrl.trim()) {
      throw new Error('LM Studio URL not set');
    }

    try {
      const response = await fetch(new URL('/v1/models', settings.lmstudioUrl).toString(), {
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LM Studio API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      
      if (!data.data || !Array.isArray(data.data)) {
        throw new Error('Invalid response format from LM Studio API');
      }

      return data.data
        .filter((model: any) => model.id)
        .map((model: any) => model.id)
        .sort();
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Request timed out. Please check if LM Studio server is running.');
      }
      throw error;
    }
  }

  private async cacheModels(provider: AIProvider, models: string[]): Promise<void> {
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

  private getFallbackModels(provider: AIProvider): string[] {
    switch (provider) {
      case 'openai':
        return ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'];
      case 'anthropic':
        return ['claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'];
      case 'google':
        return ['gemini-1.5-pro-latest', 'gemini-1.5-flash-latest', 'gemini-1.0-pro'];
      case 'ollama':
        return ['llama3', 'llama2', 'mistral', 'codellama', 'phi3'];
      case 'lmstudio':
        return ['llama-3', 'mistral-7b', 'codellama', 'phi-3', 'qwen2', 'gemma2'];
      default:
        return [];
    }
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