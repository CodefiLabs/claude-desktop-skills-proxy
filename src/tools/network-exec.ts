/**
 * Network Exec Tool
 *
 * Provides CLI command execution capabilities that bypass sandbox restrictions.
 * Implements command allowlist/blocklist checking with approval flow.
 *
 * SECURITY: Uses spawn() instead of exec() to prevent shell injection.
 * Arguments are passed as an array and validated for shell operators.
 */

import { spawn } from "node:child_process";
import * as path from "node:path";
import {
  isCommandAllowed,
  addCommandToAllowlist,
} from "../config/manager.js";

/**
 * Maximum output size (1MB each for stdout/stderr)
 */
const MAX_OUTPUT_SIZE = 1 * 1024 * 1024;

/**
 * Default timeout in milliseconds
 */
const DEFAULT_TIMEOUT = 60000;

/**
 * Shell operators that are not allowed in arguments
 * These could be used for shell injection if we weren't using spawn()
 * but we validate anyway as defense in depth
 */
const DANGEROUS_PATTERNS = [
  ";",      // Command separator
  "|",      // Pipe
  "&&",     // AND operator
  "||",     // OR operator
  ">",      // Output redirect
  "<",      // Input redirect
  "$(",     // Command substitution
  "`",      // Backtick command substitution
  "${",     // Variable expansion
];

/**
 * Input parameters for the network_exec tool
 */
export interface NetworkExecInput {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
  approve?: "once" | "always";
}

/**
 * Response from the network_exec tool
 */
export interface NetworkExecResponse {
  status: "success" | "needs_approval" | "error";
  // For needs_approval
  command?: string;
  message?: string;
  // For success
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  // For error
  error?: string;
}

/**
 * Validates that a string doesn't contain dangerous shell patterns
 */
function containsDangerousPatterns(value: string): string | null {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (value.includes(pattern)) {
      return pattern;
    }
  }
  return null;
}

/**
 * Validates all arguments for dangerous patterns
 */
function validateArgs(args: string[]): { valid: boolean; error?: string } {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const dangerousPattern = containsDangerousPatterns(arg);
    if (dangerousPattern) {
      return {
        valid: false,
        error: `Argument ${i + 1} contains dangerous shell operator "${dangerousPattern}". Shell operators are not allowed for security reasons.`,
      };
    }
  }
  return { valid: true };
}

/**
 * Truncates a string to the maximum size, adding a message if truncated
 */
function truncateOutput(output: string, maxSize: number): string {
  if (output.length <= maxSize) {
    return output;
  }
  const truncatedMsg = `\n\n[Output truncated: ${output.length} bytes exceeded ${maxSize} byte limit]`;
  return output.slice(0, maxSize - truncatedMsg.length) + truncatedMsg;
}

/**
 * Executes a command using spawn with timeout support
 * NOTE: Uses spawn() NOT exec() for security - prevents shell injection
 */
function spawnWithTimeout(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    timeout: number;
  }
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let killed = false;

    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      // Don't use shell - this is intentional for security
      shell: false,
    });

    // Set up timeout
    const timeoutId = setTimeout(() => {
      killed = true;
      child.kill("SIGTERM");
      // Force kill after 5 seconds if SIGTERM doesn't work
      setTimeout(() => {
        if (!child.killed) {
          child.kill("SIGKILL");
        }
      }, 5000);
    }, options.timeout);

    // Collect stdout with size limit
    child.stdout.on("data", (data: Buffer) => {
      if (stdout.length < MAX_OUTPUT_SIZE) {
        stdout += data.toString();
      }
    });

    // Collect stderr with size limit
    child.stderr.on("data", (data: Buffer) => {
      if (stderr.length < MAX_OUTPUT_SIZE) {
        stderr += data.toString();
      }
    });

    // Handle process errors (e.g., command not found)
    child.on("error", (error: Error) => {
      clearTimeout(timeoutId);
      reject(error);
    });

    // Handle process exit
    child.on("close", (code: number | null) => {
      clearTimeout(timeoutId);

      if (killed) {
        reject(new Error(`Command timed out after ${options.timeout}ms`));
        return;
      }

      resolve({
        exitCode: code ?? 1,
        stdout: truncateOutput(stdout, MAX_OUTPUT_SIZE),
        stderr: truncateOutput(stderr, MAX_OUTPUT_SIZE),
      });
    });
  });
}

/**
 * Main network exec function
 *
 * Flow:
 * 1. Extract command basename for allowlist checking
 * 2. Validate arguments for shell operators
 * 3. Check command against allowlist/blocklist
 * 4. Handle approval flow if needed
 * 5. Execute command using spawn
 * 6. Return result
 */
