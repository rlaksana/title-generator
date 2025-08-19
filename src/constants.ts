/**
 * Constants for the Title Generator plugin
 * Centralized location for all hardcoded values
 */

export const PLUGIN_NAME = 'Title Generator';
export const PLUGIN_ID = 'title-generator';

// API Configuration
export const API_CONFIG = {
  TIMEOUT: 30000, // 30 seconds
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000, // 1 second
  
  // API Endpoints
  OPENAI: {
    BASE_URL: 'https://api.openai.com/v1',
    CHAT_COMPLETIONS: '/chat/completions',
    MODELS: '/models',
    HEADERS: {
      'Content-Type': 'application/json',
    },
  },
  
  ANTHROPIC: {
    BASE_URL: 'https://api.anthropic.com/v1',
    MESSAGES: '/messages',
    MODELS: '/models',
    VERSION: '2023-06-01',
    HEADERS: {
      'Content-Type': 'application/json',
    },
  },
  
  GOOGLE: {
    BASE_URL: 'https://generativelanguage.googleapis.com/v1beta',
    MODELS: '/models',
    HEADERS: {
      'Content-Type': 'application/json',
    },
  },
} as const;

// Model Configuration
export const MODEL_CONFIG = {
  CACHE_DURATION: 3600000, // 1 hour in milliseconds
  DEFAULT_TEMPERATURE: 0.3,
  MIN_TEMPERATURE: 0.0,
  MAX_TEMPERATURE: 1.0,
  TEMPERATURE_STEP: 0.01,
  
  // Model filtering
  OPENAI_FILTER: 'gpt',
  ANTHROPIC_FILTER: 'claude',
  GOOGLE_FILTER: 'gemini',
} as const;

// Title Generation Configuration
export const TITLE_CONFIG = {
  DEFAULT_MAX_LENGTH: 60,
  MIN_MAX_LENGTH: 10,
  MAX_MAX_LENGTH: 500,
  DEFAULT_MAX_CONTENT_LENGTH: 2000,
  MIN_MAX_CONTENT_LENGTH: 100,
  MAX_MAX_CONTENT_LENGTH: 10000,
  
  // Generation attempts
  MAX_GENERATION_ATTEMPTS: 3,
  
  // Default prompts
  DEFAULT_PROMPT: 'Create a concise title for this text. Respond with ONLY the title - no explanations, quotes, or extra text. Maximum {max_length} characters.',
  DEFAULT_REFINE_PROMPT: 'Make this title shorter (under {max_length} characters): "{title}". Respond with ONLY the new title.',
  
  // Forbidden filename characters (OS-specific)
  FORBIDDEN_CHARS: /[<>:"\/\\|?*\x00-\x1F]/g,
  
  // Fallback title
  FALLBACK_TITLE: 'Untitled',
} as const;

// UI Configuration
export const UI_CONFIG = {
  // Notifications
  NOTIFICATION_DURATION: {
    SHORT: 3000,
    MEDIUM: 5000,
    LONG: 8000,
  },
  
  // Loading states
  LOADING_TIMEOUT: 10000, // 10 seconds
  
  // Search/dropdown configuration
  SEARCH_DEBOUNCE: 300,
  MAX_DROPDOWN_HEIGHT: 200,
  
  // CSS Classes
  CSS_CLASSES: {
    SEARCH_CONTAINER: 'model-search-container',
    SEARCH_RESULTS: 'search-results',
    SEARCH_ITEM: 'search-result-item',
    SEARCH_ITEM_SELECTED: 'is-selected',
    SEARCH_ITEM_HOVER: 'search-result-item:hover',
  },
} as const;

// Error Messages
export const ERROR_MESSAGES = {
  // Configuration errors
  NO_API_KEY: 'API key is not set. Please configure it in plugin settings.',
  NO_MODEL_SELECTED: 'Model is not selected. Please select a model in the plugin settings.',
  INVALID_PROVIDER: 'Invalid AI provider selected. Please check plugin settings.',
  
  // API errors
  API_ERROR: 'API service error. Check your API key and internet connection.',
  NETWORK_ERROR: 'Network error. Please check your internet connection.',
  TIMEOUT_ERROR: 'Request timed out. Please try again.',
  RATE_LIMIT_ERROR: 'Rate limit exceeded. Please wait and try again.',
  
  // Generation errors
  GENERATION_FAILED: 'Title generation failed. Please try again.',
  EMPTY_CONTENT: 'Note is empty. Cannot generate title.',
  INVALID_RESPONSE: 'Invalid response from AI service.',
  
  // File operation errors
  FILE_NOT_FOUND: 'File not found or cannot be accessed.',
  RENAME_FAILED: 'Failed to rename file. Please try again.',
  
  // Generic errors
  UNEXPECTED_ERROR: 'An unexpected error occurred. Please try again.',
  CONFIGURATION_ERROR: 'Configuration error. Please check your settings.',
} as const;

// Success Messages
export const SUCCESS_MESSAGES = {
  TITLE_GENERATED: 'Title generated successfully',
  SETTINGS_SAVED: 'Settings saved successfully',
  MODELS_LOADED: 'Models loaded successfully',
  BATCH_COMPLETE: 'Batch title generation completed',
} as const;

// Validation Rules
export const VALIDATION_RULES = {
  API_KEY: {
    MIN_LENGTH: 10,
    MAX_LENGTH: 200,
    PATTERN: /^[a-zA-Z0-9\-_\.]+$/,
  },
  
  MODEL_NAME: {
    MIN_LENGTH: 1,
    MAX_LENGTH: 100,
    PATTERN: /^[a-zA-Z0-9\-_\.]+$/,
  },
  
  PROMPT: {
    MIN_LENGTH: 10,
    MAX_LENGTH: 1000,
    REQUIRED_PLACEHOLDER: '{max_length}',
  },
  
  REFINE_PROMPT: {
    MIN_LENGTH: 10,
    MAX_LENGTH: 1000,
    REQUIRED_PLACEHOLDERS: ['{max_length}', '{title}'],
  },
} as const;

// File Extensions
export const FILE_EXTENSIONS = {
  MARKDOWN: '.md',
  JSON: '.json',
  JAVASCRIPT: '.js',
  TYPESCRIPT: '.ts',
} as const;

// Provider-specific configurations
export const PROVIDER_CONFIG = {
  openai: {
    name: 'OpenAI',
    apiKeyField: 'openAiApiKey',
    modelField: 'openAiModel',
    requiresApiKey: true,
    supportsTemperature: true,
    defaultModels: ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  },
  anthropic: {
    name: 'Anthropic',
    apiKeyField: 'anthropicApiKey',
    modelField: 'anthropicModel',
    requiresApiKey: true,
    supportsTemperature: true,
    defaultModels: ['claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'],
  },
  google: {
    name: 'Google Gemini',
    apiKeyField: 'googleApiKey',
    modelField: 'googleModel',
    requiresApiKey: true,
    supportsTemperature: true,
    defaultModels: ['gemini-1.5-pro-latest', 'gemini-1.5-flash-latest', 'gemini-1.0-pro'],
  },
} as const;

// Regular expressions for cleaning AI responses
export const RESPONSE_CLEANING = {
  THINK_TAGS: /<think>[\s\S]*?<\/think>/g,
  PREFIXES: /^(Title:|Generated title:|Suggested title:|The title:|A title:|Here's the title:|Sure, here|I'll|I would|Based on)/i,
  QUOTES: /["']/g,
  MULTIPLE_SPACES: /\s+/g,
  LEADING_TRAILING_DOTS: /^[ .]+|[ .]+$/g,
} as const;

