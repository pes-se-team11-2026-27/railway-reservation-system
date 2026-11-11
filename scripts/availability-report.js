'use strict';
// Monthly availability report (RRS-NF-004). Usage: node scripts/availability-report.js [YYYY-MM]
// Writes reports/availability-YYYY-MM.md.
const fs = require('fs');
const { pool } = require('../src/db/pool');
const { monthlyReport } = require('../src/modules/uptime/service');

const month = process.argv[2] || new Date().toISOString().slice(0, 7);
monthlyReport(month).then(async (r) => {
  const md = [
    `# Availability report, ${month}`,
    '',
    `RRS-NF-004: the booking service is available 99.5 percent of each month. Generated ${new Date().toISOString()}.`,
    '',
    `**${r.percent.toFixed(3)}% available: ${r.met ? 'target met' : 'BELOW TARGET'}.**`,
    '',
    '| Measure | Value |',
    '|---|---|',
    `| Period | ${r.from.toISOString()} to ${r.to.toISOString()} |`,
    `| Minutes monitored | ${r.minutes} |`,
    `| Minutes up | ${r.upMinutes} |`,
    `| Outages | ${r.outages.length} |`,
    '',
    'Method: the server writes one sample a minute while it and the database answer; a minute without a sample counts as down. The period starts when monitoring began or at the start of the month, whichever is later.',
    '',
    ...(r.outages.length ? ['| Down from | Until | Minutes |', '|---|---|---|', ...r.outages.map((o) => `| ${o.from.toISOString()} | ${o.to.toISOString()} | ${o.minutes} |`)] : ['No outages in this period.']),
    '',
  ].join('\n');
  console.log(md);
  fs.mkdirSync('reports', { recursive: true });
  fs.writeFileSync(`reports/availability-${month}.md`, md);
  await pool.end();
}).catch((err) => { console.error(err.message); process.exit(2); });
