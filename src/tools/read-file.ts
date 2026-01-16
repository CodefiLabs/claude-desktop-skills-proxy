import * as fs from "fs/promises";
import * as path from "path";

export interface ReadFileInput {
  path: string;
  encoding?: "utf8" | "base64";
  maxSize?: number; // in bytes, default 5MB
}

export interface ReadFileResult {
  status: "success" | "error";
  path?: string;
  content?: string;
  size?: number;
  encoding?: string;
  error?: string;
}

// Sensitive paths that should never be read
const BLOCKED_PATHS = [
  /^\/etc\/shadow$/,
  /^\/etc\/passwd$/,
  /^\/etc\/sudoers/,
  /^\/etc\/ssh\//,
  /\/\.ssh\//,
  /\/\.aws\//,
  /\/\.gnupg\//,
  /\/\.config\/gcloud\//,
  /\/\.kube\/config$/,
  /\/\.npmrc$/,
  /\/\.netrc$/,
  /\/\.env$/,
  /\/\.env\./,
  /\/credentials\.json$/,
  /\/service[_-]?account.*\.json$/i,
  /\/token\.json$/,
];

const DEFAULT_MAX_SIZE = 5 * 1024 * 1024; // 5MB

function isBlockedPath(filePath: string): boolean {
  const normalized = path.normalize(filePath);
  const resolved = path.resolve(filePath);

  for (const pattern of BLOCKED_PATHS) {
    if (pattern.test(normalized) || pattern.test(resolved)) {
      return true;
    }
  }

  return false;
}

export async function readFile(input: ReadFileInput): Promise<ReadFileResult> {
  const { path: filePath, encoding = "utf8", maxSize = DEFAULT_MAX_SIZE } = input;

  // Validate input
  if (!filePath || typeof filePath !== "string") {
    return {
      status: "error",
      error: "Missing or invalid 'path' parameter",
    };
  }

  // Security check
  if (isBlockedPath(filePath)) {
    console.error(`[read_file] BLOCKED: Attempt to read sensitive file: ${filePath}`);
    return {
      status: "error",
      error: "Access denied: This file path is blocked for security reasons",
    };
  }

  try {
    // Check if file exists and get stats
    const stats = await fs.stat(filePath);

    if (!stats.isFile()) {
      return {
        status: "error",
        error: `Path is not a file: ${filePath}`,
      };
    }

    // Check file size
    if (stats.size > maxSize) {
      return {
        status: "error",
        error: `File too large: ${stats.size} bytes exceeds maximum of ${maxSize} bytes`,
      };
    }

    // Read file
    let content: string;
    if (encoding === "base64") {
      const buffer = await fs.readFile(filePath);
      content = buffer.toString("base64");
    } else {
      content = await fs.readFile(filePath, "utf8");
    }

    console.error(`[read_file] SUCCESS: Read ${stats.size} bytes from ${filePath}`);

    return {
      status: "success",
      path: filePath,
      content,
      size: stats.size,
      encoding,
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

    console.error(`[read_file] ERROR: ${err.message}`);
    return {
      status: "error",
      error: `Failed to read file: ${err.message}`,
    };
  }
}

export const readFileToolDefinition = {
  name: "read_file",
  description:
    "Read a file from the host filesystem. Useful for reading files created by network_exec (e.g., yt-dlp subtitle files). Some sensitive paths are blocked for security.",
  inputSchema: {
    type: "object" as const,
    properties: {
      path: {
        type: "string",
        description: "Absolute path to the file to read",
      },
      encoding: {
        type: "string",
        enum: ["utf8", "base64"],
        description: "Encoding for the file content (default: utf8, use base64 for binary files)",
      },
      maxSize: {
        type: "number",
        description: "Maximum file size in bytes (default: 5MB)",
      },
    },
    required: ["path"],
  },
};
