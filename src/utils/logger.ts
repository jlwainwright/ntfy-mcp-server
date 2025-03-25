import fs from 'fs';
import path from 'path';
import winston from 'winston';
import 'winston-daily-rotate-file';
import { BaseErrorCode, McpError } from '../types-global/errors.js';

/**
 * Supported log levels
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Log format types
 */
export type LogFormat = 'json' | 'simple' | 'detailed';

/**
 * Logger configuration options
 */
export interface LoggerConfig {
  /** Log level (debug, info, warn, error) */
  level?: LogLevel;
  /** Directory for log files */
  logDir?: string;
  /** Format for log output */
  format?: LogFormat;
  /** Whether to log to files */
  files?: boolean;
  /** Log rotation settings */
  rotation?: {
    /** Enable log file rotation */
    enabled?: boolean;
    /** Maximum size of each log file before rotation (e.g., "10m", "1g") */
    maxSize?: string;
    /** Maximum number of files to keep */
    maxFiles?: number;
  };
  /** Sensitive data fields that should be redacted from logs */
  sensitiveFields?: string[];
}

/**
 * Logger error that should cause termination
 */
export class LoggerError extends McpError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(BaseErrorCode.INTERNAL_ERROR, message, details);
    this.name = 'LoggerError';
  }
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: LoggerConfig = {
  level: 'info',
  logDir: undefined, // Will be set based on env var, no default
  format: 'detailed',
  files: true,
  rotation: {
    enabled: true,
    maxSize: '50m',
    maxFiles: 10
  },
  sensitiveFields: [
    'password', 'token', 'secret', 'key', 'apiKey', 'auth', 
    'credential', 'jwt', 'ssn', 'credit', 'card', 'cvv', 'authorization'
  ]
};

/**
 * Generic Logger class with configuration options
 * Implements the Singleton pattern for consistent logging across the application
 */
export class Logger {
  private static instance: Logger;
  private logger: winston.Logger;
  private config: LoggerConfig;
  
  /**
   * Private constructor (use getInstance instead)
   * @param config Initial logger configuration
   */
  private constructor(config: LoggerConfig = {}) {
    // Merge provided config with defaults
    this.config = this.mergeConfig(DEFAULT_CONFIG, config);
    
    // Initialize with a silent logger - no console output
    this.logger = winston.createLogger({
      silent: true,
      transports: []
    });
    
    // Only attempt file logging if LOG_FILE_DIR env var is set
    if (process.env.LOG_FILE_DIR) {
      try {
        this.setupFileLogging();
      } catch (error) {
        // Silent fail - no console.log
      }
    }
  }

  /**
   * Merge configurations with proper handling of nested objects
   */
  private mergeConfig(defaultConfig: LoggerConfig, userConfig: LoggerConfig): LoggerConfig {
    return {
      ...defaultConfig,
      ...userConfig,
      rotation: {
        ...defaultConfig.rotation,
        ...userConfig.rotation
      },
      sensitiveFields: [
        ...(defaultConfig.sensitiveFields || []),
        ...(userConfig.sensitiveFields || [])
      ]
    };
  }

