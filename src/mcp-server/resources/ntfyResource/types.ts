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
 * Data structure for the ntfy response
 */
export interface NtfyData {
  defaultTopic: string;         // The default ntfy topic
  timestamp: string;            // When the request was processed
  requestUri: string;           // The original request URI
}
