'use strict';
// Writes a readable summary of one CI stage to the GitHub Actions run page
// (the GITHUB_STEP_SUMMARY file), or to the terminal when run by hand.
// Usage: node scripts/ci-summary.js <lint|tests|data|frontend|performance|audit>
const fs = require('fs');

const exists = (p) => fs.existsSync(p);
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const pct = (n) => `${Number(n).toFixed(2)}%`;
const resultLine = (p) => {
  if (!exists(p)) return 'not run';
  const m = /\*\*Result: (PASS|FAIL)[^*]*\*\*\s*(.*)/.exec(fs.readFileSync(p, 'utf8'));
  return m ? `${m[1]}. ${m[2]}`.trim() : 'no result';
};

const sections = {
  lint() {
    if (!exists('reports/eslint.json')) return ['## Lint', '', 'No ESLint results.'];
    const files = readJson('reports/eslint.json');
    const area = (f) => (f.includes('/public/') ? 'Frontend (browser code)' : f.includes('/load/') ? 'Load tests (k6)' : f.includes('/tests/') ? 'Tests' : 'Backend');
    const by = {};
    for (const f of files) {
      const a = area(f.filePath);
      by[a] = by[a] || { files: 0, errors: 0, warnings: 0 };
      by[a].files += 1; by[a].errors += f.errorCount; by[a].warnings += f.warningCount;
    }
    const errors = files.reduce((n, f) => n + f.errorCount, 0);
    const warnings = files.reduce((n, f) => n + f.warningCount, 0);
    return [
      '## Lint',
      '',
      `**${errors === 0 ? 'PASS' : 'FAIL'}**: ${files.length} files, ${errors} errors, ${warnings} warnings (ESLint, recommended rules).`,
      '',
      '| Area | Files | Errors | Warnings |',
      '|---|---|---|---|',
      ...Object.entries(by).map(([a, v]) => `| ${a} | ${v.files} | ${v.errors} | ${v.warnings} |`),
    ];
  },

  tests() {
    const out = ['## Tests and coverage', ''];
    if (exists('reports/jest-results.json')) {
      const j = readJson('reports/jest-results.json');
      const unit = j.testResults.filter((f) => /[\\/]tests[\\/]unit[\\/]/.test(f.name));
      const integ = j.testResults.filter((f) => /[\\/]tests[\\/]integration[\\/]/.test(f.name));
      const n = (list, s) => list.reduce((c, f) => c + f.assertionResults.filter((a) => !s || a.status === s).length, 0);
      out.push(
        `**${j.success ? 'PASS' : 'FAIL'}**: ${j.numPassedTests} of ${j.numTotalTests} tests passed in ${j.numTotalTestSuites} files.`,
        '',
        '| Level | Files | Passed | Failed |',
        '|---|---|---|---|',
        `| Unit (no database) | ${unit.length} | ${n(unit, 'passed')} | ${n(unit, 'failed')} |`,
        `| Integration (PostgreSQL) | ${integ.length} | ${n(integ, 'passed')} | ${n(integ, 'failed')} |`,
        '',
      );
    }
    if (exists('coverage/coverage-summary.json')) {
      const t = readJson('coverage/coverage-summary.json').total;
      const min = { lines: 85, statements: 85, functions: 85, branches: 70 };
      out.push(
        '| Coverage | Covered | Total | Percent | Minimum |',
        '|---|---|---|---|---|',
        ...['lines', 'statements', 'functions', 'branches'].map((k) => `| ${k[0].toUpperCase()}${k.slice(1)} | ${t[k].covered} | ${t[k].total} | **${pct(t[k].pct)}** | ${min[k]}% |`),
      );
    }
    return out;
  },

  data() {
    const scan = exists('reports/card-data-scan.txt') ? fs.readFileSync('reports/card-data-scan.txt', 'utf8') : '';
    return [
      '## Data checks',
      '',
      '| Check | Requirement | Result |',
      '|---|---|---|',
      `| Card data scan of every table and a backup | RRS-NF-005, RRS-SR-002 | ${!scan ? 'not run' : /No card data found/.test(scan) ? 'PASS. No card data found.' : 'FAIL. Card data found.'} |`,
      `| Inventory reconciliation, seven rules | RRS-NF-003 | ${resultLine('reports/reconciliation.md')} |`,
    ];
  },

  frontend() {
    return ['## Frontend and accessibility', '', `RRS-NF-006: ${resultLine('reports/accessibility.md')}`];
  },

  performance() {
    return [
      '## Performance smoke',
      '',
      'Short versions of the Sprint 3 load tests against the app running in CI. The full runs are in `docs/reports`.',
      '',
      '| Test | Result |',
      '|---|---|',
      `| Booking (RRS-NF-001) | ${resultLine('reports/load-booking.md')} |`,
      `| Search (RRS-NF-002) | ${resultLine('reports/load-search.md')} |`,
      `| Tatkal burst (RRS-NF-003) | ${resultLine('reports/load-tatkal-burst.md')} |`,
      `| Reconciliation after the burst | ${resultLine('reports/reconciliation.md')} |`,
    ];
  },

  audit() {
    const sev = (p) => (exists(p) ? (readJson(p).metadata || {}).vulnerabilities || {} : null);
    const row = (label, v) => (v ? `| ${label} | ${v.critical || 0} | ${v.high || 0} | ${v.moderate || 0} | ${v.low || 0} |` : `| ${label} | not run | | | |`);
    const prod = sev('reports/audit-production.json');
    return [
      '## Dependency audit',
      '',
      `**${prod && !prod.critical && !prod.high ? 'PASS' : 'FAIL'}**: the build fails on a high or critical advisory in a production dependency.`,
      '',
      '| Dependencies | Critical | High | Moderate | Low |',
      '|---|---|---|---|---|',
      row('Production (what the app runs)', prod),
      row('All, including development tools', sev('reports/audit-all.json')),
    ];
  },
};

const which = process.argv[2];
if (!sections[which]) {
  console.error(`Usage: node scripts/ci-summary.js <${Object.keys(sections).join('|')}>`);
  process.exit(2);
}
const text = `${sections[which]().join('\n')}\n\n`;
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
process.stdout.write(text);
