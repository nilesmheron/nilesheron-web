# VH Goal Config Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move VH interview prompts and scoring configs from hardcoded JS into a Supabase table, with a full admin editor for creating and editing goal types.

**Architecture:** A new `vh_goal_configs` table (keyed by free-text `goal_key`) stores intake prompts, opener messages, analysis prompts, and scoring dimensions. A new `api/vh-goal-config.js` endpoint serves configs to the intake page (public) and exposes full CRUD to the admin. The `runAnalysis` function moves to a shared `api/vh-analysis-utils.js` module so both `vh-response.js` (on new submission) and `vh-admin.js` (re-run button) can call it. The admin panel gains a Goals section for editing existing goal types and creating new ones.

**Tech Stack:** Supabase REST API (PostgREST), vanilla JS, Vercel serverless Node.js (ESM), existing auth pattern (`x-vh-token` + `validateAdminToken`)

---

## File structure

**Create:**
- `api/vh-analysis-utils.js` — shared `runAnalysis` function (fetches config from DB, calls Sonnet, writes `vh_analysis`)
- `api/vh-goal-config.js` — `GET` (public single / admin all) + `PUT` (admin upsert)

**Modify:**
- `api/vh-response.js` — remove `vh-config.js` import, import `runAnalysis` from `vh-analysis-utils.js`
- `api/vh-admin.js` — add `POST` handler for re-run analysis, import `runAnalysis`
- `verseandhook/intake/index.html` — remove hardcoded `INTAKE_SYS`/`OPENERS`, fetch goal config at load time
- `verseandhook/intake/admin.html` — Goals editor view, dynamic goal dropdown, re-run analysis button
- `supabase/vh-schema.sql` — append new table definition

---

## Task 1: Database migration — `vh_goal_configs` table

**Files:**
- Modify: `supabase/vh-schema.sql` (append)
- Run: SQL against Supabase project `xszhfxzfybubdlivbfxp` via MCP `execute_sql`

- [ ] **Step 1: Create the table and disable RLS**

Run via Supabase MCP `execute_sql` on project `xszhfxzfybubdlivbfxp`:

```sql
CREATE TABLE IF NOT EXISTS vh_goal_configs (
  goal_key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  intake_system_prompt TEXT NOT NULL,
  opener_message TEXT NOT NULL,
  analysis_system_prompt TEXT NOT NULL,
  scoring_dimensions JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE vh_goal_configs DISABLE ROW LEVEL SECURITY;
```

Expected: no error.

- [ ] **Step 2: Drop the check constraint on `vh_clients.extraction_goal`**

Run:

```sql
ALTER TABLE vh_clients DROP CONSTRAINT IF EXISTS vh_clients_extraction_goal_check;
```

If that returns "constraint does not exist", find the real name and drop it:

```sql
SELECT conname FROM pg_constraint
WHERE conrelid = 'vh_clients'::regclass AND contype = 'c';
```

Then: `ALTER TABLE vh_clients DROP CONSTRAINT <name>;`

Expected after drop: `vh_clients.extraction_goal` accepts any text value.

- [ ] **Step 3: Seed the three existing goal configs**

Run (uses dollar-quoting to avoid quote escaping in prompt text):

