# Verse and Hook Intake Tool — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a multi-stakeholder conversational intake tool for Verse and Hook at `dev.nilesheron.com/verseandhook/intake`, with a password-protected admin dashboard that generates tokenized client links and displays alignment analysis across respondents.

**Architecture:** Vanilla JS static pages + Vercel serverless API routes, sharing the existing OneBite Supabase project via three new tables. Goal-specific system prompts live in `api/vh-config.js` (server-side) and inlined in the intake page HTML (client-side). All DB access flows through API routes — no direct Supabase calls from the browser. Analysis runs synchronously inside `vh-response.js` on each submission using Sonnet.

**Tech Stack:** Vanilla JS, Node.js serverless (Vercel), Supabase REST API, Anthropic Messages API (Haiku for intake, Sonnet for analysis)

**Spec:** `docs/superpowers/specs/2026-04-23-verseandhook-intake-design.md`

---

## File Structure

**New files — API:**
- `api/vh-config.js` — analysis system prompts + scoring dimensions per goal (server-side only)
- `api/vh-auth.js` — admin password check, returns deterministic session token
- `api/vh-session.js` — POST: create client session (admin); GET: fetch client by token (public)
- `api/vh-admin.js` — GET: all clients list or single client detail with responses + latest analysis (admin)
- `api/vh-response.js` — POST: save transcript + run Sonnet analysis synchronously

**New files — Frontend:**
- `verseandhook/intake/index.html` — respondent intake (loading → landing → identity form → chat → thank-you)
- `verseandhook/intake/admin.html` — admin dashboard (login → client list → client detail)

**No vercel.json changes needed** — `cleanUrls: true` already serves `.html` files at clean paths.

---

## Task 1: Database schema

**Files:**
- Create: `supabase/vh-schema.sql`
- Run against Supabase project `xszhfxzfybubdlivbfxp`

- [ ] **Step 1: Write the schema file**

```sql
-- Verse and Hook intake tables
-- Run against Supabase project xszhfxzfybubdlivbfxp via SQL editor

CREATE TABLE vh_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT UNIQUE NOT NULL,
  client_name TEXT NOT NULL,
  extraction_goal TEXT NOT NULL CHECK (extraction_goal IN ('discovery', 'intake', 'feedback')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE vh_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES vh_clients(id),
  respondent_name TEXT NOT NULL,
  respondent_title TEXT NOT NULL,
  respondent_email TEXT NOT NULL,
  transcript JSONB NOT NULL DEFAULT '[]',
  completed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE vh_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES vh_clients(id),
  triggered_by_response_id UUID REFERENCES vh_responses(id),
  scores JSONB,
  narrative TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX vh_responses_client_id_idx ON vh_responses(client_id);
CREATE INDEX vh_analysis_client_id_created_idx ON vh_analysis(client_id, created_at DESC);

-- Disable RLS — auth is enforced at the API route layer
ALTER TABLE vh_clients DISABLE ROW LEVEL SECURITY;
ALTER TABLE vh_responses DISABLE ROW LEVEL SECURITY;
ALTER TABLE vh_analysis DISABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: Run the schema**

Open the Supabase SQL editor at https://supabase.com/dashboard/project/xszhfxzfybubdlivbfxp/sql and paste + run the contents of `supabase/vh-schema.sql`.

Expected: no errors, three new tables visible in the Table Editor.

- [ ] **Step 3: Verify tables exist**

In the Supabase Table Editor, confirm `vh_clients`, `vh_responses`, and `vh_analysis` are visible with the correct columns.

- [ ] **Step 4: Commit**

```bash
git add supabase/vh-schema.sql
git commit -m "feat: add vh_clients, vh_responses, vh_analysis tables"
```

---

## Task 2: API config module

**Files:**
- Create: `api/vh-config.js`

This file is imported by `vh-response.js` and `vh-admin.js`. It never runs in the browser.

- [ ] **Step 1: Create the config**

```js
// api/vh-config.js
// Analysis system prompts and scoring dimensions per extraction goal.
// Intake system prompts are inlined in verseandhook/intake/index.html (browser-side).

export const GOAL_CONFIGS = {
  discovery: {
    scoringDimensions: [
      'brand_clarity',
      'audience_consensus',
      'goal_alignment',
      'value_prop_consistency',
      'competitive_awareness'
    ],
    analysisSystemPrompt: `You are analyzing intake responses from multiple stakeholders of the same client organization for Verse and Hook, a marketing agency. Your job is to identify alignment and divergence across their perspectives on brand discovery.

You will receive all completed transcripts, each labeled with the respondent's name and title.

Output a JSON object with exactly two keys:
- "scores": an object with a numeric value (0-100) for each of these dimensions: brand_clarity, audience_consensus, goal_alignment, value_prop_consistency, competitive_awareness. 100 = full consensus across all respondents. 0 = direct conflict. Score reflects alignment, not quality of individual answers.
- "narrative": 2-4 sentences identifying the most notable alignment or divergence pattern. Focus on the signal most actionable for marketing and storytelling strategy — what the agency needs to know before work begins.

If only one transcript is provided, return "scores" as null and use "narrative" to flag the most salient themes from that single response, noting that alignment scoring requires at least two respondents.

Return ONLY valid JSON. No preamble, no markdown, no explanation.`
  },

  intake: {
    scoringDimensions: [
      'scope_alignment',
      'timeline_alignment',
      'budget_alignment',
      'success_criteria_alignment',
      'constraint_awareness'
    ],
    analysisSystemPrompt: `You are analyzing intake responses from multiple stakeholders of the same client organization for Verse and Hook, a marketing agency. Your job is to identify alignment and divergence across their perspectives on project intake.

You will receive all completed transcripts, each labeled with the respondent's name and title.

Output a JSON object with exactly two keys:
- "scores": an object with a numeric value (0-100) for each of these dimensions: scope_alignment, timeline_alignment, budget_alignment, success_criteria_alignment, constraint_awareness. 100 = full consensus across all respondents. 0 = direct conflict. Score reflects alignment, not quality of individual answers.
- "narrative": 2-4 sentences identifying the most notable alignment or divergence pattern. Focus on what the agency needs to resolve before work begins.

If only one transcript is provided, return "scores" as null and use "narrative" to flag the most salient themes from that single response, noting that alignment scoring requires at least two respondents.

Return ONLY valid JSON. No preamble, no markdown, no explanation.`
  },

  feedback: {
    scoringDimensions: [
      'satisfaction_alignment',
      'priority_alignment',
      'issue_consensus'
    ],
    analysisSystemPrompt: `You are analyzing intake responses from multiple stakeholders of the same client organization for Verse and Hook, a marketing agency. Your job is to identify alignment and divergence across their perspectives on an ongoing engagement.

You will receive all completed transcripts, each labeled with the respondent's name and title.

Output a JSON object with exactly two keys:
- "scores": an object with a numeric value (0-100) for each of these dimensions: satisfaction_alignment, priority_alignment, issue_consensus. 100 = full consensus across all respondents. 0 = direct conflict. Score reflects alignment, not quality of individual answers.
- "narrative": 2-4 sentences identifying the most notable alignment or divergence pattern. Focus on the signals the agency most needs to act on.

If only one transcript is provided, return "scores" as null and use "narrative" to flag the most salient themes from that single response, noting that alignment scoring requires at least two respondents.

Return ONLY valid JSON. No preamble, no markdown, no explanation.`
  }
};
```

- [ ] **Step 2: Commit**

```bash
git add api/vh-config.js
git commit -m "feat: add vh goal config (analysis prompts + scoring dimensions)"
```

---

## Task 3: Admin auth endpoint

**Files:**
- Create: `api/vh-auth.js`

Validates admin password against `VH_ADMIN_PASSWORD` env var. Returns a deterministic session token (SHA-256 hash of the password + a fixed salt) — stateless, no session table needed.

- [ ] **Step 1: Verify the endpoint doesn't exist yet**

```bash
curl -s -o /dev/null -w "%{http_code}" https://dev.nilesheron.com/api/vh-auth
```
Expected: `404`

- [ ] **Step 2: Create the endpoint**

```js
// api/vh-auth.js
import crypto from 'crypto';

