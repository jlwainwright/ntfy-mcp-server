import { config } from '../../../config/index.js';
import { BaseErrorCode, McpError } from '../../../types-global/errors.js';
import { ErrorHandler } from '../../../utils/errorHandler.js';
import { logger } from '../../../utils/logger.js';
import { createRequestContext } from '../../../utils/requestContext.js';
import { sanitizeInputForLogging } from '../../../utils/sanitization.js';
import { 
  SubscribeNtfyToolInput, 
  SubscribeNtfyToolResponse,
  StartSubscriptionResponse,
  StopSubscriptionResponse,
  StatusSubscriptionResponse,
  ListSubscriptionsResponse
} from './types.js';
import { subscriptionManager } from './subscriptionManager.js';

// Create module logger
const moduleLogger = logger.createChildLogger({ 
  module: 'SubscriptionHandlers'
});

/**
 * Process a subscription tool request
 * 
 * @param input - The validated input for the subscription tool
 * @returns Promise resolving to the tool response
 */
export const processSubscription = async (input: SubscribeNtfyToolInput): Promise<SubscribeNtfyToolResponse> => {
  return ErrorHandler.tryCatch(
    async () => {
      // Create request context for tracking this operation
      const requestCtx = createRequestContext({
        operation: 'processSubscription',
        action: input.action,
        topic: input.topic,
        subscriptionId: input.subscriptionId
      });

      const toolLogger = logger.createChildLogger({
        module: 'SubscribeNtfy',
        operation: 'processSubscription',
        action: input.action,
        topic: input.topic,
        subscriptionId: input.subscriptionId,
        requestId: requestCtx.requestId
      });

      toolLogger.info('Processing subscription request', {
        action: input.action,
        topic: input.topic,
        subscriptionId: input.subscriptionId,
        requestId: requestCtx.requestId
      });

      switch (input.action) {
        case 'start':
          return await handleStartSubscription(input, toolLogger);
        
        case 'stop':
          return await handleStopSubscription(input, toolLogger);
        
        case 'status':
          return await handleSubscriptionStatus(input, toolLogger);
        
        case 'list':
          return await handleListSubscriptions(input, toolLogger);
        
        default:
          throw new McpError(
            BaseErrorCode.VALIDATION_ERROR,
            `Unknown action: ${input.action}`
          );
      }
    },
    {
      operation: 'processSubscription',
      context: { 
        action: input.action,
        topic: input.topic,
        subscriptionId: input.subscriptionId
      },
      input: sanitizeInputForLogging(input),
      errorCode: BaseErrorCode.SERVICE_UNAVAILABLE,
      rethrow: true,
      
      // Map errors appropriately
      errorMapper: (error) => {
        // Log the error
        moduleLogger.error('Error processing subscription request', {
          error: error instanceof Error ? error.message : 'Unknown error',
          errorType: error instanceof Error ? error.name : 'Unknown',
          action: input.action,
          topic: input.topic,
          subscriptionId: input.subscriptionId
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
              `Subscription not found: ${error.message}`
            );
          } else if (errorMsg.includes('timeout')) {
            return new McpError(
              BaseErrorCode.TIMEOUT,
              `Request timed out: ${error.message}`
            );
          } else if (errorMsg.includes('rate limit') || errorMsg.includes('limit')) {
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
          `Failed to process subscription: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
  );
};

/**
 * Handle starting a new subscription
 */
async function handleStartSubscription(
  input: SubscribeNtfyToolInput, 
  logger: any
): Promise<StartSubscriptionResponse> {
  logger.info('Starting new subscription', {
    topic: input.topic,
    hasOptions: !!input.options
  });

  // Prepare subscription options
  const subscriptionOptions = {
    poll: input.options?.poll ?? false,
    since: input.options?.since,
    scheduled: input.options?.scheduled ?? false,
    
    // Add filters if provided
    ...(input.options?.filters?.priority && { priority: input.options.filters.priority }),
    ...(input.options?.filters?.tags && { tags: input.options.filters.tags }),
    ...(input.options?.filters?.title && { title: input.options.filters.title }),
    ...(input.options?.filters?.message && { message: input.options.filters.message }),
    ...(input.options?.filters?.id && { id: input.options.filters.id })
  };

  // Create subscription
  const subscriptionId = await subscriptionManager.createSubscription(
    input.topic,
    subscriptionOptions,
    input.baseUrl
  );

  const response: StartSubscriptionResponse = {
    success: true,
    action: 'start',
    subscriptionId,
    topic: input.topic,
    status: 'connecting',
    message: `Subscription started for topic "${input.topic}". Messages will be received in real-time.`,
    timestamp: new Date().toISOString()
  };

  logger.info('Subscription started successfully', {
    subscriptionId,
    topic: input.topic
  });

  return response;
}

/**
 * Handle stopping a subscription
 */
async function handleStopSubscription(
  input: SubscribeNtfyToolInput, 
  logger: any
): Promise<StopSubscriptionResponse> {
  if (!input.subscriptionId) {
    throw new McpError(
      BaseErrorCode.VALIDATION_ERROR,
      'Subscription ID is required for stop action'
    );
  }

  logger.info('Stopping subscription', {
    subscriptionId: input.subscriptionId
  });

  const success = await subscriptionManager.stopSubscription(input.subscriptionId);
  
  if (!success) {
    throw new McpError(
      BaseErrorCode.NOT_FOUND,
      `Subscription not found: ${input.subscriptionId}`
    );
  }

  const subscription = subscriptionManager.getSubscription(input.subscriptionId);
  const topic = subscription?.topic || 'unknown';

  const response: StopSubscriptionResponse = {
    success: true,
    action: 'stop',
    subscriptionId: input.subscriptionId,
    topic,
    message: `Subscription "${input.subscriptionId}" for topic "${topic}" has been stopped.`,
    timestamp: new Date().toISOString()
  };

  logger.info('Subscription stopped successfully', {
    subscriptionId: input.subscriptionId,
    topic
  });

  return response;
}

/**
 * Handle getting subscription status
 */
async function handleSubscriptionStatus(
  input: SubscribeNtfyToolInput, 
  logger: any
): Promise<StatusSubscriptionResponse> {
  if (!input.subscriptionId) {
    throw new McpError(
      BaseErrorCode.VALIDATION_ERROR,
      'Subscription ID is required for status action'
    );
  }

  logger.debug('Getting subscription status', {
    subscriptionId: input.subscriptionId
  });

  const subscription = subscriptionManager.getSubscription(input.subscriptionId);
  
  if (!subscription) {
    throw new McpError(
      BaseErrorCode.NOT_FOUND,
      `Subscription not found: ${input.subscriptionId}`
    );
  }

  const response: StatusSubscriptionResponse = {
    success: true,
    action: 'status',
    subscription,
    timestamp: new Date().toISOString()
  };

  logger.debug('Retrieved subscription status', {
    subscriptionId: input.subscriptionId,
    status: subscription.status,
    messageCount: subscription.messageCount
  });

  return response;
}

/**
 * Handle listing all subscriptions
 */
async function handleListSubscriptions(
  input: SubscribeNtfyToolInput, 
  logger: any
): Promise<ListSubscriptionsResponse> {
  logger.debug('Listing all subscriptions');

  const allSubscriptions = subscriptionManager.getAllSubscriptions();
  const activeSubscriptions = subscriptionManager.getActiveSubscriptions();

  const response: ListSubscriptionsResponse = {
    success: true,
    action: 'list',
    subscriptions: allSubscriptions,
    activeCount: activeSubscriptions.length,
    totalCount: allSubscriptions.length,
    timestamp: new Date().toISOString()
  };

  logger.info('Listed subscriptions', {
    totalCount: allSubscriptions.length,
    activeCount: activeSubscriptions.length
  });

  return response;
}