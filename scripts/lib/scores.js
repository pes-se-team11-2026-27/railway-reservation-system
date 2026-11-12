'use strict';
// The two headline scores, shared by the CI summary (scripts/ci-summary.js)
// and the docs reports (scripts/build-test-reports.js) so they always agree.
const fs = require('fs');

// Overall coverage: covered statements, branches and functions over their
// totals. Lines are left out because they count the same code as statements.
// This is how coverage.py combines statements and branches into one number.
const OVERALL_MIN = 80;
const METRIC_MIN = { lines: 85, statements: 85, functions: 85, branches: 70 };

function overallCoverage(total) {
  const keys = ['statements', 'branches', 'functions'];
  const covered = keys.reduce((n, k) => n + total[k].covered, 0);
  const all = keys.reduce((n, k) => n + total[k].total, 0);
  return { covered, total: all, pct: all ? (covered * 100) / all : 100 };
}

// Lint score out of 10, the Pylint formula:
//   10 - (5 x errors + warnings) / statements x 10, never below 0.
// Statements are counted by parsing each file with ESLint's own parser.
const LINT_MIN = 9.5;

function countStatements(file) {
  const espree = require('espree');
  let code;
  try { code = fs.readFileSync(file, 'utf8'); } catch { return 0; }
  let ast = null;
  for (const sourceType of ['module', 'script', 'commonjs']) {
    try { ast = espree.parse(code, { ecmaVersion: 'latest', sourceType }); break; } catch { /* try the next */ }
  }
  if (!ast) return 0;
  let n = 0;
  (function walk(node) {
    if (!node || typeof node.type !== 'string') return;
    if (/(Statement|Declaration)$/.test(node.type) && node.type !== 'BlockStatement' && node.type !== 'EmptyStatement') n += 1;
    for (const key of Object.keys(node)) {
      const v = node[key];
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object' && typeof v.type === 'string') walk(v);
    }
  }(ast));
  return n;
}

// eslintResults: the array ESLint writes with --format json.
function lintScore(eslintResults) {
  const errors = eslintResults.reduce((n, f) => n + f.errorCount, 0);
  const warnings = eslintResults.reduce((n, f) => n + f.warningCount, 0);
  const statements = eslintResults.reduce((n, f) => n + countStatements(f.filePath), 0);
  const score = statements ? Math.max(0, 10 - ((5 * errors + warnings) / statements) * 10) : 10;
  return { score, errors, warnings, statements, files: eslintResults.length, met: score >= LINT_MIN && errors === 0 };
}

module.exports = { OVERALL_MIN, METRIC_MIN, LINT_MIN, overallCoverage, lintScore, countStatements };
