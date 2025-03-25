import { z } from 'zod';
import { getNtfyConfig } from '../../../config/envConfig.js';
import { logger } from '../../../utils/logger.js';
import { createRequestContext } from '../../../utils/requestContext.js';
import { sanitizeInput } from '../../../utils/sanitization.js';

// Create a module-specific logger
const schemaLogger = logger.createChildLogger({ 
  module: 'NtfyToolSchema'
});

/**
 * Valid priority levels for ntfy messages
 */
export const NTFY_PRIORITIES = [1, 2, 3, 4, 5] as const;

/**
 * Validates a ntfy topic string format
 * 
 * @param topic - The topic string to validate
 * @returns boolean indicating if topic is valid
 */
function isValidTopic(topic: string): boolean {
  if (!topic) return false;
  return topic.trim() !== '' && !/[\r\n]/.test(topic);
}

/**
 * Creates a Zod schema for the send_ntfy tool with current environment values
 * This function should be called at registration time to ensure it has the
 * latest configuration values from the environment
 * 
 * @returns A Zod schema for the ntfy tool
 */
export function createSendNtfyToolSchema() {
  // Create request context for tracking
  const requestCtx = createRequestContext({
    operation: 'createSendNtfyToolSchema'
  });
  
  schemaLogger.debug('Creating send_ntfy tool schema');
  
  // Get the latest configuration
  const ntfyConfig = getNtfyConfig();
  
  // Process configuration values
  const baseUrl = ntfyConfig.baseUrl || 'https://ntfy.sh';
  const defaultTopic = ntfyConfig.defaultTopic || '';
  const maxMessageSize = ntfyConfig.maxMessageSize || 4096;
  
  // Log the loaded config values for debugging
  schemaLogger.debug('Loaded ntfy configuration', {
    defaultTopic: defaultTopic || '(not set)',
    baseUrl,
    maxMessageSize
  });
  
  // Generate better description text based on current config
  const topicDesc = defaultTopic 
    ? `The ntfy topic to send the notification to (required). Default topic configured: "${defaultTopic}"`
    : `The ntfy topic to send the notification to (required). No default topic configured.`;
  
  schemaLogger.debug('Schema configuration loaded', {
    hasBaseUrl: !!baseUrl,
    hasDefaultTopic: !!defaultTopic,
    hasApiKey: !!ntfyConfig.apiKey,
    maxMessageSize
  });

  // Create schema with the latest config values
  const schema = z.object({
    // Required parameters
    topic: z.string()
      .min(1, "Topic must not be empty")
      .refine(isValidTopic, "Topic must not contain newlines")
      .describe(topicDesc),
    
    message: z.string()
      .min(1, "Message must not be empty")
      .max(maxMessageSize, `Message size cannot exceed ${maxMessageSize} bytes`)
      .describe(`The message to send (notification body, max ${maxMessageSize} bytes)`),
    
    // Optional parameters with improved descriptions
    title: z.string()
      .max(250, "Title should be under 250 characters")
      .optional()
      .describe('Message title (optional)'),
    
    tags: z.array(z.string())
      .max(5, "Maximum of 5 tags allowed")
      .optional()
      .describe('Tags that show as emojis (e.g., ["warning", "skull", "robot"])'),
    
    priority: z.number()
      .int()
      .min(1)
      .max(5)
      .optional()
      .describe('Message priority: 1=min, 2=low, 3=default, 4=high, 5=max'),
    
    click: z.string()
      .url("Must be a valid URL")
      .optional()
      .describe('URL to open when notification is clicked'),
    
    actions: z.array(z.object({
      id: z.string().describe('Action identifier'),
      label: z.string().describe('Label for the action button'),
      action: z.string().describe('Action type (e.g., view, broadcast, http)'),
      url: z.string().url("Must be a valid URL").optional().describe('URL or data for the action'),
      method: z.string().optional().describe('HTTP method for http actions'),
      headers: z.record(z.string()).optional().describe('Additional headers for http actions'),
      body: z.string().optional().describe('Body for http actions'),
      clear: z.boolean().optional().describe('Clear notification after action (Default: false)')
    }))
    .max(3, "Maximum of 3 actions supported")
    .optional()
    .describe('Action buttons in the notification (max 3)'),
    
    attachment: z.object({
      url: z.string().url("Must be a valid URL").describe('URL of the attachment'),
      name: z.string().optional().describe('Name of the attachment'),
    })
    .optional()
    .describe('Attachment for the notification'),
    
    email: z.string()
      .email("Must be a valid email address")
      .optional()
      .describe('Email address to send the notification to'),
    
    delay: z.string()
      .optional()
      .describe('Delay the message (e.g., 30m, 1h, tomorrow)'),
    
    cache: z.string()
      .optional()
      .describe('Cache duration (e.g., 10m, 1h, 1d)'),
    
    firebase: z.string()
      .optional()
      .describe('Firebase Cloud Messaging (FCM) topic to forward to'),
    
    id: z.string()
      .optional()
      .describe('Unique ID for the message'),
    
    expires: z.string()
      .optional()
      .describe('Message expiration (e.g., 10m, 1h, 1d)'),
    
    markdown: z.boolean()
      .optional()
      .describe('Format message as markdown'),
    
    // Server options
    baseUrl: z.string()
      .url("Must be a valid URL")
      .optional()
      .describe(`Base URL for the ntfy server (default: ${baseUrl})`)
    
    // Authentication is handled automatically using API key from .env when available
  });
  
  schemaLogger.info('Send_ntfy tool schema created successfully', {
    fieldCount: Object.keys(schema.shape).length
  });
  
  return schema;
}

// Create a dynamic version of the schema for type inference
// We want to ensure this is always recreated at runtime with the latest env values
export const SendNtfyToolInputSchema = () => createSendNtfyToolSchema();

// Export the type for use in other modules
// Still use a static schema creation for the type to avoid TypeScript errors
// This doesn't affect runtime behavior, only static type checking
export type SendNtfyToolInput = z.infer<ReturnType<typeof createSendNtfyToolSchema>>;

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
  /** Number of retries needed (if any) */
  retries?: number;
}
