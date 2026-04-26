// api/vh-session.js
import crypto from 'crypto';
import { validateAdminToken } from './vh-auth.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function sb(path, options = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      ...(options.headers || {})
    }
  });
}

export default async function handler(req, res) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  // POST — create a new client session (admin only)
  if (req.method === 'POST') {
    if (!validateAdminToken(req)) return res.status(401).json({ error: 'Unauthorized' });

    const { client_name, extraction_goal, expected_respondent_count } = req.body || {};
    if (!client_name || !client_name.trim()) {
      return res.status(400).json({ error: 'client_name required' });
    }
    if (!['discovery', 'intake', 'feedback'].includes(extraction_goal)) {
      return res.status(400).json({ error: 'extraction_goal must be discovery, intake, or feedback' });
    }

    const token = crypto.randomBytes(16).toString('hex');
    const insertRow = { client_name: client_name.trim(), extraction_goal, token };
    if (expected_respondent_count && Number.isInteger(Number(expected_respondent_count)) && Number(expected_respondent_count) > 0) {
      insertRow.expected_respondent_count = Number(expected_respondent_count);
    }

    try {
      const r = await sb('/vh_clients', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(insertRow)
      });

      if (!r.ok) {
        const err = await r.text();
        return res.status(r.status).json({ error: err });
      }

      const rows = await r.json();
      return res.status(200).json(rows[0]);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // GET — fetch client record by token (public, for respondent page load)
  if (req.method === 'GET') {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: 'token required' });

    try {
      const r = await sb(
        `/vh_clients?token=eq.${encodeURIComponent(token)}&select=id,client_name,extraction_goal,max_exchanges,used_at`
      );

      if (!r.ok) {
        const err = await r.text();
        return res.status(r.status).json({ error: err });
      }

      const rows = await r.json();
      if (!rows.length) return res.status(404).json({ error: 'invalid' });

      const { used_at, ...clientData } = rows[0];
      if (used_at) return res.status(410).json({ error: 'used', used_at });
      return res.status(200).json(clientData);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // PATCH — mark token used after intake completes (called by respondent page, no auth required)
  if (req.method === 'PATCH') {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ error: 'token required' });

    try {
      const r = await sb(
        `/vh_clients?token=eq.${encodeURIComponent(token)}`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ used_at: new Date().toISOString() })
        }
      );

      if (!r.ok) {
        const err = await r.text();
        return res.status(r.status).json({ error: err });
      }

      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
