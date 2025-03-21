import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BaseErrorCode, McpError } from "../../../types-global/errors.js";
import { ErrorHandler } from "../../../utils/errorHandler.js";
import { logger } from "../../../utils/logger.js";
import { createRequestContext } from "../../../utils/requestContext.js";
import { sanitizeInputForLogging } from "../../../utils/sanitization.js";
import { idGenerator } from "../../../utils/idGenerator.js";
import { registerTool } from "../../utils/registrationHelper.js";
import { processNtfyMessage } from "./ntfyMessage.js";
import { createSendNtfyToolSchema, SendNtfyToolInput } from "./types.js";

// Create module logger
const moduleLogger = logger.createChildLogger({ 
  module: 'NtfyToolRegistration',
  serviceId: idGenerator.generateRandomString(8)
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
    registrationId: idGenerator.generateRandomString(8),
    timestamp: new Date().toISOString()
  });
  
  moduleLogger.info('Starting ntfy tool registration', {
    requestId: requestCtx.requestId
  });
  
  return registerTool(
    server,
    { name: "send_ntfy" },
    async (server, toolLogger) => {
      // Log with the provided tool logger
      toolLogger.debug('Creating schema with latest config values');
      
      // Create a fresh schema with the latest config values
      const schemaWithLatestConfig = createSendNtfyToolSchema();
      
      toolLogger.info('Registering ntfy tool handler');
      
      // Register the tool directly using the simplified SDK pattern
      server.tool(
        // Tool name
        "send_ntfy", 
        
        // Input schema - use the fresh schema to ensure it has the latest config
        schemaWithLatestConfig.shape,
        
        // Handler function
        async (params) => {
          // Create request context for tracking this invocation
          const toolRequestCtx = createRequestContext({
            operation: 'handleNtfyTool',
            toolId: idGenerator.generateRandomString(8),
            toolName: 'send_ntfy'
          });
          
          toolLogger.debug('Received tool invocation', {
            requestId: toolRequestCtx.requestId,
            hasParams: !!params,
            topic: params?.topic
          });
          
          // Use ErrorHandler.tryCatch for consistent error handling
          return await ErrorHandler.tryCatch(
            async () => {
              // Pass the typed params to the processor
              const response = await processNtfyMessage(params as SendNtfyToolInput);
              
              toolLogger.info('Successfully processed ntfy message', {
                requestId: toolRequestCtx.requestId,
                success: response.success,
                messageId: response.id,
                topic: response.topic
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
              // Provide custom error mapping for better error messages
              errorMapper: (error) => {
                // Log the error but don't include sensitive details
                toolLogger.error('Error processing ntfy tool request', {
                  error: error instanceof Error ? error.message : 'Unknown error',
                  errorType: error instanceof Error ? error.name : 'Unknown',
                  requestId: toolRequestCtx.requestId,
                  // Include a safe subset of params for debugging
                  hasTopic: !!params?.topic,
                  hasTitle: !!params?.title
                });
                
                // Determine appropriate error code
                let errorCode = BaseErrorCode.INTERNAL_ERROR;
                
                if (error instanceof McpError) {
                  errorCode = error.code;
                } else if (error instanceof Error) {
                  // Try to classify the error
                  const errorMsg = error.message.toLowerCase();
                  if (errorMsg.includes('validation') || errorMsg.includes('invalid')) {
                    errorCode = BaseErrorCode.VALIDATION_ERROR;
                  } else if (errorMsg.includes('not found') || errorMsg.includes('missing')) {
                    errorCode = BaseErrorCode.NOT_FOUND;
                  } else if (errorMsg.includes('timeout')) {
                    errorCode = BaseErrorCode.TIMEOUT;
                  } else if (errorMsg.includes('service') || errorMsg.includes('server')) {
                    errorCode = BaseErrorCode.SERVICE_UNAVAILABLE;
                  }
                }
                
                return new McpError(
                  errorCode,
                  `Error sending ntfy notification: ${error instanceof Error ? error.message : 'Unknown error'}`
                );
              }
            }
          );
        }
      );
      
      toolLogger.info("Ntfy tool handler registered successfully");
    }
  ).catch(error => {
    // Handle registration errors
    moduleLogger.error('Failed to register ntfy tool', {
      error: error instanceof Error ? error.message : 'Unknown error',
      errorType: error instanceof Error ? error.name : 'Unknown',
      requestId: requestCtx.requestId
    });
    throw error;
  });
};