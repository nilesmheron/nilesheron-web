// api/vh-analysis-utils.js
// Shared analysis runner — called by vh-response.js (on submit) and vh-admin.js (re-run button).

export async function runAnalysis(client_id, extraction_goal, response_id, { supabaseUrl, supabaseKey, anthropicKey }) {
  function sb(path, options = {}) {
    return fetch(`${supabaseUrl}/rest/v1${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        ...(options.headers || {})
      }
    });
  }

  // Fetch goal config from DB
  const configRes = await sb(
    `/vh_goal_configs?goal_key=eq.${encodeURIComponent(extraction_goal)}&select=analysis_system_prompt,scoring_dimensions`
  );
  if (!configRes.ok) {
    console.warn(`runAnalysis: failed to fetch goal config for "${extraction_goal}"`);
    return;
  }
  const configs = await configRes.json();
  if (!configs.length) {
    console.warn(`runAnalysis: no goal config found for "${extraction_goal}"`);
    return;
  }
  const { analysis_system_prompt, scoring_dimensions } = configs[0];

  // Fetch all transcripts for this client
  const r = await sb(
    `/vh_responses?client_id=eq.${client_id}&select=respondent_name,respondent_title,transcript&order=completed_at.asc`
  );
  if (!r.ok) {
    console.warn(`runAnalysis: failed to fetch responses for client "${client_id}" — status ${r.status}`);
    return;
  }

  const responses = await r.json();
  console.log(`runAnalysis: ${responses.length} response(s) for client "${client_id}", goal "${extraction_goal}"`);

  const transcriptBlocks = responses.map(resp => {
    const turns = (resp.transcript || [])
      .map(t => `${t.role === 'user' ? resp.respondent_name : 'Interviewer'}: ${t.content}`)
      .join('\n\n');
    return `--- ${resp.respondent_name}, ${resp.respondent_title} ---\n${turns}`;
  });

  const userMessage = [
    `Extraction goal: ${extraction_goal}`,
    `Scoring dimensions: ${(scoring_dimensions || []).join(', ')}`,
    '',
    'Transcripts:',
    '',
    transcriptBlocks.join('\n\n')
  ].join('\n');

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: analysis_system_prompt,
      messages: [{ role: 'user', content: userMessage }]
    })
  });

  if (!anthropicRes.ok) {
    const errBody = await anthropicRes.text().catch(() => '(unreadable)');
    console.warn(`runAnalysis: Anthropic returned ${anthropicRes.status} — ${errBody.slice(0, 300)}`);
    return;
  }

  const data = await anthropicRes.json();
  const raw = (data.content || []).map(b => b.text || '').join('').trim();
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    console.warn(`runAnalysis: JSON.parse failed — ${e.message} — raw: ${raw.slice(0, 300)}`);
    return;
  }

  const insertRes = await sb('/vh_analysis', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      client_id,
      triggered_by_response_id: response_id || null,
      scores: parsed.scores || null,
      narrative: parsed.narrative || null
    })
  });
  if (!insertRes.ok) {
    const errBody = await insertRes.text().catch(() => '(unreadable)');
    console.warn(`runAnalysis: vh_analysis INSERT failed — status ${insertRes.status} — ${errBody.slice(0, 300)}`);
  } else {
    console.log(`runAnalysis: analysis row written for client "${client_id}"`);
  }
}
