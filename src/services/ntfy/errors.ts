/**
 * Custom error classes for the ntfy service
 */

/**
 * Base error class for ntfy service errors
 */
export class NtfyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NtfyError';
  }
}

/**
 * Error thrown when connection to ntfy server fails
 */
export class NtfyConnectionError extends NtfyError {
  constructor(message: string, public readonly url?: string) {
    super(message);
    this.name = 'NtfyConnectionError';
  }
}

/**
 * Error thrown when authentication fails
 */
export class NtfyAuthenticationError extends NtfyError {
  constructor(message: string) {
    super(message);
    this.name = 'NtfyAuthenticationError';
  }
}

/**
 * Error thrown when a message cannot be parsed
 */
export class NtfyParseError extends NtfyError {
  constructor(message: string, public readonly rawData?: string) {
    super(message);
    this.name = 'NtfyParseError';
  }
}

/**
 * Error thrown when a subscription is closed unexpectedly
 */
export class NtfySubscriptionClosedError extends NtfyError {
  constructor(message: string, public readonly reason?: string) {
    super(message);
    this.name = 'NtfySubscriptionClosedError';
  }
}

/**
 * Error thrown when an invalid topic name is provided
 */
export class NtfyInvalidTopicError extends NtfyError {
  constructor(message: string, public readonly topic?: string) {
    super(message);
    this.name = 'NtfyInvalidTopicError';
  }
}

/**
 * Error thrown when a timeout occurs
 */
export class NtfyTimeoutError extends NtfyError {
  constructor(message: string, public readonly timeoutMs?: number) {
    super(message);
    this.name = 'NtfyTimeoutError';
  }
}