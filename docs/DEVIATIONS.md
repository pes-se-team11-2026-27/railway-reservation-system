# Deviations from the submitted SRS, SAD and Test Plan

Team 11, Railway Reservation System. Kept up to date each sprint and explained in the final demo.
Each entry says what the document said, what was built, why, and what it affects.

## Sprint 1

| # | Document | What the document says | What was built | Why | Impact |
|---|---|---|---|---|---|
| D1 | SAD 4.3 API design | `InventoryService.holdBerths(trainId, date, classId, quotaId, count)` returns a hold; `confirmAllocation(holdId)` | `booking.createHold({ runId, classCode, quotaCode, passengers })` orchestrates; `inventory.lockFreeBerths`, `markHeld`, `releaseHoldBerths` own the rows. `confirmAllocation` moves to Sprint 2 with payment | Bookings attach to a dated train run, not a train plus date, and holds carry passenger details. Confirmation only makes sense once payment exists | Same behaviour as RRS-F-005 and F-006; interface names differ |
| D2 | SAD 3.4 components | AllocationEngine as one component | `src/modules/allocation` split into `allocate.js` (pure rule), `queue.js` (RAC and waitlist state, advisory lock) and `tatkal.js` (window) | A pure rule can be unit tested without a database | Easier testing; same responsibility |
| D3 | SRS RTM, STP Section 4 | RRS-F-008 (passenger limit) is Medium and outside the RTM | Implemented and tested in Sprint 1 (TC-BOOK-04) | Small, and it sits next to the Tatkal check | One extra tested requirement |
| D4 | SRS RRS-F-002 | OTP is sent to the mobile number | The code is generated, hashed and checked as specified, but shown on screen outside production because there is no SMS provider yet | SMS delivery belongs with the notification work in Sprint 2 (SAD ADR-03). Bulk SMS in India needs DLT registration | Verification logic complete; delivery pending |
| D5 | SRS RRS-SR-003 | Sign in with sessions, second factor for staff | `POST /api/auth/login` checks the password and lockout (SR-005) but issues no session yet; no sign in page | Nothing in Sprint 1 needs a signed in user; sessions arrive with payment and staff roles in Sprint 2 | Booking holds are anonymous in Sprint 1 |
| D6 | SRS 3.1 user interfaces | Booking flow of search, selection, passenger details, payment | Search is the home page; class chips on results go straight to booking; station and date pickers, Swap, recent routes, previous and next day links | Fewer steps, under RRS-NF-006 (usability and accessibility). These are usability additions, not new functional requirements | Accessibility verified with axe-core: zero WCAG 2.2 AA violations |
| D7 | SRS RRS-NF-006 | WCAG 2.1 level AA | Built and checked against WCAG 2.2 AA, the newer version | 2.2 includes everything in 2.1 plus target size and focus rules | Stricter than required |
| D8 | STP Section 5, Section 6 | Integration tests with Testcontainers | A PostgreSQL 15 service container in GitHub Actions, Docker Compose locally | Simpler to run on every push with no extra library | Same coverage; STP v1.1 updated |
| D9 | SAD 3.6, 5.3; STP 6, 8, 14 | Jira for tracking; SonarCloud for static analysis | GitHub Issues and Projects for backlog, sprints and defects; ESLint and Jest coverage (line and branch) in CI | Issues, pull requests and the board live in one place. Coverage reports come from Jest. SonarCloud can still be added | SAD v1.1 and STP v1.1 updated |
| D10 | SRS acceptance example for RRS-F-005 | 200 requests against 10 free berths | Demo data has 8 general quota berths per coach, so TC-BOOK-01 expects 8 confirmations | Seed data shape (8 general plus 2 Tatkal berths per coach) | Same property tested: every free berth confirmed exactly once |
| D11 | SRS 1.4 (Tatkal) | Tatkal as a separate quota | RAC and waitlist positions are shared per class and applied to Tatkal too | Simplification for Sprint 1 | Revisit if Tatkal needs its own waitlist |
| D12 | Process (Part-2) | Repository owner reviews and merges every PR | In Sprint 1 authors merged their own PRs after green CI. The owner added review comments afterwards. From Sprint 2 `main` is protected: one approving review, green CI, and only the owner can merge | The rule was applied late in Sprint 1 | Fixed for Sprint 2 onward |
| D13 | Process | Code written by the team | PR #19 contains two commits made with GitHub Copilot's coding agent after the first commit failed CI. Permitted under the course rules on GPT use; reviewed, behaviour unchanged and all tests pass | Permitted tool use, recorded for transparency | None |

## Sprint 2

Add entries here as they happen.
