export interface RateLimitEntry {
  count: number;
  windowStart: number;
}

export function isRateLimited(
  store: Map<string, RateLimitEntry>,
  key: string,
  windowMs: number,
  maxRequests: number,
): boolean {
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || now - entry.windowStart > windowMs) {
    store.set(key, { count: 1, windowStart: now });
    return false;
  }

  entry.count += 1;
  return entry.count > maxRequests;
}
