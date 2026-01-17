/**
 * Shared file path security blocklist
 * Used by both read_file tool and file server
 */
import * as path from "node:path";

/**
 * Sensitive paths that should never be read or served
 */
export const BLOCKED_FILE_PATHS = [
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
  // Additional patterns for file serving
  /^\/proc\//,           // Linux proc filesystem
  /^\/sys\//,            // Linux sys filesystem
  /^\/dev\//,            // Device files
];

/**
 * Checks if a file path matches any blocked pattern
 * Uses dual normalization to prevent path traversal attacks
 */
export function isBlockedPath(filePath: string): boolean {
  const normalized = path.normalize(filePath);
  const resolved = path.resolve(filePath);

  for (const pattern of BLOCKED_FILE_PATHS) {
    if (pattern.test(normalized) || pattern.test(resolved)) {
      return true;
    }
  }

  return false;
}
