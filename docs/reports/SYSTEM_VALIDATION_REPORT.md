# System Validation Report

Railway Reservation System, Team 11, UE23CS341A, PES University.

Generated 2026-11-11T18:30:59.256Z from commit `1776d65` on Node.js v20.20.2. Each test case from the Test Plan (Section 13.1), the requirement it verifies, and the evidence that decided the result.

**Result: PASS.** 32 of 32 test cases passed.

Automated suite: 295 of 295 tests passed (103 unit, 192 integration against PostgreSQL), lint clean, card data scan and inventory reconciliation in CI.

## Test cases

| Test case | Requirement | What is validated | Evidence | Result |
|---|---|---|---|---|
| TC-REG-01 | RRS-F-001 | One account per mobile number | `accounts.test.js` 11/11; `accountValidation.test.js` 6/6 | **PASS** |
| TC-REG-02 | RRS-F-002 | OTP verification before payment | `accounts.test.js` 11/11; `payments.test.js` 13/13 | **PASS** |
| TC-SRCH-01 | RRS-F-003 | Train search by stations and date | `search.test.js` 8/8; `searchInput.test.js` 4/4 | **PASS** |
| TC-SRCH-02 | RRS-F-004 | Live availability per class and quota | `availability.test.js` 8/8 | **PASS** |
| TC-BOOK-01 | RRS-F-005 | No berth allocated twice under 200 parallel requests | `holds.test.js` 10/10 | **PASS** |
| TC-BOOK-02 | RRS-F-006 | Holds expire after 10 minutes and berths return | `holds.test.js` 10/10 | **PASS** |
| TC-BOOK-03 | RRS-F-007 | Quota, then RAC, then waitlist, in request order | `allocation.test.js` 3/3; `allocate.test.js` 6/6 | **PASS** |
| TC-BOOK-04 | RRS-F-008 | Passenger limits per booking | `tatkal.test.js` 6/6; `holdValidation.test.js` 4/4 | **PASS** |
| TC-BOOK-05 | RRS-F-009 | Tatkal opening window | `tatkal.test.js` 6/6; `tatkal.test.js` 5/5 | **PASS** |
| TC-PAY-01 | RRS-F-010 | Itemised fare breakup | `fares.test.js` 7/7; `fareCalc.test.js` 7/7 | **PASS** |
| TC-PAY-02 | RRS-F-011 | Hosted payment, only a token stored | `payments.test.js` 13/13; `gateway.test.js` 5/5 | **PASS** |
| TC-PAY-03 | RRS-F-012 | PNR, QR ticket and messages only after payment | `bookings.test.js` 15/15; `pnr.test.js` 5/5 | **PASS** |
| TC-PAY-04 | RRS-F-013 | Repeated payment callbacks count once | `bookings.test.js` 15/15 | **PASS** |
| TC-PAY-05 | RRS-F-014 | Automatic refund when the berths are gone | `refunds.test.js` 7/7 | **PASS** |
| TC-CAN-01 | RRS-F-015 | Cancellation refund slabs and cutoff | `cancellation.test.js` 9/9; `cancelRules.test.js` 8/8 | **PASS** |
| TC-CAN-02 | RRS-F-016 | RAC and waitlist promotion on cancellation | `cancellation.test.js` 9/9 | **PASS** |
| TC-CAN-03 | RRS-F-015 | A cancelled booking shows Cancelled with no berth on the chart, PNR status and ticket (regression for #67) | `cancelledViews.test.js` 5/5; `passengerStatus.test.js` 4/4 | **PASS** |
| TC-CHT-01 | RRS-F-017 | Chart preparation before departure | `chart.test.js` 8/8 | **PASS** |
| TC-CHT-02 | RRS-F-018 | Handheld ticket check with no network | `tte.test.js` 4/4; `tteVerify.test.js` 7/7; docs/reports/manual-checks.md | **PASS** |
| TC-ADM-01 | RRS-F-019 | Fare and quota rules with effective dates | `admin.test.js` 13/13 | **PASS** |
| TC-ADM-02 | RRS-F-020 | Append only audit log of privileged actions | `audit.test.js` 7/7 | **PASS** |
| TC-PERF-01 | RRS-NF-001 | 50 booking attempts a second, 95th percentile under 3 seconds | docs/reports/load-booking.md | **PASS** |
| TC-PERF-02 | RRS-NF-002 | 1000 users searching, 95th percentile under 2 seconds | docs/reports/load-search.md | **PASS** |
| TC-REL-01 | RRS-NF-003 | Zero mismatches after a Tatkal burst | `reconcile.test.js` 5/5; docs/reports/reconciliation.md | **PASS** |
| TC-REL-02 | RRS-NF-004 | Monthly availability report against 99.5 percent | `availability-report.test.js` 3/3; `availability.test.js` 5/5 | **PASS** |
| TC-SEC-01 | RRS-NF-005 | No card data stored, logged or backed up | `cardData.test.js` 3/3; `cardScan.test.js` 6/6 | **PASS** |
| TC-UX-01 | RRS-NF-006 | WCAG 2.2 AA pages and booking on 1 Mbps | docs/reports/accessibility.md | **PASS** |
| TC-SEC-02 | RRS-SR-001 | TLS 1.2 minimum, plain HTTP only redirects | `tls.test.js` 5/5; `tls.test.js` 5/5 | **PASS** |
| TC-SEC-03 | RRS-SR-002 | No card data in stores, logs or backups | `cardData.test.js` 3/3 | **PASS** |
| TC-SEC-04 | RRS-SR-003 | Staff roles, second factor and idle lock | `staff.test.js` 10/10; `totp.test.js` 4/4 | **PASS** |
| TC-SEC-05 | RRS-SR-004 | PNR status with initials only and a lookup limit | `pnrLookup.test.js` 6/6; `pnrLookup.test.js` 4/4 | **PASS** |
| TC-SEC-06 | RRS-SR-005 | Password hashing and sign in lockout | `login.test.js` 6/6; `password.test.js` 7/7; `lockout.test.js` 4/4 | **PASS** |

## Requirements coverage

Every requirement in the SRS has at least one test case: 31 requirements (RRS-F-001 to F-020, RRS-NF-001 to NF-006, RRS-SR-001 to SR-005), 32 test cases, including TC-CAN-03, the regression case for defect #67.

## Defects found during validation

| Defect | Found by | Description | Fix | Retest |
|---|---|---|---|---|
| #67 | Sprint 3 system validation (chart screen) | After a cancellation, the chart, the public PNR status and the ticket page still showed the cancelled passenger as Confirmed on the old berth, which may already belong to someone else | One shared function (maskIfCancelled) used by all three views: a cancelled booking shows Cancelled with no berth and no queue position | TC-CAN-03, `cancelledViews.test.js`, `passengerStatus.test.js`: PASS |
| Card scan false alarm | Repeated CI runs (Sprint 2) | Session token hashes sometimes contained digit runs that pass the Luhn check | Only numbers standing on their own are counted | `cardScan.test.js`: PASS |
| Chart left berths empty | Chart test (Sprint 2) | One pass of promotion could leave a berth free while people waited | Promotion repeats until no berth is free or nobody waits | `chart.test.js`: PASS |

## Environment

| Item | Value |
|---|---|
| Application | Node.js 20, Express, PostgreSQL 15, run with Docker Compose over HTTPS |
| Automated tests | Jest 29 and Supertest; GitHub Actions with a PostgreSQL 15 service |
| Load tests | k6 (`load/`), results in the `load-*.md` reports |
| Accessibility | Playwright with axe-core, WCAG 2.0, 2.1 and 2.2 A and AA |
