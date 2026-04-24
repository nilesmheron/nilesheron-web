// api/vh-response.js
import { GOAL_CONFIGS } from './vh-config.js';

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

async function runAnalysis(client_id, extraction_goal, response_id) {
  const config = GOAL_CONFIGS[extraction_goal];
  if (!config) {
    console.warn(`runAnalysis: no GOAL_CONFIGS entry for extraction_goal="${extraction_goal}"`);
    return;
  }

  const r = await sb(
    `/vh_responses?client_id=eq.${client_id}&select=respondent_name,respondent_title,transcript&order=completed_at.asc`
  );
  if (!r.ok) return;

  const responses = await r.json();

  const transcriptBlocks = responses.map(resp => {
    const turns = (resp.transcript || [])
      // role: 'user' = respondent, role: 'assistant' = interviewer (matches intake page convo array)
      .map(t => `${t.role === 'user' ? resp.respondent_name : 'Interviewer'}: ${t.content}`)
      .join('\n\n');
    return `--- ${resp.respondent_name}, ${resp.respondent_title} ---\n${turns}`;
  });

  const userMessage = [
    `Extraction goal: ${extraction_goal}`,
    `Scoring dimensions: ${config.scoringDimensions.join(', ')}`,
    '',
    'Transcripts:',
    '',
    transcriptBlocks.join('\n\n')
  ].join('\n');

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: config.analysisSystemPrompt,
      messages: [{ role: 'user', content: userMessage }]
    })
  });

  if (!anthropicRes.ok) return;

  const data = await anthropicRes.json();
  const text = (data.content || []).map(b => b.text || '').join('').trim();

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Sonnet returned non-JSON — skip writing analysis rather than storing garbage
    return;
  }

  await sb('/vh_analysis', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      client_id,
      triggered_by_response_id: response_id,
      scores: parsed.scores || null,
      narrative: parsed.narrative || null
    })
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(500).json({ error: 'Supabase not configured' });
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'Anthropic not configured' });

  const { client_id, respondent_name, respondent_title, respondent_email, transcript } = req.body || {};

  if (!client_id || !respondent_name || !respondent_title || !respondent_email) {
    return res.status(400).json({ error: 'client_id, respondent_name, respondent_title, respondent_email required' });
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(client_id)) {
    return res.status(400).json({ error: 'Invalid client_id format' });
  }
  if (!Array.isArray(transcript) || !transcript.length) {
    return res.status(400).json({ error: 'transcript must be a non-empty array' });
  }

  try {
    // Verify client + get extraction_goal
    const clientRes = await sb(`/vh_clients?id=eq.${encodeURIComponent(client_id)}&select=id,extraction_goal`);
    if (!clientRes.ok) return res.status(500).json({ error: 'Failed to verify client' });
    const clients = await clientRes.json();
    if (!clients.length) return res.status(404).json({ error: 'Client not found' });

    const { extraction_goal } = clients[0];

    // Save response
    const saveRes = await sb('/vh_responses', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ client_id, respondent_name, respondent_title, respondent_email, transcript })
    });

    if (!saveRes.ok) {
      const err = await saveRes.text();
      return res.status(saveRes.status).json({ error: err });
    }

    const rows = await saveRes.json();
    if (!rows || !rows[0]) return res.status(500).json({ error: 'Response saved but row not returned' });
    const response_id = rows[0].id;

    // Run analysis synchronously (respondent waits ~3-6s; acceptable after a 10-15min interview)
    try {
      await runAnalysis(client_id, extraction_goal, response_id);
    } catch (e) {
      // Analysis failure does not fail the submission
      console.error('Analysis error:', e.message);
    }

    return res.status(200).json({ ok: true, response_id });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
