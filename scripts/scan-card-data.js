'use strict';
// Card data scan (TC-SEC-01, TC-SEC-03): database, log files and a backup.
// Usage: node scripts/scan-card-data.js [--backup] [log files...]
// Exits with 1 if anything card shaped is found, so CI fails.
const fs = require('fs');
const { execFileSync } = require('child_process');
const { config } = require('../src/config');
const { pool } = require('../src/db/pool');
const { scanText, scanDatabase } = require('../src/security/cardScan');

async function main() {
  const args = process.argv.slice(2);
  const report = [];
  const findings = [];

  const db = await scanDatabase(pool);
  findings.push(...db.findings);
  report.push(`Database: ${db.tablesScanned} tables scanned`);

  for (const file of args.filter((a) => !a.startsWith('--'))) {
    if (!fs.existsSync(file)) { report.push(`Log ${file}: not found, skipped`); continue; }
    findings.push(...scanText(fs.readFileSync(file, 'utf8'), `log ${file}`));
    report.push(`Log ${file}: scanned`);
  }

  if (args.includes('--backup')) {
    try {
      const dump = execFileSync('pg_dump', ['--no-owner', '--data-only', config.databaseUrl], { maxBuffer: 256 * 1024 * 1024 }).toString();
      findings.push(...scanText(dump, 'backup (pg_dump)'));
      report.push(`Backup: pg_dump of ${dump.length} bytes scanned`);
    } catch (err) {
      report.push(`Backup: pg_dump not available here, skipped (${err.code || 'error'})`);
    }
  }

  report.push(findings.length ? `FOUND ${findings.length} card data item(s):` : 'No card data found.');
  for (const f of findings) report.push(`  ${f.kind} in ${f.source}: ${f.match}`);
  const text = report.join('\n');
  console.log(text);
  fs.mkdirSync('reports', { recursive: true });
  fs.writeFileSync('reports/card-data-scan.txt', `${new Date().toISOString()}\n${text}\n`);
  await pool.end();
  process.exit(findings.length ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(2); });
