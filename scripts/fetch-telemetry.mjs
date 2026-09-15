#!/usr/bin/env node
// Pulls the latest odometer, oil life, tire pressure, and fuel readings from
// Smartcar and appends one row to data/telemetry.json. Also bumps
// currentMileage / mileageAsOf in data/profile.json when the odometer advanced.
//
// Env: SMARTCAR_CLIENT_ID, SMARTCAR_CLIENT_SECRET, SMARTCAR_REFRESH_TOKEN
//      SMARTCAR_VEHICLE_ID (optional; defaults to the first vehicle on the account)
//      NEW_REFRESH_TOKEN_FILE (optional; the rotated refresh token is written here)
//
// Exits 0 with no changes if today's row already exists.

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const telemetryPath = path.join(root, 'data', 'telemetry.json');
const profilePath = path.join(root, 'data', 'profile.json');

const { SMARTCAR_CLIENT_ID: clientId, SMARTCAR_CLIENT_SECRET: clientSecret, SMARTCAR_REFRESH_TOKEN: refreshToken } = process.env;
if (!clientId || !clientSecret || !refreshToken) {
  console.error('Missing SMARTCAR_CLIENT_ID, SMARTCAR_CLIENT_SECRET, or SMARTCAR_REFRESH_TOKEN.');
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const telemetry = JSON.parse(fs.readFileSync(telemetryPath, 'utf8'));
if (telemetry.some(t => t.date === today && t.source === 'smartcar')) {
  console.log(`Row for ${today} already present; nothing to do.`);
  process.exit(0);
}

// 1. Refresh the access token. Smartcar returns a new refresh token each time.
const tokenRes = await fetch('https://auth.smartcar.com/oauth/token', {
  method: 'POST',
  headers: {
    authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
    'content-type': 'application/x-www-form-urlencoded',
  },
  body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
});
const tokens = await tokenRes.json();
if (!tokenRes.ok) {
  console.error('Token refresh failed:', JSON.stringify(tokens));
  process.exit(1);
}
if (process.env.GITHUB_ACTIONS) console.log(`::add-mask::${tokens.refresh_token}`);
if (process.env.NEW_REFRESH_TOKEN_FILE) fs.writeFileSync(process.env.NEW_REFRESH_TOKEN_FILE, tokens.refresh_token);

const auth = { authorization: `Bearer ${tokens.access_token}`, 'SC-Unit-System': 'imperial' };

// 2. Pick the vehicle.
let vehicleId = process.env.SMARTCAR_VEHICLE_ID;
if (!vehicleId) {
  const vRes = await fetch('https://api.smartcar.com/v2.0/vehicles', { headers: auth });
  const list = (await vRes.json()).vehicles || [];
  if (!list.length) { console.error('No vehicles on this Smartcar account.'); process.exit(1); }
  vehicleId = list[0];
}

// 3. One batch call; endpoints the car doesn't support come back as non-200 entries.
const batchRes = await fetch(`https://api.smartcar.com/v2.0/vehicles/${vehicleId}/batch`, {
  method: 'POST',
  headers: { ...auth, 'content-type': 'application/json' },
  body: JSON.stringify({ requests: [
    { path: '/odometer' }, { path: '/engine/oil' }, { path: '/tires/pressure' }, { path: '/fuel' },
  ] }),
});
const batch = await batchRes.json();
if (!batchRes.ok) {
  console.error('Batch request failed:', JSON.stringify(batch));
  process.exit(1);
}
const byPath = Object.fromEntries((batch.responses || []).map(r => [r.path, r]));
const ok = p => byPath[p] && byPath[p].code === 200 ? byPath[p].body : null;

const odometer = ok('/odometer');
const oil = ok('/engine/oil');
const tires = ok('/tires/pressure');
const fuel = ok('/fuel');

const row = { date: today, source: 'smartcar' };
if (odometer?.distance != null) row.odometer = Math.round(odometer.distance);
if (oil?.lifeRemaining != null) row.oilLifePct = Math.round(oil.lifeRemaining * 1000) / 10;
if (tires) row.tirePressurePsi = {
  frontLeft: tires.frontLeft, frontRight: tires.frontRight, backLeft: tires.backLeft, backRight: tires.backRight,
};
if (fuel?.percentRemaining != null) row.fuelPct = Math.round(fuel.percentRemaining * 1000) / 10;
if (fuel?.range != null) row.rangeMiles = Math.round(fuel.range);

const unsupported = Object.entries(byPath).filter(([, r]) => r.code !== 200).map(([p, r]) => `${p} (${r.code})`);
if (unsupported.length) console.log('Unsupported or unavailable this run:', unsupported.join(', '));

if (Object.keys(row).length === 2) {
  console.error('Smartcar returned no usable signals; not writing a row.');
  process.exit(1);
}

telemetry.push(row);
telemetry.sort((a, b) => a.date.localeCompare(b.date));
fs.writeFileSync(telemetryPath, JSON.stringify(telemetry, null, 2) + '\n');
console.log('Appended', JSON.stringify(row));

// 4. Keep the hero mileage current.
if (row.odometer != null) {
  const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
  if (row.odometer > (profile.currentMileage || 0)) {
    profile.currentMileage = row.odometer;
    profile.mileageAsOf = today;
    fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2) + '\n');
    console.log(`Profile mileage updated to ${row.odometer} as of ${today}.`);
  }
}
