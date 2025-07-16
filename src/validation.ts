import { VALIDATION_RULES, TITLE_CONFIG, MODEL_CONFIG } from './constants';
import { TitleGeneratorError } from './errorHandler';
import type { AIProvider, TitleGeneratorSettings } from './types';

/**
 * Validation result interface
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validation service for input sanitization and validation
 */
export class ValidationService {
  /**
   * Validate API key format and length
   */
  public validateApiKey(apiKey: string, provider: AIProvider): ValidationResult {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
    };

    if (!apiKey || typeof apiKey !== 'string') {
      result.valid = false;
      result.errors.push('API key is required');
      return result;
    }

    const trimmedKey = apiKey.trim();
    
    if (trimmedKey.length === 0) {
      result.valid = false;
      result.errors.push('API key cannot be empty');
      return result;
    }

    if (trimmedKey.length < VALIDATION_RULES.API_KEY.MIN_LENGTH) {
      result.valid = false;
      result.errors.push(`API key must be at least ${VALIDATION_RULES.API_KEY.MIN_LENGTH} characters long`);
    }

    if (trimmedKey.length > VALIDATION_RULES.API_KEY.MAX_LENGTH) {
      result.valid = false;
      result.errors.push(`API key must be no more than ${VALIDATION_RULES.API_KEY.MAX_LENGTH} characters long`);
    }

    // Provider-specific validation
    switch (provider) {
      case 'openai':
        if (!trimmedKey.startsWith('sk-')) {
          result.warnings.push('OpenAI API keys typically start with "sk-"');
        }
        break;
      case 'anthropic':
        if (!trimmedKey.startsWith('sk-ant-')) {
          result.warnings.push('Anthropic API keys typically start with "sk-ant-"');
        }
        break;
      case 'google':
        if (trimmedKey.length < 20) {
          result.warnings.push('Google API keys are typically longer than 20 characters');
        }
        break;
    }

