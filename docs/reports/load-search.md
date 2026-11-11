# Search load test

RRS-NF-002, TC-PERF-02. Run 2026-11-11T16:31:29.532Z against https://localhost:3443.

**Result: PASS.** Target: 1000 users searching at once, 95th percentile under 2 seconds.

| Measure | Value |
|---|---|
| Requests | 79297 (786.3 per second) |
| Response time, median | 9 ms |
| Response time, 95th percentile | 46 ms |
| Response time, maximum | 171 ms |
| Failed requests | 0.00% |
| Checks passed | 100.00% |

| Metric | Threshold | Result |
|---|---|---|
| http_req_failed{name:search} | rate<0.01 | PASS |
| http_req_duration{name:search} | p(95)<2000 | PASS |
| checks | rate>0.99 | PASS |
