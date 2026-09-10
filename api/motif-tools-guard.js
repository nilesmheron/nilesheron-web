// api/motif-tools-guard.js — shared auth check for the curator write endpoints.
//
// The builder page itself is gated by middleware.js Basic Auth on /motif/tools,
// but middleware does not cover /api, and browsers do not reliably attach
// cached Basic credentials to a different path tree via fetch. So the write
// endpoints check the same user/password explicitly, with the page sending an
// Authorization header it builds from a password the curator types once.
//
// Same credentials, same env vars, no secret embedded in the static page.

import crypto from 'crypto';

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// Returns true if the request is authorized. Otherwise writes the response
// and returns false — callers should just `return`.
export function requireCurator(req, res) {
  const expectedUser = process.env.MOTIF_TOOLS_USER;
  const expectedPassword = process.env.MOTIF_TOOLS_PASSWORD;

  if (!expectedPassword) {
    res.status(503).json({ error: 'MOTIF_TOOLS_PASSWORD not configured' });
    return false;
  }

  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Basic ')) {
    res.status(401).json({ error: 'credentials required' });
    return false;
  }

  let user = '';
  let password = '';
  try {
    const decoded = Buffer.from(auth.slice(6), 'base64').toString('utf8');
    const i = decoded.indexOf(':');
    user = i >= 0 ? decoded.slice(0, i) : '';
    password = i >= 0 ? decoded.slice(i + 1) : decoded;
  } catch (_) {
    res.status(401).json({ error: 'malformed credentials' });
    return false;
  }

  const passwordOk = safeEqual(password, expectedPassword);
  const userOk = expectedUser ? safeEqual(user, expectedUser) : true;

  if (!passwordOk || !userOk) {
    res.status(401).json({ error: 'bad credentials' });
    return false;
  }

  return true;
}

// Entry slugs become file paths and URLs. Keep them boring.
export function validSlug(slug) {
  return typeof slug === 'string' && /^[a-z0-9][a-z0-9-]{0,48}$/.test(slug);
}
