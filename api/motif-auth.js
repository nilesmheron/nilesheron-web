// api/motif-auth.js — Spotify OAuth for the Motif blind player (PRD §8)
//
// Actions (all GET):
//   ?action=login&return=/motif/<slug>/listen  → 302 to Spotify's consent screen
//   ?action=status                             → { authenticated: bool }
//   ?action=logout                             → clears the refresh cookie
//
// The authorization-code exchange lives in api/motif-callback.js, which is the
// registered redirect URI. Access tokens are minted on demand by
// api/motif-token.js and never stored in the browser.
//
// Cookie scoping note: PRD §8 asks for tokens scoped to /motif. That is not
// possible — the token endpoint lives under /api, and a cookie with
// Path=/motif would never be sent to it. Path=/api is the tightest scoping
// that works, and is shared by motif-token.js and motif-callback.js.

import crypto from 'crypto';

export const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';
export const TOKEN_URL = 'https://accounts.spotify.com/api/token';

export const REDIRECT_URI =
  process.env.SPOTIFY_MOTIF_REDIRECT_URI ||
  'https://dev.nilesheron.com/api/motif-callback';

// streaming                    — required by the Web Playback SDK
// user-read-email/private      — required by the SDK to identify the account
// user-modify/read-playback    — start the seed track, append to the queue,
//                                read progress
export const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-modify-playback-state',
  'user-read-playback-state',
].join(' ');

export const RT_COOKIE = 'motif_rt';
export const STATE_COOKIE = 'motif_state';
export const RETURN_COOKIE = 'motif_return';
export const COOKIE_PATH = '/api';

export function serializeCookie(name, value, maxAge) {
  return [
    `${name}=${value}`,
    `Path=${COOKIE_PATH}`,
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
  ].join('; ');
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

// Only ever redirect back into our own site, and only to a Motif listen page.
export function safeReturnPath(raw) {
  const fallback = '/motif';
  if (!raw) return fallback;
  const s = String(raw);
  if (!s.startsWith('/') || s.startsWith('//')) return fallback;
  return /^\/motif\/[A-Za-z0-9._-]+\/listen$/.test(s) ? s : fallback;
}

export default async function handler(req, res) {
  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
    return res.status(503).json({ error: 'Spotify credentials not configured' });
  }

  const action = (req.query.action || 'status').toString();

  if (action === 'login') {
    const state = crypto.randomBytes(16).toString('hex');
    const back = safeReturnPath(req.query.return);
    res.setHeader('Set-Cookie', [
      serializeCookie(STATE_COOKIE, state, 600),
      serializeCookie(RETURN_COOKIE, encodeURIComponent(back), 600),
    ]);
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.SPOTIFY_CLIENT_ID,
      scope: SCOPES,
      redirect_uri: REDIRECT_URI,
      state,
    });
    res.setHeader('Location', `${AUTHORIZE_URL}?${params}`);
    return res.status(302).end();
  }

  if (action === 'logout') {
    res.setHeader('Set-Cookie', serializeCookie(RT_COOKIE, '', 0));
    return res.status(200).json({ ok: true });
  }

  if (action === 'status') {
    return res.status(200).json({ authenticated: Boolean(readCookie(req, RT_COOKIE)) });
  }

  return res.status(400).json({ error: 'unknown action' });
}
