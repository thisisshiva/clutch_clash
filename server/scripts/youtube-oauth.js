/**
 * One-time helper: obtain a YouTube OAuth refresh token for connections.json.
 *
 * Setup:
 *   1. Google Cloud Console → create OAuth client (Desktop or Web)
 *   2. Enable YouTube Data API v3
 *   3. Put clientId / clientSecret into connections.json
 *   4. Run:  node server/scripts/youtube-oauth.js
 *   5. Paste the printed refreshToken into connections.json
 */

import http from 'node:http';
import { URL } from 'node:url';
import { loadConnections } from '../src/publish/connections.js';

const SCOPES = ['https://www.googleapis.com/auth/youtube.upload'].join(' ');
const REDIRECT = 'http://127.0.0.1:8765/callback';

const conn = loadConnections();
const { clientId, clientSecret } = conn.youtube.credentials || {};

if (!clientId || !clientSecret) {
  console.error('Fill platforms.youtube.credentials.clientId and clientSecret in connections.json first.');
  process.exit(1);
}

const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authUrl.searchParams.set('client_id', clientId);
authUrl.searchParams.set('redirect_uri', REDIRECT);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', SCOPES);
authUrl.searchParams.set('access_type', 'offline');
authUrl.searchParams.set('prompt', 'consent');

console.log('\nOpen this URL in your browser:\n');
console.log(authUrl.toString());
console.log('\nWaiting for OAuth callback on', REDIRECT, '…\n');

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, REDIRECT);
    if (url.pathname !== '/callback') {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const code = url.searchParams.get('code');
    if (!code) {
      res.writeHead(400);
      res.end('Missing code');
      return;
    }

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: REDIRECT,
        grant_type: 'authorization_code',
      }),
    });
    const tokens = await tokenRes.json();
    if (!tokenRes.ok) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(JSON.stringify(tokens, null, 2));
      console.error('Token exchange failed:', tokens);
      server.close();
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<h1>YouTube connected</h1><p>You can close this tab and return to the terminal.</p>');

    console.log('\nPaste this into connections.json → platforms.youtube.credentials.refreshToken:\n');
    console.log(tokens.refresh_token || '(no refresh_token returned — revoke access and retry with prompt=consent)');
    console.log('');
    server.close();
    process.exit(0);
  } catch (err) {
    console.error(err);
    res.writeHead(500);
    res.end(String(err.message));
    server.close();
    process.exit(1);
  }
});

server.listen(8765);
