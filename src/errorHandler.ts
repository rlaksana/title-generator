import { Notice } from 'obsidian';
import { getLogger } from './logger';
import { ERROR_MESSAGES, UI_CONFIG } from './constants';
import type { AIProvider } from './types';

/**
 * Enhanced error class with additional context
 */
export class TitleGeneratorError extends Error {
  public readonly code: string;
  public readonly provider?: AIProvider;
  public readonly statusCode?: number;
  public readonly userMessage: string;
  public readonly context?: any;

  constructor(
    message: string,
    code: string,
    userMessage: string,
    provider?: AIProvider,
    statusCode?: number,
    context?: any
  ) {
    super(message);
    this.name = 'TitleGeneratorError';
    this.code = code;
    this.provider = provider;
    this.statusCode = statusCode;
    this.userMessage = userMessage;
    this.context = context;
  }
}

/**
 * Error types for better categorization
 */
export enum ErrorType {
  CONFIGURATION = 'CONFIGURATION',
  API = 'API',
  NETWORK = 'NETWORK',
  VALIDATION = 'VALIDATION',
  FILE_OPERATION = 'FILE_OPERATION',
  GENERATION = 'GENERATION',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Centralized error handling service
 */
export class ErrorHandler {
  private logger = getLogger();

  /**
   * Handle and process errors with appropriate user feedback
   */
  public handleError(error: Error | TitleGeneratorError, context?: any): void {
    const processedError = this.processError(error, context);
    
    // Log the error
    this.logger.error('Error occurred', {
      message: processedError.message,
      code: processedError.code,
      provider: processedError.provider,
      statusCode: processedError.statusCode,
      context: processedError.context,
      stack: error.stack,
    });

    // Show user-friendly notification
    this.showUserNotification(processedError);
  }

  /**
   * Process raw errors into TitleGeneratorError format
   */
  private processError(error: Error | TitleGeneratorError, context?: any): TitleGeneratorError {
    if (error instanceof TitleGeneratorError) {
      return error;
    }

    // Analyze error message to determine type and create appropriate user message
    const errorMessage = error.message.toLowerCase();
    
    // API-related errors
    if (errorMessage.includes('api key')) {
      return new TitleGeneratorError(
        error.message,
        'API_KEY_ERROR',
        ERROR_MESSAGES.NO_API_KEY,
        context?.provider,
        undefined,
        context
      );
    }

    if (errorMessage.includes('unauthorized') || errorMessage.includes('401')) {
      return new TitleGeneratorError(
        error.message,
        'UNAUTHORIZED',
        'Invalid API key. Please check your credentials and try again.',
        context?.provider,
        401,
        context
      );
    }

    if (errorMessage.includes('forbidden') || errorMessage.includes('403')) {
      return new TitleGeneratorError(
        error.message,
        'FORBIDDEN',
        'Access denied. Please check your API key permissions.',
        context?.provider,
        403,
        context
      );
    }

    if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
      return new TitleGeneratorError(
        error.message,
        'RATE_LIMIT',
        ERROR_MESSAGES.RATE_LIMIT_ERROR,
        context?.provider,
        429,
        context
      );
    }

    if (errorMessage.includes('timeout')) {
      return new TitleGeneratorError(
        error.message,
        'TIMEOUT',
        ERROR_MESSAGES.TIMEOUT_ERROR,
        context?.provider,
        undefined,
        context
      );
    }

    if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
      return new TitleGeneratorError(
        error.message,
        'NETWORK_ERROR',
        ERROR_MESSAGES.NETWORK_ERROR,
        context?.provider,
        undefined,
        context
      );
    }

    if (errorMessage.includes('server error') || errorMessage.includes('500')) {
      return new TitleGeneratorError(
        error.message,
        'SERVER_ERROR',
        'Server error. Please try again later.',
        context?.provider,
        500,
        context
      );
    }

    // Generation-related errors
    if (errorMessage.includes('model') && errorMessage.includes('not') && errorMessage.includes('selected')) {
      return new TitleGeneratorError(
        error.message,
        'MODEL_NOT_SELECTED',
        ERROR_MESSAGES.NO_MODEL_SELECTED,
        context?.provider,
        undefined,
        context
      );
    }

    if (errorMessage.includes('empty') && errorMessage.includes('content')) {
      return new TitleGeneratorError(
        error.message,
        'EMPTY_CONTENT',
        ERROR_MESSAGES.EMPTY_CONTENT,
        undefined,
        undefined,
        context
      );
    }

    // File operation errors
    if (errorMessage.includes('file') && errorMessage.includes('not found')) {
      return new TitleGeneratorError(
        error.message,
        'FILE_NOT_FOUND',
        ERROR_MESSAGES.FILE_NOT_FOUND,
        undefined,
        undefined,
        context
      );
    }

