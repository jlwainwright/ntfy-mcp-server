/**
 * Utility functions for the ntfy service
 */
import { NtfyParseError } from './errors.js';
import { NtfyMessage, NtfySubscriptionOptions } from './types.js';
import { DEFAULT_NTFY_BASE_URL } from './constants.js';

/**
 * Validates a topic name
 * @param topic Topic name to validate
 * @returns True if the topic name is valid, false otherwise
 */
export function isValidTopic(topic: string): boolean {
  // Topic names are validated on the server side, but we can do basic validation here
  return !!topic && topic.trim().length > 0 && !topic.includes('\n') && !topic.includes('\r');
}

/**
 * Builds a ntfy subscription URL
 * @param topic Topic to subscribe to (can be comma-separated for multiple topics)
 * @param format Subscription format (json, sse, raw, ws)
 * @param options Subscription options
 * @returns Complete URL for the subscription
 */
export function buildSubscriptionUrl(
  topic: string,
  format: string,
  options: NtfySubscriptionOptions
): string {
  const baseUrl = options.baseUrl || DEFAULT_NTFY_BASE_URL;
  const endpoint = `/${topic}/${format}`;
  
  // Build query parameters
  const params = new URLSearchParams();
  
  if (options.poll) {
    params.append('poll', '1');
  }
  
  if (options.since) {
    params.append('since', options.since.toString());
  }
  
  if (options.scheduled) {
    params.append('scheduled', '1');
  }
  
  if (options.id) {
    params.append('id', options.id);
  }
  
  if (options.message) {
    params.append('message', options.message);
  }
  
  if (options.title) {
    params.append('title', options.title);
  }
  
  if (options.priority) {
    params.append('priority', options.priority);
  }
  
  if (options.tags) {
    params.append('tags', options.tags);
  }
  
  if (options.auth) {
    params.append('auth', options.auth);
  }
  
  const queryString = params.toString();
  return `${baseUrl}${endpoint}${queryString ? `?${queryString}` : ''}`;
}

/**
 * Creates authorization header for basic auth
 * @param username Username
 * @param password Password
 * @returns Basic auth header value
 */
export function createBasicAuthHeader(username: string, password: string): string {
  // Use btoa for base64 encoding (available in Node.js and browsers)
  const credentials = btoa(`${username}:${password}`);
  return `Basic ${credentials}`;
}

/**
 * Parses a JSON message from ntfy
 * @param data JSON string to parse
 * @returns Parsed ntfy message
 * @throws NtfyParseError if the message cannot be parsed
 */
export function parseJsonMessage(data: string): NtfyMessage {
  try {
    const message = JSON.parse(data);
    
    // Basic validation to ensure it's a proper ntfy message
    if (!message.id || !message.time || !message.event || !message.topic) {
      throw new Error('Invalid message format');
    }
    
    return message;
  } catch (error) {
    throw new NtfyParseError(
      `Failed to parse message: ${error instanceof Error ? error.message : 'Unknown error'}`,
      data
    );
  }
}

/**
 * Creates request headers for ntfy API calls
 * @param options Subscription options
 * @returns Headers object for fetch
 */
export function createRequestHeaders(options: NtfySubscriptionOptions): HeadersInit {
  const headers: HeadersInit = {
    'Accept': 'application/json',
    'User-Agent': 'ntfy-mcp-server/1.0.0',
    ...options.headers,
  };
  
  // Add authorization header if credentials are provided
  if (options.username && options.password) {
    headers['Authorization'] = createBasicAuthHeader(options.username, options.password);
  } else if (options.auth && !options.auth.includes('=')) {
    // Only add as header if it's not already in query params
    headers['Authorization'] = options.auth;
  }
  
  return headers;
}

/**
 * Generates a timeout promise that rejects after the specified time
 * @param ms Timeout in milliseconds
 * @returns Promise that rejects after the specified time
 */
export function createTimeout(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms);
  });
}

/**
 * Creates an AbortController with a timeout
 * @param timeoutMs Timeout in milliseconds
 * @returns AbortController and a cleanup function
 */
export function createAbortControllerWithTimeout(timeoutMs: number): {
  controller: AbortController;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  return {
    controller,
    cleanup: () => clearTimeout(timeoutId),
  };
}