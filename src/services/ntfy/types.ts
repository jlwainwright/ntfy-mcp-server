/**
 * Types for the ntfy service
 */

/**
 * Message event types from ntfy
 */
export type NtfyEventType = 'open' | 'message' | 'keepalive' | 'poll_request';

/**
 * Message priority levels
 * - 1: min priority
 * - 2: low priority
 * - 3: default priority
 * - 4: high priority
 * - 5: max priority
 */
export type NtfyPriority = 1 | 2 | 3 | 4 | 5;

/**
 * Subscription format types
 */
export type NtfySubscriptionFormat = 'json' | 'sse' | 'raw' | 'ws';

/**
 * Attachment information
 */
export interface NtfyAttachment {
  /** Name of the attachment */
  name: string;
  /** URL of the attachment */
  url: string;
  /** Mime type of the attachment (only defined if attachment was uploaded to ntfy server) */
  type?: string;
  /** Size of the attachment in bytes (only defined if attachment was uploaded to ntfy server) */
  size?: number;
  /** Attachment expiry date as Unix time stamp (only defined if attachment was uploaded to ntfy server) */
  expires?: number;
}

/**
 * Action button definition
 */
export interface NtfyAction {
  /** Action identifier */
  id: string;
  /** Label for the action button */
  label: string;
  /** Action type (e.g., view, broadcast, http) */
  action: string;
  /** URL or data for the action */
  url?: string;
  /** HTTP method for http actions */
  method?: string;
  /** Additional headers for http actions */
  headers?: Record<string, string>;
  /** Body for http actions */
  body?: string;
  /** Clear notification after action */
  clear?: boolean;
}

/**
 * Base message interface with common fields for all message types
 */
export interface NtfyBaseMessage {
  /** Randomly chosen message identifier */
  id: string;
  /** Message date time, as Unix time stamp */
  time: number;
  /** Message type */
  event: NtfyEventType;
  /** Comma-separated list of topics the message is associated with */
  topic: string;
  /** Unix time stamp indicating when the message will be deleted */
  expires?: number;
}

/**
 * Regular notification message
 */
export interface NtfyNotificationMessage extends NtfyBaseMessage {
  event: 'message';
  /** Message body */
  message: string;
  /** Message title */
  title?: string;
  /** List of tags that may or not map to emojis */
  tags?: string[];
  /** Message priority with 1=min, 3=default and 5=max */
  priority?: NtfyPriority;
  /** Website opened when notification is clicked */
  click?: string;
  /** Action buttons that can be displayed in the notification */
  actions?: NtfyAction[];
  /** Details about an attachment */
  attachment?: NtfyAttachment;
}

/**
 * Connection open message
 */
export interface NtfyOpenMessage extends NtfyBaseMessage {
  event: 'open';
}

/**
 * Keepalive message to maintain connection
 */
export interface NtfyKeepaliveMessage extends NtfyBaseMessage {
  event: 'keepalive';
}

/**
 * Poll request message
 */
export interface NtfyPollRequestMessage extends NtfyBaseMessage {
  event: 'poll_request';
}

/**
 * Union of all message types
 */
export type NtfyMessage = 
  | NtfyNotificationMessage 
  | NtfyOpenMessage 
  | NtfyKeepaliveMessage 
  | NtfyPollRequestMessage;

/**
 * Options for subscribing to ntfy topics
 */
export interface NtfySubscriptionOptions {
  /** Whether to poll for messages instead of maintaining a connection */
  poll?: boolean;
  /** Return cached messages since timestamp, duration or message ID */
  since?: string | number;
  /** Include scheduled/delayed messages */
  scheduled?: boolean;
  /** Filter by message ID */
  id?: string;
  /** Filter by message content */
  message?: string;
  /** Filter by title */
  title?: string;
  /** Filter by priority (comma-separated list) */
  priority?: string;
  /** Filter by tags (comma-separated list) */
  tags?: string;
  /** Base URL for the ntfy server */
  baseUrl?: string;
  /** Authentication token or credentials */
  auth?: string;
  /** Basic auth username */
  username?: string;
  /** Basic auth password */
  password?: string;
  /** Additional headers to include in requests */
  headers?: Record<string, string>;
}

/**
 * Subscription event handlers
 */
export interface NtfySubscriptionHandlers {
  /** Called when a message is received */
  onMessage?: (message: NtfyNotificationMessage) => void;
  /** Called when the connection is opened */
  onOpen?: (message: NtfyOpenMessage) => void;
  /** Called when a keepalive message is received */
  onKeepalive?: (message: NtfyKeepaliveMessage) => void;
  /** Called when an error occurs */
  onError?: (error: Error) => void;
  /** Called when the connection is closed */
  onClose?: () => void;
  /** Called when any message is received (regardless of type) */
  onAnyMessage?: (message: NtfyMessage) => void;
}