const SALT = 'vh-salt-v1';

export function computeToken(password) {
  return crypto.createHash('sha256').update(password + SALT).digest('hex');
}

export function validateAdminToken(req) {
  const token = req.headers['x-vh-token'];
  if (!token) return false;
  const adminPassword = process.env.VH_ADMIN_PASSWORD;
  if (!adminPassword) return false;
  return token === computeToken(adminPassword);
}

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'password required' });

  const adminPassword = process.env.VH_ADMIN_PASSWORD;
  if (!adminPassword) return res.status(500).json({ error: 'Admin password not configured' });

  if (password !== adminPassword) return res.status(401).json({ error: 'Invalid password' });

  return res.status(200).json({ token: computeToken(password) });
}
```

- [ ] **Step 3: Set the env var in Vercel**

```bash
printf 'your-chosen-password' | vercel env add VH_ADMIN_PASSWORD production
```

Also add to local `.env.local` for testing:
```
VH_ADMIN_PASSWORD=your-chosen-password
```

- [ ] **Step 4: Deploy and test**

```bash
git add api/vh-auth.js
git commit -m "feat: add vh admin auth endpoint"
git push
```

Wait ~30s for deploy, then test:

```bash
# Wrong password — should return 401
curl -s -X POST https://dev.nilesheron.com/api/vh-auth \
  -H "Content-Type: application/json" \
  -d '{"password":"wrong"}' | cat
# Expected: {"error":"Invalid password"}

# Correct password — should return token
curl -s -X POST https://dev.nilesheron.com/api/vh-auth \
  -H "Content-Type: application/json" \
  -d '{"password":"your-chosen-password"}' | cat
# Expected: {"token":"<64-char hex string>"}
```

---

## Task 4: Client session endpoint

**Files:**
- Create: `api/vh-session.js`

POST (admin): create a new client + random token. GET (public): fetch client record by token.

- [ ] **Step 1: Create the endpoint**

```js
// api/vh-session.js
import crypto from 'crypto';
import { validateAdminToken } from './vh-auth.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

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

  // POST — create a new client session (admin only)
  if (req.method === 'POST') {
    if (!validateAdminToken(req)) return res.status(401).json({ error: 'Unauthorized' });

    const { client_name, extraction_goal } = req.body || {};
    if (!client_name || !client_name.trim()) {
      return res.status(400).json({ error: 'client_name required' });
    }
    if (!['discovery', 'intake', 'feedback'].includes(extraction_goal)) {
      return res.status(400).json({ error: 'extraction_goal must be discovery, intake, or feedback' });
    }

    const token = crypto.randomBytes(16).toString('hex');

    const r = await sb('/vh_clients', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ client_name: client_name.trim(), extraction_goal, token })
    });

    if (!r.ok) {
      const err = await r.text();
      return res.status(r.status).json({ error: err });
    }

    const rows = await r.json();
    return res.status(200).json(rows[0]);
  }

  // GET — fetch client record by token (public, for respondent page load)
  if (req.method === 'GET') {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: 'token required' });

    const r = await sb(
      `/vh_clients?token=eq.${encodeURIComponent(token)}&select=id,client_name,extraction_goal`
    );

    if (!r.ok) {
      const err = await r.text();
      return res.status(r.status).json({ error: err });
    }

    const rows = await r.json();
    if (!rows.length) return res.status(404).json({ error: 'Invalid session token' });
    return res.status(200).json(rows[0]);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
```

- [ ] **Step 2: Deploy and test**

```bash
git add api/vh-session.js
git commit -m "feat: add vh-session endpoint (create client + fetch by token)"
git push
```

Get a token first:
```bash
TOKEN=$(curl -s -X POST https://dev.nilesheron.com/api/vh-auth \
  -H "Content-Type: application/json" \
  -d '{"password":"your-chosen-password"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
echo $TOKEN
```

Create a test client:
```bash
curl -s -X POST https://dev.nilesheron.com/api/vh-session \
  -H "Content-Type: application/json" \
  -H "x-vh-token: $TOKEN" \
  -d '{"client_name":"Test Client","extraction_goal":"discovery"}' | cat
# Expected: {"id":"<uuid>","token":"<32-char hex>","client_name":"Test Client","extraction_goal":"discovery","created_at":"..."}
```

Save the `token` field from the response as `CLIENT_TOKEN`, then:
```bash
curl -s "https://dev.nilesheron.com/api/vh-session?token=$CLIENT_TOKEN" | cat
# Expected: {"id":"<uuid>","client_name":"Test Client","extraction_goal":"discovery"}
```

---

## Task 5: Admin data endpoint

**Files:**
- Create: `api/vh-admin.js`

GET (admin, no `client_id`): returns all clients with response counts. GET (admin, with `client_id`): returns client + all responses + latest analysis.

- [ ] **Step 1: Create the endpoint**

```js
// api/vh-admin.js
import { validateAdminToken } from './vh-auth.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

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
    const [clientRes, responsesRes, analysisRes] = await Promise.all([
      sb(`/vh_clients?id=eq.${encodeURIComponent(client_id)}&select=id,client_name,extraction_goal,token,created_at`),
      sb(`/vh_responses?client_id=eq.${encodeURIComponent(client_id)}&select=id,respondent_name,respondent_title,respondent_email,transcript,completed_at&order=completed_at.asc`),
      sb(`/vh_analysis?client_id=eq.${encodeURIComponent(client_id)}&select=scores,narrative,created_at&order=created_at.desc&limit=1`)
    ]);

    if (!clientRes.ok) return res.status(404).json({ error: 'Client not found' });

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
  }

  // All clients list with per-client response count and last response date
  const clientsRes = await sb('/vh_clients?select=id,client_name,extraction_goal,created_at&order=created_at.desc');
  if (!clientsRes.ok) return res.status(500).json({ error: 'Failed to fetch clients' });

  const clients = await clientsRes.json();
  if (!clients.length) return res.status(200).json([]);

  const counts = await Promise.all(
    clients.map(c =>
      sb(`/vh_responses?client_id=eq.${c.id}&select=id,completed_at&order=completed_at.desc`)
        .then(r => r.json())
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
}
```

- [ ] **Step 2: Deploy and test**

```bash
git add api/vh-admin.js
git commit -m "feat: add vh-admin endpoint (client list + client detail)"
git push
```

After deploy:
```bash
# All clients list
curl -s "https://dev.nilesheron.com/api/vh-admin" \
  -H "x-vh-token: $TOKEN" | cat
# Expected: array of client objects, each with response_count and last_response_at

# Single client detail (use the ID from Task 4's test client)
curl -s "https://dev.nilesheron.com/api/vh-admin?client_id=<id-from-task-4>" \
  -H "x-vh-token: $TOKEN" | cat
# Expected: {client:{...}, responses:[], analysis:null}

# Without auth token
curl -s "https://dev.nilesheron.com/api/vh-admin" | cat
# Expected: {"error":"Unauthorized"}
```

---

## Task 6: Response + analysis endpoint

**Files:**
- Create: `api/vh-response.js`

POST: validate + save transcript to `vh_responses`, then synchronously run Sonnet analysis and write to `vh_analysis`. Returns after analysis completes (respondent waits; typically 3–6s, acceptable after a 10–15min interview).

- [ ] **Step 1: Create the endpoint**

```js
// api/vh-response.js
import { GOAL_CONFIGS } from './vh-config.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
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
  if (!config) return;

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
  if (!Array.isArray(transcript) || !transcript.length) {
    return res.status(400).json({ error: 'transcript must be a non-empty array' });
  }

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
  const response_id = rows[0].id;

  // Run analysis synchronously (respondent waits ~3-6s; acceptable after a 10-15min interview)
  try {
    await runAnalysis(client_id, extraction_goal, response_id);
  } catch (e) {
    // Analysis failure does not fail the submission
    console.error('Analysis error:', e.message);
  }

  return res.status(200).json({ ok: true, response_id });
}
```

- [ ] **Step 2: Deploy and test**

```bash
git add api/vh-response.js
git commit -m "feat: add vh-response endpoint (save transcript + run analysis)"
git push
```

After deploy, use the `client_id` from the test client created in Task 4:
```bash
curl -s -X POST https://dev.nilesheron.com/api/vh-response \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "<id-from-task-4>",
    "respondent_name": "Jane Smith",
    "respondent_title": "CMO",
    "respondent_email": "jane@testclient.com",
    "transcript": [
      {"role":"assistant","content":"Hi, thanks for making time. Can you tell me about your role?"},
      {"role":"user","content":"I'm the CMO, been with the company 3 years."}
    ]
  }' | cat
