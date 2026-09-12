// api/motif-apple-token.js — mints an Apple Music developer token.
//
// MusicKit needs an ES256 JWT signed with the MusicKit private key. The .p8
// never reaches the browser: it is signed here and only the short-lived token
// goes out. Node's crypto can do ES256 directly, so this adds no dependency —
// the repo has no build step and should keep it that way.
//
// Requires: APPLE_MUSIC_TEAM_ID, APPLE_MUSIC_KEY_ID, APPLE_MUSIC_PRIVATE_KEY
// (the whole .p8 file contents, BEGIN/END lines included).
//
// The token carries an `origin` claim, so even if it leaks it is only usable
// from our own pages rather than as free access to the Apple Music API.
//
// GOTCHA, verified 2026-09-12: Apple enforces that claim on every request, not
// just browser ones. A server-side call with no Origin header gets a bare 401
// with an empty body. Anything calling the Apple Music API from our own
// functions — the builder's catalog resolver, for one — must send
// `Origin: https://dev.nilesheron.com` explicitly, or use a token minted
// without the claim.

import crypto from 'crypto';

const DEFAULT_ORIGINS = ['https://dev.nilesheron.com'];
// Apple allows up to six months. Twelve hours keeps the blast radius small and
// costs nothing — the page fetches a fresh one whenever it loads.
const TTL_SECONDS = 12 * 60 * 60;

let cached = { token: null, expiresAt: 0 };

function b64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function parseList(envValue, fallback) {
  if (!envValue) return fallback;
  return envValue.split(',').map((s) => s.trim()).filter(Boolean);
}

// Vercel's dashboard preserves real newlines, but a value pasted through a
// shell often arrives with literal \n. Accept both.
function normaliseKey(raw) {
  const k = String(raw).trim();
  return k.includes('\\n') ? k.replace(/\\n/g, '\n') : k;
}

function mint() {
  const teamId = process.env.APPLE_MUSIC_TEAM_ID;
  const keyId = process.env.APPLE_MUSIC_KEY_ID;
  const privateKey = normaliseKey(process.env.APPLE_MUSIC_PRIVATE_KEY || '');
  const origins = parseList(process.env.APPLE_MUSIC_ORIGINS, DEFAULT_ORIGINS);

  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + TTL_SECONDS;

  const header = { alg: 'ES256', kid: keyId };
  const payload = { iss: teamId, iat, exp, origin: origins };

  const signingInput =
    b64url(JSON.stringify(header)) + '.' + b64url(JSON.stringify(payload));

  // ieee-p1363 gives the raw r||s signature JWS wants; the default DER
  // encoding would produce a token Apple rejects.
  const signature = crypto.sign('sha256', Buffer.from(signingInput), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  });

  return { token: signingInput + '.' + b64url(signature), exp };
}

export default async function handler(req, res) {
  const missing = ['APPLE_MUSIC_TEAM_ID', 'APPLE_MUSIC_KEY_ID', 'APPLE_MUSIC_PRIVATE_KEY']
    .filter((k) => !process.env[k]);
  if (missing.length) {
    return res.status(503).json({ error: 'not configured: ' + missing.join(', ') });
  }

  const now = Math.floor(Date.now() / 1000);
  if (!cached.token || cached.expiresAt - 300 < now) {
    try {
      const { token, exp } = mint();
      cached = { token, expiresAt: exp };
    } catch (e) {
      // Almost always a malformed key — wrong file, or newlines lost in transit.
      return res.status(500).json({ error: 'could not sign token: ' + e.message });
    }
  }

  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.status(200).json({
    token: cached.token,
    expires_in: cached.expiresAt - now,
  });
}
