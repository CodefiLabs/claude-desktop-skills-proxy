/**
 * File Server Tools
 * MCP tools for serving files via HTTP with public tunnel access
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  getFileRegistry,
  initializeFileRegistry,
} from "../server/file-registry.js";
import { getHttpServer, startHttpServer } from "../server/http-server.js";
import { getTunnelManager, startTunnel, stopTunnel } from "../server/tunnel-manager.js";
import { isBlockedPath } from "../utils/file-blocklist.js";

// ============================================================================
// file_serve Tool
// ============================================================================

export interface FileServeInput {
  path: string;
  filename?: string;
  expiry_minutes?: number;
  content_type?: string;
}

export interface FileServeResponse {
  status: "success" | "error";
  url?: string;
  local_url?: string;
  file_id?: string;
  expires_at?: string;
  error?: string;
  warning?: string;
}

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

export async function fileServe(input: FileServeInput): Promise<FileServeResponse> {
  const filePath = input.path;

  // Validate input
  if (!filePath || typeof filePath !== "string") {
    return {
      status: "error",
      error: "Missing or invalid 'path' parameter",
    };
  }

  // Security check
  if (isBlockedPath(filePath)) {
    console.error(`[file_serve] BLOCKED: ${filePath}`);
    return {
      status: "error",
      error: "Access denied: This file path is blocked for security reasons",
    };
  }

  try {
    // Verify file exists and check size
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) {
      return {
        status: "error",
        error: `Path is not a file: ${filePath}`,
      };
    }

    if (stats.size > MAX_FILE_SIZE) {
      return {
        status: "error",
        error: `File too large: ${stats.size} bytes exceeds maximum of ${MAX_FILE_SIZE} bytes (100MB)`,
      };
    }

    // Initialize registry if needed
    const registry = await initializeFileRegistry();

    // Register file
    const registration = await registry.register(filePath, {
      filename: input.filename,
      contentType: input.content_type,
      expiryMinutes: input.expiry_minutes,
    });

    // Start HTTP server if needed
    const httpServer = getHttpServer();
    let port: number;
    if (!httpServer.isRunning()) {
      port = await startHttpServer();
    } else {
      port = httpServer.getPort()!;
    }

    const ext = path.extname(registration.servePath);
    const localUrl = `http://localhost:${port}/files/${registration.id}${ext}`;

    // Start tunnel if needed
    const tunnelManager = getTunnelManager();
    let publicUrl: string | undefined;
    let warning: string | undefined;

    try {
      if (!tunnelManager.isRunning()) {
        publicUrl = await startTunnel(port);
      } else {
        publicUrl = tunnelManager.getPublicUrl()!;
      }
      publicUrl = `${publicUrl}/files/${registration.id}${ext}`;
    } catch (tunnelError) {
      const msg = tunnelError instanceof Error ? tunnelError.message : String(tunnelError);
      console.error(`[file_serve] Tunnel error: ${msg}`);
      warning = `Tunnel unavailable: ${msg}. Use local_url for testing.`;
    }

    console.error(
      `[file_serve] SUCCESS: ${registration.id} -> ${publicUrl || localUrl}`
    );

    return {
      status: "success",
      url: publicUrl,
      local_url: localUrl,
      file_id: registration.id,
      expires_at: registration.expiresAt.toISOString(),
      warning,
    };
  } catch (error) {
    const err = error as NodeJS.ErrnoException;

    if (err.code === "ENOENT") {
      return {
        status: "error",
        error: `File not found: ${filePath}`,
      };
    }

    if (err.code === "EACCES") {
      return {
        status: "error",
        error: `Permission denied: ${filePath}`,
      };
    }

    console.error(`[file_serve] Error: ${err.message}`);
    return {
      status: "error",
      error: `Failed to serve file: ${err.message}`,
    };
  }
}

export const fileServeToolDefinition = {
  name: "file_serve",
  description:
    "Register a file for HTTP serving and return a public URL. Use this to make generated files (images, videos, etc.) accessible via URL for display in Claude Desktop.",
  inputSchema: {
    type: "object" as const,
    properties: {
      path: {
        type: "string",
        description: "Absolute path to the file on the host filesystem",
      },
      filename: {
        type: "string",
        description: "Optional: Override the filename in the URL",
      },
      expiry_minutes: {
        type: "number",
        description: "Minutes until the URL expires (default: 60)",
      },
      content_type: {
        type: "string",
        description: "Optional: Override MIME type detection (e.g., 'image/png')",
      },
    },
    required: ["path"],
  },
};

// ============================================================================
// file_server_status Tool
// ============================================================================

export interface FileServerStatusResponse {
  server_running: boolean;
  server_port?: number;
  server_uptime_seconds?: number;
  tunnel_running: boolean;
  tunnel_url?: string;
  tunnel_uptime_seconds?: number;
  files_served: number;
  total_size_bytes: number;
}

export async function fileServerStatus(): Promise<FileServerStatusResponse> {
  const httpServer = getHttpServer();
  const tunnelManager = getTunnelManager();
  const registry = getFileRegistry();
  const stats = registry.getStats();

  return {
    server_running: httpServer.isRunning(),
    server_port: httpServer.getPort() ?? undefined,
    server_uptime_seconds: httpServer.getUptime() ?? undefined,
    tunnel_running: tunnelManager.isRunning(),
    tunnel_url: tunnelManager.getPublicUrl() ?? undefined,
    tunnel_uptime_seconds: tunnelManager.getUptime() ?? undefined,
    files_served: stats.filesServed,
    total_size_bytes: stats.totalSize,
  };
}

export const fileServerStatusToolDefinition = {
  name: "file_server_status",
  description: "Check the status of the file server and tunnel",
  inputSchema: {
    type: "object" as const,
    properties: {},
    required: [],
  },
};

// ============================================================================
// file_serve_cleanup Tool
// ============================================================================

export interface FileServeCleanupInput {
  file_id?: string;
  all?: boolean;
}

export interface FileServeCleanupResponse {
  status: "success" | "error";
  removed?: number;
  error?: string;
}

export async function fileServeCleanup(
  input: FileServeCleanupInput
): Promise<FileServeCleanupResponse> {
  const registry = getFileRegistry();

  try {
    if (input.all) {
      const count = await registry.clearAll();
      console.error(`[file_serve_cleanup] Cleared all ${count} files`);
      return {
        status: "success",
        removed: count,
      };
    }

    if (input.file_id) {
      const removed = await registry.removeFile(input.file_id);
      if (removed) {
        console.error(`[file_serve_cleanup] Removed file: ${input.file_id}`);
        return {
          status: "success",
          removed: 1,
        };
      } else {
        return {
          status: "error",
          error: `File not found: ${input.file_id}`,
        };
      }
    }

    return {
      status: "error",
      error: "Must specify either file_id or all: true",
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[file_serve_cleanup] Error: ${msg}`);
    return {
      status: "error",
      error: msg,
    };
  }
}

export const fileServeCleanupToolDefinition = {
  name: "file_serve_cleanup",
  description: "Remove served files. Specify file_id to remove one, or all: true to remove all.",
  inputSchema: {
    type: "object" as const,
    properties: {
      file_id: {
        type: "string",
        description: "ID of specific file to remove",
      },
      all: {
        type: "boolean",
        description: "Set to true to remove all served files",
      },
    },
    required: [],
  },
};

// ============================================================================
// Shutdown handler for clean exit
// ============================================================================

export function shutdownFileServer(): void {
  console.error("[file_serve] Shutting down...");
  stopTunnel();
  getFileRegistry().shutdown();
  // Note: HTTP server will be stopped when process exits
}
