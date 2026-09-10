// api/motif-callback.js — registered Spotify redirect URI for the Motif player.
//
// Its own file rather than an ?action= branch on motif-auth.js so the URI
// registered in the Spotify dashboard is a bare path with no query string:
//   https://dev.nilesheron.com/api/motif-callback

import {
  TOKEN_URL,
  REDIRECT_URI,
  RT_COOKIE,
  STATE_COOKIE,
  RETURN_COOKIE,
  serializeCookie,
  readCookie,
  basicAuthHeader,
  safeReturnPath,
} from './motif-auth.js';

export default async function handler(req, res) {
  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
    return res.status(503).send('Spotify credentials not configured');
  }

  const { code, state, error } = req.query;

  const back = safeReturnPath(
    decodeURIComponent(readCookie(req, RETURN_COOKIE) || '')
  );
  const clear = [
    serializeCookie(STATE_COOKIE, '', 0),
    serializeCookie(RETURN_COOKIE, '', 0),
  ];

  function bounce(params) {
    res.setHeader('Location', `${back}?${new URLSearchParams(params)}`);
    return res.status(302).end();
  }

  if (error) {
    res.setHeader('Set-Cookie', clear);
    return bounce({ auth: 'denied' });
  }

  const expected = readCookie(req, STATE_COOKIE);
  if (!code || !state || !expected || state !== expected) {
    res.setHeader('Set-Cookie', clear);
    return bounce({ auth: 'error', reason: 'state_mismatch' });
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
        grant_type: 'authorization_code',
        code: String(code),
        redirect_uri: REDIRECT_URI,
      }),
    });
  } catch (e) {
    res.setHeader('Set-Cookie', clear);
    return bounce({ auth: 'error', reason: 'unreachable' });
  }

  const data = await r.json().catch(() => ({}));

  if (!r.ok || !data.refresh_token) {
    res.setHeader('Set-Cookie', clear);
    return bounce({ auth: 'error', reason: data.error || 'exchange_failed' });
  }

  res.setHeader('Set-Cookie', clear.concat([
    serializeCookie(RT_COOKIE, data.refresh_token, 60 * 60 * 24 * 30),
  ]));

  return bounce({ auth: 'ok' });
}
