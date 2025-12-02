/**
 * Simple in-memory rate limiter for development and single-instance deployments.
 *
 * TODO: For production with multiple serverless instances, upgrade to a distributed
 * solution like Upstash Redis. This in-memory Map resets on cold starts and doesn't
 * share state across instances.
 */

/** Rate limit window in milliseconds (60 seconds) */
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

/** In-memory store: IP -> timestamp of last request */
const rateLimitStore = new Map<string, number>();

/** Clean up old entries periodically to prevent memory leaks */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let lastCleanup = Date.now();

function cleanupOldEntries() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) {
    return;
  }

  lastCleanup = now;
  const cutoff = now - RATE_LIMIT_WINDOW_MS;

  for (const [ip, timestamp] of rateLimitStore.entries()) {
    if (timestamp < cutoff) {
      rateLimitStore.delete(ip);
    }
  }
}

/**
 * Extracts the client IP address from request headers.
 *
 * @param request - The incoming request
 * @returns The client IP or a fallback identifier
 */
function getClientIp(request: Request): string {
  // Check x-forwarded-for header (common in proxied environments like Vercel)
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    // x-forwarded-for can contain multiple IPs; the first is the client
    return forwardedFor.split(",")[0].trim();
  }

  // Check x-real-ip header
  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }

  // Fallback for development (no proxy)
  return "unknown-ip";
}

/**
 * Checks if the request should be rate limited.
 *
 * Rate limiting is controlled by the ENABLE_RATE_LIMIT environment variable.
 * When disabled (default), all requests are allowed.
 *
 * @param request - The incoming request
 * @returns Object with rateLimited boolean
 */
export async function checkRateLimit(
  request: Request
): Promise<{ rateLimited: boolean }> {
  // Check if rate limiting is enabled
  const isEnabled = process.env.ENABLE_RATE_LIMIT === "true";

  if (!isEnabled) {
    return { rateLimited: false };
  }

  // Run cleanup occasionally
  cleanupOldEntries();

  const ip = getClientIp(request);
  const now = Date.now();
  const lastRequest = rateLimitStore.get(ip);

  if (lastRequest && now - lastRequest < RATE_LIMIT_WINDOW_MS) {
    return { rateLimited: true };
  }

  // Update the timestamp for this IP
  rateLimitStore.set(ip, now);

  return { rateLimited: false };
}