# Expected: {"ok":true,"response_id":"<uuid>"}
```

Then verify analysis was written:
```bash
curl -s "https://dev.nilesheron.com/api/vh-admin?client_id=<id-from-task-4>" \
  -H "x-vh-token: $TOKEN" | cat
# Expected: responses array has 1 item, analysis has narrative (scores null because only 1 response)
```

---

## Task 7: Respondent intake page

**Files:**
- Create: `verseandhook/intake/index.html`

Vanilla JS single-page app. Views: loading → error → landing → identity → chat → submitting → thankyou. Progress bar at the bottom. Intake system prompts inlined as JS variables. Uses `/api/chat` for Haiku calls (same proxy as OneBite) and `/api/vh-response` to submit.

- [ ] **Step 1: Create the page**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Verse and Hook — Client Intake</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,500;1,400&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg: #F5F4F0;
  --bg-alt: #FFFFFF;
  --text: #1C1C1A;
  --text-muted: #5E5E58;
  --text-dim: #9A9A93;
  --accent: #1D3FE8;
  --accent-ink: #FFFFFF;
  --border: #E2E1DB;
}
body { background: var(--bg); color: var(--text); font-family: 'Inter', -apple-system, sans-serif; font-size: 15px; line-height: 1.6; min-height: 100vh; display: flex; flex-direction: column; }

/* Header */
#site-header { padding: 1.25rem 1.5rem; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
.wordmark { font-size: 11px; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase; color: var(--text-dim); }

/* Progress bar — bottom fixed */
#progress-bar-wrap { position: fixed; bottom: 0; left: 0; right: 0; height: 3px; background: var(--border); z-index: 100; }
#progress-bar-fill { height: 100%; background: var(--accent); transition: width 0.5s ease; width: 0%; }

/* Loading */
#view-loading { flex: 1; display: flex; align-items: center; justify-content: center; }
.loading-text { font-size: 14px; color: var(--text-dim); }

/* Error */
#view-error { display: none; flex: 1; align-items: center; justify-content: center; text-align: center; padding: 2rem; }
.error-head { font-family: 'Fraunces', serif; font-size: 22px; margin-bottom: 0.75rem; }
.error-body { font-size: 14px; color: var(--text-muted); }

/* Landing */
#view-landing { display: none; flex: 1; align-items: center; justify-content: center; padding: 2rem 1.5rem; }
.landing-inner { max-width: 480px; width: 100%; }
.landing-label { font-size: 11px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text-dim); margin-bottom: 1rem; }
.landing-head { font-family: 'Fraunces', serif; font-size: 32px; font-weight: 500; line-height: 1.2; margin-bottom: 1rem; }
.landing-sub { font-size: 15px; color: var(--text-muted); line-height: 1.65; margin-bottom: 1.75rem; max-width: 380px; }
.landing-goal { display: inline-block; font-size: 11px; font-weight: 500; letter-spacing: 0.1em; text-transform: uppercase; color: var(--accent); background: rgba(29,63,232,0.07); border-radius: 4px; padding: 3px 8px; margin-bottom: 1.25rem; }
.btn-primary { display: inline-block; background: var(--accent); color: var(--accent-ink); border: none; border-radius: 10px; padding: 13px 28px; font-size: 15px; font-family: 'Inter', sans-serif; font-weight: 500; cursor: pointer; transition: opacity 0.15s; }
.btn-primary:hover { opacity: 0.88; }

/* Identity form */
#view-identity { display: none; flex: 1; align-items: center; justify-content: center; padding: 2rem 1.5rem; }
.identity-inner { max-width: 420px; width: 100%; }
.identity-head { font-family: 'Fraunces', serif; font-size: 22px; font-weight: 500; margin-bottom: 0.5rem; }
.identity-sub { font-size: 14px; color: var(--text-muted); margin-bottom: 1.75rem; }
.field { margin-bottom: 1.1rem; }
.field label { display: block; font-size: 12px; font-weight: 500; color: var(--text-muted); margin-bottom: 5px; }
.field input { width: 100%; background: var(--bg-alt); border: 1px solid var(--border); border-radius: 8px; padding: 10px 13px; font-size: 15px; font-family: 'Inter', sans-serif; color: var(--text); }
.field input:focus { outline: none; border-color: var(--accent); }
.field input::placeholder { color: var(--text-dim); }
.identity-submit { margin-top: 1.5rem; }
.field-error { font-size: 12px; color: #C94040; margin-top: 4px; display: none; }

/* Chat */
#view-chat { display: none; flex: 1; flex-direction: column; overflow: hidden; padding-bottom: 3px; }
#chat-main { flex: 1; overflow-y: auto; padding: 1.5rem; }
#messages { max-width: 620px; width: 100%; margin: 0 auto; display: flex; flex-direction: column; gap: 20px; padding-bottom: 5rem; }
.msg { word-wrap: break-word; }
.msg.ai { align-self: flex-start; max-width: 86%; }
.msg.ai .author { font-size: 10px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text-dim); margin-bottom: 6px; }
.msg.ai .ai-text { font-family: 'Fraunces', serif; font-size: 16px; line-height: 1.65; color: var(--text); }
.msg.ai .ai-text p { margin: 0 0 0.7em; }
.msg.ai .ai-text p:last-child { margin-bottom: 0; }
.msg.user { align-self: flex-end; background: transparent; border: 1px solid var(--border); border-radius: 14px; padding: 9px 14px; font-size: 14.5px; line-height: 1.45; color: var(--text); max-width: 82%; }
.msg.note { align-self: center; font-size: 12px; color: var(--text-dim); padding: 2px 0; text-align: center; }
.msg.ai.typing-wrap { padding: 2px 0; }
.typing-dots { display: flex; gap: 5px; align-items: center; padding-top: 2px; }
.dot { width: 6px; height: 6px; border-radius: 50%; background: var(--text-dim); animation: bounce 1.2s ease-in-out infinite; }
.dot:nth-child(2) { animation-delay: 0.18s; }
.dot:nth-child(3) { animation-delay: 0.36s; }
@keyframes bounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-5px)} }
#chat-footer { flex-shrink: 0; border-top: 1px solid var(--border); padding: 0.85rem 1.5rem 1.25rem; }
.input-row { max-width: 620px; margin: 0 auto; display: flex; gap: 10px; align-items: flex-end; }
textarea { flex: 1; background: var(--bg-alt); border: 1px solid var(--border); border-radius: 10px; color: var(--text); font-size: 15px; font-family: 'Inter', sans-serif; line-height: 1.5; padding: 10px 14px; resize: none; min-height: 44px; max-height: 160px; overflow-y: auto; }
textarea:focus { outline: none; border-color: var(--accent); }
textarea::placeholder { color: var(--text-dim); }
textarea:disabled { opacity: 0.4; }
#btn-send { background: var(--accent); color: var(--accent-ink); border: none; border-radius: 6px; padding: 10px 16px; font-size: 11px; font-family: 'Inter', sans-serif; font-weight: 500; text-transform: uppercase; letter-spacing: 0.08em; cursor: pointer; flex-shrink: 0; height: 44px; transition: opacity 0.15s; }
#btn-send:disabled { opacity: 0.3; cursor: default; }
#btn-send:hover:not(:disabled) { opacity: 0.85; }
#btn-skip { display: none; background: transparent; border: 1px solid var(--border); border-radius: 6px; padding: 10px 14px; font-size: 11px; font-family: 'Inter', sans-serif; color: var(--text-muted); cursor: pointer; flex-shrink: 0; height: 44px; transition: color 0.15s; }
#btn-skip:hover { color: var(--text); }

/* Thank you */
#view-thankyou { display: none; flex: 1; align-items: center; justify-content: center; padding: 2rem 1.5rem; text-align: center; }
.thankyou-inner { max-width: 460px; }
.thankyou-mark { font-family: 'Fraunces', serif; font-size: 48px; font-weight: 500; color: var(--accent); margin-bottom: 1.25rem; line-height: 1; }
.thankyou-head { font-family: 'Fraunces', serif; font-size: 28px; font-weight: 500; line-height: 1.25; margin-bottom: 1rem; }
.thankyou-body { font-size: 15px; color: var(--text-muted); line-height: 1.65; }

@media (max-width: 480px) {
  .landing-head { font-size: 26px; }
  .thankyou-head { font-size: 24px; }
}
</style>
</head>
<body>
<div id="site-header">
  <span class="wordmark">Verse &amp; Hook</span>
</div>

<div id="view-loading" style="flex:1;display:flex;">
  <p class="loading-text">Loading...</p>
</div>

<div id="view-error" style="display:none;flex:1;">
  <div>
    <p class="error-head">Invalid link</p>
    <p class="error-body">This intake link is not recognized. Please check the URL you were sent.</p>
  </div>
</div>

<div id="view-landing" style="display:none;flex:1;">
  <div class="landing-inner">
    <p class="landing-label">Verse &amp; Hook — Client Intake</p>
    <div id="landing-goal-badge" class="landing-goal"></div>
    <h1 class="landing-head" id="landing-head"></h1>
    <p class="landing-sub" id="landing-sub"></p>
    <button class="btn-primary" onclick="showIdentity()">Get started &rarr;</button>
  </div>
</div>

<div id="view-identity" style="display:none;flex:1;">
  <div class="identity-inner">
    <h2 class="identity-head">Before we begin</h2>
    <p class="identity-sub">Please tell us a bit about yourself.</p>
    <div class="field">
      <label for="f-name">Full name</label>
      <input type="text" id="f-name" placeholder="Jane Smith">
      <p class="field-error" id="err-name">Required</p>
    </div>
    <div class="field">
      <label for="f-title">Title</label>
      <input type="text" id="f-title" placeholder="Chief Marketing Officer">
      <p class="field-error" id="err-title">Required</p>
    </div>
    <div class="field">
      <label for="f-email">Email</label>
      <input type="email" id="f-email" placeholder="jane@company.com">
      <p class="field-error" id="err-email">Required</p>
    </div>
    <div class="identity-submit">
      <button class="btn-primary" onclick="startChat()">Begin &rarr;</button>
    </div>
  </div>
</div>

<div id="view-chat" style="display:none;flex-direction:column;">
  <div id="chat-main"><div id="messages"></div></div>
  <div id="chat-footer">
    <div class="input-row">
      <textarea id="chat-input" placeholder="Type your response..." rows="1"></textarea>
      <button id="btn-skip" onclick="skipClosing()">Nothing to add</button>
      <button id="btn-send" disabled>Send</button>
    </div>
  </div>
</div>

<div id="view-thankyou" style="display:none;flex:1;">
  <div class="thankyou-inner">
    <div class="thankyou-mark">V&amp;H</div>
    <h2 class="thankyou-head">Thank you for your time.</h2>
    <p class="thankyou-body">Your responses have been recorded. The Verse and Hook team will review them as part of the onboarding process.</p>
  </div>
</div>

<div id="progress-bar-wrap"><div id="progress-bar-fill"></div></div>

<script>
var INTAKE_SYS = {
  discovery: "You are a warm, focused intake interviewer for Verse and Hook, a marketing agency. You are speaking with a stakeholder of a new client. Your job is to understand their perspective on the brand so the agency can develop effective marketing and storytelling strategy.\n\nMove through this as a real conversation. One question per turn. Match their register. Mirror what you hear before asking the next thing. Do not announce phases or topic areas.\n\nCover these areas naturally:\n- Their role and relationship to the brand\n- How they describe the brand — what it stands for, what makes it distinct\n- Target audience — specific, not generic\n- Competitive landscape — who they compete with, how they differ\n- Value proposition — what they believe the brand offers that competitors don't\n- Goals for the next 12–24 months\n\nWhen you have solid answers across all areas, close the conversation:\nSend a message thanking them for their time and asking if there's anything they want to add as they reflect on the conversation. Include [CLOSING] at the end of this message on its own line.\n\nAfter their response (or if they say nothing to add), send a brief warm acknowledgment, then [INTAKE_COMPLETE] on its own line.\n\nStyle rules:\n- Warm, not effusive. Never say 'Great!' or 'Amazing!'\n- One question per turn\n- Short responses, no bullets\n- Mirror before probing\n- Lowercase is fine. Match their energy.",

  intake: "You are a warm, focused intake interviewer for Verse and Hook, a marketing agency. You are speaking with a stakeholder of a new client project. Your job is to understand scope, expectations, and constraints before work begins.\n\nMove through this as a real conversation. One question per turn. Match their register. Mirror what you hear before asking the next thing. Do not announce phases or topic areas.\n\nCover these areas naturally:\n- Their role and involvement in the project\n- How they describe the scope — what's in and what's out\n- Timeline expectations and why they matter\n- Budget comfort — constraints and flexibility (no exact numbers needed)\n- How decisions get made — the decision-making structure\n- What success looks like — their definition of done\n- Known constraints, concerns, or risks going in\n\nWhen you have solid answers across all areas, close the conversation:\nSend a message thanking them for their time and asking if there's anything they want to add as they reflect on the conversation. Include [CLOSING] at the end of this message on its own line.\n\nAfter their response (or if they say nothing to add), send a brief warm acknowledgment, then [INTAKE_COMPLETE] on its own line.\n\nStyle rules:\n- Warm, not effusive. Never say 'Great!' or 'Amazing!'\n- One question per turn\n- Short responses, no bullets\n- Mirror before probing\n- Lowercase is fine. Match their energy.",

  feedback: "You are a warm, focused intake interviewer for Verse and Hook, a marketing agency. You are speaking with a stakeholder of an existing client. Your job is to understand their honest perspective on how the engagement is going.\n\nMove through this as a real conversation. One question per turn. Match their register. Mirror what you hear before asking the next thing. Do not announce phases or topic areas.\n\nCover these areas naturally:\n- Their role and involvement in the engagement\n- What's working well — what they'd keep exactly as is\n- What isn't working — what's falling short or feeling off\n- Priorities for what should change or improve\n- Overall satisfaction with direction and results\n- What they'd do differently if starting over\n\nWhen you have solid answers across all areas, close the conversation:\nSend a message thanking them for their time and asking if there's anything they want to add as they reflect on the conversation. Include [CLOSING] at the end of this message on its own line.\n\nAfter their response (or if they say nothing to add), send a brief warm acknowledgment, then [INTAKE_COMPLETE] on its own line.\n\nStyle rules:\n- Warm, not effusive. Never say 'Great!' or 'Amazing!'\n- One question per turn\n- Short responses, no bullets\n- Mirror before probing\n- Lowercase is fine. Match their energy."
};

var OPENERS = {
  discovery: "Hi — thanks for making time for this. I'm here to understand your perspective on the brand: where it stands, who it serves, and where you want it to go. There are no right or wrong answers — I'm just here to listen.\n\nTo get started: can you tell me a bit about your role and how long you've been connected to the brand?",
  intake: "Hi — thanks for taking the time. I want to make sure we understand scope and expectations clearly before the work begins. This should take about 10–15 minutes.\n\nTo start: can you tell me your role and how involved you expect to be in this project?",
  feedback: "Hi — thanks for making time. I want to hear your honest take on how things have been going — what's working, what isn't, and where you'd like to see change. Your perspective matters.\n\nTo start: can you tell me your role and how involved you've been in the work so far?"
};

var GOAL_LABELS = { discovery: 'Brand Discovery', intake: 'Project Intake', feedback: 'Engagement Feedback' };

var clientId = null, extractionGoal = null, clientName = null;
var respondentName = '', respondentTitle = '', respondentEmail = '';
var convo = [], exchanges = 0, busy = false, isClosing = false;

var pbar = document.getElementById('progress-bar-fill');

function setProgress(p) { pbar.style.width = p + '%'; }

function show(viewId) {
  ['loading','error','landing','identity','chat','thankyou'].forEach(function(id) {
    var el = document.getElementById('view-' + id);
    if (el) { el.style.display = id === viewId ? (id === 'chat' ? 'flex' : 'flex') : 'none'; }
  });
  if (viewId === 'chat') {
    document.getElementById('view-chat').style.flexDirection = 'column';
  }
}

// Load client by token on page load
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

function showIdentity() { show('identity'); setProgress(5); }

function startChat() {
  var name = document.getElementById('f-name').value.trim();
  var title = document.getElementById('f-title').value.trim();
  var email = document.getElementById('f-email').value.trim();
  var valid = true;

  ['name','title','email'].forEach(function(f) { document.getElementById('err-' + f).style.display = 'none'; });

  if (!name) { document.getElementById('err-name').style.display = 'block'; valid = false; }
  if (!title) { document.getElementById('err-title').style.display = 'block'; valid = false; }
  if (!email) { document.getElementById('err-email').style.display = 'block'; valid = false; }
  if (!valid) return;

  respondentName = name;
  respondentTitle = title;
  respondentEmail = email;

  show('chat');
  addAiMsg(OPENERS[extractionGoal] || OPENERS.discovery);
  setProgress(8);

  var input = document.getElementById('chat-input');
  input.addEventListener('input', function() {
    document.getElementById('btn-send').disabled = busy || !input.value.trim();
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 160) + 'px';
  });
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey && !busy) {
      e.preventDefault();
      var val = input.value.trim();
      if (!val) return;
      addUserMsg(val);
      input.value = ''; input.style.height = 'auto';
      sendMessage(val);
    }
  });
  document.getElementById('btn-send').addEventListener('click', function() {
    var val = input.value.trim();
    if (!val || busy) return;
    addUserMsg(val);
    input.value = ''; input.style.height = 'auto';
    sendMessage(val);
  });
}

function addAiMsg(text) {
  var d = document.createElement('div');
  d.className = 'msg ai';
  var author = document.createElement('div');
  author.className = 'author';
  author.textContent = 'Verse & Hook';
  var body = document.createElement('div');
  body.className = 'ai-text';
  text.split(/\n\n+/).forEach(function(para) {
    if (!para.trim()) return;
    var p = document.createElement('p');
    p.textContent = para.trim();
    body.appendChild(p);
  });
  d.appendChild(author);
  d.appendChild(body);
  document.getElementById('messages').appendChild(d);
  scroll();
}

function addUserMsg(text) {
  var d = document.createElement('div');
  d.className = 'msg user';
  d.textContent = text;
  document.getElementById('messages').appendChild(d);
  scroll();
}

function addNote(text) {
  var d = document.createElement('div');
  d.className = 'msg note';
  d.textContent = text;
  document.getElementById('messages').appendChild(d);
  scroll();
}

function showTyping() {
  var d = document.createElement('div');
  d.className = 'msg ai typing-wrap';
  d.id = 'typing';
  d.innerHTML = '<div class="author">Verse &amp; Hook</div><div class="typing-dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>';
  document.getElementById('messages').appendChild(d);
  scroll();
}

function hideTyping() { var t = document.getElementById('typing'); if (t) t.remove(); }

function scroll() {
  var m = document.getElementById('chat-main');
  setTimeout(function() { m.scrollTop = m.scrollHeight; }, 80);
}

function lock() {
  busy = true;
  document.getElementById('chat-input').disabled = true;
  document.getElementById('btn-send').disabled = true;
}

function unlock() {
  busy = false;
  document.getElementById('chat-input').disabled = false;
  document.getElementById('btn-send').disabled = !document.getElementById('chat-input').value.trim();
  document.getElementById('chat-input').focus();
}

function sendMessage(userText) {
  lock();
  convo.push({ role: 'user', content: userText });
  showTyping();

  fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: INTAKE_SYS[extractionGoal],
      messages: convo
    })
  })
  .then(function(r) { return r.json(); })
  .then(function(d) {
    if (d.error) throw new Error(d.error.message || d.error);
    var text = (d.content || []).map(function(b) { return b.text || ''; }).join('');

    var hasClosing = text.indexOf('[CLOSING]') !== -1;
    var hasComplete = text.indexOf('[INTAKE_COMPLETE]') !== -1;

    text = text.replace(/\[CLOSING\]/g, '').replace(/\[INTAKE_COMPLETE\]/g, '').trim();

    convo.push({ role: 'assistant', content: text });
    hideTyping();
    addAiMsg(text);

    exchanges++;
    setProgress(Math.min(88, 8 + exchanges * 8));

    if (hasComplete) {
      submitIntake();
    } else if (hasClosing) {
      isClosing = true;
      document.getElementById('btn-skip').style.display = 'inline-block';
      unlock();
    } else {
      unlock();
    }
  })
  .catch(function(e) {
    hideTyping();
    convo.pop();
    addAiMsg('Something went wrong — ' + e.message + '. Please try again.');
    unlock();
  });
}

function skipClosing() {
  // User skips the reflection — submit immediately without another AI turn
  document.getElementById('btn-skip').style.display = 'none';
  convo.push({ role: 'user', content: "No, that's all." });
  submitIntake();
}

function submitIntake() {
  lock();
  setProgress(96);
  addNote('Submitting your responses...');

  fetch('/api/vh-response', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      respondent_name: respondentName,
      respondent_title: respondentTitle,
      respondent_email: respondentEmail,
      transcript: convo
    })
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    if (data.ok) {
      setProgress(100);
      show('thankyou');
    } else {
      addAiMsg('Something went wrong saving your responses. Please refresh and try again.');
      unlock();
    }
  })
  .catch(function(e) {
    addAiMsg('Something went wrong saving your responses: ' + e.message + '. Please refresh and try again.');
    unlock();
  });
}
</script>
</body>
</html>
```