    if (errorMessage.includes('rename') && errorMessage.includes('failed')) {
      return new TitleGeneratorError(
        error.message,
        'RENAME_FAILED',
        ERROR_MESSAGES.RENAME_FAILED,
        undefined,
        undefined,
        context
      );
    }

    // Generic fallback
    return new TitleGeneratorError(
      error.message,
      'UNKNOWN_ERROR',
      ERROR_MESSAGES.UNEXPECTED_ERROR,
      context?.provider,
      undefined,
      context
    );
  }

  /**
   * Show user-friendly notification
   */
  private showUserNotification(error: TitleGeneratorError): void {
    const duration = this.getNotificationDuration(error);
    new Notice(error.userMessage, duration);
  }

  /**
   * Get appropriate notification duration based on error severity
   */
  private getNotificationDuration(error: TitleGeneratorError): number {
    switch (error.code) {
      case 'API_KEY_ERROR':
      case 'UNAUTHORIZED':
      case 'FORBIDDEN':
        return UI_CONFIG.NOTIFICATION_DURATION.LONG;
      
      case 'RATE_LIMIT':
      case 'TIMEOUT':
      case 'NETWORK_ERROR':
        return UI_CONFIG.NOTIFICATION_DURATION.MEDIUM;
      
      default:
        return UI_CONFIG.NOTIFICATION_DURATION.SHORT;
    }
  }

  /**
   * Create a configuration error
   */
  public createConfigurationError(message: string, provider?: AIProvider): TitleGeneratorError {
    return new TitleGeneratorError(
      message,
      'CONFIGURATION_ERROR',
      ERROR_MESSAGES.CONFIGURATION_ERROR,
      provider,
      undefined,
      { type: ErrorType.CONFIGURATION }
    );
  }

  /**
   * Create an API error
   */
  public createApiError(
    message: string,
    provider: AIProvider,
    statusCode?: number,
    context?: any
  ): TitleGeneratorError {
    return new TitleGeneratorError(
      message,
      'API_ERROR',
      ERROR_MESSAGES.API_ERROR,
      provider,
      statusCode,
      { type: ErrorType.API, ...context }
    );
  }

  /**
   * Create a validation error
   */
  public createValidationError(message: string, field?: string): TitleGeneratorError {
    return new TitleGeneratorError(
      message,
      'VALIDATION_ERROR',
      `Invalid ${field || 'input'}. Please check your settings.`,
      undefined,
      undefined,
      { type: ErrorType.VALIDATION, field }
    );
  }

  /**
   * Create a generation error
   */
  public createGenerationError(message: string, provider?: AIProvider): TitleGeneratorError {
    return new TitleGeneratorError(
      message,
      'GENERATION_ERROR',
      ERROR_MESSAGES.GENERATION_FAILED,
      provider,
      undefined,
      { type: ErrorType.GENERATION }
    );
  }

  /**
   * Handle multiple errors (for batch operations)
   */
  public handleMultipleErrors(errors: (Error | TitleGeneratorError)[], context?: any): void {
    const processedErrors = errors.map(error => this.processError(error, context));
    
    // Log all errors
    this.logger.error('Multiple errors occurred', {
      errorCount: processedErrors.length,
      errors: processedErrors.map(e => ({
        code: e.code,
        message: e.message,
        provider: e.provider,
      })),
      context,
    });

    // Show summarized notification
    const errorCount = processedErrors.length;
    const uniqueTypes = [...new Set(processedErrors.map(e => e.code))];
    
    if (uniqueTypes.length === 1) {
      new Notice(
        `${errorCount} operations failed: ${processedErrors[0].userMessage}`,
        UI_CONFIG.NOTIFICATION_DURATION.MEDIUM
      );
    } else {
      new Notice(
        `${errorCount} operations failed with various errors. Check console for details.`,
        UI_CONFIG.NOTIFICATION_DURATION.MEDIUM
      );
    }
  }

  /**
   * Check if error is retryable
   */
  public isRetryableError(error: Error | TitleGeneratorError): boolean {
    if (error instanceof TitleGeneratorError) {
      return ['TIMEOUT', 'NETWORK_ERROR', 'RATE_LIMIT', 'SERVER_ERROR'].includes(error.code);
    }
    
    const message = error.message.toLowerCase();
    return message.includes('timeout') || 
           message.includes('network') || 
           message.includes('rate limit') || 
           message.includes('server error');
  }
}

// Global error handler instance
let errorHandlerInstance: ErrorHandler | null = null;

/**
 * Initialize the global error handler
 */
export function initializeErrorHandler(): ErrorHandler {
  errorHandlerInstance = new ErrorHandler();
  return errorHandlerInstance;
}

/**
 * Get the global error handler instance
 */
export function getErrorHandler(): ErrorHandler {
  if (!errorHandlerInstance) {
    throw new Error('ErrorHandler not initialized. Call initializeErrorHandler first.');
  }
  return errorHandlerInstance;
}