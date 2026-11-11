// Turns a k6 summary into a short Markdown report plus the raw numbers.
// Used by every load test's handleSummary, so the reports look the same.
function ms(v) { return v === undefined ? 'n/a' : `${Math.round(v)} ms`; }

export function report(data, { title, requirement, testCase, target, metric }) {
  const d = data.metrics[metric] ? data.metrics[metric].values : {};
  const reqs = data.metrics.http_reqs ? data.metrics.http_reqs.values : {};
  const failed = data.metrics.http_req_failed ? data.metrics.http_req_failed.values.rate : 0;
  const checks = data.metrics.checks ? data.metrics.checks.values.rate : 1;
  const thresholds = [];
  for (const [name, m] of Object.entries(data.metrics)) {
    for (const [rule, t] of Object.entries(m.thresholds || {})) thresholds.push(`| ${name} | ${rule} | ${t.ok ? 'PASS' : 'FAIL'} |`);
  }
  const allOk = thresholds.every((row) => row.endsWith('PASS |'));
  const md = [
    `# ${title}`,
    '',
    `${requirement}, ${testCase}. Run ${new Date().toISOString()} against ${__ENV.BASE_URL || 'https://localhost:3443'}.`,
    '',
    `**Result: ${allOk ? 'PASS' : 'FAIL'}.** Target: ${target}.`,
    '',
    '| Measure | Value |',
    '|---|---|',
    `| Requests | ${reqs.count || 0} (${(reqs.rate || 0).toFixed(1)} per second) |`,
    `| Response time, median | ${ms(d.med)} |`,
    `| Response time, 95th percentile | ${ms(d['p(95)'])} |`,
    `| Response time, maximum | ${ms(d.max)} |`,
    `| Failed requests | ${(failed * 100).toFixed(2)}% |`,
    `| Checks passed | ${(checks * 100).toFixed(2)}% |`,
    '',
    '| Metric | Threshold | Result |',
    '|---|---|---|',
    ...thresholds,
    '',
  ].join('\n');
  return md;
}

export function outputs(data, name, md) {
  return {
    stdout: `${md}\n`,
    [`reports/${name}.md`]: md,
    [`reports/${name}.json`]: JSON.stringify(data, null, 2),
  };
}
