import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BaseErrorCode, McpError } from '../../../types-global/errors.js';
import { ErrorHandler } from '../../../utils/errorHandler.js';
import { ChildLogger } from '../../../utils/logger.js';
import { registerResource } from '../../utils/registrationHelper.js';
import { getNtfyTopic } from './getNtfyTopic.js';

/**
 * Register the ntfy resource with the MCP server
 * 
 * This function creates and registers the ntfy resource which returns the default
 * ntfy topic configured in the environment variables. It provides access to this
 * configuration through a resource URI.
 * 
 * @param server - The MCP server instance to register the resource with
 * @returns Promise resolving when registration is complete
 */
export const registerNtfyResource = async (server: McpServer): Promise<void> => {
  return registerResource(
    server,
    { name: "ntfy-resource" },
    async (server, resourceLogger: ChildLogger) => {
      // Create resource template
      const template = new ResourceTemplate(
        "ntfy://{topic}",
        {
          // Simple list implementation
          list: async () => ({
            resources: [{
              uri: "ntfy://default",
              name: "Default Ntfy Topic",
              description: "Returns the default ntfy topic configured in environment variables"
            }]
          }),
          // No completion needed for this resource
          complete: {}
        }
      );

      // Register the resource
      server.resource(
        // Resource name
        "ntfy-resource",
        
        // Resource template
        template,
        
        // Resource metadata
        {
          name: "Ntfy Default Topic",
          description: "Returns the default ntfy topic configured in environment variables",
          mimeType: "application/json",
          
          // No query parameters needed for this resource
          
          // Examples
          examples: [
            {
              name: "Default topic",
              uri: "ntfy://default",
              description: "Get the default ntfy topic"
            }
          ],
        },
        
        // Resource handler
        async (uri, params) => {
          // Handle both /default and default pathname formats for backward compatibility
          if (uri.pathname !== '/default' && uri.pathname !== 'default') {
            resourceLogger.error(`Invalid ntfy resource uri: ${uri.href}`, {
              pathname: uri.pathname,
              href: uri.href,
              protocol: uri.protocol
            });
            
            throw new McpError(
              BaseErrorCode.NOT_FOUND,
              `Resource not found: ${uri.href}`,
              { uri: uri.href }
            );
          }
          
          // Process the request using our dedicated handler
          return await getNtfyTopic(uri);
        }
      );
      
      resourceLogger.info("Ntfy resource handler registered");
    }
  );
};
