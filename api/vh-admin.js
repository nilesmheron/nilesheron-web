// api/vh-admin.js
import { validateAdminToken } from './vh-auth.js';
import { runAnalysis } from './vh-analysis-utils.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

const GENERATE_PROMPT_SYSTEM = `You are configuring Kimba, a conversational intake agent for Verse and Hook, a marketing agency. Kimba conducts structured but natural interviews with client stakeholders.

Kimba's voice: lowercase, warm, direct, genuinely curious. Short questions. Never clinical or formal.

Based on the admin's goal description, return a JSON object with exactly these four keys:

"base_prompt": Kimba's base configuration prompt. 300-450 words. Include:
  - Persona: Kimba is a thoughtful interviewer - warm, unhurried, genuinely curious. Listens before asking. Never rushes.
  - Context: what this session is for and who Kimba is talking to (derived from the admin's goal).
  - Coverage areas: list the key areas to explore by name. Do NOT write the specific questions here - they will be added separately.
  - Behavior guidelines: get meaningful responses in each area before moving on; if a respondent gives a short or vague answer, try a simpler reframe or different angle first; use natural curiosity-led transitions ("there's something else I want to ask about") - NEVER use "let me shift gears", "let's pivot", "let me change direction".
  - Closing: only when ALL areas have been substantively covered, output [INTAKE_COMPLETE] on its own line, then a brief warm 2-3 sentence closing (lowercase, genuine). Do not use "That's fair" as a dismissal.

"questions": Array of exactly 5 suggested questions that cover the goal's key areas. Each element is an object with:
  - "text": the question text (lowercase, conversational, open-ended, concise)
  - "tag": one of "simple" (straightforward, short answer likely - 2 exchanges), "complex" (needs follow-up - 4 exchanges), "number" (quantitative or specific - 2 exchanges), "no-follow-up" (logistical or closed - 1 exchange)

"analysis_system_prompt": System prompt for an AI that analyzes transcripts from multiple respondents. Instruct it to: identify consensus and conflict across perspectives; output a JSON object with "scores" (object mapping each scoring dimension key to 0-100, where 100 = full consensus), "narrative" (2-4 sentence summary of the most actionable alignment pattern), and optionally "respondents" (array with name, kind ["alignment"|"conflict"|"outlier"], x 0-1, y 0-1, summary per respondent); if fewer than 2 respondents, return scores as null. Return ONLY valid JSON.

"scoring_dimensions": Array of 3-6 snake_case strings naming key alignment dimensions to measure.

Return ONLY valid JSON. No preamble, no markdown fences, no explanation.`;

const SYNTHESIZE_SYSTEM = `You are finalizing a Kimba session prompt for Verse and Hook.

You will receive a base prompt (context, persona, coverage areas, behavioral guidelines) and an ordered list of questions with pacing tags.

Your job:
1. Write a complete "intake_system_prompt" by weaving the questions into the base prompt naturally. The questions should be integrated into the coverage structure so they flow from genuine curiosity, not like a numbered survey. Keep the base prompt's behavioral guidelines intact.

2. Write an "opener_message": Kimba's first message to the respondent. 2-3 sentences, lowercase. Start warm - acknowledge their time or the context. Then pose one open-ended question that invites them to share freely. Do NOT jump straight into a question.

Return a JSON object with exactly two keys: "intake_system_prompt" and "opener_message".
Return ONLY valid JSON. No preamble, no markdown fences.`;

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

async function callAnthropic(systemPrompt, userMsg) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
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
      system: systemPrompt,
      messages: [{ role: 'user', content: userMsg }]
    })
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Anthropic error ${res.status}: ${errBody.slice(0, 200)}`);
  }
  const data = await res.json();
  const raw = (data.content || []).map(b => b.text || '').join('').trim();
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON in Anthropic response');
  return JSON.parse(jsonMatch[0]);
}

export default async function handler(req, res) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }
  if (!validateAdminToken(req)) return res.status(401).json({ error: 'Unauthorized' });

  // POST — re-run analysis for a client
  if (req.method === 'POST') {
    const { action, client_id, description, base_goal, base_prompt, questions, attachment_context } = req.body || {};

    if (action === 'generate_prompt') {
      if (!description || !description.trim()) {
        return res.status(400).json({ error: 'description required' });
      }
      const userMsg = `Admin goal description: ${description.trim()}\nBase mode: ${base_goal || 'custom'}`;
      try {
        const parsed = await callAnthropic(GENERATE_PROMPT_SYSTEM, userMsg);
        if (!parsed.base_prompt || !Array.isArray(parsed.questions) || !parsed.analysis_system_prompt || !Array.isArray(parsed.scoring_dimensions)) {
          return res.status(502).json({ error: 'Incomplete response from Anthropic' });
        }
        return res.status(200).json(parsed);
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }

    if (action === 'synthesize_prompt') {
      if (!base_prompt || !Array.isArray(questions) || !questions.length) {
        return res.status(400).json({ error: 'base_prompt and questions required' });
      }
      const questionsList = questions.map((q, i) => `${i + 1}. "${q.text}" [${q.tag}]`).join('\n');
      let userMsg = `Base prompt:\n${base_prompt}\n\nQuestions (in order):\n${questionsList}`;
      if (attachment_context) userMsg += `\n\nAttachment context: ${attachment_context}`;
      try {
        const parsed = await callAnthropic(SYNTHESIZE_SYSTEM, userMsg);
        if (!parsed.intake_system_prompt || !parsed.opener_message) {
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
