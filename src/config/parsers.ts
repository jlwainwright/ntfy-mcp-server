/**
 * Configuration value parsers
 * 
 * This module contains utility functions for parsing and validating
 * environment variables with proper type conversion and validation.
 */
import { BaseErrorCode, McpError } from '../types-global/errors.js';
import { ErrorHandler } from '../utils/errorHandler.js';
import { logger } from '../utils/logger.js';
import { sanitizeInput } from '../utils/security.js';

// Create a module-level logger for environment configuration parsers
const parserLogger = logger.createChildLogger({
  module: 'ConfigParsers'
});

/**
 * Parse a numeric environment variable with validation
 * 
 * @param name - The name of the environment variable
 * @param defaultValue - The default value if not set or invalid
 * @param min - Optional minimum valid value
 * @param max - Optional maximum valid value
 * @returns The parsed numeric value
 */
export function parseNumericEnv(
  name: string, 
  defaultValue: number, 
  min?: number, 
  max?: number
): number {
  const rawValue = process.env[name];
  
  if (rawValue === undefined) {
    parserLogger.debug(`Using default value for ${name}`, { defaultValue });
    return defaultValue;
  }
  
  try {
    // Sanitize and parse the value
    const sanitizedValue = sanitizeInput.string(rawValue);
    const parsedValue = parseFloat(sanitizedValue);
    
    if (isNaN(parsedValue)) {
      throw new McpError(
        BaseErrorCode.VALIDATION_ERROR,
        `Invalid numeric value for ${name}: ${sanitizedValue}`,
        { raw: sanitizedValue }
      );
    }
    
    // Apply bounds constraints if provided
    if (min !== undefined && parsedValue < min) {
      parserLogger.warn(`Value for ${name} is below minimum (${min}), using minimum`, { 
        parsed: parsedValue, min, raw: sanitizedValue 
      });
      return min;
    }
    
    if (max !== undefined && parsedValue > max) {
      parserLogger.warn(`Value for ${name} is above maximum (${max}), using maximum`, { 
        parsed: parsedValue, max, raw: sanitizedValue 
      });
      return max;
    }
    
    parserLogger.debug(`Parsed ${name} environment variable`, { value: parsedValue });
    return parsedValue;
  } catch (error) {
    ErrorHandler.handleError(error, {
      context: { envVar: name, rawValue },
      operation: `parsing environment variable ${name}`,
      errorCode: BaseErrorCode.VALIDATION_ERROR
    });
    
    parserLogger.warn(`Using default value for ${name} due to parsing error`, { defaultValue });
    return defaultValue;
  }
}

/**
 * Parse a boolean environment variable with validation
 * 
 * @param name - The name of the environment variable
 * @param defaultValue - The default value if not set or invalid
 * @returns The parsed boolean value
 */
export function parseBooleanEnv(name: string, defaultValue: boolean): boolean {
  const rawValue = process.env[name];
  
  if (rawValue === undefined) {
    parserLogger.debug(`Using default value for ${name}`, { defaultValue });
    return defaultValue;
  }
  
  try {
    // Sanitize the input
    const sanitizedValue = sanitizeInput.string(rawValue).toLowerCase();
    
    // Allow for various truthy/falsy string representations
    if (['true', 'yes', '1', 'on'].includes(sanitizedValue)) {
      return true;
    }
    
    if (['false', 'no', '0', 'off'].includes(sanitizedValue)) {
      return false;
    }
    
    throw new McpError(
      BaseErrorCode.VALIDATION_ERROR,
      `Invalid boolean value for ${name}: ${sanitizedValue}`,
      { raw: sanitizedValue }
    );
  } catch (error) {
    ErrorHandler.handleError(error, {
      context: { envVar: name, rawValue },
      operation: `parsing environment variable ${name}`,
      errorCode: BaseErrorCode.VALIDATION_ERROR
    });
    
    parserLogger.warn(`Using default value for ${name} due to parsing error`, { defaultValue });
    return defaultValue;
  }
}

/**
 * Parses a string environment variable with optional validation
 * 
 * @param name - The environment variable name
 * @param defaultValue - Default value if not set or invalid
 * @param validator - Optional validation function
 * @returns The validated string value
 */
export function parseStringEnv(
  name: string,
  defaultValue: string,
  validator?: (value: string) => boolean
): string {
  const rawValue = process.env[name];
  
  if (rawValue === undefined) {
    parserLogger.debug(`Using default value for ${name}`, { 
      defaultValue: defaultValue ? '(set)' : '(empty)' 
    });
    return defaultValue;
  }
  
  try {
    // Sanitize the input
    const sanitizedValue = sanitizeInput.string(rawValue);
    
    // Validate if a validator was provided
    if (validator && !validator(sanitizedValue)) {
      throw new McpError(
        BaseErrorCode.VALIDATION_ERROR,
        `Invalid value for ${name}: ${sanitizedValue}`,
        { raw: sanitizedValue }
      );
    }
    
    return sanitizedValue;
  } catch (error) {
    ErrorHandler.handleError(error, {
      context: { envVar: name, rawValue },
      operation: `parsing environment variable ${name}`,
      errorCode: BaseErrorCode.VALIDATION_ERROR
    });
    
    parserLogger.warn(`Using default value for ${name} due to validation error`, { 
      defaultValue: defaultValue ? '(set)' : '(empty)' 
    });
    return defaultValue;
  }
}

/**
 * Common validators for config values
 */
export const validators = {
  /**
   * Validate a ntfy topic string
   * 
   * @param topic - The topic string to validate
   * @returns true if valid, false otherwise
   */
  ntfyTopic: (topic: string): boolean => {
    // A valid topic should not be empty and shouldn't contain newlines
    if (!topic || topic.trim() === '' || /[\r\n]/.test(topic)) {
      return false;
    }
    return true;
  },
  
  /**
   * Validate a URL string
   * 
   * @param url - The URL string to validate
   * @returns true if valid, false otherwise
   */
  url: (url: string): boolean => {
    if (!url || url.trim() === '') {
      return false;
    }
    
    try {
      new URL(url);
      return true;
    } catch (e) {
      return false;
    }
  }
};