- [ ] **Step 2: Create the directory and commit**

```bash
mkdir -p verseandhook/intake
git add verseandhook/intake/index.html
git commit -m "feat: add respondent intake page (verseandhook/intake)"
git push
```

- [ ] **Step 3: Smoke test**

Use a token from Task 4's test client:

1. Open `https://dev.nilesheron.com/verseandhook/intake?token=<token-from-task-4>` — expect landing screen with client name and goal badge
2. Click "Get started" — expect identity form
3. Fill in name/title/email and click "Begin" — expect chat with opener message
4. Send a few messages — expect AI responses, progress bar advancing
5. Confirm skip button does not appear until the AI sends a closing message

---

## Task 8: Admin dashboard page

**Files:**
- Create: `verseandhook/intake/admin.html`

Single-page admin app. Views: login → dashboard → client-detail. Auth token stored in `sessionStorage`.

- [ ] **Step 1: Create the page**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>V&H Intake — Admin</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,500;1,400&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg: #F5F4F0;
  --bg-alt: #FFFFFF;
  --text: #1C1C1A;
  --text-muted: #5E5E58;
  --text-dim: #9A9A93;
  --accent: #1D3FE8;
  --accent-ink: #FFFFFF;
  --accent-light: #EEF1FD;
  --border: #E2E1DB;
  --danger: #C94040;
  --success: #2E7D4F;
}
body { background: var(--bg); color: var(--text); font-family: 'Inter', -apple-system, sans-serif; font-size: 14px; line-height: 1.6; min-height: 100vh; }

