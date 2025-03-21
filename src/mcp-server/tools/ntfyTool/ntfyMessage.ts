import { BaseErrorCode, McpError } from "../../../types-global/errors.js";
import { ErrorHandler } from "../../../utils/errorHandler.js";
import { publish, NtfyPublishOptions, NtfyPriority, validateTopicSync } from "../../../services/ntfy/index.js";
import { getNtfyConfig } from "../../../config/envConfig.js";
import { SendNtfyToolInput, SendNtfyToolResponse } from "./types.js";
import { logger } from "../../../utils/logger.js";
import { createRequestContext } from "../../../utils/requestContext.js";
import { sanitizeInput, sanitizeInputForLogging } from "../../../utils/sanitization.js";
import { idGenerator } from "../../../utils/idGenerator.js";

// Create a module-specific logger
const ntfyToolLogger = logger.createChildLogger({ 
  module: 'NtfyTool',
  serviceId: idGenerator.generateRandomString(8)
});

/**
 * Process and send a notification via ntfy
 * 
 * @param params - Parameters for the ntfy message
 * @returns Response with notification details
 */
export const processNtfyMessage = async (
  params: SendNtfyToolInput
): Promise<SendNtfyToolResponse> => {
  return ErrorHandler.tryCatch(
    async () => {
      // Create request context for tracking
      const requestCtx = createRequestContext({
        operation: 'processNtfyMessage',
        messageId: idGenerator.generateRandomString(8),
        hasTitle: !!params.title,
        hasTags: !!params.tags && params.tags.length > 0,
        priority: params.priority,
        topic: params.topic
      });

      // Extract the necessary parameters
      const { topic, message, ...options } = params;
      
      ntfyToolLogger.info('Processing ntfy message request', {
        topic,
        hasTags: !!options.tags && options.tags.length > 0,
        hasTitle: !!options.title,
        messageLength: message?.length,
        requestId: requestCtx.requestId
      });
      
      // Get the ntfy config
      const ntfyConfig = getNtfyConfig();
      
      // Use default topic from env if not provided and default exists
      const finalTopic = topic || ntfyConfig.defaultTopic;
      
      // Validate topic
      if (!finalTopic) {
        ntfyToolLogger.error('Topic validation failed - missing topic', {
          requestId: requestCtx.requestId
        });
        throw new McpError(
          BaseErrorCode.VALIDATION_ERROR,
          "Topic is required and no default topic is configured in the environment"
        );
      }

      // Additional topic validation using our utility
      if (!validateTopicSync(finalTopic)) {
        ntfyToolLogger.error('Topic validation failed - invalid topic format', {
          topic: finalTopic,
          requestId: requestCtx.requestId
        });
        throw new McpError(
          BaseErrorCode.VALIDATION_ERROR,
          "Invalid topic format. Topics must be non-empty and cannot contain newlines"
        );
      }
      
      // Build publish options with sanitized inputs
      const publishOptions: NtfyPublishOptions = {
        // Pass through all relevant parameters with sanitization
        title: options.title ? sanitizeInput.string(options.title) : undefined,
        tags: options.tags ? options.tags.map(tag => sanitizeInput.string(tag)) : undefined,
        priority: options.priority as NtfyPriority | undefined,
        click: options.click ? sanitizeInput.url(options.click) : undefined,
        actions: options.actions ? options.actions.map(action => ({
          id: sanitizeInput.string(action.id),
          label: sanitizeInput.string(action.label),
          action: sanitizeInput.string(action.action),
          url: action.url ? sanitizeInput.url(action.url) : undefined,
          method: action.method ? sanitizeInput.string(action.method) : undefined,
          headers: action.headers,
          body: action.body ? sanitizeInput.string(action.body) : undefined,
          clear: action.clear
        })) : undefined,
        attachment: options.attachment ? {
          url: sanitizeInput.url(options.attachment.url),
          // Ensure name is a string if attachment exists but name is undefined
          name: options.attachment.name 
            ? sanitizeInput.string(options.attachment.name) 
            : sanitizeInput.string(options.attachment.url.split('/').pop() || 'attachment')
        } : undefined,
        email: options.email ? sanitizeInput.string(options.email) : undefined,
        delay: options.delay ? sanitizeInput.string(options.delay) : undefined,
        cache: options.cache ? sanitizeInput.string(options.cache) : undefined,
        firebase: options.firebase ? sanitizeInput.string(options.firebase) : undefined,
        id: options.id ? sanitizeInput.string(options.id) : undefined,
        expires: options.expires ? sanitizeInput.string(options.expires) : undefined,
        markdown: options.markdown,
        
        // Server options
        baseUrl: options.baseUrl ? sanitizeInput.url(options.baseUrl) : ntfyConfig.baseUrl,
      };
      
      ntfyToolLogger.debug('Prepared publish options', {
        topic: finalTopic,
        hasTitle: !!publishOptions.title,
        hasTags: !!publishOptions.tags && publishOptions.tags.length > 0,
        baseUrl: publishOptions.baseUrl,
        requestId: requestCtx.requestId
      });
      
      // Authentication handling
      if (options.auth) {
        publishOptions.auth = sanitizeInput.string(options.auth);
      } else if (options.username && options.password) {
        publishOptions.username = sanitizeInput.string(options.username);
        publishOptions.password = options.password; // Password is handled securely by the ntfy service
      } else {
        // Handle useApiKey
        // Default: true if API key exists, otherwise false
        const shouldUseApiKey = options.useApiKey !== undefined 
          ? options.useApiKey 
          : !!ntfyConfig.apiKey; // Default to true if API key exists
          
        if (shouldUseApiKey && ntfyConfig.apiKey) {
          // If useApiKey is true and we have an API key configured, use it
          publishOptions.auth = ntfyConfig.apiKey;
        }
      }
      
      ntfyToolLogger.debug('Authentication configured', {
        hasAuth: !!publishOptions.auth,
        hasBasicAuth: !!(publishOptions.username && publishOptions.password),
        useApiKey: options.useApiKey,
        requestId: requestCtx.requestId
      });
      
      // Send the notification
      ntfyToolLogger.info('Sending notification', {
        topic: finalTopic,
        messageLength: message?.length,
        requestId: requestCtx.requestId
      });
      
      const result = await publish(finalTopic, message, publishOptions);
      
      ntfyToolLogger.info('Notification sent successfully', {
        messageId: result.id,
        topic: result.topic,
        requestId: requestCtx.requestId
      });
      
      // Return the response
      return {
        success: true,
        id: result.id,
        topic: result.topic,
        time: result.time,
        expires: result.expires,
        message: message,
        title: options.title,
        url: options.click,
      };
    },
    {
      operation: 'processNtfyMessage',
      context: { 
        topic: params.topic || getNtfyConfig().defaultTopic,
        hasTitle: !!params.title
      },
      input: sanitizeInputForLogging(params),
      errorCode: BaseErrorCode.SERVICE_UNAVAILABLE,
      errorMapper: (error) => {
        if (error instanceof McpError) {
          return error;
        }
        return new McpError(
          BaseErrorCode.SERVICE_UNAVAILABLE,
          `Failed to send ntfy notification: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      },
      rethrow: true
    }
  );
};