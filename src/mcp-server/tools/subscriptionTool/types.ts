import { z } from 'zod';
import { NtfyNotificationMessage, NtfySubscriptionOptions } from '../../../services/ntfy/types.js';

/**
 * Schema for the subscribe_ntfy tool input
 */
export const SubscribeNtfyToolInputSchema = z.object({
  topic: z.string().min(1, 'Topic is required'),
  action: z.enum(['start', 'stop', 'status', 'list']).describe('Action to perform: start new subscription, stop existing, check status, or list all'),
  subscriptionId: z.string().optional().describe('Subscription ID (required for stop/status actions)'),
  options: z.object({
    poll: z.boolean().optional().describe('Use polling instead of streaming connection'),
    since: z.string().optional().describe('Start from specific timestamp, duration, or message ID'),
    scheduled: z.boolean().optional().describe('Include scheduled/delayed messages'),
    timeout: z.number().min(1000).max(3600000).optional().describe('Subscription timeout in milliseconds (1s to 1h)'),
    filters: z.object({
      priority: z.string().optional().describe('Filter by priority (comma-separated list)'),
      tags: z.string().optional().describe('Filter by tags (comma-separated list)'),
      title: z.string().optional().describe('Filter by message title (substring match)'),
      message: z.string().optional().describe('Filter by message content (substring match)'),
      id: z.string().optional().describe('Filter by specific message ID')
    }).optional().describe('Message filtering options')
  }).optional().describe('Subscription configuration options'),
  baseUrl: z.string().url().optional().describe('Override the default ntfy server URL for this request')
});

/**
 * Type for the subscribe_ntfy tool input
 */
export type SubscribeNtfyToolInput = z.infer<typeof SubscribeNtfyToolInputSchema>;

/**
 * Subscription information
 */
export interface SubscriptionInfo {
  id: string;
  topic: string;
  status: 'active' | 'stopped' | 'error' | 'connecting';
  createdAt: number;
  lastActivity?: number;
  messageCount: number;
  errorMessage?: string;
  options: NtfySubscriptionOptions;
  baseUrl?: string;
}

/**
 * Response type for starting a subscription
 */
export interface StartSubscriptionResponse {
  success: true;
  action: 'start';
  subscriptionId: string;
  topic: string;
  status: 'connecting' | 'active';
  message: string;
  timestamp: string;
}

/**
 * Response type for stopping a subscription
 */
export interface StopSubscriptionResponse {
  success: true;
  action: 'stop';
  subscriptionId: string;
  topic: string;
  message: string;
  timestamp: string;
}

/**
 * Response type for subscription status
 */
export interface StatusSubscriptionResponse {
  success: true;
  action: 'status';
  subscription: SubscriptionInfo;
  timestamp: string;
}

/**
 * Response type for listing subscriptions
 */
export interface ListSubscriptionsResponse {
  success: true;
  action: 'list';
  subscriptions: SubscriptionInfo[];
  activeCount: number;
  totalCount: number;
  timestamp: string;
}

/**
 * Union type for all subscription tool responses
 */
export type SubscribeNtfyToolResponse = 
  | StartSubscriptionResponse 
  | StopSubscriptionResponse 
  | StatusSubscriptionResponse 
  | ListSubscriptionsResponse;

/**
 * Error response for the subscribe_ntfy tool
 */
export interface SubscribeNtfyToolError {
  success: false;
  error: string;
  errorCode: string;
  action?: string;
  subscriptionId?: string;
  topic?: string;
  timestamp: string;
}

/**
 * Internal subscription manager interface
 */
export interface SubscriptionManager {
  createSubscription(topic: string, options: NtfySubscriptionOptions, baseUrl?: string): Promise<string>;
  stopSubscription(subscriptionId: string): Promise<boolean>;
  getSubscription(subscriptionId: string): SubscriptionInfo | undefined;
  getAllSubscriptions(): SubscriptionInfo[];
  getActiveSubscriptions(): SubscriptionInfo[];
  cleanupExpiredSubscriptions(): void;
  getSubscriptionCount(): number;
}