/* Header */
.admin-header { padding: 1rem 1.5rem; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; background: var(--bg-alt); }
.admin-wordmark { font-size: 11px; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase; color: var(--text-dim); }
.admin-actions { display: flex; gap: 10px; align-items: center; }

/* Login */
#view-login { display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 2rem; }
.login-card { background: var(--bg-alt); border: 1px solid var(--border); border-radius: 14px; padding: 2rem; max-width: 360px; width: 100%; }
.login-head { font-family: 'Fraunces', serif; font-size: 22px; font-weight: 500; margin-bottom: 0.4rem; }
.login-sub { font-size: 13px; color: var(--text-muted); margin-bottom: 1.5rem; }
.login-field { margin-bottom: 1rem; }
.login-field input { width: 100%; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 10px 13px; font-size: 14px; font-family: 'Inter', sans-serif; color: var(--text); }
.login-field input:focus { outline: none; border-color: var(--accent); }
.login-error { font-size: 12px; color: var(--danger); margin-bottom: 10px; display: none; }
.btn { display: inline-block; background: var(--accent); color: var(--accent-ink); border: none; border-radius: 8px; padding: 10px 20px; font-size: 14px; font-family: 'Inter', sans-serif; font-weight: 500; cursor: pointer; transition: opacity 0.15s; }
.btn:hover { opacity: 0.88; }
.btn:disabled { opacity: 0.35; cursor: default; }
.btn-outline { background: transparent; border: 1px solid var(--border); color: var(--text-muted); border-radius: 8px; padding: 8px 16px; font-size: 13px; font-family: 'Inter', sans-serif; cursor: pointer; }
.btn-outline:hover { border-color: var(--text-muted); color: var(--text); }
.btn-sm { padding: 7px 14px; font-size: 12px; border-radius: 6px; }

