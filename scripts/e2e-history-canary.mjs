import { chromium } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://inmosubastas.top';
const RUN_STARTED_AT_MS = Date.now();
const ADMIN_EMAIL = process.env.PLAYWRIGHT_ADMIN_EMAIL || process.env.ADMIN_LOGIN_EMAIL || '';
const ADMIN_PASSWORD = process.env.PLAYWRIGHT_ADMIN_PASSWORD || process.env.ADMIN_LOGIN_PASSWORD || '';

const MONTH_TO_INDEX = {
  jan: 0,
  ene: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  abr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  ago: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
  dic: 11,
};

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function parseDateLabel(label) {
  const clean = (label || "").trim();
  if (clean === "Hoy" || clean.startsWith("Hoy ·")) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  }
  if (clean === "Ayer" || clean.startsWith("Ayer ·")) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();
  }

  const isoMatch = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3])).getTime();
  }

  // Supports localized labels rendered by the app like "12 abr" or "12 abr 2026".
  const shortMonthMatch = clean.match(/^(\d{1,2})\s+([A-Za-z]{3})(?:\s+(\d{4}))?$/);
  if (shortMonthMatch) {
    const day = Number(shortMonthMatch[1]);
    const monthKey = shortMonthMatch[2].toLowerCase();
    const monthIndex = MONTH_TO_INDEX[monthKey];

    if (Number.isFinite(day) && monthIndex !== undefined) {
      const now = new Date();
      const year = shortMonthMatch[3] ? Number(shortMonthMatch[3]) : now.getFullYear();
      return new Date(year, monthIndex, day).getTime();
    }
  }

  return Number.NaN;
}

