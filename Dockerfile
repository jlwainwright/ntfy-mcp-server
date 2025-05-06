# ---- Builder Stage ----
# Use the official Node.js image as a parent image for building
FROM node:22-slim AS builder

# Set working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json (or npm-shrinkwrap.json)
COPY package.json package-lock.json* ./

# Install dependencies needed for build (including devDependencies)
RUN npm install --production=false

# Copy the rest of the application source code
COPY . .

# Build the TypeScript application
RUN npm run build

# Remove development dependencies after build
RUN npm prune --production


# ---- Final Stage ----
# Use the Debian base image specified in the example
FROM debian:bullseye-slim

# Define build arguments for environment variables with defaults matching the original Dockerfile
ARG NTFY_BASE_URL=https://ntfy.sh
ARG NTFY_DEFAULT_TOPIC=ATLAS
ARG LOG_FILE_DIR=/app/logs
ARG NTFY_API_KEY=placeholder_api_key_for_testing

# Set environment variables
# Use noninteractive frontend for apt commands
# Set PATH to include the user's local bin directory
# Set Node environment to production
# Pass through build arguments
ENV DEBIAN_FRONTEND=noninteractive \
    PATH="/home/service-user/.local/bin:${PATH}" \
    NODE_ENV=production \
    NTFY_BASE_URL=${NTFY_BASE_URL} \
    NTFY_DEFAULT_TOPIC=${NTFY_DEFAULT_TOPIC} \
    LOG_FILE_DIR=${LOG_FILE_DIR} \
    NTFY_API_KEY=placeholder_api_key_for_testing

# Install necessary packages: curl (for NodeSource script), wget, software-properties-common, nodejs, and mcp-proxy
# Create user/group and directories
# Clean up apt cache and temporary files
RUN groupadd --system --gid 1987 service-user && \
    useradd --system --uid 1987 --gid service-user -m service-user && \
    mkdir -p /home/service-user/.local/bin /app ${LOG_FILE_DIR} && \
    chown -R service-user:service-user /home/service-user /app ${LOG_FILE_DIR} && \
    apt-get update && \
    apt-get install -y --no-install-recommends curl wget software-properties-common ca-certificates && \
    rm -rf /var/lib/apt/lists/* && \
    # Install Node.js v22 using NodeSource script (as per example)
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    # Install mcp-proxy globally
    npm install -g mcp-proxy@2.10.6 && \
    npm cache clean --force && \
    # Clean up downloaded packages and lists
    apt-get purge -y --auto-remove curl wget software-properties-common && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Set working directory
WORKDIR /app

# Copy necessary artifacts from builder stage
# Copy package.json for runtime identification
COPY --from=builder --chown=service-user:service-user /app/package.json ./package.json
# Copy production node_modules
COPY --from=builder --chown=service-user:service-user /app/node_modules ./node_modules
# Copy the built application code (dist directory)
COPY --from=builder --chown=service-user:service-user /app/dist ./dist

# Switch to the non-root user
USER service-user

# Expose port if necessary (uncomment if needed)
# EXPOSE 3000

# Define the command to run the application using mcp-proxy and the built JS file
# This retains the correct command from the original Dockerfile
CMD ["mcp-proxy", "node", "dist/index.js"]
