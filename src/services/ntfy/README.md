# Ntfy Service

This service provides a clean and typed interface for interacting with the [ntfy](https://ntfy.sh/) API. It allows subscribing to topics and receiving real-time notifications.

## Features

- Subscribe to topics via HTTP streaming (JSON format)
- Support for filtering messages by ID, content, title, priority, and tags
- Authentication support (basic auth and token-based)
- Automatic reconnection handling
- Keepalive management
- Error handling with typed errors
- Full TypeScript support with comprehensive type definitions

## Usage Examples

### Basic Subscription

```typescript
import { subscribe } from '../../services/ntfy';

// Simple subscription with handlers
const unsubscribe = await subscribe('topic-name', {
  onMessage: (message) => {
    console.log('Received message:', message.message);
  },
  onError: (error) => {
    console.error('Subscription error:', error);
  }
});

// Later: unsubscribe when done
unsubscribe();
```

### Using the Subscriber Class

```typescript
import { NtfySubscriber } from '../../services/ntfy';

// Create a subscriber instance
const subscriber = new NtfySubscriber({
  onMessage: (message) => {
    console.log(`[${message.priority}] ${message.title}: ${message.message}`);
    
    if (message.tags) {
      console.log('Tags:', message.tags.join(', '));
    }
    
    if (message.attachment) {
      console.log('Attachment:', message.attachment.name, message.attachment.url);
    }
  },
  onOpen: (message) => {
    console.log('Connected to topic:', message.topic);
  },
  onError: (error) => {
    console.error('Error:', error.message);
  },
  onClose: () => {
    console.log('Subscription closed');
  }
});

// Subscribe to a topic
await subscriber.subscribe('alerts', {
  // Only show high and urgent priority messages
  priority: 'high,urgent',
  // Only messages with these tags (must have both)
  tags: 'error,critical',
  // Use a custom ntfy server
  baseUrl: 'https://ntfy.example.com',
  // Authentication
  username: 'user',
  password: 'pass'
});

// Unsubscribe when done
subscriber.unsubscribe();
```

### Polling for Messages

```typescript
import { subscribe } from '../../services/ntfy';

// Poll for messages instead of maintaining a connection
await subscribe('my-topic', {
  onMessage: (message) => {
    console.log('Received message:', message.message);
  }
}, {
  poll: true,
  since: '10m'  // Get messages from the last 10 minutes
});
```

## Architecture

The service is organized into several modules:

- `types.ts` - Type definitions for messages, subscriptions, and handlers
- `constants.ts` - Default values and configuration
- `errors.ts` - Custom error classes for different failure scenarios
- `utils.ts` - Helper functions for URL building, authentication, etc.
- `subscriber.ts` - The main `NtfySubscriber` class implementation
- `index.ts` - Public API exports and convenience functions

The primary implementation uses the Fetch API to create a streaming connection to the ntfy server and processes the JSON messages as they arrive.

## Error Handling

The service includes specialized error types for different scenarios:

- `NtfyConnectionError` - Failed to connect to the server
- `NtfyAuthenticationError` - Authentication failure
- `NtfyParseError` - Failed to parse a message
- `NtfySubscriptionClosedError` - Subscription was closed
- `NtfyInvalidTopicError` - Invalid topic name provided
- `NtfyTimeoutError` - Connection timed out

These can be used to provide appropriate error handling in your application.