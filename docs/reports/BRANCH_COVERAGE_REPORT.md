# Branch Coverage Report

Railway Reservation System, Team 11, UE23CS341A, PES University.

Generated 2026-11-12T10:57:17.397Z from commit `96f91d7` on Node.js v20.20.2. Branch coverage is the share of decision outcomes (each side of every if, else, switch case, ternary and logical operator) that the tests take.

**Branch coverage 76.34%**: 710 of 930 branches taken by the tests.

Branch coverage is stricter than line coverage: a line such as `if (a) x(); else y();` counts as covered after one test, but both branches are only covered when tests take both sides. That is why the boundary tests in the Test Plan (for example 09:59 and 10:00 for Tatkal, 12 hours and 11.99 hours for cancellation) matter.

## Branch coverage by file

| File | Branches taken | Branch coverage |
|---|---|---|
| `src/app.js` | 6/8 | 75.00% |
| `src/config/index.js` | 12/14 | 85.71% |
| `src/db/migrate.js` | 0/7 | 0.00% |
| `src/db/pool.js` | 0/0 | 100.00% |
| `src/errors.js` | 0/0 | 100.00% |
| `src/logger.js` | 1/2 | 50.00% |
| `src/middleware/correlationId.js` | 4/4 | 100.00% |
| `src/middleware/errorHandler.js` | 5/6 | 83.33% |
| `src/modules/account/routes.js` | 5/12 | 41.66% |
| `src/modules/account/service.js` | 20/24 | 83.33% |
| `src/modules/account/validation.js` | 16/16 | 100.00% |
| `src/modules/admin/routes.js` | 14/22 | 63.63% |
| `src/modules/admin/service.js` | 29/43 | 67.44% |
| `src/modules/allocation/allocate.js` | 4/4 | 100.00% |
| `src/modules/allocation/queue.js` | 1/2 | 50.00% |
| `src/modules/allocation/tatkal.js` | 4/5 | 80.00% |
| `src/modules/audit/routes.js` | 0/0 | 100.00% |
| `src/modules/audit/service.js` | 29/32 | 90.62% |
| `src/modules/auth/lockout.js` | 6/6 | 100.00% |
| `src/modules/auth/password.js` | 17/18 | 94.44% |
| `src/modules/auth/routes.js` | 22/46 | 47.82% |
| `src/modules/auth/service.js` | 11/13 | 84.61% |
| `src/modules/auth/session.js` | 30/35 | 85.71% |
| `src/modules/auth/staff.js` | 19/25 | 76.00% |
| `src/modules/auth/totp.js` | 13/14 | 92.85% |
| `src/modules/booking/checkout.js` | 23/25 | 92.00% |
| `src/modules/booking/passengerStatus.js` | 4/4 | 100.00% |
| `src/modules/booking/routes.js` | 32/54 | 59.25% |
| `src/modules/booking/service.js` | 33/38 | 86.84% |
| `src/modules/booking/settle.js` | 33/39 | 84.61% |
| `src/modules/booking/validation.js` | 37/40 | 92.50% |
| `src/modules/cancellation/routes.js` | 1/10 | 10.00% |
| `src/modules/cancellation/rules.js` | 15/16 | 93.75% |
| `src/modules/cancellation/service.js` | 32/42 | 76.19% |
| `src/modules/chart/routes.js` | 1/10 | 10.00% |
| `src/modules/chart/service.js` | 27/38 | 71.05% |
| `src/modules/fare/calc.js` | 8/8 | 100.00% |
| `src/modules/fare/routes.js` | 12/14 | 85.71% |
| `src/modules/fare/service.js` | 17/18 | 94.44% |
| `src/modules/inventory/reconcile.js` | 0/0 | 100.00% |
| `src/modules/inventory/service.js` | 3/4 | 75.00% |
| `src/modules/notification/service.js` | 3/4 | 75.00% |
| `src/modules/payment/gateway.js` | 8/8 | 100.00% |
| `src/modules/payment/refunds.js` | 16/19 | 84.21% |
| `src/modules/payment/routes.js` | 4/8 | 50.00% |
| `src/modules/payment/service.js` | 31/37 | 83.78% |
| `src/modules/pnr/limiter.js` | 5/8 | 62.50% |
| `src/modules/pnr/routes.js` | 4/8 | 50.00% |
| `src/modules/pnr/service.js` | 9/12 | 75.00% |
| `src/modules/search/routes.js` | 13/15 | 86.66% |
| `src/modules/search/service.js` | 26/33 | 78.78% |
| `src/modules/tte/routes.js` | 4/4 | 100.00% |
| `src/modules/uptime/availability.js` | 10/11 | 90.90% |
| `src/modules/uptime/routes.js` | 3/10 | 30.00% |
| `src/modules/uptime/service.js` | 6/10 | 60.00% |
| `src/routes/health.js` | 0/0 | 100.00% |
| `src/security/cardScan.js` | 10/10 | 100.00% |
| `src/settings.js` | 4/4 | 100.00% |
| `src/tls.js` | 8/11 | 72.72% |

## Lowest branch coverage

Branches not taken are mostly error paths that need a failing database or a broken network (for example, a pool error inside a transaction), and logging. These are listed so they can be checked by review.

| File | Branches taken | Branch coverage |
|---|---|---|
| `src/db/migrate.js` | 0/7 | 0.00% |
| `src/modules/cancellation/routes.js` | 1/10 | 10.00% |
| `src/modules/chart/routes.js` | 1/10 | 10.00% |
| `src/modules/uptime/routes.js` | 3/10 | 30.00% |
| `src/modules/account/routes.js` | 5/12 | 41.66% |
| `src/modules/auth/routes.js` | 22/46 | 47.82% |
| `src/logger.js` | 1/2 | 50.00% |
| `src/modules/allocation/queue.js` | 1/2 | 50.00% |
