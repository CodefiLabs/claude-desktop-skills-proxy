/**
 * Default Configuration
 *
 * Provides default values for the proxy server configuration.
 */

export interface ProxyConfig {
  /** Maximum request timeout in milliseconds */
  timeout: number;
  /** Maximum response body size in bytes */
  maxBodySize: number;
  /** Allowed URL patterns (regex strings) */
  allowedPatterns: string[];
  /** Blocked URL patterns (regex strings) */
  blockedPatterns: string[];
  /** Whether to allow localhost connections */
  allowLocalhost: boolean;
}

export const defaultConfig: ProxyConfig = {
  timeout: 30000,
  maxBodySize: 10 * 1024 * 1024, // 10MB
  allowedPatterns: [".*"],
  blockedPatterns: [],
  allowLocalhost: true,
};