```sql
INSERT INTO vh_goal_configs (goal_key, name, intake_system_prompt, opener_message, analysis_system_prompt, scoring_dimensions)
VALUES (
  'discovery',
  'Brand Discovery',
  $i1$You are a warm, focused intake interviewer for Verse and Hook, a marketing agency. You are speaking with a stakeholder of a new client. Your job is to understand their perspective on the brand so the agency can develop effective marketing and storytelling strategy.

Move through this as a real conversation. One question per turn. Match their register. Mirror what you hear before asking the next thing. Do not announce phases or topic areas.

Cover these areas naturally:
- Their role and relationship to the brand
- How they describe the brand — what it stands for, what makes it distinct
- Target audience — specific, not generic
- Competitive landscape — who they compete with, how they differ
- Value proposition — what they believe the brand offers that competitors don't
- Goals for the next 12–24 months

When you have solid answers across all areas, close the conversation:
Send a message thanking them for their time and asking if there's anything they want to add as they reflect on the conversation. Include [CLOSING] at the end of this message on its own line.

After their response (or if they say nothing to add), send a brief warm acknowledgment, then [INTAKE_COMPLETE] on its own line.

Style rules:
- Warm, not effusive. Never say 'Great!' or 'Amazing!'
- One question per turn
- Short responses, no bullets
- Mirror before probing
- Lowercase is fine. Match their energy.$i1$,
  $o1$Hi — thanks for making time for this. I'm here to understand your perspective on the brand: where it stands, who it serves, and where you want it to go. There are no right or wrong answers — I'm just here to listen.

To get started: can you tell me a bit about your role and how long you've been connected to the brand?$o1$,
  $a1$You are analyzing intake responses from multiple stakeholders of the same client organization for Verse and Hook, a marketing agency. Your job is to identify alignment and divergence across their perspectives on brand discovery.

You will receive all completed transcripts, each labeled with the respondent's name and title.

Output a JSON object with exactly two keys:
- "scores": an object with a numeric value (0-100) for each of these dimensions: brand_clarity, audience_consensus, goal_alignment, value_prop_consistency, competitive_awareness. 100 = full consensus across all respondents. 0 = direct conflict. Score reflects alignment, not quality of individual answers.
- "narrative": 2-4 sentences identifying the most notable alignment or divergence pattern. Focus on the signal most actionable for marketing and storytelling strategy — what the agency needs to know before work begins.

If only one transcript is provided, return "scores" as null and use "narrative" to flag the most salient themes from that single response, noting that alignment scoring requires at least two respondents.

Return ONLY valid JSON. No preamble, no markdown, no explanation.$a1$,
  '["brand_clarity","audience_consensus","goal_alignment","value_prop_consistency","competitive_awareness"]'::jsonb
)
ON CONFLICT (goal_key) DO NOTHING;

INSERT INTO vh_goal_configs (goal_key, name, intake_system_prompt, opener_message, analysis_system_prompt, scoring_dimensions)
VALUES (
  'intake',
  'Project Intake',
  $i2$You are a warm, focused intake interviewer for Verse and Hook, a marketing agency. You are speaking with a stakeholder of a new client project. Your job is to understand scope, expectations, and constraints before work begins.

Move through this as a real conversation. One question per turn. Match their register. Mirror what you hear before asking the next thing. Do not announce phases or topic areas.

Cover these areas naturally:
- Their role and involvement in the project
- How they describe the scope — what's in and what's out
- Timeline expectations and why they matter
- Budget comfort — constraints and flexibility (no exact numbers needed)
- How decisions get made — the decision-making structure
- What success looks like — their definition of done
- Known constraints, concerns, or risks going in

When you have solid answers across all areas, close the conversation:
Send a message thanking them for their time and asking if there's anything they want to add as they reflect on the conversation. Include [CLOSING] at the end of this message on its own line.

After their response (or if they say nothing to add), send a brief warm acknowledgment, then [INTAKE_COMPLETE] on its own line.

Style rules:
- Warm, not effusive. Never say 'Great!' or 'Amazing!'
- One question per turn
- Short responses, no bullets
- Mirror before probing
- Lowercase is fine. Match their energy.$i2$,
  $o2$Hi — thanks for taking the time. I want to make sure we understand scope and expectations clearly before the work begins. This should take about 10–15 minutes.

To start: can you tell me your role and how involved you expect to be in this project?$o2$,
  $a2$You are analyzing intake responses from multiple stakeholders of the same client organization for Verse and Hook, a marketing agency. Your job is to identify alignment and divergence across their perspectives on project intake.

You will receive all completed transcripts, each labeled with the respondent's name and title.

Output a JSON object with exactly two keys:
- "scores": an object with a numeric value (0-100) for each of these dimensions: scope_alignment, timeline_alignment, budget_alignment, success_criteria_alignment, constraint_awareness. 100 = full consensus across all respondents. 0 = direct conflict. Score reflects alignment, not quality of individual answers.
- "narrative": 2-4 sentences identifying the most notable alignment or divergence pattern. Focus on what the agency needs to resolve before work begins.

If only one transcript is provided, return "scores" as null and use "narrative" to flag the most salient themes from that single response, noting that alignment scoring requires at least two respondents.

Return ONLY valid JSON. No preamble, no markdown, no explanation.$a2$,
  '["scope_alignment","timeline_alignment","budget_alignment","success_criteria_alignment","constraint_awareness"]'::jsonb
)
ON CONFLICT (goal_key) DO NOTHING;

INSERT INTO vh_goal_configs (goal_key, name, intake_system_prompt, opener_message, analysis_system_prompt, scoring_dimensions)
VALUES (
  'feedback',
  'Engagement Feedback',
  $i3$You are a warm, focused intake interviewer for Verse and Hook, a marketing agency. You are speaking with a stakeholder of an existing client. Your job is to understand their honest perspective on how the engagement is going.

Move through this as a real conversation. One question per turn. Match their register. Mirror what you hear before asking the next thing. Do not announce phases or topic areas.

Cover these areas naturally:
- Their role and involvement in the engagement
- What's working well — what they'd keep exactly as is
- What isn't working — what's falling short or feeling off
- Priorities for what should change or improve
- Overall satisfaction with direction and results
- What they'd do differently if starting over

When you have solid answers across all areas, close the conversation:
Send a message thanking them for their time and asking if there's anything they want to add as they reflect on the conversation. Include [CLOSING] at the end of this message on its own line.

After their response (or if they say nothing to add), send a brief warm acknowledgment, then [INTAKE_COMPLETE] on its own line.

Style rules:
- Warm, not effusive. Never say 'Great!' or 'Amazing!'
- One question per turn
- Short responses, no bullets
- Mirror before probing
- Lowercase is fine. Match their energy.$i3$,
  $o3$Hi — thanks for making time. I want to hear your honest take on how things have been going — what's working, what isn't, and where you'd like to see change. Your perspective matters.

To start: can you tell me your role and how involved you've been in the work so far?$o3$,
  $a3$You are analyzing intake responses from multiple stakeholders of the same client organization for Verse and Hook, a marketing agency. Your job is to identify alignment and divergence across their perspectives on an ongoing engagement.

You will receive all completed transcripts, each labeled with the respondent's name and title.

Output a JSON object with exactly two keys:
- "scores": an object with a numeric value (0-100) for each of these dimensions: satisfaction_alignment, priority_alignment, issue_consensus. 100 = full consensus across all respondents. 0 = direct conflict. Score reflects alignment, not quality of individual answers.
- "narrative": 2-4 sentences identifying the most notable alignment or divergence pattern. Focus on the signals the agency most needs to act on.

If only one transcript is provided, return "scores" as null and use "narrative" to flag the most salient themes from that single response, noting that alignment scoring requires at least two respondents.

Return ONLY valid JSON. No preamble, no markdown, no explanation.$a3$,
  '["satisfaction_alignment","priority_alignment","issue_consensus"]'::jsonb
)
ON CONFLICT (goal_key) DO NOTHING;
```

