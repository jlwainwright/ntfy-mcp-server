#!/usr/bin/env node
/**
 * Ntfy MCP Server - Main Entry Point
 * 
 * This is the main entry point for the Ntfy MCP server. It initializes the 
 * server, sets up signal handlers for graceful shutdown, and manages the
 * application lifecycle.
 */
import { config } from "./config/index.js";
import { createMcpServer } from "./mcp-server/server.js";
import { logger } from "./utils/logger.js";
import { createRequestContext } from "./utils/requestContext.js";

// Create main application logger
const appLogger = logger.createChildLogger({
  module: 'NtfyMcpServer',
  service: 'NtfyMcpServer',
  component: 'Main',
  environment: config.environment
});

/**
 * Graceful shutdown handler
 * @param signal The signal that triggered the shutdown
 */
const shutdown = async (signal: string): Promise<void> => {
  appLogger.info(`Shutting down due to ${signal} signal...`);
  
  try {
    if (mcpServer) {
      appLogger.info('Closing MCP server...');
      await mcpServer.close();
      appLogger.info('MCP server closed successfully');
    }
    
    appLogger.info('Shutdown complete. Exiting process.');
    process.exit(0);
  } catch (error) {
    appLogger.error('Error during shutdown', {
      error: error instanceof Error ? error.message : String(error),
      signal
    });
    process.exit(1);
  }
};

// Variable to hold server instance
let mcpServer: Awaited<ReturnType<typeof createMcpServer>> | undefined;

/**
 * Main startup function
 */
const start = async (): Promise<void> => {
  // Create startup context
  const startupContext = createRequestContext({
    operation: "ServerStartup",
    appName: "ntfy-mcp-server",
    environment: config.environment,
  });

  appLogger.info("Starting ntfy-mcp-server...", {
    environment: config.environment,
    logLevel: config.logLevel,
    requestId: startupContext.requestId
  });

  try {
    // Validate ntfy configuration
    const ntfyConfig = config.ntfy;
    
    if (!ntfyConfig.baseUrl) {
      appLogger.warn("Ntfy base URL not configured. Using default https://ntfy.sh");
    }
    
    if (!ntfyConfig.defaultTopic) {
      appLogger.warn("No default ntfy topic configured. Some functionality may be limited.");
    }
    
    // Create main MCP server
    appLogger.info("Creating MCP server...");
    mcpServer = await createMcpServer();
    appLogger.info("MCP server created and connected successfully");

    // Register signal handlers for graceful shutdown
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
    
    // Handle uncaught exceptions
    process.on("uncaughtException", (error) => {
      appLogger.error("Uncaught exception", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
    });
    
    // Handle unhandled promise rejections
    process.on("unhandledRejection", (reason) => {
      appLogger.error("Unhandled promise rejection", {
        reason: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined
      });
    });
    
    appLogger.info("Server startup complete. Ready to handle requests.");
  } catch (error) {
    appLogger.error("Failed to start server", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    
    // Exit with non-zero code to indicate error
    process.exit(1);
  }
};

// Start the application
start().catch((error) => {
  appLogger.error("Fatal error during startup", {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined
  });
  process.exit(1);
});
