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

// Updated signature to accept topic explicitly
export const getNtfyTopic = async (topic: string, uri: URL): Promise<NtfyResourceResponse> => { 
  // Create a request context with unique ID
  const requestContext = createRequestContext({ 
    operation: 'getNtfyTopic',
    uri: uri.toString() 
  });
  const requestId = requestContext.requestId;

  // Topic is now passed as an argument, no need to extract from hostname
  // const topic = uri.hostname || ""; // Removed

  resourceLogger.info("Ntfy resource request received", { 
    requestId,
    uri: uri.href,
    topic
  });

  return ErrorHandler.tryCatch(async () => {
    // Get the default topic from configuration
    const ntfyConfig = config.ntfy;
    const defaultTopic = ntfyConfig.defaultTopic;

    // Handle case where 'default' is requested but not configured
    if (topic === "default" && !defaultTopic) {
      resourceLogger.error("Requested default ntfy topic, but none is configured.", {
        requestId,
        uri: uri.href
       });
       throw new McpError(
         BaseErrorCode.VALIDATION_ERROR, // Corrected error code
         "Default ntfy topic requested via ntfy://default, but no default topic is configured in the environment variables.",
         { requestId, uri: uri.toString() }
      );
    }
    
    // Determine the actual topic to fetch messages for
    const topicToFetch = topic === "default" ? defaultTopic : topic;

    // Get recent messages asynchronously for this topic
    let recentMessages: any[] = []; // Define type for recentMessages
    try {
      // Ensure topicToFetch is valid before fetching
      if (!topicToFetch) {
         // This case should theoretically be caught by the check above, but adding for safety
         throw new Error("Cannot fetch messages for an empty topic.");
      }

      // Attempt to fetch the 10 most recent messages - removed poll=1
      const fetchUrl = `${config.ntfy.baseUrl || 'https://ntfy.sh'}/${topicToFetch}/json?since=30d`;
      resourceLogger.debug("Fetching recent messages", { requestId, url: fetchUrl });

      const response = await fetch(fetchUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          // Add API key header if configured
          ...(config.ntfy.apiKey && { 'Authorization': `Bearer ${config.ntfy.apiKey}` })
        }
      });
      
      if (response.ok) {
        // Parse response - each line is a separate JSON object
        const text = await response.text();
        const lines = text.split('\n').filter(line => line.trim());
        
        // Parse each line as a JSON object and add to recent messages
        // Ensure messages have an 'id' and 'time' for potential sorting/filtering if needed later
        recentMessages = lines.map(line => {
            try {
              return JSON.parse(line);
            } catch (parseError) {
              resourceLogger.warn("Failed to parse message line from ntfy stream", { requestId, line, error: parseError instanceof Error ? parseError.message : String(parseError) });
              return null; // Skip invalid lines
            }
          })
          .filter(msg => msg && msg.event === 'message' && msg.id && msg.time) // Ensure it's a valid message event
          .sort((a, b) => b.time - a.time) // Sort by time descending (most recent first)
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
    
    // Prepare response data based on whether 'default' was the requested topic
    const responseData = topic === "default" ? 
      {
        requestedTopic: "default", // Clarify what was requested
        resolvedTopic: defaultTopic, // Show the resolved topic
        timestamp: new Date().toISOString(),
        requestUri: uri.href,
        requestId,
        recentMessages: recentMessages.length > 0 ? recentMessages : undefined // Keep undefined if empty
      } : 
      {
        topic: topicToFetch, // Use the actual topic fetched
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
