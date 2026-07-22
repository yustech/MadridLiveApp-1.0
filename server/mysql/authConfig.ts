export function getSessionSecret(): string {
  return process.env.ADMIN_SESSION_SECRET || '';
}
