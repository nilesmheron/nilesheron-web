// api/vh-track.js
// Fire-and-forget analytics event ingestion for Kimba respondent sessions.
// No auth required — called from the public respondent page.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const ALLOWED_EVENTS = new Set([
  'session.landed',
  'session.started',
  'session.completed',
  'session.errored'
]);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(500).json({ error: 'Supabase not configured' });

  const { token, client_id, event, meta } = req.body || {};

  if (!event || !ALLOWED_EVENTS.has(event)) {
    return res.status(400).json({ error: 'invalid event' });
  }

  const row = {
    event_name: event,
    token:      token     || null,
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
