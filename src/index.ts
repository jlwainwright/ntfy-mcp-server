#!/usr/bin/env node

/**
 * ntfy-mcp-server - Main entry point
 * 
 * This file initializes the MCP server and sets up signal handlers
 * for graceful shutdown.
 */

// Import dependencies
import { createMcpServer } from "./mcp-server/server.js";
import { logger } from "./utils/logger.js";

// Track the server instance
let server: Awaited<ReturnType<typeof createMcpServer>> | undefined;

/**
 * Gracefully shut down the server
 */
const shutdown = async (signal: string): Promise<void> => {
  try {
    // Close the MCP server
    if (server) {
      logger.info(`Closing MCP server due to ${signal} signal...`);
      await server.close();
      logger.info("MCP server closed successfully");
    }

    logger.info("Graceful shutdown completed");
    process.exit(0);
  } catch (error) {
    // Handle any errors during shutdown silently (no console output)
    logger.error("Critical error during shutdown", { 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    process.exit(1);
  }
};

/**
 * Start the NTFY MCP server
 */
const start = async (): Promise<void> => {
  try {
    // Create and store server instance
    server = await createMcpServer();
    
    // Handle process signals for graceful shutdown
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));

    // Handle uncaught errors with silent logging
    process.on("uncaughtException", (error) => {
      logger.error("Uncaught exception", { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      shutdown("UNCAUGHT_EXCEPTION");
    });

    process.on("unhandledRejection", (reason: unknown) => {
      logger.error("Unhandled rejection", { 
        reason: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined
      });
      shutdown("UNHANDLED_REJECTION");
    });
  } catch (error) {
    // Handle startup errors
    logger.error("Critical error during startup", { 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    process.exit(1);
  }
};

// Start the server
start().catch((error) => {
  // Handle any uncaught errors from the start function silently
  logger.error("Fatal error in server startup", {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined
  });
  process.exit(1);
});
