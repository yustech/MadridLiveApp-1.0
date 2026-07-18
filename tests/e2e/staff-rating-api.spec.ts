import { expect, test, type APIRequestContext } from '@playwright/test';

const ADMIN_API_TOKEN = process.env.PLAYWRIGHT_ADMIN_API_TOKEN || process.env.ADMIN_API_TOKEN || '';
const LOCAL_MUTATION_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

interface ApiResult {
  status: number;
  json: any;
  text: string;
}

function assertLocalMutationTarget() {
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173';
  const hostname = new URL(baseUrl).hostname;
  if (!LOCAL_MUTATION_HOSTS.has(hostname)) {
    throw new Error(`Refusing to run staff rating mutations against deployed URL ${baseUrl}.`);
  }
}

async function api(
  request: APIRequestContext,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<ApiResult> {
  const response = await request.fetch(path, {
    method,
    ...(body === undefined ? {} : { data: body }),
    headers: {
      'content-type': 'application/json',
      'x-admin-token': ADMIN_API_TOKEN,
    },
  });
  const text = await response.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status(), json, text };
}

test('admin rates and clears a worker through PATCH /api/mysql/staff/:id', async ({ request }) => {
  assertLocalMutationTarget();
  test.skip(!ADMIN_API_TOKEN, 'An admin API token is required for staff rating integration coverage.');

  expect((await request.patch('/api/mysql/staff/not-authorized', {
    data: { rating: 4 },
  })).status()).toBe(401);

  const stamp = Date.now();
  let workerId = '';

  try {
    const created = await api(request, 'POST', '/api/mysql/staff', {
      idCode: `RATE${stamp}`.slice(0, 20),
      name: `Rating E2E ${stamp}`,
      role: 'Auxiliar',
      roleLabel: 'Auxiliar',
      status: 'OUT',
      avatar: '',
      email: '',
      phone: '',
      totalHours: 0,
      currentShiftHours: 0,
      currentShiftMins: 0,
      location: '',
    });
    expect(created.status, created.text).toBe(201);
    workerId = String(created.json.id);

    const rated = await api(request, 'PATCH', `/api/mysql/staff/${workerId}`, { rating: 4 });
    expect(rated.status, rated.text).toBe(200);

    const listedAfterRating = await api(request, 'GET', '/api/mysql/staff');
    expect(listedAfterRating.status, listedAfterRating.text).toBe(200);
    expect(listedAfterRating.json).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: workerId, rating: 4 }),
    ]));

    const rejected = await api(request, 'PATCH', `/api/mysql/staff/${workerId}`, { rating: 6 });
    expect(rejected.status, rejected.text).toBe(400);
    expect(rejected.json.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'rating' }),
    ]));

    const cleared = await api(request, 'PATCH', `/api/mysql/staff/${workerId}`, { rating: null });
    expect(cleared.status, cleared.text).toBe(200);
    const listedAfterClear = await api(request, 'GET', '/api/mysql/staff');
    expect(listedAfterClear.json).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: workerId, rating: null }),
    ]));
  } finally {
    if (workerId) {
      await api(request, 'DELETE', `/api/mysql/staff/${workerId}`);
    }
  }
});
