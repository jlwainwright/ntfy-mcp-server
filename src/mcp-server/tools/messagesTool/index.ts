import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { config } from "../../../config/index.js";
import { BaseErrorCode, McpError } from "../../../types-global/errors.js";
import { ErrorHandler } from "../../../utils/errorHandler.js";
import { logger } from "../../../utils/logger.js";
import { createRequestContext } from "../../../utils/requestContext.js";
import { sanitizeInputForLogging } from "../../../utils/sanitization.js";
import { processGetMessages } from "./messageRetrieval.js";
import { GetMessagesToolInput, GetMessagesToolInputSchema } from "./types.js";

// Create module logger
const moduleLogger = logger.createChildLogger({ 
  module: 'GetMessagesToolRegistration'
});

/**
 * Register the get_messages tool with the MCP server
 * 
 * This function registers a tool for retrieving historical messages from ntfy topics
 * with support for filtering, pagination, and various query options.
 * 
 * @param server - The MCP server instance to register the tool with
 * @returns Promise resolving when registration is complete
 */
export const registerGetMessagesTool = async (server: McpServer): Promise<void> => {
  // Create a request context for tracking this registration operation
  const requestCtx = createRequestContext({
    operation: 'registerGetMessagesTool',
    component: 'GetMessagesTool'
  });
  
  // Create a tool-specific logger
  const toolLogger = logger.createChildLogger({
    module: 'GetMessagesTool',
    operation: 'registration'
  });
  
  moduleLogger.info('Starting get_messages tool registration');
  
  try {
    // Prepare the description with configuration information
    const defaultLimit = config.ntfy.defaultMessageLimit;
    const maxLimit = 1000;
    const baseUrl = config.ntfy.baseUrl;
    
    // Register the tool directly using the SDK pattern
    server.tool(
      "get_messages",
      `Retrieve historical messages from an ntfy topic with filtering and pagination support. Use this tool to fetch past notifications from a topic. Default limit: ${defaultLimit}, Max limit: ${maxLimit}. Base URL: ${baseUrl}`,
      GetMessagesToolInputSchema.shape,
      async (params) => {
        // Create request context for tracking this invocation
        const toolRequestCtx = createRequestContext({
          operation: 'handleGetMessagesTool',
          topic: params?.topic
        });
        
        toolLogger.debug('Received get_messages tool invocation', {
          requestId: toolRequestCtx.requestId,
          topic: params?.topic,
          since: params?.since,
          limit: params?.limit
        });
        
        // Use ErrorHandler for consistent error handling
        return await ErrorHandler.tryCatch(
          async () => {
            // Validate input using Zod schema
            const validatedInput = GetMessagesToolInputSchema.parse(params);
            
            // Process the get messages request
            const response = await processGetMessages(validatedInput);
            
            toolLogger.info('Successfully processed get_messages request', {
              topic: response.topic,
              messageCount: response.messageCount,
              hasMore: response.hasMore,
              requestId: toolRequestCtx.requestId
            });
            
            // Return in the standard MCP format
            return {
              content: [{ 
                type: "text", 
                text: JSON.stringify(response, null, 2)
              }]
            };
          },
          {
            operation: 'handling get_messages tool request',
            context: { 
              requestId: toolRequestCtx.requestId,
              topic: params?.topic
            },
            input: sanitizeInputForLogging(params),
            
            // Map errors appropriately
            errorMapper: (error) => {
              // Log the error
              toolLogger.error('Error processing get_messages tool request', {
                error: error instanceof Error ? error.message : 'Unknown error',
                errorType: error instanceof Error ? error.name : 'Unknown',
                topic: params?.topic,
                requestId: toolRequestCtx.requestId
              });
              
              // Pass through McpErrors, map others properly
              if (error instanceof McpError) {
                return error;
              }
              
              // Handle Zod validation errors
              if (error && typeof error === 'object' && 'issues' in error) {
                const issues = (error as any).issues;
                const errorMessages = issues.map((issue: any) => 
                  `${issue.path.join('.')}: ${issue.message}`
                ).join(', ');
                
                return new McpError(
                  BaseErrorCode.VALIDATION_ERROR,
                  `Input validation failed: ${errorMessages}`
                );
              }
              
              // Try to classify unknown errors
              if (error instanceof Error) {
                const errorMsg = error.message.toLowerCase();
                
                if (errorMsg.includes('validation') || errorMsg.includes('invalid')) {
                  return new McpError(
                    BaseErrorCode.VALIDATION_ERROR,
                    `Validation error: ${error.message}`
                  );
                } else if (errorMsg.includes('not found') || errorMsg.includes('missing')) {
                  return new McpError(
                    BaseErrorCode.NOT_FOUND,
                    `Resource not found: ${error.message}`
                  );
                } else if (errorMsg.includes('timeout')) {
                  return new McpError(
                    BaseErrorCode.TIMEOUT,
                    `Request timed out: ${error.message}`
                  );
                } else if (errorMsg.includes('rate limit')) {
                  return new McpError(
                    BaseErrorCode.RATE_LIMITED,
                    `Rate limit exceeded: ${error.message}`
                  );
                }
              }
              
              // Default to service unavailable for network/connection issues
              return new McpError(
                BaseErrorCode.SERVICE_UNAVAILABLE,
                `Failed to retrieve messages: ${error instanceof Error ? error.message : 'Unknown error'}`
              );
            }
          }
        );
      }
    );
    
    toolLogger.info("Get messages tool handler registered successfully");
  } catch (error) {
    toolLogger.error("Failed to register get_messages tool", {
      error: error instanceof Error ? error.message : String(error)
    });
    throw error; // Re-throw to propagate the error
  }
};