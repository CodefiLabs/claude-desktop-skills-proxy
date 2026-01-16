/**
 * Configuration Manager
 *
 * Handles loading, saving, and managing proxy server configuration.
 * Persists allowlist/blocklist to ~/.config/mcp-proxy/config.json
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  createDefaultConfig,
  DEFAULT_BLOCKED_COMMANDS,
  DEFAULT_BLOCKED_DOMAINS,
  type ApprovalStatus,
  type ProxyConfig,
} from "./defaults.js";

/**
 * Path to the configuration file
 */
const CONFIG_DIR = path.join(os.homedir(), ".config", "mcp-proxy");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

/**
 * In-memory cache of the current configuration
 */
let currentConfig: ProxyConfig | null = null;

/**
 * Ensures the config directory exists
 */
async function ensureConfigDir(): Promise<void> {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
  } catch (error) {
    // Directory might already exist, that's fine
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error;
    }
  }
}

/**
 * Loads configuration from disk
 * Creates default config if file doesn't exist
 */
export async function loadConfig(): Promise<ProxyConfig> {
  try {
    const data = await fs.readFile(CONFIG_FILE, "utf-8");
    const parsed = JSON.parse(data) as Partial<ProxyConfig>;

    // Merge with defaults to ensure all fields exist
    // User's allowed lists are preserved, blocked lists are merged with defaults
    currentConfig = {
      allowedDomains: parsed.allowedDomains ?? [],
      blockedDomains: mergeUnique(
        DEFAULT_BLOCKED_DOMAINS,
        parsed.blockedDomains ?? []
      ),
      allowedCommands: parsed.allowedCommands ?? [],
      blockedCommands: mergeUnique(
        DEFAULT_BLOCKED_COMMANDS,
        parsed.blockedCommands ?? []
      ),
    };

    console.error(`[config] Loaded configuration from ${CONFIG_FILE}`);
    return { ...currentConfig };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      // Config file doesn't exist, create with defaults
      console.error(
        "[config] No config file found, creating with defaults"
      );
      currentConfig = createDefaultConfig();
      await saveConfig(currentConfig);
      return { ...currentConfig };
    }

    // Other error (permission denied, invalid JSON, etc.)
    console.error("[config] Error loading config:", error);
    currentConfig = createDefaultConfig();
    return { ...currentConfig };
  }
}

/**
 * Saves configuration to disk
 */
export async function saveConfig(config: ProxyConfig): Promise<void> {
  await ensureConfigDir();

  const data = JSON.stringify(config, null, 2);
  await fs.writeFile(CONFIG_FILE, data, "utf-8");
  currentConfig = { ...config };

  console.error(`[config] Saved configuration to ${CONFIG_FILE}`);
}

/**
 * Gets the current configuration (loads from disk if not cached)
 */
export async function getConfig(): Promise<ProxyConfig> {
  if (currentConfig === null) {
    return loadConfig();
  }
  return { ...currentConfig };
}

/**
 * Resets configuration to defaults and saves to disk
 */
export async function resetConfig(): Promise<void> {
  currentConfig = createDefaultConfig();
  await saveConfig(currentConfig);
  console.error("[config] Configuration reset to defaults");
}

/**
 * Checks if a domain matches a pattern
 * Supports wildcard patterns like "*.example.com" and "10.*"
 */
function matchesPattern(value: string, pattern: string): boolean {
  // Convert wildcard pattern to regex
  const regexPattern = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&") // Escape special regex chars
    .replace(/\*/g, ".*"); // Convert * to .*

  const regex = new RegExp(`^${regexPattern}$`, "i");
  return regex.test(value);
}

/**
 * Checks if a value matches any pattern in a list
 */
function matchesAnyPattern(value: string, patterns: string[]): boolean {
  return patterns.some((pattern) => matchesPattern(value, pattern));
}

/**
 * Extracts the hostname from a URL or returns the string if already a hostname
 */
export function extractDomain(urlOrDomain: string): string {
  try {
    // Try to parse as URL
    const url = new URL(urlOrDomain);
    return url.hostname;
  } catch {
    // Not a URL, assume it's already a domain/hostname
    return urlOrDomain.toLowerCase();
  }
}

/**
 * Extracts the base command name from a command string
 * Handles paths and arguments
 */
export function extractCommand(commandString: string): string {
  // Split by whitespace and take the first part
  const parts = commandString.trim().split(/\s+/);
  const fullCommand = parts[0] ?? "";

  // Extract just the command name from a path
  const commandName = path.basename(fullCommand);

  return commandName.toLowerCase();
}

/**
 * Checks if a domain is allowed
 * Returns approval status based on allowlist/blocklist
 */
