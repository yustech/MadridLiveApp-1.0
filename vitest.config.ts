import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Unit tests only. Playwright e2e specs live in tests/e2e (testDir there)
    // and must NOT be picked up by vitest, nor vice versa.
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
