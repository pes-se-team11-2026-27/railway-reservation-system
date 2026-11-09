'use strict';

// Finds card data where it must never be (RRS-NF-005, RRS-SR-002).
// A card number is 13 to 19 digits, possibly in groups split by spaces or
// dashes, standing on its own (not part of a longer code), that passes the
// Luhn checksum; the checksum is what stops PNRs,
// mobile numbers and other long numbers being reported. Findings are masked,
// so the report itself never shows a full card number.

function luhnValid(digits) {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

const mask = (digits) => `${'*'.repeat(digits.length - 4)}${digits.slice(-4)}`;

function findCardNumbers(text) {
  const found = [];
  // Not inside a longer token of letters and digits: a hex hash or a
  // reference can contain a long run of digits that happens to pass Luhn.
  const re = /(?<![0-9A-Za-z])(\d(?:[ -]?\d){12,18})(?![0-9A-Za-z])/g;
  let m;
  while ((m = re.exec(String(text))) !== null) {
    const digits = m[1].replace(/[ -]/g, '');
    if (digits.length >= 13 && digits.length <= 19 && luhnValid(digits) && !/^(\d)\1+$/.test(digits)) found.push(mask(digits));
  }
  return found;
}

// Card security codes and card fields stored under any of their usual names.
const FIELD = /"(cvv2?|cvc2?|cid|security_?code|card_?number|card_?no|pan|expiry|exp_?date)"\s*:\s*"?([^",}\s]+)/gi;
function findCardFields(text) {
  const found = [];
  let m;
  while ((m = FIELD.exec(String(text))) !== null) found.push(m[1].toLowerCase());
  return found;
}

function scanText(text, source) {
  return [
    ...findCardNumbers(text).map((masked) => ({ source, kind: 'CARD_NUMBER', match: masked })),
    ...findCardFields(text).map((field) => ({ source, kind: 'CARD_FIELD', match: field })),
  ];
}

// Every row of every table, as JSON text.
async function scanDatabase(pool) {
  const tables = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1`);
  const findings = [];
  for (const { table_name: t } of tables.rows) {
    const rows = await pool.query(`SELECT row_to_json(x)::text AS j FROM "${t.replace(/"/g, '""')}" x`);
    for (const r of rows.rows) findings.push(...scanText(r.j, `table ${t}`));
  }
  return { tablesScanned: tables.rows.length, findings };
}

module.exports = { luhnValid, findCardNumbers, findCardFields, scanText, scanDatabase };