Expected: 3 rows inserted (or 0 if already run).

- [ ] **Step 4: Verify seed data**

Run:

```sql
SELECT goal_key, name, array_length(scoring_dimensions::text[]::text[], 1) AS dim_count FROM vh_goal_configs ORDER BY goal_key;
```

Expected: 3 rows — discovery (5 dims), feedback (3 dims), intake (5 dims).

- [ ] **Step 5: Append table definition to `supabase/vh-schema.sql`**

Append to the end of `/Users/nmh/dev/nilesheron-web/supabase/vh-schema.sql`:

```sql

-- Goal configurations (interview prompts and scoring dimensions, editable from admin)
CREATE TABLE IF NOT EXISTS vh_goal_configs (
  goal_key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  intake_system_prompt TEXT NOT NULL,
  opener_message TEXT NOT NULL,
  analysis_system_prompt TEXT NOT NULL,
  scoring_dimensions JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE vh_goal_configs DISABLE ROW LEVEL SECURITY;
```

- [ ] **Step 6: Commit**

```bash
git add supabase/vh-schema.sql
git commit -m "feat: add vh_goal_configs table and seed data"
```

---

## Task 2: `api/vh-analysis-utils.js` — shared runAnalysis module

**Files:**
- Create: `api/vh-analysis-utils.js`

This extracts `runAnalysis` from `vh-response.js` and changes it to fetch the goal config from the DB instead of from the hardcoded `GOAL_CONFIGS` object.

- [ ] **Step 1: Create the file**

Create `/Users/nmh/dev/nilesheron-web/api/vh-analysis-utils.js`:

```js
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
  if (!r.ok) return;

  const responses = await r.json();

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

  if (!anthropicRes.ok) return;

  const data = await anthropicRes.json();
  const text = (data.content || []).map(b => b.text || '').join('').trim();

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return;
  }

  await sb('/vh_analysis', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      client_id,
      triggered_by_response_id: response_id || null,
      scores: parsed.scores || null,
      narrative: parsed.narrative || null
    })
  });
}
```

- [ ] **Step 2: Verify the file exists and exports correctly**

```bash
node --input-type=module <<'EOF'
import { runAnalysis } from '/Users/nmh/dev/nilesheron-web/api/vh-analysis-utils.js';
console.log(typeof runAnalysis);
EOF
```

Expected output: `function`

- [ ] **Step 3: Commit**

```bash
git add api/vh-analysis-utils.js
git commit -m "feat: extract runAnalysis to shared module (fetches goal config from DB)"
```

---

## Task 3: Update `api/vh-response.js`

**Files:**
- Modify: `api/vh-response.js`

Remove the `vh-config.js` import and use `runAnalysis` from `vh-analysis-utils.js` instead.

- [ ] **Step 1: Replace the import and inline runAnalysis**

In `/Users/nmh/dev/nilesheron-web/api/vh-response.js`:

Replace line 1–2:
```js
// api/vh-response.js
import { GOAL_CONFIGS } from './vh-config.js';
```

With:
```js
// api/vh-response.js
import { runAnalysis } from './vh-analysis-utils.js';
```

- [ ] **Step 2: Remove the inline `runAnalysis` function**

Delete lines 20–89 (the entire `async function runAnalysis(...)` block, from `async function runAnalysis(` through the closing `}`).

The file after this step should go directly from the `sb()` helper to `export default async function handler(...)`.

- [ ] **Step 3: Update the runAnalysis call inside the handler**

The existing call at line ~135 reads:
```js
await runAnalysis(client_id, extraction_goal, response_id);
```

Replace with:
```js
await runAnalysis(client_id, extraction_goal, response_id, {
  supabaseUrl: SUPABASE_URL,
  supabaseKey: SUPABASE_KEY,
  anthropicKey: ANTHROPIC_KEY
});
```

- [ ] **Step 4: Verify the file parses correctly**

