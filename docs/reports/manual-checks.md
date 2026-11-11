# Manual checks

The parts of the Test Plan that need a person: keyboard only use and the handheld on a real browser with the network off. Fill in the tester, the date and each result, then set the overall result line.

Tester: Aditya G. Mule  Date: 2026-11-11  Browser and device: Chromium (Chrome on Windows 11)

**Result: PASS.**

## TC-UX-01: booking with the keyboard only (RRS-NF-006)

Do not touch the mouse or trackpad. Start at https://localhost:3443 signed in as a passenger.

| Step | Expected | Result |
|---|---|---|
| Tab from the top of the search page | Focus is always visible and moves in reading order: skip link, navigation, From, To, Date, Search | PASS (Skip link -> nav -> From -> Swap -> To -> Date -> Search trains) |
| Choose stations and a date with the keyboard (arrows, Enter, Escape in the pickers) | Pickers open, change and close with the keyboard; Escape returns focus to the field | PASS (Pickers opened with ArrowDown/Enter; Escape returned focus to combobox and #date-trigger) |
| Tab to a class in the results and press Enter | The booking form opens | PASS (Opened /book?runId=2&class=SL&from=SBC&to=MAS) |
| Fill one passenger, Tab to Hold berths, press Enter | Berths held; the result is announced and focus moves to it | PASS (Berths held page loaded with role="status" live region; Tab proceeds directly to Pay now) |
| Tab to Pay now, Enter; on the gateway page Tab to Pay (test success), Enter | The ticket opens with the PNR | PASS (Ticket issued at /ticket/3457982606) |

## TC-CHT-02: handheld ticket check with no network (RRS-F-018)

| Step | Expected | Result |
|---|---|---|
| Staff sign in as tte1, Ticket check, pick a train with bookings, Download chart | "Chart on this device" with the right train, date and counts | PASS (12608 Lalbagh Express, 2026-11-12, 2 bookings, 2 passengers; SW activated) |
| Stop the server (`docker compose stop app`) and turn Wi-Fi off, then reload the page | The page loads from the device and says Offline | PASS (Loaded from service worker cache; chip showed "Offline: checking from the chart on this device") |
| Type the PNR of a valid ticket, Check | Valid, with the passenger and berth | PASS (3457982606 -> Valid: Aditya Mule, 22: S1/1) |
| Type the PNR of a cancelled ticket, Check | Not valid, cancelled | PASS (5099560730 -> Not valid: cancelled) |
| Type 9999999999, Check | Not valid, another train or date | PASS (9999999999 -> Not valid: not on chart of 12608, another train or date) |
| Restore: Wi-Fi on, `docker compose start app` | | PASS (Restored online) |
