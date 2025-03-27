#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { EventEmitter } from "events";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from 'url';
import { config } from "../config/index.js";
import { BaseErrorCode, McpError } from "../types-global/errors.js";
import { ErrorHandler } from "../utils/errorHandler.js";
import { idGenerator } from "../utils/idGenerator.js";
import { logger } from "../utils/logger.js";
import { createRequestContext } from "../utils/requestContext.js";
import { configureContext, sanitizeInput } from "../utils/security.js";

// Calculate __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import tool and resource registrations
import { registerNtfyTool } from "./tools/ntfyTool/index.js";
import { registerNtfyResource } from "./resources/ntfyResource/index.js";

// Maximum file size for package.json (5MB) to prevent potential DoS
const MAX_FILE_SIZE = 5 * 1024 * 1024;

/**
 * Load package information directly from package.json
 * 
 * @returns A promise resolving to an object with the package name and version
 */
const loadPackageInfo = async (): Promise<{ name: string; version: string }> => {
  return await ErrorHandler.tryCatch(
    async () => {
      // Use the globally defined __dirname from the top of the file
      const pkgPath = path.resolve(__dirname, '../../package.json');
      const safePath = sanitizeInput.path(pkgPath);
      
      console.error(`Looking for package.json at: ${safePath}`);
      
      // Get file stats to check size before reading
      const stats = await fs.stat(safePath);
      
      // Check file size to prevent DoS attacks
      if (stats.size > MAX_FILE_SIZE) {
        throw new McpError(
          BaseErrorCode.VALIDATION_ERROR,
          `package.json file is too large (${stats.size} bytes)`,
          { path: safePath, maxSize: MAX_FILE_SIZE }
        );
      }
      
      const pkgContent = await fs.readFile(safePath, 'utf-8');
      const pkg = JSON.parse(pkgContent);
      
      if (!pkg.name || typeof pkg.name !== 'string' || 
          !pkg.version || typeof pkg.version !== 'string') {
        throw new McpError(
          BaseErrorCode.VALIDATION_ERROR, 
          'Invalid package.json: missing name or version',
          { path: safePath }
        );
      }
      
      return {
        name: pkg.name,
        version: pkg.version
      };
    },
    {
      operation: 'LoadPackageInfo',
      errorCode: BaseErrorCode.VALIDATION_ERROR,
      rethrow: true, // Changed to true so errors propagate
      includeStack: true,
      errorMapper: (error) => {
        if (error instanceof SyntaxError) {
          return new McpError(
            BaseErrorCode.VALIDATION_ERROR,
            `Failed to parse package.json: ${error.message}`,
            { errorType: 'SyntaxError' }
          );
        }
        return new McpError(
          BaseErrorCode.INTERNAL_ERROR,
          `Failed to load package info: ${error instanceof Error ? error.message : String(error)}`,
          { errorType: error instanceof Error ? error.name : typeof error }
        );
      }
    }
  );
};

/**
 * Server state management interface
 */
export interface ServerState {
  status: 'initializing' | 'running' | 'error' | 'degraded' | 'shutting_down' | 'shutdown';
  startTime: Date;
  lastHealthCheck: Date;
  activeOperations: Map<string, { operation: string; startTime: Date }>;
  errors: Array<{ timestamp: Date; message: string; code?: string }>;
  registeredTools: Set<string>;
  registeredResources: Set<string>;
  failedRegistrations: Array<{
    type: 'tool' | 'resource';
    name: string;
    error: any;
    attempts: number;
  }>;
  requiredTools: Set<string>;
  requiredResources: Set<string>;
}

/**
 * Server event emitter for lifecycle events
 */
class ServerEvents extends EventEmitter {
  constructor() {
    super();
  }

  // Type-safe event emitters
  emitStateChange(oldState: ServerState['status'], newState: ServerState['status']) {
    this.emit('stateChange', oldState, newState);
    this.emit(`state:${newState}`, oldState);
  }
}

/**
 * Create and initialize an MCP server instance with all tools and resources
 * 
 * This function configures the MCP server with security settings, tools, and resources.
 * It connects the server to a transport (currently stdio) and returns the initialized
 * server instance.
 * 
 * @returns A promise that resolves to the initialized McpServer instance
 * @throws {McpError} If the server fails to initialize
 */
