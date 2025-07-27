/**
 * Utility functions for the ntfy service
 */
import { BaseErrorCode } from '../../types-global/errors.js';
import { ErrorHandler } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { sanitizeInput, sanitizeInputForLogging } from '../../utils/sanitization.js';
import { createRequestContext } from '../../utils/requestContext.js';
import { idGenerator } from '../../utils/idGenerator.js';
import { NtfyMessage, NtfyNotificationMessage, NtfySubscriptionOptions } from './types.js';
import { DEFAULT_NTFY_BASE_URL, DEFAULT_REQUEST_TIMEOUT } from './constants.js';
import { NtfyParseError, NtfyConnectionError, NtfyInvalidTopicError, ntfyErrorMapper } from './errors.js';

// Create a module-specific logger
const moduleLogger = logger.createChildLogger({ 
  module: 'NtfyUtils',
  serviceId: idGenerator.generateRandomString(8)
});

/**
 * Validates a topic name
 * @param topic Topic name to validate
 * @returns True if the topic name is valid, false otherwise
 */
export async function isValidTopic(topic: string): Promise<boolean> {
  return ErrorHandler.tryCatch(
    async () => {
      // Topic names are validated on the server side, but we can do basic validation here
      if (!topic) return false;
      
      const sanitizedTopic = sanitizeInput.string(topic);
      return sanitizedTopic.trim().length > 0 && 
             !sanitizedTopic.includes('\n') && 
             !sanitizedTopic.includes('\r');
    },
    {
      operation: 'validateNtfyTopic',
      context: { topic },
      errorCode: BaseErrorCode.VALIDATION_ERROR,
      rethrow: false,
      // Return false on error rather than throwing
      errorMapper: () => false as unknown as Error
    }
  );
}

/**
 * Validate a topic name synchronously
 * This is a synchronous version for performance and cases where async isn't possible
 * @param topic Topic to validate
 * @returns True if topic is valid
 */
export function validateTopicSync(topic: string): boolean {
  try {
    if (!topic) return false;
    
    const sanitizedTopic = sanitizeInput.string(topic);
    return sanitizedTopic.trim().length > 0 && 
           !sanitizedTopic.includes('\n') && 
           !sanitizedTopic.includes('\r');
  } catch (error) {
    moduleLogger.warn('Error validating topic', { topic, error });
    return false;
  }
}

/**
 * Builds a ntfy subscription URL
 * @param topic Topic to subscribe to (can be comma-separated for multiple topics)
 * @param format Subscription format (json, sse, raw, ws)
 * @param options Subscription options
 * @returns Complete URL for the subscription
 */
export async function buildSubscriptionUrl(
  topic: string,
  format: string,
  options: NtfySubscriptionOptions
): Promise<string> {
  return ErrorHandler.tryCatch(
    async () => {
      const requestCtx = createRequestContext({
        operation: 'buildSubscriptionUrl', 
        topic, 
        format
      });

      // Sanitize inputs
      const sanitizedTopic = sanitizeInput.string(topic);
      const sanitizedFormat = sanitizeInput.string(format);
      
      moduleLogger.debug('Building subscription URL', { 
        topic: sanitizedTopic, 
        format: sanitizedFormat,
        requestId: requestCtx.requestId
      });
      
      const baseUrl = sanitizeInput.url(options.baseUrl || DEFAULT_NTFY_BASE_URL);
      const endpoint = `/${sanitizedTopic}/${sanitizedFormat}`;
      
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
        params.append('id', sanitizeInput.string(options.id));
      }
      
      if (options.message) {
        params.append('message', sanitizeInput.string(options.message));
      }
      
      if (options.title) {
        params.append('title', sanitizeInput.string(options.title));
      }
      
      if (options.priority) {
        params.append('priority', sanitizeInput.string(options.priority.toString()));
      }
      
      if (options.tags) {
        params.append('tags', sanitizeInput.string(options.tags));
      }
      
      if (options.auth) {
        params.append('auth', sanitizeInput.string(options.auth));
      }
      
      const queryString = params.toString();
      const fullUrl = `${baseUrl}${endpoint}${queryString ? `?${queryString}` : ''}`;
      
      moduleLogger.debug('Built subscription URL', { 
        url: fullUrl,
        requestId: requestCtx.requestId 
      });
      
      return fullUrl;
    },
    {
      operation: 'buildSubscriptionUrl',
      context: { topic, format },
      input: options,
      errorCode: BaseErrorCode.VALIDATION_ERROR,
      errorMapper: ntfyErrorMapper,
      rethrow: true
    }
  );
}

