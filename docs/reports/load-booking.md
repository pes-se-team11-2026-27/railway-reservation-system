# Booking load test

RRS-NF-001, TC-PERF-01. Run 2026-11-11T16:05:43.528Z against https://localhost:3443.

**Result: PASS.** Target: 50 booking attempts a second for one minute, 95th percentile under 3 seconds, no failed request.

| Measure | Value |
|---|---|
| Requests | 3011 (50.1 per second) |
| Response time, median | 5 ms |
| Response time, 95th percentile | 8 ms |
| Response time, maximum | 15 ms |
| Failed requests | 0.00% |
| Checks passed | 100.00% |

| Metric | Threshold | Result |
|---|---|---|
| checks | rate==1 | PASS |
| http_req_duration{name:hold} | p(95)<3000 | PASS |
| dropped_iterations | count==0 | PASS |
| http_req_failed{name:hold} | rate==0 | PASS |