```bash
node --input-type=module --eval "import '/Users/nmh/dev/nilesheron-web/api/vh-response.js'" 2>&1 | head -5
```

Expected: no parse errors (runtime errors about missing env vars are fine).

- [ ] **Step 5: Commit**

```bash
git add api/vh-response.js
git commit -m "refactor: vh-response uses shared runAnalysis from vh-analysis-utils"
```

---

## Task 4: New `api/vh-goal-config.js`

**Files:**
- Create: `api/vh-goal-config.js`

`GET ?goal=<key>` — public, returns `{goal_key, name, intake_system_prompt, opener_message}` for the intake page.  
`GET` (admin token) — returns all goal configs with full data for the editor.  
`PUT` (admin token) — upserts a goal config row.

- [ ] **Step 1: Create the file**

Create `/Users/nmh/dev/nilesheron-web/api/vh-goal-config.js`:

```js
// api/vh-goal-config.js
import { validateAdminToken } from './vh-auth.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

  if (req.method === 'GET') {
    const { goal } = req.query;

    if (goal) {
      // Public: intake page fetches this to get interview prompt and opener
      try {
        const r = await sb(
          `/vh_goal_configs?goal_key=eq.${encodeURIComponent(goal)}&select=goal_key,name,intake_system_prompt,opener_message`
        );
        if (!r.ok) return res.status(500).json({ error: 'Failed to fetch goal config' });
        const rows = await r.json();
        if (!rows.length) return res.status(404).json({ error: 'Goal config not found' });
        return res.status(200).json(rows[0]);
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }

    // Admin: full list for editor
    if (!validateAdminToken(req)) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const r = await sb('/vh_goal_configs?select=*&order=goal_key.asc');
      if (!r.ok) return res.status(500).json({ error: 'Failed to fetch goal configs' });
      return res.status(200).json(await r.json());
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'PUT') {
    if (!validateAdminToken(req)) return res.status(401).json({ error: 'Unauthorized' });

    const { goal_key, name, intake_system_prompt, opener_message, analysis_system_prompt, scoring_dimensions } = req.body || {};

    if (!goal_key || !name || !intake_system_prompt || !opener_message || !analysis_system_prompt) {
      return res.status(400).json({ error: 'goal_key, name, intake_system_prompt, opener_message, analysis_system_prompt required' });
    }
    if (!/^[a-z0-9][a-z0-9-]*$/.test(goal_key)) {
      return res.status(400).json({ error: 'goal_key must be lowercase letters, numbers, and hyphens only' });
    }
    if (!Array.isArray(scoring_dimensions) || !scoring_dimensions.length) {
      return res.status(400).json({ error: 'scoring_dimensions must be a non-empty array' });
    }

    try {
      const r = await sb('/vh_goal_configs', {
        method: 'POST',
        headers: { Prefer: 'return=representation,resolution=merge-duplicates' },
        body: JSON.stringify({
          goal_key,
          name,
          intake_system_prompt,
          opener_message,
          analysis_system_prompt,
          scoring_dimensions,
          updated_at: new Date().toISOString()
        })
      });

      if (!r.ok) {
        const err = await r.text();
        return res.status(r.status).json({ error: err });
      }

      const rows = await r.json();
      return res.status(200).json(rows[0] || { ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
```

- [ ] **Step 2: Smoke-test the endpoint after deploy**

After deploying (Task 7 commit + `vercel --prod`), run:

```bash
curl -s "https://dev.nilesheron.com/api/vh-goal-config?goal=discovery" | python3 -m json.tool | head -10
```

Expected: JSON with `goal_key`, `name`, `intake_system_prompt`, `opener_message`.

- [ ] **Step 3: Commit**

```bash
git add api/vh-goal-config.js
git commit -m "feat: add vh-goal-config endpoint (GET public/admin, PUT upsert)"
```

---

## Task 5: Update `api/vh-admin.js` — add POST re-run analysis

**Files:**
- Modify: `api/vh-admin.js`

Add a POST handler that accepts `{action: 'rerun_analysis', client_id}`, fetches the client's `extraction_goal`, and calls `runAnalysis`.

- [ ] **Step 1: Add the import and ANTHROPIC_KEY at the top of `api/vh-admin.js`**

Replace lines 1–5 of `/Users/nmh/dev/nilesheron-web/api/vh-admin.js`:
```js
// api/vh-admin.js
import { validateAdminToken } from './vh-auth.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
```

With:
```js
// api/vh-admin.js
import { validateAdminToken } from './vh-auth.js';
import { runAnalysis } from './vh-analysis-utils.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
```

- [ ] **Step 2: Add the POST handler**

In `/Users/nmh/dev/nilesheron-web/api/vh-admin.js`, add this block after the existing `if (req.method !== 'GET')` check (after line 21, before the `const { client_id }` line):

Replace:
```js
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!validateAdminToken(req)) return res.status(401).json({ error: 'Unauthorized' });
```

With:
```js
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

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
```

- [ ] **Step 3: Commit**

```bash
git add api/vh-admin.js
git commit -m "feat: add re-run analysis POST handler to vh-admin"
```

---

