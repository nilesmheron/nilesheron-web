// api/motif-spike-auth.js
//
// THROWAWAY — Motif blind-playlist Path A spike (PRD §9.2).
// Delete this file, api/motif-spike-callback.js, and motif/spike/ once the
// platform decision is recorded. The real endpoints per PRD §8 are
// api/motif-auth.js and api/motif-token.js, built in the player session.
//
// Minimal Spotify OAuth handshake. Client secret never leaves the server.
// Only the refresh token is persisted, in an httpOnly cookie scoped as tightly
// as the path allows; the short-lived access token is minted on demand and
// handed to the Web Playback SDK, never stored in the browser.
//
// Actions (all GET):
//   ?action=login   → 302 to Spotify's authorize screen
//   ?action=token   → { access_token, expires_in } for the SDK
//   ?action=status  → { authenticated: bool }
//   ?action=logout  → clears the refresh cookie

import crypto from 'crypto';

const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';

// Must match the URI registered in the Spotify developer dashboard exactly.
const REDIRECT_URI =
  process.env.SPOTIFY_REDIRECT_URI ||
  'https://dev.nilesheron.com/api/motif-spike-callback';

// streaming                  — required by the Web Playback SDK
// user-read-email/private    — required by the SDK to identify the account
// user-modify/read-playback  — start a specific track on our device, read progress
// playlist-read-* are requested because a user token may still be able to read
// playlist contents even though this app's client-credentials token gets a 403.
// If it does not, the spike falls back to /v1/search for track URIs.
const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-modify-playback-state',
  'user-read-playback-state',
  'playlist-read-private',
  'playlist-read-collaborative',
].join(' ');

// Refresh cookie is only ever read by this endpoint, so scope it to this path.
export const RT_COOKIE = 'ms_rt';
export const RT_PATH = '/api/motif-spike-auth';
// State cookie is written here and read by the callback, so it needs /api.
export const STATE_COOKIE = 'ms_state';
export const STATE_PATH = '/api';

export function serializeCookie(name, value, { path, maxAge }) {
  const parts = [
    `${name}=${value}`,
    `Path=${path}`,
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
  ];
  return parts.join('; ');
}

export function readCookie(req, name) {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

export function basicAuthHeader() {
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  return 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64');
}

export default async function handler(req, res) {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.status(503).json({
      error: 'SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET not set on this deployment',
    });
  }

  const action = (req.query.action || 'status').toString();

  if (action === 'login') {
    const state = crypto.randomBytes(16).toString('hex');
    res.setHeader(
      'Set-Cookie',
      serializeCookie(STATE_COOKIE, state, { path: STATE_PATH, maxAge: 600 })
    );
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      scope: SCOPES,
      redirect_uri: REDIRECT_URI,
      state,
      // Force the consent screen so scope changes during the spike take effect.
      show_dialog: 'true',
    });
    res.setHeader('Location', `${AUTHORIZE_URL}?${params}`);
    return res.status(302).end();
  }

  if (action === 'logout') {
    res.setHeader(
      'Set-Cookie',
      serializeCookie(RT_COOKIE, '', { path: RT_PATH, maxAge: 0 })
    );
    return res.status(200).json({ ok: true });
  }

  const refreshToken = readCookie(req, RT_COOKIE);

  if (action === 'status') {
    return res.status(200).json({ authenticated: Boolean(refreshToken) });
  }

  if (action === 'token') {
    if (!refreshToken) {
      return res.status(401).json({ error: 'not_authenticated' });
    }

    let r;
    try {
      r = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: {
          Authorization: basicAuthHeader(),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
      });
    } catch (e) {
      return res.status(502).json({ error: 'token_endpoint_unreachable' });
    }

    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      // invalid_grant means the refresh token is dead — clear it so the page
      // falls back to the connect button instead of looping on failures.
      if (data.error === 'invalid_grant') {
        res.setHeader(
          'Set-Cookie',
          serializeCookie(RT_COOKIE, '', { path: RT_PATH, maxAge: 0 })
        );
        return res.status(401).json({ error: 'not_authenticated' });
      }
      return res.status(r.status).json({ error: data.error || 'refresh_failed' });
    }

    // Spotify may rotate the refresh token; persist the new one when it does.
    if (data.refresh_token) {
      res.setHeader(
        'Set-Cookie',
        serializeCookie(RT_COOKIE, data.refresh_token, {
          path: RT_PATH,
          maxAge: 60 * 60 * 24 * 30,
        })
      );
    }

    return res.status(200).json({
      access_token: data.access_token,
      expires_in: data.expires_in,
    });
  }

  return res.status(400).json({ error: 'unknown action' });
}
