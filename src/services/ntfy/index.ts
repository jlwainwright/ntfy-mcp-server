/**
 * Ntfy service for subscribing to and publishing messages to ntfy topics
 */
import { NtfySubscriber } from './subscriber.js';
import { NtfySubscriptionHandlers, NtfySubscriptionOptions } from './types.js';

// Export types
export * from './types.js';
export * from './errors.js';

// Export main classes
export { NtfySubscriber };

// Export utility functions
export { 
  buildSubscriptionUrl,
  createBasicAuthHeader,
  isValidTopic 
} from './utils.js';

// Export constants
export {
  DEFAULT_NTFY_BASE_URL,
  DEFAULT_SUBSCRIPTION_OPTIONS,
  DEFAULT_REQUEST_TIMEOUT
} from './constants.js';

/**
 * Create a new ntfy subscriber with the given handlers
 * @param handlers Event handlers for the subscription
 * @returns A new NtfySubscriber instance
 */
export function createSubscriber(handlers: NtfySubscriptionHandlers = {}) {
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
  const subscriber = new NtfySubscriber(handlers);
  await subscriber.subscribe(topic, options);
  return () => subscriber.unsubscribe();
}