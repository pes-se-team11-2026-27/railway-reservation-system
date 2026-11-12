# Railway Reservation System

[![CI](https://github.com/pes-se-team11-2026-27/railway-reservation-system/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/pes-se-team11-2026-27/railway-reservation-system/actions/workflows/ci.yml?query=branch%3Amain) [![Overall coverage](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fpes-se-team11-2026-27%2Frailway-reservation-system%2Fbadges%2Fcoverage.json)](docs/reports/CODE_COVERAGE_REPORT.md) [![Lint score](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fpes-se-team11-2026-27%2Frailway-reservation-system%2Fbadges%2Flint.json)](https://github.com/pes-se-team11-2026-27/railway-reservation-system/actions/workflows/ci.yml?query=branch%3Amain) [![Branch coverage](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fpes-se-team11-2026-27%2Frailway-reservation-system%2Fbadges%2Fbranches.json)](docs/reports/BRANCH_COVERAGE_REPORT.md) [![Tests](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fpes-se-team11-2026-27%2Frailway-reservation-system%2Fbadges%2Ftests.json)](docs/reports/UNIT_TEST_REPORT.md)

Software Engineering Laboratory Project, UE23CS341A, PES University
Team 11, Class 5A CSE, academic year 2026-27

| Name | SRN | GitHub |
|---|---|---|
| Abhigyan Dutta | PES2UG24CS019 | [UltraBot05](https://github.com/UltraBot05) (repository owner) |
| Akash Singh | PES2UG24CS042 | [akash-singh-1847u](https://github.com/akash-singh-1847u) |
| Aditya Alur | PES2UG24CS052 | [Integrationydx](https://github.com/Integrationydx) |
| Aditya G. Mule | PES2UG24CS031 | [AdityaGMule1405](https://github.com/AdityaGMule1405) |

## About

An online and counter based system for searching trains, reserving berths (with RAC, waitlist and Tatkal), paying for and cancelling tickets, preparing the reservation chart before departure, and checking tickets on board, even with no network. Passengers, booking clerks, administrators and ticket examiners all work against one shared seat inventory.

| | |
|---|---|
| Status | Sprints 1, 2 and 3 complete. 32 of 32 test cases pass; 295 automated tests; 90.99% line and 76.34% branch coverage |
| Project board (backlog, story points, sprints) | [Railway Reservation System Board](https://github.com/orgs/pes-se-team11-2026-27/projects/1) |
| Documents | [docs](docs): SRS, SAD, Test Plan, deviation log |
| Test reports | [docs/reports](docs/reports): unit test, system validation, code coverage, branch coverage |
| Sprint videos | [Sprint 1](docs/videos/sprint1-demo.mp4), [Sprint 2](docs/videos/sprint2-demo.mp4) (open with View raw or download) |
| Sprint 2 freeze | tag [`sprint2-freeze`](https://github.com/pes-se-team11-2026-27/railway-reservation-system/tree/sprint2-freeze) |

## Running the project

You need Docker Desktop. From the project folder:

```
docker compose up --build
```

This starts PostgreSQL and the app, applies database migrations and loads demo data on first run. Open **https://localhost:3443** (plain http://localhost:3000 redirects there). The certificate is self signed, so the browser warns once; choose to continue. To start again with fresh demo data: `docker compose down -v`, then `docker compose up --build`.

To avoid the warning, make a certificate your machine trusts with [mkcert](https://github.com/FiloSottile/mkcert) (`mkcert -install`, then `mkcert -cert-file certs-local/localhost.pem -key-file certs-local/localhost-key.pem localhost 127.0.0.1`) and add a `docker-compose.override.yml` that mounts `./certs-local` and sets `TLS_CERT` and `TLS_KEY` to those files. Neither file is committed.

### Demo accounts (development only)

Passengers register at `/register`; the one time code is shown on screen because there is no SMS provider in development.

| Staff username | Password | Role |
|---|---|---|
| `admin1` | `Admin@2026` | Reservation administrator |
| `clerk1` | `Clerk@2026` | Booking clerk |
| `tte1` | `Tte@2026` | Ticket examiner |

Staff sign in from the **Staff sign in** link in the footer. After the password, the code page shows the current authenticator code in development.

### Running without Docker

Needs Node.js 20 and a local PostgreSQL.

```
npm install
cp .env.example .env        (Windows PowerShell: copy .env.example .env)
npm run migrate
npm run seed
npm run dev
```

## Tests

| Command | What it runs |
|---|---|
| `npm run lint` | ESLint over the whole project |
| `npm run test:unit` | Unit tests in `tests/unit` (103), no database needed |
| `npm run test:integration` | Integration tests in `tests/integration` (192), need PostgreSQL at `DATABASE_URL` |
| `npm run test:coverage` | Everything, with line and branch coverage in `coverage/` |
| `npm run scan:card-data` | Scans every table and a pg_dump backup for card data; fails if any is found |
| `npm run reconcile` | Checks that the inventory and issued tickets agree; fails on any mismatch |

Integration tests wipe and rebuild the database they point at, so give them a separate database such as `rrs_test`.

## CI/CD and how we work

GitHub Actions (`.github/workflows/ci.yml`) runs on every push and pull request, and by hand from the Actions tab. Each stage writes its results to the run's summary page. Two headline scores are checked on every run and shown as **Lint** and **Coverage** lines in each commit's and PR's checks list, as annotations on the run, and in the badges at the top of this page (updated on every push to `main`):

- **Lint score out of 10**, minimum **9.5**: 10 − (5 × errors + warnings) ÷ statements × 10, the Pylint formula, over every linted file.
- **Overall coverage**, minimum **80%**: covered statements, branches and functions over their totals. Lines (85%), statements (85%), functions (85%) and branches (70%) also have their own minimums.

The build fails if either score is below its minimum.

| Stage | What it checks |
|---|---|
| Lint and test | ESLint over the backend, the browser code, the service worker and the k6 scripts; unit tests; integration tests against PostgreSQL with coverage minimums (lines, statements and functions 85%, branches 70%); card data scan; inventory reconciliation |
| Frontend and accessibility | Starts the app and checks 25 pages in light and dark mode against WCAG 2.2 AA, then books on an emulated 1 Mbps connection |
| Performance smoke | Short k6 booking, search and Tatkal burst runs against the live app, then the reconciliation |
| Dependency audit | Fails on a high or critical advisory in a production dependency |
| Docker build | Builds the image once every stage above has passed |

`main` is protected. Every change arrives as a pull request opened by the member assigned to the issue, needs green CI and an approving review, and is merged by the repository owner.

## Project layout

```
src/            application code: Express app, config, database pool, modules
src/modules/    one folder per feature (account, search, booking, payment,
                cancellation, chart, admin, audit, auth, pnr, tte, ...)
src/security/   card data scanner
db/migrations/  SQL migrations, applied in file name order
db/seed/        demo data
public/         styles, browser scripts, the offline handheld app
scripts/        command line tools (card data scan)
tests/          unit and integration tests
docs/           SRS, SAD, Test Plan, deviation log, sprint videos
diagrams/       use case, component and sequence diagrams
```

## Documents

| Document | Version | Location |
|---|---|---|
| Software Requirements Specification (SRS) | 1.0 | [docs/SRS](docs/SRS) |
| Software Architecture and Design Specification (SAD) | 1.2 | [docs/SAD](docs/SAD) |
| Software Test Plan (STP), with test case results | 1.3 | [docs/STP](docs/STP) |
| Test reports (unit, system validation, code coverage, branch coverage) | Sprint 3 | [docs/reports](docs/reports) |
| Deviations from the documents, with reasons | Sprint 1 and 2 | [docs/DEVIATIONS.md](docs/DEVIATIONS.md) |

## Technology stack

Node.js 20, Express, PostgreSQL 15 through the pg driver (plain SQL), EJS templates, a PWA for the handheld (service worker, IndexedDB, html5-qrcode), Docker Compose, Jest and Supertest for tests, k6 for load tests, GitHub Actions for CI. See SAD Section 3.6 for the reasoning.

## Sprint 1 features (complete)

| Feature | Requirement | Where to see it |
|---|---|---|
| Passenger registration, one account per mobile | RRS-F-001 | `/register` |
| OTP verification of the mobile number | RRS-F-002 | `/register`, `/signin` |
| Train search between stations by date | RRS-F-003 | `/search` |
| Live availability per class and quota | RRS-F-004 | `/search` |
| Berth hold, no double allocation, 10 minute expiry | RRS-F-005, F-006 | `/book` |
| Quota, then RAC, then waitlist, in request order | RRS-F-007 | `/book` |
| Passenger limits (6 general, 4 Tatkal) | RRS-F-008 | `/book` |
| Tatkal opening window | RRS-F-009 | `/book`, quota Tatkal |
| Itemised fare breakup | RRS-F-010 | `/fare` |
| Password hashing and sign in lockout | RRS-SR-005 | `/signin`, staff sign in |

## Sprint 2 features (complete)

| Feature | Requirement | Where to see it |
|---|---|---|
| Payment on the gateway's hosted page, token only | RRS-F-011 | **Pay now** after holding berths |
| PNR, QR ticket and messages only after payment | RRS-F-012 | `/ticket/<PNR>` |
| Repeated payment callbacks count once | RRS-F-013 | `POST /api/payments/callback` |
| Automatic refund when the berths are gone | RRS-F-014 | payment return page |
| Cancellation with slab refunds | RRS-F-015 | **Cancel ticket** on the ticket |
| RAC and waitlist promotion on cancellation | RRS-F-016 | automatic |
| Reservation chart before departure | RRS-F-017 | `/admin/charts`, `/chart/<run>` |
| Handheld ticket check, works offline | RRS-F-018 | `/tte` (examiner) |
| Fare and quota rules with effective dates | RRS-F-019 | `/admin/fares`, `/admin/quotas` |
| Append only audit log | RRS-F-020 | `/admin/audit` |
| Card data never stored, logged or backed up | RRS-NF-005, SR-002 | CI card data scan |
| HTTPS, TLS 1.2 minimum | RRS-SR-001 | https://localhost:3443 |
| Staff roles, second factor, idle lock | RRS-SR-003 | Staff sign in |
| Public PNR status with initials only | RRS-SR-004 | `/pnr` |

## Sprint 3 (testing, complete)

| Item | Requirement | Result | How to run |
|---|---|---|---|
| Booking load test, 50 a second for a minute | RRS-NF-001 | PASS: 95th percentile 8 ms (target 3 s), no failures | `k6 run load/booking.js` |
| Search load test, 1000 users | RRS-NF-002 | PASS: 95th percentile 46 ms (target 2 s), no failures | `k6 run load/search.js` |
| Tatkal burst, then reconciliation | RRS-NF-003 | PASS: 200 users on one train, zero mismatches | `k6 run load/tatkal-burst.js`, then `npm run reconcile` |
| Monthly availability report | RRS-NF-004 | PASS: 100% over the monitored period | `/admin/availability`, or `node scripts/availability-report.js` |
| Accessibility audit and 1 Mbps booking | RRS-NF-006 | PASS: 25 pages in light and dark mode, 0 violations; booking in 8.7 s (target 30 s) | `node scripts/a11y-audit.js` |
| Defect #67, cancelled bookings shown as confirmed | RRS-F-015 | Fixed, regression test TC-CAN-03 | |
| The four test reports | Part 3 | Unit 103/103, system validation 32/32, coverage 90.99% lines and 76.34% branches | `npm run test:report`, then `npm run reports:build` |

All results and the four reports are in [docs/reports](docs/reports). The official reports are built from the CI run on Linux.