export async function networkExec(
  input: NetworkExecInput
): Promise<NetworkExecResponse> {
  try {
    // Step 1: Extract command name (handle full paths)
    const commandBasename = path.basename(input.command);
    const commandLower = commandBasename.toLowerCase();

    console.error(`[network_exec] Request: ${input.command} ${(input.args || []).join(" ")}`);

    // Step 2: Validate command itself doesn't contain dangerous patterns
    const commandDanger = containsDangerousPatterns(input.command);
    if (commandDanger) {
      console.error(`[network_exec] Command contains dangerous pattern: ${commandDanger}`);
      return {
        status: "error",
        error: `Command contains dangerous shell operator "${commandDanger}". Shell operators are not allowed for security reasons.`,
      };
    }

    // Step 3: Validate arguments for shell operators
    const args = input.args || [];
    const argsValidation = validateArgs(args);
    if (!argsValidation.valid) {
      console.error(`[network_exec] Args validation failed: ${argsValidation.error}`);
      return {
        status: "error",
        error: argsValidation.error,
      };
    }

    // Step 4: Check command against allowlist/blocklist
    const approvalStatus = await isCommandAllowed(input.command);

    // Step 5: Handle approval flow
    if (approvalStatus === "BLOCKED") {
      console.error(`[network_exec] Command blocked: ${commandLower}`);
      return {
        status: "error",
        error: `Command "${commandLower}" is blocked for security reasons and cannot be executed.`,
      };
    }

    if (approvalStatus === "NEEDS_APPROVAL") {
      // Check if user provided approval
      if (!input.approve) {
        console.error(`[network_exec] Command needs approval: ${commandLower}`);
        return {
          status: "needs_approval",
          command: commandLower,
          message: `Command "${commandLower}" is not in your allowlist. To proceed, call network_exec again with approve: "once" for this execution only, or approve: "always" to remember this command.`,
        };
      }

      // Handle "always" approval - add to allowlist
      if (input.approve === "always") {
        console.error(`[network_exec] Adding command to allowlist: ${commandLower}`);
        await addCommandToAllowlist(commandLower);
      } else {
        console.error(`[network_exec] One-time approval for command: ${commandLower}`);
      }
    }

    // Step 6: Execute command using spawn (NEVER use exec for security)
    const timeout = input.timeout ?? DEFAULT_TIMEOUT;
    const env = { ...process.env, ...input.env };

    console.error(
      `[network_exec] Executing: ${input.command} ${args.join(" ")} (timeout: ${timeout}ms, cwd: ${input.cwd || process.cwd()})`
    );

    const result = await spawnWithTimeout(input.command, args, {
      cwd: input.cwd,
      env,
      timeout,
    });

    console.error(
      `[network_exec] Completed: exit code ${result.exitCode}, stdout: ${result.stdout.length} bytes, stderr: ${result.stderr.length} bytes`
    );

    return {
      status: "success",
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    // Handle specific error types
    if (errorMessage.includes("timed out")) {
      console.error(`[network_exec] Command timed out`);
      return {
        status: "error",
        error: errorMessage,
      };
    }

    if (errorMessage.includes("ENOENT")) {
      console.error(`[network_exec] Command not found: ${input.command}`);
      return {
        status: "error",
        error: `Command "${input.command}" not found. Make sure it is installed and in your PATH.`,
      };
    }

    if (errorMessage.includes("EACCES")) {
      console.error(`[network_exec] Permission denied: ${input.command}`);
      return {
        status: "error",
        error: `Permission denied executing "${input.command}". Check file permissions.`,
      };
    }

    console.error(`[network_exec] Error: ${errorMessage}`);
    return {
      status: "error",
      error: errorMessage,
    };
  }
}

/**
 * MCP Tool definition for network_exec
 */
export const networkExecToolDefinition = {
  name: "network_exec",
  description:
    "Execute CLI commands with network access. Bypasses Claude Desktop sandbox for tools like yt-dlp, curl, ffmpeg, etc. Commands must be approved before first use.",
  inputSchema: {
    type: "object" as const,
    properties: {
      command: {
        type: "string",
        description: "The command to execute (e.g., 'yt-dlp', 'curl', 'ffmpeg')",
      },
      args: {
        type: "array",
        items: { type: "string" },
        description: "Command arguments as an array (e.g., ['--output', 'video.mp4', 'https://...'])",
      },
      cwd: {
        type: "string",
        description: "Working directory for the command (defaults to current directory)",
      },
      env: {
        type: "object",
        description: "Additional environment variables to set",
        additionalProperties: { type: "string" },
      },
      timeout: {
        type: "number",
        description: "Timeout in milliseconds (default: 60000, max: 600000)",
      },
      approve: {
        type: "string",
        enum: ["once", "always"],
        description:
          "Approve this command: 'once' for this execution only, 'always' to remember",
      },
    },
    required: ["command"],
  },
};
