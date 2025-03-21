/**
 * Ntfy publisher implementation for sending notifications
 */
import { DEFAULT_NTFY_BASE_URL, DEFAULT_REQUEST_TIMEOUT, ERROR_MESSAGES } from './constants.js';
import { NtfyConnectionError, NtfyInvalidTopicError } from './errors.js';
import { NtfyAction, NtfyAttachment, NtfyPriority } from './types.js';
import { createRequestHeaders, createTimeout, isValidTopic } from './utils.js';

/**
 * Options for publishing to ntfy topics
 */
export interface NtfyPublishOptions {
  /** Base URL for the ntfy server */
  baseUrl?: string;
  /** Authentication token */
  auth?: string;
  /** Basic auth username */
  username?: string;
  /** Basic auth password */
  password?: string;
  /** Additional headers to include in requests */
  headers?: Record<string, string>;
  /** Message title */
  title?: string;
  /** Message tags (emojis) */
  tags?: string[];
  /** Message priority (1-5) */
  priority?: NtfyPriority;
  /** URL to open when notification is clicked */
  click?: string;
  /** Message actions (buttons, etc.) */
  actions?: NtfyAction[];
  /** Message attachment */
  attachment?: NtfyAttachment;
  /** Email addresses to send the notification to */
  email?: string;
  /** Delay the message for a specific time (e.g., 30m, 1h, tomorrow) */
  delay?: string;
  /** Cache the message for a specific duration (e.g., 10m, 1h, 1d) */
  cache?: string;
  /** Firebase Cloud Messaging (FCM) topic to forward to */
  firebase?: string;
  /** Unique ID for the message */
  id?: string;
  /** Message expiration (e.g., 10m, 1h, 1d) */
  expires?: string;
  /** Whether the message should be X-Forwarded */
  markdown?: boolean;
}

/**
 * Response from publishing to ntfy
 */
export interface NtfyPublishResponse {
  /** Server-assigned message ID */
  id: string;
  /** Time the message was received */
  time: number;
  /** Message expiration timestamp (if set) */
  expires?: number;
  /** Topic the message was published to */
  topic: string;
}

/**
 * Publish a message to a ntfy topic
 * 
 * @param topic - Topic to publish to
 * @param message - Message to publish
 * @param options - Publishing options
 * @returns Promise resolving to the publish response
 * @throws NtfyInvalidTopicError if the topic name is invalid
 * @throws NtfyConnectionError if the connection fails
 */
export async function publish(
  topic: string,
  message: string,
  options: NtfyPublishOptions = {}
): Promise<NtfyPublishResponse> {
  // Validate topic
  if (!isValidTopic(topic)) {
    throw new NtfyInvalidTopicError(ERROR_MESSAGES.INVALID_TOPIC, topic);
  }

  // Build URL
  const baseUrl = options.baseUrl || DEFAULT_NTFY_BASE_URL;
  const url = `${baseUrl}/${topic}`;

  // Prepare headers
  const initialHeaders = createRequestHeaders({
    auth: options.auth,
    username: options.username,
    password: options.password,
    headers: options.headers,
  });

  // Convert HeadersInit to a Record for easier manipulation
  const headers: Record<string, string> = {};
  
  // Copy initial headers to our record object
  if (initialHeaders instanceof Headers) {
    initialHeaders.forEach((value, key) => {
      headers[key] = value;
    });
  } else if (Array.isArray(initialHeaders)) {
    for (const [key, value] of initialHeaders) {
      headers[key] = value;
    }
  } else if (initialHeaders) {
    Object.assign(headers, initialHeaders);
  }

  // Set content type
  headers['Content-Type'] = 'text/plain';

  // Add special headers for ntfy features
  if (options.title) {
    headers['X-Title'] = options.title;
  }

  if (options.tags && options.tags.length > 0) {
    headers['X-Tags'] = options.tags.join(',');
  }

  if (options.priority) {
    headers['X-Priority'] = options.priority.toString();
  }

  if (options.click) {
    headers['X-Click'] = options.click;
  }

  if (options.actions && options.actions.length > 0) {
    headers['X-Actions'] = JSON.stringify(options.actions);
  }

  if (options.attachment) {
    headers['X-Attach'] = options.attachment.url;
    if (options.attachment.name) {
      headers['X-Filename'] = options.attachment.name;
    }
  }

  if (options.email) {
    headers['X-Email'] = options.email;
  }

  if (options.delay) {
    headers['X-Delay'] = options.delay;
  }

  if (options.cache) {
    headers['X-Cache'] = options.cache;
  }

  if (options.firebase) {
    headers['X-Firebase'] = options.firebase;
  }

  if (options.id) {
    headers['X-ID'] = options.id;
  }

  if (options.expires) {
    headers['X-Expires'] = options.expires;
  }

  if (options.markdown) {
    headers['X-Markdown'] = 'true';
  }

  try {
    // Send request with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_REQUEST_TIMEOUT);

    const response = await Promise.race([
      fetch(url, {
        method: 'POST',
        headers,
        body: message,
        signal: controller.signal,
      }),
      createTimeout(DEFAULT_REQUEST_TIMEOUT),
    ]);

    clearTimeout(timeoutId);

    // Check response status
    if (!response.ok) {
      throw new NtfyConnectionError(
        `HTTP Error: ${response.status} ${response.statusText}`,
        url
      );
    }

    // Parse response
    const result = await response.json();
    return result as NtfyPublishResponse;
  } catch (error) {
    if (error instanceof NtfyInvalidTopicError) {
      throw error;
    }

    throw new NtfyConnectionError(
      `Error publishing to topic: ${error instanceof Error ? error.message : String(error)}`,
      url
    );
  }
}