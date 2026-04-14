export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  const {
    name,
    feedback,
    completed,
    share_report,
    share_transcript,
    assessment,
    transcript
  } = req.body || {};

  const row = {
    name: name || null,
    feedback: feedback || null,
    completed: completed === true,
    share_report: share_report === true,
    share_transcript: share_transcript === true,
    assessment: share_report === true ? (assessment || null) : null,
    transcript: share_transcript === true ? (transcript || null) : null
  };

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(row)
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
