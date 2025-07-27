import { config } from '../../../config/index.js';
import { BaseErrorCode, McpError } from '../../../types-global/errors.js';
import { logger } from '../../../utils/logger.js';
import { createRequestContext } from '../../../utils/requestContext.js';
import { idGenerator } from '../../../utils/idGenerator.js';
import { NtfySubscriber } from '../../../services/ntfy/subscriber.js';
import { NtfySubscriptionOptions, NtfyNotificationMessage } from '../../../services/ntfy/types.js';
import { SubscriptionInfo, SubscriptionManager } from './types.js';

// Create module logger
const moduleLogger = logger.createChildLogger({ 
  module: 'SubscriptionManager'
});

/**
 * In-memory implementation of the subscription manager
 */
class InMemorySubscriptionManager implements SubscriptionManager {
  private subscriptions = new Map<string, SubscriptionInfo>();
  private subscribers = new Map<string, NtfySubscriber>();
  private cleanupInterval?: ReturnType<typeof setInterval>;

  constructor() {
    // Start cleanup interval to remove expired subscriptions
    this.startCleanupInterval();
    
    moduleLogger.info('Subscription manager initialized', {
      maxSubscriptions: config.ntfy.maxSubscriptions,
      subscriptionTimeout: config.ntfy.subscriptionTimeout,
      cleanupInterval: 300000 // 5 minutes
    });
  }

  /**
   * Create a new subscription
   */
  async createSubscription(
    topic: string, 
    options: NtfySubscriptionOptions, 
    baseUrl?: string
  ): Promise<string> {
    const requestCtx = createRequestContext({
      operation: 'createSubscription',
      topic
    });

    // Check subscription limits
    const activeSubscriptions = this.getActiveSubscriptions();
    if (activeSubscriptions.length >= config.ntfy.maxSubscriptions) {
      throw new McpError(
        BaseErrorCode.RATE_LIMITED,
        `Maximum subscription limit reached (${config.ntfy.maxSubscriptions}). Please stop existing subscriptions first.`
      );
    }

    // Generate unique subscription ID
    const subscriptionId = idGenerator.generateRandomString(12);
    
    const subscriptionLogger = logger.createChildLogger({
      module: 'Subscription',
      subscriptionId,
      topic,
      requestId: requestCtx.requestId
    });

    subscriptionLogger.info('Creating new subscription', {
      topic,
      baseUrl,
      hasAuth: !!(config.ntfy.username && config.ntfy.password)
    });

    // Prepare subscription options
    const subscriptionOptions: NtfySubscriptionOptions = {
      ...options,
      baseUrl: baseUrl || config.ntfy.baseUrl,
      
      // Add authentication if configured
      ...(config.ntfy.username && config.ntfy.password && {
        username: config.ntfy.username,
        password: config.ntfy.password
      })
    };

    // Create subscription info
    const subscriptionInfo: SubscriptionInfo = {
      id: subscriptionId,
      topic,
      status: 'connecting',
      createdAt: Date.now(),
      messageCount: 0,
      options: subscriptionOptions,
      baseUrl
    };

    // Store subscription info
    this.subscriptions.set(subscriptionId, subscriptionInfo);

    try {
      // Create subscriber with event handlers
      const subscriber = new NtfySubscriber({
        onMessage: (message: NtfyNotificationMessage) => {
          subscriptionLogger.debug('Received message', {
            messageId: message.id,
            title: message.title,
            hasAttachment: !!message.attachment
          });

          // Update subscription info
          const info = this.subscriptions.get(subscriptionId);
          if (info) {
            info.messageCount++;
            info.lastActivity = Date.now();
            info.status = 'active';
          }
        },

        onOpen: () => {
          subscriptionLogger.info('Subscription connection opened');
          
          // Update subscription status
          const info = this.subscriptions.get(subscriptionId);
          if (info) {
            info.status = 'active';
            info.lastActivity = Date.now();
          }
        },

        onError: (error: Error) => {
          subscriptionLogger.error('Subscription error', {
            error: error.message,
            errorType: error.name
          });

          // Update subscription status
          const info = this.subscriptions.get(subscriptionId);
          if (info) {
            info.status = 'error';
            info.errorMessage = error.message;
            info.lastActivity = Date.now();
          }
        },

        onClose: () => {
          subscriptionLogger.info('Subscription connection closed');
          
          // Update subscription status
          const info = this.subscriptions.get(subscriptionId);
          if (info) {
            info.status = 'stopped';
            info.lastActivity = Date.now();
          }
        }
      });

      // Store subscriber
      this.subscribers.set(subscriptionId, subscriber);

      // Start subscription
      await subscriber.subscribe(topic, subscriptionOptions);

      subscriptionLogger.info('Subscription created successfully', {
        subscriptionId,
        topic
      });

      // Set up automatic cleanup timeout
      setTimeout(() => {
        if (this.subscriptions.has(subscriptionId)) {
          subscriptionLogger.info('Subscription timeout reached, cleaning up', {
            timeout: config.ntfy.subscriptionTimeout
          });
          this.stopSubscription(subscriptionId).catch(error => {
            subscriptionLogger.error('Error during timeout cleanup', {
              error: error instanceof Error ? error.message : String(error)
            });
          });
        }
      }, config.ntfy.subscriptionTimeout);

      return subscriptionId;

    } catch (error) {
      // Clean up on error
      this.subscriptions.delete(subscriptionId);
      this.subscribers.delete(subscriptionId);

      subscriptionLogger.error('Failed to create subscription', {
        error: error instanceof Error ? error.message : String(error)
      });

      throw error;
    }
  }

