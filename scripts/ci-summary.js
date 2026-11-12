'use strict';
// Writes a readable summary of one CI stage to the GitHub Actions run page
// (the GITHUB_STEP_SUMMARY file), or to the terminal when run by hand.
// Usage: node scripts/ci-summary.js <lint|tests|data|frontend|performance|audit>
//        node scripts/ci-summary.js coverage-line | coverage-state | lint-line | lint-state | badges <dir>
const fs = require('fs');

const exists = (p) => fs.existsSync(p);
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const pct = (n) => `${Number(n).toFixed(2)}%`;
const resultLine = (p) => {
  if (!exists(p)) return 'not run';
  const m = /\*\*Result: (PASS|FAIL)[^*]*\*\*\s*(.*)/.exec(fs.readFileSync(p, 'utf8'));
  return m ? `${m[1]}. ${m[2]}`.trim() : 'no result';
};

const scores = require('./lib/scores');
const { OVERALL_MIN, LINT_MIN, overallCoverage } = scores;
const lintScore = () => scores.lintScore(readJson('reports/eslint.json'));

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
    const L = lintScore();
    return [
      '## Lint',
      '',
      `### Lint score: ${L.score.toFixed(2)} / 10 (minimum ${LINT_MIN}): ${L.score >= LINT_MIN && L.errors === 0 ? 'PASS' : 'FAIL'}`,
      '',
      `${L.files} files, ${L.statements} statements, ${L.errors} errors, ${L.warnings} warnings (ESLint, recommended rules). Score = 10 - (5 x errors + warnings) / statements x 10.`,
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
      const min = MIN;
      const o = overallCoverage(t);
      out.push(
        `### Overall coverage: ${pct(o.pct)} (minimum ${OVERALL_MIN}%): ${o.pct >= OVERALL_MIN ? 'PASS' : 'FAIL'}`,
        '',
        `${o.covered} of ${o.total} statements, branches and functions run by the tests.`,
        '',
        '| Coverage | Covered | Total | Percent | Minimum |',
        '|---|---|---|---|---|',
        `| **Overall** | ${o.covered} | ${o.total} | **${pct(o.pct)}** | ${OVERALL_MIN}% |`,
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

// One line versions of the coverage, for the commit status, the run
// annotation and the README badges.
const MIN = scores.METRIC_MIN;
function coverageTotals() {
  return readJson('coverage/coverage-summary.json').total;
}
function coverageLine() {
  const t = coverageTotals();
  return `Overall ${pct(overallCoverage(t).pct)} (lines ${pct(t.lines.pct)}, statements ${pct(t.statements.pct)}, functions ${pct(t.functions.pct)}, branches ${pct(t.branches.pct)})`;
}
function coverageMet() {
  const t = coverageTotals();
  return overallCoverage(t).pct >= OVERALL_MIN && Object.keys(MIN).every((k) => t[k].pct >= MIN[k]);
}
function lintLine() {
  const L = lintScore();
  return `Lint score ${L.score.toFixed(2)}/10 (minimum ${LINT_MIN}): ${L.errors} errors, ${L.warnings} warnings in ${L.statements} statements`;
}
function lintMet() {
  return lintScore().met;
}
function badges(dir) {
  const t = coverageTotals();
  const overall = overallCoverage(t).pct;
  const color = overall >= 90 ? 'brightgreen' : overall >= OVERALL_MIN ? 'green' : overall >= 70 ? 'yellow' : 'red';
  fs.mkdirSync(dir, { recursive: true });
  const write = (name, label, message, c) => fs.writeFileSync(`${dir}/${name}.json`,
    JSON.stringify({ schemaVersion: 1, label, message, color: c }));
  write('coverage', 'overall coverage', `${overall.toFixed(2)}%`, color);
  if (exists('reports/eslint.json')) {
    const L = lintScore();
    write('lint', 'lint score', `${L.score.toFixed(2)}/10`, L.score >= LINT_MIN ? 'brightgreen' : 'red');
  }
  write('branches', 'branch coverage', `${t.branches.pct.toFixed(2)}%`, t.branches.pct >= MIN.branches ? 'green' : 'red');
  if (exists('reports/jest-results.json')) {
    const j = readJson('reports/jest-results.json');
    write('tests', 'tests', `${j.numPassedTests} passed${j.numFailedTests ? `, ${j.numFailedTests} failed` : ''}`, j.success ? 'brightgreen' : 'red');
  }
}

const which = process.argv[2];
if (which === 'coverage-line') { process.stdout.write(coverageLine()); process.exit(0); }
if (which === 'coverage-state') { process.stdout.write(coverageMet() ? 'success' : 'failure'); process.exit(0); }
if (which === 'lint-line') { process.stdout.write(lintLine()); process.exit(0); }
if (which === 'lint-state') { process.stdout.write(lintMet() ? 'success' : 'failure'); process.exit(0); }
if (which === 'badges') { badges(process.argv[3] || 'badges'); process.exit(0); }
if (!sections[which]) {
  console.error(`Usage: node scripts/ci-summary.js <${Object.keys(sections).join('|')}>`);
  process.exit(2);
}
const text = `${sections[which]().join('\n')}\n\n`;
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
process.stdout.write(text);
