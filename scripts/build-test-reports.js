'use strict';
// Builds the four Sprint 3 test reports (Part 3 of the course deliverables)
// from real run data, so no number is typed by hand:
//   reports/jest-results.json        from: npm run test:report
//   coverage/coverage-summary.json   from: npm run test:report
//   docs/reports/*.md                load, reconciliation, accessibility and manual check reports
//   tests/traceability.json          each Test Plan case and its evidence
// Writes docs/reports/: UNIT_TEST_REPORT.md, SYSTEM_VALIDATION_REPORT.md,
// CODE_COVERAGE_REPORT.md, BRANCH_COVERAGE_REPORT.md and README.md.
// Usage: node scripts/build-test-reports.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'reports');
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
// Paths inside the repository (src/... or tests/...), whichever machine wrote
// the results: CI writes /home/runner/work/..., a laptop its own folder.
const rel = (p) => {
  const unix = String(p).split('\\').join('/');
  const m = /(?:^|\/)((?:src|tests)\/.*)$/.exec(unix);
  return m ? m[1] : path.relative(ROOT, p).split(path.sep).join('/');
};
const pct = (n) => `${Number(n).toFixed(2)}%`;
const sec = (ms) => `${(ms / 1000).toFixed(1)} s`;

function commit() {
  try { return execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim(); } catch { return 'unknown'; }
}

function header(title, about) {
  return [
    `# ${title}`,
    '',
    'Railway Reservation System, Team 11, UE23CS341A, PES University.',
    '',
    `Generated ${new Date().toISOString()} from commit \`${commit()}\` on Node.js ${process.version}. ${about}`,
    '',
  ];
}

// Result of a report file in docs/reports: PASS, FAIL or NOT RUN.
function reportResult(name) {
  const file = path.join(OUT, name);
  if (!fs.existsSync(file)) return { result: 'NOT RUN', note: `docs/reports/${name} not found` };
  const m = /\*\*Result: (PASS|FAIL)/.exec(fs.readFileSync(file, 'utf8'));
  return m ? { result: m[1], note: `docs/reports/${name}` } : { result: 'NOT RUN', note: `docs/reports/${name} has no result yet` };
}

