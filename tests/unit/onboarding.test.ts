import { describe, expect, it } from 'vitest';
import {
  getOnboardingStorageKey,
  shouldShowOnboarding,
} from '../../src/utils/onboarding';

describe('onboarding storage', () => {
  it('keys onboarding by email, then role, then anonymous fallback', () => {
    expect(getOnboardingStorageKey('user@example.com', 'admin')).toBe('ml-onboarding-seen:user@example.com');
    expect(getOnboardingStorageKey(null, 'viewer')).toBe('ml-onboarding-seen:viewer');
    expect(getOnboardingStorageKey(null, null)).toBe('ml-onboarding-seen:anon');
  });

  it('shows onboarding until the key is marked with 1', () => {
    const unseenStorage = { getItem: () => null };
    const seenStorage = { getItem: () => '1' };
    const otherValueStorage = { getItem: () => 'true' };

    expect(shouldShowOnboarding(unseenStorage, 'user@example.com', 'admin')).toBe(true);
    expect(shouldShowOnboarding(seenStorage, 'user@example.com', 'admin')).toBe(false);
    expect(shouldShowOnboarding(otherValueStorage, 'user@example.com', 'admin')).toBe(true);
  });
});
