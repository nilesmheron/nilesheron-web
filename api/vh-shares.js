// api/vh-shares.js
import { getAuth, getAccess } from './vh-auth.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function sb(path, options = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      ...(options.headers || {}),
    },
  });
}

export default async function handler(req, res) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  const auth = await getAuth(req);
  if (!auth.ok) return res.status(401).json({ error: 'Unauthorized' });

  const client_id = req.method === 'GET' ? req.query.client_id : req.body?.client_id;
  if (!client_id) return res.status(400).json({ error: 'client_id required' });

  const access = await getAccess(auth, client_id);
  if (!access.canShare) return res.status(403).json({ error: 'Only the owner or an admin can manage shares' });

  if (req.method === 'GET') {
    try {
      const r = await sb(
        `/vh_session_shares?client_id=eq.${encodeURIComponent(client_id)}&select=id,user_id,level,granted_at,vh_users!vh_session_shares_user_id_fkey(username)&order=granted_at.asc`
      );
      if (!r.ok) return res.status(500).json({ error: 'Failed to fetch shares' });
      const rows = await r.json();
      return res.status(200).json(
        rows.map(({ vh_users: u, ...s }) => ({ ...s, username: u?.username || null }))
      );
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'POST') {
    const { user_id: rawUserId, username, level } = req.body || {};
    if (!['view', 'edit'].includes(level)) {
      return res.status(400).json({ error: 'level must be view or edit' });
    }

    let user_id = rawUserId;

    // Accept username as alternative to user_id
    if (!user_id && username) {
      try {
        const r = await sb(`/vh_users?username=eq.${encodeURIComponent(username)}&select=id`);
        if (!r.ok) return res.status(500).json({ error: 'User lookup failed' });
        const rows = await r.json();
        if (!rows.length) return res.status(404).json({ error: 'User not found' });
        user_id = rows[0].id;
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }

    if (!user_id) return res.status(400).json({ error: 'user_id or username required' });

    try {
      const r = await sb('/vh_session_shares?on_conflict=client_id,user_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({
          client_id,
          user_id,
          level,
          granted_by: auth.isSuperadmin ? null : auth.userId,
        }),
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

  if (req.method === 'DELETE') {
    const { user_id } = req.body || {};
    if (!user_id) return res.status(400).json({ error: 'user_id required' });
    try {
      const r = await sb(
        `/vh_session_shares?client_id=eq.${encodeURIComponent(client_id)}&user_id=eq.${encodeURIComponent(user_id)}`,
        { method: 'DELETE' }
      );
      if (!r.ok) return res.status(500).json({ error: 'Failed to delete share' });
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
