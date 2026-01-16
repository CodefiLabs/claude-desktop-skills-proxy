/**
 * Security Utilities
 *
 * Provides security-related functions for the proxy server.
 * Implementation will be expanded in Phase 4.
 */

import { getConfig } from "../config/manager.js";

/**
 * Checks if a URL is allowed based on configuration
 */
export function isUrlAllowed(url: string): boolean {
  const config = getConfig();

  // Check blocked patterns first
  for (const pattern of config.blockedPatterns) {
    const regex = new RegExp(pattern, "i");
    if (regex.test(url)) {
      return false;
    }
  }

  // Check allowed patterns
  for (const pattern of config.allowedPatterns) {
    const regex = new RegExp(pattern, "i");
    if (regex.test(url)) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if a URL points to localhost
 */
export function isLocalhostUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}

/**
 * Validates that a request meets security requirements
 */
export function validateRequest(url: string): { valid: boolean; error?: string } {
  const config = getConfig();

  if (!isUrlAllowed(url)) {
    return { valid: false, error: "URL is not allowed by configuration" };
  }

  if (isLocalhostUrl(url) && !config.allowLocalhost) {
    return { valid: false, error: "Localhost connections are not allowed" };
  }

  return { valid: true };
}