/* Dashboard */
#view-dashboard { display: none; }
.page-body { max-width: 900px; margin: 0 auto; padding: 1.5rem; }
.page-title { font-family: 'Fraunces', serif; font-size: 24px; font-weight: 500; margin-bottom: 0.25rem; }
.page-sub { font-size: 13px; color: var(--text-muted); margin-bottom: 1.5rem; }

/* Client list */
.client-list { display: flex; flex-direction: column; gap: 10px; }
.client-row { background: var(--bg-alt); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; display: flex; align-items: center; gap: 12px; cursor: pointer; transition: border-color 0.15s; }
.client-row:hover { border-color: var(--accent); }
.client-name { font-weight: 500; font-size: 15px; flex: 1; }
.goal-badge { font-size: 10px; font-weight: 500; letter-spacing: 0.1em; text-transform: uppercase; background: var(--accent-light); color: var(--accent); border-radius: 4px; padding: 3px 8px; flex-shrink: 0; }
.client-meta { font-size: 12px; color: var(--text-dim); flex-shrink: 0; text-align: right; }
.response-count { font-size: 12px; color: var(--text-muted); flex-shrink: 0; }
.empty-state { text-align: center; padding: 3rem 1rem; color: var(--text-dim); }
.empty-state p { margin-bottom: 1rem; }

/* Client detail */
#view-detail { display: none; }
.detail-body { max-width: 1100px; margin: 0 auto; padding: 1.5rem; }
.back-btn { background: none; border: none; font-family: 'Inter', sans-serif; font-size: 13px; color: var(--text-muted); cursor: pointer; padding: 0 0 1rem; display: flex; align-items: center; gap: 6px; }
.back-btn:hover { color: var(--text); }
.detail-head { display: flex; align-items: baseline; gap: 12px; margin-bottom: 1.5rem; }
.detail-title { font-family: 'Fraunces', serif; font-size: 26px; font-weight: 500; }
.detail-panels { display: grid; grid-template-columns: 1fr 340px; gap: 1.25rem; align-items: start; }
.panel { background: var(--bg-alt); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
.panel-head { padding: 12px 16px; border-bottom: 1px solid var(--border); font-size: 11px; font-weight: 500; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-dim); }
.panel-body { padding: 0; }

/* Respondents panel */
.respondent-row { padding: 12px 16px; border-bottom: 1px solid var(--border); cursor: pointer; }
.respondent-row:last-child { border-bottom: none; }
.respondent-row:hover { background: var(--bg); }
.resp-name { font-weight: 500; font-size: 14px; }
.resp-meta { font-size: 12px; color: var(--text-dim); margin-top: 2px; }
.resp-transcript { display: none; padding: 12px 16px; background: var(--bg); border-top: 1px solid var(--border); }
.transcript-turn { margin-bottom: 10px; }
.transcript-turn:last-child { margin-bottom: 0; }
.turn-role { font-size: 10px; font-weight: 500; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-dim); margin-bottom: 3px; }
.turn-content { font-size: 13px; color: var(--text-muted); line-height: 1.55; }

/* Analysis panel */
.analysis-pending { padding: 1.25rem 1rem; text-align: center; color: var(--text-dim); font-size: 13px; line-height: 1.6; }
.scores-grid { padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
.score-row { display: flex; align-items: center; gap: 10px; }
.score-label { font-size: 12px; color: var(--text-muted); flex: 1; text-transform: capitalize; }
.score-bar-wrap { width: 80px; height: 4px; background: var(--border); border-radius: 2px; flex-shrink: 0; }
.score-bar-fill { height: 100%; border-radius: 2px; background: var(--accent); }
.score-value { font-size: 12px; font-weight: 500; color: var(--text); width: 28px; text-align: right; flex-shrink: 0; }
.score-bar-fill.low { background: var(--danger); }
.score-bar-fill.mid { background: #C98E1A; }
.narrative-block { padding: 14px 16px; border-top: 1px solid var(--border); font-size: 13px; color: var(--text-muted); line-height: 1.65; font-family: 'Fraunces', serif; }
.analysis-ts { padding: 10px 16px; border-top: 1px solid var(--border); font-size: 11px; color: var(--text-dim); }

/* Modal */
.modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.3); z-index: 200; align-items: center; justify-content: center; padding: 1.5rem; }
.modal-overlay.open { display: flex; }
.modal { background: var(--bg-alt); border-radius: 14px; padding: 1.75rem; max-width: 420px; width: 100%; }
.modal-head { font-family: 'Fraunces', serif; font-size: 20px; font-weight: 500; margin-bottom: 1.25rem; }
.modal-field { margin-bottom: 1rem; }
.modal-field label { display: block; font-size: 12px; font-weight: 500; color: var(--text-muted); margin-bottom: 5px; }
.modal-field input, .modal-field select { width: 100%; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 10px 13px; font-size: 14px; font-family: 'Inter', sans-serif; color: var(--text); }
.modal-field input:focus, .modal-field select:focus { outline: none; border-color: var(--accent); }
.modal-actions { display: flex; gap: 10px; margin-top: 1.25rem; align-items: center; }
.modal-error { font-size: 12px; color: var(--danger); margin-top: 8px; display: none; }
.generated-link { margin-top: 1rem; padding: 12px; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; word-break: break-all; font-size: 13px; color: var(--text-muted); display: none; }
.generated-link-label { font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-dim); margin-bottom: 4px; }

