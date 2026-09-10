// api/motif-token.js — mints a short-lived Spotify access token for the SDK.
//
// PRD §8: the player never reads a token out of the browser. It calls this
// endpoint, which exchanges the httpOnly refresh cookie for a fresh access
// token server-side. Token expiry is a recoverable state — the SDK simply
// calls getOAuthToken again and gets a new one.

import {
  TOKEN_URL,
  RT_COOKIE,
  serializeCookie,
  readCookie,
  basicAuthHeader,
} from './motif-auth.js';

export default async function handler(req, res) {
  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
    return res.status(503).json({ error: 'Spotify credentials not configured' });
  }

  const refreshToken = readCookie(req, RT_COOKIE);
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
    // A dead refresh token should send the listener back to the splash rather
    // than looping on failures.
    if (data.error === 'invalid_grant') {
      res.setHeader('Set-Cookie', serializeCookie(RT_COOKIE, '', 0));
      return res.status(401).json({ error: 'not_authenticated' });
    }
    return res.status(r.status).json({ error: data.error || 'refresh_failed' });
  }

  // Spotify may rotate the refresh token.
  if (data.refresh_token) {
    res.setHeader('Set-Cookie', serializeCookie(RT_COOKIE, data.refresh_token, 60 * 60 * 24 * 30));
  }

  return res.status(200).json({
    access_token: data.access_token,
    expires_in: data.expires_in,
  });
}
