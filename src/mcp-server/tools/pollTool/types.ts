import { z } from 'zod';
import { NtfyNotificationMessage } from '../../../services/ntfy/types.js';

/**
 * Schema for the poll_topic tool input
 */
export const PollTopicToolInputSchema = z.object({
  topic: z.string().min(1, 'Topic is required'),
  resetState: z.boolean().optional().describe('Reset the polling state and start from the beginning'),
  limit: z.number().min(1).max(1000).optional().describe('Maximum number of new messages to retrieve (default: 100, max: 1000)'),
  interval: z.number().min(1000).max(3600000).optional().describe('Polling interval hint in milliseconds (1s to 1h, default: 30s)'),
  baseUrl: z.string().url().optional().describe('Override the default ntfy server URL for this request')
});

/**
 * Type for the poll_topic tool input
 */
export type PollTopicToolInput = z.infer<typeof PollTopicToolInputSchema>;

/**
 * Polling state information
 */
export interface PollState {
  topic: string;
  lastMessageId?: string;
  lastPollTime: number;
  totalMessagesSeen: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Response type for the poll_topic tool
 */
export interface PollTopicToolResponse {
  success: boolean;
  topic: string;
  newMessageCount: number;
  newMessages: NtfyNotificationMessage[];
  pollState: {
    lastMessageId?: string;
    lastPollTime: number;
    totalMessagesSeen: number;
    nextPollRecommended?: number; // timestamp when next poll is recommended
  };
  timestamp: string;
}

/**
 * Error response for the poll_topic tool
 */
export interface PollTopicToolError {
  success: false;
  error: string;
  errorCode: string;
  topic?: string;
  timestamp: string;
}

/**
 * Internal polling state manager interface
 */
export interface PollStateManager {
  getState(topic: string): PollState | undefined;
  setState(topic: string, state: PollState): void;
  resetState(topic: string): void;
  cleanupExpiredStates(): void;
  getAllStates(): Map<string, PollState>;
}