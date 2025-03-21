import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BaseErrorCode, McpError } from "../../../types-global/errors.js";
import { ErrorHandler } from "../../../utils/errorHandler.js";
import { ChildLogger } from "../../../utils/logger.js";
import { registerTool } from "../../utils/registrationHelper.js";
import { processNtfyMessage } from "./ntfyMessage.js";
import { SendNtfyToolInputSchema } from "./types.js";

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
  return registerTool(
    server,
    { name: "send_ntfy" },
    async (server, toolLogger: ChildLogger) => {
      // Register the tool directly using the simplified SDK pattern
      server.tool(
        // Tool name
        "send_ntfy", 
        
        // Input schema (using Zod schema defined in types.ts)
        SendNtfyToolInputSchema.shape,
        
        // Handler function
        async (params) => {
          // Use ErrorHandler.tryCatch for consistent error handling
          return await ErrorHandler.tryCatch(
            async () => {
              // Pass the typed params to the processor
              const response = await processNtfyMessage(params as any);
              
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
              input: params,
              // Provide custom error mapping for better error messages
              errorMapper: (error) => new McpError(
                BaseErrorCode.VALIDATION_ERROR,
                `Error sending ntfy notification: ${error instanceof Error ? error.message : 'Unknown error'}`
              )
            }
          );
        }
      );
      
      toolLogger.info("Ntfy tool handler registered");
    }
  );
};