@media (max-width: 680px) {
  .detail-panels { grid-template-columns: 1fr; }
}
</style>
</head>
<body>

<div class="admin-header" id="app-header" style="display:none;">
  <span class="admin-wordmark">V&amp;H Intake — Admin</span>
  <div class="admin-actions">
    <button class="btn btn-sm" onclick="openNewClientModal()">+ New Client</button>
    <button class="btn-outline btn-sm" onclick="logout()">Sign out</button>
  </div>
</div>

<!-- Login -->
<div id="view-login">
  <div class="login-card">
    <h1 class="login-head">Admin access</h1>
    <p class="login-sub">Verse and Hook — Intake Dashboard</p>
    <div class="login-field">
      <input type="password" id="login-pw" placeholder="Password" onkeydown="if(event.key==='Enter')doLogin()">
    </div>
    <p class="login-error" id="login-err">Incorrect password.</p>
    <button class="btn" id="login-btn" onclick="doLogin()">Sign in</button>
  </div>
</div>

<!-- Dashboard -->
<div id="view-dashboard">
  <div class="page-body">
    <h1 class="page-title">Clients</h1>
    <p class="page-sub">Click a client to view responses and alignment analysis.</p>
    <div id="client-list-container"></div>
  </div>
</div>

<!-- Client detail -->
<div id="view-detail">
  <div class="detail-body">
    <button class="back-btn" onclick="showDashboard()">&larr; All clients</button>
    <div class="detail-head">
      <h2 class="detail-title" id="detail-title"></h2>
      <span class="goal-badge" id="detail-goal-badge"></span>
    </div>
    <div class="detail-panels">
      <div class="panel">
        <div class="panel-head">Respondents</div>
        <div class="panel-body" id="respondents-list"></div>
      </div>
      <div class="panel">
        <div class="panel-head">Alignment Analysis</div>
        <div id="analysis-panel"></div>
      </div>
    </div>
  </div>
</div>

<!-- New client modal -->
<div class="modal-overlay" id="new-client-modal">
  <div class="modal">
    <h2 class="modal-head">New client session</h2>
    <div class="modal-field">
      <label for="nc-name">Client name</label>
      <input type="text" id="nc-name" placeholder="Acme Corporation">
    </div>
    <div class="modal-field">
      <label for="nc-goal">Extraction goal</label>
      <select id="nc-goal">
        <option value="discovery">Brand Discovery</option>
        <option value="intake">Project Intake</option>
        <option value="feedback">Engagement Feedback</option>
      </select>
    </div>
    <p class="modal-error" id="nc-error"></p>
    <div class="modal-actions">
      <button class="btn" id="nc-submit-btn" onclick="createClient()">Generate link</button>
      <button class="btn-outline" onclick="closeNewClientModal()">Cancel</button>
    </div>
    <div class="generated-link" id="generated-link">
      <p class="generated-link-label">Shareable link</p>
      <p id="generated-link-url"></p>
      <button class="btn btn-sm" style="margin-top:10px;" onclick="copyGeneratedLink()">Copy link</button>
    </div>
  </div>
</div>

<script>
var authToken = sessionStorage.getItem('vh-admin-token') || null;
var GOAL_LABELS = { discovery: 'Brand Discovery', intake: 'Project Intake', feedback: 'Engagement Feedback' };

function apiFetch(path, options) {
  var opts = options || {};
  opts.headers = opts.headers || {};
  opts.headers['Content-Type'] = 'application/json';
  if (authToken) opts.headers['x-vh-token'] = authToken;
  return fetch(path, opts).then(function(r) { return r.json(); });
}

function show(viewId) {
  ['login','dashboard','detail'].forEach(function(id) {
    document.getElementById('view-' + id).style.display = id === viewId ? 'block' : 'none';
  });
  document.getElementById('app-header').style.display = viewId === 'login' ? 'none' : 'flex';
}

// --- Auth ---
if (authToken) { show('dashboard'); loadDashboard(); } else { show('login'); }

function doLogin() {
  var pw = document.getElementById('login-pw').value;
  if (!pw) return;
  var btn = document.getElementById('login-btn');
  btn.disabled = true; btn.textContent = 'Signing in...';
  document.getElementById('login-err').style.display = 'none';

  fetch('/api/vh-auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: pw })
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    if (data.token) {
      authToken = data.token;
      sessionStorage.setItem('vh-admin-token', authToken);
      show('dashboard');
      loadDashboard();
    } else {
      document.getElementById('login-err').style.display = 'block';
      btn.disabled = false; btn.textContent = 'Sign in';
    }
  })
  .catch(function() {
    document.getElementById('login-err').style.display = 'block';
    btn.disabled = false; btn.textContent = 'Sign in';
  });
}

function logout() {
  sessionStorage.removeItem('vh-admin-token');
  authToken = null;
  show('login');
}

// --- Dashboard ---
function loadDashboard() {
  document.getElementById('client-list-container').innerHTML = '<p style="color:var(--text-dim);font-size:13px;">Loading...</p>';
  apiFetch('/api/vh-admin')
    .then(function(clients) {
      if (clients.error) {
        if (clients.error === 'Unauthorized') { logout(); return; }
        document.getElementById('client-list-container').innerHTML = '<p style="color:var(--danger);">Error loading clients.</p>';
        return;
      }
      renderClientList(clients);
    });
}

function renderClientList(clients) {
  var container = document.getElementById('client-list-container');
  if (!clients.length) {
    container.innerHTML = '<div class="empty-state"><p>No clients yet.</p><button class="btn" onclick="openNewClientModal()">Create your first client</button></div>';
    return;
  }
  var html = '<div class="client-list">';
  clients.forEach(function(c) {
    var lastDate = c.last_response_at ? new Date(c.last_response_at).toLocaleDateString() : '—';
    var countLabel = c.response_count === 1 ? '1 response' : c.response_count + ' responses';
    html += '<div class="client-row" onclick="loadClientDetail(\'' + c.id + '\')">';
    html += '<span class="client-name">' + esc(c.client_name) + '</span>';
    html += '<span class="goal-badge">' + esc(GOAL_LABELS[c.extraction_goal] || c.extraction_goal) + '</span>';
    html += '<span class="response-count">' + countLabel + '</span>';
    html += '<span class="client-meta">' + lastDate + '</span>';
    html += '</div>';
  });
  html += '</div>';
  container.innerHTML = html;
}

function showDashboard() {
  show('dashboard');
  loadDashboard();
}

