// api/vh-admin.js
import { validateAdminToken } from './vh-auth.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function sb(path) {
  return fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`
    }
  });
}

export default async function handler(req, res) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!validateAdminToken(req)) return res.status(401).json({ error: 'Unauthorized' });

  const { client_id } = req.query;

  // Single client detail: client record + all responses + latest analysis
  if (client_id) {
    try {
      const [clientRes, responsesRes, analysisRes] = await Promise.all([
        sb(`/vh_clients?id=eq.${encodeURIComponent(client_id)}&select=id,client_name,extraction_goal,token,created_at`),
        sb(`/vh_responses?client_id=eq.${encodeURIComponent(client_id)}&select=id,respondent_name,respondent_title,respondent_email,transcript,completed_at&order=completed_at.asc`),
        sb(`/vh_analysis?client_id=eq.${encodeURIComponent(client_id)}&select=scores,narrative,created_at&order=created_at.desc&limit=1`)
      ]);

      if (!clientRes.ok || !responsesRes.ok || !analysisRes.ok) {
        return res.status(500).json({ error: 'Upstream fetch failed' });
      }

      const [clients, responses, analysis] = await Promise.all([
        clientRes.json(),
        responsesRes.json(),
        analysisRes.json()
      ]);

      if (!clients.length) return res.status(404).json({ error: 'Client not found' });

      return res.status(200).json({
        client: clients[0],
        responses,
        analysis: analysis[0] || null
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // All clients list with per-client response count and last response date
  try {
    const clientsRes = await sb('/vh_clients?select=id,client_name,extraction_goal,created_at&order=created_at.desc');
    if (!clientsRes.ok) return res.status(500).json({ error: 'Failed to fetch clients' });

    const clients = await clientsRes.json();
    if (!clients.length) return res.status(200).json([]);

    const counts = await Promise.all(
      clients.map(c =>
        sb(`/vh_responses?client_id=eq.${c.id}&select=id,completed_at&order=completed_at.desc`)
          .then(r => { if (!r.ok) throw new Error('Response fetch failed'); return r.json(); })
          .then(rows => ({ client_id: c.id, count: rows.length, latest: rows[0]?.completed_at || null }))
      )
    );

    const countMap = Object.fromEntries(counts.map(c => [c.client_id, c]));

    return res.status(200).json(
      clients.map(c => ({
        ...c,
        response_count: countMap[c.id]?.count || 0,
        last_response_at: countMap[c.id]?.latest || null
      }))
    );
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
