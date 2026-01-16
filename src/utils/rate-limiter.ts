/**
 * Rate Limiter
 *
 * Simple in-memory rate limiting for proxy requests.
 * Uses a sliding window approach to limit requests per time period.
 */

/**
 * Rate limit configuration
 */
interface RateLimitConfig {
  /** Maximum requests allowed in the window */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
}

/**
 * Request record for tracking
 */
interface RequestRecord {
  timestamps: number[];
}

/**
 * Default rate limit: 100 requests per minute
 */
const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  maxRequests: 100,
  windowMs: 60 * 1000, // 1 minute
};

/**
 * In-memory store for request tracking
 * Key: identifier (could be domain, command, or global)
 */
const requestStore = new Map<string, RequestRecord>();

/**
 * Cleanup interval (5 minutes)
 */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Last cleanup timestamp
 */
let lastCleanup = Date.now();

/**
 * Cleans up old entries from the request store
 */
function cleanupOldEntries(): void {
  const now = Date.now();
  const maxAge = DEFAULT_RATE_LIMIT.windowMs * 2; // Keep entries for 2x the window

  for (const [key, record] of requestStore.entries()) {
    // Filter out timestamps older than maxAge
    record.timestamps = record.timestamps.filter(
      (ts) => now - ts < maxAge
    );

    // Remove entry if no timestamps remain
    if (record.timestamps.length === 0) {
      requestStore.delete(key);
    }
  }

  lastCleanup = now;
}

/**
 * Checks rate limit and records the request
 * @param identifier - Unique identifier for rate limiting (e.g., "fetch:domain.com" or "exec:curl")
 * @param config - Optional custom rate limit configuration
 * @returns Object indicating if request is allowed and remaining requests
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = DEFAULT_RATE_LIMIT
): { allowed: boolean; remaining: number; retryAfterMs?: number } {
  const now = Date.now();

  // Periodic cleanup
  if (now - lastCleanup > CLEANUP_INTERVAL_MS) {
    cleanupOldEntries();
  }

  // Get or create record
  let record = requestStore.get(identifier);
  if (!record) {
    record = { timestamps: [] };
    requestStore.set(identifier, record);
  }

  // Filter timestamps to only include those within the window
  const windowStart = now - config.windowMs;
  record.timestamps = record.timestamps.filter((ts) => ts >= windowStart);

  // Check if limit exceeded
  if (record.timestamps.length >= config.maxRequests) {
    // Calculate when the oldest request will expire
    const oldestTimestamp = Math.min(...record.timestamps);
    const retryAfterMs = oldestTimestamp + config.windowMs - now;

    console.error(
      `[rate-limiter] RATE LIMITED: ${identifier} (${record.timestamps.length}/${config.maxRequests} requests in window)`
    );

    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(0, retryAfterMs),
    };
  }

  // Record this request
  record.timestamps.push(now);

  const remaining = config.maxRequests - record.timestamps.length;

  // Log if getting close to limit
  if (remaining < 10) {
    console.error(
      `[rate-limiter] WARNING: ${identifier} approaching rate limit (${remaining} requests remaining)`
    );
  }

  return {
    allowed: true,
    remaining,
  };
}

/**
 * Gets current rate limit status without recording a request
 */
export function getRateLimitStatus(
  identifier: string,
  config: RateLimitConfig = DEFAULT_RATE_LIMIT
): { current: number; max: number; remaining: number } {
  const now = Date.now();
  const record = requestStore.get(identifier);

  if (!record) {
    return {
      current: 0,
      max: config.maxRequests,
      remaining: config.maxRequests,
    };
  }

  // Filter timestamps to only include those within the window
  const windowStart = now - config.windowMs;
  const currentCount = record.timestamps.filter(
    (ts) => ts >= windowStart
  ).length;

  return {
    current: currentCount,
    max: config.maxRequests,
    remaining: Math.max(0, config.maxRequests - currentCount),
  };
}

/**
 * Clears rate limit data for an identifier
 */
export function clearRateLimit(identifier: string): void {
  requestStore.delete(identifier);
}

/**
 * Clears all rate limit data
 */
export function clearAllRateLimits(): void {
  requestStore.clear();
}
