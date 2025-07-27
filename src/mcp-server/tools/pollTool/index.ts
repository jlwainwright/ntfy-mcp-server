import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { config } from "../../../config/index.js";
import { BaseErrorCode, McpError } from "../../../types-global/errors.js";
import { ErrorHandler } from "../../../utils/errorHandler.js";
import { logger } from "../../../utils/logger.js";
import { createRequestContext } from "../../../utils/requestContext.js";
import { sanitizeInputForLogging } from "../../../utils/sanitization.js";
import { processPollTopic } from "./pollManager.js";
import { PollTopicToolInput, PollTopicToolInputSchema } from "./types.js";

// Create module logger
const moduleLogger = logger.createChildLogger({ 
  module: 'PollTopicToolRegistration'
});

/**
 * Register the poll_topic tool with the MCP server
 * 
 * This function registers a tool for stateful polling of ntfy topics,
 * maintaining state between polls to only return new messages.
 * 
 * @param server - The MCP server instance to register the tool with
 * @returns Promise resolving when registration is complete
 */
export const registerPollTopicTool = async (server: McpServer): Promise<void> => {
  // Create a request context for tracking this registration operation
  const requestCtx = createRequestContext({
    operation: 'registerPollTopicTool',
    component: 'PollTopicTool'
  });
  
  // Create a tool-specific logger
  const toolLogger = logger.createChildLogger({
    module: 'PollTopicTool',
    operation: 'registration'
  });
  
  moduleLogger.info('Starting poll_topic tool registration');
  
  try {
    // Prepare the description with configuration information
    const defaultLimit = config.ntfy.defaultMessageLimit;
    const maxLimit = 1000;
    const stateTtl = Math.floor(config.ntfy.pollStateTtl / 1000 / 60); // Convert to minutes
    const baseUrl = config.ntfy.baseUrl;
    
    // Register the tool directly using the SDK pattern
    server.tool(
      "poll_topic",
      `Poll an ntfy topic for new messages since the last poll, maintaining state between requests. Only returns messages that haven't been seen before. State TTL: ${stateTtl} minutes. Default limit: ${defaultLimit}, Max limit: ${maxLimit}. Base URL: ${baseUrl}`,
      PollTopicToolInputSchema.shape,
      async (params) => {
        // Create request context for tracking this invocation
        const toolRequestCtx = createRequestContext({
          operation: 'handlePollTopicTool',
          topic: params?.topic
        });
        
        toolLogger.debug('Received poll_topic tool invocation', {
          requestId: toolRequestCtx.requestId,
          topic: params?.topic,
          resetState: params?.resetState,
          limit: params?.limit,
          interval: params?.interval
        });
        
        // Use ErrorHandler for consistent error handling
        return await ErrorHandler.tryCatch(
          async () => {
            // Validate input using Zod schema
            const validatedInput = PollTopicToolInputSchema.parse(params);
            
            // Process the poll topic request
            const response = await processPollTopic(validatedInput);
            
            toolLogger.info('Successfully processed poll_topic request', {
              topic: response.topic,
              newMessageCount: response.newMessageCount,
              totalSeen: response.pollState.totalMessagesSeen,
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
            operation: 'handling poll_topic tool request',
            context: { 
              requestId: toolRequestCtx.requestId,
              topic: params?.topic
            },
            input: sanitizeInputForLogging(params),
            
            // Map errors appropriately
            errorMapper: (error) => {
              // Log the error
              toolLogger.error('Error processing poll_topic tool request', {
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
                `Failed to poll topic: ${error instanceof Error ? error.message : 'Unknown error'}`
              );
            }
          }
        );
      }
    );
    
    toolLogger.info("Poll topic tool handler registered successfully");
  } catch (error) {
    toolLogger.error("Failed to register poll_topic tool", {
      error: error instanceof Error ? error.message : String(error)
    });
    throw error; // Re-throw to propagate the error
  }
};