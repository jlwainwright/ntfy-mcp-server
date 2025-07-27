import { config } from '../../../config/index.js';
import { BaseErrorCode, McpError } from '../../../types-global/errors.js';
import { ErrorHandler } from '../../../utils/errorHandler.js';
import { logger } from '../../../utils/logger.js';
import { createRequestContext } from '../../../utils/requestContext.js';
import { sanitizeInputForLogging } from '../../../utils/sanitization.js';
import { fetchMessages } from '../../../services/ntfy/utils.js';
import { NtfyNotificationMessage } from '../../../services/ntfy/types.js';
import { PollTopicToolInput, PollTopicToolResponse, PollState } from './types.js';
import { pollStateManager } from './pollState.js';

// Create module logger
const moduleLogger = logger.createChildLogger({ 
  module: 'PollManager'
});

/**
 * Process a poll topic request
 * 
 * @param input - The validated input for the poll topic tool
 * @returns Promise resolving to the tool response
 */
export const processPollTopic = async (input: PollTopicToolInput): Promise<PollTopicToolResponse> => {
  return ErrorHandler.tryCatch(
    async () => {
      // Create request context for tracking this operation
      const requestCtx = createRequestContext({
        operation: 'processPollTopic',
        topic: input.topic
      });

      const toolLogger = logger.createChildLogger({
        module: 'PollTopic',
        operation: 'processPollTopic',
        topic: input.topic,
        requestId: requestCtx.requestId
      });

      toolLogger.info('Processing poll topic request', {
        topic: input.topic,
        resetState: input.resetState,
        limit: input.limit,
        requestId: requestCtx.requestId
      });

      // Handle state reset if requested
      if (input.resetState) {
        pollStateManager.resetState(input.topic);
        toolLogger.info('Poll state reset for topic', {
          topic: input.topic,
          requestId: requestCtx.requestId
        });
      }

      // Get current polling state
      let pollState = pollStateManager.getState(input.topic);
      
      // Create new state if none exists
      if (!pollState) {
        const now = Date.now();
        pollState = {
          topic: input.topic,
          lastPollTime: now,
          totalMessagesSeen: 0,
          createdAt: now,
          updatedAt: now
        };
        
        toolLogger.debug('Created new poll state', {
          topic: input.topic,
          requestId: requestCtx.requestId
        });
      }

      // Determine the 'since' parameter for fetching new messages
      let since: string | undefined;
      if (pollState.lastMessageId) {
        // If we have a last message ID, use it to get messages after that
        since = pollState.lastMessageId;
      } else if (pollState.lastPollTime > 0) {
        // If we don't have a message ID but have a poll time, use that
        // Convert timestamp to ISO string
        since = new Date(pollState.lastPollTime).toISOString();
      }
      // If neither exists, we'll get recent messages (ntfy default behavior)

      // Prepare options for fetching messages
      const fetchOptions = {
        baseUrl: input.baseUrl || config.ntfy.baseUrl,
        since,
        limit: input.limit || config.ntfy.defaultMessageLimit,
        
        // Add authentication if configured
        ...(config.ntfy.username && config.ntfy.password && {
          username: config.ntfy.username,
          password: config.ntfy.password
        })
      };

      toolLogger.debug('Fetching new messages since last poll', {
        topic: input.topic,
        since,
        limit: fetchOptions.limit,
        options: sanitizeInputForLogging(fetchOptions),
        requestId: requestCtx.requestId
      });

      // Fetch messages
      const allMessages = await fetchMessages(input.topic, fetchOptions);
      
      // Filter out messages we've already seen (if we're using timestamp-based since)
      let newMessages: NtfyNotificationMessage[] = [];
      
      if (pollState.lastMessageId) {
        // If we have a last message ID, all returned messages should be new
        newMessages = allMessages;
      } else {
        // If we're using timestamp-based filtering, we need to be more careful
        // to avoid duplicates. Filter by timestamp being after our last poll time.
        const lastPollTimestamp = pollState.lastPollTime;
        newMessages = allMessages.filter(msg => 
          msg.time * 1000 > lastPollTimestamp // ntfy time is in seconds, convert to ms
        );
      }

      // Update polling state
      const now = Date.now();
      if (newMessages.length > 0) {
        // Update last message ID to the most recent message
        const mostRecentMessage = newMessages[newMessages.length - 1];
        pollState.lastMessageId = mostRecentMessage.id;
        pollState.totalMessagesSeen += newMessages.length;
      }
      
      pollState.lastPollTime = now;
      pollState.updatedAt = now;
      
      // Save updated state
      pollStateManager.setState(input.topic, pollState);

      // Calculate next recommended poll time based on interval hint
      const intervalHint = input.interval || 30000; // Default 30 seconds
      const nextPollRecommended = now + intervalHint;

      const response: PollTopicToolResponse = {
        success: true,
        topic: input.topic,
        newMessageCount: newMessages.length,
        newMessages,
        pollState: {
          lastMessageId: pollState.lastMessageId,
          lastPollTime: pollState.lastPollTime,
          totalMessagesSeen: pollState.totalMessagesSeen,
          nextPollRecommended
        },
        timestamp: new Date().toISOString()
      };

      toolLogger.info('Successfully polled topic', {
        topic: input.topic,
        newMessageCount: newMessages.length,
        totalMessagesSeen: pollState.totalMessagesSeen,
        nextPollRecommended: new Date(nextPollRecommended).toISOString(),
        requestId: requestCtx.requestId
      });

      return response;
    },
    {
      operation: 'processPollTopic',
      context: { 
        topic: input.topic,
        resetState: input.resetState
      },
      input: sanitizeInputForLogging(input),
      errorCode: BaseErrorCode.SERVICE_UNAVAILABLE,
      rethrow: true,
      
      // Map errors appropriately
      errorMapper: (error) => {
        // Log the error
        moduleLogger.error('Error processing poll topic request', {
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
              `Topic not found: ${error.message}`
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
          `Failed to poll topic: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
  );
};