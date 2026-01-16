# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
npm run build      # Compile TypeScript and make dist/index.js executable
npm run watch      # Watch mode for development
```

## Testing

```bash
# Test with MCP Inspector (interactive tool testing)
npx @modelcontextprotocol/inspector node dist/index.js

# Test MCP server responds to initialize
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | node dist/index.js
```

## Architecture

This is an MCP (Model Context Protocol) server that runs **outside** Claude Desktop's sandbox, providing tools that can make unrestricted network requests and run CLI commands.

### Core Flow

```
Claude Desktop (sandboxed, network restricted)
    ↓ stdio (JSON-RPC)
mcp-proxy server (unsandboxed, full network)
    ↓
Internet / CLI tools
```

### Key Components

- **`src/index.ts`** - MCP server entry point, registers tools via `ListToolsRequestSchema` and handles calls via `CallToolRequestSchema`
- **`src/tools/`** - Tool implementations:
  - `proxy-fetch.ts` - HTTP requests with domain allowlist/blocklist
  - `network-exec.ts` - CLI execution using `spawn()` (secure, no shell)
  - `read-file.ts` - Read files created by network_exec
- **`src/config/`** - Persistent configuration at `~/.config/mcp-proxy/config.json`:
  - `manager.ts` - Load/save config, check allowlists
  - `defaults.ts` - Security blocklists (SSRF protection, dangerous commands)
- **`src/utils/`** - Rate limiting, validation, security checks

### Approval Flow

Tools return `{ status: "needs_approval" }` for unknown domains/commands. Caller retries with `approve: "once"` or `approve: "always"` (persists to config).

### Security Model

- **Blocklists are hardcoded** - Cannot be overridden (localhost, private IPs, rm/sudo/etc.)
- **Allowlists are user-controlled** - Persisted in config file
- **`network_exec` uses `spawn()`** - Arguments passed as array, shell operators rejected in validation

## Code Conventions

- All logging goes to `console.error()` (stdio transport reserves stdout for JSON-RPC)
- ES modules with `.js` extensions in imports
- Shebang `#!/usr/bin/env node` in index.ts for npx compatibility
