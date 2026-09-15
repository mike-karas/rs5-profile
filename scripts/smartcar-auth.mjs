#!/usr/bin/env node
// One-time helper: walks you through Smartcar Connect and prints the refresh token
// to store as the SMARTCAR_REFRESH_TOKEN repository secret.
//
//   SMARTCAR_CLIENT_ID=... SMARTCAR_CLIENT_SECRET=... node scripts/smartcar-auth.mjs
//
// Register http://localhost:8000/callback as a redirect URI on the Smartcar
// dashboard first. No dependencies; Node 18+.

import http from 'node:http';

const clientId = process.env.SMARTCAR_CLIENT_ID;
const clientSecret = process.env.SMARTCAR_CLIENT_SECRET;
const port = Number(process.env.PORT || 8000);
const redirectUri = `http://localhost:${port}/callback`;
const scope = ['read_vehicle_info', 'read_odometer', 'read_tires', 'read_engine_oil', 'read_fuel'].join(' ');

if (!clientId || !clientSecret) {
  console.error('Set SMARTCAR_CLIENT_ID and SMARTCAR_CLIENT_SECRET in the environment.');
  process.exit(1);
}

const state = Math.random().toString(36).slice(2);
const connectUrl = new URL('https://connect.smartcar.com/oauth/authorize');
connectUrl.search = new URLSearchParams({
  response_type: 'code',
  client_id: clientId,
  redirect_uri: redirectUri,
  scope,
  mode: 'live',
  single_select: 'true',
  state,
}).toString();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, redirectUri);
  if (url.pathname !== '/callback') { res.writeHead(404).end(); return; }

  const code = url.searchParams.get('code');
  const err = url.searchParams.get('error');
  if (err || !code || url.searchParams.get('state') !== state) {
    res.writeHead(400, { 'content-type': 'text/plain' }).end(`Auth failed: ${err || 'missing code or bad state'}`);
    console.error('Auth failed:', err || 'missing code or bad state');
    server.close();
    return;
  }

  try {
    const tokenRes = await fetch('https://auth.smartcar.com/oauth/token', {
      method: 'POST',
      headers: {
        authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
    });
    const tokens = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(JSON.stringify(tokens));

    const vRes = await fetch('https://api.smartcar.com/v2.0/vehicles', {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    const vehicles = (await vRes.json()).vehicles || [];

    res.writeHead(200, { 'content-type': 'text/plain' }).end('Connected. You can close this tab and return to the terminal.');
    console.log('\nConnected vehicle id(s):', vehicles.join(', ') || '(none)');
    console.log('\nAdd these repository secrets (Settings > Secrets and variables > Actions):');
    console.log(`  SMARTCAR_CLIENT_ID      = ${clientId}`);
    console.log('  SMARTCAR_CLIENT_SECRET  = (your client secret)');
    console.log(`  SMARTCAR_REFRESH_TOKEN  = ${tokens.refresh_token}`);
    console.log('\nThe refresh token rotates on every use, so the workflow also needs SMARTCAR_SECRETS_PAT (see README).');
  } catch (e) {
    res.writeHead(500, { 'content-type': 'text/plain' }).end('Token exchange failed; see terminal.');
    console.error('Token exchange failed:', e.message);
  } finally {
    server.close();
  }
});

server.listen(port, () => {
  console.log('Open this URL in your browser and sign in with your myAudi account:\n');
  console.log(connectUrl.toString() + '\n');
  console.log(`Waiting for the redirect on ${redirectUri} ...`);
});
