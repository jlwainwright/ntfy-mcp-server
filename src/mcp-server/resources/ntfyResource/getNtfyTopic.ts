import { config } from '../../../config/index.js';
import { BaseErrorCode, McpError } from '../../../types-global/errors.js';
import { ErrorHandler } from '../../../utils/errorHandler.js';
import { logger } from '../../../utils/logger.js';
import { createRequestContext } from '../../../utils/security.js';
import { NtfyResourceResponse } from './types.js';

// Create resource-specific logger
const resourceLogger = logger.createChildLogger({
  module: 'NtfyResource',
  service: 'NtfyResource'
});

export const getNtfyTopic = async (uri: URL): Promise<NtfyResourceResponse> => {
  // Create a request context with unique ID
  const requestContext = createRequestContext({ 
    operation: 'getNtfyTopic',
    uri: uri.toString() 
  });
  const requestId = requestContext.requestId;

  // Extract the topic from the URI pathname
  const topic = uri.hostname || "";

  resourceLogger.info("Ntfy resource request received", { 
    requestId,
    uri: uri.href,
    topic
  });

  return ErrorHandler.tryCatch(async () => {
    // Get the default topic from configuration
    const ntfyConfig = config.ntfy;
    let defaultTopic = ntfyConfig.defaultTopic;
    
    if (!defaultTopic) {
      resourceLogger.warn("Default ntfy topic is not configured, using fallback value", { 
        requestId,
        uri: uri.href 
      });
      // Provide a fallback value instead of failing
      defaultTopic = "ATLAS"; 
    }

    // Get recent messages asynchronously for this topic
    let recentMessages = [];
    try {
      // Use a different topic for actual fetching based on whether this is default or not
      const topicToFetch = topic === "default" ? defaultTopic : topic;
      
      // Attempt to fetch the 10 most recent messages
      const response = await fetch(`${config.ntfy.baseUrl || 'https://ntfy.sh'}/${topicToFetch}/json?poll=1&since=30d`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (response.ok) {
        // Parse response - each line is a separate JSON object
        const text = await response.text();
        const lines = text.split('\n').filter(line => line.trim());
        
        // Parse each line as a JSON object and add to recent messages
        recentMessages = lines.map(line => JSON.parse(line))
          .filter(msg => msg.event === 'message')
          .slice(0, 10); // Keep only the 10 most recent
        
        resourceLogger.info(`Retrieved ${recentMessages.length} recent messages`, {
          topic: topicToFetch,
          requestId
        });
      }
    } catch (error) {
      // Just log the error but don't fail the request
      resourceLogger.warn(`Failed to fetch recent messages for topic`, {
        topic,
        error: error instanceof Error ? error.message : String(error),
        requestId
      });
    }
    
    // Handle the "default" topic case specially
    const responseData = topic === "default" ? 
      {
        defaultTopic,
        timestamp: new Date().toISOString(),
        requestUri: uri.href,
        requestId,
        recentMessages: recentMessages.length > 0 ? recentMessages : undefined
      } : 
      {
        topic,
        timestamp: new Date().toISOString(),
        requestUri: uri.href,
        requestId,
        recentMessages: recentMessages.length > 0 ? recentMessages : undefined
      };

    resourceLogger.info("Ntfy resource response data prepared", { 
      requestId,
      responseData
    });
    
    // Return in the standard MCP format 
    const response: NtfyResourceResponse = {
      contents: [{
        uri: uri.href,
        text: JSON.stringify(responseData, null, 2),
        mimeType: "application/json"
      }]
    };
    
    return response;
  }, {
    context: { 
      requestId, 
      uri: uri.toString() 
    },
    operation: 'processing ntfy resource request',
    errorMapper: (error) => {
      return new McpError(
        BaseErrorCode.INTERNAL_ERROR, 
        `Error processing ntfy resource request: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { requestId, uri: uri.toString() }
      );
    },
    rethrow: true
  });
};