/**
 * Builds a subscription URL synchronously
 * @param topic Topic to subscribe to
 * @param format Subscription format
 * @param options Subscription options
 * @returns Complete URL
 */
export function buildSubscriptionUrlSync(
  topic: string,
  format: string,
  options: NtfySubscriptionOptions
): string {
  try {
    // Sanitize inputs
    const sanitizedTopic = sanitizeInput.string(topic);
    const sanitizedFormat = sanitizeInput.string(format);
    
    const baseUrl = sanitizeInput.url(options.baseUrl || DEFAULT_NTFY_BASE_URL);
    const endpoint = `/${sanitizedTopic}/${sanitizedFormat}`;
    
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
      params.append('id', sanitizeInput.string(options.id));
    }
    
    if (options.message) {
      params.append('message', sanitizeInput.string(options.message));
    }
    
    if (options.title) {
      params.append('title', sanitizeInput.string(options.title));
    }
    
    if (options.priority) {
      params.append('priority', sanitizeInput.string(options.priority.toString()));
    }
    
    if (options.tags) {
      params.append('tags', sanitizeInput.string(options.tags));
    }
    
    if (options.auth) {
      params.append('auth', sanitizeInput.string(options.auth));
    }
    
    const queryString = params.toString();
    return `${baseUrl}${endpoint}${queryString ? `?${queryString}` : ''}`;
  } catch (error) {
    moduleLogger.error('Error building subscription URL', { topic, format, error });
    throw error;
  }
}

/**
 * Creates authorization header for basic auth
 * @param username Username
 * @param password Password
 * @returns Basic auth header value
 */
export async function createBasicAuthHeader(username: string, password: string): Promise<string> {
  return ErrorHandler.tryCatch(
    async () => {
      const requestCtx = createRequestContext({
        operation: 'createBasicAuthHeader',
        hasCredentials: !!username && !!password
      });
      
      if (!username || !password) {
        moduleLogger.warn('Missing username or password for basic auth', {
          requestId: requestCtx.requestId,
          hasUsername: !!username
        });
        return '';
      }
      
      // Sanitize credentials
      const sanitizedUsername = sanitizeInput.string(username);
      // Don't log or sanitize password directly to avoid potential leaks
      
      // Use btoa for base64 encoding (available in Node.js and browsers)
      return `Basic ${btoa(`${sanitizedUsername}:${password}`)}`;
    },
    {
      operation: 'createBasicAuthHeader',
      errorCode: BaseErrorCode.VALIDATION_ERROR,
      // Don't include username/password in logs
      rethrow: false,
      // Return empty string on error rather than throwing
      errorMapper: () => '' as unknown as Error
    }
  );
}

/**
 * Creates basic auth header synchronously
 * @param username Username
 * @param password Password
 * @returns Basic auth header value
 */
export function createBasicAuthHeaderSync(username: string, password: string): string {
  try {
    if (!username || !password) {
      return '';
    }
    
    // Sanitize credentials
    const sanitizedUsername = sanitizeInput.string(username);
    
    // Use btoa for base64 encoding
    return `Basic ${btoa(`${sanitizedUsername}:${password}`)}`;
  } catch (error) {
    moduleLogger.warn('Error creating basic auth header', { error });
    return '';
  }
}

/**
 * Parses a JSON message from ntfy
 * @param data JSON string to parse
 * @returns Parsed ntfy message
 * @throws NtfyParseError if the message cannot be parsed
 */
export async function parseJsonMessage(data: string): Promise<NtfyMessage> {
  return ErrorHandler.tryCatch(
    async () => {
      if (!data || typeof data !== 'string') {
        throw new Error('Invalid input: data must be a non-empty string');
      }
      
      const message = JSON.parse(data);
      
      // Basic validation to ensure it's a proper ntfy message
      if (!message.id || !message.time || !message.event || !message.topic) {
        throw new Error('Invalid message format');
      }
      
      return message;
    },
    {
      operation: 'parseJsonMessage',
      context: { dataLength: data?.length ?? 0 },
      input: { data: data?.length > 100 ? `${data.substring(0, 100)}...` : data },
      errorCode: BaseErrorCode.VALIDATION_ERROR,
      errorMapper: (error) => {
        // Transform the error to our NtfyParseError
        return new NtfyParseError(
          `Failed to parse message: ${error instanceof Error ? error.message : 'Unknown error'}`, 
          data
        );
      },
      rethrow: true
    }
  );
}

