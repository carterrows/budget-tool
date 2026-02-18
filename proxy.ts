import { NextRequest, NextResponse } from "next/server";

type RateLimitPolicy = {
  limit: number;
  windowMs: number;
};

type RateLimitBucket = {
  count: number;
  resetAt: number;
  lastSeenAt: number;
};

const parseEnvInt = (
  name: string,
  fallback: number,
  minimum: number,
  maximum: number
) => {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(Math.round(parsed), minimum), maximum);
};

const RATE_LIMIT_WINDOW_MS = parseEnvInt("API_RATE_LIMIT_WINDOW_MS", 60_000, 1_000, 3_600_000);
const GENERAL_API_LIMIT = parseEnvInt("API_RATE_LIMIT_GENERAL_MAX", 120, 10, 10_000);
const AUTH_API_LIMIT = parseEnvInt("API_RATE_LIMIT_AUTH_MAX", 15, 1, 1_000);
const CLEANUP_INTERVAL_MS = Math.max(RATE_LIMIT_WINDOW_MS, 30_000);

const GENERAL_POLICY: RateLimitPolicy = {
  limit: GENERAL_API_LIMIT,
  windowMs: RATE_LIMIT_WINDOW_MS
};

const AUTH_POLICY: RateLimitPolicy = {
  limit: AUTH_API_LIMIT,
  windowMs: RATE_LIMIT_WINDOW_MS
};

const rateLimitBuckets = new Map<string, RateLimitBucket>();
let lastCleanupAt = 0;

const isAuthPath = (pathname: string) => pathname.startsWith("/api/auth/");

const getPolicy = (pathname: string) => (isAuthPath(pathname) ? AUTH_POLICY : GENERAL_POLICY);

const getClientId = (request: NextRequest) => {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }

  return "unknown";
};

const maybeCleanupBuckets = (now: number) => {
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) {
    return;
  }

  lastCleanupAt = now;
  const oldestSeenThreshold = now - RATE_LIMIT_WINDOW_MS;

  for (const [key, bucket] of rateLimitBuckets) {
    if (bucket.resetAt <= now && bucket.lastSeenAt < oldestSeenThreshold) {
      rateLimitBuckets.delete(key);
    }
  }
};

const applyApiSecurityHeaders = (response: NextResponse) => {
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "same-origin");
};

const applyRateLimitHeaders = (
  response: NextResponse,
  limit: number,
  remaining: number,
  resetAtUnixMs: number
) => {
  response.headers.set("X-RateLimit-Limit", String(limit));
  response.headers.set("X-RateLimit-Remaining", String(Math.max(remaining, 0)));
  response.headers.set("X-RateLimit-Reset", String(Math.ceil(resetAtUnixMs / 1000)));
};

export function proxy(request: NextRequest) {
  const now = Date.now();
  maybeCleanupBuckets(now);

  const pathname = request.nextUrl.pathname;
  const policy = getPolicy(pathname);
  const scope = isAuthPath(pathname) ? "auth" : "general";
  const key = `${scope}:${getClientId(request)}`;

  const current = rateLimitBuckets.get(key);
  const activeBucket =
    current && current.resetAt > now
      ? current
      : {
          count: 0,
          resetAt: now + policy.windowMs,
          lastSeenAt: now
        };

  activeBucket.count += 1;
  activeBucket.lastSeenAt = now;
  rateLimitBuckets.set(key, activeBucket);

  const remaining = policy.limit - activeBucket.count;
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((activeBucket.resetAt - now) / 1_000)
  );

  if (activeBucket.count > policy.limit) {
    const response = NextResponse.json(
      { error: "Too many requests. Please retry shortly." },
      { status: 429 }
    );
    applyApiSecurityHeaders(response);
    applyRateLimitHeaders(response, policy.limit, 0, activeBucket.resetAt);
    response.headers.set("Retry-After", String(retryAfterSeconds));
    return response;
  }

  const response = NextResponse.next();
  applyApiSecurityHeaders(response);
  applyRateLimitHeaders(response, policy.limit, remaining, activeBucket.resetAt);
  return response;
}

export const config = {
  matcher: ["/api/:path*"]
};
