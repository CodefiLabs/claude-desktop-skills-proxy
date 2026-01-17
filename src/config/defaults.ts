/**
 * Default Configuration
 *
 * Provides default values and security blocklists for the proxy server.
 * These blocklists protect against SSRF attacks and dangerous command execution.
 */

/**
 * Configuration for the file server feature
 */
export interface FileServerConfig {
  /** Whether the file server feature is enabled */
  enabled: boolean;
  /** Port for the local HTTP server */
  port: number;
  /** Directory where files are served from */
  serveDirectory: string;
  /** Maximum file size in bytes */
  maxFileSize: number;
  /** Default expiry time in minutes for served files */
  defaultExpiryMinutes: number;
  /** File extensions allowed to be served */
  allowedExtensions: string[];
}

/**
 * Configuration structure for the MCP proxy server
 */
export interface ProxyConfig {
  /** Domains explicitly allowed (user-approved) */
  allowedDomains: string[];
  /** Domains that are always blocked (security) */
  blockedDomains: string[];
  /** Commands explicitly allowed (user-approved) */
  allowedCommands: string[];
  /** Commands that are always blocked (security) */
  blockedCommands: string[];
  /** File server configuration */
  fileServer?: FileServerConfig;
}

/**
 * Approval status for a resource request
 */
export type ApprovalStatus = "ALLOWED" | "BLOCKED" | "NEEDS_APPROVAL";

/**
 * Approval action from user
 */
export type ApprovalAction = "always" | "once" | "deny";

/**
 * Default blocked domains for security
 * Includes localhost, loopback, link-local, and private IP ranges
 * These prevent SSRF attacks against internal infrastructure
 */
export const DEFAULT_BLOCKED_DOMAINS: string[] = [
  // Localhost variants
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",

  // AWS metadata endpoint (critical SSRF target)
  "169.254.169.254",

  // Link-local addresses
  "169.254.*",

  // Private IP ranges (Class A)
  "10.*",

  // Private IP ranges (Class B) - 172.16.0.0 to 172.31.255.255
  "172.16.*",
  "172.17.*",
  "172.18.*",
  "172.19.*",
  "172.20.*",
  "172.21.*",
  "172.22.*",
  "172.23.*",
  "172.24.*",
  "172.25.*",
  "172.26.*",
  "172.27.*",
  "172.28.*",
  "172.29.*",
  "172.30.*",
  "172.31.*",

  // Private IP ranges (Class C)
  "192.168.*",

  // Docker bridge network
  "172.17.0.*",

  // Kubernetes internal
  "10.0.0.*",
  "10.96.*",

  // IPv6 loopback (already have ::1 and [::1] above)
  // IPv6 link-local addresses
  "fe80:*",
  "[fe80:*",

  // IPv6 unique local addresses (private IPv6)
  "fc00:*",
  "[fc00:*",
  "fd00:*",
  "[fd00:*",

  // IPv6-mapped IPv4 addresses (can be used to bypass IPv4 blocks)
  "::ffff:*",
  "[::ffff:*",
];

/**
 * Default blocked commands for security
 * These commands could cause data loss or privilege escalation
 */
export const DEFAULT_BLOCKED_COMMANDS: string[] = [
  // Destructive file operations
  "rm",
  "rmdir",
  "del",

  // Privilege escalation
  "sudo",
  "su",
  "doas",

  // Permission changes
  "chmod",
  "chown",
  "chgrp",

  // File movement (can overwrite)
  "mv",

  // System modification
  "mkfs",
  "fdisk",
  "dd",
  "format",

  // Package managers with install (can run arbitrary code)
  // Note: We allow read-only operations but block installs
  "apt-get",
  "apt",
  "yum",
  "dnf",
  "pacman",
  "brew",

  // Shell spawning
  "bash",
  "sh",
  "zsh",
  "fish",
  "csh",
  "tcsh",

  // Network tools that could be abused
  "nc",
  "netcat",
  "ncat",
  "telnet",

  // Credential access
  "passwd",

  // Process control
  "kill",
  "killall",
  "pkill",
];

/**
 * Default configuration with empty allowlists and security blocklists
 */
export const defaultConfig: ProxyConfig = {
  allowedDomains: [],
  blockedDomains: [...DEFAULT_BLOCKED_DOMAINS],
  allowedCommands: [],
  blockedCommands: [...DEFAULT_BLOCKED_COMMANDS],
};

/**
 * Creates a fresh copy of the default configuration
 */
export function createDefaultConfig(): ProxyConfig {
  return {
    allowedDomains: [],
    blockedDomains: [...DEFAULT_BLOCKED_DOMAINS],
    allowedCommands: [],
    blockedCommands: [...DEFAULT_BLOCKED_COMMANDS],
    fileServer: { ...DEFAULT_FILE_SERVER_CONFIG },
  };
}

/**
 * Default file server configuration
 */
export const DEFAULT_FILE_SERVER_CONFIG: FileServerConfig = {
  enabled: true,
  port: 8765,
  serveDirectory: "/tmp/mcp-proxy-files",
  maxFileSize: 104857600, // 100MB
  defaultExpiryMinutes: 60,
  allowedExtensions: [
    "png",
    "jpg",
    "jpeg",
    "gif",
    "webp",
    "svg",
    "mp4",
    "webm",
    "mp3",
    "wav",
    "pdf",
    "json",
    "txt",
  ],
};
