// RRS-NF-002, TC-PERF-02: 1000 people searching at the same time.
// Target: 95th percentile under 2 seconds.
// Run: k6 run load/search.js   (BASE_URL defaults to https://localhost:3443)
import http from 'k6/http';
import { check, sleep } from 'k6';
import { report, outputs } from './lib/report.js';

const BASE = __ENV.BASE_URL || 'https://localhost:3443';
const USERS = Number(__ENV.VUS || 1000);
const ROUTES = [['SBC', 'MAS'], ['SBC', 'KPD'], ['BWT', 'MAS'], ['KPD', 'MAS'], ['SBC', 'BWT']];

export const options = {
  insecureSkipTLSVerify: true,
  scenarios: {
    search: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: __ENV.RAMP || '30s', target: USERS },
        { duration: __ENV.HOLD || '1m', target: USERS },
        { duration: '10s', target: 0 },
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    'http_req_duration{name:search}': ['p(95)<2000'],
    'http_req_failed{name:search}': ['rate<0.01'],
    checks: ['rate>0.99'],
  },
};

export default function () {
  const [from, to] = ROUTES[Math.floor(Math.random() * ROUTES.length)];
  const date = new Date(Date.now() + Math.floor(Math.random() * 29) * 86400000).toISOString().slice(0, 10);
  const res = http.get(`${BASE}/api/trains/search?from=${from}&to=${to}&date=${date}`, { tags: { name: 'search' } });
  check(res, { 'search answered (200)': (r) => r.status === 200 });
  sleep(1);   // a person reads the results before searching again
}

export function handleSummary(data) {
  const md = report(data, {
    title: 'Search load test',
    requirement: 'RRS-NF-002',
    testCase: 'TC-PERF-02',
    target: `${USERS} users searching at once, 95th percentile under 2 seconds`,
    metric: 'http_req_duration{name:search}',
  });
  return outputs(data, 'load-search', md);
}