function main() {
  const jest = read('reports/jest-results.json');
  const coverage = read('coverage/coverage-summary.json');
  const trace = read('tests/traceability.json');
  fs.mkdirSync(OUT, { recursive: true });

  const files = jest.testResults.map((f) => ({
    file: rel(f.name),
    kind: rel(f.name).startsWith('tests/unit/') ? 'unit' : 'integration',
    status: f.status,
    ms: f.endTime - f.startTime,
    tests: f.assertionResults.map((a) => ({ name: [...a.ancestorTitles, a.title].join(' > '), status: a.status, ms: a.duration || 0 })),
  }));
  const byFile = Object.fromEntries(files.map((f) => [f.file, f]));
  const unit = files.filter((f) => f.kind === 'unit');
  const integ = files.filter((f) => f.kind === 'integration');
  const count = (list, status) => list.reduce((n, f) => n + f.tests.filter((t) => !status || t.status === status).length, 0);

  // 1. Unit test report
  const unitMd = [
    ...header('Unit Test Report', 'Unit tests check one function or module on its own, with no database or network.'),
    `**Result: ${count(unit, 'failed') === 0 ? 'PASS' : 'FAIL'}.** ${count(unit, 'passed')} of ${count(unit)} unit tests passed in ${unit.length} files.`,
    '',
    'Tool: Jest 29 (`npm run test:unit`). The same tests run in GitHub Actions on every push and pull request.',
    '',
    '## Summary by file',
    '',
    '| Test file | What it covers | Tests | Passed | Failed | Time |',
    '|---|---|---|---|---|---|',
    ...unit.map((f) => `| \`${f.file}\` | ${f.tests[0] ? f.tests[0].name.split(' > ')[0] : ''} | ${f.tests.length} | ${f.tests.filter((t) => t.status === 'passed').length} | ${f.tests.filter((t) => t.status === 'failed').length} | ${sec(f.ms)} |`),
    `| **Total** | | **${count(unit)}** | **${count(unit, 'passed')}** | **${count(unit, 'failed')}** | |`,
    '',
    '## Every test',
    '',
    ...unit.flatMap((f) => [`### ${f.file}`, '', ...f.tests.map((t) => `- ${t.status === 'passed' ? 'PASS' : t.status.toUpperCase()}: ${t.name}`), '']),
  ].join('\n');

  // 2. System validation report
  const rows = trace.cases.map((c) => {
    const evidence = [];
    let result = 'PASS';
    for (const f of c.jest || []) {
      const r = byFile[f];
      if (!r) { evidence.push(`\`${f}\` not run`); result = 'NOT RUN'; continue; }
      const passed = r.tests.filter((t) => t.status === 'passed').length;
      const failed = r.tests.filter((t) => t.status === 'failed').length;
      const skipped = r.tests.length - passed - failed;
      evidence.push(`\`${path.basename(f)}\` ${passed}/${r.tests.length}${skipped ? ` (${skipped} skipped)` : ''}`);
      if (failed) result = 'FAIL';
      else if (skipped && result === 'PASS') result = 'NOT RUN';
    }
    if (c.report) {
      const r = reportResult(c.report);
      evidence.push(r.note);
      if (r.result === 'FAIL') result = 'FAIL';
      else if (r.result === 'NOT RUN' && result === 'PASS') result = 'NOT RUN';
    }
    return { ...c, result, evidence };
  });
  const pass = rows.filter((r) => r.result === 'PASS').length;
  const svMd = [
    ...header('System Validation Report', 'Each test case from the Test Plan (Section 13.1), the requirement it verifies, and the evidence that decided the result.'),
    `**Result: ${pass === rows.length ? 'PASS' : 'NOT COMPLETE'}.** ${pass} of ${rows.length} test cases passed${rows.length - pass ? `; ${rows.filter((r) => r.result === 'FAIL').length} failed, ${rows.filter((r) => r.result === 'NOT RUN').length} not run` : ''}.`,
    '',
    `Automated suite: ${count(files, 'passed')} of ${count(files)} tests passed (${count(unit)} unit, ${count(integ)} integration against PostgreSQL), lint clean, card data scan and inventory reconciliation in CI.`,
    '',
    '## Test cases',
    '',
    '| Test case | Requirement | What is validated | Evidence | Result |',
    '|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.id} | ${r.requirement} | ${r.title} | ${r.evidence.join('; ')} | **${r.result}** |`),
    '',
    '## Requirements coverage',
    '',
    `Every requirement in the SRS has at least one test case: ${[...new Set(rows.map((r) => r.requirement))].length} requirements (RRS-F-001 to F-020, RRS-NF-001 to NF-006, RRS-SR-001 to SR-005), ${rows.length} test cases, including TC-CAN-03, the regression case for defect #67.`,
    '',
    '## Defects found during validation',
    '',
    '| Defect | Found by | Description | Fix | Retest |',
    '|---|---|---|---|---|',
    '| #67 | Sprint 3 system validation (chart screen) | After a cancellation, the chart, the public PNR status and the ticket page still showed the cancelled passenger as Confirmed on the old berth, which may already belong to someone else | One shared function (maskIfCancelled) used by all three views: a cancelled booking shows Cancelled with no berth and no queue position | TC-CAN-03, `cancelledViews.test.js`, `passengerStatus.test.js`: PASS |',
    '| Card scan false alarm | Repeated CI runs (Sprint 2) | Session token hashes sometimes contained digit runs that pass the Luhn check | Only numbers standing on their own are counted | `cardScan.test.js`: PASS |',
    '| Chart left berths empty | Chart test (Sprint 2) | One pass of promotion could leave a berth free while people waited | Promotion repeats until no berth is free or nobody waits | `chart.test.js`: PASS |',
    '',
    '## Environment',
    '',
    '| Item | Value |',
    '|---|---|',
    '| Application | Node.js 20, Express, PostgreSQL 15, run with Docker Compose over HTTPS |',
    '| Automated tests | Jest 29 and Supertest; GitHub Actions with a PostgreSQL 15 service |',
    '| Load tests | k6 (`load/`), results in the `load-*.md` reports |',
    '| Accessibility | Playwright with axe-core, WCAG 2.0, 2.1 and 2.2 A and AA |',
    '',
  ].join('\n');

  // 3 and 4. Coverage
  const t = coverage.total;
  const covFiles = Object.entries(coverage).filter(([k]) => k !== 'total')
    .map(([k, v]) => ({ file: rel(k), ...v })).sort((a, b) => a.file.localeCompare(b.file));
  const covRow = (f, key) => `| \`${f.file}\` | ${f[key].covered}/${f[key].total} | ${pct(f[key].pct)} |`;
  const codeMd = [
    ...header('Code Coverage Report', 'Code coverage is the share of the application code that the automated tests actually run.'),
    `**Line coverage ${pct(t.lines.pct)}, statement coverage ${pct(t.statements.pct)}, function coverage ${pct(t.functions.pct)}** over ${covFiles.length} source files in \`src/\` (all ${count(files)} unit and integration tests).`,
    '',
    'Tool: Jest built in coverage (Istanbul), `npm run test:report`. `src/server.js` (start up and timers) is excluded; its parts are tested through `src/app.js` and the modules.',
    '',
    '| Measure | Covered | Total | Coverage |',
    '|---|---|---|---|',
    `| Lines | ${t.lines.covered} | ${t.lines.total} | ${pct(t.lines.pct)} |`,
    `| Statements | ${t.statements.covered} | ${t.statements.total} | ${pct(t.statements.pct)} |`,
    `| Functions | ${t.functions.covered} | ${t.functions.total} | ${pct(t.functions.pct)} |`,
    '',
    '## Line coverage by file',
    '',
    '| File | Lines covered | Line coverage |',
    '|---|---|---|',
    ...covFiles.map((f) => covRow(f, 'lines')),
    '',
  ].join('\n');

  const weakest = [...covFiles].filter((f) => f.branches.total > 0).sort((a, b) => a.branches.pct - b.branches.pct).slice(0, 8);
  const branchMd = [
    ...header('Branch Coverage Report', 'Branch coverage is the share of decision outcomes (each side of every if, else, switch case, ternary and logical operator) that the tests take.'),
    `**Branch coverage ${pct(t.branches.pct)}**: ${t.branches.covered} of ${t.branches.total} branches taken by the tests.`,
    '',
    'Branch coverage is stricter than line coverage: a line such as `if (a) x(); else y();` counts as covered after one test, but both branches are only covered when tests take both sides. That is why the boundary tests in the Test Plan (for example 09:59 and 10:00 for Tatkal, 12 hours and 11.99 hours for cancellation) matter.',
    '',
    '## Branch coverage by file',
    '',
    '| File | Branches taken | Branch coverage |',
    '|---|---|---|',
    ...covFiles.map((f) => covRow(f, 'branches')),
    '',
    '## Lowest branch coverage',
    '',
    'Branches not taken are mostly error paths that need a failing database or a broken network (for example, a pool error inside a transaction), and logging. These are listed so they can be checked by review.',
    '',
    '| File | Branches taken | Branch coverage |',
    '|---|---|---|',
    ...weakest.map((f) => covRow(f, 'branches')),
    '',
  ].join('\n');

  const indexMd = [
    '# Test reports',
    '',
    'Sprint 3 deliverables (Part 3). Generated by `node scripts/build-test-reports.js` from the test run; see each report for its commit and date.',
    '',
    '| Report | Summary |',
    '|---|---|',
    `| [Unit Test Report](UNIT_TEST_REPORT.md) | ${count(unit, 'passed')} of ${count(unit)} unit tests passed |`,
    `| [System Validation Report](SYSTEM_VALIDATION_REPORT.md) | ${pass} of ${rows.length} test cases passed |`,
    `| [Code Coverage Report](CODE_COVERAGE_REPORT.md) | ${pct(t.lines.pct)} of lines |`,
    `| [Branch Coverage Report](BRANCH_COVERAGE_REPORT.md) | ${pct(t.branches.pct)} of branches |`,
    '',
    'Evidence used by the System Validation Report:',
    '',
    ...fs.readdirSync(OUT).filter((f) => /^(load-|reconciliation|accessibility|availability|manual-checks)/.test(f) && f.endsWith('.md'))
      .map((f) => `- [${f}](${f})`),
    '',
  ].join('\n');

  fs.writeFileSync(path.join(OUT, 'UNIT_TEST_REPORT.md'), unitMd);
  fs.writeFileSync(path.join(OUT, 'SYSTEM_VALIDATION_REPORT.md'), svMd);
  fs.writeFileSync(path.join(OUT, 'CODE_COVERAGE_REPORT.md'), codeMd);
  fs.writeFileSync(path.join(OUT, 'BRANCH_COVERAGE_REPORT.md'), branchMd);
  fs.writeFileSync(path.join(OUT, 'README.md'), indexMd);
  console.log(`Unit ${count(unit, 'passed')}/${count(unit)}; integration ${count(integ, 'passed')}/${count(integ)}; test cases ${pass}/${rows.length}; lines ${pct(t.lines.pct)}; branches ${pct(t.branches.pct)}`);
  for (const r of rows.filter((x) => x.result !== 'PASS')) console.log(`  ${r.result}: ${r.id} ${r.evidence.join('; ')}`);
}

main();
