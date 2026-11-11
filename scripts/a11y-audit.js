'use strict';
// RRS-NF-006, TC-UX-01: every page passes an automated WCAG 2.2 AA check
// (axe-core) in light and dark mode, and a booking completes on a 1 Mbps
// connection within 30 seconds of transfer time.
//
// Needs the app running and Chromium for Playwright (once: npx playwright install chromium).
// Usage: node scripts/a11y-audit.js        (BASE_URL defaults to https://localhost:3443)
// Writes reports/accessibility.md and reports/accessibility.json; exits with 1 on any failure.
const fs = require('fs');
const { chromium } = require('playwright');
const { AxeBuilder } = require('@axe-core/playwright');

const BASE = process.env.BASE_URL || 'https://localhost:3443';
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const SLOW = { latency: 100, downloadThroughput: 125000, uploadThroughput: 125000 }; // 1 Mbps = 125 000 bytes a second
const SLOW_LIMIT_MS = 30000;
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const mobile = () => `9${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;

async function check(page, name, scheme, results) {
  const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  results.push({
    name, scheme, path: page.url().replace(BASE, ''),
    violations: r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length })),
  });
}

// Opens a page and insists it loaded: an error page can pass an accessibility
// check, so a 4xx or 5xx must fail the run instead of counting as a pass.
async function go(page, path, expectStatus = 200) {
  const res = await page.goto(BASE + path);
  await page.waitForLoadState('networkidle');
  if (!res || res.status() !== expectStatus) throw new Error(`${path} answered ${res ? res.status() : 'nothing'}, expected ${expectStatus}`);
}

async function runId(page, number, offset) {
  const res = await page.request.get(`${BASE}/api/trains/search?from=SBC&to=MAS&date=${day(offset)}`);
  return (await res.json()).find((t) => t.number === number).runId;
}

// A new passenger, registered and verified through the pages, signed in.
async function newPassenger(page, name, scheme, results) {
  const m = mobile();
  await go(page, '/register');
  if (results) await check(page, 'Create account', scheme, results);
  await page.fill('#name', 'Meera Rao');
  await page.fill('#mobile', m);
  await page.fill('#email', `meera${m}@example.com`);
  await page.fill('#password', 'train2026');
  await page.click('main button[type=submit]');
  await page.waitForLoadState('networkidle');
  if (results) await check(page, 'Create account: enter code', scheme, results);
  await page.fill('#code', (await page.textContent('.code')).trim());
  await page.click('main button[type=submit]');
  await page.waitForLoadState('networkidle');
  if (results) await check(page, 'Create account: verified', scheme, results);
  await go(page, '/signin');
  if (results) await check(page, 'Sign in', scheme, results);
  await page.fill('#mobile', m);
  await page.fill('#password', 'train2026');
  await page.click('main button[type=submit]');
  await page.waitForLoadState('networkidle');
}

async function book(page, id, scheme, results) {
  await go(page, `/book?runId=${id}&class=SL&from=SBC&to=MAS`);
  if (results) await check(page, 'Book', scheme, results);
  await page.fill('#name1', 'Meera Rao');
  await page.fill('#age1', '34');
  await page.click('text=Hold berths');
  await page.waitForLoadState('networkidle');
  if (results) await check(page, 'Berths held', scheme, results);
  await page.click('text=Pay now');
  await page.waitForLoadState('networkidle');
  if (results) await check(page, 'Payment gateway', scheme, results);
  await page.click('text=Pay (test success)');
  await page.waitForURL(/\/ticket\/\d{10}$/);
  await page.waitForLoadState('networkidle');
  if (results) await check(page, 'Ticket', scheme, results);
  return page.url().split('/').pop();
}

async function staffSignIn(page, username, password, scheme, results) {
  await go(page, '/staff/login');
  if (results) await check(page, 'Staff sign in', scheme, results);
  await page.fill('#username', username);
  await page.fill('#password', password);
  await page.click('main button[type=submit]');
  await page.waitForLoadState('networkidle');
  if (results) await check(page, 'Staff sign in: code', scheme, results);
  await page.fill('#code', (await page.textContent('.code')).trim());
  await page.click('main button[type=submit]');
  await page.waitForLoadState('networkidle');
}

async function auditScheme(browser, scheme, results) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, colorScheme: scheme });
  const page = await ctx.newPage();
  for (const [name, path] of [
    ['Search', '/search'],
    ['Search results', `/search?from=SBC&to=MAS&date=${day(3)}`],
    ['Check a fare', '/fare'],
    ['PNR status', '/pnr'],
  ]) { await go(page, path); await check(page, name, scheme, results); }
  await go(page, '/no-such-page', 404); await check(page, 'Page not found', scheme, results);

  await newPassenger(page, 'Meera Rao', scheme, results);
  const pnr = await book(page, await runId(page, '12640', 4), scheme, results);
  await go(page, `/ticket/${pnr}/cancel`); await check(page, 'Cancel: refund shown', scheme, results);
  await go(page, `/pnr?number=${pnr}`); await check(page, 'PNR status: result', scheme, results);
  await ctx.close();

  const staff = await browser.newContext({ ignoreHTTPSErrors: true, colorScheme: scheme });
  const sp = await staff.newPage();
  await staffSignIn(sp, 'admin1', 'Admin@2026', scheme, results);
  await go(sp, '/staff'); await check(sp, 'Staff home', scheme, results);
  for (const [name, path] of [
    ['Administration console', '/admin'], ['Fare rules', '/admin/fares'], ['Quota rules', '/admin/quotas'],
    ['Charts', '/admin/charts'], ['Availability', '/admin/availability'], ['Audit log', '/admin/audit'],
  ]) { await go(sp, path); await check(sp, name, scheme, results); }
  await staff.close();

  const tte = await browser.newContext({ ignoreHTTPSErrors: true, colorScheme: scheme });
  const tp = await tte.newPage();
  await staffSignIn(tp, 'tte1', 'Tte@2026', scheme, null);
  await go(tp, '/tte'); await check(tp, 'Ticket check (handheld)', scheme, results);
  await tte.close();
}

// The booking flow on 1 Mbps: from search results to the ticket. Signing in
// happens first at normal speed; it is not part of booking.
async function slowBooking(browser) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  await newPassenger(page, 'Meera Rao', 'light', null);
  const id = await runId(page, '12608', 5);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, ...SLOW });
  let bytes = 0;
  cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength; });
  const started = Date.now();
  await go(page, `/search?from=SBC&to=MAS&date=${day(5)}`);
  const pnr = await book(page, id, 'light', null);
  const ms = Date.now() - started;
  await ctx.close();
  return { ms, kilobytes: Math.round(bytes / 1024), pnr, ok: ms < SLOW_LIMIT_MS };
}

async function main() {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const results = [];
  try {
    for (const scheme of ['light', 'dark']) await auditScheme(browser, scheme, results);
    const slow = await slowBooking(browser);
    const failing = results.filter((r) => r.violations.length);
    const ok = !failing.length && slow.ok;
    const md = [
      '# Accessibility and slow connection report',
      '',
      `RRS-NF-006, TC-UX-01. Run ${new Date().toISOString()} against ${BASE}.`,
      '',
      `**Result: ${ok ? 'PASS' : 'FAIL'}.** ${results.length} page checks (${results.length / 2} pages in light and dark mode), ${failing.length} with violations. Booking on 1 Mbps: ${(slow.ms / 1000).toFixed(1)} seconds (target under 30).`,
      '',
      `Automated check: axe-core ${require('axe-core/package.json').version}, rules for WCAG 2.0, 2.1 and 2.2 at levels A and AA. Manual checks (keyboard only booking, visible focus, logical order) are recorded in the System Validation report.`,
      '',
      '| Page | Path | Light | Dark |',
      '|---|---|---|---|',
      ...[...new Set(results.map((r) => r.name))].map((name) => {
        const l = results.find((r) => r.name === name && r.scheme === 'light');
        const d = results.find((r) => r.name === name && r.scheme === 'dark');
        const cell = (r) => (!r ? 'n/a' : r.violations.length ? `${r.violations.length} violations` : 'Pass');
        return `| ${name} | \`${(l || d).path.replace(/\d{10}/, '<PNR>').replace(/TX[0-9A-F]+/, '<payment ref>').replace(/runId=\d+/, 'runId=<run>').replace(/date=[\d-]+/, 'date=<date>')}\` | ${cell(l)} | ${cell(d)} |`;
      }),
      '',
      '## Booking on a slow connection',
      '',
      '| Measure | Value |',
      '|---|---|',
      '| Connection | 1 Mbps down and up, 100 ms latency, browser cache off |',
      '| Flow | Search results, booking form, hold berths, pay on the gateway page, ticket |',
      `| Time | ${(slow.ms / 1000).toFixed(1)} seconds |`,
      `| Data transferred | ${slow.kilobytes} KB |`,
      `| Result | ${slow.ok ? 'PASS' : 'FAIL'} (target under 30 seconds) |`,
      '',
      ...(failing.length ? ['## Violations', '', ...failing.flatMap((r) => [`### ${r.name} (${r.scheme})`, '', ...r.violations.map((v) => `- ${v.id} (${v.impact}): ${v.help}, ${v.nodes} element(s)`), ''])] : []),
    ].join('\n');
    fs.mkdirSync('reports', { recursive: true });
    fs.writeFileSync('reports/accessibility.md', `${md}\n`);
    fs.writeFileSync('reports/accessibility.json', JSON.stringify({ results, slow }, null, 2));
    console.log(md);
    process.exitCode = ok ? 0 : 1;
  } finally {
    await browser.close();
  }
}

main().catch((err) => { console.error(err); process.exit(2); });
