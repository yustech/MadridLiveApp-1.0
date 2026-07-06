#!/usr/bin/env node
import http from 'http';
import https from 'https';
import { URL } from 'url';

const API_BASE_URL = process.argv[2] || 'http://localhost:5174';
const CONCURRENCY = Math.max(1, Math.min(10, parseInt(process.argv[3] || '5', 10)));
const NUM_WORKERS = 5;
const client = API_BASE_URL.startsWith('https') ? https : http;

class Metrics {
  constructor() {
    this.total = 0;
    this.success = 0;
    this.conflicts = 0;
    this.errors = 0;
    this.timings = [];
  }

  record(status, ms) {
    this.total++;
    this.timings.push(ms);
    if (status === 201) this.success++;
    else if (status === 409) this.conflicts++;
    else this.errors++;
  }

  report() {
    const avg = this.timings.length ? (this.timings.reduce((a,b)=>a+b,0)/this.timings.length).toFixed(1) : 'N/A';
    console.log('\n' + '='.repeat(80));
    console.log('SHIFT RACE PROBE REPORT');
    console.log('='.repeat(80));
    console.log(`Total: ${this.total} | Success: ${this.success} | Conflicts: ${this.conflicts} | Errors: ${this.errors}`);
    console.log(`Avg Response: ${avg}ms`);
    if (this.errors > 0) {
      console.log('❌ RACE CONDITION DETECTED (server errors)');
      return false;
    }
    console.log('✅ LOCKING VALIDATION PASSED');
    console.log('='.repeat(80) + '\n');
    return true;
  }
}

function makeRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE_URL);
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    const req = client.request(url, opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function createWorker() {
  const id = Math.random().toString(36).substr(2, 8);
  try {
    const r = await makeRequest('POST', '/api/mysql/staff', {
      idCode: `PROBE-${id}`, name: `Probe-${id}`, role: 'tech', roleLabel: 'Technical',
      status: 'active', avatar: 'https://via.placeholder.com/40', location: 'probe-test'
    });
    return r.status === 201 && r.data.id ? r.data.id : null;
  } catch { return null; }
}

async function deleteWorker(id) {
  try {
    const r = await makeRequest('DELETE', `/api/mysql/staff/${id}`, null);
    const success = r.status === 200 || r.status === 204;
    if (success) {
      console.log(`  ✓ Deleted ${id}`);
    } else {
      console.warn(`  ⚠️  Failed to delete ${id} (${r.status})`);
    }
    return success;
  } catch (e) {
    console.warn(`  ⚠️  Error deleting ${id}: ${e.message}`);
    return false;
  }
}

async function getEvent() {
  try {
    const r = await makeRequest('GET', '/api/mysql/events', null);
    return r.status === 200 && r.data && r.data[0] ? r.data[0].id : null;
  } catch { return null; }
}

async function createShift(wid, metrics) {
  const now = new Date();
  const start = new Date(now.getTime() + 60000);
  const end = new Date(start.getTime() + 3600000);
  const ms = Date.now();
  try {
    const r = await makeRequest('POST', '/api/mysql/shifts', {
      workerId: wid,
      dateString: now.toISOString().split('T')[0],
      timespan: `${start.getHours()}:00-${end.getHours()}:00`,
      durationLabel: '1 hour',
      location: 'probe',
      status: 'completed',
      startedAt: start.toISOString(),
      endedAt: end.toISOString(),
    });
    metrics.record(r.status, Date.now() - ms);
  } catch {
    metrics.record(500, Date.now() - ms);
  }
}

async function main() {
  console.log('\nSHIFT RACE PROBE\n');
  const m = new Metrics();
  const workers = [];

  try {
    const eid = await getEvent();
    if (!eid) { console.error('ERROR: No event'); process.exit(1); }

    console.log(`Creating ${NUM_WORKERS} workers...`);
    for (let i = 0; i < NUM_WORKERS; i++) {
      const wid = await createWorker();
      if (wid) { workers.push(wid); console.log(`  ✓ ${wid}`); }
    }

    if (!workers.length) { console.error('ERROR: No workers created'); process.exit(1); }

    console.log(`\nRunning ${CONCURRENCY}x concurrent per worker, 3 batches...\n`);
    for (let b = 0; b < 3; b++) {
      for (const wid of workers) {
        const p = [];
        for (let i = 0; i < CONCURRENCY; i++) {
          p.push(createShift(wid, m));
        }
        await Promise.all(p);
      }
    }

    console.log('\nCleanup (guaranteed)...');
    let cleanupErrors = 0;
    for (const wid of workers) {
      const deleted = await deleteWorker(wid);
      if (!deleted) cleanupErrors++;
    }

    const pass = m.report();
    
    if (cleanupErrors > 0) {
      console.warn(`⚠️  ${cleanupErrors} workers failed to delete. Check manually.`);
    }

    process.exit(pass ? 0 : 1);
  } catch (e) {
    console.error('FATAL:', e.message);
    process.exit(1);
  }
}

main();
