'use strict';
const { pool } = require('../../db/pool');
const { AppError, notFound } = require('../../errors');
const account = require('../account/service');
const fare = require('../fare/service');
const payment = require('../payment/service');
const { getHold } = require('./service');

// RRS-F-002 and UC-03: only a signed in passenger whose mobile is verified
// may pay. Uses the payment gate from the account module.
async function verifiedPassenger(auth) {
  if (!auth || auth.kind !== 'PASSENGER') throw new AppError(401, 'NOT_SIGNED_IN', 'Sign in to book and pay');
  const who = await account.getAccount(auth.userId);
  if (!account.canProceedToPayment(who)) {
    throw new AppError(403, 'NOT_VERIFIED', 'Verify your mobile number before paying');
  }
  return who;
}

// The amount is always worked out here, on the server, from the journey and
// the fare rules, never taken from the browser (SAD 3.9, tampering).
async function amountFor(hold) {
  const { rows } = await pool.query(
    `SELECT (SELECT station_code FROM train_stops s WHERE s.train_id = r.train_id ORDER BY seq LIMIT 1) AS first_stop,
            (SELECT station_code FROM train_stops s WHERE s.train_id = r.train_id ORDER BY seq DESC LIMIT 1) AS last_stop
       FROM train_runs r WHERE r.id = $1`, [hold.runId]);
  const quote = await fare.quoteFare({
    train: hold.train.number,
    from: hold.from || rows[0].first_stop,
    to: hold.to || rows[0].last_stop,
    classCode: hold.classCode,
    passengers: hold.passengers.length,
  });
  return quote.total;
}

// Starts the payment for a hold the signed in passenger owns.
async function startPayment(auth, holdId) {
  const who = await verifiedPassenger(auth);
  const hold = await getHold(Number(holdId));
  if (hold.userId !== who.id) throw new AppError(403, 'NOT_YOUR_HOLD', 'This hold belongs to another passenger');
  return payment.initiatePayment({ holdId: hold.id, amountPaise: await amountFor(hold) });
}

// A ticket can be seen by the passenger who booked it, or by signed in staff.
function canView(auth, booking) {
  if (!auth) return false;
  if (auth.kind === 'STAFF') return auth.mfaPassed;
  return auth.kind === 'PASSENGER' && auth.userId === booking.userId;
}

async function paymentOwnedBy(auth, txRef) {
  const p = await payment.getPayment(txRef);
  const hold = await getHold(p.holdId).catch(() => null);
  if (!hold) throw notFound('PAYMENT_NOT_FOUND', 'No such payment');
  if (!auth || auth.kind !== 'PASSENGER' || auth.userId !== hold.userId) {
    throw new AppError(403, 'NOT_YOUR_PAYMENT', 'This payment belongs to another passenger');
  }
  return p;
}

module.exports = { verifiedPassenger, amountFor, startPayment, canView, paymentOwnedBy };
