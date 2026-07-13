const BASE_URL = process.env.BASE_URL || process.env.API_BASE_URL || 'https://madridliveapp.top';

function normalizeBase(url) {
  return String(url || '').replace(/\/+$/, '');
}

function buildMysqlPath(base, resource) {
  const root = normalizeBase(base);
  if (root.endsWith('/api/mysql')) return `${root}/${resource}`;
  if (root.endsWith('/api')) return `${root}/mysql/${resource}`;
  return `${root}/api/mysql/${resource}`;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { 'content-type': 'application/json' },
  });

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

function summarizeDuplicates(activeShifts) {
  const byWorker = new Map();
  for (const shift of activeShifts) {
    const workerId = shift?.workerId;
    if (!workerId) continue;
    byWorker.set(workerId, (byWorker.get(workerId) || 0) + 1);
  }

  const duplicateWorkers = [];
  let duplicateRows = 0;

  for (const [workerId, count] of byWorker.entries()) {
    if (count > 1) {
      duplicateWorkers.push({ workerId, activeRows: count });
      duplicateRows += count - 1;
    }
  }

  duplicateWorkers.sort((a, b) => b.activeRows - a.activeRows);

  return {
    duplicateRows,
    duplicateWorkers,
    activeWorkersUnique: byWorker.size,
  };
}

async function run() {
  const startedAt = Date.now();

  try {
    const shiftsUrl = buildMysqlPath(BASE_URL, 'shifts');
    const staffUrl = buildMysqlPath(BASE_URL, 'staff');

    const [shifts, staff] = await Promise.all([
      fetchJson(shiftsUrl),
      fetchJson(staffUrl),
    ]);

    const shiftList = Array.isArray(shifts) ? shifts : [];
    const staffList = Array.isArray(staff) ? staff : [];
    const activeShifts = shiftList.filter((shift) => shift?.status === 'Active');

    const { duplicateRows, duplicateWorkers, activeWorkersUnique } = summarizeDuplicates(activeShifts);
    const staffInCount = staffList.filter((worker) => worker?.status === 'IN').length;

    const report = {
      check: 'active-shift-watchdog',
      status: duplicateRows > 0 ? 'fail' : 'ok',
      baseUrl: BASE_URL,
      duration_ms: Date.now() - startedAt,
      metrics: {
        active_shift_rows: activeShifts.length,
        active_workers_unique: activeWorkersUnique,
        active_shift_duplicates: duplicateRows,
        duplicate_workers_count: duplicateWorkers.length,
        staff_in_count: staffInCount,
        occupancy_drift_vs_unique_active: staffInCount - activeWorkersUnique,
      },
      duplicateWorkers,
    };

    if (duplicateRows > 0) {
      console.error(JSON.stringify(report));
      process.exit(1);
    }

    console.log(JSON.stringify(report));
  } catch (error) {
    console.error(
      JSON.stringify({
        check: 'active-shift-watchdog',
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
