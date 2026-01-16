/**
 * Security Utilities
 *
 * Provides security-related functions for the proxy server.
 * Uses the config manager for allowlist/blocklist checking.
 */

import {
  isDomainAllowed,
  isCommandAllowed,
  extractDomain,
} from "../config/manager.js";
import type { ApprovalStatus } from "../config/defaults.js";

/**
 * Checks if a URL is allowed based on configuration
 * @returns ApprovalStatus indicating if the URL is allowed, blocked, or needs approval
 */
export async function isUrlAllowed(url: string): Promise<ApprovalStatus> {
  return isDomainAllowed(url);
}

/**
 * Checks if a URL points to localhost or private network
 */
export function isLocalhostUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "[::1]" ||
      hostname.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}

/**
 * Checks if a URL points to a private IP range
 */
export function isPrivateIp(url: string): boolean {
  const domain = extractDomain(url);

  // Check common private ranges
  const privatePatterns = [
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
    /^192\.168\./,
    /^169\.254\./,
    /^127\./,
  ];

  return privatePatterns.some((pattern) => pattern.test(domain));
}

/**
 * Validates that a request URL meets security requirements
 * @returns Object with status and optional error message
 */
export async function validateRequest(
  url: string
): Promise<{ status: ApprovalStatus; error?: string }> {
  const status = await isDomainAllowed(url);

  if (status === "BLOCKED") {
    const domain = extractDomain(url);
    return {
      status: "BLOCKED",
      error: `Domain "${domain}" is blocked for security reasons`,
    };
  }

  if (status === "NEEDS_APPROVAL") {
    const domain = extractDomain(url);
    return {
      status: "NEEDS_APPROVAL",
      error: `Domain "${domain}" requires approval`,
    };
  }

  return { status: "ALLOWED" };
}

/**
 * Validates that a command meets security requirements
 * @returns Object with status and optional error message
 */
export async function validateCommand(
  command: string
): Promise<{ status: ApprovalStatus; error?: string }> {
  const status = await isCommandAllowed(command);

  if (status === "BLOCKED") {
    return {
      status: "BLOCKED",
      error: `Command is blocked for security reasons`,
    };
  }

  if (status === "NEEDS_APPROVAL") {
    return {
      status: "NEEDS_APPROVAL",
      error: `Command requires approval`,
    };
  }

  return { status: "ALLOWED" };
}
