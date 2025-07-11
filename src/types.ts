/* eslint-disable @typescript-eslint/no-empty-interface */

/**
 * Defines the available AI providers.
 */
export type AIProvider = 'openai' | 'anthropic' | 'google' | 'ollama' | 'lmstudio';

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
 * Main settings interface for the plugin.
 */
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
