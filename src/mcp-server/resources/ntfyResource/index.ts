import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BaseErrorCode, McpError } from '../../../types-global/errors.js';
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
          // Extract the topic from the URI parameters provided by the SDK
          const topicParam = params.topic;
          
          resourceLogger.info(`Processing ntfy resource request for topic parameter: ${topicParam}`, {
            topicParam,
            href: uri.href
          });
          
          // Check if the topic parameter is valid and is a string
          if (typeof topicParam !== 'string' || !topicParam) {
            resourceLogger.error(`Invalid or missing topic parameter in ntfy resource uri: ${uri.href}`, {
              href: uri.href,
              params: params,
              topicType: typeof topicParam
            });
            
            // Use VALIDATION_ERROR as it's an issue with the input derived from the URI
            throw new McpError(
              BaseErrorCode.VALIDATION_ERROR, 
              `Invalid resource URI: Topic parameter must be a non-empty string in ${uri.href}`,
              { uri: uri.href, params: params }
            );
          }

          // Now we know topicParam is a string
          const topic: string = topicParam;
          
          // Process the request using our dedicated handler
          // Pass the validated topic string and the original URI to the handler
          return await getNtfyTopic(topic, uri);
        }
      );
      
      resourceLogger.info("Ntfy resource handler registered");
    }
  );
};