  /**
   * Stop a subscription
   */
  async stopSubscription(subscriptionId: string): Promise<boolean> {
    const requestCtx = createRequestContext({
      operation: 'stopSubscription',
      subscriptionId
    });

    const subscription = this.subscriptions.get(subscriptionId);
    const subscriber = this.subscribers.get(subscriptionId);

    if (!subscription) {
      moduleLogger.warn('Attempted to stop non-existent subscription', {
        subscriptionId,
        requestId: requestCtx.requestId
      });
      return false;
    }

    moduleLogger.info('Stopping subscription', {
      subscriptionId,
      topic: subscription.topic,
      requestId: requestCtx.requestId
    });

    // Stop the subscriber if it exists
    if (subscriber) {
      subscriber.unsubscribe();
      this.subscribers.delete(subscriptionId);
    }

    // Update subscription status
    subscription.status = 'stopped';
    subscription.lastActivity = Date.now();

    // Remove from tracking after a delay to allow status checks
    setTimeout(() => {
      this.subscriptions.delete(subscriptionId);
    }, 60000); // Keep for 1 minute

    moduleLogger.info('Subscription stopped successfully', {
      subscriptionId,
      topic: subscription.topic,
      requestId: requestCtx.requestId
    });

    return true;
  }

  /**
   * Get subscription information
   */
  getSubscription(subscriptionId: string): SubscriptionInfo | undefined {
    return this.subscriptions.get(subscriptionId);
  }

  /**
   * Get all subscriptions
   */
  getAllSubscriptions(): SubscriptionInfo[] {
    return Array.from(this.subscriptions.values());
  }

  /**
   * Get active subscriptions only
   */
  getActiveSubscriptions(): SubscriptionInfo[] {
    return Array.from(this.subscriptions.values())
      .filter(sub => sub.status === 'active' || sub.status === 'connecting');
  }

  /**
   * Clean up expired subscriptions
   */
  cleanupExpiredSubscriptions(): void {
    const requestCtx = createRequestContext({
      operation: 'cleanupExpiredSubscriptions'
    });

    const now = Date.now();
    const expiredIds: string[] = [];

    for (const [id, subscription] of this.subscriptions.entries()) {
      const age = now - subscription.createdAt;
      const timeSinceActivity = subscription.lastActivity ? now - subscription.lastActivity : age;

      // Clean up subscriptions that have been inactive for too long
      if (age > config.ntfy.subscriptionTimeout || timeSinceActivity > config.ntfy.subscriptionTimeout) {
        expiredIds.push(id);
      }
    }

    // Remove expired subscriptions
    for (const id of expiredIds) {
      this.stopSubscription(id).catch(error => {
        moduleLogger.error('Error cleaning up expired subscription', {
          subscriptionId: id,
          error: error instanceof Error ? error.message : String(error)
        });
      });
    }

    if (expiredIds.length > 0) {
      moduleLogger.info('Cleaned up expired subscriptions', {
        expiredCount: expiredIds.length,
        expiredIds,
        timeout: config.ntfy.subscriptionTimeout,
        requestId: requestCtx.requestId
      });
    }
  }

  /**
   * Get subscription count
   */
  getSubscriptionCount(): number {
    return this.subscriptions.size;
  }

  /**
   * Start the cleanup interval
   */
  private startCleanupInterval(): void {
    // Clean up every 5 minutes
    const cleanupIntervalMs = 300000;
    
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSubscriptions();
    }, cleanupIntervalMs);

    moduleLogger.debug('Started subscription cleanup interval', {
      intervalMs: cleanupIntervalMs
    });
  }

  /**
   * Stop the cleanup interval (for shutdown)
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }

    // Stop all active subscriptions
    for (const [id, subscriber] of this.subscribers.entries()) {
      try {
        subscriber.unsubscribe();
      } catch (error) {
        moduleLogger.error('Error stopping subscription during destroy', {
          subscriptionId: id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
    this.subscriptions.clear();
    this.subscribers.clear();
    
    moduleLogger.info('Subscription manager destroyed');
  }
}

// Create and export singleton instance
export const subscriptionManager = new InMemorySubscriptionManager();

// Export the class for testing
export { InMemorySubscriptionManager };