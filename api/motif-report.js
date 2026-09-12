// api/motif-report.js — receives a player failure trace so a listener does not
// have to copy and paste one.
//
// Fires ONLY when playback fails to start. There is no success beacon and no
// analytics here: PRD §12 lists analytics as a non-goal and keeps only basic
// event logging in scope. What arrives is the browser user-agent and the
// player's own step trace — no Spotify user id, no tokens, no listening
// history. The trace is written to the Vercel runtime log, which is where it
// gets read from; nothing is stored.

const DEFAULT_ALLOWED_ORIGINS = ['https://dev.nilesheron.com'];
const MAX_LINES = 60;
const MAX_LINE = 300;

function parseList(envValue, fallback) {
  if (!envValue) return fallback;
  return envValue.split(',').map((s) => s.trim()).filter(Boolean);
}

// Belt and braces: the client is not supposed to send anything secret, but a
// trace line should never carry one even if the player changes later.
function scrub(line) {
  return String(line)
    .slice(0, MAX_LINE)
    .replace(/(access_token|refresh_token|Bearer)\s*[:=]?\s*\S+/gi, '$1 [redacted]');
}

export default async function handler(req, res) {
  const allowed = parseList(process.env.CHAT_ALLOWED_ORIGINS, DEFAULT_ALLOWED_ORIGINS);
  const origin = req.headers.origin;
  if (origin && !allowed.includes(origin)) {
    return res.status(403).json({ error: 'origin not allowed' });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const { slug, reason, diag } = req.body || {};
  const lines = Array.isArray(diag) ? diag.slice(0, MAX_LINES).map(scrub) : [];

  console.log(
    '[MOTIF-FAIL] ' + JSON.stringify({
      slug: String(slug || '').slice(0, 60),
      reason: String(reason || '').slice(0, 120),
      lines: lines.length,
    })
  );
  lines.forEach((l) => console.log('[MOTIF-FAIL]   ' + l));

  return res.status(204).end();
}
