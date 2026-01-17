/**
 * Configuration Module
 *
 * Re-exports all configuration-related types and functions.
 */

export {
  type ProxyConfig,
  type ApprovalStatus,
  type ApprovalAction,
  type FileServerConfig,
  DEFAULT_BLOCKED_DOMAINS,
  DEFAULT_BLOCKED_COMMANDS,
  DEFAULT_FILE_SERVER_CONFIG,
  defaultConfig,
  createDefaultConfig,
} from "./defaults.js";

export {
  loadConfig,
  saveConfig,
  getConfig,
  resetConfig,
  isDomainAllowed,
  isCommandAllowed,
  addDomainToAllowlist,
  addCommandToAllowlist,
  removeDomainFromAllowlist,
  removeCommandFromAllowlist,
  extractDomain,
  extractCommand,
  getConfigPath,
  clearConfigCache,
  getFileServerConfig,
} from "./manager.js";
