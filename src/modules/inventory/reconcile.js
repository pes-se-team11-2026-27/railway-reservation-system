'use strict';

// RRS-NF-003: inventory and issued tickets must agree exactly. Each check is
// a query that returns the rows breaking one rule; a healthy database
// returns none for every check. Read only, so it is safe to run any time.
const CHECKS = [
  {
    id: 'BOOKED_WITHOUT_TICKET',
    rule: 'Every booked berth belongs to a confirmed passenger of a confirmed booking',
    sql: `SELECT i.run_id, i.berth_id, i.hold_id FROM inventory i
           WHERE i.status = 'BOOKED' AND NOT EXISTS (
             SELECT 1 FROM holds h JOIN hold_passengers p ON p.hold_id = h.id
              WHERE h.id = i.hold_id AND h.status = 'CONFIRMED' AND p.status = 'CNF' AND p.berth_id = i.berth_id)`,
  },
  {
    id: 'TICKET_WITHOUT_BERTH',
    rule: 'Every confirmed passenger of a confirmed booking holds that berth in the inventory',
    sql: `SELECT h.run_id, p.berth_id, h.id AS hold_id FROM holds h JOIN hold_passengers p ON p.hold_id = h.id
           WHERE h.status = 'CONFIRMED' AND p.status = 'CNF' AND NOT p.refunded AND NOT EXISTS (
             SELECT 1 FROM inventory i WHERE i.run_id = h.run_id AND i.berth_id = p.berth_id
                AND i.status = 'BOOKED' AND i.hold_id = h.id)`,
  },
  {
    id: 'BERTH_SOLD_TWICE',
    rule: 'No berth on a run is given to two confirmed passengers',
    sql: `SELECT h.run_id, p.berth_id, count(*)::int AS passengers FROM holds h JOIN hold_passengers p ON p.hold_id = h.id
           WHERE h.status = 'CONFIRMED' AND p.status = 'CNF'
           GROUP BY h.run_id, p.berth_id HAVING count(*) > 1`,
  },
  {
    id: 'HELD_WITHOUT_ACTIVE_HOLD',
    rule: 'Every held berth belongs to a hold that is still active',
    sql: `SELECT i.run_id, i.berth_id, i.hold_id FROM inventory i
           WHERE i.status = 'HELD' AND NOT EXISTS (SELECT 1 FROM holds h WHERE h.id = i.hold_id AND h.status = 'ACTIVE')`,
  },
  {
    id: 'QUEUE_NUMBER_TWICE',
    rule: 'RAC numbers never repeat on a run and class; waitlist numbers never repeat on a run, class and quota',
    sql: `SELECT h.run_id, h.class_code, p.status, p.position, count(*)::int AS passengers
            FROM holds h JOIN hold_passengers p ON p.hold_id = h.id
           WHERE p.status IN ('RAC', 'WL') AND NOT p.refunded
             AND (h.status = 'CONFIRMED' OR (h.status = 'ACTIVE' AND h.expires_at > now()))
           GROUP BY h.run_id, h.class_code, p.status, p.position,
                    CASE WHEN p.status = 'WL' THEN h.quota_code END
          HAVING count(*) > 1`,
  },
  {
    id: 'TICKET_WITHOUT_PAYMENT',
    rule: 'Every booking has a successful payment whose allocation is confirmed',
    sql: `SELECT b.pnr, p.status, p.allocation_status FROM bookings b JOIN payments p ON p.tx_ref = b.payment_tx_ref
           WHERE p.status <> 'SUCCESS' OR p.allocation_status IS DISTINCT FROM 'CONFIRMED'`,
  },
  {
    id: 'REFUND_ABOVE_PAYMENT',
    rule: 'Refunds on a payment never add up to more than the payment',
    sql: `SELECT r.tx_ref, sum(r.amount_paise)::int AS refunded, p.amount_paise FROM refunds r JOIN payments p ON p.tx_ref = r.tx_ref
           GROUP BY r.tx_ref, p.amount_paise HAVING sum(r.amount_paise) > p.amount_paise`,
  },
];

async function reconcile(db) {
  const results = [];
  for (const c of CHECKS) {
    const { rows } = await db.query(c.sql);
    results.push({ id: c.id, rule: c.rule, mismatches: rows.length, examples: rows.slice(0, 5) });
  }
  const counts = (await db.query(
    `SELECT (SELECT count(*) FROM bookings)::int AS bookings,
            (SELECT count(*) FROM inventory WHERE status = 'BOOKED')::int AS booked_berths,
            (SELECT count(*) FROM inventory WHERE status = 'HELD')::int AS held_berths,
            (SELECT count(*) FROM refunds)::int AS refunds`)).rows[0];
  return { ok: results.every((r) => r.mismatches === 0), counts, results };
}

module.exports = { reconcile, CHECKS };
