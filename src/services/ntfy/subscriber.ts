/**
 * Ntfy subscriber implementation
 */
import { BaseErrorCode } from '../../types-global/errors.js';
import { ErrorHandler } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { sanitizeInput, sanitizeInputForLogging } from '../../utils/sanitization.js';
import { createRequestContext } from '../../utils/requestContext.js';
import { idGenerator } from '../../utils/idGenerator.js';
import {
  DEFAULT_REQUEST_TIMEOUT,
  DEFAULT_SUBSCRIPTION_OPTIONS,
  ERROR_MESSAGES,
  KEEPALIVE_TIMEOUT,
  MAX_RECONNECT_ATTEMPTS,
  RECONNECT_DELAY,
  SUBSCRIPTION_ENDPOINTS
} from './constants.js';
import { 
  NtfyConnectionError, 
  NtfyError, 
  NtfyInvalidTopicError, 
  NtfyParseError, 
  NtfySubscriptionClosedError, 
  NtfyTimeoutError, 
  ntfyErrorMapper 
} from './errors.js';
import {
  NtfyMessage,
  NtfyNotificationMessage,
  NtfyOpenMessage,
  NtfySubscriptionFormat,
  NtfySubscriptionHandlers,
  NtfySubscriptionOptions
} from './types.js';
import {
  buildSubscriptionUrlSync,
  createAbortControllerWithTimeout,
  createRequestHeadersSync,
  validateTopicSync,
  parseJsonMessageSync
} from './utils.js';

/**
 * NtfySubscriber class for subscribing to ntfy topics
 */
export class NtfySubscriber {
  private abortController?: AbortController;
  private cleanupFn?: () => void;
  private connectionActive = false;
  private lastKeepaliveTime = 0;
  private reconnectAttempts = 0;
  private keepaliveCheckInterval?: ReturnType<typeof setInterval>;
  private logger; // Module logger instance
  private subscriberId: string;
  private currentTopic?: string;
  
  /**
   * Creates a new NtfySubscriber instance
   * @param handlers Event handlers for the subscription
   */
  constructor(private handlers: NtfySubscriptionHandlers = {}) {
    this.subscriberId = idGenerator.generateRandomString(8);
    
    // Create logger with subscriber context
    this.logger = logger.createChildLogger({ 
      module: 'NtfySubscriber',
      subscriberId: this.subscriberId,
      subscriptionTime: new Date().toISOString()
    });
    
    this.logger.debug('NtfySubscriber instance created');
  }
  
  /**
   * Subscribe to a ntfy topic
   * @param topic Topic to subscribe to (can be comma-separated for multiple topics)
   * @param options Subscription options
   * @returns Promise that resolves when the subscription is established
   * @throws NtfyInvalidTopicError if the topic name is invalid
   * @throws NtfyConnectionError if the connection fails
   */
  public async subscribe(
    topic: string,
    options: NtfySubscriptionOptions = {}
  ): Promise<void> {
    return ErrorHandler.tryCatch(
      async () => {
        // Create a request context for tracking this operation
        const requestCtx = createRequestContext({
          operation: 'subscribe',
          topic,
          subscriberId: this.subscriberId,
          options: sanitizeInputForLogging(options)
        });

        // Validate topic
        if (!validateTopicSync(topic)) {
          this.logger.error('Invalid topic name', { 
            topic,
            requestId: requestCtx.requestId 
          });
          throw new NtfyInvalidTopicError(ERROR_MESSAGES.INVALID_TOPIC, topic);
        }
        
        // Store current topic for reconnect logic
        this.currentTopic = topic;
        
        // Log the subscription attempt
        this.logger.info('Subscribing to topic', { 
          topic, 
          options: sanitizeInputForLogging(options),
          requestId: requestCtx.requestId
        });
        
        // Merge options with defaults
        const mergedOptions = { ...DEFAULT_SUBSCRIPTION_OPTIONS, ...options };
        
        // Close any existing subscription
        this.unsubscribe();
        
        // Reset reconnect attempts
        this.reconnectAttempts = 0;
        
        // Start subscription
        await this.startSubscription(topic, 'json', mergedOptions);
        
        // Start keepalive check if this is a persistent connection
        if (!mergedOptions.poll) {
          this.startKeepaliveCheck();
        }
        
        this.logger.info('Successfully subscribed to topic', { 
          topic,
          requestId: requestCtx.requestId
        });
      },
      {
        operation: 'subscribe',
        context: { 
          topic,
          subscriberId: this.subscriberId
        },
        input: sanitizeInputForLogging(options),
        errorCode: BaseErrorCode.SERVICE_UNAVAILABLE,
        errorMapper: ntfyErrorMapper,
        rethrow: true
      }
    );
  }
  
