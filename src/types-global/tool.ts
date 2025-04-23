import { z } from 'zod';
import { RateLimitConfig } from "../utils/rateLimiter.js";
import { OperationContext } from "../utils/security.js";
import { ErrorHandler } from "../utils/errorHandler.js";
import { logger } from "../utils/logger.js";

// Create a module-level logger
const toolLogger = logger.createChildLogger({
  module: 'ToolRegistration'
});

/**
 * Metadata for a tool example
 */
export interface ToolExample {
  /** Example input parameters */
  input: Record<string, unknown>;
  /** Expected output string */
  output: string;
  /** Description of the example */
  description: string;
}

/**
 * Configuration for a tool
 */
export interface ToolMetadata {
  /** Examples showing how to use the tool */
  examples: ToolExample[];
  /** Optional permission required for this tool */
  requiredPermission?: string;
  /** Optional schema for the return value */
  returnSchema?: z.ZodType<unknown>;
  /** Rate limit configuration for the tool */
  rateLimit?: RateLimitConfig;
  /** Whether this tool can be used without authentication */
  allowUnauthenticated?: boolean;
}

/**
 * Create a tool example
 * 
 * @param input Example input parameters
 * @param output Expected output (as a formatted string)
 * @param description Description of what the example demonstrates
 * @returns A tool example object
 */
export function createToolExample(
  input: Record<string, unknown>,
  output: string,
  description: string
): ToolExample {
  return {
    input,
    output,
    description
  };
}

/**
 * Create tool metadata
 * 
 * @param metadata Tool metadata options
 * @returns Tool metadata configuration
 */
export function createToolMetadata(metadata: ToolMetadata): ToolMetadata {
  return metadata;
}

// Removed unused registerTool function (registration handled elsewhere)
