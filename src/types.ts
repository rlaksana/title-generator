/* eslint-disable @typescript-eslint/no-empty-interface */

/**
 * Defines the available AI providers.
 */
export type AIProvider =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'ollama'
  | 'lmstudio';

/**
 * Defines the structure for AI provider details, including their name,
 * supported models, and whether they require an API key.
 */
export interface AIProviderDetails {
  name: string;
  models: string[];
  requiresApiKey: boolean;
}

/**
 * Cached model information for a provider
 */
export interface CachedModels {
  models: string[];
  lastUpdated: number;
  error?: string;
}

/**
 * Main settings interface for the plugin.
 */
// Test 3A: Reliability check
export interface TitleGeneratorSettings {
  // Provider Settings
  aiProvider: AIProvider;
  openAiApiKey: string;
  anthropicApiKey: string;
  googleApiKey: string;
  ollamaUrl: string;
  lmstudioUrl: string;

  // Model Settings
  openAiModel: string;
  anthropicModel: string;
  googleModel: string;
  ollamaModel: string;
  lmstudioModel: string;

  // Dynamic Model Caching
  cachedModels: {
    [provider: string]: CachedModels;
  };

  // UI Loading State
  modelLoadingState: {
    [provider: string]: boolean;
  };

  // Title Settings
  lowerCaseTitles: boolean;
  removeForbiddenChars: boolean;

  // Prompt and Content Settings
  customPrompt: string;
  temperature: number;
  maxTitleLength: number;
  maxContentLength: number; // New setting for content slicing
  refinePrompt: string; // New setting for the refinement prompt
}
