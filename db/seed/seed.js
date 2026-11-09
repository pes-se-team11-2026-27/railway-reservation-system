'use strict';
// Demo and test data: four stations, three trains on Bengaluru to Chennai,
// one sleeper and one 3A coach each, and runs for the next 30 days.
const { pool, withTransaction } = require('../../src/db/pool');

const STATIONS = [
  ['SBC', 'KSR Bengaluru'],
  ['BWT', 'Bangarapet'],
  ['KPD', 'Katpadi'],
  ['MAS', 'Chennai Central'],
];

const TRAINS = [
  { number: '12608', name: 'Lalbagh Express', runs_on: '1111111', stops: [
    ['SBC', null, '06:20', 0], ['BWT', '07:28', '07:30', 70], ['KPD', '09:43', '09:45', 220], ['MAS', '12:00', null, 362] ] },
  { number: '12640', name: 'Brindavan Express', runs_on: '1111111', stops: [
    ['SBC', null, '15:00', 0], ['KPD', '18:23', '18:25', 220], ['MAS', '20:35', null, 362] ] },
  { number: '12658', name: 'Chennai Mail', runs_on: '1111100', stops: [
    ['SBC', null, '22:40', 0], ['BWT', '23:50', '23:52', 70], ['MAS', '04:45', null, 362] ] },
];

// Berths 1 to 8 are general quota, 9 and 10 are Tatkal.
const COACHES = [['S1', 'SL'], ['B1', '3A']];
const BERTHS_PER_COACH = 10;

async function seed(client) {
  await client.query(`TRUNCATE stations, trains, travel_classes, quotas, settings RESTART IDENTITY CASCADE`);

  for (const [code, name] of STATIONS) {
    await client.query('INSERT INTO stations (code, name) VALUES ($1, $2)', [code, name]);
  }
  await client.query(`INSERT INTO travel_classes (code, name) VALUES ('SL', 'Sleeper'), ('3A', 'AC 3 Tier')`);
  await client.query(`INSERT INTO quotas (code, name) VALUES ('GN', 'General'), ('TQ', 'Tatkal')`);

  for (const t of TRAINS) {
    const { rows } = await client.query(
      'INSERT INTO trains (number, name, runs_on) VALUES ($1, $2, $3) RETURNING id', [t.number, t.name, t.runs_on]);
    const trainId = rows[0].id;
    let seq = 1;
    for (const [station, arr, dep, km] of t.stops) {
      const dayOffset = t.number === '12658' && station === 'MAS' ? 1 : 0;
      await client.query(
        `INSERT INTO train_stops (train_id, seq, station_code, arrives, departs, day_offset, distance_km)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`, [trainId, seq++, station, arr, dep, dayOffset, km]);
    }
    for (const [coachNo, cls] of COACHES) {
      const c = await client.query(
        'INSERT INTO coaches (train_id, coach_no, class_code) VALUES ($1, $2, $3) RETURNING id', [trainId, coachNo, cls]);
      for (let b = 1; b <= BERTHS_PER_COACH; b++) {
        await client.query('INSERT INTO berths (coach_id, berth_no, quota_code) VALUES ($1, $2, $3)',
          [c.rows[0].id, b, b <= 8 ? 'GN' : 'TQ']);
      }
      await client.query('INSERT INTO rac_capacity (train_id, class_code, positions) VALUES ($1, $2, 2)', [trainId, cls]);
    }
    // Runs for today and the next 29 days, only on days the train runs.
    await client.query(
      `INSERT INTO train_runs (train_id, run_date)
       SELECT $1, d::date FROM generate_series(current_date, current_date + 29, interval '1 day') AS d
        WHERE substr($2, extract(isodow FROM d)::int, 1) = '1'`, [trainId, t.runs_on]);
  }

  // One inventory row per berth per run, all free.
  await client.query(
    `INSERT INTO inventory (run_id, berth_id)
     SELECT r.id, b.id FROM train_runs r
       JOIN coaches c ON c.train_id = r.train_id
       JOIN berths b ON b.coach_id = c.id`);

  const settings = [
    ['hold_minutes', '10'],
    ['otp_minutes', '10'],
    ['tatkal_open_time', '10:00'],
    ['chart_hours_before', '4'],
    ['max_passengers_general', '6'],
    ['max_passengers_tatkal', '4'],
    ['staff_idle_minutes', '5'],
    // Cancellation (RRS-F-015): hours before departure : share of the fare
    // kept, in basis points; under the last slab, cancellation is closed.
    ['cancel_slabs', '48:0,12:2500,4:5000'],
    ['cancel_flat_SL', '6000'],
    ['cancel_flat_3A', '18000'],
    ['cancel_clerkage', '2000'],
  ];
  for (const [key, value] of settings) {
    await client.query('INSERT INTO settings (key, value) VALUES ($1, $2)', [key, value]);
  }
  await seedStaff(client);
}

// Demo staff, one per role (RRS-SR-003). Development and demo only: the
// passwords and authenticator secrets below are published in the README.
const STAFF = [
  ['admin1', 'Asha Admin', 'ADMIN', 'Admin@2026', 'JBSWY3DPEHPK3PXP'],
  ['clerk1', 'Kiran Clerk', 'CLERK', 'Clerk@2026', 'KRSXG5CTMVRXEZLU'],
  ['tte1', 'Tara Examiner', 'TTE', 'Tte@2026', 'ORUGS4ZANFZSAYJA'],
];

async function seedStaff(client) {
  const { hashPassword } = require('../../src/modules/auth/password');
  for (const [username, name, role, password, secret] of STAFF) {
    await client.query(
      `INSERT INTO staff (username, name, role, password_hash, totp_secret)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (username) DO NOTHING`,
      [username, name, role, await hashPassword(password), secret]);
  }
}

async function seedIfEmpty(client) {
  const { rows } = await client.query('SELECT count(*)::int AS n FROM trains');
  if (rows[0].n > 0) {
    await seedStaff(client);   // databases seeded before staff existed get them too
    return false;
  }
  await seed(client);
  return true;
}

if (require.main === module) {
  const onlyIfEmpty = process.argv.includes('--if-empty');
  withTransaction(onlyIfEmpty ? seedIfEmpty : seed)
    .then(() => { console.log('Seed data loaded'); return pool.end(); })
    .catch((err) => { console.error(err.message); process.exit(1); });
}

module.exports = { seed, seedIfEmpty };
