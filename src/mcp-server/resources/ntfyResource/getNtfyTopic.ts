import { BaseErrorCode, McpError } from '../../../types-global/errors.js';
import { ErrorHandler } from '../../../utils/errorHandler.js';
import { logger } from '../../../utils/logger.js';
import { createRequestContext } from '../../../utils/security.js';
import { config } from '../../../config/index.js';
import { NtfyResourceQuery, NtfyResourceQuerySchema, NtfyResourceResponse } from './types.js';

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

  resourceLogger.info("Ntfy resource request received", { 
    requestId,
    uri: uri.href
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

    // Prepare response data
    const responseData = {
      defaultTopic,
      timestamp: new Date().toISOString(),
      requestUri: uri.href,
      requestId
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
