import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { config } from "../../../config/index.js";
import { BaseErrorCode, McpError } from "../../../types-global/errors.js";
import { ErrorHandler } from "../../../utils/errorHandler.js";
import { logger } from "../../../utils/logger.js";
import { createRequestContext } from "../../../utils/requestContext.js";
import { sanitizeInputForLogging } from "../../../utils/sanitization.js";
import { processSubscription } from "./subscriptionHandlers.js";
import { SubscribeNtfyToolInput, SubscribeNtfyToolInputSchema } from "./types.js";

// Create module logger
const moduleLogger = logger.createChildLogger({ 
  module: 'SubscribeNtfyToolRegistration'
});

/**
 * Register the subscribe_ntfy tool with the MCP server
 * 
 * This function registers a tool for managing real-time subscriptions to ntfy topics
 * with support for starting, stopping, checking status, and listing subscriptions.
 * 
 * @param server - The MCP server instance to register the tool with
 * @returns Promise resolving when registration is complete
 */
export const registerSubscribeNtfyTool = async (server: McpServer): Promise<void> => {
  // Create a request context for tracking this registration operation
  const requestCtx = createRequestContext({
    operation: 'registerSubscribeNtfyTool',
    component: 'SubscribeNtfyTool'
  });
  
  // Create a tool-specific logger
  const toolLogger = logger.createChildLogger({
    module: 'SubscribeNtfyTool',
    operation: 'registration'
  });
  
  moduleLogger.info('Starting subscribe_ntfy tool registration');
  
  try {
    // Prepare the description with configuration information
    const maxSubscriptions = config.ntfy.maxSubscriptions;
    const subscriptionTimeout = Math.floor(config.ntfy.subscriptionTimeout / 1000 / 60); // Convert to minutes
    const baseUrl = config.ntfy.baseUrl;
    
    // Register the tool directly using the SDK pattern
    server.tool(
      "subscribe_ntfy",
      `Manage real-time subscriptions to ntfy topics. Actions: start (create new subscription), stop (end subscription), status (check subscription), list (show all subscriptions). Max concurrent subscriptions: ${maxSubscriptions}. Subscription timeout: ${subscriptionTimeout} minutes. Base URL: ${baseUrl}`,
      SubscribeNtfyToolInputSchema.shape,
      async (params) => {
        // Create request context for tracking this invocation
        const toolRequestCtx = createRequestContext({
          operation: 'handleSubscribeNtfyTool',
          action: params?.action,
          topic: params?.topic,
          subscriptionId: params?.subscriptionId
        });
        
        toolLogger.debug('Received subscribe_ntfy tool invocation', {
          requestId: toolRequestCtx.requestId,
          action: params?.action,
          topic: params?.topic,
          subscriptionId: params?.subscriptionId,
          hasOptions: !!params?.options
        });
        
        // Use ErrorHandler for consistent error handling
        return await ErrorHandler.tryCatch(
          async () => {
            // Validate input using Zod schema
            const validatedInput = SubscribeNtfyToolInputSchema.parse(params);
            
            // Process the subscription request
            const response = await processSubscription(validatedInput);
            
            toolLogger.info('Successfully processed subscribe_ntfy request', {
              action: response.action,
              subscriptionId: 'subscriptionId' in response ? response.subscriptionId : undefined,
              topic: 'topic' in response ? response.topic : undefined,
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
            operation: 'handling subscribe_ntfy tool request',
            context: { 
              requestId: toolRequestCtx.requestId,
              action: params?.action,
              topic: params?.topic,
              subscriptionId: params?.subscriptionId
            },
            input: sanitizeInputForLogging(params),
            
            // Map errors appropriately
            errorMapper: (error) => {
              // Log the error
              toolLogger.error('Error processing subscribe_ntfy tool request', {
                error: error instanceof Error ? error.message : 'Unknown error',
                errorType: error instanceof Error ? error.name : 'Unknown',
                action: params?.action,
                topic: params?.topic,
                subscriptionId: params?.subscriptionId,
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
                } else if (errorMsg.includes('rate limit') || errorMsg.includes('limit')) {
                  return new McpError(
                    BaseErrorCode.RATE_LIMITED,
                    `Rate limit exceeded: ${error.message}`
                  );
                }
              }
              
              // Default to service unavailable for network/connection issues
              return new McpError(
                BaseErrorCode.SERVICE_UNAVAILABLE,
                `Failed to manage subscription: ${error instanceof Error ? error.message : 'Unknown error'}`
              );
            }
          }
        );
      }
    );
    
    toolLogger.info("Subscribe ntfy tool handler registered successfully");
  } catch (error) {
    toolLogger.error("Failed to register subscribe_ntfy tool", {
      error: error instanceof Error ? error.message : String(error)
    });
    throw error; // Re-throw to propagate the error
  }
};