## Task 6: Update `verseandhook/intake/index.html`

**Files:**
- Modify: `verseandhook/intake/index.html`

Remove hardcoded `INTAKE_SYS` and `OPENERS` objects. Fetch goal config from `/api/vh-goal-config?goal=<key>` after loading the client session. Store result in module-level variables.

- [ ] **Step 1: Replace the hardcoded objects and variable declarations**

In `/Users/nmh/dev/nilesheron-web/verseandhook/intake/index.html`, find and replace the entire block starting at `var INTAKE_SYS = {` through `var GOAL_LABELS = { ... };` (lines 180–194), plus the variable declarations on the next line.

Replace this block:
```js
var INTAKE_SYS = {
  discovery: "...",
  intake: "...",
  feedback: "..."
};

var OPENERS = {
  discovery: "...",
  intake: "...",
  feedback: "..."
};

var GOAL_LABELS = { discovery: 'Brand Discovery', intake: 'Project Intake', feedback: 'Engagement Feedback' };

var clientId = null, extractionGoal = null, clientName = null;
var respondentName = '', respondentTitle = '', respondentEmail = '';
var convo = [], exchanges = 0, busy = false, isClosing = false;
```

With:
```js
var clientId = null, extractionGoal = null, clientName = null;
var intakeSystemPrompt = '', openerMessage = '';
var respondentName = '', respondentTitle = '', respondentEmail = '';
var convo = [], exchanges = 0, busy = false, isClosing = false;
```

- [ ] **Step 2: Update the `init()` function to fetch goal config**

Find and replace the entire `(function init() { ... })();` block (lines 212–232):

Replace:
```js
(function init() {
  var params = new URLSearchParams(window.location.search);
  var token = params.get('token');
  if (!token) { show('error'); return; }

  fetch('/api/vh-session?token=' + encodeURIComponent(token))
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.error) { show('error'); return; }
      clientId = data.id;
      extractionGoal = data.extraction_goal;
      clientName = data.client_name;

      document.getElementById('landing-goal-badge').textContent = GOAL_LABELS[extractionGoal] || extractionGoal;
      document.getElementById('landing-head').textContent = clientName;
      document.getElementById('landing-sub').textContent =
        'We\'d like to understand your perspective as a stakeholder of ' + clientName + '. This conversation takes about 10–15 minutes.';
      show('landing');
    })
    .catch(function() { show('error'); });
})();
```

With:
```js
(function init() {
  var params = new URLSearchParams(window.location.search);
  var token = params.get('token');
  if (!token) { show('error'); return; }

  var sessionData;

  fetch('/api/vh-session?token=' + encodeURIComponent(token))
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.error) { show('error'); return Promise.reject('invalid token'); }
      sessionData = data;
      return fetch('/api/vh-goal-config?goal=' + encodeURIComponent(data.extraction_goal))
        .then(function(r) { return r.json(); });
    })
    .then(function(config) {
      if (!config || config.error) { show('error'); return; }
      clientId = sessionData.id;
      extractionGoal = sessionData.extraction_goal;
      clientName = sessionData.client_name;
      intakeSystemPrompt = config.intake_system_prompt;
      openerMessage = config.opener_message;

      document.getElementById('landing-goal-badge').textContent = config.name || extractionGoal;
      document.getElementById('landing-head').textContent = clientName;
      document.getElementById('landing-sub').textContent =
        'We\'d like to understand your perspective as a stakeholder of ' + clientName + '. This conversation takes about 10–15 minutes.';
      show('landing');
    })
    .catch(function() { show('error'); });
})();
```

- [ ] **Step 3: Update `startChat()` to use `openerMessage`**

Find:
```js
  show('chat');
  addAiMsg(OPENERS[extractionGoal] || OPENERS.discovery);
```

Replace with:
```js
  show('chat');
  addAiMsg(openerMessage);
```

- [ ] **Step 4: Update `sendMessage()` to use `intakeSystemPrompt`**

Find:
```js
      system: INTAKE_SYS[extractionGoal],
```

Replace with:
```js
      system: intakeSystemPrompt,
```

- [ ] **Step 5: Commit**

```bash
git add verseandhook/intake/index.html
git commit -m "feat: intake page fetches goal config from DB (removes hardcoded prompts)"
```

---

## Task 7: Update `verseandhook/intake/admin.html` — Goals editor

**Files:**
- Modify: `verseandhook/intake/admin.html`

Six changes: (1) CSS for editor textareas, (2) HTML for goals list and goal editor views, (3) header "Goals" button, (4) re-run button in detail panel, (5) update `show()` and `GOAL_LABELS`, (6) new JS functions.

- [ ] **Step 1: Add CSS for the goal editor**

Inside the `<style>` block, before the closing `</style>` tag, add:

