// api/motif-spike-callback.js
//
// THROWAWAY — Motif blind-playlist Path A spike (PRD §9.2). Delete with
// api/motif-spike-auth.js and motif/spike/ once the decision is recorded.
//
// This path is the registered Spotify redirect URI. It exists as its own file
// (rather than an ?action= branch) so the URI registered in the Spotify
// dashboard is a bare path with no query string:
//   https://dev.nilesheron.com/api/motif-spike-callback

import {
  RT_COOKIE,
  RT_PATH,
  STATE_COOKIE,
  STATE_PATH,
  serializeCookie,
  readCookie,
  basicAuthHeader,
} from './motif-spike-auth.js';

const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const REDIRECT_URI =
  process.env.SPOTIFY_REDIRECT_URI ||
  'https://dev.nilesheron.com/api/motif-spike-callback';
const SPIKE_PAGE = '/motif/spike/spotify';

function back(res, params) {
  res.setHeader('Location', `${SPIKE_PAGE}?${new URLSearchParams(params)}`);
  return res.status(302).end();
}

export default async function handler(req, res) {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.status(503).send('SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET not set');
  }

  const { code, state, error } = req.query;

  // Always burn the state cookie, whatever happens next.
  const clearState = serializeCookie(STATE_COOKIE, '', {
    path: STATE_PATH,
    maxAge: 0,
  });

  if (error) {
    res.setHeader('Set-Cookie', clearState);
    return back(res, { auth: 'denied', reason: String(error) });
  }

  const expectedState = readCookie(req, STATE_COOKIE);
  if (!code || !state || !expectedState || state !== expectedState) {
    res.setHeader('Set-Cookie', clearState);
    return back(res, { auth: 'error', reason: 'state_mismatch' });
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
    res.setHeader('Set-Cookie', clearState);
    return back(res, { auth: 'error', reason: 'token_endpoint_unreachable' });
  }

  const data = await r.json().catch(() => ({}));

  if (!r.ok || !data.refresh_token) {
    res.setHeader('Set-Cookie', clearState);
    return back(res, {
      auth: 'error',
      reason: data.error_description || data.error || 'exchange_failed',
    });
  }

  res.setHeader('Set-Cookie', [
    clearState,
    serializeCookie(RT_COOKIE, data.refresh_token, {
      path: RT_PATH,
      maxAge: 60 * 60 * 24 * 30,
    }),
  ]);

  return back(res, { auth: 'ok' });
}
