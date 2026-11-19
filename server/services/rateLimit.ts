import type { NextFunction, Request, RequestHandler, Response } from 'express';

export interface RateLimitOptions {
  /** Logical bucket prefix, e.g. `'admin-login'` or `'verify-otp'`. */
  scope: string;
  /** Maximum requests permitted per IP within `windowMs`. */
  maxRequests: number;
  /** Sliding window duration in milliseconds. */
  windowMs: number;
  /** Friendly error message returned with HTTP 429. */
  message?: string;
}

const MAX_TRACKED_KEYS = 10_000;

/**
 * Lightweight in-memory sliding-window IP rate limiter.
 * Instantiated per Express app so isolated test servers never share counters,
 * while brute-force attempts against a live server receive `429 Too Many Requests`.
 * Set `DISABLE_RATE_LIMIT=true` only in synthetic load benchmarks if needed.
 */
export function createRateLimiterStore() {
  const hitsByKey = new Map<string, number[]>();
  let opsSinceSweep = 0;

  function sweepExpired(now: number, maxWindowMs: number): void {
    for (const [key, timestamps] of hitsByKey.entries()) {
      const fresh = timestamps.filter((t) => now - t < maxWindowMs);
      if (fresh.length === 0) {
        hitsByKey.delete(key);
      } else if (fresh.length !== timestamps.length) {
        hitsByKey.set(key, fresh);
      }
    }
  }

  return function rateLimit(options: RateLimitOptions): RequestHandler {
    const {
      scope,
      maxRequests,
      windowMs,
      message = 'Too many attempts. Please wait a moment and try again.',
    } = options;

    return (req: Request, res: Response, next: NextFunction): void => {
      if (process.env.DISABLE_RATE_LIMIT === 'true') {
        next();
        return;
      }

      const now = Date.now();
      const clientIp = req.ip || req.socket?.remoteAddress || 'unknown';
      const bucketKey = `${scope}:${clientIp}`;

      opsSinceSweep++;
      if (opsSinceSweep >= 250 || hitsByKey.size > MAX_TRACKED_KEYS) {
        opsSinceSweep = 0;
        sweepExpired(now, Math.max(windowMs, 10 * 60_000));
        if (hitsByKey.size >= MAX_TRACKED_KEYS && !hitsByKey.has(bucketKey)) {
          const oldestKey = hitsByKey.keys().next().value;
          if (oldestKey !== undefined) hitsByKey.delete(oldestKey);
        }
      }

      const recent = (hitsByKey.get(bucketKey) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= maxRequests) {
        const retryAfterSec = Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000));
        res.setHeader('Retry-After', String(retryAfterSec));
        res.status(429).json({ error: message });
        return;
      }

      recent.push(now);
      hitsByKey.set(bucketKey, recent);
      next();
    };
  };
}
