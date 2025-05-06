# ntfy-mcp-server - Directory Structure

Generated on: 2025-05-06 00:27:19


```
ntfy-mcp-server
├── docs
    └── tree.md
├── scripts
    ├── clean.ts
    ├── fetch-openapi-spec.ts
    ├── make-executable.ts
    └── tree.ts
├── src
    ├── config
    │   └── index.ts
    ├── mcp-server
    │   ├── resources
    │   │   └── ntfyResource
    │   │   │   ├── getNtfyTopic.ts
    │   │   │   ├── index.ts
    │   │   │   └── types.ts
    │   ├── tools
    │   │   └── ntfyTool
    │   │   │   ├── index.ts
    │   │   │   ├── ntfyMessage.ts
    │   │   │   └── types.ts
    │   ├── utils
    │   │   └── registrationHelper.ts
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
    ├── .DS_Store
    └── index.ts
├── Dockerfile
├── env.json
├── LICENSE
├── package-lock.json
├── package.json
├── README.md
├── repomix.config.json
├── smithery.yaml
└── tsconfig.json

```

_Note: This tree excludes files and directories matched by .gitignore and common patterns like node_modules._
