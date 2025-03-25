/**
 * Environment configuration module
 * 
 * Loads and validates environment variables with proper defaults
 * and type conversion. Uses a lazy-loading pattern to avoid
 * loading configuration at import time.
 */
import { logger } from '../utils/logger.js';
import { parseNumericEnv, parseBooleanEnv, parseStringEnv, validators } from './parsers.js';

// Create a module-level logger for environment configuration
const envLogger = logger.createChildLogger({
  module: 'EnvConfig'
});

/**
 * Environment Configuration Interface
 */
export interface EnvironmentConfig {
  // Server configuration
  logLevel: string;
  environment: string;
  
  // Security settings
  security: {
    // Can be extended with security settings in the future
  };
  
  // Rate limiting
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
  
  // Ntfy configuration
  ntfy: {
    apiKey: string;
    baseUrl: string;
    defaultTopic: string;
    requestTimeout: number;
    maxRetries: number;
    maxMessageSize: number;
  };
}

/**
 * Handles loading and parsing of environment variables for the application
 * with validation and default values.
 */
function loadEnvConfig(): EnvironmentConfig {
  // Log the environment we're loading
  envLogger.info(`Loading environment configuration`, {
    nodeEnv: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info'
  });

  const config: EnvironmentConfig = {
    // Server configuration
    logLevel: process.env.LOG_LEVEL || "info",
    environment: process.env.NODE_ENV || "development",
    
    // Security settings
    security: {
      // Can be extended with non-auth security settings in the future
    },
    
    // Rate limiting
    rateLimit: {
      windowMs: parseNumericEnv('RATE_LIMIT_WINDOW_MS', 60000, 1000, 3600000), // 1 minute default, 1s min, 1h max
      maxRequests: parseNumericEnv('RATE_LIMIT_MAX_REQUESTS', 100, 1, 10000) // 100 requests per minute default, 1-10000 range
    },
    
    // Ntfy configuration
    ntfy: {
      apiKey: process.env.NTFY_API_KEY || '',
      baseUrl: parseStringEnv('NTFY_BASE_URL', 'https://ntfy.sh', validators.url),
      defaultTopic: parseStringEnv('NTFY_TOPIC', '', validators.ntfyTopic),
      requestTimeout: parseNumericEnv('NTFY_REQUEST_TIMEOUT', 5000, 1000, 60000), // 5s default, 1-60s range
      maxRetries: parseNumericEnv('NTFY_MAX_RETRIES', 3, 0, 10), // 3 retries default, 0-10 range
      maxMessageSize: parseNumericEnv('NTFY_MAX_MESSAGE_SIZE', 4096, 1, 10000) // 4KB default, 1B-10KB range
    }
  };

  // Log the loaded configuration
  envLogger.info(`Environment configuration loaded`, {
    environment: config.environment,
    logLevel: config.logLevel,
    rateLimitWindowMs: config.rateLimit.windowMs,
    rateLimitMaxRequests: config.rateLimit.maxRequests
  });
  
  // Log ntfy config (but mask sensitive data)
  envLogger.info(`Ntfy configuration loaded`, {
    baseUrl: config.ntfy.baseUrl,
    defaultTopic: config.ntfy.defaultTopic ? config.ntfy.defaultTopic : '(not set)',
    apiKeyPresent: config.ntfy.apiKey ? '✓' : '✗',
    requestTimeout: `${config.ntfy.requestTimeout}ms`,
    maxRetries: config.ntfy.maxRetries,
    maxMessageSize: `${config.ntfy.maxMessageSize} bytes`
  });

  return config;
}

// Cache the configuration once loaded
let cachedEnvConfig: EnvironmentConfig | null = null;

/**
 * Get the environment configuration, loading it on first call
 * 
 * This ensures that we only load the configuration when it's actually needed,
 * not just when the module is imported.
 * 
 * @returns The environment configuration
 */
export const envConfig = (): EnvironmentConfig => {
  if (!cachedEnvConfig) {
    cachedEnvConfig = loadEnvConfig();
  }
  return cachedEnvConfig;
};

/**
 * Validates the configuration at startup
 * Throws an error if any validation fails
 */
export const validateConfig = (): boolean => {
  const config = envConfig();
  
  // Add any additional validation logic here
  // Currently the validation happens during loading,
  // but this hook is available for more complex validation
  
  envLogger.info('Configuration validation passed');
  return true;
};

// Helper functions for direct property access
export const getEnvironment = (): string => envConfig().environment;
export const getLogLevel = (): string => envConfig().logLevel;
export const getRateLimit = () => envConfig().rateLimit;
export const getSecurity = () => envConfig().security;
export const getNtfyConfig = () => envConfig().ntfy;