```css
/* Goal editor */
.editor-section { margin-bottom: 1.5rem; }
.editor-label { display: block; font-size: 12px; font-weight: 500; color: var(--text-muted); margin-bottom: 5px; }
.editor-hint { font-size: 11px; color: var(--text-dim); margin-top: 3px; }
.editor-textarea { width: 100%; background: var(--bg-alt); border: 1px solid var(--border); border-radius: 8px; padding: 10px 13px; font-size: 13px; font-family: 'Inter', sans-serif; color: var(--text); line-height: 1.55; resize: vertical; }
.editor-textarea:focus { outline: none; border-color: var(--accent); }
.goal-row { background: var(--bg-alt); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
.goal-key { font-family: monospace; font-size: 12px; color: var(--text-dim); flex-shrink: 0; }
.goal-name { font-weight: 500; font-size: 15px; flex: 1; }
```

- [ ] **Step 2: Add HTML for goals list and goal editor views**

After the closing `</div>` of `<!-- Client detail -->` (after line 172), add:

```html
<!-- Goals list -->
<div id="view-goals" style="display:none;">
  <div class="page-body">
    <h1 class="page-title">Interview Goals</h1>
    <p class="page-sub">Configure interview prompts and scoring dimensions per goal type.</p>
    <div style="margin-bottom:1.25rem;">
      <button class="btn btn-sm" onclick="openGoalEditor(null)">+ New Goal</button>
    </div>
    <div id="goals-list-container"></div>
  </div>
</div>

<!-- Goal editor -->
<div id="view-goal-editor" style="display:none;">
  <div class="page-body" style="max-width:720px;">
    <button class="back-btn" onclick="showGoals()">&larr; All goals</button>
    <h2 class="page-title" id="goal-editor-title" style="margin-bottom:1.5rem;">Edit Goal</h2>

    <div class="editor-section">
      <label class="editor-label" for="ge-key">Goal key</label>
      <input type="text" id="ge-key" class="editor-textarea" style="resize:none;height:auto;" placeholder="discovery-clientname">
      <p class="editor-hint">Lowercase letters, numbers, hyphens only. Cannot be changed after creation.</p>
    </div>
    <div class="editor-section">
      <label class="editor-label" for="ge-name">Display name</label>
      <input type="text" id="ge-name" class="editor-textarea" style="resize:none;height:auto;" placeholder="Brand Discovery">
    </div>
    <div class="editor-section">
      <label class="editor-label" for="ge-intake-prompt">Interview prompt (Haiku — controls the conversation)</label>
      <textarea id="ge-intake-prompt" class="editor-textarea" rows="14"></textarea>
    </div>
    <div class="editor-section">
      <label class="editor-label" for="ge-opener">Opening message (first message respondent sees)</label>
      <textarea id="ge-opener" class="editor-textarea" rows="4"></textarea>
    </div>
    <div class="editor-section">
      <label class="editor-label" for="ge-analysis-prompt">Analysis prompt (Sonnet — scores alignment across respondents)</label>
      <textarea id="ge-analysis-prompt" class="editor-textarea" rows="10"></textarea>
      <p class="editor-hint">Must reference the scoring dimensions by name. Update both together when changing dimensions.</p>
    </div>
    <div class="editor-section">
      <label class="editor-label" for="ge-dimensions">Scoring dimensions (one per line, lowercase_with_underscores)</label>
      <textarea id="ge-dimensions" class="editor-textarea" rows="6"></textarea>
      <p class="editor-hint">Changing dimensions affects future analysis runs. Use Re-run analysis on existing clients to rescore.</p>
    </div>

    <p class="modal-error" id="ge-error" style="margin-bottom:1rem;"></p>
    <div style="display:flex;gap:10px;">
      <button class="btn" id="ge-save-btn" onclick="saveGoal()">Save goal</button>
      <button class="btn-outline" onclick="showGoals()">Cancel</button>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Update the header to add a Goals navigation button**

Find:
```html
  <div class="admin-actions">
    <button class="btn btn-sm" onclick="openNewClientModal()">+ New Client</button>
    <button class="btn-outline btn-sm" onclick="logout()">Sign out</button>
  </div>
```

Replace with:
```html
  <div class="admin-actions">
    <button class="btn-outline btn-sm" onclick="showGoals()">Goals</button>
    <button class="btn btn-sm" onclick="openNewClientModal()">+ New Client</button>
    <button class="btn-outline btn-sm" onclick="logout()">Sign out</button>
  </div>
```

- [ ] **Step 4: Add re-run button to the analysis panel heading in the detail view**

Find:
```html
      <div class="panel">
        <div class="panel-head">Alignment Analysis</div>
        <div id="analysis-panel"></div>
      </div>
```

Replace with:
```html
      <div class="panel">
        <div class="panel-head" style="display:flex;align-items:center;justify-content:space-between;">
          <span>Alignment Analysis</span>
          <button class="btn-outline btn-sm" id="rerun-btn" onclick="rerunAnalysis()">Re-run</button>
        </div>
        <div id="analysis-panel"></div>
      </div>
