/**
 * Ntfy service for subscribing to and publishing messages to ntfy topics
 * 
 * This module provides functionality to:
 * 1. Subscribe to ntfy topics to receive notifications
 * 2. Publish messages to ntfy topics
 * 3. Utility functions for working with ntfy
 */
import { NtfySubscriber } from './subscriber.js';
import { NtfySubscriptionHandlers, NtfySubscriptionOptions } from './types.js';
import { publish, NtfyPublishOptions, NtfyPublishResponse } from './publisher.js';
import { 
  buildSubscriptionUrl, 
  buildSubscriptionUrlSync,
  createBasicAuthHeader,
  createBasicAuthHeaderSync,
  isValidTopic, 
  validateTopicSync 
} from './utils.js';
import { createRequestContext } from '../../utils/requestContext.js';
import { idGenerator } from '../../utils/idGenerator.js';
import { DEFAULT_NTFY_BASE_URL, DEFAULT_SUBSCRIPTION_OPTIONS, DEFAULT_REQUEST_TIMEOUT } from './constants.js';

// Export types
export * from './types.js';
export * from './errors.js';

// Export main classes
export { NtfySubscriber };

// Export publisher functions
export { publish, NtfyPublishOptions, NtfyPublishResponse };

// Export utility functions
export { 
  // Export both sync and async versions of utilities
  buildSubscriptionUrl,
  buildSubscriptionUrlSync,
  createBasicAuthHeader,
  createBasicAuthHeaderSync,
  isValidTopic,
  validateTopicSync
};

// Export constants
export {
  DEFAULT_NTFY_BASE_URL,
  DEFAULT_SUBSCRIPTION_OPTIONS,
  DEFAULT_REQUEST_TIMEOUT
};

/**
 * Create a new ntfy subscriber with the given handlers
 * @param handlers Event handlers for the subscription
 * @returns A new NtfySubscriber instance
 */
export function createSubscriber(handlers: NtfySubscriptionHandlers = {}) {
  const requestCtx = createRequestContext({
    operation: 'createSubscriber',
    subscriberId: idGenerator.generateRandomString(8)
  });
  
  return new NtfySubscriber(handlers);
}

/**
 * Subscribe to a ntfy topic
 * @param topic Topic to subscribe to
 * @param handlers Event handlers for the subscription
 * @param options Subscription options
 * @returns A function to unsubscribe
 */
export async function subscribe(
  topic: string,
  handlers: NtfySubscriptionHandlers,
  options: NtfySubscriptionOptions = {}
): Promise<() => void> {
  const requestCtx = createRequestContext({
    operation: 'subscribe',
    topic,
    subscriberId: idGenerator.generateRandomString(8)
  });
  
  const subscriber = new NtfySubscriber(handlers);
  await subscriber.subscribe(topic, options);
  return () => subscriber.unsubscribe();
}