import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { config } from "../../../config/index.js";
import { BaseErrorCode, McpError } from "../../../types-global/errors.js";
import { ErrorHandler } from "../../../utils/errorHandler.js";
import { logger } from "../../../utils/logger.js";
import { createRequestContext } from "../../../utils/requestContext.js";
import { sanitizeInputForLogging } from "../../../utils/sanitization.js";
import { idGenerator } from "../../../utils/idGenerator.js";
import { registerTool } from "../../utils/registrationHelper.js";
import { processNtfyMessage } from "./ntfyMessage.js";
import { createSendNtfyToolSchema, SendNtfyToolInput, SendNtfyToolInputSchema } from "./types.js";

// Create module logger
const moduleLogger = logger.createChildLogger({ 
  module: 'NtfyToolRegistration'
});

/**
 * Register the send_ntfy tool with the MCP server
 * 
 * This function registers a tool for sending notifications via ntfy.sh with
 * comprehensive parameter support for all ntfy features.
 * 
 * @param server - The MCP server instance to register the tool with
 * @returns Promise resolving when registration is complete
 */
export const registerNtfyTool = async (server: McpServer): Promise<void> => {
  // Create a request context for tracking this registration operation
  const requestCtx = createRequestContext({
    operation: 'registerNtfyTool',
    component: 'NtfyTool'
  });
  
  moduleLogger.info('Starting ntfy tool registration');
  
  return registerTool(
    server,
    { name: "send_ntfy" },
    async (server, toolLogger) => {
      // Create a fresh schema with the latest config values
      // This ensures we have the most up-to-date environment variables
      const schemaWithLatestConfig = SendNtfyToolInputSchema();
      
      // Log default topic info at registration time for verification
      const ntfyConfig = config.ntfy;
      toolLogger.info('Registering ntfy tool handler with config', {
        defaultTopic: ntfyConfig.defaultTopic || '(not set)',
        baseUrl: ntfyConfig.baseUrl,
        apiKeyPresent: !!ntfyConfig.apiKey
      });
      
      // Register the tool using the simplified SDK pattern
      server.tool(
        "send_ntfy", 
        schemaWithLatestConfig.shape,
        async (params) => {
          // Create request context for tracking this invocation
          const toolRequestCtx = createRequestContext({
            operation: 'handleNtfyTool',
            topic: params?.topic
          });
          
          toolLogger.debug('Received tool invocation', {
            requestId: toolRequestCtx.requestId,
            topic: params?.topic
          });
          
          // Use ErrorHandler for consistent error handling
          return await ErrorHandler.tryCatch(
            async () => {
              // Process the notification
              const response = await processNtfyMessage(params as SendNtfyToolInput);
              
              toolLogger.info('Successfully processed ntfy message', {
                messageId: response.id,
                topic: response.topic,
                retries: response.retries
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
              operation: 'sending ntfy notification',
              context: { 
                requestId: toolRequestCtx.requestId,
                topic: params?.topic
              },
              input: sanitizeInputForLogging(params),
              // Map errors appropriately
              errorMapper: (error) => {
                // Log the error
                toolLogger.error('Error processing ntfy tool request', {
                  error: error instanceof Error ? error.message : 'Unknown error',
                  errorType: error instanceof Error ? error.name : 'Unknown',
                  topic: params?.topic
                });
                
                // Pass through McpErrors, map others properly
                if (error instanceof McpError) {
                  return error;
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
                  `Failed to send notification: ${error instanceof Error ? error.message : 'Unknown error'}`
                );
              }
            }
          );
        }
      );
      
      toolLogger.info("Ntfy tool handler registered successfully");
    }
  );
};