    return result;
  }

  /**
   * Validate model name
   */
  public validateModelName(modelName: string, provider: AIProvider): ValidationResult {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
    };

    if (!modelName || typeof modelName !== 'string') {
      result.valid = false;
      result.errors.push('Model name is required');
      return result;
    }

    const trimmedName = modelName.trim();
    
    if (trimmedName.length === 0) {
      result.valid = false;
      result.errors.push('Model name cannot be empty');
      return result;
    }

    if (trimmedName.length < VALIDATION_RULES.MODEL_NAME.MIN_LENGTH) {
      result.valid = false;
      result.errors.push(`Model name must be at least ${VALIDATION_RULES.MODEL_NAME.MIN_LENGTH} character long`);
    }

    if (trimmedName.length > VALIDATION_RULES.MODEL_NAME.MAX_LENGTH) {
      result.valid = false;
      result.errors.push(`Model name must be no more than ${VALIDATION_RULES.MODEL_NAME.MAX_LENGTH} characters long`);
    }

    // Provider-specific validation
    switch (provider) {
      case 'openai':
        if (!trimmedName.includes('gpt')) {
          result.warnings.push('OpenAI models typically contain "gpt" in the name');
        }
        break;
      case 'anthropic':
        if (!trimmedName.includes('claude')) {
          result.warnings.push('Anthropic models typically contain "claude" in the name');
        }
        break;
      case 'google':
        if (!trimmedName.includes('gemini')) {
          result.warnings.push('Google models typically contain "gemini" in the name');
        }
        break;
    }

    return result;
  }

  /**
   * Validate prompt template
   */
  public validatePrompt(prompt: string, isRefinementPrompt = false): ValidationResult {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
    };

    if (!prompt || typeof prompt !== 'string') {
      result.valid = false;
      result.errors.push('Prompt is required');
      return result;
    }

    const trimmedPrompt = prompt.trim();
    
    if (trimmedPrompt.length === 0) {
      result.valid = false;
      result.errors.push('Prompt cannot be empty');
      return result;
    }

    const rules = isRefinementPrompt ? VALIDATION_RULES.REFINE_PROMPT : VALIDATION_RULES.PROMPT;
    
    if (trimmedPrompt.length < rules.MIN_LENGTH) {
      result.valid = false;
      result.errors.push(`Prompt must be at least ${rules.MIN_LENGTH} characters long`);
    }

    if (trimmedPrompt.length > rules.MAX_LENGTH) {
      result.valid = false;
      result.errors.push(`Prompt must be no more than ${rules.MAX_LENGTH} characters long`);
    }

    // Check for required placeholders
    if (isRefinementPrompt) {
      const requiredPlaceholders = VALIDATION_RULES.REFINE_PROMPT.REQUIRED_PLACEHOLDERS;
      for (const placeholder of requiredPlaceholders) {
        if (!trimmedPrompt.includes(placeholder)) {
          result.valid = false;
          result.errors.push(`Refinement prompt must contain placeholder: ${placeholder}`);
        }
      }
    } else {
      if (!trimmedPrompt.includes(VALIDATION_RULES.PROMPT.REQUIRED_PLACEHOLDER)) {
        result.valid = false;
        result.errors.push(`Prompt must contain placeholder: ${VALIDATION_RULES.PROMPT.REQUIRED_PLACEHOLDER}`);
      }
    }

    return result;
  }

  /**
   * Validate temperature value
   */
  public validateTemperature(temperature: number): ValidationResult {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
    };

    if (typeof temperature !== 'number' || isNaN(temperature)) {
      result.valid = false;
      result.errors.push('Temperature must be a number');
      return result;
    }

    if (temperature < MODEL_CONFIG.MIN_TEMPERATURE) {
      result.valid = false;
      result.errors.push(`Temperature must be at least ${MODEL_CONFIG.MIN_TEMPERATURE}`);
    }

    if (temperature > MODEL_CONFIG.MAX_TEMPERATURE) {
      result.valid = false;
      result.errors.push(`Temperature must be no more than ${MODEL_CONFIG.MAX_TEMPERATURE}`);
    }

    // Warnings for extreme values
    if (temperature === 0) {
      result.warnings.push('Temperature of 0 will produce very predictable results');
    } else if (temperature >= 0.9) {
      result.warnings.push('High temperature values may produce inconsistent results');
    }

    return result;
  }

  /**
   * Validate max title length
   */
  public validateMaxTitleLength(length: number): ValidationResult {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
    };

    if (typeof length !== 'number' || isNaN(length) || !Number.isInteger(length)) {
      result.valid = false;
      result.errors.push('Max title length must be a whole number');
      return result;
    }

    if (length < TITLE_CONFIG.MIN_MAX_LENGTH) {
      result.valid = false;
      result.errors.push(`Max title length must be at least ${TITLE_CONFIG.MIN_MAX_LENGTH}`);
    }

    if (length > TITLE_CONFIG.MAX_MAX_LENGTH) {
      result.valid = false;
      result.errors.push(`Max title length must be no more than ${TITLE_CONFIG.MAX_MAX_LENGTH}`);
    }

    // Warnings for extreme values
    if (length < 30) {
      result.warnings.push('Short titles may not be descriptive enough');
    } else if (length > 100) {
      result.warnings.push('Long titles may not be suitable for all file systems');
    }

    return result;
  }

  /**
   * Validate max content length
   */
  public validateMaxContentLength(length: number): ValidationResult {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
    };

    if (typeof length !== 'number' || isNaN(length) || !Number.isInteger(length)) {
      result.valid = false;
      result.errors.push('Max content length must be a whole number');
      return result;
    }

    if (length < TITLE_CONFIG.MIN_MAX_CONTENT_LENGTH) {
      result.valid = false;
      result.errors.push(`Max content length must be at least ${TITLE_CONFIG.MIN_MAX_CONTENT_LENGTH}`);
    }

    if (length > TITLE_CONFIG.MAX_MAX_CONTENT_LENGTH) {
      result.valid = false;
      result.errors.push(`Max content length must be no more than ${TITLE_CONFIG.MAX_MAX_CONTENT_LENGTH}`);
    }

    // Warnings for extreme values
    if (length < 500) {
      result.warnings.push('Very short content may not provide enough context for good titles');
    } else if (length > 5000) {
      result.warnings.push('Very long content may increase API costs significantly');
    }

    return result;
  }

  /**
   * Validate entire settings object
   */
  public validateSettings(settings: TitleGeneratorSettings): ValidationResult {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
    };

    // Validate API key for selected provider
    const provider = settings.aiProvider;
    const apiKeyField = this.getApiKeyField(provider);
    const apiKey = settings[apiKeyField] as string;
    
    if (apiKey) {
      const apiKeyValidation = this.validateApiKey(apiKey, provider);
      result.errors.push(...apiKeyValidation.errors);
      result.warnings.push(...apiKeyValidation.warnings);
      if (!apiKeyValidation.valid) {
        result.valid = false;
      }
    } else {
      result.valid = false;
      result.errors.push(`${provider.toUpperCase()} API key is required`);
    }

    // Validate model for selected provider
    const modelField = this.getModelField(provider);
    const model = settings[modelField] as string;
    
    if (model) {
      const modelValidation = this.validateModelName(model, provider);
      result.errors.push(...modelValidation.errors);
      result.warnings.push(...modelValidation.warnings);
      if (!modelValidation.valid) {
        result.valid = false;
      }
    } else {
      result.valid = false;
      result.errors.push(`${provider.toUpperCase()} model is required`);
    }

    // Validate prompts
    const promptValidation = this.validatePrompt(settings.customPrompt);
    result.errors.push(...promptValidation.errors);
    result.warnings.push(...promptValidation.warnings);
    if (!promptValidation.valid) {
      result.valid = false;
    }

    const refinePromptValidation = this.validatePrompt(settings.refinePrompt, true);
    result.errors.push(...refinePromptValidation.errors);
    result.warnings.push(...refinePromptValidation.warnings);
    if (!refinePromptValidation.valid) {
      result.valid = false;
    }

    // Validate temperature
    const temperatureValidation = this.validateTemperature(settings.temperature);
    result.errors.push(...temperatureValidation.errors);
    result.warnings.push(...temperatureValidation.warnings);
    if (!temperatureValidation.valid) {
      result.valid = false;
    }

    // Validate title length
    const titleLengthValidation = this.validateMaxTitleLength(settings.maxTitleLength);
    result.errors.push(...titleLengthValidation.errors);
    result.warnings.push(...titleLengthValidation.warnings);
    if (!titleLengthValidation.valid) {
      result.valid = false;
    }

    // Validate content length
    const contentLengthValidation = this.validateMaxContentLength(settings.maxContentLength);
    result.errors.push(...contentLengthValidation.errors);
    result.warnings.push(...contentLengthValidation.warnings);
    if (!contentLengthValidation.valid) {
      result.valid = false;
    }

    return result;
  }

  /**
   * Sanitize user input to prevent XSS and other issues
   */
  public sanitizeInput(input: string): string {
    if (!input || typeof input !== 'string') {
      return '';
    }

    // Remove or escape potentially dangerous characters
    return input
      .replace(/[<>]/g, '') // Remove HTML tags
      .replace(/[&]/g, '&amp;') // Escape ampersands
      .replace(/['"]/g, '') // Remove quotes
      .trim();
  }

  /**
   * Sanitize filename to be safe for all operating systems
   */
  public sanitizeFilename(filename: string): string {
    if (!filename || typeof filename !== 'string') {
      return TITLE_CONFIG.FALLBACK_TITLE;
    }

    // Remove forbidden characters
    let safe = filename.replace(TITLE_CONFIG.FORBIDDEN_CHARS, '');
    
    // Normalize whitespace
    safe = safe.replace(/\s+/g, ' ').trim();
    
    // Remove leading/trailing dots and spaces
    safe = safe.replace(/^[ .]+|[ .]+$/g, '');
    
    // Return fallback if empty
    return safe.length > 0 ? safe : TITLE_CONFIG.FALLBACK_TITLE;
  }

  /**
   * Validate and sanitize API response
   */
  public validateApiResponse(response: any, provider: AIProvider): ValidationResult {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
    };

    if (!response) {
      result.valid = false;
      result.errors.push('API response is empty');
      return result;
    }

    // Provider-specific validation
    switch (provider) {
      case 'openai':
        if (!response.choices || !Array.isArray(response.choices) || response.choices.length === 0) {
          result.valid = false;
          result.errors.push('Invalid OpenAI response format');
        } else if (!response.choices[0].message?.content) {
          result.valid = false;
          result.errors.push('OpenAI response missing content');
        }
        break;
        
      case 'anthropic':
        if (!response.content || !Array.isArray(response.content) || response.content.length === 0) {
          result.valid = false;
          result.errors.push('Invalid Anthropic response format');
        } else if (!response.content[0].text) {
          result.valid = false;
          result.errors.push('Anthropic response missing text');
        }
        break;
        
      case 'google':
        if (!response.candidates || !Array.isArray(response.candidates) || response.candidates.length === 0) {
          result.valid = false;
          result.errors.push('Invalid Google response format');
        } else if (!response.candidates[0].content?.parts?.[0]?.text) {
          result.valid = false;
          result.errors.push('Google response missing text');
        }
        break;
    }

    return result;
  }

  /**
   * Get API key field name for provider
   */
  private getApiKeyField(provider: AIProvider): keyof TitleGeneratorSettings {
    switch (provider) {
      case 'openai':
        return 'openAiApiKey';
      case 'anthropic':
        return 'anthropicApiKey';
      case 'google':
        return 'googleApiKey';
      default:
        throw new TitleGeneratorError(
          `Unknown provider: ${provider}`,
          'UNKNOWN_PROVIDER',
          'Unknown AI provider'
        );
    }
  }

  /**
   * Get model field name for provider
   */
  private getModelField(provider: AIProvider): keyof TitleGeneratorSettings {
    switch (provider) {
      case 'openai':
        return 'openAiModel';
      case 'anthropic':
        return 'anthropicModel';
      case 'google':
        return 'googleModel';
      default:
        throw new TitleGeneratorError(
          `Unknown provider: ${provider}`,
          'UNKNOWN_PROVIDER',
          'Unknown AI provider'
        );
    }
  }
}

// Global validation service instance
let validationServiceInstance: ValidationService | null = null;

/**
 * Initialize the global validation service
 */
export function initializeValidationService(): ValidationService {
  validationServiceInstance = new ValidationService();
  return validationServiceInstance;
}

/**
 * Get the global validation service instance
 */
export function getValidationService(): ValidationService {
  if (!validationServiceInstance) {
    throw new Error('ValidationService not initialized. Call initializeValidationService first.');
  }
  return validationServiceInstance;
}