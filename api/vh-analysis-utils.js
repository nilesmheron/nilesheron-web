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

  const respondentNames = responses.map(r => r.respondent_name).join(', ');

  const userMessage = [
    `Extraction goal: ${extraction_goal}`,
    `Scoring dimensions: ${(scoring_dimensions || []).join(', ')}`,
    `Respondents: ${respondentNames}`,
    '',
    'Transcripts:',
    '',
    transcriptBlocks.join('\n\n'),
    '',
    'After scoring the dimensions, also classify each respondent individually.',
    'Add a "respondents" array to your JSON: [{"name":"respondent name","kind":"alignment|conflict|outlier","x":0.0,"y":0.0}]',
    'where x = brand_clarity (0=very unclear, 1=very clear) and y = alignment_depth (0=split from group consensus, 1=deeply aligned).',
    'Use the same respondent names as listed above.'
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
      max_tokens: 2048,
      temperature: 0,
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

  // Extract JSON object regardless of fences or preamble text
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.warn(`runAnalysis: no JSON object found in response — raw: ${raw.slice(0, 300)}`);
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.warn(`runAnalysis: JSON.parse failed — ${e.message} — raw: ${raw.slice(0, 300)}`);
    return;
  }

  // Derive flat scores from dimensions (new schema) or use legacy scores field
  const dimScores = parsed.dimensions
    ? Object.fromEntries(Object.entries(parsed.dimensions).map(([k, v]) => [k, v.score]))
    : (parsed.scores || null);

  // Store respondent classifications alongside scores (no schema change needed)
  const scores = { ...dimScores };
  if (parsed.respondents && Array.isArray(parsed.respondents)) {
    scores._respondents = parsed.respondents;
  }

  const insertRes = await sb('/vh_analysis', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      client_id,
      triggered_by_response_id: response_id || null,
      scores,
      narrative: parsed.narrative || null,
      dimensions: parsed.dimensions || null
    })
  });
  if (!insertRes.ok) {
    const errBody = await insertRes.text().catch(() => '(unreadable)');
    console.warn(`runAnalysis: vh_analysis INSERT failed — status ${insertRes.status} — ${errBody.slice(0, 300)}`);
  } else {
    console.log(`runAnalysis: analysis row written for client "${client_id}"`);
  }
}
