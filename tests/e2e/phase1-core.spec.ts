import { expect, test } from '@playwright/test';

function isMysqlUnconfiguredMessage(payload: string) {
  return payload.toLowerCase().includes('mysql is not configured');
}

async function loginWithDemo(page: import('@playwright/test').Page) {
  await page.goto('/');

  const alreadyInside = await page.getByRole('button', { name: /Eventos \/ Control/i }).isVisible().catch(() => false);
  if (alreadyInside) return;

  await page.getByRole('button', { name: /Rellenar Credenciales Demo/i }).click();
  await page.getByRole('button', { name: /AUTENTICAR EN ENTORNO/i }).click();
  await expect(page.getByRole('button', { name: /Eventos \/ Control/i })).toBeVisible();
}

test.describe('Phase 1 - core functional flows', () => {
  test('[readonly] login, lock terminal, and login again', async ({ page }) => {
    await loginWithDemo(page);

    await page.getByRole('button', { name: /BLOQUEAR TERMINAL/i }).click();
    await expect(page.getByText(/TERMINAL DE ACCESO/i)).toBeVisible();

    await page.getByRole('button', { name: /Rellenar Credenciales Demo/i }).click();
    await page.getByRole('button', { name: /AUTENTICAR EN ENTORNO/i }).click();
    await expect(page.getByRole('button', { name: /Eventos \/ Control/i })).toBeVisible();
  });

  test('[readonly] core navigation modules render stable anchors', async ({ page }) => {
    await loginWithDemo(page);

    await page.getByRole('button', { name: /Plantilla/i }).click();
    await expect(page.getByRole('heading', { name: /Plantilla de Personal/i })).toBeVisible();

    await page.getByRole('button', { name: /Historial Registros/i }).click();
    await expect(page.getByText(/Historial de Registros/i)).toBeVisible();

    await page.getByRole('button', { name: /KPIs y Estadísticas/i }).click();
    await expect(page.getByText(/Métricas & KPIs/i)).toBeVisible();

    await page.getByRole('button', { name: /Lector QR/i }).click();
    await expect(page.getByText(/Punto de Registro QR Activo/i)).toBeVisible();
  });

  test('[readonly] opens profile from header avatar and returns to staff', async ({ page, request }) => {
    const staffResponse = await request.get('/api/mysql/staff');
    const staffJson = await staffResponse.json().catch(() => null);
    const staffPayload = String((staffJson as { message?: string; error?: string } | null)?.message || (staffJson as { message?: string; error?: string } | null)?.error || '');

    test.skip(
      staffResponse.status() === 500 && isMysqlUnconfiguredMessage(staffPayload),
      'MySQL is not configured in this runner; skipping profile-navigation check that depends on roster data.'
    );

    await loginWithDemo(page);

    await page.getByTitle(/Ver perfil de Javier Rodríguez/i).click();
    await expect(page.getByRole('heading', { name: /Perfil del Colaborador/i })).toBeVisible();

    await page.locator('#profile-view button').first().click();
    await expect(page.getByRole('heading', { name: /Plantilla de Personal/i })).toBeVisible();
  });

  test('[readonly] scanner manual entry rejects unknown ids', async ({ page }) => {
    await loginWithDemo(page);

    await page.getByRole('button', { name: /Lector QR/i }).click();
    await page.getByRole('button', { name: /Ingreso Manual de ID/i }).click();
    await page.locator('input[placeholder*="SEC-042"]').fill('PHASE1-INVALID-ID');
    await page.getByRole('button', { name: /^ENVIAR$/i }).click();

    await expect(page.getByText(/ID o nombre inválido/i)).toBeVisible();
  });
});
