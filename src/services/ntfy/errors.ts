/**
 * Custom error classes for the ntfy service
 */
import { BaseErrorCode, McpError } from '../../types-global/errors.js';
import { ErrorHandler } from '../../utils/errorHandler.js';

/**
 * Get message from an error object
 * @param error The error to extract message from
 * @returns Error message as string
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  
  if (error === null) {
    return 'Null error occurred';
  }
  
  if (error === undefined) {
    return 'Undefined error occurred';
  }
  
  return typeof error === 'string' 
    ? error 
    : String(error);
}

/**
 * Base error class for ntfy service errors
 */
export class NtfyError extends McpError {
  constructor(message: string, details?: Record<string, unknown>) {
    const errorCode = details?.errorCode as BaseErrorCode || BaseErrorCode.SERVICE_UNAVAILABLE;
    super(errorCode, message, details);
    this.name = 'NtfyError'; 
  }
}

/**
 * Error thrown when connection to ntfy server fails
 */
export class NtfyConnectionError extends NtfyError {
  constructor(message: string, public readonly url?: string) {
    super(message, { url });
    this.name = 'NtfyConnectionError';
  }
}

/**
 * Error thrown when authentication fails
 */
export class NtfyAuthenticationError extends NtfyError {
  constructor(message: string) {
    super(message, { errorCode: BaseErrorCode.UNAUTHORIZED });
    this.name = 'NtfyAuthenticationError';
    this.code = BaseErrorCode.UNAUTHORIZED; // Ensure code is set correctly
  }
}

/**
 * Error thrown when a message cannot be parsed
 */
export class NtfyParseError extends NtfyError {
  constructor(message: string, public readonly rawData?: string) {
    super(message, { 
      rawData: rawData?.substring(0, 100), // Truncate large data for logging
      errorCode: BaseErrorCode.VALIDATION_ERROR
    });
    this.name = 'NtfyParseError';
    this.code = BaseErrorCode.VALIDATION_ERROR; // Ensure code is set correctly
  }
}

/**
 * Error thrown when a subscription is closed unexpectedly
 */
export class NtfySubscriptionClosedError extends NtfyError {
  constructor(message: string, public readonly reason?: string) {
    super(message, { reason });
    this.name = 'NtfySubscriptionClosedError';
  }
}

/**
 * Error thrown when an invalid topic name is provided
 */
export class NtfyInvalidTopicError extends NtfyError {
  constructor(message: string, public readonly topic?: string) {
    super(message, { topic, errorCode: BaseErrorCode.VALIDATION_ERROR });
    this.name = 'NtfyInvalidTopicError';
    this.code = BaseErrorCode.VALIDATION_ERROR; // Ensure code is set correctly
  }
}

/**
 * Error thrown when a timeout occurs
 */
export class NtfyTimeoutError extends NtfyError {
  constructor(message: string, public readonly timeoutMs?: number) {
    super(message, { timeoutMs, errorCode: BaseErrorCode.TIMEOUT });
    this.name = 'NtfyTimeoutError';
    this.code = BaseErrorCode.TIMEOUT; // Ensure code is set correctly
  }
}

/**
 * Error mapping for ntfy errors
 */
export const NTFY_ERROR_MAPPINGS = [
  {
    pattern: /authentication|unauthorized|auth.*failed/i,
    errorCode: BaseErrorCode.UNAUTHORIZED,
    factory: (error: unknown) => new NtfyAuthenticationError(getErrorMessage(error))
  },
  {
    pattern: /parse|invalid.*json|invalid.*format/i,
    errorCode: BaseErrorCode.VALIDATION_ERROR,
    factory: (error: unknown, context?: Record<string, unknown>) => 
      new NtfyParseError(getErrorMessage(error), context?.rawData as string)
  },
  {
    pattern: /invalid.*topic/i,
    errorCode: BaseErrorCode.VALIDATION_ERROR,
    factory: (error: unknown, context?: Record<string, unknown>) => 
      new NtfyInvalidTopicError(getErrorMessage(error), context?.topic as string)
  },
  {
    pattern: /timed out|timeout|deadline exceeded/i,
    errorCode: BaseErrorCode.TIMEOUT,
    factory: (error: unknown, context?: Record<string, unknown>) => 
      new NtfyTimeoutError(getErrorMessage(error), context?.timeoutMs as number)
  },
  {
    pattern: /connection|network|failed to connect|refused/i,
    errorCode: BaseErrorCode.SERVICE_UNAVAILABLE,
    factory: (error: unknown, context?: Record<string, unknown>) => 
      new NtfyConnectionError(getErrorMessage(error), context?.url as string)
  }
];

/**
 * Create an error mapper function for ntfy errors
 */
export const ntfyErrorMapper = ErrorHandler.createErrorMapper(NTFY_ERROR_MAPPINGS, BaseErrorCode.SERVICE_UNAVAILABLE);