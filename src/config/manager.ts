/**
 * Configuration Manager
 *
 * Handles loading and managing server configuration.
 * Implementation will be added in Phase 4.
 */

import { defaultConfig, type ProxyConfig } from "./defaults.js";

let currentConfig: ProxyConfig = { ...defaultConfig };

export function getConfig(): ProxyConfig {
  return { ...currentConfig };
}

export function setConfig(config: Partial<ProxyConfig>): void {
  currentConfig = { ...currentConfig, ...config };
}

export function resetConfig(): void {
  currentConfig = { ...defaultConfig };
}
