import { BaseErrorCode, McpError } from "../../../types-global/errors.js";
import { ErrorHandler } from "../../../utils/errorHandler.js";
import { publish, NtfyPublishOptions, NtfyPriority } from "../../../services/ntfy/index.js";
import { getNtfyConfig } from "../../../config/envConfig.js";
import { SendNtfyToolInput, SendNtfyToolResponse } from "./types.js";

/**
 * Process and send a notification via ntfy
 * 
 * @param params - Parameters for the ntfy message
 * @returns Response with notification details
 */
export const processNtfyMessage = async (
  params: SendNtfyToolInput
): Promise<SendNtfyToolResponse> => {
  try {
    // Extract the necessary parameters
    const { topic, message, ...options } = params;
    
    // Get the ntfy config
    const ntfyConfig = getNtfyConfig();
    
    // Use default topic from env if not provided and default exists
    const finalTopic = topic || ntfyConfig.defaultTopic;
    
    // Validate topic
    if (!finalTopic) {
      throw new McpError(
        BaseErrorCode.VALIDATION_ERROR,
        "Topic is required and no default topic is configured in the environment"
      );
    }
    
    // Build publish options
    const publishOptions: NtfyPublishOptions = {
      // Pass through all relevant parameters
      title: options.title,
      tags: options.tags,
      priority: options.priority as NtfyPriority | undefined,
      click: options.click,
      actions: options.actions,
      attachment: options.attachment ? {
        url: options.attachment.url,
        // Ensure name is a string if attachment exists but name is undefined
        name: options.attachment.name || options.attachment.url.split('/').pop() || 'attachment'
      } : undefined,
      email: options.email,
      delay: options.delay,
      cache: options.cache,
      firebase: options.firebase,
      id: options.id,
      expires: options.expires,
      markdown: options.markdown,
      
      // Server options
      baseUrl: options.baseUrl || ntfyConfig.baseUrl,
    };
    
    // Authentication handling
    if (options.auth) {
      publishOptions.auth = options.auth;
    } else if (options.username && options.password) {
      publishOptions.username = options.username;
      publishOptions.password = options.password;
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
    
    // Send the notification
    const result = await publish(finalTopic, message, publishOptions);
    
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
  } catch (error) {
    // Handle specific error types
    if (error instanceof Error) {
      throw new McpError(
        BaseErrorCode.SERVICE_UNAVAILABLE,
        `Failed to send ntfy notification: ${error.message}`
      );
    }
    
    // Generic error handling
    throw new McpError(
      BaseErrorCode.INTERNAL_ERROR,
      `Failed to send ntfy notification: Unknown error`
    );
  }
};