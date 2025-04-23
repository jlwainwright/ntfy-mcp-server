import { z } from 'zod';

/**
 * Schema for validating ntfy resource query parameters
 */
export const NtfyResourceQuerySchema = z.object({
  // No parameters needed for default topic
}).describe(
  'Query parameters for the ntfy resource.\n' +
  'URI Format: ntfy://default'
);

export type NtfyResourceQuery = z.infer<typeof NtfyResourceQuerySchema>;

/**
 * Response type for the ntfy resource, matching MCP SDK expectations
 */
export interface NtfyResourceResponse {
  [key: string]: unknown;
  contents: [{
    uri: string;                   // URI identifying this resource
    text: string;                  // JSON string of NtfyData
    mimeType: "application/json";  // Always JSON for this resource
  }];
}

/**
 * Represents a single message retrieved from the ntfy topic history.
 * Based on the structure observed from ntfy.sh/topic/json.
 */
export interface NtfyMessage {
  id: string;
  time: number; // Unix timestamp
  event: 'message';
  topic: string;
  message: string;
  title?: string;
  tags?: string[];
  priority?: number;
  click?: string;
  actions?: any[]; // Define more strictly if needed
  attachment?: {
    name: string;
    type?: string;
    size?: number;
    expires?: number;
    url: string;
  };
  // Other potential fields depending on ntfy version/features
  [key: string]: any; 
}

/**
 * Data structure for the ntfy resource response content.
 * This reflects the actual JSON structure returned within the 'text' field 
 * of the McpContent object.
 */
export type NtfyResourceData = {
  timestamp: string;            // ISO timestamp when the request was processed
  requestUri: string;           // The original request URI (e.g., ntfy://default)
  requestId: string;            // Unique ID for the request context
  recentMessages?: NtfyMessage[]; // Optional array of recent messages (up to 10)
} & (
  | { 
      requestedTopic: "default"; // Indicates 'default' was requested
      resolvedTopic: string;     // The actual default topic from config
    }
  | { 
      topic: string;             // The specific topic requested and used
    }
);
