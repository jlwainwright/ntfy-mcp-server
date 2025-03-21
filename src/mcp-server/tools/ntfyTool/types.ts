import { z } from 'zod';
import { getNtfyConfig } from '../../../config/envConfig.js';

/**
 * Valid priority levels for ntfy messages
 */
export const NTFY_PRIORITIES = [1, 2, 3, 4, 5] as const;

/**
 * Input schema for the send_ntfy tool
 */
const ntfyConfig = getNtfyConfig();
const defaultTopicDesc = ntfyConfig.defaultTopic ? `(Default from .env: ${ntfyConfig.defaultTopic})` : '(SET ME IN .ENV)';
const apiKeyPresent = ntfyConfig.apiKey ? true : false;

export const SendNtfyToolInputSchema = z.object({
  // Required parameters
  topic: z.string().min(1).describe(
    `The ntfy topic to send the notification to (required) \n(Default: ${defaultTopicDesc})`
  ),
  message: z.string().min(1).describe(
    'The message to send (notification body)'
  ),
  
  // Optional parameters
  title: z.string().optional().describe(
    'Message title (optional)'
  ),
  tags: z.array(z.string()).optional().describe(
    'Tags for the message that show as emojis (e.g., ["warning", "skull", "robot"])'
  ),
  priority: z.number().int().min(1).max(5).optional().describe(
    'Message priority (1=min, 2=low, 3=default, 4=high, 5=max) (Default: 3)'
  ),
  click: z.string().url().optional().describe(
    'URL to open when notification is clicked (Default: none)'
  ),
  actions: z.array(z.object({
    id: z.string().describe('Action identifier'),
    label: z.string().describe('Label for the action button'),
    action: z.string().describe('Action type (e.g., view, broadcast, http)'),
    url: z.string().url().optional().describe('URL or data for the action'),
    method: z.string().optional().describe('HTTP method for http actions'),
    headers: z.record(z.string()).optional().describe('Additional headers for http actions'),
    body: z.string().optional().describe('Body for http actions'),
    clear: z.boolean().optional().describe('Clear notification after action (Default: false)')
  })).optional().describe(
    'Action buttons that can be displayed in the notification'
  ),
  attachment: z.object({
    url: z.string().url().describe('URL of the attachment'),
    name: z.string().optional().describe('Name of the attachment'),
  }).optional().describe(
    'Attachment for the notification'
  ),
  email: z.string().email().optional().describe(
    'Email address to send the notification to'
  ),
  delay: z.string().optional().describe(
    'Delay the message for a specific time (e.g., 30m, 1h, tomorrow)'
  ),
  cache: z.string().optional().describe(
    'Cache the message for a specific duration (e.g., 10m, 1h, 1d)'
  ),
  firebase: z.string().optional().describe(
    'Firebase Cloud Messaging (FCM) topic to forward to'
  ),
  id: z.string().optional().describe(
    'Unique ID for the message'
  ),
  expires: z.string().optional().describe(
    'Message expiration (e.g., 10m, 1h, 1d)'
  ),
  markdown: z.boolean().optional().describe(
    'Whether to format the message as markdown (Default: false)'
  ),
  // Server options
  baseUrl: z.string().url().optional().describe(
    'Base URL for the ntfy server (default: https://ntfy.sh)'
  ),
  auth: z.string().optional().describe(
    'Authentication token for reserved topics'
  ),
  username: z.string().optional().describe(
    'Username for basic authentication (Default: none)'
  ),
  password: z.string().optional().describe(
    'Password for basic authentication (Default: none)'
  ),
  useApiKey: z.boolean().optional().describe(
    `Whether to use the configured API key for reserved topics (Default: ${apiKeyPresent ? 'true' : 'false'})`
  )
});

export type SendNtfyToolInput = z.infer<typeof SendNtfyToolInputSchema>;

/**
 * Response structure for the send_ntfy tool
 */
export interface SendNtfyToolResponse {
  success: boolean;
  id: string;
  topic: string;
  time: number;
  expires?: number;
  message: string;
  title?: string;
  url?: string;
}