```

- [ ] **Step 5: Update `show()`, add `goalConfigs`/`currentClientId` variables, update `GOAL_LABELS`**

Find:
```js
var authToken = sessionStorage.getItem('vh-admin-token') || null;
var GOAL_LABELS = { discovery: 'Brand Discovery', intake: 'Project Intake', feedback: 'Engagement Feedback' };
```

Replace with:
```js
var authToken = sessionStorage.getItem('vh-admin-token') || null;
var GOAL_LABELS = {};
var goalConfigs = [];
var currentClientId = null;
var currentGoalKey = null;
```

Find:
```js
function show(viewId) {
  ['login','dashboard','detail'].forEach(function(id) {
    document.getElementById('view-' + id).style.display = id === viewId ? 'block' : 'none';
  });
  document.getElementById('app-header').style.display = viewId === 'login' ? 'none' : 'flex';
}
```

Replace with:
```js
function show(viewId) {
  ['login','dashboard','detail','goals','goal-editor'].forEach(function(id) {
    var el = document.getElementById('view-' + id);
    if (el) el.style.display = id === viewId ? 'block' : 'none';
  });
  document.getElementById('app-header').style.display = viewId === 'login' ? 'none' : 'flex';
}
```

- [ ] **Step 6: Update auth flow to load goal configs on login**

Find:
```js
if (authToken) { show('dashboard'); loadDashboard(); } else { show('login'); }
```

Replace with:
```js
if (authToken) { show('dashboard'); loadDashboard(); loadGoalConfigs(); } else { show('login'); }
```

Find inside `doLogin()`:
```js
      authToken = data.token;
      sessionStorage.setItem('vh-admin-token', authToken);
      show('dashboard');
      loadDashboard();
```

Replace with:
```js
      authToken = data.token;
      sessionStorage.setItem('vh-admin-token', authToken);
      show('dashboard');
      loadDashboard();
      loadGoalConfigs();