  /**
   * Get or create the singleton logger instance
   * @param config Optional configuration to override defaults
   * @returns The logger instance
   */
  public static getInstance(config?: LoggerConfig): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(config);
    } else if (config) {
      // Update configuration if provided
      Logger.instance.configure(config);
    }
    return Logger.instance;
  }

  /**
   * Updates logger configuration
   * @param config New configuration options
   */
  public configure(config: LoggerConfig): void {
    this.config = this.mergeConfig(this.config, config);
    
    // Only reconfigure file logging if LOG_FILE_DIR is set
    if (process.env.LOG_FILE_DIR) {
      try {
        this.setupFileLogging();
      } catch (error) {
        // Silent fail - no console.log
      }
    }
  }

  /**
   * Set up file-based logging with proper error handling
   */
  private setupFileLogging(): void {
    // Only use LOG_FILE_DIR from environment
    const logDirPath = process.env.LOG_FILE_DIR;
    
    if (!logDirPath) {
      return;
    }
    
    // Create log directory if it doesn't exist
    try {
      if (!fs.existsSync(logDirPath)) {
        fs.mkdirSync(logDirPath, { recursive: true });
      }
    } catch (error) {
      // Silent fail - no console.log
      return;
    }
    
    // Create log format based on configuration
    const logFormat = this.createLogFormat(this.config.format);
    
    // Create new logger with file transports - no console transport
    const transports: winston.transport[] = [];
    
    if (this.config.rotation?.enabled) {
      // Use daily rotate file transport if rotation is enabled
      const dailyRotateOpts = {
        dirname: logDirPath,
        datePattern: 'YYYY-MM-DD',
        maxSize: this.config.rotation.maxSize,
        maxFiles: this.config.rotation.maxFiles,
        format: logFormat
      };
      
      try {
        // Combined logs
        const combinedTransport = new winston.transports.DailyRotateFile({
          ...dailyRotateOpts,
          filename: 'combined-%DATE%.log'
        });
        transports.push(combinedTransport);
        
        // Error logs
        const errorTransport = new winston.transports.DailyRotateFile({
          ...dailyRotateOpts,
          filename: 'error-%DATE%.log',
          level: 'error'
        });
        transports.push(errorTransport);
      } catch (error) {
        // Silent fail - no console.log
      }
    } else {
      // Standard file logging without rotation
      try {
        // Combined logs
        const combinedTransport = new winston.transports.File({
          filename: path.join(logDirPath, 'combined.log'),
          format: logFormat
        });
        transports.push(combinedTransport);
        
        // Error logs
        const errorTransport = new winston.transports.File({
          filename: path.join(logDirPath, 'error.log'),
          level: 'error',
          format: logFormat
        });
        transports.push(errorTransport);
      } catch (error) {
        // Silent fail - no console.log
      }
    }
    
    // If we have transports, create a proper logger
    if (transports.length > 0) {
      this.logger = winston.createLogger({
        level: this.config.level || DEFAULT_CONFIG.level,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format(this.sanitizeSensitiveData.bind(this))(),
          winston.format.json()
        ),
        defaultMeta: { service: 'mcp-service' },
        transports,
        silent: false,
        exitOnError: false
      });
    }
  }

  /**
   * Create the appropriate log format based on configuration
   */
  private createLogFormat(format: LogFormat = 'detailed'): winston.Logform.Format {
    switch (format) {
      case 'json':
        return winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        );
        
      case 'simple':
        return winston.format.combine(
          winston.format.timestamp(),
          winston.format.printf(({ timestamp, level, message }) => {
            return `[${timestamp}] ${level}: ${message}`;
          })
        );
        
      case 'detailed':
      default:
        return winston.format.combine(
          winston.format.timestamp(),
          winston.format.errors({ stack: true }),
          winston.format.printf(({ timestamp, level, message, context, stack }) => {
            const contextStr = context ? `\n  Context: ${JSON.stringify(context, null, 2)}` : '';
            const stackStr = stack ? `\n  Stack: ${stack}` : '';
            return `[${timestamp}] ${level}: ${message}${contextStr}${stackStr}`;
          })
        );
    }
  }

  /**
   * Sanitize sensitive data in logs
   */
  private sanitizeSensitiveData(info: any): any {
    if (!info || typeof info !== 'object') {
      return info;
    }
    
    // Get sensitive fields from config
    const sensitiveFields = this.config.sensitiveFields || DEFAULT_CONFIG.sensitiveFields || [];
    
    // Create deep copy to avoid modifying the original
    const sanitized = { ...info };
    
    // Sanitize context if it exists
    if (sanitized.context && typeof sanitized.context === 'object') {
      sanitized.context = this.redactSensitiveFields(sanitized.context, sensitiveFields);
    }
    
    return sanitized;
  }
  
  /**
   * Recursively redact sensitive fields in an object
   */
  private redactSensitiveFields(obj: any, sensitiveFields: string[]): any {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }
    
    // Handle arrays
    if (Array.isArray(obj)) {
      return obj.map(item => this.redactSensitiveFields(item, sensitiveFields));
    }
    
    // Handle regular objects
    const result: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(obj)) {
      // Check if this key matches any sensitive field pattern
      const isSensitive = sensitiveFields.some(field => 
        key.toLowerCase().includes(field.toLowerCase())
      );
      
      if (isSensitive) {
        // Redact sensitive value
        result[key] = '[REDACTED]';
      } else if (value && typeof value === 'object') {
        // Recursively process nested objects
        result[key] = this.redactSensitiveFields(value, sensitiveFields);
      } else {
        // Pass through non-sensitive values
        result[key] = value;
      }
    }
    
    return result;
  }

  /**
   * Log a debug message - no-op if logger is not configured
   */
  public debug(message: string, context?: Record<string, unknown>): void {
    try {
      this.logger.debug(message, { context });
    } catch (error) {
      // Silent fail
    }
  }

  /**
   * Log an info message - no-op if logger is not configured
   */
  public info(message: string, context?: Record<string, unknown>): void {
    try {
      this.logger.info(message, { context });
    } catch (error) {
      // Silent fail
    }
  }

  /**
   * Log a warning message - no-op if logger is not configured
   */
  public warn(message: string, context?: Record<string, unknown>): void {
    try {
      this.logger.warn(message, { context });
    } catch (error) {
      // Silent fail
    }
  }

  /**
   * Log an error message - no-op if logger is not configured
   */
  public error(message: string, context?: Record<string, unknown>): void {
    try {
      this.logger.error(message, { context });
    } catch (error) {
      // Silent fail
    }
  }

  /**
   * Log an exception with full stack trace - no-op if logger is not configured
   */
  public exception(message: string, error: Error, context?: Record<string, unknown>): void {
    try {
      this.logger.error(message, {
        context,
        stack: error.stack,
        error: {
          name: error.name,
          message: error.message
        }
      });
    } catch (error) {
      // Silent fail
    }
  }

  /**
   * Create a child logger with additional default context
   */
  public createChildLogger(defaultContext: Record<string, unknown>): ChildLogger {
    return new ChildLogger(this, defaultContext);
  }
  
  /**
   * Dispose logger resources
   */
  public dispose(): void {
    try {
      this.logger.close();
    } catch (error) {
      // Silent fail
    }
  }
}

