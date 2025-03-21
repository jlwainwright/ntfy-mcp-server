/**
 * Ntfy subscriber implementation
 */
import { NtfyConnectionError, NtfyError, NtfyInvalidTopicError, NtfyParseError, NtfySubscriptionClosedError, NtfyTimeoutError } from './errors.js';
import { 
  NtfyMessage, 
  NtfyNotificationMessage, 
  NtfyOpenMessage,
  NtfySubscriptionFormat,
  NtfySubscriptionHandlers,
  NtfySubscriptionOptions
} from './types.js';
import { 
  buildSubscriptionUrl, 
  createAbortControllerWithTimeout, 
  createRequestHeaders, 
  isValidTopic, 
  parseJsonMessage 
} from './utils.js';
import { 
  DEFAULT_REQUEST_TIMEOUT, 
  DEFAULT_SUBSCRIPTION_OPTIONS, 
  ERROR_MESSAGES, 
  KEEPALIVE_TIMEOUT, 
  MAX_RECONNECT_ATTEMPTS, 
  RECONNECT_DELAY,
  SUBSCRIPTION_ENDPOINTS
} from './constants.js';

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
  
  /**
   * Creates a new NtfySubscriber instance
   * @param handlers Event handlers for the subscription
   */
  constructor(private handlers: NtfySubscriptionHandlers = {}) {}
  
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
    // Validate topic
    if (!isValidTopic(topic)) {
      throw new NtfyInvalidTopicError(ERROR_MESSAGES.INVALID_TOPIC, topic);
    }
    
    // Merge options with defaults
    const mergedOptions = { ...DEFAULT_SUBSCRIPTION_OPTIONS, ...options };
    
    // Close any existing subscription
    this.unsubscribe();
    
    try {
      // Reset reconnect attempts
      this.reconnectAttempts = 0;
      
      // Start subscription
      await this.startSubscription(topic, 'json', mergedOptions);
      
      // Start keepalive check if this is a persistent connection
      if (!mergedOptions.poll) {
        this.startKeepaliveCheck();
      }
    } catch (error) {
      // Handle connection errors
      this.handleSubscriptionError(error);
      throw error;
    }
  }
  
  /**
   * Unsubscribe from the current topic
   */
  public unsubscribe(): void {
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
    const url = buildSubscriptionUrl(topic, SUBSCRIPTION_ENDPOINTS[format], options);
    const headers = createRequestHeaders(options);
    
    // Create abort controller with timeout
    const { controller, cleanup } = createAbortControllerWithTimeout(
      DEFAULT_REQUEST_TIMEOUT
    );
    
    this.abortController = controller;
    this.cleanupFn = cleanup;
    
    try {
      // Make the request
      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      
      // Check response status
      if (!response.ok) {
        throw new NtfyConnectionError(
          `HTTP Error: ${response.status} ${response.statusText}`,
          url
        );
      }
      
      // Set connection as active
      this.connectionActive = true;
      
      // Get response body as reader
      const reader = response.body?.getReader();
      if (!reader) {
        throw new NtfyConnectionError('No response body available', url);
      }
      
      // Process the stream
      await this.processJsonStream(reader);
    } catch (error) {
      // Clean up and rethrow
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
   */
  private async processJsonStream(
    reader: ReadableStreamDefaultReader<Uint8Array>
  ): Promise<void> {
    const decoder = new TextDecoder();
    let buffer = '';
    
    while (this.connectionActive) {
      try {
        const { done, value } = await reader.read();
        
        if (done) {
          // Stream has ended
          this.connectionActive = false;
          if (this.handlers.onClose) {
            this.handlers.onClose();
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
              const message = parseJsonMessage(line);
              this.handleMessage(message);
            } catch (error) {
              this.handleParseError(error, line);
            }
          }
        }
      } catch (error) {
        // Handle read errors
        this.connectionActive = false;
        
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
   */
  private handleMessage(message: NtfyMessage): void {
    // Update last keepalive time for any message
    this.lastKeepaliveTime = Date.now();
    
    // Call the appropriate handler based on message type
    switch (message.event) {
      case 'message':
        if (this.handlers.onMessage) {
          this.handlers.onMessage(message as NtfyNotificationMessage);
        }
        break;
      case 'open':
        if (this.handlers.onOpen) {
          this.handlers.onOpen(message as NtfyOpenMessage);
        }
        break;
      case 'keepalive':
        if (this.handlers.onKeepalive) {
          this.handlers.onKeepalive(message);
        }
        break;
    }
    
    // Always call onAnyMessage if it exists
    if (this.handlers.onAnyMessage) {
      this.handlers.onAnyMessage(message);
    }
  }
  
  /**
   * Handle a parse error
   * @param error Error that occurred
   * @param rawData Raw data that caused the error
   */
  private handleParseError(error: unknown, rawData: string): void {
    if (this.handlers.onError) {
      if (error instanceof NtfyParseError) {
        this.handlers.onError(error);
      } else {
        this.handlers.onError(new NtfyParseError(
          `Failed to parse message: ${error instanceof Error ? error.message : String(error)}`,
          rawData
        ));
      }
    }
  }
  
  /**
   * Handle a subscription error
   * @param error Error that occurred
   */
  private handleSubscriptionError(error: unknown): void {
    if (this.handlers.onError) {
      if (error instanceof NtfyError) {
        this.handlers.onError(error as Error);
      } else {
        this.handlers.onError(new NtfyConnectionError(
          `Subscription error: ${error instanceof Error ? error.message : String(error)}`
        ));
      }
    }
  }
  
  /**
   * Start the keepalive check interval
   */
  private startKeepaliveCheck(): void {
    this.stopKeepaliveCheck();
    this.lastKeepaliveTime = Date.now();
    
    this.keepaliveCheckInterval = setInterval(() => {
      const now = Date.now();
      const elapsed = now - this.lastKeepaliveTime;
      
      if (elapsed > KEEPALIVE_TIMEOUT && this.connectionActive) {
        // Connection has timed out
        this.handleSubscriptionError(
          new NtfyTimeoutError('Keepalive timeout', KEEPALIVE_TIMEOUT)
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
    this.reconnectAttempts++;
    
    setTimeout(() => {
      if (!this.connectionActive) {
        this.startSubscription(topic, format, options).catch((error) => {
          this.handleSubscriptionError(error);
        });
      }
    }, RECONNECT_DELAY * this.reconnectAttempts);
  }
}