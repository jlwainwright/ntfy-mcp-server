# ntfy-mcp-server - Directory Structure

Generated on: 2025-03-21 10:39:58


```
ntfy-mcp-server
├── docs
    └── tree.md
├── logs
├── scripts
    ├── clean.ts
    └── tree.ts
├── src
    ├── config
    │   ├── envConfig.ts
    │   ├── index.ts
    │   └── mcpConfig.ts
    ├── mcp-server
    │   ├── resources
    │   │   └── echoResource
    │   │   │   ├── getEchoMessage.ts
    │   │   │   ├── index.ts
    │   │   │   ├── README.md
    │   │   │   └── types.ts
    │   ├── tools
    │   │   └── ntfyTool
    │   │   │   ├── index.ts
    │   │   │   ├── ntfyMessage.ts
    │   │   │   └── types.ts
    │   ├── utils
    │   │   └── registrationHelper.ts
    │   ├── README.md
    │   └── server.ts
    ├── services
    │   └── ntfy
    │   │   ├── constants.ts
    │   │   ├── errors.ts
    │   │   ├── index.ts
    │   │   ├── publisher.ts
    │   │   ├── subscriber.ts
    │   │   ├── types.ts
    │   │   └── utils.ts
    ├── types-global
    │   ├── errors.ts
    │   ├── mcp.ts
    │   └── tool.ts
    ├── utils
    │   ├── errorHandler.ts
    │   ├── idGenerator.ts
    │   ├── index.ts
    │   ├── logger.ts
    │   ├── rateLimiter.ts
    │   ├── requestContext.ts
    │   ├── sanitization.ts
    │   └── security.ts
    └── index.ts
├── .clinerules
├── .clinerules-code
├── .env.example
├── LICENSE
├── package-lock.json
├── package.json
├── README.md
├── tsconfig.json
└── tsconfig.scripts.json

```

_Note: This tree excludes files and directories matched by .gitignore and common patterns like node_modules._
