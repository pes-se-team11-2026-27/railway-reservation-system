# Tatkal burst

RRS-NF-003, TC-REL-01 (load part; then run the reconciliation). Run 2026-11-11T16:05:45.315Z against https://localhost:3443.

**Result: PASS.** Target: 200 simultaneous users on one train, no failed request.

| Measure | Value |
|---|---|
| Requests | 602 (491.0 per second) |
| Response time, median | 310 ms |
| Response time, 95th percentile | 461 ms |
| Response time, maximum | 533 ms |
| Failed requests | 0.00% |
| Checks passed | 100.00% |

| Metric | Threshold | Result |
|---|---|---|
| http_req_duration{name:hold} | p(95)<3000 | PASS |
| http_req_failed{name:hold} | rate==0 | PASS |
| checks | rate==1 | PASS |
