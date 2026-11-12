// RRS-NF-001, TC-PERF-01: 50 booking attempts a second for one minute.
// Target: 95th percentile under 3 seconds and no failed inventory write.
// Run: k6 run load/booking.js   (BASE_URL defaults to https://localhost:3443)
import http from 'k6/http';
import { check } from 'k6';
import { report, outputs } from './lib/report.js';

const BASE = __ENV.BASE_URL || 'https://localhost:3443';

export const options = {
  insecureSkipTLSVerify: true,
  scenarios: {
    booking: {
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.RATE || 50),
      timeUnit: '1s',
      duration: __ENV.DURATION || '1m',
      preAllocatedVUs: 100,
      maxVUs: 400,
    },
  },
  thresholds: {
    'http_req_duration{name:hold}': ['p(95)<3000'],
    'http_req_failed{name:hold}': ['rate==0'],
    checks: ['rate==1'],
    dropped_iterations: ['count==0'],
  },
};

// Train runs 5 to 14 days ahead: clear of today's charts and the Tatkal window.
export function setup() {
  const runs = [];
  for (let d = 5; d <= 14; d++) {
    const date = new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
    const res = http.get(`${BASE}/api/trains/search?from=SBC&to=MAS&date=${date}`, { tags: { name: 'setup' } });
    if (res.status === 200) for (const t of res.json()) runs.push(t.runId);
  }
  if (!runs.length) throw new Error('No trains found. Is the app running with demo data?');
  return { runs };
}

export default function (data) {
  const runId = data.runs[Math.floor(Math.random() * data.runs.length)];
  const body = JSON.stringify({
    runId,
    classCode: Math.random() < 0.5 ? 'SL' : '3A',
    quotaCode: 'GN',
    passengers: [{ name: 'Load Test', age: 30, gender: 'F' }],
  });
  const res = http.post(`${BASE}/api/holds`, body, { headers: { 'Content-Type': 'application/json' }, tags: { name: 'hold' } });
  check(res, {
    'hold accepted (201)': (r) => r.status === 201,
    'passenger placed (CNF, RAC or WL)': (r) => r.status === 201 && ['CNF', 'RAC', 'WL'].includes(r.json('passengers.0.status')),
  });
}

export function handleSummary(data) {
  const md = report(data, {
    title: 'Booking load test',
    requirement: 'RRS-NF-001',
    testCase: 'TC-PERF-01',
    target: `${__ENV.RATE || 50} booking attempts a second for ${__ENV.DURATION || '1m'}, 95th percentile under 3 seconds, no failed request`,
    metric: 'http_req_duration{name:hold}',
  });
  return outputs(data, 'load-booking', md);
}
