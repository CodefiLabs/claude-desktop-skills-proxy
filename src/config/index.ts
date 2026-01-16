/**
 * Configuration Module
 *
 * Re-exports all configuration-related types and functions.
 */

export {
  type ProxyConfig,
  type ApprovalStatus,
  type ApprovalAction,
  DEFAULT_BLOCKED_DOMAINS,
  DEFAULT_BLOCKED_COMMANDS,
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
} from "./manager.js";