/**
 * Parse JSON message synchronously
 * @param data JSON string to parse
 * @returns Parsed ntfy message
 * @throws NtfyParseError if parsing fails
 */
export function parseJsonMessageSync(data: string): NtfyMessage {
  try {
    if (!data || typeof data !== 'string') {
      throw new Error('Invalid input: data must be a non-empty string');
    }
    
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
export async function createRequestHeaders(options: NtfySubscriptionOptions): Promise<HeadersInit> {
  return ErrorHandler.tryCatch(
    async () => {
      const requestCtx = createRequestContext({
        operation: 'createRequestHeaders'
      });
      
      moduleLogger.debug('Creating request headers', {
        requestId: requestCtx.requestId,
        hasAuth: !!options.auth || !!(options.username && options.password),
        hasCustomHeaders: !!options.headers && Object.keys(options.headers).length > 0
      });
      
      const headers: Record<string, string> = {
        'Accept': 'application/json',
        'User-Agent': 'ntfy-mcp-server/1.0.0',
      };
      
      // Add custom headers if provided (after sanitization)
      if (options.headers) {
        Object.entries(options.headers).forEach(([key, value]) => {
          headers[sanitizeInput.string(key)] = sanitizeInput.string(value);
        });
      }
      
      // Add authorization header if credentials are provided
      if (options.username && options.password) {
        const authHeader = await createBasicAuthHeader(options.username, options.password);
        headers['Authorization'] = authHeader;
      } else if (options.auth && !options.auth.includes('=')) {
        // Check if the auth token is an ntfy API key (starts with tk_)
        if (options.auth.startsWith('tk_')) {
          // Format as Bearer token for ntfy API key
          headers['Authorization'] = `Bearer ${sanitizeInput.string(options.auth)}`;
        } else {      
          headers['Authorization'] = sanitizeInput.string(options.auth);
        }
      }
      
      return headers;
    },
    {
      operation: 'createRequestHeaders',
      rethrow: false,
      // Return minimal headers on error rather than breaking calls
      errorMapper: () => ({
        'Accept': 'application/json',
        'User-Agent': 'ntfy-mcp-server/1.0.0',
      }) as unknown as Error
    }
  );
}

/**
 * Create request headers synchronously
 * @param options Subscription options
 * @returns Headers object
 */
export function createRequestHeadersSync(options: NtfySubscriptionOptions): HeadersInit {
  try {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'User-Agent': 'ntfy-mcp-server/1.0.0',
    };
    
    // Add custom headers if provided (after sanitization)
    if (options.headers) {
      Object.entries(options.headers).forEach(([key, value]) => {
        headers[sanitizeInput.string(key)] = sanitizeInput.string(value);
      });
    }
    
    // Add authorization header if credentials are provided
    if (options.username && options.password) {
      headers['Authorization'] = createBasicAuthHeaderSync(options.username, options.password);
    } else if (options.auth && !options.auth.includes('=')) {
      // Check if the auth token is an ntfy API key (starts with tk_)
      if (options.auth.startsWith('tk_')) {
        // Format as Bearer token for ntfy API key
        headers['Authorization'] = `Bearer ${sanitizeInput.string(options.auth)}`;
      } else {      
        headers['Authorization'] = sanitizeInput.string(options.auth);
      }
    }
    
    return headers;
  } catch (error) {
    moduleLogger.error('Error creating request headers', { error });
    // Return minimal headers on error
    return {
      'Accept': 'application/json',
      'User-Agent': 'ntfy-mcp-server/1.0.0',
    };
  }
}

/**
 * Generates a timeout promise that rejects after the specified time
 * @param ms Timeout in milliseconds
 * @returns Promise that rejects after the specified time
 */
export function createTimeout(ms: number): Promise<never> {
  const timeoutId = createRequestContext({ operation: 'createTimeout', timeoutMs: ms }).requestId;
  moduleLogger.debug('Creating timeout promise', { timeoutMs: ms, timeoutId });
  
  return new Promise((_, reject) => {
    setTimeout(() => {
      moduleLogger.debug('Timeout reached', { timeoutMs: ms, timeoutId });
      reject(new Error(`Operation timed out after ${ms}ms`));
    }, ms);
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
  const controlId = createRequestContext({ operation: 'createAbortController', timeoutMs }).requestId;
  moduleLogger.debug('Creating AbortController with timeout', { timeoutMs, controlId });
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  return {
    controller,
    cleanup: () => {
      clearTimeout(timeoutId);
      moduleLogger.debug('Cleaned up AbortController timeout', { controlId });
    },
  };
}

/**
 * Fetch messages from a topic using the polling API
 * @param topic Topic to fetch messages from
 * @param options Options for message fetching
 * @returns Promise resolving to array of messages
 */
export async function fetchMessages(
  topic: string,
  options: NtfySubscriptionOptions & {
    limit?: number;
    baseUrl?: string;
  } = {}
): Promise<NtfyNotificationMessage[]> {
  return ErrorHandler.tryCatch(
    async () => {
      const requestCtx = createRequestContext({
        operation: 'fetchMessages',
        topic,
        serviceId: idGenerator.generateRandomString(8)
      });

      moduleLogger.debug('Fetching messages from topic', {
        topic,
        options: sanitizeInputForLogging(options),
        requestId: requestCtx.requestId
      });

      // Validate topic
      if (!validateTopicSync(topic)) {
        throw new NtfyInvalidTopicError('Invalid topic name', topic);
      }

      // Build URL for polling
      const baseUrl = options.baseUrl || DEFAULT_NTFY_BASE_URL;
      const sanitizedTopic = sanitizeInput.string(topic);
      const url = new URL(`${baseUrl}/${encodeURIComponent(sanitizedTopic)}/json`);

      // Add polling parameter
      url.searchParams.append('poll', '1');

      // Add optional parameters
      if (options.since) {
        url.searchParams.append('since', String(options.since));
      }
      if (options.scheduled) {
        url.searchParams.append('scheduled', '1');
      }
      if (options.id) {
        url.searchParams.append('id', options.id);
      }
      if (options.priority) {
        url.searchParams.append('priority', options.priority);
      }
      if (options.tags) {
        url.searchParams.append('tags', options.tags);
      }
      if (options.title) {
        url.searchParams.append('title', options.title);
      }
      if (options.message) {
        url.searchParams.append('message', options.message);
      }

      // Create headers
      const headers = createRequestHeadersSync(options);

      moduleLogger.debug('Making HTTP request for messages', {
        url: url.toString(),
        requestId: requestCtx.requestId
      });

      // Make the request
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(DEFAULT_REQUEST_TIMEOUT)
      });

      if (!response.ok) {
        moduleLogger.error('HTTP error fetching messages', {
          status: response.status,
          statusText: response.statusText,
          url: url.toString(),
          requestId: requestCtx.requestId
        });
        throw new NtfyConnectionError(
          `HTTP Error: ${response.status} ${response.statusText}`,
          url.toString()
        );
      }

      // Parse response
      const responseText = await response.text();
      const messages: NtfyNotificationMessage[] = [];

      if (responseText.trim()) {
        // Split by lines and parse each JSON message
        const lines = responseText.trim().split('\n');
        for (const line of lines) {
          if (line.trim()) {
            try {
              const message = parseJsonMessageSync(line) as NtfyNotificationMessage;
              // Only include actual notification messages, not keepalive/open
              if (message.event === 'message') {
                messages.push(message);
              }
            } catch (error) {
              moduleLogger.warn('Failed to parse message line', {
                line: line.substring(0, 100),
                error: error instanceof Error ? error.message : String(error),
                requestId: requestCtx.requestId
              });
            }
          }
        }
      }

      // Apply limit if specified
      const limit = options.limit || 100;
      const limitedMessages = messages.slice(0, limit);

      moduleLogger.info('Successfully fetched messages', {
        topic,
        totalMessages: messages.length,
        returnedMessages: limitedMessages.length,
        requestId: requestCtx.requestId
      });

      return limitedMessages;
    },
    {
      operation: 'fetchMessages',
      context: { topic },
      input: sanitizeInputForLogging(options),
      errorCode: BaseErrorCode.SERVICE_UNAVAILABLE,
      errorMapper: ntfyErrorMapper,
      rethrow: true
    }
  );
}

/**
 * Create an enhanced subscription URL with additional options
 * @param topic Topic to subscribe to
 * @param endpoint Endpoint to use
 * @param options Subscription options
 * @param limit Optional message limit for polling
 * @returns Built URL string
 */
export function buildEnhancedSubscriptionUrl(
  topic: string,
  endpoint: string,
  options: NtfySubscriptionOptions & { limit?: number } = {},
  limit?: number
): string {
  const baseUrl = buildSubscriptionUrlSync(topic, endpoint, options);
  const url = new URL(baseUrl);
  
  if (limit && limit > 0) {
    url.searchParams.append('limit', String(limit));
  }
  
  return url.toString();
}