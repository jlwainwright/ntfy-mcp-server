# Ntfy MCP Server

[![TypeScript](https://img.shields.io/badge/TypeScript-5.8.3-blue.svg)](https://www.typescriptlang.org/)
[![Model Context Protocol](https://img.shields.io/badge/MCP-1.10.2-green.svg)](https://modelcontextprotocol.io/)
[![Version](https://img.shields.io/badge/Version-1.0.6-blue.svg)](https://github.com/cyanheads/ntfy-mcp-server/releases)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Status](https://img.shields.io/badge/Status-Stable-green.svg)](https://github.com/cyanheads/ntfy-mcp-server)
[![GitHub](https://img.shields.io/github/stars/cyanheads/ntfy-mcp-server?style=social)](https://github.com/cyanheads/ntfy-mcp-server)

An MCP (Model Context Protocol) server designed to interact with the [ntfy](https://ntfy.sh/) push notification service. It enables LLMs and AI agents to both send notifications to your devices and receive/fetch messages from ntfy topics with extensive customization options.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Configuration](#configuration)
- [Project Structure](#project-structure)
- [Tools](#tools)
- [Resources](#resources)
- [Use Cases](#use-cases)
- [Available Scripts](#available-scripts)
- [Contributing](#contributing)
- [License](#license)

## Overview

This server implements the Model Context Protocol (MCP), enabling standardized communication between LLMs and external systems. Specifically, it provides an interface to the ntfy push notification service.

[Ntfy](https://ntfy.sh/) is a simple HTTP-based pub-sub notification service that allows you to send notifications to your phone or desktop via simple HTTP requests. With this MCP server, LLM agents like Claude can send notifications to you through ntfy without needing direct HTTP access.

```
┌───────────┐      ┌───────────┐      ┌───────────┐      ┌─────────┐
│ LLM Agent │ ◄────▶│ Ntfy MCP  │ ◄────▶│ Ntfy      │ ◄────▶│ Your    │
│ (Claude)  │      │ Server    │      │ Service   │      │ Devices │
└───────────┘      └───────────┘      └───────────┘      └─────────┘
     │                    │                    │                │
     │ send_ntfy          │ Bidirectional      │ Push/Pull      │
     │ get_messages       │ Communication      │ Messages       │
     │ poll_topic         │                    │                │
     │ subscribe_ntfy     │                    │                │
```

## Features

- **MCP Server Implementation:** Built using the `@modelcontextprotocol/sdk` for seamless integration with LLM agents.
- **Bidirectional Ntfy Integration:** Provides tools for both sending and receiving notifications:
  - **Sending:** `send_ntfy` tool with support for:
  - Message prioritization (1-5 levels)
  - Emoji tags
  - Clickable actions and buttons
  - File attachments
  - Delayed delivery
  - Markdown formatting
  - **Receiving:** `get_messages`, `poll_topic`, and `subscribe_ntfy` tools with support for:
  - Historical message retrieval with filtering
  - Stateful polling for new messages
  - Real-time subscription management
  - Message filtering by priority, tags, content, etc.
- **Resource Exposure:** Exposes the configured default ntfy topic as an MCP resource.
- **TypeScript:** Modern, type-safe codebase with comprehensive type definitions.
- **Structured Logging:** Uses `winston` and `winston-daily-rotate-file` for detailed and rotatable logs.
- **Configuration Management:** Uses `dotenv` for easy environment-based configuration.
- **Utility Scripts:** Includes scripts for cleaning build artifacts and generating directory structure documentation.
- **Error Handling & Security:** Implements robust error handling, input sanitization (`sanitize-html`), and security filters (`xss-filters`).

## Quick Start

1. **Prerequisites:**

   - Node.js (v16+)
   - npm or yarn
   - An MCP-compatible client (Claude Desktop, Cline, etc.)

2. **Install and Run:**

   ```bash
   # Option 1: Install via npm
   npm install -g ntfy-mcp-server

   # Option 2: Clone repository and build
   git clone https://github.com/cyanheads/ntfy-mcp-server.git
   cd ntfy-mcp-server
   npm install
   npm run build

   # Create .env file (optional but recommended)
   cp .env.example .env
   # Edit .env to set NTFY_DEFAULT_TOPIC

   # Start the server
   npm start
   ```

3. **Add to MCP Client Settings:** Add the server to your MCP client settings file (see [Configuration](#configuration))

4. **Use the tool:** Once connected, you can use the `send_ntfy` tool to send notifications.

## Installation

### Option 1: NPM Package (Recommended)

1. **Install the package globally:**

   ```bash
   npm install -g ntfy-mcp-server
   ```

   This will install the server globally, making it available as a command-line tool.

2. **Or install locally in your project:**

   ```bash
   npm install ntfy-mcp-server
   ```

   When installed locally, you can run it via npx or from node.

### Option 2: From Source

1. **Clone the repository:**

   ```bash
   git clone https://github.com/cyanheads/ntfy-mcp-server.git
   cd ntfy-mcp-server
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Build the project:**
   ```bash
   npm run build
   ```

## Configuration

### Environment Variables

Create a `.env` file in the project root based on `.env.example`:

```bash
# Ntfy Configuration
NTFY_BASE_URL=https://ntfy.sh  # Optional: Base URL of your ntfy instance
NTFY_DEFAULT_TOPIC=your_default_topic # Optional: Default topic if none specified in requests
NTFY_USERNAME=your_username # Optional: Username for authentication (if using private ntfy server)
NTFY_PASSWORD=your_password # Optional: Password for authentication (if using private ntfy server)

# Receiving Capabilities Configuration
NTFY_MAX_SUBSCRIPTIONS=10 # Optional: Maximum concurrent subscriptions (default: 10)
NTFY_POLL_STATE_TTL=3600000 # Optional: Polling state TTL in milliseconds (default: 1 hour)
NTFY_DEFAULT_MESSAGE_LIMIT=100 # Optional: Default message limit for retrieval (default: 100)
NTFY_SUBSCRIPTION_TIMEOUT=300000 # Optional: Subscription timeout in milliseconds (default: 5 minutes)

# Application Configuration
LOG_LEVEL=info # Optional: Logging level (debug, info, warn, error)
NODE_ENV=development # Optional: Environment (development, production)
```

### MCP Client Settings

#### For Cline VSCode Extension

Add the following configuration to your Cline MCP settings file (usually located at `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json` on macOS):

##### If installed globally:

```json
{
  "mcpServers": {
    "ntfy": {
      "command": "ntfy-mcp-server",
      "env": {
        "NTFY_BASE_URL": "https://ntfy.sh",
        "NTFY_DEFAULT_TOPIC": "your_default_topic",
        "LOG_LEVEL": "info",
        "NODE_ENV": "production"
      }
    }
  }
}
```

##### If installed from source:

```json
{
  "mcpServers": {
    "ntfy": {
      "command": "node",
      "args": ["/path/to/ntfy-mcp-server/dist/index.js"],
      "env": {
        "NTFY_BASE_URL": "https://ntfy.sh",
        "NTFY_DEFAULT_TOPIC": "your_default_topic",
        "LOG_LEVEL": "info",
        "NODE_ENV": "production"
      }
    }
  }
}
```

#### For Claude Desktop App

Add the following configuration to your Claude Desktop config file (usually located at `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

##### If installed globally:

```json
{
  "mcpServers": {
    "ntfy": {
      "command": "ntfy-mcp-server",
      "env": {
        "NTFY_BASE_URL": "https://ntfy.sh",
        "NTFY_DEFAULT_TOPIC": "your_default_topic",
        "LOG_LEVEL": "info",
        "NODE_ENV": "production"
      }
    }
  }
}
```

##### If installed from source:

```json
{
  "mcpServers": {
    "ntfy": {
      "command": "node",
      "args": ["/path/to/ntfy-mcp-server/dist/index.js"],
      "env": {
        "NTFY_BASE_URL": "https://ntfy.sh",
        "NTFY_DEFAULT_TOPIC": "your_default_topic",
        "LOG_LEVEL": "info",
        "NODE_ENV": "production"
      }
    }
  }
}
```

_For source installation, replace `/path/to/ntfy-mcp-server/dist/index.js` with the actual absolute path to the built server file._
_Adjust `env` variables as needed for your setup._

### Ntfy Setup

1. **Install the ntfy app** on your devices from [ntfy.sh](https://ntfy.sh/app) or the app stores
2. **Subscribe to your topic** in the app
3. **Use the same topic** in your MCP server configuration

## Project Structure

```
.
├── .env.example            # Example environment variables
├── .gitignore              # Git ignore patterns
├── LICENSE                 # Project license (Apache-2.0)
├── package.json            # Project metadata and dependencies
├── tsconfig.json           # TypeScript compiler configuration
├── docs/
│   └── tree.md             # Auto-generated directory structure
├── logs/                   # Runtime logs (created automatically)
├── scripts/                # Utility scripts
│   ├── clean.ts            # Cleans build artifacts and logs
│   └── tree.ts             # Generates the docs/tree.md file
└── src/                    # Source code
    ├── index.ts            # Main server entry point
    ├── config/             # Configuration loading
    ├── mcp-server/         # MCP server logic, tools, and resources
    │   ├── resources/      # MCP resource implementations
    │   ├── tools/          # MCP tool implementations
    │   └── utils/          # MCP-specific utilities
    ├── services/           # External service integrations (ntfy)
    ├── types-global/       # Global type definitions
    └── utils/              # General utility functions
```

## Tools

### `send_ntfy`

Sends a notification message via the ntfy service.

#### Key Arguments:

| Parameter    | Type     | Required | Description                                                                  |
| ------------ | -------- | -------- | ---------------------------------------------------------------------------- |
| `topic`      | string   | Yes      | The ntfy topic to publish to.                                                |
| `message`    | string   | Yes      | The main content of the notification (max 4096 bytes).                       |
| `title`      | string   | No       | Notification title (max 250 bytes).                                          |
| `tags`       | string[] | No       | Emojis or keywords for categorization (e.g., `["warning", "robot"]`). Max 5. |
| `priority`   | integer  | No       | Message priority: 1=min, 2=low, 3=default, 4=high, 5=max.                    |
| `click`      | string   | No       | URL to open when the notification is clicked.                                |
| `actions`    | array    | No       | Action buttons (view, http, broadcast). Max 3.                               |
| `attachment` | object   | No       | URL and name of an attachment.                                               |
| `email`      | string   | No       | Email address to forward the notification to.                                |
| `delay`      | string   | No       | Delay delivery (e.g., `30m`, `1h`, `tomorrow`).                              |
| `cache`      | string   | No       | Cache duration (e.g., `10m`, `1h`, `1d`).                                    |
| `firebase`   | string   | No       | Firebase Cloud Messaging (FCM) topic to forward to.                          |
| `id`         | string   | No       | Unique ID for the message.                                                   |
| `expires`    | string   | No       | Message expiration (e.g., `10m`, `1h`, `1d`).                                |
| `markdown`   | boolean  | No       | Set to `true` to enable markdown formatting in the message.                  |
| `baseUrl`    | string   | No       | Override the default ntfy server URL for this request.                       |

#### Example Usage:

```javascript
// Basic notification
{
  "topic": "alerts",
  "message": "The task has completed successfully."
}

// Advanced notification
{
  "topic": "alerts",
  "title": "System Alert",
  "message": "CPU usage has exceeded 90% for 5 minutes.",
  "tags": ["warning", "computer"],
  "priority": 4,
  "click": "https://server-dashboard.example.com",
  "actions": [
    {
      "id": "view",
      "label": "View Details",
      "action": "view",
      "url": "https://server-dashboard.example.com/cpu"
    },
    {
      "id": "restart",
      "label": "Restart Service",
      "action": "http",
      "url": "https://api.example.com/restart-service",
      "method": "POST",
      "headers": {
        "Authorization": "Bearer token123"
      }
    }
  ],
  "markdown": true
}
```

#### Example Response:

```json
{
  "success": true,
  "id": "5ZFY362156Sa",
  "topic": "ATLAS",
  "time": 1743064235,
  "expires": 1743496235,
  "message": "This is a test message from the README verification process",
  "title": "README Testing"
}
```

### `get_messages`

Retrieves historical messages from an ntfy topic with filtering and pagination support.

#### Key Arguments:

| Parameter    | Type     | Required | Description                                                                  |
| ------------ | -------- | -------- | ---------------------------------------------------------------------------- |
| `topic`      | string   | Yes      | The ntfy topic to fetch messages from.                                       |
| `since`      | string   | No       | Timestamp, duration, or message ID to start from (e.g., "1h", "2023-12-01T10:00:00Z"). |
| `limit`      | number   | No       | Maximum number of messages to retrieve (default: 100, max: 1000).           |
| `scheduled`  | boolean  | No       | Include scheduled/delayed messages.                                          |
| `filters`    | object   | No       | Message filtering options.                                                   |
| `baseUrl`    | string   | No       | Override the default ntfy server URL for this request.                       |

#### Filter Options:

| Parameter    | Type     | Description                                                                  |
| ------------ | -------- | ---------------------------------------------------------------------------- |
| `priority`   | string   | Filter by priority (comma-separated list, e.g., "4,5" for high and max).    |
| `tags`       | string   | Filter by tags (comma-separated list).                                      |
| `title`      | string   | Filter by message title (substring match).                                  |
| `message`    | string   | Filter by message content (substring match).                                |
| `id`         | string   | Filter by specific message ID.                                              |

#### Example Usage:

```javascript
// Get recent messages
{
  "topic": "alerts",
  "since": "1h",
  "limit": 50
}

// Get messages with filters
{
  "topic": "alerts",
  "since": "2023-12-01T00:00:00Z",
  "filters": {
    "priority": "4,5",
    "tags": "warning,error"
  }
}
```

### `poll_topic`

Polls an ntfy topic for new messages since the last poll, maintaining state between requests to avoid duplicates.

#### Key Arguments:

| Parameter     | Type     | Required | Description                                                                  |
| ------------- | -------- | -------- | ---------------------------------------------------------------------------- |
| `topic`       | string   | Yes      | The ntfy topic to poll.                                                      |
| `resetState`  | boolean  | No       | Reset the polling state and start from the beginning.                       |
| `limit`       | number   | No       | Maximum number of new messages to retrieve (default: 100, max: 1000).       |
| `interval`    | number   | No       | Polling interval hint in milliseconds (1s to 1h, default: 30s).            |
| `baseUrl`     | string   | No       | Override the default ntfy server URL for this request.                       |

#### Example Usage:

```javascript
// First poll (gets recent messages)
{
  "topic": "alerts"
}

// Subsequent polls (only new messages)
{
  "topic": "alerts",
  "limit": 10
}

// Reset polling state
{
  "topic": "alerts",
  "resetState": true
}
```

#### Example Response:

```json
{
  "success": true,
  "topic": "alerts",
  "newMessageCount": 2,
  "newMessages": [
    {
      "id": "abc123",
      "time": 1743064235,
      "event": "message",
      "topic": "alerts",
      "message": "New alert message",
      "title": "Alert"
    }
  ],
  "pollState": {
    "lastMessageId": "abc123",
    "lastPollTime": 1743064240000,
    "totalMessagesSeen": 15,
    "nextPollRecommended": 1743064270000
  },
  "timestamp": "2023-12-01T10:30:40.000Z"
}
```

### `subscribe_ntfy`

Manages real-time subscriptions to ntfy topics with support for starting, stopping, checking status, and listing subscriptions.

#### Key Arguments:

| Parameter        | Type     | Required | Description                                                                  |
| ---------------- | -------- | -------- | ---------------------------------------------------------------------------- |
| `topic`          | string   | Yes*     | The ntfy topic to subscribe to (required for start action).                 |
| `action`         | string   | Yes      | Action to perform: "start", "stop", "status", or "list".                    |
| `subscriptionId` | string   | No*      | Subscription ID (required for stop/status actions).                         |
| `options`        | object   | No       | Subscription configuration options.                                          |
| `baseUrl`        | string   | No       | Override the default ntfy server URL for this request.                       |

#### Subscription Options:

| Parameter    | Type     | Description                                                                  |
| ------------ | -------- | ---------------------------------------------------------------------------- |
| `poll`       | boolean  | Use polling instead of streaming connection.                                |
| `since`      | string   | Start from specific timestamp, duration, or message ID.                     |
| `scheduled`  | boolean  | Include scheduled/delayed messages.                                         |
| `timeout`    | number   | Subscription timeout in milliseconds (1s to 1h).                           |
| `filters`    | object   | Message filtering options (same as get_messages).                           |

#### Example Usage:

```javascript
// Start a new subscription
{
  "topic": "alerts",
  "action": "start",
  "options": {
    "since": "1h",
    "filters": {
      "priority": "4,5"
    }
  }
}

// Stop a subscription
{
  "action": "stop",
  "subscriptionId": "sub_abc123"
}

// Check subscription status
{
  "action": "status",
  "subscriptionId": "sub_abc123"
}

// List all subscriptions
{
  "action": "list"
}
```

#### Example Response:

```json
{
  "success": true,
  "action": "start",
  "subscriptionId": "sub_abc123",
  "topic": "alerts",
  "status": "active",
  "message": "Subscription started for topic \"alerts\". Messages will be received in real-time.",
  "timestamp": "2023-12-01T10:30:40.000Z"
}
```

## Resources

### Direct Resources

#### `ntfy://default`

- **Description:** Returns the default ntfy topic configured in the server's environment variables (`NTFY_DEFAULT_TOPIC`).
- **Usage:** Useful for clients to discover the primary topic without needing prior configuration.
- **Example:** An LLM agent can access this resource to automatically use the default topic when sending notifications.
- **Example Response:**
  ```json
  {
    "defaultTopic": "ATLAS",
    "timestamp": "2025-03-27T08:30:25.619Z",
    "requestUri": "ntfy://default",
    "requestId": "0da963d0-30e0-4dbc-bb77-4bf2dee14484"
  }
  ```

### Resource Templates

#### `ntfy://{topic}`

- **Description:** Returns information about a specific ntfy topic.
- **Parameters:** `topic` - The name of the ntfy topic.
- **Usage:** For querying information about topics other than the default.
- **Example Response:**
  ```json
  {
    "topic": "ATLAS",
    "timestamp": "2025-03-27T08:30:30.038Z",
    "requestUri": "ntfy://ATLAS",
    "requestId": "31baf1df-278f-4fdb-860d-019f156a72b0"
  }
  ```

## Use Cases

### Sending Notifications (LLM → User)
1. **Long-running Task Notifications** - Get notified when tasks like database backups, code generation, or data processing complete.
2. **Scheduled Reminders** - Set delayed notifications for future events or reminders.
3. **Alert Systems** - Set up critical alerts for monitoring systems or important events.
4. **Mobile Notifications from LLMs** - Allow LLMs to send notifications directly to your phone.
5. **Multi-step Process Updates** - Receive updates as different stages of a complex process complete.

### Receiving Messages (User → LLM)
1. **Message History Analysis** - Retrieve and analyze past notifications for patterns or trends.
2. **Interactive Monitoring** - Poll topics for new messages and respond automatically.
3. **Real-time Event Processing** - Subscribe to topics and process incoming messages in real-time.
4. **Notification Acknowledgment** - Check if critical alerts were received and acknowledged.
5. **Cross-device Communication** - Use ntfy as a communication bridge between different systems.

### Usage Examples

#### Basic Notification

```
<use_mcp_tool>
<server_name>ntfy-mcp-server</server_name>
<tool_name>send_ntfy</tool_name>
<arguments>
{
  "topic": "updates",
  "title": "Task Completed",
  "message": "Your requested data analysis has finished",
  "tags": ["check"]
}
</arguments>
</use_mcp_tool>
```

#### Rich Notification with Actions

```
<use_mcp_tool>
<server_name>ntfy-mcp-server</server_name>
<tool_name>send_ntfy</tool_name>
<arguments>
{
  "topic": "alerts",
  "title": "Critical Error Detected",
  "message": "The application has encountered a critical error.\n\n**Error Code**: E123\n\n**Details**: Database connection failed",
  "tags": ["warning", "skull"],
  "priority": 5,
  "actions": [
    {
      "id": "view",
      "label": "View Logs",
      "action": "view",
      "url": "https://logs.example.com"
    },
    {
      "id": "restart",
      "label": "Restart Service",
      "action": "http",
      "url": "https://api.example.com/restart",
      "method": "POST"
    }
  ],
  "markdown": true
}
</arguments>
</use_mcp_tool>
```

#### Retrieving Historical Messages

```
<use_mcp_tool>
<server_name>ntfy-mcp-server</server_name>
<tool_name>get_messages</tool_name>
<arguments>
{
  "topic": "alerts",
  "since": "1h",
  "filters": {
    "priority": "4,5"
  },
  "limit": 20
}
</arguments>
</use_mcp_tool>
```

#### Polling for New Messages

```
<use_mcp_tool>
<server_name>ntfy-mcp-server</server_name>
<tool_name>poll_topic</tool_name>
<arguments>
{
  "topic": "system-events",
  "limit": 10
}
</arguments>
</use_mcp_tool>
```

#### Managing Real-time Subscriptions

```
<use_mcp_tool>
<server_name>ntfy-mcp-server</server_name>
<tool_name>subscribe_ntfy</tool_name>
<arguments>
{
  "topic": "live-updates",
  "action": "start",
  "options": {
    "filters": {
      "priority": "3,4,5"
    },
    "since": "now"
  }
}
</arguments>
</use_mcp_tool>
```

## Available Scripts

- `npm run build`: Compiles the TypeScript source code to JavaScript in the `dist/` directory.
- `npm run clean`: Removes the `dist/` directory and cleans the contents of the `logs/` directory.
- `npm run rebuild`: Runs `clean` and then `build`.
- `npm run tree`: Generates a directory tree representation in `docs/tree.md`.
- `npm start`: Runs the compiled server from the `dist/` directory using Node.js.
- `npm run watch`: Tails the combined log file (`logs/combined.log`) for real-time monitoring.

## Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues to improve the project.

1.  Fork the repository.
2.  Create a feature branch (`git checkout -b feature/your-feature`).
3.  Commit your changes (`git commit -m 'Add some feature'`).
4.  Push to the branch (`git push origin feature/your-feature`).
5.  Create a new Pull Request.

For bugs and feature requests, please create an issue on the repository.

### Development Best Practices

- Follow TypeScript best practices and maintain strong typing
- Write tests for new functionality
- Keep dependencies up to date
- Follow the existing code style and patterns

## License

This project is licensed under the Apache-2.0 License. See the [LICENSE](LICENSE) file for details.

## Acknowledgements

- [ntfy.sh](https://ntfy.sh/) for providing the notification service
- [Model Context Protocol](https://modelcontextprotocol.io/) for enabling LLM-to-tool connections
- All contributors and users of this project

---

<div align="center">
Built with the Model Context Protocol
</div>