/**
 * Child logger that includes default context with all log messages
 */
export class ChildLogger {
  /**
   * Create a new child logger
   */
  constructor(
    private parent: Logger,
    private defaultContext: Record<string, unknown>
  ) {}

  /**
   * Merge provided context with default context
   */
  private mergeContext(context?: Record<string, unknown>): Record<string, unknown> {
    return {
      ...this.defaultContext,
      ...context
    };
  }

  public debug(message: string, context?: Record<string, unknown>): void {
    this.parent.debug(message, this.mergeContext(context));
  }

  public info(message: string, context?: Record<string, unknown>): void {
    this.parent.info(message, this.mergeContext(context));
  }

  public warn(message: string, context?: Record<string, unknown>): void {
    this.parent.warn(message, this.mergeContext(context));
  }

  public error(message: string, context?: Record<string, unknown>): void {
    this.parent.error(message, this.mergeContext(context));
  }

  public exception(message: string, error: Error, context?: Record<string, unknown>): void {
    this.parent.exception(message, error, this.mergeContext(context));
  }
}

/**
 * Create and export the default logger instance - silent unless LOG_FILE_DIR is set
 */
export const logger = Logger.getInstance({
  level: (process.env.LOG_LEVEL as LogLevel) || 'info',
  files: true,
  format: 'detailed',
  rotation: {
    enabled: true,
    maxSize: '50m',
    maxFiles: 10
  }
});

export default logger;
