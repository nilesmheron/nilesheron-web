// api/vh-admin.js
import { validateAdminToken } from './vh-auth.js';
import { runAnalysis } from './vh-analysis-utils.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

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
  if (!validateAdminToken(req)) return res.status(401).json({ error: 'Unauthorized' });

  // POST — re-run analysis for a client
  if (req.method === 'POST') {
    const { action, client_id } = req.body || {};
    if (action !== 'rerun_analysis') return res.status(400).json({ error: 'Unknown action' });
    if (!client_id) return res.status(400).json({ error: 'client_id required' });

    try {
      const clientRes = await sb(`/vh_clients?id=eq.${encodeURIComponent(client_id)}&select=id,extraction_goal`);
      if (!clientRes.ok) return res.status(500).json({ error: 'Failed to fetch client' });
      const clients = await clientRes.json();
      if (!clients.length) return res.status(404).json({ error: 'Client not found' });

      await runAnalysis(client_id, clients[0].extraction_goal, null, {
        supabaseUrl: SUPABASE_URL,
        supabaseKey: SUPABASE_KEY,
        anthropicKey: ANTHROPIC_KEY
      });
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // PATCH — update editable client settings
  if (req.method === 'PATCH') {
    const { client_id, expected_respondent_count, max_exchanges } = req.body || {};
    if (!client_id) return res.status(400).json({ error: 'client_id required' });

    const updates = {};
    if (expected_respondent_count != null) {
      const n = Number(expected_respondent_count);
      if (Number.isInteger(n) && n > 0) updates.expected_respondent_count = n;
    }
    if (max_exchanges != null) {
      const n = Number(max_exchanges);
      if (Number.isInteger(n) && n >= 2 && n <= 30) updates.max_exchanges = n;
    }
    if (!Object.keys(updates).length) return res.status(400).json({ error: 'no valid fields' });

    try {
      const r = await sb(`/vh_clients?id=eq.${encodeURIComponent(client_id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(updates)
      });
      if (!r.ok) return res.status(500).json({ error: 'Update failed' });
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { client_id, all_responses } = req.query;

  // All respondents across all clients (for the respondents sidebar view)
  if (all_responses === 'true') {
    try {
      const r = await sb(
        '/vh_responses?select=id,respondent_name,respondent_title,respondent_email,completed_at,client_id,vh_clients(id,client_name)&order=completed_at.desc'
      );
      if (!r.ok) return res.status(500).json({ error: 'Failed to fetch respondents' });
      const rows = await r.json();
      return res.status(200).json(rows);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // Single client detail: client record + all responses + latest analysis
  if (client_id) {
    try {
      const [clientRes, responsesRes, analysisRes] = await Promise.all([
        sb(`/vh_clients?id=eq.${encodeURIComponent(client_id)}&select=id,client_name,extraction_goal,token,created_at,expected_respondent_count,max_exchanges`),
        sb(`/vh_responses?client_id=eq.${encodeURIComponent(client_id)}&select=id,respondent_name,respondent_title,respondent_email,transcript,completed_at&order=completed_at.asc`),
        sb(`/vh_analysis?client_id=eq.${encodeURIComponent(client_id)}&select=scores,narrative,dimensions,created_at&order=created_at.desc&limit=1`)
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
    const clientsRes = await sb('/vh_clients?select=id,client_name,extraction_goal,created_at,expected_respondent_count&order=created_at.desc');
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
