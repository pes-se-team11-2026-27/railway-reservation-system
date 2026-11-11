'use strict';
// Inventory reconciliation (RRS-NF-003, TC-REL-01). Prints every rule and its
// mismatches, writes reports/reconciliation.txt, and exits with 1 if anything
// does not agree, so CI fails. Usage: node scripts/reconcile.js
const fs = require('fs');
const { pool } = require('../src/db/pool');
const { reconcile } = require('../src/modules/inventory/reconcile');

reconcile(pool).then(async (r) => {
  const lines = [
    `Reconciliation ${new Date().toISOString()}`,
    `Bookings ${r.counts.bookings}, booked berths ${r.counts.booked_berths}, held berths ${r.counts.held_berths}, refunds ${r.counts.refunds}`,
    ...r.results.map((x) => `${x.mismatches === 0 ? 'PASS' : 'FAIL'}  ${x.id}: ${x.rule} (${x.mismatches} mismatches)`),
    r.ok ? 'Result: zero mismatches.' : 'Result: MISMATCHES FOUND.',
  ];
  for (const x of r.results.filter((y) => y.mismatches)) lines.push(`  ${x.id} examples: ${JSON.stringify(x.examples)}`);
  console.log(lines.join('\n'));
  fs.mkdirSync('reports', { recursive: true });
  fs.writeFileSync('reports/reconciliation.txt', `${lines.join('\n')}\n`);
  const md = [
    '# Inventory reconciliation',
    '',
    `RRS-NF-003, TC-REL-01. Run ${new Date().toISOString()}.`,
    '',
    `**Result: ${r.ok ? 'PASS' : 'FAIL'}.** ${r.ok ? 'Zero mismatches between the inventory and issued tickets.' : 'Mismatches found.'}`,
    '',
    `Checked: ${r.counts.bookings} bookings, ${r.counts.booked_berths} booked berths, ${r.counts.held_berths} held berths, ${r.counts.refunds} refunds.`,
    '',
    '| Rule | Mismatches | Result |',
    '|---|---|---|',
    ...r.results.map((x) => `| ${x.rule} | ${x.mismatches} | ${x.mismatches === 0 ? 'PASS' : 'FAIL'} |`),
    '',
  ].join('\n');
  fs.writeFileSync('reports/reconciliation.md', md);
  await pool.end();
  process.exit(r.ok ? 0 : 1);
}).catch((err) => { console.error(err); process.exit(2); });
