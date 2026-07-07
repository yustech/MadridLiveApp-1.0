const API_BASE = 'http://localhost:3000';

async function makeRequest(endpoint, method, payload) {
  const response = await fetch(`${API_BASE}/api/mysql${endpoint}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return {
    status: response.status,
    data: await response.json(),
  };
}

async function test() {
  const res = await makeRequest('/staff', 'POST', {
    idCode: 'TEST-001',
    name: 'John Doe',
    role: 'technician',
    roleLabel: 'Technical Director',
    status: 'active',
    avatar: 'https://example.com/avatar.jpg',
    location: 'Main Stage',
  });
  console.log('Status:', res.status);
  console.log('Response:', JSON.stringify(res.data, null, 2));
}

test();
