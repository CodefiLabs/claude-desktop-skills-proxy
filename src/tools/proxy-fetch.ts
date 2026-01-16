/**
 * Proxy Fetch Tool
 *
 * Provides HTTP fetch capabilities that bypass sandbox restrictions.
 * Implements domain allowlist/blocklist checking with approval flow.
 */

import {
  isDomainAllowed,
  addDomainToAllowlist,
  extractDomain,
} from "../config/manager.js";

/**
 * Maximum response body size (10MB)
 */
const MAX_BODY_SIZE = 10 * 1024 * 1024;

/**
 * Default timeout in milliseconds
 */
const DEFAULT_TIMEOUT = 30000;

/**
 * Valid HTTP methods
 */
const VALID_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"] as const;
type HttpMethod = (typeof VALID_METHODS)[number];

/**
 * Input parameters for the proxy_fetch tool
 */
export interface ProxyFetchInput {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
  approve?: "once" | "always";
}

/**
 * Response from the proxy_fetch tool
 */
export interface ProxyFetchResponse {
  status: "success" | "needs_approval" | "error";
  // For needs_approval
  domain?: string;
  message?: string;
  // For success
  statusCode?: number;
  headers?: Record<string, string>;
  body?: string;
  // For error
  error?: string;
}

/**
 * Validates and normalizes the HTTP method
 */
function validateMethod(method?: string): HttpMethod {
  if (!method) {
    return "GET";
  }

  const upper = method.toUpperCase();
  if (!VALID_METHODS.includes(upper as HttpMethod)) {
    throw new Error(
      `Invalid HTTP method: ${method}. Valid methods: ${VALID_METHODS.join(", ")}`
    );
  }

  return upper as HttpMethod;
}

/**
 * Validates a URL and returns a URL object
 */
function validateUrl(url: string): URL {
  if (!url || typeof url !== "string") {
    throw new Error("URL is required and must be a string");
  }

  try {
    const parsed = new URL(url);

    // Only allow http and https protocols
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error(
        `Invalid protocol: ${parsed.protocol}. Only http and https are allowed.`
      );
    }

    return parsed;
  } catch (error) {
    if (error instanceof Error && error.message.includes("Invalid protocol")) {
      throw error;
    }
    throw new Error(`Invalid URL: ${url}`);
  }
}

/**
 * Converts Headers object to plain object
 */
function headersToObject(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

/**
 * Makes an HTTP fetch request with timeout support
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Reads response body with size limit
 */
async function readBodyWithLimit(
  response: Response,
  maxSize: number
): Promise<string> {
  const contentLength = response.headers.get("content-length");

  // If Content-Length header indicates body is too large, reject early
  if (contentLength && parseInt(contentLength, 10) > maxSize) {
    throw new Error(
      `Response body too large: ${contentLength} bytes (max: ${maxSize} bytes)`
    );
  }

  // Read the body as array buffer to check actual size
  const buffer = await response.arrayBuffer();

  if (buffer.byteLength > maxSize) {
    throw new Error(
      `Response body too large: ${buffer.byteLength} bytes (max: ${maxSize} bytes)`
    );
  }

  // Convert to string
  const decoder = new TextDecoder("utf-8");
  return decoder.decode(buffer);
}

/**
 * Main proxy fetch function
 *
 * Flow:
 * 1. Validate URL and extract domain
 * 2. Check domain against allowlist/blocklist
 * 3. Handle approval flow if needed
 * 4. Make HTTP request
 * 5. Return response
 */
export async function proxyFetch(
  input: ProxyFetchInput
): Promise<ProxyFetchResponse> {
  try {
    // Step 1: Validate URL
    const parsedUrl = validateUrl(input.url);
    const domain = extractDomain(input.url);

    console.error(`[proxy_fetch] Request to ${domain}: ${input.method || "GET"} ${input.url}`);

    // Step 2: Check domain against allowlist/blocklist
    const approvalStatus = await isDomainAllowed(parsedUrl.href);

    // Step 3: Handle approval flow
    if (approvalStatus === "BLOCKED") {
      console.error(`[proxy_fetch] Domain blocked: ${domain}`);
      return {
        status: "error",
        error: `Domain "${domain}" is blocked for security reasons and cannot be accessed.`,
      };
    }

    if (approvalStatus === "NEEDS_APPROVAL") {
      // Check if user provided approval
      if (!input.approve) {
        console.error(`[proxy_fetch] Domain needs approval: ${domain}`);
        return {
          status: "needs_approval",
          domain,
          message: `Domain "${domain}" is not in your allowlist. To proceed, call proxy_fetch again with approve: "once" for this request only, or approve: "always" to remember this domain.`,
        };
      }

      // Handle "always" approval - add to allowlist
      if (input.approve === "always") {
        console.error(`[proxy_fetch] Adding domain to allowlist: ${domain}`);
        await addDomainToAllowlist(domain);
      } else {
        console.error(`[proxy_fetch] One-time approval for domain: ${domain}`);
      }
    }

    // Step 4: Make HTTP request
    const method = validateMethod(input.method);
    const timeout = input.timeout ?? DEFAULT_TIMEOUT;

    const fetchOptions: RequestInit = {
      method,
      headers: input.headers,
    };

    // Add body for appropriate methods
    if (input.body && ["POST", "PUT", "PATCH"].includes(method)) {
      fetchOptions.body = input.body;
    }

    console.error(`[proxy_fetch] Fetching: ${method} ${input.url} (timeout: ${timeout}ms)`);

    const response = await fetchWithTimeout(input.url, fetchOptions, timeout);

    // Step 5: Read response body with size limit
    const body = await readBodyWithLimit(response, MAX_BODY_SIZE);

    console.error(
      `[proxy_fetch] Response: ${response.status} ${response.statusText} (${body.length} bytes)`
    );

    return {
      status: "success",
      statusCode: response.status,
      headers: headersToObject(response.headers),
      body,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    // Handle specific error types
    if (errorMessage.includes("abort")) {
      console.error(`[proxy_fetch] Request timed out`);
      return {
        status: "error",
        error: `Request timed out after ${input.timeout ?? DEFAULT_TIMEOUT}ms`,
      };
    }

    console.error(`[proxy_fetch] Error: ${errorMessage}`);
    return {
      status: "error",
      error: errorMessage,
    };
  }
}

/**
 * MCP Tool definition for proxy_fetch
 */
export const proxyFetchToolDefinition = {
  name: "proxy_fetch",
  description:
    "Make HTTP requests to any URL. Bypasses Claude Desktop sandbox network restrictions. Returns response status, headers, and body. For new domains, you may need to provide approve: 'once' or 'always' to proceed.",
  inputSchema: {
    type: "object" as const,
    properties: {
      url: {
        type: "string",
        description: "The URL to fetch",
      },
      method: {
        type: "string",
        enum: ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"],
        description: "HTTP method (default: GET)",
      },
      headers: {
        type: "object",
        description: "Custom HTTP headers as key-value pairs",
        additionalProperties: { type: "string" },
      },
      body: {
        type: "string",
        description: "Request body for POST/PUT/PATCH requests",
      },
      timeout: {
        type: "number",
        description: "Timeout in milliseconds (default: 30000)",
      },
      approve: {
        type: "string",
        enum: ["once", "always"],
        description:
          "Approve this domain: 'once' for this request only, 'always' to remember",
      },
    },
    required: ["url"],
  },
};
