import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import winston from "winston";

type LogLevel = "debug" | "info" | "warn" | "error";

export type ChildLogger = {
  debug: (message: string, context?: Record<string, unknown>) => void;
  info: (message: string, context?: Record<string, unknown>) => void;
  warn: (message: string, context?: Record<string, unknown>) => void;
  error: (message: string, context?: Record<string, unknown>) => void;
};

// Handle ESM module dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve logs directory relative to project root (2 levels up from utils/)
const projectRoot = path.resolve(__dirname, '..', '..');
const logsDir = path.join(projectRoot, 'logs');

class Logger {
  private static instance: Logger;
  private logger: winston.Logger;

  private constructor() {
    const logLevel = (process.env.LOG_LEVEL as LogLevel) || "info";
    
    // Ensure logs directory exists
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    // Common format for all transports
    const commonFormat = winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      // The 'context' object passed to logger methods (e.g., logger.info(message, context))
      // will be available here in the 'info' object passed to the printf function.
      // Winston automatically merges the metadata passed during logger creation 
      // with the metadata passed at the call site if you use logger.child().
      // However, since we are implementing a custom child logger wrapper, 
      // we need to handle the merging manually.
      winston.format.printf(({ timestamp, level, message, context, stack }) => {
        // Ensure context is an object before stringifying
        const contextStr = (context && typeof context === 'object' && Object.keys(context).length > 0) 
          ? `\n  Context: ${JSON.stringify(context, null, 2)}` 
          : "";
        const stackStr = stack ? `\n  Stack: ${stack}` : "";
        return `[${timestamp}] ${level}: ${message}${contextStr}${stackStr}`;
      })
    );

    this.logger = winston.createLogger({
      level: logLevel,
      // Use json format for structured logging internally, printf for files
      format: winston.format.json(), 
      transports: [
        // Combined log file for all levels
        new winston.transports.File({
          filename: path.join(logsDir, 'combined.log'),
          format: commonFormat // Apply the custom format here
        }),
        // Separate log files for each level
        new winston.transports.File({
          filename: path.join(logsDir, 'error.log'),
          level: 'error',
          format: commonFormat
        }),
        new winston.transports.File({
          filename: path.join(logsDir, 'warn.log'),
          level: 'warn',
          format: commonFormat
        }),
        new winston.transports.File({
          filename: path.join(logsDir, 'info.log'),
          level: 'info',
          format: commonFormat
        }),
        new winston.transports.File({
          filename: path.join(logsDir, 'debug.log'),
          level: 'debug',
          format: commonFormat
        })
      ]
    });

    // Add console transport only if not in production
    if (process.env.NODE_ENV !== 'production') {
      this.logger.add(new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple(), // Use simple format for console readability
          winston.format.printf(({ level, message, timestamp, context, stack }) => {
            const contextStr = (context && typeof context === 'object' && Object.keys(context).length > 0) 
              ? ` ${JSON.stringify(context)}` 
              : "";
            const stackStr = stack ? `\n${stack}` : "";
            // Simple console format
            return `${level}: ${message}${contextStr}${stackStr}`; 
          })
        )
      }));
    }
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  // Base log methods now accept the context directly
  public debug(message: string, context?: Record<string, unknown>) {
    this.logger.debug(message, context);
  }

  public info(message: string, context?: Record<string, unknown>) {
    this.logger.info(message, context);
  }

  public warn(message: string, context?: Record<string, unknown>) {
    this.logger.warn(message, context);
  }

  public error(message: string, context?: Record<string, unknown>) {
    // Ensure error context includes stack if available
    const errorContext = context || {};
    if (errorContext.error instanceof Error && !errorContext.stack) {
      errorContext.stack = errorContext.error.stack;
    }
    this.logger.error(message, errorContext);
  }

  /**
   * Creates a child logger that automatically includes the provided metadata 
   * in the context object of every log message.
   * 
   * @param metadata - Static metadata to include with every log from this child.
   * @returns A ChildLogger instance.
   */
  public createChildLogger(metadata: { 
    module: string; 
    service?: string;
    serviceId?: string;
    componentName?: string;
    subscriberId?: string;
    component?: string;
    requestId?: string;
    subscriptionTime?: string;
    environment?: string;
    serverId?: string;
    [key: string]: any; // Allow additional properties
  }): ChildLogger {
    // Filter out undefined values from metadata once
    const staticMetadata = Object.fromEntries(
      Object.entries(metadata).filter(([_, v]) => v !== undefined)
    );

    return {
      debug: (message: string, context?: Record<string, unknown>) => {
        // Merge static metadata with call-site context
        const mergedContext = { ...staticMetadata, ...context };
        this.debug(message, mergedContext);
      },
      info: (message: string, context?: Record<string, unknown>) => {
        const mergedContext = { ...staticMetadata, ...context };
        this.info(message, mergedContext);
      },
      warn: (message: string, context?: Record<string, unknown>) => {
        const mergedContext = { ...staticMetadata, ...context };
        this.warn(message, mergedContext);
      },
      error: (message: string, context?: Record<string, unknown>) => {
        const mergedContext = { ...staticMetadata, ...context };
        // Ensure error context includes stack if available
        if (mergedContext.error instanceof Error && !mergedContext.stack) {
          mergedContext.stack = mergedContext.error.stack;
        }
        this.error(message, mergedContext);
      }
    };
  }
}

export const logger = Logger.getInstance();
