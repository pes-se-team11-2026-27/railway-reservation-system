# Inventory reconciliation

RRS-NF-003, TC-REL-01. Run 2026-11-11T16:05:46.106Z.

**Result: PASS.** Zero mismatches between the inventory and issued tickets.

Checked: 0 bookings, 0 booked berths, 450 held berths, 0 refunds.

| Rule | Mismatches | Result |
|---|---|---|
| Every booked berth belongs to a confirmed passenger of a confirmed booking | 0 | PASS |
| Every confirmed passenger of a confirmed booking holds that berth in the inventory | 0 | PASS |
| No berth on a run is given to two confirmed passengers | 0 | PASS |
| Every held berth belongs to a hold that is still active | 0 | PASS |
| RAC numbers never repeat on a run and class; waitlist numbers never repeat on a run, class and quota | 0 | PASS |
| Every booking has a successful payment whose allocation is confirmed | 0 | PASS |
| Refunds on a payment never add up to more than the payment | 0 | PASS |
