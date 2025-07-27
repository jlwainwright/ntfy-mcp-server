import { config } from '../../../config/index.js';
import { BaseErrorCode, McpError } from '../../../types-global/errors.js';
import { ErrorHandler } from '../../../utils/errorHandler.js';
import { logger } from '../../../utils/logger.js';
import { createRequestContext } from '../../../utils/requestContext.js';
import { sanitizeInputForLogging } from '../../../utils/sanitization.js';
import { fetchMessages } from '../../../services/ntfy/utils.js';
import { GetMessagesToolInput, GetMessagesToolResponse } from './types.js';

// Create module logger
const moduleLogger = logger.createChildLogger({ 
  module: 'GetMessagesHandler'
});

/**
 * Process a get messages request
 * 
 * @param input - The validated input for the get messages tool
 * @returns Promise resolving to the tool response
 */
export const processGetMessages = async (input: GetMessagesToolInput): Promise<GetMessagesToolResponse> => {
  return ErrorHandler.tryCatch(
    async () => {
      // Create request context for tracking this operation
      const requestCtx = createRequestContext({
        operation: 'processGetMessages',
        topic: input.topic
      });

      const toolLogger = logger.createChildLogger({
        module: 'GetMessages',
        operation: 'processGetMessages',
        topic: input.topic,
        requestId: requestCtx.requestId
      });

      toolLogger.info('Processing get messages request', {
        topic: input.topic,
        since: input.since,
        limit: input.limit,
        hasFilters: !!input.filters,
        requestId: requestCtx.requestId
      });

      // Prepare options for fetching messages
      const fetchOptions = {
        baseUrl: input.baseUrl || config.ntfy.baseUrl,
        since: input.since,
        scheduled: input.scheduled,
        limit: input.limit || config.ntfy.defaultMessageLimit,
        
        // Add authentication if configured
        ...(config.ntfy.username && config.ntfy.password && {
          username: config.ntfy.username,
          password: config.ntfy.password
        }),
        
        // Add filters if provided
        ...(input.filters?.priority && { priority: input.filters.priority }),
        ...(input.filters?.tags && { tags: input.filters.tags }),
        ...(input.filters?.title && { title: input.filters.title }),
        ...(input.filters?.message && { message: input.filters.message }),
        ...(input.filters?.id && { id: input.filters.id })
      };

      toolLogger.debug('Fetching messages with options', {
        topic: input.topic,
        options: sanitizeInputForLogging(fetchOptions),
        requestId: requestCtx.requestId
      });

      // Fetch messages using the utility function
      const messages = await fetchMessages(input.topic, fetchOptions);

      // Determine if there might be more messages
      const limit = input.limit || config.ntfy.defaultMessageLimit;
      const hasMore = messages.length >= limit;

      const response: GetMessagesToolResponse = {
        success: true,
        topic: input.topic,
        messageCount: messages.length,
        messages,
        since: input.since,
        limit,
        hasMore,
        timestamp: new Date().toISOString()
      };

      toolLogger.info('Successfully retrieved messages', {
        topic: input.topic,
        messageCount: messages.length,
        hasMore,
        requestId: requestCtx.requestId
      });

      return response;
    },
    {
      operation: 'processGetMessages',
      context: { 
        topic: input.topic,
        since: input.since
      },
      input: sanitizeInputForLogging(input),
      errorCode: BaseErrorCode.SERVICE_UNAVAILABLE,
      rethrow: true,
      
      // Map errors appropriately
      errorMapper: (error) => {
        // Log the error
        moduleLogger.error('Error processing get messages request', {
          error: error instanceof Error ? error.message : 'Unknown error',
          errorType: error instanceof Error ? error.name : 'Unknown',
          topic: input.topic
        });
        
        // Pass through McpErrors, map others properly
        if (error instanceof McpError) {
          return error;
        }
        
        // Try to classify unknown errors
        if (error instanceof Error) {
          const errorMsg = error.message.toLowerCase();
          
          if (errorMsg.includes('validation') || errorMsg.includes('invalid')) {
            return new McpError(
              BaseErrorCode.VALIDATION_ERROR,
              `Validation error: ${error.message}`
            );
          } else if (errorMsg.includes('not found') || errorMsg.includes('missing')) {
            return new McpError(
              BaseErrorCode.NOT_FOUND,
              `Topic or messages not found: ${error.message}`
            );
          } else if (errorMsg.includes('timeout')) {
            return new McpError(
              BaseErrorCode.TIMEOUT,
              `Request timed out: ${error.message}`
            );
          } else if (errorMsg.includes('rate limit')) {
            return new McpError(
              BaseErrorCode.RATE_LIMITED,
              `Rate limit exceeded: ${error.message}`
            );
          } else if (errorMsg.includes('unauthorized') || errorMsg.includes('forbidden')) {
            return new McpError(
              BaseErrorCode.UNAUTHORIZED,
              `Authentication error: ${error.message}`
            );
          }
        }
        
        // Default to service unavailable for network/connection issues
        return new McpError(
          BaseErrorCode.SERVICE_UNAVAILABLE,
          `Failed to retrieve messages: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
  );
};