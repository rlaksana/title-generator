/**
 * Enhanced TypeScript types for the Title Generator plugin
 */

/**
 * Defines the available AI providers.
 */
export type AIProvider = 'openai' | 'anthropic' | 'google';

/**
 * Provider configuration interface
 */
export interface ProviderConfig {
  name: string;
  apiKeyField: keyof TitleGeneratorSettings;
  modelField: keyof TitleGeneratorSettings;
  requiresApiKey: boolean;
  supportsTemperature: boolean;
  defaultModels: string[];
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
 * API request configuration
 */
export interface ApiRequestConfig {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers: Record<string, string>;
  body?: string;
  timeout?: number;
}

/**
 * API response interface for OpenAI
 */
export interface OpenAIResponse {
  choices: Array<{
    message: {
      content: string;
      role: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * API response interface for Anthropic
 */
export interface AnthropicResponse {
  content: Array<{
    text: string;
    type: string;
  }>;
  stop_reason: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * API response interface for Google
 */
export interface GoogleResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text: string;
      }>;
    };
    finishReason: string;
    safetyRatings?: Array<{
      category: string;
      probability: string;
    }>;
  }>;
}

/**
 * Model list response for OpenAI
 */
export interface OpenAIModelsResponse {
  data: Array<{
    id: string;
    object: string;
    created: number;
    owned_by: string;
  }>;
}

/**
 * Model list response for Anthropic
 */
export interface AnthropicModelsResponse {
  data: Array<{
    id: string;
    type: string;
    display_name: string;
    created_at: string;
  }>;
}

/**
 * Model list response for Google
 */
export interface GoogleModelsResponse {
  models: Array<{
    name: string;
    displayName: string;
    description: string;
    supportedGenerationMethods: string[];
  }>;
}

/**
 * Title generation options
 */
export interface TitleGenerationOptions {
  content: string;
  maxLength: number;
  temperature: number;
  prompt: string;
  refinePrompt: string;
  maxAttempts: number;
}

/**
 * Title generation result
 */
export interface TitleGenerationResult {
  title: string;
  success: boolean;
  attempts: number;
  error?: string;
  tokensUsed?: number;
}

/**
 * File operation result
 */
export interface FileOperationResult {
  success: boolean;
  originalPath: string;
  newPath?: string;
  error?: string;
}

/**
 * Batch operation progress
 */
export interface BatchOperationProgress {
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  current?: string;
}

/**
 * Plugin event types
 */
export type PluginEventType = 
  | 'title-generated'
  | 'file-renamed'
  | 'settings-changed'
  | 'model-loaded'
  | 'batch-started'
  | 'batch-completed'
  | 'error-occurred';

/**
 * Plugin event data
 */
export interface PluginEvent {
  type: PluginEventType;
  timestamp: number;
  data: Record<string, unknown>;
}

/**
 * DOM element references for UI components
 */
export interface UIElements {
  textInput: HTMLInputElement;
  dropdown: HTMLDivElement;
  saveButton: HTMLButtonElement;
  cancelButton: HTMLButtonElement;
  refreshButton: HTMLButtonElement;
}

/**
 * Duplicate detection sensitivity levels
 */
export type DuplicateDetectionSensitivity = 'strict' | 'normal' | 'loose';

/**
 * Represents a title match found in content
 */
export interface TitleMatch {
  startIndex: number;
  endIndex: number;
  matchedText: string;
  similarity: number;
  lineNumber: number;
  isMarkdownHeader: boolean;
  headerLevel?: number;
}

/**
 * Result of duplicate detection in content
 */
export interface DuplicateDetectionResult {
  found: boolean;
  matches: TitleMatch[];
  contentWithoutDuplicates?: string;
  totalMatches: number;
}

/**
 * Configuration for content modification
 */
export interface ContentModificationOptions {
  removeAllMatches: boolean;
  preserveFormatting: boolean;
  confirmBeforeRemoval: boolean;
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

  // Model Settings
  openAiModel: string;
  anthropicModel: string;
  googleModel: string;

  // Dynamic Model Caching
  cachedModels: Record<AIProvider, CachedModels>;

  // UI Loading State
  modelLoadingState: Record<AIProvider, boolean>;

  // Title Settings
  lowerCaseTitles: boolean;
  removeForbiddenChars: boolean;
  debugMode: boolean;

  // Prompt and Content Settings
  customPrompt: string;
  temperature: number;
  maxTitleLength: number;
  maxContentLength: number;
  refinePrompt: string;

  // Duplicate Detection Settings
  enableDuplicateRemoval: boolean;
  duplicateDetectionSensitivity: DuplicateDetectionSensitivity;
  autoRemoveDuplicates: boolean;
  confirmBeforeRemoval: boolean;
  removeOnlyExactMatches: boolean;
}
