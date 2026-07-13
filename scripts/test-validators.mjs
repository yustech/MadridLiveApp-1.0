// Use native fetch in Node.js 18+
const API_BASE = process.env.API_URL || 'http://localhost:3000';
const ADMIN_API_TOKEN = process.env.ADMIN_API_TOKEN || '';

class ValidatorTestSuite {
  constructor() {
    this.results = { passed: 0, failed: 0, tests: [] };
    this.uniqueCounter = Date.now();
  }

  getUniqueId(prefix = 'TEST') {
    return `${prefix}-${++this.uniqueCounter}`.slice(0, 20);
  }

  async test(name, fn) {
    try {
      await fn();
      this.results.passed++;
      this.results.tests.push({ name, status: 'PASS' });
      console.log(`✓ ${name}`);
    } catch (err) {
      this.results.failed++;
      this.results.tests.push({ name, status: 'FAIL', error: err.message });
      console.error(`✗ ${name}: ${err.message}`);
    }
  }

  assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  report() {
    console.log('\n' + '='.repeat(60));
    console.log(`Test Results: ${this.results.passed} passed, ${this.results.failed} failed`);
    console.log('='.repeat(60));
    if (this.results.failed === 0) {
      console.log('✅ All tests passed!');
    }
  }
}

async function makeRequest(endpoint, method, payload) {
  const response = await fetch(`${API_BASE}/api/mysql${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(ADMIN_API_TOKEN ? { 'x-admin-token': ADMIN_API_TOKEN } : {}),
    },
    body: JSON.stringify(payload),
  });
  return {
    status: response.status,
    data: await response.json(),
  };
}

async function runTests() {
  const suite = new ValidatorTestSuite();

  // ====== STAFF VALIDATION TESTS ======
  console.log('\n--- STAFF VALIDATION ---');

  await suite.test('POST /staff with valid payload', async () => {
    const res = await makeRequest('/staff', 'POST', {
      idCode: suite.getUniqueId('VALID'),
      name: 'John Doe',
      role: 'technician',
      roleLabel: 'Technical Director',
      status: 'active',
      avatar: 'https://example.com/avatar.jpg',
      location: 'Main Stage',
    });
    suite.assert(res.status === 201, `Expected 201, got ${res.status}: ${JSON.stringify(res.data)}`);
    suite.assert(res.data.id, 'Response should contain id');
  });

  await suite.test('POST /staff rejects invalid idCode', async () => {
    const res = await makeRequest('/staff', 'POST', {
      idCode: 'TEST@INVALID#', // Invalid characters
      name: 'John Doe',
      role: 'technician',
      roleLabel: 'Technical Director',
      status: 'active',
      location: 'Main Stage',
    });
    suite.assert(res.status === 400, `Expected 400, got ${res.status}`);
    suite.assert(res.data.errors, 'Response should contain errors array');
    suite.assert(
      res.data.errors.some(e => e.field === 'idCode'),
      'Should have idCode error'
    );
  });

  await suite.test('POST /staff rejects empty name', async () => {
    const res = await makeRequest('/staff', 'POST', {
      idCode: suite.getUniqueId('EMPTY'),
      name: '   ', // Whitespace only
      role: 'technician',
      roleLabel: 'Technical Director',
      status: 'active',
      location: 'Main Stage',
    });
    suite.assert(res.status === 400, `Expected 400, got ${res.status}`);
    suite.assert(
      res.data.errors.some(e => e.field === 'name'),
      'Should have name error'
    );
  });

  await suite.test('POST /staff rejects invalid status', async () => {
    const res = await makeRequest('/staff', 'POST', {
      idCode: suite.getUniqueId('INVSTAT'),
      name: 'John Doe',
      role: 'technician',
      roleLabel: 'Technical Director',
      status: 'invalid_status', // Invalid enum
      location: 'Main Stage',
    });
    suite.assert(res.status === 400, `Expected 400, got ${res.status}`);
    suite.assert(
      res.data.errors.some(e => e.field === 'status'),
      'Should have status error'
    );
  });

  // ====== EVENT VALIDATION TESTS ======
  console.log('\n--- EVENT VALIDATION ---');

  await suite.test('POST /events with valid payload', async () => {
    const res = await makeRequest('/events', 'POST', {
      title: `Summer Festival ${suite.uniqueCounter}`,
      location: 'Central Park',
      dateDay: 15,
      dateMonth: 7,
      doorsOpen: '18:00',
      requiredStaff: 50,
      activeStaff: 0,
      totalStaffNeeded: 75,
      scanRate: 0,
      loadInPercent: 0,
    });
    suite.assert(res.status === 201, `Expected 201, got ${res.status}`);
    suite.assert(res.data.id, 'Response should contain id');
  });

  await suite.test('POST /events rejects invalid dateDay', async () => {
    const res = await makeRequest('/events', 'POST', {
      title: `Festival ${suite.uniqueCounter}`,
      location: 'Central Park',
      dateDay: 32, // Invalid day
      dateMonth: 7,
      doorsOpen: '18:00',
    });
    suite.assert(res.status === 400, `Expected 400, got ${res.status}`);
    suite.assert(
      res.data.errors.some(e => e.field === 'dateDay'),
      'Should have dateDay error'
    );
  });

  await suite.test('POST /events rejects invalid dateMonth', async () => {
    const res = await makeRequest('/events', 'POST', {
      title: `Festival ${suite.uniqueCounter}`,
      location: 'Central Park',
      dateDay: 15,
      dateMonth: 13, // Invalid month
      doorsOpen: '18:00',
    });
    suite.assert(res.status === 400, `Expected 400, got ${res.status}`);
    suite.assert(
      res.data.errors.some(e => e.field === 'dateMonth'),
      'Should have dateMonth error'
    );
  });

  // ====== SHIFT VALIDATION TESTS ======
  console.log('\n--- SHIFT VALIDATION ---');

  await suite.test('POST /shifts rejects invalid workerId', async () => {
    const res = await makeRequest('/shifts', 'POST', {
      workerId: 'not-a-number', // Should be numeric
      dateString: new Date().toISOString(),
      timespan: '8h',
      durationLabel: '8 hours',
      location: 'Main Stage',
      status: 'active',
      startedAt: new Date().toISOString(),
      endedAt: new Date(Date.now() + 8 * 3600000).toISOString(),
    });
    suite.assert(res.status === 400, `Expected 400, got ${res.status}`);
    suite.assert(
      res.data.errors.some(e => e.field === 'workerId'),
      'Should have workerId error'
    );
  });

  await suite.test('POST /shifts rejects endedAt <= startedAt', async () => {
    const now = new Date();
    const later = new Date(now.getTime() + 1000); // 1 second later
    const res = await makeRequest('/shifts', 'POST', {
      workerId: 1,
      dateString: now.toISOString(),
      timespan: '1h',
      durationLabel: '1 hour',
      location: 'Main Stage',
      status: 'active',
      startedAt: later.toISOString(), // Later time as start
      endedAt: now.toISOString(), // Earlier time as end (invalid!)
    });
    suite.assert(res.status === 400, `Expected 400, got ${res.status}`);
    suite.assert(
      res.data.errors.some(e => e.field === 'endedAt'),
      'Should have endedAt cross-field validation error'
    );
  });

  suite.report();
  process.exit(suite.results.failed === 0 ? 0 : 1);
}

console.log(`Testing validators against: ${API_BASE}`);
runTests().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
