// The burst for RRS-NF-003, TC-REL-01: 200 people at once trying to book the
// same train. Afterwards run the reconciliation: zero mismatches means no
// berth was sold twice and every ticket matches the inventory.
// Run: k6 run load/tatkal-burst.js, then: npm run reconcile
//   (Docker: docker compose exec app node scripts/reconcile.js)
import http from 'k6/http';
import { check } from 'k6';
import { report, outputs } from './lib/report.js';

const BASE = __ENV.BASE_URL || 'https://localhost:3443';
const JSON_HEADERS = { headers: { 'Content-Type': 'application/json' } };

export const options = {
  insecureSkipTLSVerify: true,
  scenarios: {
    burst: { executor: 'shared-iterations', vus: Number(__ENV.VUS || 200), iterations: Number(__ENV.ITERATIONS || 600), maxDuration: '2m' },
  },
  thresholds: {
    'http_req_duration{name:hold}': ['p(95)<3000'],
    'http_req_failed{name:hold}': ['rate==0'],
    checks: ['rate==1'],
  },
};

// Tomorrow's 12640: Tatkal opens at 10:00 today for it. Before 10:00 the
// burst uses general quota instead, which tests the same locking.
export function setup() {
  const date = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const trains = http.get(`${BASE}/api/trains/search?from=SBC&to=MAS&date=${date}`).json();
  const train = trains.find((t) => t.number === '12640') || trains[0];
  if (!train) throw new Error('No train found for tomorrow. Is the app running with demo data?');
  const probe = http.post(`${BASE}/api/holds`, JSON.stringify({
    runId: train.runId, classCode: 'SL', quotaCode: 'TQ', passengers: [{ name: 'Probe', age: 30, gender: 'M' }],
  }), JSON_HEADERS);
  const quotaCode = probe.status === 201 ? 'TQ' : 'GN';
  console.log(`Burst on ${train.number} for ${date}, quota ${quotaCode}${quotaCode === 'GN' ? ' (Tatkal not open yet)' : ''}`);
  return { runId: train.runId, quotaCode };
}

export default function (data) {
  const res = http.post(`${BASE}/api/holds`, JSON.stringify({
    runId: data.runId, classCode: 'SL', quotaCode: data.quotaCode, passengers: [{ name: 'Burst Test', age: 30, gender: 'M' }],
  }), { ...JSON_HEADERS, tags: { name: 'hold' } });
  check(res, { 'hold accepted (201)': (r) => r.status === 201 });
}

export function handleSummary(data) {
  const md = report(data, {
    title: 'Tatkal burst',
    requirement: 'RRS-NF-003',
    testCase: 'TC-REL-01 (load part; then run the reconciliation)',
    target: `${__ENV.VUS || 200} simultaneous users on one train, no failed request`,
    metric: 'http_req_duration{name:hold}',
  });
  return outputs(data, 'load-tatkal-burst', md);
}
