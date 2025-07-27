import { config } from '../../../config/index.js';
import { logger } from '../../../utils/logger.js';
import { createRequestContext } from '../../../utils/requestContext.js';
import { PollState, PollStateManager } from './types.js';

// Create module logger
const moduleLogger = logger.createChildLogger({ 
  module: 'PollStateManager'
});

/**
 * In-memory implementation of the polling state manager
 */
class InMemoryPollStateManager implements PollStateManager {
  private states = new Map<string, PollState>();
  private cleanupInterval?: ReturnType<typeof setInterval>;

  constructor() {
    // Start cleanup interval to remove expired states
    this.startCleanupInterval();
    
    moduleLogger.info('Poll state manager initialized', {
      ttl: config.ntfy.pollStateTtl,
      cleanupInterval: 300000 // 5 minutes
    });
  }

  /**
   * Get the polling state for a topic
   */
  getState(topic: string): PollState | undefined {
    const requestCtx = createRequestContext({
      operation: 'getState',
      topic
    });

    const state = this.states.get(topic);
    
    if (state) {
      // Check if state has expired
      const now = Date.now();
      const age = now - state.updatedAt;
      
      if (age > config.ntfy.pollStateTtl) {
        moduleLogger.debug('Poll state expired, removing', {
          topic,
          age,
          ttl: config.ntfy.pollStateTtl,
          requestId: requestCtx.requestId
        });
        
        this.states.delete(topic);
        return undefined;
      }
      
      moduleLogger.debug('Retrieved poll state', {
        topic,
        lastMessageId: state.lastMessageId,
        totalMessages: state.totalMessagesSeen,
        age,
        requestId: requestCtx.requestId
      });
    }

    return state;
  }

  /**
   * Set the polling state for a topic
   */
  setState(topic: string, state: PollState): void {
    const requestCtx = createRequestContext({
      operation: 'setState',
      topic
    });

    state.updatedAt = Date.now();
    this.states.set(topic, state);
    
    moduleLogger.debug('Updated poll state', {
      topic,
      lastMessageId: state.lastMessageId,
      totalMessages: state.totalMessagesSeen,
      requestId: requestCtx.requestId
    });
  }

  /**
   * Reset the polling state for a topic
   */
  resetState(topic: string): void {
    const requestCtx = createRequestContext({
      operation: 'resetState',
      topic
    });

    const existed = this.states.has(topic);
    this.states.delete(topic);
    
    moduleLogger.info('Reset poll state', {
      topic,
      existed,
      requestId: requestCtx.requestId
    });
  }

  /**
   * Clean up expired polling states
   */
  cleanupExpiredStates(): void {
    const requestCtx = createRequestContext({
      operation: 'cleanupExpiredStates'
    });

    const now = Date.now();
    const expiredTopics: string[] = [];

    for (const [topic, state] of this.states.entries()) {
      const age = now - state.updatedAt;
      if (age > config.ntfy.pollStateTtl) {
        expiredTopics.push(topic);
      }
    }

    // Remove expired states
    for (const topic of expiredTopics) {
      this.states.delete(topic);
    }

    if (expiredTopics.length > 0) {
      moduleLogger.info('Cleaned up expired poll states', {
        expiredCount: expiredTopics.length,
        expiredTopics,
        ttl: config.ntfy.pollStateTtl,
        requestId: requestCtx.requestId
      });
    }
  }

  /**
   * Get all polling states (for debugging/monitoring)
   */
  getAllStates(): Map<string, PollState> {
    return new Map(this.states);
  }

  /**
   * Start the cleanup interval
   */
  private startCleanupInterval(): void {
    // Clean up every 5 minutes
    const cleanupIntervalMs = 300000;
    
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredStates();
    }, cleanupIntervalMs);

    moduleLogger.debug('Started poll state cleanup interval', {
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
    
    this.states.clear();
    
    moduleLogger.info('Poll state manager destroyed');
  }
}

// Create and export singleton instance
export const pollStateManager = new InMemoryPollStateManager();

// Export the class for testing
export { InMemoryPollStateManager };