// --- Client detail ---
function loadClientDetail(clientId) {
  show('detail');
  document.getElementById('detail-title').textContent = 'Loading...';
  document.getElementById('respondents-list').innerHTML = '';
  document.getElementById('analysis-panel').innerHTML = '';

  apiFetch('/api/vh-admin?client_id=' + encodeURIComponent(clientId))
    .then(function(data) {
      if (data.error) { document.getElementById('detail-title').textContent = 'Error'; return; }
      renderClientDetail(data.client, data.responses, data.analysis);
    });
}

function renderClientDetail(client, responses, analysis) {
  document.getElementById('detail-title').textContent = client.client_name;
  document.getElementById('detail-goal-badge').textContent = GOAL_LABELS[client.extraction_goal] || client.extraction_goal;

  // Respondents
  var respContainer = document.getElementById('respondents-list');
  if (!responses.length) {
    respContainer.innerHTML = '<p style="padding:1rem;font-size:13px;color:var(--text-dim);">No responses yet.</p>';
  } else {
    var html = '';
    responses.forEach(function(r, i) {
      var date = new Date(r.completed_at).toLocaleDateString();
      html += '<div class="respondent-row" onclick="toggleTranscript(' + i + ')">';
      html += '<div class="resp-name">' + esc(r.respondent_name) + '</div>';
      html += '<div class="resp-meta">' + esc(r.respondent_title) + ' &middot; ' + date + '</div>';
      html += '</div>';
      html += '<div class="resp-transcript" id="transcript-' + i + '">';
      var turns = r.transcript || [];
      turns.forEach(function(t) {
        html += '<div class="transcript-turn">';
        html += '<div class="turn-role">' + (t.role === 'user' ? esc(r.respondent_name) : 'Verse &amp; Hook') + '</div>';
        html += '<div class="turn-content">' + esc(t.content) + '</div>';
        html += '</div>';
      });
      html += '</div>';
    });
    respContainer.innerHTML = html;
  }

  // Analysis
  var analysisContainer = document.getElementById('analysis-panel');
  if (!analysis || !analysis.scores) {
    var msg = responses.length < 2
      ? '<p class="analysis-pending">Awaiting more responses to generate alignment scores.</p>'
      : '<p class="analysis-pending">' + (analysis && analysis.narrative ? '' : 'Analysis pending.') + '</p>';
    var narrative = analysis && analysis.narrative
      ? '<div class="narrative-block">' + esc(analysis.narrative) + '</div>'
      : '';
    var ts = analysis && analysis.created_at
      ? '<div class="analysis-ts">Last run: ' + new Date(analysis.created_at).toLocaleString() + '</div>'
      : '';
    analysisContainer.innerHTML = msg + narrative + ts;
  } else {
    var scoresHtml = '<div class="scores-grid">';
    Object.entries(analysis.scores).forEach(function(entry) {
      var key = entry[0], val = entry[1];
      var barClass = val < 40 ? 'low' : val < 70 ? 'mid' : '';
      scoresHtml += '<div class="score-row">';
      scoresHtml += '<span class="score-label">' + esc(key.replace(/_/g, ' ')) + '</span>';
      scoresHtml += '<div class="score-bar-wrap"><div class="score-bar-fill ' + barClass + '" style="width:' + val + '%"></div></div>';
      scoresHtml += '<span class="score-value">' + val + '</span>';
      scoresHtml += '</div>';
    });
    scoresHtml += '</div>';
    var narrativeHtml = analysis.narrative
      ? '<div class="narrative-block">' + esc(analysis.narrative) + '</div>'
      : '';
    var tsHtml = '<div class="analysis-ts">Last run: ' + new Date(analysis.created_at).toLocaleString() + '</div>';
    analysisContainer.innerHTML = scoresHtml + narrativeHtml + tsHtml;
  }
}

function toggleTranscript(i) {
  var el = document.getElementById('transcript-' + i);
  el.style.display = el.style.display === 'block' ? 'none' : 'block';
}

// --- New client modal ---
function openNewClientModal() {
  document.getElementById('nc-name').value = '';
  document.getElementById('nc-goal').value = 'discovery';
  document.getElementById('nc-error').style.display = 'none';
  document.getElementById('generated-link').style.display = 'none';
  document.getElementById('nc-submit-btn').disabled = false;
  document.getElementById('nc-submit-btn').textContent = 'Generate link';
  document.getElementById('new-client-modal').classList.add('open');
}

function closeNewClientModal() {
  document.getElementById('new-client-modal').classList.remove('open');
}

function createClient() {
  var name = document.getElementById('nc-name').value.trim();
  var goal = document.getElementById('nc-goal').value;
  var errEl = document.getElementById('nc-error');
  errEl.style.display = 'none';

  if (!name) { errEl.textContent = 'Client name is required.'; errEl.style.display = 'block'; return; }

  var btn = document.getElementById('nc-submit-btn');
  btn.disabled = true; btn.textContent = 'Creating...';

  apiFetch('/api/vh-session', {
    method: 'POST',
    body: JSON.stringify({ client_name: name, extraction_goal: goal })
  })
  .then(function(data) {
    if (data.error) {
      errEl.textContent = data.error; errEl.style.display = 'block';
      btn.disabled = false; btn.textContent = 'Generate link';
      return;
    }
    var url = window.location.origin + '/verseandhook/intake?token=' + data.token;
    document.getElementById('generated-link-url').textContent = url;
    document.getElementById('generated-link').style.display = 'block';
    btn.textContent = 'Created ✓';
    loadDashboard(); // refresh the list in background
  })
  .catch(function() {
    errEl.textContent = 'Something went wrong.'; errEl.style.display = 'block';
    btn.disabled = false; btn.textContent = 'Generate link';
  });
}

function copyGeneratedLink() {
  var url = document.getElementById('generated-link-url').textContent;
  navigator.clipboard.writeText(url).then(function() {
    var btn = event.target;
    btn.textContent = 'Copied!';
    setTimeout(function() { btn.textContent = 'Copy link'; }, 2000);
  });
}

// Escape HTML
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
</script>
</body>
</html>
```

- [ ] **Step 2: Commit and deploy**

```bash
git add verseandhook/intake/admin.html
git commit -m "feat: add admin dashboard page (verseandhook/intake/admin)"
git push
```

- [ ] **Step 3: Smoke test**

1. Open `https://dev.nilesheron.com/verseandhook/intake/admin` — expect password gate
2. Enter wrong password — expect "Incorrect password"
3. Enter correct password — expect client list (with the test client from Task 4)
4. Click "+ New Client" — fill in name + goal — click "Generate link" — expect tokenized URL appears with Copy button
5. Click the test client row — expect client detail with respondent list (from Task 6's test) and analysis panel
6. Click a respondent row — expect transcript expands inline
7. Open a new tab — expect password gate again (sessionStorage cleared)

---

## Self-review checklist (already run — issues found and fixed inline)

- **Spec coverage**: All sections covered — data model (Task 1), API config (Task 2), admin auth (Task 3), session management (Task 4), admin dashboard data (Task 5), response + analysis (Task 6), respondent intake (Task 7), admin dashboard UI (Task 8).
- **Placeholders**: None. All code is complete.
- **Type consistency**: `client_id`, `respondent_name`, `respondent_title`, `respondent_email`, `transcript`, `extraction_goal` used consistently across all tasks. `sb()` helper defined independently in each file (no shared import needed). `validateAdminToken` exported from `vh-auth.js` and imported in `vh-session.js`, `vh-admin.js` — consistent.
- **Missing spec requirement**: `[CLOSING]` marker and skip button — implemented in Task 7. Thank-you splash — implemented in Task 7. Identity form validation — implemented in Task 7. Score color coding (low/mid/high) — implemented in Task 8.
