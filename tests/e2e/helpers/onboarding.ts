import type { Page } from '@playwright/test';

export async function seedOnboardingSeen(
  page: Page,
  identity: { email?: string | null; role?: string | null },
) {
  await page.addInitScript(({ email, role }) => {
    localStorage.setItem(`ml-onboarding-seen:${email || role || 'anon'}`, '1');
  }, identity);
}