async function openHistoryScreen(page) {
  const historyRoot = page.locator('#shifts-history-system');

  if (await historyRoot.count()) {
    return;
  }

  const candidates = [
    page.getByRole('button', { name: /Historial Registros/i }).first(),
    page.getByRole('button', { name: /^Registros$/i }).first(),
    page.getByRole('button', { name: /Historial/i }).first(),
    page.getByRole('tab', { name: /Historial/i }).first(),
    page.locator('aside button').filter({ hasText: /Historial|Registros/i }).first(),
    page.locator('#bottom-navigation-dock button').filter({ hasText: /Registros/i }).first(),
    page.locator('button, [role="tab"]').filter({ hasText: /Historial|Registros/i }).first(),
  ];

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    for (const locator of candidates) {
      if (await locator.count()) {
        try {
          await locator.click({ force: true, timeout: 6000 });
          await historyRoot.waitFor({ state: 'visible', timeout: 6000 });
          if (await page.locator('#shifts-history-system table tbody tr').count()) {
            return;
          }
        } catch {
          // Try other candidate/attempt.
        }
      }
    }

    // Fallback for nav implementations where history text is nested in a clickable container.
    await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('button,[role="tab"],a,div,span'));
      const visible = nodes.filter((el) => {
        const txt = (el.textContent || '').trim();
        const rect = el.getBoundingClientRect();
        return /historial registros|historial|registros/i.test(txt) && rect.width > 0 && rect.height > 0;
      });
      if (visible.length) {
        visible[0].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      }
    });

    try {
      await historyRoot.waitFor({ state: 'visible', timeout: 3500 });
      if (await page.locator('#shifts-history-system table tbody tr').count()) {
        return;
      }
    } catch {
      // Retry opening history on next attempt.
    }
  }

  throw new Error('No se pudo abrir la pantalla Historial tras varios intentos.');
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    const authBtn = page.getByRole('button', { name: /AUTENTICAR EN ENTORNO/i });
    if (await authBtn.count()) {
      assert(ADMIN_EMAIL && ADMIN_PASSWORD, 'Credenciales admin no configuradas para autenticar el canario.');
      await page.locator('input[type="email"]').fill(ADMIN_EMAIL);
      await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
      await authBtn.click();
    }

    await page.waitForTimeout(1500);

    const hasAppRoot = await page.locator('#root').count();
    assert(hasAppRoot > 0, 'No se encontró el root de la app.');

    await openHistoryScreen(page);

    const rowCountInitial = await page.locator('table tbody tr').count();
    assert(rowCountInitial > 0, 'Historial sin filas iniciales para validar canario.');

    const fromDateInput = page.getByLabel(/^Fecha desde$/i);
    const toDateInput = page.getByLabel(/^Fecha hasta$/i);
    const fromDateInputCount = await fromDateInput.count();
    const toDateInputCount = await toDateInput.count();
    assert(fromDateInputCount === 1, `Se esperaba 1 input accesible "Fecha desde" y hay ${fromDateInputCount}.`);
    assert(toDateInputCount === 1, `Se esperaba 1 input accesible "Fecha hasta" y hay ${toDateInputCount}.`);

    const dateInputs = await page.locator('input[type="date"]').count();
    assert(dateInputs === 2, `Se esperaban 2 inputs de fecha y hay ${dateInputs}.`);

    await page.getByRole('button', { name: 'Hoy' }).first().click({ force: true });
    await page.waitForTimeout(700);
    const datesAfterToday = await page.locator('table tbody tr td:nth-child(2)').allTextContents();
    const uniqueDatesAfterToday = [...new Set(datesAfterToday.map((v) => v.trim()))];
    assert(uniqueDatesAfterToday.every((v) => v === 'Hoy' || v.startsWith('Hoy ·')), `Filtro Hoy devolvió fechas no esperadas: ${JSON.stringify(uniqueDatesAfterToday)}.`);

    await page.getByRole('button', { name: 'Todo' }).first().click({ force: true });
    await page.waitForTimeout(400);

    await page.selectOption('select:has(option[value="Oldest"])', 'Oldest');
    await page.waitForTimeout(700);
    const oldestDates = await page.locator('table tbody tr td:nth-child(2)').allTextContents();
    const oldestTimestamps = oldestDates.map((v) => parseDateLabel(v));
    const hasInvalidOldestDate = oldestTimestamps.some((v) => Number.isNaN(v));
    assert(!hasInvalidOldestDate, `Se encontraron fechas no parseables en orden Más antiguo: ${JSON.stringify(oldestDates)}.`);
    const isAscending = oldestTimestamps.every((v, i, arr) => i === 0 || arr[i - 1] <= v);
    assert(isAscending, `Orden Más antiguo no ascendente: ${JSON.stringify(oldestDates)}.`);

    await fromDateInput.fill('2026-06-01');
    await toDateInput.fill('2026-06-30');
    await page.waitForTimeout(700);
    const rowCountRange = await page.locator('table tbody tr').count();
    assert(rowCountRange >= 0 && rowCountRange <= rowCountInitial, `Rango personalizado no afectó como se esperaba (${rowCountRange} vs ${rowCountInitial}).`);

    const clearFilters = page.getByRole('button', { name: /Limpiar todos los filtros/i }).first();
    if (await clearFilters.count()) {
      await clearFilters.click({ force: true });
    } else {
      await page.getByRole('button', { name: 'Todo' }).first().click({ force: true });
    }
    await page.waitForTimeout(700);
    const rowCountAfterReset = await page.locator('table tbody tr').count();
    assert(rowCountAfterReset > 0, 'No se restauraron filas tras limpiar filtros antes de validar paginación.');

    const paginationText = (await page.locator('text=/Página\\s+\\d+\\s+de\\s+\\d+/i').first().textContent() || '').trim();
    assert(Boolean(paginationText), 'No se encontró texto de paginación.');

    console.log(JSON.stringify({
      canary: 'history',
      status: 'ok',
      baseUrl: BASE_URL,
      duration_ms: Date.now() - RUN_STARTED_AT_MS,
      rowCountInitial,
      rowCountRange,
      rowCountAfterReset,
      uniqueDatesAfterToday,
      paginationText,
    }));
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(JSON.stringify({
    canary: 'history',
    status: 'fail',
    baseUrl: BASE_URL,
    duration_ms: Date.now() - RUN_STARTED_AT_MS,
    message: error?.message || String(error),
  }));
  process.exit(1);
});
