# Accessibility and slow connection report

RRS-NF-006, TC-UX-01. Run 2026-11-11T17:22:16.948Z against https://localhost:3443.

**Result: PASS.** 50 page checks (25 pages in light and dark mode), 0 with violations. Booking on 1 Mbps: 8.7 seconds (target under 30).

Automated check: axe-core 4.10.3, rules for WCAG 2.0, 2.1 and 2.2 at levels A and AA. Manual checks (keyboard only booking, visible focus, logical order) are recorded in the System Validation report.

| Page | Path | Light | Dark |
|---|---|---|---|
| Search | `/search` | Pass | Pass |
| Search results | `/search?from=SBC&to=MAS&date=<date>` | Pass | Pass |
| Check a fare | `/fare` | Pass | Pass |
| PNR status | `/pnr` | Pass | Pass |
| Page not found | `/no-such-page` | Pass | Pass |
| Create account | `/register` | Pass | Pass |
| Create account: enter code | `/register` | Pass | Pass |
| Create account: verified | `/register/verify` | Pass | Pass |
| Sign in | `/signin` | Pass | Pass |
| Book | `/book?runId=<run>&class=SL&from=SBC&to=MAS` | Pass | Pass |
| Berths held | `/book` | Pass | Pass |
| Payment gateway | `/gateway/pay/<payment ref>` | Pass | Pass |
| Ticket | `/ticket/<PNR>` | Pass | Pass |
| Cancel: refund shown | `/ticket/<PNR>/cancel` | Pass | Pass |
| PNR status: result | `/pnr?number=<PNR>` | Pass | Pass |
| Staff sign in | `/staff/login` | Pass | Pass |
| Staff sign in: code | `/staff/login` | Pass | Pass |
| Staff home | `/staff` | Pass | Pass |
| Administration console | `/admin` | Pass | Pass |
| Fare rules | `/admin/fares` | Pass | Pass |
| Quota rules | `/admin/quotas` | Pass | Pass |
| Charts | `/admin/charts` | Pass | Pass |
| Availability | `/admin/availability` | Pass | Pass |
| Audit log | `/admin/audit` | Pass | Pass |
| Ticket check (handheld) | `/tte` | Pass | Pass |

## Booking on a slow connection

| Measure | Value |
|---|---|
| Connection | 1 Mbps down and up, 100 ms latency, browser cache off |
| Flow | Search results, booking form, hold berths, pay on the gateway page, ticket |
| Time | 8.7 seconds |
| Data transferred | 498 KB |
| Result | PASS (target under 30 seconds) |

