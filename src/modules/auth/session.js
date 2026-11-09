'use strict';
const crypto = require('crypto');
const { pool } = require('../../db/pool');
const { getSetting } = require('../../settings');
const { AppError } = require('../../errors');

const COOKIE = 'rrs_session';
const hash = (token) => crypto.createHash('sha256').update(token).digest('hex');

function readCookie(req, name) {
  const header = req.get('cookie') || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

function setCookie(req, res, token) {
  const secure = req.secure ? '; Secure' : '';
  res.append('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax${secure}`);
}

function clearCookie(res) {
  res.append('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

// Creates a session and returns the token to put in the cookie.
async function createSession({ kind, userId = null, staffId = null, role, mfaPassed = false }) {
  const token = crypto.randomBytes(32).toString('base64url');
  const hours = kind === 'STAFF' ? 10 : 12;
  await pool.query(
    `INSERT INTO sessions (token_hash, kind, user_id, staff_id, role, mfa_passed, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, now() + make_interval(hours => $7))`,
    [hash(token), kind, userId, staffId, role, mfaPassed, hours]);
  return token;
}

async function revoke(token) {
  if (token) await pool.query('UPDATE sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [hash(token)]);
}

// Loads the session named by the cookie, if any, into req.auth. Staff
// sessions idle longer than staff_idle_minutes (5) are locked: revoked, and
// the request is told why, so the terminal shows the sign in page again.
async function loadSession(req, res, next) {
  req.auth = null;
  const token = readCookie(req, COOKIE);
  if (!token) return next();
  try {
    const { rows } = await pool.query(
      `SELECT s.*, extract(epoch FROM now() - s.last_seen_at) AS idle_seconds,
              coalesce(st.username, u.mobile) AS login, coalesce(st.name, u.name) AS name
         FROM sessions s
         LEFT JOIN staff st ON st.id = s.staff_id
         LEFT JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()`, [hash(token)]);
    if (!rows.length) return next();
    const s = rows[0];
    if (s.kind === 'STAFF') {
      const idleMinutes = Number(await getSetting('staff_idle_minutes')) || 5;
      if (Number(s.idle_seconds) >= idleMinutes * 60) {
        await pool.query('UPDATE sessions SET revoked_at = now() WHERE id = $1', [s.id]);
        clearCookie(res);
        req.authLocked = true;
        return next();
      }
    }
    await pool.query('UPDATE sessions SET last_seen_at = now() WHERE id = $1', [s.id]);
    req.auth = {
      sessionId: s.id, kind: s.kind, role: s.role, mfaPassed: s.mfa_passed,
      userId: s.user_id, staffId: s.staff_id, login: s.login, name: s.name, token,
    };
    next();
  } catch (err) { next(err); }
}

// Route guard: a signed in staff member who has passed the second factor
// and holds one of the given roles. Least privilege: name the roles needed.
function requireRole(...roles) {
  return (req, res, next) => {
    if (req.authLocked) return next(new AppError(401, 'SESSION_IDLE', 'Signed out after 5 minutes without activity'));
    if (!req.auth) return next(new AppError(401, 'NOT_SIGNED_IN', 'Sign in first'));
    if (req.auth.kind === 'STAFF' && !req.auth.mfaPassed) return next(new AppError(401, 'MFA_REQUIRED', 'Enter the code from your authenticator app'));
    if (!roles.includes(req.auth.role)) return next(new AppError(403, 'FORBIDDEN', 'Your role cannot do this'));
    next();
  };
}

module.exports = { COOKIE, readCookie, setCookie, clearCookie, createSession, revoke, loadSession, requireRole };
