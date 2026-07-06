const BASE_URL = process.env.BASE_URL || process.env.API_BASE_URL || 'https://inmosubastas.top';
const ADMIN_API_TOKEN = process.env.ADMIN_API_TOKEN || '';
const APPLY = process.argv.includes('--apply');

function normalizeBase(url) {
  return String(url || '').replace(/\/+$/, '');
}

function buildMysqlPath(base, resource) {
  const root = normalizeBase(base);
  if (root.endsWith('/api/mysql')) return `${root}/${resource}`;
  if (root.endsWith('/api')) return `${root}/mysql/${resource}`;
  return `${root}/api/mysql/${resource}`;
}

function requestHeaders() {
  const headers = { 'content-type': 'application/json' };
  if (ADMIN_API_TOKEN) {
    headers['x-admin-token'] = ADMIN_API_TOKEN;
  }
  return headers;
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: requestHeaders() });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}: ${text}`);
  }

  return json;
}

async function deleteShift(baseUrl, shiftId) {
  const url = buildMysqlPath(baseUrl, `shifts/${shiftId}`);
  const response = await fetch(url, {
    method: 'DELETE',
    headers: requestHeaders(),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Failed deleting ${shiftId} (${response.status}): ${text}`);
  }
}

function sortableValue(value) {
  return value ? String(value) : '';
}

function shiftsSortDesc(a, b) {
  const keyA = [sortableValue(a.updatedAt), sortableValue(a.startedAt), sortableValue(a.id)].join('|');
  const keyB = [sortableValue(b.updatedAt), sortableValue(b.startedAt), sortableValue(b.id)].join('|');
  if (keyA > keyB) return -1;
  if (keyA < keyB) return 1;
  return 0;
}

function computeDuplicates(activeShifts) {
  const byWorker = new Map();
  for (const shift of activeShifts) {
    const workerId = shift?.workerId;
    if (!workerId) continue;
    if (!byWorker.has(workerId)) byWorker.set(workerId, []);
    byWorker.get(workerId).push(shift);
  }

  const duplicatePlan = [];
  for (const [workerId, shifts] of byWorker.entries()) {
    if (shifts.length <= 1) continue;
    const ordered = shifts.slice().sort(shiftsSortDesc);
    duplicatePlan.push({
      workerId,
      keepShiftId: ordered[0]?.id,
      removeShiftIds: ordered.slice(1).map((s) => s.id),
      activeRows: shifts.length,
    });
  }

  duplicatePlan.sort((a, b) => b.activeRows - a.activeRows);

  const duplicateRows = duplicatePlan.reduce((sum, item) => sum + item.removeShiftIds.length, 0);
  return { duplicateRows, duplicatePlan };
}

async function run() {
  const startedAt = Date.now();

  try {
    const shiftsUrl = buildMysqlPath(BASE_URL, 'shifts');
    const shifts = await fetchJson(shiftsUrl);
    const shiftList = Array.isArray(shifts) ? shifts : [];
    const activeShifts = shiftList.filter((shift) => shift?.status === 'Active');

    const { duplicateRows, duplicatePlan } = computeDuplicates(activeShifts);

    const report = {
      check: 'active-shift-remediation',
      mode: APPLY ? 'apply' : 'dry-run',
      status: duplicateRows === 0 ? 'ok' : (APPLY ? 'remediated' : 'duplicates-detected'),
      baseUrl: BASE_URL,
      duration_ms: Date.now() - startedAt,
      metrics: {
        active_shift_rows: activeShifts.length,
        duplicate_workers_count: duplicatePlan.length,
        active_shift_duplicates: duplicateRows,
      },
      duplicatePlan,
      deletedShiftIds: [],
    };

    if (duplicateRows === 0) {
      console.log(JSON.stringify(report));
      return;
    }

    if (!APPLY) {
      console.error(JSON.stringify(report));
      process.exit(1);
    }

    for (const item of duplicatePlan) {
      for (const shiftId of item.removeShiftIds) {
        await deleteShift(BASE_URL, shiftId);
        report.deletedShiftIds.push(shiftId);
      }
    }

    const postShifts = await fetchJson(shiftsUrl);
    const postActive = (Array.isArray(postShifts) ? postShifts : []).filter((shift) => shift?.status === 'Active');
    const post = computeDuplicates(postActive);

    report.metrics.active_shift_rows_after = postActive.length;
    report.metrics.active_shift_duplicates_after = post.duplicateRows;
    report.status = post.duplicateRows === 0 ? 'ok' : 'partial-remediation';
    report.duration_ms = Date.now() - startedAt;

    if (post.duplicateRows > 0) {
      console.error(JSON.stringify(report));
      process.exit(1);
    }

    console.log(JSON.stringify(report));
  } catch (error) {
    console.error(
      JSON.stringify({
        check: 'active-shift-remediation',
        mode: APPLY ? 'apply' : 'dry-run',
        status: 'fail',
        baseUrl: BASE_URL,
        duration_ms: Date.now() - startedAt,
        message: error?.message || String(error),
      }),
    );
    process.exit(1);
  }
}

run();
