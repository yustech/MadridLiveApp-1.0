import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSessionSecret } from '../../server/mysql/authConfig';
import { timingSafeEqualString } from '../../server/mysql/constantTime';
import { isRateLimited, type RateLimitEntry } from '../../server/rateLimit';

describe('constant-time string comparison', () => {
  it('accepts equal non-empty values', () => {
    expect(timingSafeEqualString('same-token', 'same-token')).toBe(true);
  });

  it('rejects different values with the same length', () => {
    expect(timingSafeEqualString('token-one', 'token-two')).toBe(false);
  });

  it('rejects values with different lengths', () => {
    expect(timingSafeEqualString('short', 'longer')).toBe(false);
  });

  it('rejects empty values', () => {
    expect(timingSafeEqualString('', '')).toBe(false);
  });
});

describe('session secret configuration', () => {
  const originalSessionSecret = process.env.ADMIN_SESSION_SECRET;
  const originalApiToken = process.env.ADMIN_API_TOKEN;

  afterEach(() => {
    if (originalSessionSecret === undefined) delete process.env.ADMIN_SESSION_SECRET;
    else process.env.ADMIN_SESSION_SECRET = originalSessionSecret;
    if (originalApiToken === undefined) delete process.env.ADMIN_API_TOKEN;
    else process.env.ADMIN_API_TOKEN = originalApiToken;
  });

  it('does not fall back to ADMIN_API_TOKEN', () => {
    delete process.env.ADMIN_SESSION_SECRET;
    process.env.ADMIN_API_TOKEN = 'service-token';
    expect(getSessionSecret()).toBe('');
  });

  it('returns the dedicated ADMIN_SESSION_SECRET', () => {
    process.env.ADMIN_SESSION_SECRET = 'session-only-secret';
    process.env.ADMIN_API_TOKEN = 'service-token';
    expect(getSessionSecret()).toBe('session-only-secret');
  });
});

describe('shared rate limiter', () => {
  beforeEach(() => vi.useFakeTimers().setSystemTime(new Date('2026-07-22T10:00:00Z')));
  afterEach(() => vi.useRealTimers());

  it('blocks requests above the maximum and resets after the window', () => {
    const store = new Map<string, RateLimitEntry>();
    expect(isRateLimited(store, '127.0.0.1', 60_000, 2)).toBe(false);
    expect(isRateLimited(store, '127.0.0.1', 60_000, 2)).toBe(false);
    expect(isRateLimited(store, '127.0.0.1', 60_000, 2)).toBe(true);

    vi.advanceTimersByTime(60_001);
    expect(isRateLimited(store, '127.0.0.1', 60_000, 2)).toBe(false);
  });
});
