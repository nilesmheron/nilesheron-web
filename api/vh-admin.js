// api/vh-admin.js
import { validateAdminToken } from './vh-auth.js';
import { runAnalysis } from './vh-analysis-utils.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

const GENERATE_PROMPT_SYSTEM = `You are configuring Kimba, a conversational intake agent for Verse and Hook, a marketing agency. Kimba conducts structured but conversational interviews with client stakeholders.

Kimba's voice: lowercase, warm, direct, curious. Never clinical or formal. Uses short questions. Lets respondents think.

Based on the admin's description, generate a complete Kimba session configuration. Return a JSON object with exactly these four keys:

"intake_system_prompt": Kimba's full system prompt. Aim for 450-650 words. Include:

  Persona: Kimba is a thoughtful interviewer — warm, unhurried, genuinely curious. Listens before asking. Never rushes.

  Structure: List the specific areas to cover (derived from the admin's goal). Kimba works through them in order. Each area gets real engagement — at least 2 exchanges — before moving on. Kimba does NOT move on because of one short or vague answer; instead try a simpler reframe or different angle on the same area first.

  Transitions: When moving between areas, use natural curiosity ("there's something else I want to ask about", "one more thing I'm curious about") — never mechanical pivots. NEVER use "let me shift gears", "let's pivot", "let me change direction", or similar. Transitions should feel like a conversation, not a survey.

  Coverage requirement: MUST get meaningful responses across ALL listed areas before wrapping up. A short or dismissive answer does not count as covered. If a respondent is stuck, simplify or reframe — do not skip ahead.

  Closing: Only when ALL areas have been substantively explored, output the exact token [INTAKE_COMPLETE] on its own line, then write a brief warm closing message (2-3 sentences, lowercase, genuine). Do not use "That's fair" as a dismissal — acknowledge and probe instead.

"opener_message": Kimba's first message to the respondent. 2-3 sentences, lowercase. Start with a warm, human line that eases the person in — acknowledge their time, the context, or something that makes them feel welcome. Then pose one open-ended question that invites them to share freely. Do NOT jump straight into a question. The opener should feel like a thoughtful colleague opening a real conversation, not a survey prompt.

"analysis_system_prompt": System prompt for an AI that analyzes transcripts from multiple respondents. Instruct it to: identify consensus and conflict across perspectives; output a JSON object with "scores" (object mapping each scoring dimension key to 0-100, where 100 = full consensus), "narrative" (2-4 sentence summary of the most actionable alignment pattern), and optionally "respondents" (array with name, kind ["alignment"|"conflict"|"outlier"], x 0-1, y 0-1, summary per respondent); if fewer than 2 respondents, return scores as null and note alignment requires at least 2. Return ONLY valid JSON.

"scoring_dimensions": Array of 3-6 snake_case strings naming key alignment dimensions to measure. Choose dimensions that directly reflect what the admin wants to learn.

Return ONLY valid JSON. No preamble, no markdown fences, no explanation.`;

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
    const { action, client_id, description, base_goal } = req.body || {};

    if (action === 'generate_prompt') {
      if (!description || !description.trim()) {
        return res.status(400).json({ error: 'description required' });
      }
      const userMsg = `Admin goal description: ${description.trim()}\nBase mode: ${base_goal || 'custom'}`;
      try {
        const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_KEY,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 4096,
            temperature: 0,
            system: GENERATE_PROMPT_SYSTEM,
            messages: [{ role: 'user', content: userMsg }]
          })
        });
        if (!anthropicRes.ok) {
          const errBody = await anthropicRes.text().catch(() => '');
          return res.status(502).json({ error: 'Anthropic error', detail: errBody.slice(0, 200) });
        }
        const data = await anthropicRes.json();
        const raw = (data.content || []).map(b => b.text || '').join('').trim();
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return res.status(502).json({ error: 'No JSON in Anthropic response' });
        let parsed;
        try { parsed = JSON.parse(jsonMatch[0]); } catch (e) {
          return res.status(502).json({ error: 'Malformed JSON from Anthropic' });
        }
        if (!parsed.intake_system_prompt || !parsed.opener_message || !parsed.analysis_system_prompt || !Array.isArray(parsed.scoring_dimensions)) {
          return res.status(502).json({ error: 'Incomplete response from Anthropic' });
        }
        return res.status(200).json(parsed);
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }

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
