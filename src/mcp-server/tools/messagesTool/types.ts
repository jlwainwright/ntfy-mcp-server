import { z } from 'zod';
import { NtfyNotificationMessage } from '../../../services/ntfy/types.js';

/**
 * Schema for the get_messages tool input
 */
export const GetMessagesToolInputSchema = z.object({
  topic: z.string().min(1, 'Topic is required'),
  since: z.string().optional().describe('Timestamp, duration, or message ID to start from (e.g., "1h", "2023-12-01T10:00:00Z", or message ID)'),
  limit: z.number().min(1).max(1000).optional().describe('Maximum number of messages to retrieve (default: 100, max: 1000)'),
  scheduled: z.boolean().optional().describe('Include scheduled/delayed messages'),
  filters: z.object({
    priority: z.string().optional().describe('Filter by priority (comma-separated list, e.g., "4,5" for high and max priority)'),
    tags: z.string().optional().describe('Filter by tags (comma-separated list)'),
    title: z.string().optional().describe('Filter by message title (substring match)'),
    message: z.string().optional().describe('Filter by message content (substring match)'),
    id: z.string().optional().describe('Filter by specific message ID')
  }).optional().describe('Optional filters for message retrieval'),
  baseUrl: z.string().url().optional().describe('Override the default ntfy server URL for this request')
});

/**
 * Type for the get_messages tool input
 */
export type GetMessagesToolInput = z.infer<typeof GetMessagesToolInputSchema>;

/**
 * Response type for the get_messages tool
 */
export interface GetMessagesToolResponse {
  success: boolean;
  topic: string;
  messageCount: number;
  messages: NtfyNotificationMessage[];
  since?: string;
  limit: number;
  hasMore?: boolean;
  timestamp: string;
}

/**
 * Error response for the get_messages tool
 */
export interface GetMessagesToolError {
  success: false;
  error: string;
  errorCode: string;
  topic?: string;
  timestamp: string;
}