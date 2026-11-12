# Code Coverage Report

Railway Reservation System, Team 11, UE23CS341A, PES University.

Generated 2026-11-12T10:57:17.387Z from commit `96f91d7` on Node.js v20.20.2. Code coverage is the share of the application code that the automated tests actually run.

## Overall coverage: 84.64% (minimum 80%): PASS

2618 of 3093 statements, branches and functions in `src/` are run by the 295 unit and integration tests. Overall coverage = covered statements, branches and functions over their totals (lines are not added in, because they count the same code as statements).

Breakdown: line coverage 90.99%, statement coverage 87.84%, function coverage 90.46%, branch coverage 76.34% (see the Branch Coverage Report).

Tool: Jest built in coverage (Istanbul), `npm run test:report`. `src/server.js` (start up and timers) is excluded; its parts are tested through `src/app.js` and the modules.

| Measure | Covered | Total | Coverage | Minimum |
|---|---|---|---|---|
| **Overall** | 2618 | 3093 | **84.64%** | 80% |
| Lines | 1424 | 1565 | 90.99% | 85% |
| Statements | 1633 | 1859 | 87.84% | 85% |
| Functions | 275 | 304 | 90.46% | 85% |
| Branches | 710 | 930 | 76.34% | 70% |

## Line coverage by file

| File | Lines covered | Line coverage |
|---|---|---|
| `src/app.js` | 32/32 | 100.00% |
| `src/config/index.js` | 5/5 | 100.00% |
| `src/db/migrate.js` | 0/27 | 0.00% |
| `src/db/pool.js` | 13/13 | 100.00% |
| `src/errors.js` | 8/8 | 100.00% |
| `src/logger.js` | 7/7 | 100.00% |
| `src/middleware/correlationId.js` | 6/6 | 100.00% |
| `src/middleware/errorHandler.js` | 9/11 | 81.81% |
| `src/modules/account/routes.js` | 29/38 | 76.31% |
| `src/modules/account/service.js` | 43/45 | 95.55% |
| `src/modules/account/validation.js` | 15/15 | 100.00% |
| `src/modules/admin/routes.js` | 37/51 | 72.54% |
| `src/modules/admin/service.js` | 48/53 | 90.56% |
| `src/modules/allocation/allocate.js` | 15/15 | 100.00% |
| `src/modules/allocation/queue.js` | 5/5 | 100.00% |
| `src/modules/allocation/tatkal.js` | 8/8 | 100.00% |
| `src/modules/audit/routes.js` | 10/10 | 100.00% |
| `src/modules/audit/service.js` | 25/25 | 100.00% |
| `src/modules/auth/lockout.js` | 8/8 | 100.00% |
| `src/modules/auth/password.js` | 25/25 | 100.00% |
| `src/modules/auth/routes.js` | 69/85 | 81.17% |
| `src/modules/auth/service.js` | 22/22 | 100.00% |
| `src/modules/auth/session.js` | 43/44 | 97.72% |
| `src/modules/auth/staff.js` | 31/31 | 100.00% |
| `src/modules/auth/totp.js` | 26/26 | 100.00% |
| `src/modules/booking/checkout.js` | 27/28 | 96.42% |
| `src/modules/booking/passengerStatus.js` | 6/6 | 100.00% |
| `src/modules/booking/routes.js` | 71/87 | 81.60% |
| `src/modules/booking/service.js` | 66/66 | 100.00% |
| `src/modules/booking/settle.js` | 61/61 | 100.00% |
| `src/modules/booking/validation.js` | 21/22 | 95.45% |
| `src/modules/cancellation/routes.js` | 15/22 | 68.18% |
| `src/modules/cancellation/rules.js` | 19/19 | 100.00% |
| `src/modules/cancellation/service.js` | 81/81 | 100.00% |
| `src/modules/chart/routes.js` | 23/39 | 58.97% |
| `src/modules/chart/service.js` | 77/78 | 98.71% |
| `src/modules/fare/calc.js` | 13/13 | 100.00% |
| `src/modules/fare/routes.js` | 20/21 | 95.23% |
| `src/modules/fare/service.js` | 17/17 | 100.00% |
| `src/modules/inventory/reconcile.js` | 8/8 | 100.00% |
| `src/modules/inventory/service.js` | 7/7 | 100.00% |
| `src/modules/notification/service.js` | 24/26 | 92.30% |
| `src/modules/payment/gateway.js` | 8/8 | 100.00% |
| `src/modules/payment/refunds.js` | 29/31 | 93.54% |
| `src/modules/payment/routes.js` | 33/36 | 91.66% |
| `src/modules/payment/service.js` | 35/35 | 100.00% |
| `src/modules/pnr/limiter.js` | 13/13 | 100.00% |
| `src/modules/pnr/routes.js` | 21/23 | 91.30% |
| `src/modules/pnr/service.js` | 12/12 | 100.00% |
| `src/modules/search/routes.js` | 27/33 | 81.81% |
| `src/modules/search/service.js` | 32/32 | 100.00% |
| `src/modules/tte/routes.js` | 15/16 | 93.75% |
| `src/modules/uptime/availability.js` | 20/20 | 100.00% |
| `src/modules/uptime/routes.js` | 14/18 | 77.77% |
| `src/modules/uptime/service.js` | 18/18 | 100.00% |
| `src/routes/health.js` | 8/9 | 88.88% |
| `src/security/cardScan.js` | 28/29 | 96.55% |
| `src/settings.js` | 4/4 | 100.00% |
| `src/tls.js` | 12/12 | 100.00% |