```

- [ ] **Step 7: Update `openNewClientModal()` to populate goal dropdown dynamically**

Find:
```js
function openNewClientModal() {
  document.getElementById('nc-name').value = '';
  document.getElementById('nc-goal').value = 'discovery';
  document.getElementById('nc-error').style.display = 'none';
  document.getElementById('generated-link').style.display = 'none';
  document.getElementById('nc-submit-btn').disabled = false;
  document.getElementById('nc-submit-btn').textContent = 'Generate link';
  document.getElementById('new-client-modal').classList.add('open');
}
```

Replace with:
```js
function openNewClientModal() {
  document.getElementById('nc-name').value = '';
  document.getElementById('nc-error').style.display = 'none';
  document.getElementById('generated-link').style.display = 'none';
  document.getElementById('nc-submit-btn').disabled = false;
  document.getElementById('nc-submit-btn').textContent = 'Generate link';

  var sel = document.getElementById('nc-goal');
  sel.innerHTML = goalConfigs.length
    ? goalConfigs.map(function(g) { return '<option value="' + esc(g.goal_key) + '">' + esc(g.name) + '</option>'; }).join('')
    : '<option value="discovery">Brand Discovery</option><option value="intake">Project Intake</option><option value="feedback">Engagement Feedback</option>';

  document.getElementById('new-client-modal').classList.add('open');
}
```

- [ ] **Step 8: Update `loadClientDetail()` to track `currentClientId`**

Find:
```js
function loadClientDetail(clientId) {
  show('detail');
```

Replace with:
```js
function loadClientDetail(clientId) {
  currentClientId = clientId;
  show('detail');
```

- [ ] **Step 9: Add new JS functions before the `esc()` function**

Before the `// Escape HTML` comment, add:

```js
// --- Goal configs ---
function loadGoalConfigs() {
  apiFetch('/api/vh-goal-config')
    .then(function(data) {
      if (!Array.isArray(data)) return;
      goalConfigs = data;
      GOAL_LABELS = {};
      data.forEach(function(g) { GOAL_LABELS[g.goal_key] = g.name; });
    })
    .catch(function() {});
}

function showGoals() {
  show('goals');
  loadGoals();
}

function loadGoals() {
  var container = document.getElementById('goals-list-container');
  container.innerHTML = '<p style="color:var(--text-dim);font-size:13px;">Loading...</p>';
  apiFetch('/api/vh-goal-config')
    .then(function(data) {
      if (!Array.isArray(data)) { container.innerHTML = '<p style="color:var(--danger);">Error loading goals.</p>'; return; }
      goalConfigs = data;
      data.forEach(function(g) { GOAL_LABELS[g.goal_key] = g.name; });
      if (!data.length) {
        container.innerHTML = '<p style="color:var(--text-dim);font-size:13px;">No goal configs yet.</p>';
        return;
      }
      container.innerHTML = data.map(function(g) {
        return '<div class="goal-row">'
          + '<span class="goal-key">' + esc(g.goal_key) + '</span>'
          + '<span class="goal-name">' + esc(g.name) + '</span>'
          + '<button class="btn-outline btn-sm" onclick="openGoalEditor(\'' + esc(g.goal_key) + '\')">Edit</button>'
          + '</div>';
      }).join('');
    })
    .catch(function() { container.innerHTML = '<p style="color:var(--danger);">Error loading goals.</p>'; });
}

function openGoalEditor(goalKey) {
  currentGoalKey = goalKey;
  document.getElementById('ge-error').style.display = 'none';
  document.getElementById('ge-save-btn').disabled = false;
  document.getElementById('ge-save-btn').textContent = 'Save goal';

  if (goalKey) {
    var g = goalConfigs.find(function(gc) { return gc.goal_key === goalKey; });
    document.getElementById('goal-editor-title').textContent = 'Edit: ' + (g ? g.name : goalKey);
    document.getElementById('ge-key').value = goalKey;
    document.getElementById('ge-key').readOnly = true;
    document.getElementById('ge-name').value = g ? g.name : '';
    document.getElementById('ge-intake-prompt').value = g ? g.intake_system_prompt : '';
    document.getElementById('ge-opener').value = g ? g.opener_message : '';
    document.getElementById('ge-analysis-prompt').value = g ? g.analysis_system_prompt : '';
    document.getElementById('ge-dimensions').value = g ? (g.scoring_dimensions || []).join('\n') : '';
  } else {
    document.getElementById('goal-editor-title').textContent = 'New Goal';
    document.getElementById('ge-key').value = '';
    document.getElementById('ge-key').readOnly = false;
    document.getElementById('ge-name').value = '';
    document.getElementById('ge-intake-prompt').value = '';
    document.getElementById('ge-opener').value = '';
    document.getElementById('ge-analysis-prompt').value = '';
    document.getElementById('ge-dimensions').value = '';
  }
  show('goal-editor');
}

function saveGoal() {
  var key = document.getElementById('ge-key').value.trim();
  var name = document.getElementById('ge-name').value.trim();
  var intakePrompt = document.getElementById('ge-intake-prompt').value.trim();
  var opener = document.getElementById('ge-opener').value.trim();
  var analysisPrompt = document.getElementById('ge-analysis-prompt').value.trim();
  var dimensions = document.getElementById('ge-dimensions').value
    .split('\n').map(function(s) { return s.trim(); }).filter(Boolean);

  var errEl = document.getElementById('ge-error');
  errEl.style.display = 'none';

  if (!key || !name || !intakePrompt || !opener || !analysisPrompt || !dimensions.length) {
    errEl.textContent = 'All fields are required.';
    errEl.style.display = 'block';
    return;
  }

  var btn = document.getElementById('ge-save-btn');
  btn.disabled = true; btn.textContent = 'Saving...';

  apiFetch('/api/vh-goal-config', {
    method: 'PUT',
    body: JSON.stringify({
      goal_key: key,
      name: name,
      intake_system_prompt: intakePrompt,
      opener_message: opener,
      analysis_system_prompt: analysisPrompt,
      scoring_dimensions: dimensions
    })
  })
  .then(function(data) {
    if (data.error) {
      errEl.textContent = data.error; errEl.style.display = 'block';
      btn.disabled = false; btn.textContent = 'Save goal';
      return;
    }
    showGoals();
  })
  .catch(function() {
    errEl.textContent = 'Something went wrong.'; errEl.style.display = 'block';
    btn.disabled = false; btn.textContent = 'Save goal';
  });
}

function rerunAnalysis() {
  if (!currentClientId) return;
  var btn = document.getElementById('rerun-btn');
  btn.disabled = true; btn.textContent = 'Running...';

  apiFetch('/api/vh-admin', {
    method: 'POST',
    body: JSON.stringify({ action: 'rerun_analysis', client_id: currentClientId })
  })
  .then(function(data) {
    if (data.error) {
      btn.disabled = false; btn.textContent = 'Re-run';
      alert('Analysis error: ' + data.error);
      return;
    }
    btn.textContent = 'Done ✓';
    setTimeout(function() { loadClientDetail(currentClientId); }, 800);
  })
  .catch(function() {
    btn.disabled = false; btn.textContent = 'Re-run';
  });
}
```

- [ ] **Step 10: Deploy and smoke-test**

```bash
git add verseandhook/intake/admin.html verseandhook/intake/index.html api/vh-goal-config.js api/vh-admin.js api/vh-analysis-utils.js api/vh-response.js supabase/vh-schema.sql
git commit -m "feat: goal config editor in admin, dynamic prompts in intake page"
```

Then deploy:
```bash
vercel --prod
```

Manual smoke test checklist:
1. `dev.nilesheron.com/verseandhook/intake/admin` → log in → header shows "Goals" button
2. Click Goals → list shows discovery, intake, feedback
3. Click Edit on discovery → fields populated correctly, goal key field is read-only
4. Click "+ New Goal" → all fields blank, goal key editable
5. Dashboard → "+ New Client" → goal dropdown shows all three goals (loaded from DB)
6. Open an existing client detail → analysis panel header shows "Re-run" button
7. Click Re-run → button shows "Running..." then "Done ✓", analysis panel reloads
8. Open a respondent token URL → intake loads without error (goal config fetched from DB)
9. Complete an intake → thank-you splash appears, analysis triggered

- [ ] **Step 11: Final commit if any fixes needed**

```bash
git add -p  # stage any fixes
git commit -m "fix: <description of what was wrong>"
```
