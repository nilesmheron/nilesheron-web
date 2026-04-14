export default async function handler(req, res) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  // POST — save a report, return its ID
  if (req.method === 'POST') {
    const { name, assessment } = req.body || {};
    if (!assessment) return res.status(400).json({ error: 'assessment required' });

    try {
      const response = await fetch(`${supabaseUrl}/rest/v1/reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({ name: name || null, assessment })
      });

      if (!response.ok) {
        const err = await response.text();
        return res.status(response.status).json({ error: err });
      }

      const rows = await response.json();
      return res.status(200).json({ id: rows[0].id });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // GET — fetch a report by ID
  if (req.method === 'GET') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });

    try {
      const response = await fetch(
        `${supabaseUrl}/rest/v1/reports?id=eq.${encodeURIComponent(id)}&select=id,name,assessment,created_at`,
        {
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`
          }
        }
      );

      if (!response.ok) {
        const err = await response.text();
        return res.status(response.status).json({ error: err });
      }

      const rows = await response.json();
      if (!rows.length) return res.status(404).json({ error: 'Report not found' });
      return res.status(200).json(rows[0]);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
