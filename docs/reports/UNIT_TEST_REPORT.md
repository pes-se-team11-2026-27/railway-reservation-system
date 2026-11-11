# Unit Test Report

Railway Reservation System, Team 11, UE23CS341A, PES University.

Generated 2026-11-11T18:30:59.245Z from commit `1776d65` on Node.js v20.20.2. Unit tests check one function or module on its own, with no database or network.

**Result: PASS.** 103 of 103 unit tests passed in 21 files.

Tool: Jest 29 (`npm run test:unit`). The same tests run in GitHub Actions on every push and pull request.

## Summary by file

| Test file | What it covers | Tests | Passed | Failed | Time |
|---|---|---|---|---|---|
| `tests/unit/cardScan.test.js` | card number detection (NF-005, SR-002) | 6 | 6 | 0 | 0.0 s |
| `tests/unit/pnr.test.js` | PNR and ticket rules (F-012) | 5 | 5 | 0 | 0.3 s |
| `tests/unit/tteVerify.test.js` | handheld ticket check (F-018) | 7 | 7 | 0 | 0.0 s |
| `tests/unit/cancelRules.test.js` | cancellation refund slabs (F-015) | 8 | 8 | 0 | 0.0 s |
| `tests/unit/password.test.js` | password hashing (SR-005) | 7 | 7 | 0 | 0.2 s |
| `tests/unit/accountValidation.test.js` | registration validation (F-001) | 6 | 6 | 0 | 0.0 s |
| `tests/unit/fareCalc.test.js` | fare calculation (F-010) | 7 | 7 | 0 | 0.0 s |
| `tests/unit/tls.test.js` | TLS settings (SR-001) | 5 | 5 | 0 | 0.0 s |
| `tests/unit/searchInput.test.js` | search input checks (F-003) | 4 | 4 | 0 | 0.0 s |
| `tests/unit/allocate.test.js` | allocation order (F-007) | 6 | 6 | 0 | 0.0 s |
| `tests/unit/lockout.test.js` | sign in lockout rule (SR-005) | 4 | 4 | 0 | 0.0 s |
| `tests/unit/totp.test.js` | authenticator codes (SR-003 second factor) | 4 | 4 | 0 | 0.0 s |
| `tests/unit/availability.test.js` | availability from minute samples (NF-004) | 5 | 5 | 0 | 0.0 s |
| `tests/unit/pnrLookup.test.js` | PNR lookup limit (SR-004) | 4 | 4 | 0 | 0.0 s |
| `tests/unit/gateway.test.js` | gateway callback signature (F-011) | 5 | 5 | 0 | 0.0 s |
| `tests/unit/config.test.js` | config int parser | 2 | 2 | 0 | 0.0 s |
| `tests/unit/passengerStatus.test.js` | maskIfCancelled (bug #67) | 4 | 4 | 0 | 0.0 s |
| `tests/unit/errors.test.js` | AppError helpers | 2 | 2 | 0 | 0.0 s |
| `tests/unit/tatkal.test.js` | Tatkal window (F-009) | 5 | 5 | 0 | 0.0 s |
| `tests/unit/holdValidation.test.js` | hold request validation | 4 | 4 | 0 | 0.0 s |
| `tests/unit/correlationId.test.js` | correlationId middleware | 3 | 3 | 0 | 0.0 s |
| **Total** | | **103** | **103** | **0** | |

## Every test

### tests/unit/cardScan.test.js

- PASS: card number detection (NF-005, SR-002) > the Luhn checksum separates card numbers from other long numbers
- PASS: card number detection (NF-005, SR-002) > finds card numbers written plainly, in groups, or with dashes, and masks them
- PASS: card number detection (NF-005, SR-002) > ignores PNRs, mobiles, references and numbers that fail the checksum
- PASS: card number detection (NF-005, SR-002) > ignores digit runs inside hashes and tokens (no false alarms from session hashes)
- PASS: card number detection (NF-005, SR-002) > finds card fields such as a stored security code
- PASS: logs never carry card data or secrets > card fields, passwords and session cookies are replaced before writing

### tests/unit/pnr.test.js

- PASS: PNR and ticket rules (F-012) > a PNR is 10 digits and never starts with 0
- PASS: PNR and ticket rules (F-012) > PNRs are not repeated in a large sample
- PASS: PNR and ticket rules (F-012) > the journey is optional but checked when given
- PASS: PNR and ticket rules (F-012) > a bad station code is refused (error case)
- PASS: PNR and ticket rules (F-012) > a ticket is visible to its passenger and to verified staff only

### tests/unit/tteVerify.test.js

- PASS: handheld ticket check (F-018) > reads the ticket QR code and a typed PNR
- PASS: handheld ticket check (F-018) > a confirmed ticket on this chart is valid, with berth
- PASS: handheld ticket check (F-018) > an RAC ticket is valid too
- PASS: handheld ticket check (F-018) > a cancelled ticket is not valid, and says so
- PASS: handheld ticket check (F-018) > a waitlisted ticket dropped at chart time is not valid
- PASS: handheld ticket check (F-018) > a ticket for another train or date is not valid, with the reason
- PASS: handheld ticket check (F-018) > unreadable codes and a missing chart are reported, not crashed on (error cases)

### tests/unit/cancelRules.test.js

- PASS: cancellation refund slabs (F-015) > 48 hours or more before departure: only the flat charge is kept (boundary)
- PASS: cancellation refund slabs (F-015) > 12 to 48 hours: 25% is kept, but never less than the flat charge
- PASS: cancellation refund slabs (F-015) > 4 to 12 hours: 50% is kept (boundary at 12 and 4)
- PASS: cancellation refund slabs (F-015) > under 4 hours cancellation is closed
- PASS: cancellation refund slabs (F-015) > a waitlisted passenger only pays the clerkage
- PASS: cancellation refund slabs (F-015) > the charge never exceeds the fare
- PASS: cancellation refund slabs (F-015) > a fare is split across passengers in whole paise
- PASS: cancellation refund slabs (F-015) > bad slab settings are refused (error case)

### tests/unit/password.test.js

- PASS: password hashing (SR-005) > hash is not the plain password and verifies correctly
- PASS: password hashing (SR-005) > wrong password does not verify
- PASS: password hashing (SR-005) > same password hashes differently each time (per account salt)
- PASS: password hashing (SR-005) > malformed stored hash returns false instead of throwing (error case)
- PASS: password policy > 7 characters is rejected, 8 is accepted (boundary)
- PASS: password policy > needs a letter and a digit
- PASS: password policy > missing password is rejected

### tests/unit/accountValidation.test.js

- PASS: registration validation (F-001) > accepts a valid registration
- PASS: registration validation (F-001) > mobile must be exactly 10 digits (boundary)
- PASS: registration validation (F-001) > mobile must start with 6 to 9
- PASS: registration validation (F-001) > rejects bad email, short name and weak password
- PASS: registration validation (F-001) > missing body is rejected (error case)
- PASS: payment gate (F-002) > only a verified account may proceed to payment

### tests/unit/fareCalc.test.js

- PASS: fare calculation (F-010) > Bengaluru to Chennai, SL, 1 passenger = Rs 200
- PASS: fare calculation (F-010) > Bengaluru to Chennai, 3A, 1 passenger = Rs 513.75 with 5% GST
- PASS: fare calculation (F-010) > Katpadi to Chennai, SL, 142 km is charged as 200 km = Rs 125
- PASS: fare calculation (F-010) > minimum distance boundary: 199 and 200 km cost the same, 201 km is charged as 201
- PASS: fare calculation (F-010) > base fare rounds up to the next Rs 5, not down
- PASS: fare calculation (F-010) > total equals the sum of the parts, and the fee is charged once per booking
- PASS: fare calculation (F-010) > zero passengers or zero distance is rejected (error case)

### tests/unit/tls.test.js

- PASS: TLS settings (SR-001) > refuses anything below TLS 1.2 and allows 1.3
- PASS: TLS settings (SR-001) > plain HTTP is redirected to the same path on HTTPS
- PASS: TLS settings (SR-001) > port 443 is left out of the redirect (boundary)
- PASS: TLS settings (SR-001) > the redirect uses 308 so a POST stays a POST
- PASS: TLS settings (SR-001) > the HTTPS wrapper adds HSTS and then hands over to the app

### tests/unit/searchInput.test.js

- PASS: search input checks (F-003) > valid input passes
- PASS: search input checks (F-003) > same origin and destination is refused
- PASS: search input checks (F-003) > missing station is refused
- PASS: search input checks (F-003) > malformed and past dates are refused (boundary)

### tests/unit/allocate.test.js

- PASS: allocation order (F-007) > all passengers confirmed when enough berths are free
- PASS: allocation order (F-007) > overflow goes to RAC, then waitlist, in passenger order
- PASS: allocation order (F-007) > exactly enough berths leaves RAC untouched (boundary)
- PASS: allocation order (F-007) > numbers continue after positions already taken
- PASS: allocation order (F-007) > no RAC capacity sends everyone to the waitlist
- PASS: allocation order (F-007) > more RAC taken than capacity never gives a negative count (error case)

### tests/unit/lockout.test.js

- PASS: sign in lockout rule (SR-005) > first four failures only count up
- PASS: sign in lockout rule (SR-005) > the fifth failure locks for 15 minutes and resets the count (boundary)
- PASS: sign in lockout rule (SR-005) > locked until the time passes
- PASS: sign in lockout rule (SR-005) > no lock time means not locked

### tests/unit/totp.test.js

- PASS: authenticator codes (SR-003 second factor) > base32 secret decodes to the RFC secret
- PASS: authenticator codes (SR-003 second factor) > matches the published RFC 6238 test vectors
- PASS: authenticator codes (SR-003 second factor) > accepts the current code and one step of clock drift either side (boundary)
- PASS: authenticator codes (SR-003 second factor) > refuses malformed codes instead of throwing (error case)

### tests/unit/availability.test.js

- PASS: availability from minute samples (NF-004) > every minute sampled is 100 percent
- PASS: availability from minute samples (NF-004) > 99.5 percent exactly meets the target; one minute less does not (boundary)
- PASS: availability from minute samples (NF-004) > missing minutes are reported as outages with their length
- PASS: availability from minute samples (NF-004) > an outage still running at the end of the window is reported
- PASS: availability from minute samples (NF-004) > samples outside the window are ignored, and seconds within a minute count as that minute

### tests/unit/pnrLookup.test.js

- PASS: PNR lookup limit (SR-004) > 30 lookups in a minute are allowed and the 31st is refused (boundary)
- PASS: PNR lookup limit (SR-004) > lookups older than a minute stop counting
- PASS: PNR lookup limit (SR-004) > each client has its own count
- PASS: initials only > names become initials

### tests/unit/gateway.test.js

- PASS: gateway callback signature (F-011) > a signature made with the shared secret verifies
- PASS: gateway callback signature (F-011) > changing the status after signing breaks the signature (tampering)
- PASS: gateway callback signature (F-011) > a signature made with another secret is refused
- PASS: gateway callback signature (F-011) > field order in the body does not matter, only the values
- PASS: gateway callback signature (F-011) > missing or malformed signatures are refused, not thrown (error case)

### tests/unit/config.test.js

- PASS: config int parser > parses a number string
- PASS: config int parser > falls back on missing or invalid values (boundary)

### tests/unit/passengerStatus.test.js

- PASS: maskIfCancelled (bug #67) > a cancelled booking shows its passengers as CANCELLED with no berth
- PASS: maskIfCancelled (bug #67) > a waitlisted or RAC passenger of a cancelled booking loses the queue position too
- PASS: maskIfCancelled (bug #67) > a confirmed booking is returned unchanged
- PASS: maskIfCancelled (bug #67) > only keys the passenger already has are touched, and the input is not modified

### tests/unit/errors.test.js

- PASS: AppError helpers > badRequest carries status 400 and the code
- PASS: AppError helpers > notFound and conflict map to 404 and 409

### tests/unit/tatkal.test.js

- PASS: Tatkal window (F-009) > opens at the configured time on the day before the journey
- PASS: Tatkal window (F-009) > one minute early is closed, exactly on time is open (boundary)
- PASS: Tatkal window (F-009) > crosses a month boundary correctly
- PASS: Tatkal window (F-009) > message states the opening time
- PASS: Tatkal window (F-009) > a malformed setting is rejected (error case)

### tests/unit/holdValidation.test.js

- PASS: hold request validation > accepts a valid request
- PASS: hold request validation > needs at least one and at most six passengers (boundary)
- PASS: hold request validation > age must be 1 to 125 (boundary)
- PASS: hold request validation > rejects unknown quota, bad run id and bad gender (error cases)

### tests/unit/correlationId.test.js

- PASS: correlationId middleware > generates an id when none is sent
- PASS: correlationId middleware > reuses a well formed incoming id
- PASS: correlationId middleware > rejects a malformed incoming id (error case)
