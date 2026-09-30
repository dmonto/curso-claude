const buckets = new Map();

export function checkRateLimit({ key, limit, windowMs }) {
  const now = Date.now();

  const current = buckets.get(key) || {
    count: 0,
    windowStart: now
  };

  const windowExpired = now - current.windowStart > windowMs;

  if (windowExpired) {
    buckets.set(key, {
      count: 1,
      windowStart: now
    });

    return {
      allowed: true,
      remaining: limit - 1,
      resetAt: new Date(now + windowMs).toISOString()
    };
  }

  if (current.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: new Date(current.windowStart + windowMs).toISOString()
    };
  }

  current.count += 1;
  buckets.set(key, current);

  return {
    allowed: true,
    remaining: limit - current.count,
    resetAt: new Date(current.windowStart + windowMs).toISOString()
  };
}
