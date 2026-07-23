import { describe, expect, it } from 'vitest';
import { getSessionUserInitials } from '../../src/utils/sessionUser';

describe('session user initials', () => {
  it('uses the first local-part initial for a single email token', () => {
    expect(getSessionUserInitials('carlos@example.com')).toBe('C');
  });

  it('uses the first and last local-part tokens', () => {
    expect(getSessionUserInitials('juan.perez@example.com')).toBe('JP');
    expect(getSessionUserInitials('a_b-c@example.com')).toBe('AC');
  });

  it('falls back when the email is absent or empty', () => {
    expect(getSessionUserInitials('')).toBe('?');
    expect(getSessionUserInitials(null)).toBe('?');
    expect(getSessionUserInitials(undefined)).toBe('?');
  });
});
