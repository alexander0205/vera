interface RateLimitEntry { count: number; reset: number; }
const store = new Map<string, RateLimitEntry>();

// Cleanup every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (entry.reset < now) store.delete(key);
    }
  }, 5 * 60 * 1000);
}

export function rateLimit(
  key: string,
  maxRequests: number = 10,
  windowMs: number = 60_000,
): { allowed: boolean; remaining: number; reset: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.reset < now) {
    store.set(key, { count: 1, reset: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, reset: now + windowMs };
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0, reset: entry.reset };
  }

  entry.count++;
  return { allowed: true, remaining: maxRequests - entry.count, reset: entry.reset };
}