export const createMcpServer = async () => {
  // Initialize server variable outside try/catch
  let server: McpServer | undefined;
  
  // Maximum registration retry attempts
  const MAX_REGISTRATION_RETRIES = 3;
  
  // Create a unique server instance ID
  const serverId = idGenerator.generateRandomString(8);
  
  // Initialize server state for tracking
  const serverState: ServerState = {
    status: 'initializing',
    startTime: new Date(),
    lastHealthCheck: new Date(),
    activeOperations: new Map(),
    errors: [],
    registeredTools: new Set(),
    registeredResources: new Set(),
    failedRegistrations: [],
    requiredTools: new Set(['send_ntfy']), // Define tools that are required for the server to function properly
    requiredResources: new Set([]) // Define resources that are required for the server to function properly
  };

  // Create operation context
  const serverContext = createRequestContext({
    operation: 'ServerStartup',
    component: 'McpServer',
    serverId
  });

  // Create server-specific logger with context
  const serverLogger = logger.createChildLogger({
    module: 'MCPServer',
    service: 'MCPServer',
    requestId: serverContext.requestId,
    serverId,
    environment: config.environment
  });

  // Create server events emitter
  const serverEvents = new ServerEvents();
  
  // Monitor state changes
  serverEvents.on('stateChange', (oldState, newState) => {
    serverLogger.info(`Server state changed from ${oldState} to ${newState}`, { 
      previousState: oldState, 
      newState 
    });
  });
  
  console.error("Initializing MCP server...");
  serverLogger.info("Initializing server...");
  
  const timers: Array<NodeJS.Timeout> = [];
  
  return await ErrorHandler.tryCatch(
    async () => {
      // Load package info asynchronously
      const packageInfo = await loadPackageInfo();
      
      // Update logger with package info
      console.error("Loaded package info:", packageInfo.name, packageInfo.version);
      serverLogger.info("Loaded package info", {
        name: packageInfo.name,
        version: packageInfo.version
      });

      // Create the MCP server instance
      console.error("Creating MCP server instance...");
      server = new McpServer({
        name: packageInfo.name,
        version: packageInfo.version
      });
      console.error("MCP server instance created");
      
      // Register tools and resources in parallel with error handling
      type RegistrationResult = {
        success: boolean;
        type: 'tool' | 'resource';
        name: string;
        error?: any;
      };
      
      const registerComponent = async (
        type: 'tool' | 'resource',
        name: string,
        registerFn: () => Promise<void>
      ): Promise<RegistrationResult> => {
        console.error(`Registering ${type}: ${name}`);
        try {
          await ErrorHandler.tryCatch(
            async () => await registerFn(),
            {
              operation: `Register${type === 'tool' ? 'Tool' : 'Resource'}`,
              context: { ...serverContext, componentName: name },
              errorCode: BaseErrorCode.INTERNAL_ERROR
            }
          );
          
          // Update state based on component type
          if (type === 'tool') {
            serverState.registeredTools.add(name);
          } else {
            serverState.registeredResources.add(name);
          }
          
          console.error(`Successfully registered ${type}: ${name}`);
          return { success: true, type, name };
        } catch (error) {
          console.error(`Failed to register ${type}: ${name}`, error);
          return { success: false, type, name, error };
        }
      };
      
      // Register components with proper error handling
      console.error("Registering components...");
      const registrationPromises: Promise<RegistrationResult>[] = [
        registerComponent('tool', 'send_ntfy', () => registerNtfyTool(server!)),
        registerComponent('resource', 'ntfy-resource', () => registerNtfyResource(server!)),
      ];
      
      const registrationResults = await Promise.allSettled(registrationPromises);
      
      // Process the results to find failed registrations
      const failedRegistrations: Array<RegistrationResult & { attempts?: number }> = [];
      
      registrationResults.forEach(result => {
        if (result.status === 'rejected') {
          failedRegistrations.push({ 
            success: false, 
            type: 'unknown' as 'tool' | 'resource', 
            name: 'unknown', 
            error: result.reason 
          });
        } else if (!result.value.success) {
          failedRegistrations.push(result.value);
        }
      });
      
      // Process failed registrations
      if (failedRegistrations.length > 0) {
        console.error(`${failedRegistrations.length} registrations failed initially`, 
          failedRegistrations.map(f => `${f.type}:${f.name}`));
        
        serverLogger.warn(`${failedRegistrations.length} registrations failed initially`, {
          failedComponents: failedRegistrations.map(f => `${f.type}:${f.name}`) 
        });
      }

      // Add debug logs to diagnose the connection issue
      console.error("About to connect to stdio transport");
      
      try {
        // Connect using stdio transport
        const transport = new StdioServerTransport();
        console.error("Created StdioServerTransport instance");
        
        // Set event handlers - using type assertion to avoid TS errors
        (server as any).onerror = (err: Error) => {
          console.error(`Server error: ${err.message}`);
        };
        
        // Skip setting onrequest since we don't have access to the type
        
        await server.connect(transport);
        console.error("Connected to transport successfully");
      } catch (error) {
        console.error("Error connecting to transport:", error);
        throw error;
      }
      
      console.error("MCP server initialized and connected");
      return server;
    },
    {
      operation: 'CreateMcpServer',
      context: serverContext,
      critical: true,
      errorMapper: (error) => new McpError(
        BaseErrorCode.INTERNAL_ERROR,
        `Failed to initialize MCP server: ${error instanceof Error ? error.message : String(error)}`,
        { 
          serverState: serverState.status,
          startTime: serverState.startTime,
          registeredTools: Array.from(serverState.registeredTools),
          registeredResources: Array.from(serverState.registeredResources)
        }
      )
    }
  ).catch((error) => {
    console.error("Fatal error in MCP server creation:", error);
    
    // Attempt to close server
    if (server) {
      try {
        server.close();
      } catch (closeError) {
        // Already in error state, just log
        console.error("Error while closing server during error recovery:", closeError);
      }
    }
    
    // Re-throw to communicate error to caller
    throw error;
  });
};
