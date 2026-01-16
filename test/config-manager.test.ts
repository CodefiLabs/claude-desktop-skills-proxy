/**
 * Config Manager Tests
 *
 * Tests for the configuration management system.
 * Run with: npx tsx test/config-manager.test.ts
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
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
  clearConfigCache,
  getConfigPath,
} from "../src/config/manager.js";
import {
  DEFAULT_BLOCKED_COMMANDS,
  DEFAULT_BLOCKED_DOMAINS,
} from "../src/config/defaults.js";

const TEST_CONFIG_DIR = path.join(os.homedir(), ".config", "mcp-proxy");
const TEST_CONFIG_FILE = path.join(TEST_CONFIG_DIR, "config.json");

// Store original config if it exists
let originalConfig: string | null = null;

async function setup() {
  console.error("\n=== Setting up tests ===");
  // Backup original config if it exists
  try {
    originalConfig = await fs.readFile(TEST_CONFIG_FILE, "utf-8");
    console.error("Backed up existing config");
  } catch {
    originalConfig = null;
    console.error("No existing config to backup");
  }

  // Clear cache before tests
  clearConfigCache();

  // Remove test config
  try {
    await fs.unlink(TEST_CONFIG_FILE);
  } catch {
    // File might not exist
  }
}

async function teardown() {
  console.error("\n=== Tearing down tests ===");
  // Restore original config
  if (originalConfig !== null) {
    await fs.writeFile(TEST_CONFIG_FILE, originalConfig, "utf-8");
    console.error("Restored original config");
  } else {
    // Remove test config
    try {
      await fs.unlink(TEST_CONFIG_FILE);
      console.error("Removed test config");
    } catch {
      // File might not exist
    }
  }
  clearConfigCache();
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
  console.error(`  PASS: ${message}`);
}

async function testExtractDomain() {
  console.error("\n--- Test: extractDomain ---");

  // Test full URLs
  assert(
    extractDomain("https://example.com/path") === "example.com",
    "Extracts domain from HTTPS URL"
  );
  assert(
    extractDomain("http://api.openai.com:8080/v1") === "api.openai.com",
    "Extracts domain from HTTP URL with port"
  );
  assert(
    extractDomain("https://user:pass@example.com") === "example.com",
    "Extracts domain from URL with auth"
  );

  // Test bare domains
  assert(
    extractDomain("example.com") === "example.com",
    "Returns domain as-is when no protocol"
  );
  assert(
    extractDomain("EXAMPLE.COM") === "example.com",
    "Lowercases domain"
  );

  // Test IP addresses
  assert(
    extractDomain("http://192.168.1.1") === "192.168.1.1",
    "Extracts IP from URL"
  );
  assert(
    extractDomain("127.0.0.1") === "127.0.0.1",
    "Returns IP as-is"
  );
}

async function testExtractCommand() {
  console.error("\n--- Test: extractCommand ---");

  // Test simple commands
  assert(extractCommand("curl") === "curl", "Extracts simple command");
  assert(
    extractCommand("curl https://example.com") === "curl",
    "Extracts command with args"
  );

  // Test paths
  assert(
    extractCommand("/usr/bin/curl -X GET") === "curl",
    "Extracts command from full path"
  );
  assert(
    extractCommand("./script.sh arg1") === "script.sh",
    "Extracts command from relative path"
  );

  // Test case sensitivity
  assert(extractCommand("CURL") === "curl", "Lowercases command");
  assert(
    extractCommand("/usr/bin/RM -rf") === "rm",
    "Lowercases command from path"
  );
}

async function testLoadConfigCreatesDefault() {
  console.error("\n--- Test: loadConfig creates default ---");
  clearConfigCache();

  const config = await loadConfig();

  assert(Array.isArray(config.allowedDomains), "Has allowedDomains array");
  assert(Array.isArray(config.blockedDomains), "Has blockedDomains array");
  assert(Array.isArray(config.allowedCommands), "Has allowedCommands array");
  assert(Array.isArray(config.blockedCommands), "Has blockedCommands array");

  // Check that defaults are applied
  assert(
    config.blockedDomains.includes("localhost"),
    "Blocked domains include localhost"
  );
  assert(
    config.blockedDomains.includes("127.0.0.1"),
    "Blocked domains include 127.0.0.1"
  );
  assert(
    config.blockedDomains.includes("169.254.169.254"),
    "Blocked domains include AWS metadata endpoint"
  );
  assert(
    config.blockedCommands.includes("rm"),
    "Blocked commands include rm"
  );
  assert(
    config.blockedCommands.includes("sudo"),
    "Blocked commands include sudo"
  );

  // Verify file was created
  const fileExists = await fs
    .access(TEST_CONFIG_FILE)
    .then(() => true)
    .catch(() => false);
  assert(fileExists, "Config file was created");
}

async function testIsDomainAllowed() {
  console.error("\n--- Test: isDomainAllowed ---");
  clearConfigCache();
  await resetConfig();

  // Test blocked domains
  assert(
    (await isDomainAllowed("localhost")) === "BLOCKED",
    "localhost is blocked"
  );
  assert(
    (await isDomainAllowed("127.0.0.1")) === "BLOCKED",
    "127.0.0.1 is blocked"
  );
  assert(
    (await isDomainAllowed("http://localhost:3000")) === "BLOCKED",
    "localhost URL is blocked"
  );
  assert(
    (await isDomainAllowed("192.168.1.100")) === "BLOCKED",
    "192.168.x.x is blocked"
  );
  assert(
    (await isDomainAllowed("10.0.0.1")) === "BLOCKED",
    "10.x.x.x is blocked"
  );
  assert(
    (await isDomainAllowed("169.254.169.254")) === "BLOCKED",
    "AWS metadata endpoint is blocked"
  );

  // Test unknown domains need approval
  assert(
    (await isDomainAllowed("example.com")) === "NEEDS_APPROVAL",
    "Unknown domain needs approval"
  );
  assert(
    (await isDomainAllowed("https://api.openai.com/v1")) === "NEEDS_APPROVAL",
    "Unknown URL needs approval"
  );

  // Add domain to allowlist and test again
  await addDomainToAllowlist("example.com");
  assert(
    (await isDomainAllowed("example.com")) === "ALLOWED",
    "Allowlisted domain is allowed"
  );
  assert(
    (await isDomainAllowed("https://example.com/path")) === "ALLOWED",
    "Allowlisted domain URL is allowed"
  );
}

async function testIsCommandAllowed() {
  console.error("\n--- Test: isCommandAllowed ---");
  clearConfigCache();
  await resetConfig();

  // Test blocked commands
  assert(
    (await isCommandAllowed("rm")) === "BLOCKED",
    "rm is blocked"
  );
  assert(
    (await isCommandAllowed("rm -rf /")) === "BLOCKED",
    "rm with args is blocked"
  );
  assert(
    (await isCommandAllowed("/bin/rm")) === "BLOCKED",
    "rm with path is blocked"
  );
  assert(
    (await isCommandAllowed("sudo")) === "BLOCKED",
    "sudo is blocked"
  );
  assert(
    (await isCommandAllowed("chmod 777 file")) === "BLOCKED",
    "chmod is blocked"
  );

  // Test unknown commands need approval
  assert(
    (await isCommandAllowed("curl")) === "NEEDS_APPROVAL",
    "Unknown command needs approval"
  );
  assert(
    (await isCommandAllowed("yt-dlp")) === "NEEDS_APPROVAL",
    "Unknown command needs approval"
  );

  // Add command to allowlist and test again
  await addCommandToAllowlist("curl");
  assert(
    (await isCommandAllowed("curl")) === "ALLOWED",
    "Allowlisted command is allowed"
  );
  assert(
    (await isCommandAllowed("curl https://example.com")) === "ALLOWED",
    "Allowlisted command with args is allowed"
  );
}

async function testCannotAllowlistBlockedItems() {
  console.error("\n--- Test: Cannot allowlist blocked items ---");
  clearConfigCache();
  await resetConfig();

  // Try to add blocked domain
  let domainError: Error | null = null;
  try {
    await addDomainToAllowlist("localhost");
  } catch (e) {
    domainError = e as Error;
  }
  assert(
    domainError !== null,
    "Adding blocked domain throws error"
  );
  assert(
    domainError!.message.includes("security blocklist"),
    "Error message mentions security blocklist"
  );

  // Try to add blocked command
  let commandError: Error | null = null;
  try {
    await addCommandToAllowlist("rm");
  } catch (e) {
    commandError = e as Error;
  }
  assert(
    commandError !== null,
    "Adding blocked command throws error"
  );
  assert(
    commandError!.message.includes("security blocklist"),
    "Error message mentions security blocklist"
  );
}

async function testRemoveFromAllowlist() {
  console.error("\n--- Test: Remove from allowlist ---");
  clearConfigCache();
  await resetConfig();

  // Add and verify
  await addDomainToAllowlist("test.example.com");
  assert(
    (await isDomainAllowed("test.example.com")) === "ALLOWED",
    "Domain is allowed after adding"
  );

  // Remove and verify
  await removeDomainFromAllowlist("test.example.com");
  assert(
    (await isDomainAllowed("test.example.com")) === "NEEDS_APPROVAL",
    "Domain needs approval after removing"
  );

  // Same for commands
  await addCommandToAllowlist("testcmd");
  assert(
    (await isCommandAllowed("testcmd")) === "ALLOWED",
    "Command is allowed after adding"
  );

  await removeCommandFromAllowlist("testcmd");
  assert(
    (await isCommandAllowed("testcmd")) === "NEEDS_APPROVAL",
    "Command needs approval after removing"
  );
}

async function testConfigPersistence() {
  console.error("\n--- Test: Config persistence ---");
  clearConfigCache();
  await resetConfig();

  // Add items
  await addDomainToAllowlist("persist.example.com");
  await addCommandToAllowlist("persistcmd");

  // Clear cache to force reload from disk
  clearConfigCache();

  // Verify persistence
  const config = await getConfig();
  assert(
    config.allowedDomains.includes("persist.example.com"),
    "Domain persisted to disk"
  );
  assert(
    config.allowedCommands.includes("persistcmd"),
    "Command persisted to disk"
  );
}

async function testWildcardPatterns() {
  console.error("\n--- Test: Wildcard patterns ---");
  clearConfigCache();
  await resetConfig();

  // Test private IP ranges with wildcards
  assert(
    (await isDomainAllowed("10.0.0.1")) === "BLOCKED",
    "10.0.0.1 matches 10.* pattern"
  );
  assert(
    (await isDomainAllowed("10.255.255.255")) === "BLOCKED",
    "10.255.255.255 matches 10.* pattern"
  );
  assert(
    (await isDomainAllowed("192.168.0.1")) === "BLOCKED",
    "192.168.0.1 matches 192.168.* pattern"
  );
  assert(
    (await isDomainAllowed("172.16.0.1")) === "BLOCKED",
    "172.16.0.1 matches 172.16.* pattern"
  );
}

async function testGetConfigPath() {
  console.error("\n--- Test: getConfigPath ---");
  const configPath = getConfigPath();
  assert(
    configPath.includes(".config/mcp-proxy/config.json"),
    "Config path is correct"
  );
}

async function runAllTests() {
  console.error("=== Config Manager Tests ===\n");

  await setup();

  try {
    await testExtractDomain();
    await testExtractCommand();
    await testLoadConfigCreatesDefault();
    await testIsDomainAllowed();
    await testIsCommandAllowed();
    await testCannotAllowlistBlockedItems();
    await testRemoveFromAllowlist();
    await testConfigPersistence();
    await testWildcardPatterns();
    await testGetConfigPath();

    console.error("\n=== ALL TESTS PASSED ===\n");
  } catch (error) {
    console.error("\n=== TEST FAILED ===");
    console.error(error);
    process.exit(1);
  } finally {
    await teardown();
  }
}

runAllTests();