export async function isDomainAllowed(
  urlOrDomain: string
): Promise<ApprovalStatus> {
  const config = await getConfig();
  const domain = extractDomain(urlOrDomain);

  // Check blocklist first (security takes priority)
  if (matchesAnyPattern(domain, config.blockedDomains)) {
    console.error(`[config] Domain BLOCKED: ${domain}`);
    return "BLOCKED";
  }

  // Check allowlist
  if (matchesAnyPattern(domain, config.allowedDomains)) {
    console.error(`[config] Domain ALLOWED: ${domain}`);
    return "ALLOWED";
  }

  // Not in either list, needs approval
  console.error(`[config] Domain NEEDS_APPROVAL: ${domain}`);
  return "NEEDS_APPROVAL";
}

/**
 * Checks if a command is allowed
 * Returns approval status based on allowlist/blocklist
 */
export async function isCommandAllowed(
  commandString: string
): Promise<ApprovalStatus> {
  const config = await getConfig();
  const command = extractCommand(commandString);

  // Check blocklist first (security takes priority)
  if (matchesAnyPattern(command, config.blockedCommands)) {
    console.error(`[config] Command BLOCKED: ${command}`);
    return "BLOCKED";
  }

  // Check allowlist
  if (matchesAnyPattern(command, config.allowedCommands)) {
    console.error(`[config] Command ALLOWED: ${command}`);
    return "ALLOWED";
  }

  // Not in either list, needs approval
  console.error(`[config] Command NEEDS_APPROVAL: ${command}`);
  return "NEEDS_APPROVAL";
}

/**
 * Adds a domain to the allowlist and persists
 */
export async function addDomainToAllowlist(
  urlOrDomain: string
): Promise<void> {
  const config = await getConfig();
  const domain = extractDomain(urlOrDomain);

  // Check if already in blocklist (cannot override security blocks)
  if (matchesAnyPattern(domain, config.blockedDomains)) {
    console.error(
      `[config] Cannot add blocked domain to allowlist: ${domain}`
    );
    throw new Error(
      `Domain "${domain}" is in the security blocklist and cannot be added to allowlist`
    );
  }

  // Check if already in allowlist
  if (!config.allowedDomains.includes(domain)) {
    config.allowedDomains.push(domain);
    await saveConfig(config);
    console.error(`[config] Added domain to allowlist: ${domain}`);
  } else {
    console.error(`[config] Domain already in allowlist: ${domain}`);
  }
}

/**
 * Adds a command to the allowlist and persists
 */
export async function addCommandToAllowlist(
  commandString: string
): Promise<void> {
  const config = await getConfig();
  const command = extractCommand(commandString);

  // Check if already in blocklist (cannot override security blocks)
  if (matchesAnyPattern(command, config.blockedCommands)) {
    console.error(
      `[config] Cannot add blocked command to allowlist: ${command}`
    );
    throw new Error(
      `Command "${command}" is in the security blocklist and cannot be added to allowlist`
    );
  }

  // Check if already in allowlist
  if (!config.allowedCommands.includes(command)) {
    config.allowedCommands.push(command);
    await saveConfig(config);
    console.error(`[config] Added command to allowlist: ${command}`);
  } else {
    console.error(`[config] Command already in allowlist: ${command}`);
  }
}

/**
 * Removes a domain from the allowlist
 */
export async function removeDomainFromAllowlist(
  urlOrDomain: string
): Promise<void> {
  const config = await getConfig();
  const domain = extractDomain(urlOrDomain);

  const index = config.allowedDomains.indexOf(domain);
  if (index !== -1) {
    config.allowedDomains.splice(index, 1);
    await saveConfig(config);
    console.error(`[config] Removed domain from allowlist: ${domain}`);
  }
}

/**
 * Removes a command from the allowlist
 */
export async function removeCommandFromAllowlist(
  commandString: string
): Promise<void> {
  const config = await getConfig();
  const command = extractCommand(commandString);

  const index = config.allowedCommands.indexOf(command);
  if (index !== -1) {
    config.allowedCommands.splice(index, 1);
    await saveConfig(config);
    console.error(`[config] Removed command from allowlist: ${command}`);
  }
}

/**
 * Gets the config file path (for display purposes)
 */
export function getConfigPath(): string {
  return CONFIG_FILE;
}

/**
 * Merges two arrays and returns unique values
 */
function mergeUnique<T>(arr1: T[], arr2: T[]): T[] {
  return [...new Set([...arr1, ...arr2])];
}

/**
 * Clears the in-memory config cache (useful for testing)
 */
export function clearConfigCache(): void {
  currentConfig = null;
}
