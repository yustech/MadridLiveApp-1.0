export function getOnboardingStorageKey(
  email: string | null,
  role: string | null,
): string {
  return `ml-onboarding-seen:${email || role || 'anon'}`;
}

export function shouldShowOnboarding(
  storage: Pick<Storage, 'getItem'>,
  email: string | null,
  role: string | null,
): boolean {
  return storage.getItem(getOnboardingStorageKey(email, role)) !== '1';
}
