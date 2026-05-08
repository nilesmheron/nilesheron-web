// api/vh-track.js
// Fire-and-forget analytics event ingestion for Kimba respondent sessions.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const ALLOWED_EVENTS = new Set([
  'session.landed',
  'session.started',
  'session.completed',
  'session.errored'
]);

// Best-effort in-memory token cache — does not survive cold starts
const TOKEN_CACHE = new Map();
const TOKEN_TTL_MS = 60_000;
const TOKEN_CACHE_MAX = 256;

async function isValidToken(token) {
  const now = Date.now();
  const cached = TOKEN_CACHE.get(token);
  if (cached) {
    if (cached > now) return true;
    TOKEN_CACHE.delete(token);
  }
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/vh_clients?token=eq.${encodeURIComponent(token)}&select=id`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  if (!r.ok) return false;
  const rows = await r.json();
  if (!rows.length) return false;
  if (TOKEN_CACHE.size >= TOKEN_CACHE_MAX) {
    TOKEN_CACHE.delete(TOKEN_CACHE.keys().next().value);
  }
  TOKEN_CACHE.set(token, now + TOKEN_TTL_MS);
  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(500).json({ error: 'Supabase not configured' });

  const { token, client_id, event, meta } = req.body || {};

  if (!token) return res.status(401).json({ error: 'token required' });
  if (!(await isValidToken(token))) return res.status(401).json({ error: 'invalid token' });

  if (!event || !ALLOWED_EVENTS.has(event)) {
    return res.status(400).json({ error: 'invalid event' });
  }

  if (meta !== undefined && JSON.stringify(meta).length > 4096) {
    return res.status(400).json({ error: 'meta too large' });
  }

  const row = {
    event_name: event,
    token:      token,
    client_id:  client_id || null,
    meta:       meta      || null
  };

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/vh_events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey:         SUPABASE_KEY,
        Authorization:  `Bearer ${SUPABASE_KEY}`,
        Prefer:         'return=minimal'
      },
      body: JSON.stringify(row)
    });

    if (!r.ok) {
      const err = await r.text();
      return res.status(r.status).json({ error: err });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
