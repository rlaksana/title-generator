/**
 * Centralized logging service for the Title Generator plugin
 * Controls debug output and provides structured logging
 */

export interface LoggerConfig {
  debugMode: boolean;
  pluginName: string;
}

export class Logger {
  private config: LoggerConfig;

  constructor(config: LoggerConfig) {
    this.config = config;
  }

  /**
   * Update logger configuration
   */
  updateConfig(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Log debug information (only when debug mode is enabled)
   */
  debug(message: string, ...args: any[]): void {
    if (this.config.debugMode) {
      console.log(`[${this.config.pluginName}] DEBUG: ${message}`, ...args);
    }
  }

  /**
   * Log information (always logged)
   */
  info(message: string, ...args: any[]): void {
    console.log(`[${this.config.pluginName}] INFO: ${message}`, ...args);
  }

  /**
   * Log warnings (always logged)
   */
  warn(message: string, ...args: any[]): void {
    console.warn(`[${this.config.pluginName}] WARN: ${message}`, ...args);
  }

  /**
   * Log errors (always logged)
   */
  error(message: string, ...args: any[]): void {
    console.error(`[${this.config.pluginName}] ERROR: ${message}`, ...args);
  }

  /**
   * Log with custom level
   */
  log(level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR', message: string, ...args: any[]): void {
    switch (level) {
      case 'DEBUG':
        this.debug(message, ...args);
        break;
      case 'INFO':
        this.info(message, ...args);
        break;
      case 'WARN':
        this.warn(message, ...args);
        break;
      case 'ERROR':
        this.error(message, ...args);
        break;
    }
  }

  /**
   * Log API requests while masking sensitive data
   */
  logApiRequest(url: string, method: string, hasApiKey: boolean): void {
    this.debug(`API Request: ${method} ${url}`, {
      method,
      url: this.maskSensitiveUrl(url),
      hasApiKey,
    });
  }

  /**
   * Log API responses while masking sensitive data
   */
  logApiResponse(status: number, provider: string, success: boolean): void {
    this.debug(`API Response: ${provider}`, {
      status,
      provider,
      success,
    });
  }

  /**
   * Log settings changes (excluding sensitive data)
   */
  logSettingsChange(setting: string, oldValue: any, newValue: any): void {
    const safeOldValue = this.maskSensitiveData(setting, oldValue);
    const safeNewValue = this.maskSensitiveData(setting, newValue);
    
    this.debug(`Settings changed: ${setting}`, {
      setting,
      oldValue: safeOldValue,
      newValue: safeNewValue,
    });
  }

  /**
   * Mask sensitive data in URLs
   */
  private maskSensitiveUrl(url: string): string {
    return url.replace(/key=([^&]+)/g, 'key=***');
  }

  /**
   * Mask sensitive data based on setting name
   */
  private maskSensitiveData(setting: string, value: any): any {
    if (setting.toLowerCase().includes('apikey') || setting.toLowerCase().includes('key')) {
      return value ? '***' : '';
    }
    return value;
  }
}

// Global logger instance
let loggerInstance: Logger | null = null;

/**
 * Initialize the global logger
 */
export function initializeLogger(config: LoggerConfig): Logger {
  loggerInstance = new Logger(config);
  return loggerInstance;
}

/**
 * Get the global logger instance
 */
export function getLogger(): Logger {
  if (!loggerInstance) {
    throw new Error('Logger not initialized. Call initializeLogger first.');
  }
  return loggerInstance;
}

/**
 * Update global logger configuration
 */
export function updateLoggerConfig(config: Partial<LoggerConfig>): void {
  if (loggerInstance) {
    loggerInstance.updateConfig(config);
  }
}