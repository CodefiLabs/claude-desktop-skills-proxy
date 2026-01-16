/**
 * Validation Utilities
 *
 * Provides input validation functions for the proxy server.
 * Implementation will be expanded in Phase 4.
 */

/**
 * Validates a URL string
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates HTTP method
 */
export function isValidHttpMethod(method: string): boolean {
  const validMethods = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
  return validMethods.includes(method.toUpperCase());
}

/**
 * Sanitizes headers to remove potentially dangerous ones
 */
export function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const dangerousHeaders = ["host", "connection", "transfer-encoding"];
  const sanitized: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (!dangerousHeaders.includes(key.toLowerCase())) {
      sanitized[key] = value;
    }
  }

  return sanitized;
}