  /**
   * Unsubscribe from the current topic
   */
  public unsubscribe(): void {
    const requestCtx = createRequestContext({
      operation: 'unsubscribe',
      subscriberId: this.subscriberId,
      topic: this.currentTopic
    });
    
    this.logger.debug('Unsubscribing from topic', {
      requestId: requestCtx.requestId,
      topic: this.currentTopic
    });
    
    this.stopKeepaliveCheck();
    
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = undefined;
    }
    
    if (this.cleanupFn) {
      this.cleanupFn();
      this.cleanupFn = undefined;
    }
    
    this.connectionActive = false;
    this.logger.info('Unsubscribed from topic', {
      requestId: requestCtx.requestId,
      topic: this.currentTopic
    });
    
    // Clear current topic
    this.currentTopic = undefined;
  }
  
  /**
   * Start a subscription to a topic
   * @param topic Topic to subscribe to
   * @param format Format to subscribe in (json, sse, raw, ws)
   * @param options Subscription options
   */
  private async startSubscription(
    topic: string,
    format: NtfySubscriptionFormat,
    options: NtfySubscriptionOptions
  ): Promise<void> {
    const requestCtx = createRequestContext({
      operation: 'startSubscription',
      subscriberId: this.subscriberId,
      topic,
      format
    });
    
    const sanitizedTopic = sanitizeInput.string(topic);
    this.logger.debug('Starting subscription', { 
      topic: sanitizedTopic, 
      format,
      requestId: requestCtx.requestId 
    });
    
    const url = buildSubscriptionUrlSync(topic, SUBSCRIPTION_ENDPOINTS[format], options);
    const headers = createRequestHeadersSync(options);
    
    // Create abort controller with timeout
    const { controller, cleanup } = createAbortControllerWithTimeout(
      DEFAULT_REQUEST_TIMEOUT
    );
    
    this.abortController = controller;
    this.cleanupFn = cleanup;
    
    try {
      // Make the request
      this.logger.debug('Sending subscription request', { 
        url,
        requestId: requestCtx.requestId 
      });
      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      
      // Check response status
      if (!response.ok) {
        this.logger.error('HTTP error from ntfy server', { 
          status: response.status, 
          statusText: response.statusText,
          url,
          requestId: requestCtx.requestId 
        });
        throw new NtfyConnectionError(
          `HTTP Error: ${response.status} ${response.statusText}`,
          url
        );
      }
      
      // Set connection as active
      this.connectionActive = true;
      this.logger.debug('Connection established', {
        requestId: requestCtx.requestId
      });
      
      // Get response body as reader
      const reader = response.body?.getReader();
      if (!reader) {
        this.logger.error('No response body available', { 
          url,
          requestId: requestCtx.requestId 
        });
        throw new NtfyConnectionError('No response body available', url);
      }
      
      // Process the stream
      await this.processJsonStream(reader, requestCtx.requestId);
    } catch (error) {
      // Clean up and rethrow
      this.logger.error('Error starting subscription', {
        error: error instanceof Error ? error.message : String(error),
        topic: sanitizedTopic,
        url,
        requestId: requestCtx.requestId
      });
      
      this.cleanupFn();
      this.cleanupFn = undefined;
      this.abortController = undefined;
      this.connectionActive = false;
      
      // Attempt reconnect if appropriate
      if (
        !options.poll && 
        !(error instanceof NtfySubscriptionClosedError) &&
        this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS
      ) {
        this.scheduleReconnect(topic, format, options);
      } else {
        throw error;
      }
    }
  }
  
  /**
   * Process a JSON stream from ntfy
   * @param reader ReadableStreamDefaultReader to read from
   * @param requestId Request ID for logging
   */
  private async processJsonStream(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    requestId: string
  ): Promise<void> {
    const decoder = new TextDecoder();
    let buffer = '';
    
    this.logger.debug('Starting to process JSON stream', { requestId });
    
    while (this.connectionActive) {
      try {
        const { done, value } = await reader.read();
        
        if (done) {
          // Stream has ended
          this.logger.info('Stream ended normally', { requestId });
          this.connectionActive = false;
          
          if (this.handlers.onClose) {
            try {
              this.handlers.onClose();
            } catch (error) {
              this.logger.error('Error in onClose handler', {
                error: error instanceof Error ? error.message : String(error),
                requestId
              });
            }
          }
          break;
        }
        
        // Decode the chunk and add to buffer
        buffer += decoder.decode(value, { stream: true });
        
        // Process any complete lines in the buffer
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep the last incomplete line in the buffer
        
        // Process each complete line
        for (const line of lines) {
          if (line.trim()) {
            try {
              const message = parseJsonMessageSync(line);
              this.handleMessage(message, requestId);
            } catch (error) {
              this.handleParseError(error, line, requestId);
            }
          }
        }
      } catch (error) {
        // Handle read errors
        this.connectionActive = false;
        this.logger.error('Error reading from stream', {
          error: error instanceof Error ? error.message : String(error),
          requestId
        });
        
        if (error instanceof Error && error.name === 'AbortError') {
          throw new NtfySubscriptionClosedError('Subscription aborted');
        } else {
          throw new NtfyConnectionError(
            `Error reading from stream: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    }
  }
  
  /**
   * Handle a message from ntfy
   * @param message Message from ntfy
   * @param requestId Request ID for logging
   */
  private handleMessage(message: NtfyMessage, requestId: string): void {
    // Update last keepalive time for any message
    this.lastKeepaliveTime = Date.now();
    
    // Log message receipt at debug level
    this.logger.debug('Received message', { 
      messageId: message.id,
      eventType: message.event,
      topic: message.topic,
      requestId
    });
    
    // Call the appropriate handler based on message type
    try {
      switch (message.event) {
        case 'message':
          if (this.handlers.onMessage) {
            const notificationMessage = message as NtfyNotificationMessage;
            this.logger.debug('Processing notification message', {
              messageId: notificationMessage.id,
              hasTitle: !!notificationMessage.title,
              requestId
            });
            this.handlers.onMessage(notificationMessage);
          }
          break;
        case 'open':
          if (this.handlers.onOpen) {
            this.logger.debug('Processing open message', { requestId });
            this.handlers.onOpen(message as NtfyOpenMessage);
          }
          break;
        case 'keepalive':
          if (this.handlers.onKeepalive) {
            this.logger.debug('Processing keepalive message', { requestId });
            this.handlers.onKeepalive(message);
          }
          break;
      }
      
      // Always call onAnyMessage if it exists
      if (this.handlers.onAnyMessage) {
        this.handlers.onAnyMessage(message);
      }
    } catch (error) {
      this.logger.error('Error in message handler', {
        error: error instanceof Error ? error.message : String(error),
        messageType: message.event,
        messageId: message.id,
        requestId
      });
      // Don't rethrow to avoid breaking the stream processing
    }
  }
  
  /**
   * Handle a parse error
   * @param error Error that occurred
   * @param rawData Raw data that caused the error
   * @param requestId Request ID for logging
   */
  private handleParseError(error: unknown, rawData: string, requestId: string): void {
    this.logger.error('Failed to parse message', {
      error: error instanceof Error ? error.message : String(error),
      rawData: rawData.length > 100 ? `${rawData.substring(0, 100)}...` : rawData,
      requestId
    });
    
    if (this.handlers.onError) {
      try {
        if (error instanceof NtfyParseError) {
          this.handlers.onError(error);
        } else {
          const parsedError = new NtfyParseError(
            `Failed to parse message: ${error instanceof Error ? error.message : String(error)}`,
            rawData
          );
          this.handlers.onError(parsedError);
        }
      } catch (handlerError) {
        this.logger.error('Error in error handler', {
          error: handlerError instanceof Error ? handlerError.message : String(handlerError),
          requestId
        });
      }
    }
  }
  
  /**
   * Handle a subscription error
   * @param error Error that occurred
   * @param requestId Request ID for logging
   */
  private handleSubscriptionError(error: unknown, requestId: string): void {
    this.logger.error('Subscription error', {
      error: error instanceof Error ? error.message : String(error),
      errorType: error instanceof Error ? error.name : 'Unknown',
      requestId
    });
    
    if (this.handlers.onError) {
      try {
        if (error instanceof NtfyError) {
          this.handlers.onError(error as Error);
        } else {
          this.handlers.onError(new NtfyConnectionError(
            `Subscription error: ${error instanceof Error ? error.message : String(error)}`
          ));
        }
      } catch (handlerError) {
        this.logger.error('Error in error handler', {
          error: handlerError instanceof Error ? handlerError.message : String(handlerError),
          requestId
        });
      }
    }
  }
  
  /**
   * Start the keepalive check interval
   */
  private startKeepaliveCheck(): void {
    const requestCtx = createRequestContext({
      operation: 'startKeepaliveCheck',
      subscriberId: this.subscriberId,
      topic: this.currentTopic
    });
    
    this.logger.debug('Starting keepalive check', {
      timeout: KEEPALIVE_TIMEOUT,
      checkInterval: KEEPALIVE_TIMEOUT / 2,
      requestId: requestCtx.requestId
    });
    
    this.stopKeepaliveCheck();
    this.lastKeepaliveTime = Date.now();
    
    this.keepaliveCheckInterval = setInterval(() => {
      const now = Date.now();
      const elapsed = now - this.lastKeepaliveTime;
      
      this.logger.debug('Keepalive check', { 
        elapsed,
        threshold: KEEPALIVE_TIMEOUT,
        requestId: requestCtx.requestId
      });
      
      if (elapsed > KEEPALIVE_TIMEOUT && this.connectionActive) {
        // Connection has timed out
        this.logger.warn('Keepalive timeout detected', {
          elapsed,
          threshold: KEEPALIVE_TIMEOUT,
          requestId: requestCtx.requestId
        });
        
        this.handleSubscriptionError(
          new NtfyTimeoutError('Keepalive timeout', KEEPALIVE_TIMEOUT),
          requestCtx.requestId
        );
        this.unsubscribe();
      }
    }, KEEPALIVE_TIMEOUT / 2);
  }
  
  /**
   * Stop the keepalive check interval
   */
  private stopKeepaliveCheck(): void {
    if (this.keepaliveCheckInterval) {
      this.logger.debug('Stopping keepalive check');
      clearInterval(this.keepaliveCheckInterval);
      this.keepaliveCheckInterval = undefined;
    }
  }
  
  /**
   * Schedule a reconnection attempt
   * @param topic Topic to reconnect to
   * @param format Format to reconnect with
   * @param options Subscription options
   */
  private scheduleReconnect(
    topic: string,
    format: NtfySubscriptionFormat,
    options: NtfySubscriptionOptions
  ): void {
    const requestCtx = createRequestContext({
      operation: 'scheduleReconnect',
      subscriberId: this.subscriberId,
      topic,
      format
    });
    
    this.reconnectAttempts++;
    const delay = RECONNECT_DELAY * this.reconnectAttempts;
    
    this.logger.info('Scheduling reconnection attempt', {
      topic,
      attemptNumber: this.reconnectAttempts,
      maxAttempts: MAX_RECONNECT_ATTEMPTS,
      delayMs: delay,
      requestId: requestCtx.requestId
    });
    
    setTimeout(() => {
      if (!this.connectionActive) {
        this.logger.info('Attempting reconnection', {
          topic,
          attemptNumber: this.reconnectAttempts,
          requestId: requestCtx.requestId
        });
        
        this.startSubscription(topic, format, options).catch((error) => {
          this.handleSubscriptionError(error, requestCtx.requestId);
        });
      }
    }, delay);
  }
}