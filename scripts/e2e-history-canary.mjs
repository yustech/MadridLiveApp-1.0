import { chromium } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://inmosubastas.top';

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
  const clean = (label || '').trim();
  if (clean === 'Hoy') {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  }
  if (clean === 'Ayer') {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();
  }

  const isoMatch = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3])).getTime();
  }

  // Supports localized labels rendered by the app like "12 abr".
  const shortMonthMatch = clean.match(/^(\d{1,2})\s+([A-Za-z]{3})$/);
  if (shortMonthMatch) {
    const day = Number(shortMonthMatch[1]);
    const monthKey = shortMonthMatch[2].toLowerCase();
    const monthIndex = MONTH_TO_INDEX[monthKey];

    if (Number.isFinite(day) && monthIndex !== undefined) {
      const now = new Date();
      const year = now.getFullYear();
      return new Date(year, monthIndex, day).getTime();
    }
  }

  return Number.NaN;
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    const demoBtn = page.getByRole('button', { name: /Rellenar Credenciales Demo/i });
    if (await demoBtn.count()) {
      await demoBtn.click();
    }

    const authBtn = page.getByRole('button', { name: /AUTENTICAR EN ENTORNO/i });
    if (await authBtn.count()) {
      await authBtn.click();
    }

    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: /Historial/i }).first().click({ force: true });
    await page.waitForTimeout(900);

    const rowCountInitial = await page.locator('table tbody tr').count();
    assert(rowCountInitial > 0, 'Historial sin filas iniciales para validar canario.');

    const calendarButtons = await page.getByLabel(/Abrir calendario/i).count();
    assert(calendarButtons === 2, `Se esperaban 2 botones de calendario y hay ${calendarButtons}.`);

    const dateInputs = await page.locator('input[type="date"]').count();
    assert(dateInputs === 2, `Se esperaban 2 inputs de fecha y hay ${dateInputs}.`);

    await page.getByRole('button', { name: 'Hoy' }).first().click({ force: true });
    await page.waitForTimeout(700);
    const datesAfterToday = await page.locator('table tbody tr td:nth-child(2)').allTextContents();
    const uniqueDatesAfterToday = [...new Set(datesAfterToday.map((v) => v.trim()))];
    assert(uniqueDatesAfterToday.every((v) => v === 'Hoy'), `Filtro Hoy devolvió fechas no esperadas: ${JSON.stringify(uniqueDatesAfterToday)}.`);

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

    const dateRangeInputs = page.locator('input[type="date"]');
    await dateRangeInputs.nth(0).fill('2026-06-01');
    await dateRangeInputs.nth(1).fill('2026-06-30');
    await page.waitForTimeout(700);
    const rowCountRange = await page.locator('table tbody tr').count();
    assert(rowCountRange >= 0 && rowCountRange <= rowCountInitial, `Rango personalizado no afectó como se esperaba (${rowCountRange} vs ${rowCountInitial}).`);

    const paginationText = (await page.locator('text=/Página\\s+\\d+\\s+de\\s+\\d+/i').first().textContent() || '').trim();
    assert(Boolean(paginationText), 'No se encontró texto de paginación.');

    console.log(JSON.stringify({
      status: 'ok',
      baseUrl: BASE_URL,
      rowCountInitial,
      rowCountRange,
      uniqueDatesAfterToday,
      paginationText,
    }));
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
