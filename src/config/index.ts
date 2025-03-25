/**
 * Configuration Index Module
 * 
 * This module serves as the central entrypoint for all configuration-related
 * functionality. It provides a unified API for accessing configuration values
 * from various sources (environment variables, package.json, MCP servers config).
 */
import { promises as fs } from "fs";
import path from "path";
import { BaseErrorCode, McpError } from "../types-global/errors.js";
import { ErrorHandler } from "../utils/errorHandler.js";
import { logger } from "../utils/logger.js";
import { sanitizeInput } from "../utils/security.js";
import { envConfig, EnvironmentConfig, getEnvironment, getLogLevel, getNtfyConfig, getRateLimit, getSecurity } from './envConfig.js';
import { enabledMcpServers, getEnabledServers, getMcpConfig, isServerEnabled, loadMcpConfig, McpServerConfig, McpServersConfig } from './mcpConfig.js';

// Create a module-level logger for configuration
const configLogger = logger.createChildLogger({
  module: 'ConfigManager'
});

// Default package info in case we can't load it
const DEFAULT_PACKAGE_INFO = {
  name: "ntfy-mcp-server",
  version: "0.0.0"
};

// Maximum file size for package.json (5MB) to prevent potential DoS
const MAX_FILE_SIZE = 5 * 1024 * 1024;

/**
 * Unified application configuration interface
 */
export interface AppConfig {
  // Server info
  serverName: string;
  serverVersion: string;
  
  // Environment configuration 
  environment: string;
  logLevel: string;
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
  security: Record<string, any>;
  
  // Ntfy configuration
  ntfy: {
    apiKey: string;
    baseUrl: string;
    defaultTopic: string;
    requestTimeout: number;
    maxRetries: number;
    maxMessageSize: number;
  };
  
  // MCP servers configuration
  mcpServers: Record<string, McpServerConfig>;
  
  // Metadata
  configLoadTime: string;
}

/**
 * Load and parse the package.json file to get application information
 * 
 * @returns Promise resolving to object containing name and version from package.json
 */
async function loadPackageInfo(): Promise<{ name: string; version: string }> {
  try {
    // Get package info
    const pkgPath = path.resolve(process.cwd(), 'package.json');
    const sanitizedPath = sanitizeInput.path(pkgPath);
    
    configLogger.debug(`Loading package info from ${sanitizedPath}`);
    
    // Get file stats to check size before reading
    const stats = await fs.stat(sanitizedPath);
    
    // Check file size to prevent DoS attacks
    if (stats.size > MAX_FILE_SIZE) {
      throw new McpError(
        BaseErrorCode.VALIDATION_ERROR,
        `package.json file is too large (${stats.size} bytes)`,
        { path: sanitizedPath, maxSize: MAX_FILE_SIZE }
      );
    }
    
    // Use async file operations
    const pkgContent = await fs.readFile(sanitizedPath, 'utf-8');
    const pkg = JSON.parse(pkgContent);
    
    // Validate expected fields
    if (!pkg.name || typeof pkg.name !== 'string') {
      throw new McpError(
        BaseErrorCode.VALIDATION_ERROR,
        'Invalid package.json: missing or invalid name field',
        { path: sanitizedPath }
      );
    }
    
    if (!pkg.version || typeof pkg.version !== 'string') {
      throw new McpError(
        BaseErrorCode.VALIDATION_ERROR,
        'Invalid package.json: missing or invalid version field',
        { path: sanitizedPath }
      );
    }
    
    configLogger.info(`Loaded application info`, {
      name: pkg.name,
      version: pkg.version
    });
    
    return {
      name: pkg.name,
      version: pkg.version
    };
  } catch (error) {
    // Log the error but don't rethrow
    ErrorHandler.handleError(error, {
      context: { path: path.resolve(process.cwd(), 'package.json') },
      operation: "loading package info"
    });
    
    configLogger.error(`Failed to load package.json, using default values`, {
      error: error instanceof Error ? error.message : String(error)
    });
    
    // Return default values
    return DEFAULT_PACKAGE_INFO;
  }
}

// Cache for package info
let cachedPackageInfo: { name: string; version: string } | null = null;

/**
 * Get package info, loading it on first call
 */
export async function getPackageInfo(): Promise<{ name: string; version: string }> {
  if (!cachedPackageInfo) {
    cachedPackageInfo = await loadPackageInfo();
  }
  return cachedPackageInfo;
}

/**
 * Build the full application configuration object
 * 
 * This function lazy-loads all configuration components when called.
 */
async function buildAppConfig(): Promise<AppConfig> {
  const packageInfo = await getPackageInfo();
  const env = envConfig();
  const servers = await enabledMcpServers();
  
  configLogger.info(`Building unified application configuration`, {
    environment: env.environment,
    packageName: packageInfo.name,
    mcpServerCount: Object.keys(servers).length
  });
  
  return {
    // Server info
    serverName: packageInfo.name,
    serverVersion: packageInfo.version,
    
    // Environment configuration
    environment: env.environment,
    logLevel: env.logLevel,
    rateLimit: env.rateLimit,
    security: env.security,
    
    // Ntfy configuration
    ntfy: env.ntfy,
    
    // MCP servers configuration
    mcpServers: servers,
    
    // Metadata
    configLoadTime: new Date().toISOString()
  };
}

// Cache for config
let cachedAppConfig: AppConfig | null = null;

/**
 * Get the complete application configuration
 * 
 * @returns Promise resolving to the full application configuration
 */
export async function getConfig(): Promise<AppConfig> {
  if (!cachedAppConfig) {
    cachedAppConfig = await buildAppConfig();
    
    // Log configuration summary
    configLogger.info(`Configuration loaded successfully`, {
      serverName: cachedAppConfig.serverName,
      version: cachedAppConfig.serverVersion,
      environment: cachedAppConfig.environment,
      enabledServers: Object.keys(cachedAppConfig.mcpServers)
    });
  }
  return cachedAppConfig;
}

// Export types and functions from the sub-modules
export type { EnvironmentConfig, McpServerConfig, McpServersConfig };
export { 
  // Environment config
  envConfig, getEnvironment, getLogLevel, getRateLimit, getSecurity, getNtfyConfig,
  
  // MCP servers config
  enabledMcpServers, getEnabledServers, getMcpConfig, isServerEnabled, loadMcpConfig
};
