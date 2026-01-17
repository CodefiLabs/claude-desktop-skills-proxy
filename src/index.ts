#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  proxyFetch,
  proxyFetchToolDefinition,
  type ProxyFetchInput,
} from "./tools/proxy-fetch.js";
import {
  networkExec,
  networkExecToolDefinition,
  type NetworkExecInput,
} from "./tools/network-exec.js";
import {
  readFile,
  readFileToolDefinition,
  type ReadFileInput,
} from "./tools/read-file.js";
import {
  fileServe,
  fileServeToolDefinition,
  type FileServeInput,
  fileServerStatus,
  fileServerStatusToolDefinition,
  fileServeCleanup,
  fileServeCleanupToolDefinition,
  type FileServeCleanupInput,
  shutdownFileServer,
} from "./tools/file-server.js";

const server = new Server(
  {
    name: "mcp-proxy",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      proxyFetchToolDefinition,
      networkExecToolDefinition,
      readFileToolDefinition,
      fileServeToolDefinition,
      fileServerStatusToolDefinition,
      fileServeCleanupToolDefinition,
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "proxy_fetch": {
      const input = args as unknown as ProxyFetchInput;
      const result = await proxyFetch(input);

      // Format response as MCP tool result
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    case "network_exec": {
      const input = args as unknown as NetworkExecInput;
      const result = await networkExec(input);

      // Format response as MCP tool result
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    case "read_file": {
      const input = args as unknown as ReadFileInput;
      const result = await readFile(input);

      // Format response as MCP tool result
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    case "file_serve": {
      const input = args as unknown as FileServeInput;
      const result = await fileServe(input);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }

    case "file_server_status": {
      const result = await fileServerStatus();
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }

    case "file_serve_cleanup": {
      const input = args as unknown as FileServeCleanupInput;
      const result = await fileServeCleanup(input);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// Shutdown handlers for clean exit
process.on("SIGINT", () => {
  shutdownFileServer();
  process.exit(0);
});

process.on("SIGTERM", () => {
  shutdownFileServer();
  process.exit(0);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mcp-proxy server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
