/**
 * Constants for the ntfy service
 */

/** Default ntfy server URL */
export const DEFAULT_NTFY_BASE_URL = 'https://ntfy.sh';

/** HTTP subscription format endpoints */
export const SUBSCRIPTION_ENDPOINTS = {
  json: '/json',
  sse: '/sse',
  raw: '/raw',
  ws: '/ws',
};

/** Default subscription options */
export const DEFAULT_SUBSCRIPTION_OPTIONS = {
  baseUrl: DEFAULT_NTFY_BASE_URL,
  poll: false,
  scheduled: false,
};

/** Default HTTP request timeout in milliseconds */
export const DEFAULT_REQUEST_TIMEOUT = 30000;

/** Keepalive timeout in milliseconds (how long to wait before considering connection dead) */
export const KEEPALIVE_TIMEOUT = 120000;

/** Reconnect delay in milliseconds (delay before attempting to reconnect after failure) */
export const RECONNECT_DELAY = 5000;

/** Maximum reconnect attempts before giving up */
export const MAX_RECONNECT_ATTEMPTS = 5;

/** User agent string for requests */
export const USER_AGENT = 'ntfy-mcp-server/1.0.0';

/** Error messages */
export const ERROR_MESSAGES = {
  INVALID_TOPIC: 'Invalid topic name',
  CONNECTION_FAILED: 'Failed to connect to ntfy server',
  SUBSCRIPTION_CLOSED: 'Subscription closed',
  PARSE_ERROR: 'Failed to parse message',
  NETWORK_ERROR: 'Network error occurred',
  AUTHENTICATION_FAILED: 'Authentication failed',
};