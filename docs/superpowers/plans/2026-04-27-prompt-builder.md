# Prompt Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded 3-mode extraction goal picker in the new session modal with a natural-language prompt builder that generates a structured Kimba system prompt via Claude Sonnet, with template save support.

**Architecture:** Session creation becomes two sequential calls — `PUT /api/vh-goal-config` (creates a custom goal config row) then `POST /api/vh-session` (links the client to that goal key). The modal gains two new phases (loading + review) injected via the same `showSessionCreated()` pattern already used in the codebase. A new `generate_prompt` action in `vh-admin.js` calls Sonnet and returns a structured JSON config. No changes to the respondent page or analysis pipeline — they already look up prompts dynamically by `goal_key`.

**Tech Stack:** Vanilla JS + HTML (`admin.html`), Node.js serverless functions (Vercel), Supabase (PostgreSQL via REST), Anthropic API (`claude-sonnet-4-6`)

---

## File Map

| File | Change |
|---|---|
| `api/vh-admin.js` | Add `generate_prompt` action to POST handler |
| `api/vh-session.js` | Accept `max_exchanges` on POST; relax `extraction_goal` validation |
| `api/vh-goal-config.js` | Accept `closing_message` and `is_template` in PUT handler |
| `verseandhook/intake/admin.html` | Phase 1 HTML, phase 1 JS, phase 2+3 functions, create + template flow |

**No changes:** `api/vh-analysis-utils.js`, `api/vh-config.js`, `api/vh-response.js`, `verseandhook/kimba/index.html`

---

## Task 1: DB migration — add closing_message and is_template to vh_goal_configs

**Files:** No repo files change — SQL run directly in Supabase

- [ ] **Step 1: Run the migration**

In the Supabase SQL editor for project `xszhfxzfybubdlivbfxp`:

```sql
ALTER TABLE vh_goal_configs
  ADD COLUMN IF NOT EXISTS closing_message TEXT,
  ADD COLUMN IF NOT EXISTS is_template BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 2: Verify columns exist**

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'vh_goal_configs'
ORDER BY ordinal_position;
```

Expected: `closing_message` (text, nullable) and `is_template` (boolean, not null, default false) appear in results.

---

## Task 2: vh-goal-config.js — accept closing_message and is_template on PUT

**Files:**
- Modify: `api/vh-goal-config.js`

- [ ] **Step 1: Expand destructuring in PUT handler**

Find line 56:
```javascript
const { goal_key, name, intake_system_prompt, opener_message, analysis_system_prompt, scoring_dimensions } = req.body || {};
```

Replace with:
```javascript
const { goal_key, name, intake_system_prompt, opener_message, analysis_system_prompt, scoring_dimensions, closing_message, is_template } = req.body || {};
```

- [ ] **Step 2: Include new fields in upsert body**

Find the `body: JSON.stringify({` block inside the PUT handler. Replace the entire JSON.stringify call with:

```javascript
body: JSON.stringify({
  goal_key,
  name,
  intake_system_prompt,
  opener_message,
  analysis_system_prompt,
  scoring_dimensions,
  closing_message: closing_message || null,
  is_template: !!is_template,
  updated_at: new Date().toISOString()
})
```

- [ ] **Step 3: Commit**

```bash
git add api/vh-goal-config.js
git commit -m "feat: accept closing_message and is_template in vh-goal-config PUT"
```

- [ ] **Step 4: Deploy and verify**

Push to main, wait ~30s. Then:

```bash
curl -s -X PUT https://dev.nilesheron.com/api/vh-goal-config \
  -H "Content-Type: application/json" \
  -H "X-Vh-Token: $VH_ADMIN_TOKEN" \
  -d '{
    "goal_key": "test-closing-verify",
    "name": "Test",
    "intake_system_prompt": "you are kimba",
    "opener_message": "what do you do?",
    "analysis_system_prompt": "analyze transcripts",
    "scoring_dimensions": ["test_dim"],
    "closing_message": "thanks for sharing",
    "is_template": false
  }'
```

Expected: `200` with the upserted row. Verify `closing_message` and `is_template` appear in the Supabase `vh_goal_configs` table. Delete the test row afterward.

---

## Task 3: vh-session.js — accept max_exchanges on POST, relax extraction_goal validation

**Files:**
- Modify: `api/vh-session.js`

- [ ] **Step 1: Add max_exchanges to POST destructuring**

Find line 29:
```javascript
const { client_name, extraction_goal, expected_respondent_count } = req.body || {};
```

Replace with:
```javascript
const { client_name, extraction_goal, expected_respondent_count, max_exchanges } = req.body || {};
```

- [ ] **Step 2: Replace hardcoded extraction_goal validation**

Find lines 33-35:
```javascript
if (!['discovery', 'intake', 'feedback'].includes(extraction_goal)) {
  return res.status(400).json({ error: 'extraction_goal must be discovery, intake, or feedback' });
}
```

Replace with:
```javascript
if (!extraction_goal || !/^[a-z0-9][a-z0-9-]*$/.test(extraction_goal)) {
  return res.status(400).json({ error: 'extraction_goal must be lowercase letters, numbers, and hyphens' });
}
```

- [ ] **Step 3: Add max_exchanges to insertRow**

After the `expected_respondent_count` block (lines 39-41), add:
```javascript
if (max_exchanges != null) {
  const n = Number(max_exchanges);
  if (Number.isInteger(n) && n >= 4 && n <= 20) insertRow.max_exchanges = n;
}
```

- [ ] **Step 4: Commit**

```bash
git add api/vh-session.js
git commit -m "feat: accept max_exchanges on session creation, relax extraction_goal validation"
```

- [ ] **Step 5: Deploy and verify**

```bash
# Should succeed with a custom goal key
curl -s -X POST https://dev.nilesheron.com/api/vh-session \
  -H "Content-Type: application/json" \
  -H "X-Vh-Token: $VH_ADMIN_TOKEN" \
  -d '{"client_name":"test custom goal","extraction_goal":"custom-abc12345","expected_respondent_count":4,"max_exchanges":10}'
```

Expected: `200` with a `token` field. Verify `vh_clients` in Supabase shows `extraction_goal: "custom-abc12345"` and `max_exchanges: 10`. Delete the test row.

```bash
# Should reject invalid goal key format
curl -s -X POST https://dev.nilesheron.com/api/vh-session \
  -H "Content-Type: application/json" \
  -H "X-Vh-Token: $VH_ADMIN_TOKEN" \
  -d '{"client_name":"test","extraction_goal":"INVALID KEY!"}'
```

Expected: `400` with error about extraction_goal format.

---

## Task 4: vh-admin.js — add generate_prompt action

**Files:**
- Modify: `api/vh-admin.js`

- [ ] **Step 1: Add the meta-prompt constant**

After the imports and env var declarations (after line 7, before the `sb` helper function), add:

```javascript
const GENERATE_PROMPT_SYSTEM = `You are configuring Kimba, a conversational intake agent for Verse and Hook, a marketing agency. Kimba conducts structured but conversational interviews with client stakeholders.

Kimba's voice: lowercase, warm, direct, curious. Never clinical or formal. Uses short questions. Lets respondents think.

Based on the admin's description, generate a complete Kimba session configuration. Return a JSON object with exactly these four keys:

"intake_system_prompt": Kimba's full system prompt. Include: persona (Kimba is a thoughtful interviewer who listens carefully and doesn't rush), the specific areas to explore based on the goal, pacing (2-3 follow-up questions per topic before moving on), staying on-topic (gently redirect off-course responses), and closing instructions (when the main areas are covered and the conversation feels complete, output the exact token [INTAKE_COMPLETE] on its own line then write a brief warm closing message). Aim for 400-600 words.

"opener_message": Kimba's first message to the respondent. Open-ended, lowercase, invites them to share from their own perspective. 1-2 sentences. Do not start with a greeting — begin with the question itself.

"analysis_system_prompt": System prompt for an AI that analyzes transcripts from multiple respondents. Instruct it to: identify consensus and conflict across perspectives; output a JSON object with "scores" (object mapping each scoring dimension key to 0-100, where 100 = full consensus), "narrative" (2-4 sentence summary of the most actionable alignment pattern), and optionally "respondents" (array with name, kind ["alignment"|"conflict"|"outlier"], x 0-1, y 0-1, summary per respondent); if fewer than 2 respondents, return scores as null and note alignment requires at least 2. Return ONLY valid JSON.

"scoring_dimensions": Array of 3-6 snake_case strings naming key alignment dimensions to measure. Choose dimensions that directly reflect what the admin wants to learn.

Return ONLY valid JSON. No preamble, no markdown fences, no explanation.`;
```

- [ ] **Step 2: Add generate_prompt branch to POST handler**

Find these two lines at the top of the POST handler (around line 29):
```javascript
const { action, client_id } = req.body || {};
if (action !== 'rerun_analysis') return res.status(400).json({ error: 'Unknown action' });
```

Replace with:
```javascript
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
```

- [ ] **Step 3: Commit**

```bash
git add api/vh-admin.js
git commit -m "feat: add generate_prompt action to vh-admin"
```

- [ ] **Step 4: Deploy and verify**

```bash
curl -s -X POST https://dev.nilesheron.com/api/vh-admin \
  -H "Content-Type: application/json" \
  -H "X-Vh-Token: $VH_ADMIN_TOKEN" \
  -d '{
    "action": "generate_prompt",
    "description": "understand how stakeholders feel about brand voice and whether the team is aligned on positioning",
    "base_goal": "discovery"
  }'
```

Expected: `200` with a JSON object containing `intake_system_prompt` (long string starting with Kimba persona), `opener_message` (1-2 sentences, lowercase), `analysis_system_prompt` (long string), `scoring_dimensions` (array of 3-6 strings). Takes 3-8 seconds.

---

## Task 5: admin.html — Phase 1 modal HTML

**Files:**
- Modify: `verseandhook/intake/admin.html`

- [ ] **Step 1: Replace the modal form column HTML**

Find the block starting at line 858 (`<div class="modal-form-col" id="modal-form-col">`). Replace everything from that opening div through its closing `</div>` at line 888 with:

```html
<div class="modal-form-col" id="modal-form-col">
  <div class="modal-top">
    <span class="k-mono k-slash">new session</span>
    <button class="modal-close" onclick="closeModal()">close ✕</button>
  </div>
  <h2 class="k-display modal-headline" id="modal-heading">configure<span class="red">.</span></h2>

  <div>
    <label class="k-mono modal-label" for="modal-name">client name</label>
    <input class="k-input" type="text" id="modal-name" placeholder="e.g. altona coffee co." oninput="onModalNameInput()" autofocus>
  </div>

  <div class="modal-count-row">
    <div>
      <label class="k-mono modal-label" for="modal-count">expected respondents</label>
      <input class="k-input" type="number" id="modal-count" min="1" max="200" value="8">
    </div>
    <div>
      <label class="k-mono modal-label" for="modal-max-exchanges">max exchanges</label>
      <input class="k-input" type="number" id="modal-max-exchanges" min="4" max="20" value="10">
    </div>
  </div>

  <div>
    <label class="k-mono modal-label" for="modal-closing">closing message</label>
    <input class="k-input" type="text" id="modal-closing" placeholder="e.g. thanks for sharing your perspective">
  </div>

  <div>
    <label class="k-mono modal-label">starting point</label>
    <div class="mode-options" id="mode-options"></div>
  </div>

  <div>
    <label class="k-mono modal-label" for="modal-desc">describe what you want to learn</label>
    <textarea class="k-input" id="modal-desc" rows="3" placeholder="e.g. understand how this client's stakeholders think about their brand voice and whether the team is aligned on positioning" style="resize:vertical;font-family:inherit;font-size:inherit;line-height:1.5;width:100%"></textarea>
  </div>

  <div class="modal-footer">
    <button class="k-btn k-btn-ghost" onclick="closeModal()">cancel</button>
    <button class="k-btn k-btn-red" id="modal-generate" onclick="generatePrompt()" disabled style="margin-left:auto;opacity:0.45">generate prompt →</button>
  </div>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add verseandhook/intake/admin.html
git commit -m "feat: prompt builder — phase 1 modal HTML"
```

---

## Task 6: admin.html — Phase 1 JS updates

**Files:**
- Modify: `verseandhook/intake/admin.html` (script section)

- [ ] **Step 1: Add description field to MODE_DETAILS**

Find `var MODE_DETAILS` (~line 946). Replace the entire block with:

```javascript
var MODE_DETAILS = {
  '01': {
    key: 'discovery', name: 'brand discovery',
    coverage: 'company identity · audience · competitive position · voice',
    rec: '5–20 stakeholders',
    opener: 'when someone outside the company asks what you actually do, what do you tell them?',
    description: 'understand how this client\'s stakeholders think about their brand — their identity, audience, competitive position, and voice'
  },
  '02': {
    key: 'intake', name: 'project intake',
    coverage: 'scope · constraints · success criteria · stakeholders',
    rec: '3–8 stakeholders',
    opener: 'in plain language, what does this project need to do that nothing currently does?',
    description: 'scope this project by understanding what stakeholders expect, what success looks like, and what constraints exist'
  },
  '03': {
    key: 'feedback', name: 'engagement feedback',
    coverage: 'process · communication · deliverables · what to repeat',
    rec: '3–10 stakeholders',
    opener: 'looking back at the engagement so far, what\'s the one thing you\'d change about how we worked together?',
    description: 'gather honest feedback on this engagement — what\'s working, what isn\'t, and what to do differently'
  }
};
```

- [ ] **Step 2: Add new modal state variables**

After `var modalTrapClean = null;` (~line 1819), add:

```javascript
var modalGenerated       = null;
var modalPhase1          = null;
var modalClosingMessage  = '';
var modalSaveAsTemplate  = false;
```

- [ ] **Step 3: Replace openModal()**

Find `function openModal()` (~line 1821). Replace its entire body with:

```javascript
function openModal() {
  modalSubmitted       = false;
  modalGenerated       = null;
  modalPhase1          = null;
  modalClosingMessage  = '';
  modalSaveAsTemplate  = false;
  selectedMode         = '01';

  document.getElementById('modal-name').value          = '';
  document.getElementById('modal-count').value         = '8';
  document.getElementById('modal-max-exchanges').value = '10';
  document.getElementById('modal-closing').value       = '';
  document.getElementById('modal-desc').value          = MODE_DETAILS['01'].description;

  var btn = document.getElementById('modal-generate');
  btn.disabled      = true;
  btn.style.opacity = '0.45';

  // Remove any injected phase content from a previous open
  var phaseContent = document.getElementById('modal-phase-content');
  if (phaseContent) phaseContent.remove();
  document.getElementById('modal-form-col').style.display    = '';
  document.getElementById('modal-preview-col').style.display = '';

  renderModeOptions();
  updatePreview();
  modalOpener = document.activeElement;
  var modal = document.getElementById('modal-new-session');
  modal.style.display = 'flex';
  modalTrapClean = trapFocus(modal);
  setTimeout(function() { document.getElementById('modal-name').focus(); }, 50);
}
```

- [ ] **Step 4: Update selectMode() to populate description textarea**

Find `function selectMode(key)` (~line 1868). Replace with:

```javascript
function selectMode(key) {
  selectedMode = key;
  renderModeOptions();
  updatePreview();
  var descEl = document.getElementById('modal-desc');
  if (descEl) descEl.value = MODE_DETAILS[key].description;
}
```

- [ ] **Step 5: Update onModalNameInput() to target the generate button**

Find `function onModalNameInput()` (~line 1885). Replace with:

```javascript
function onModalNameInput() {
  var name = document.getElementById('modal-name').value.trim();
  var btn  = document.getElementById('modal-generate');
  btn.disabled      = !name;
  btn.style.opacity = name ? '1' : '0.45';
  updatePreview();
}
```

- [ ] **Step 6: Commit**

```bash
git add verseandhook/intake/admin.html
git commit -m "feat: prompt builder — phase 1 JS"
```

- [ ] **Step 7: Smoke test phase 1**

Deploy, open `dev.nilesheron.com/verseandhook/intake/admin`, log in. Click "+ new session". Confirm:
- Three template buttons appear under "starting point"
- Selecting each updates both the preview column and the description textarea
- Generate button is disabled until client name is filled
- Expected respondents + max exchanges appear as two inputs side by side
- Closing message field is present

---

## Task 7: admin.html — phase 2 loading and phase 3 review

**Files:**
- Modify: `verseandhook/intake/admin.html` (script section)

- [ ] **Step 1: Add phase transition functions**

Immediately after `function onModalNameInput()`, add:

```javascript
function backToPhase1(e) {
  if (e) e.preventDefault();
  var phaseContent = document.getElementById('modal-phase-content');
  if (phaseContent) phaseContent.remove();
  document.getElementById('modal-form-col').style.display    = '';
  document.getElementById('modal-preview-col').style.display = '';
  if (modalTrapClean) { modalTrapClean(); modalTrapClean = null; }
  modalTrapClean = trapFocus(document.getElementById('modal-new-session'));
}

function showPhase2() {
  document.getElementById('modal-form-col').style.display    = 'none';
  document.getElementById('modal-preview-col').style.display = 'none';
  var existing = document.getElementById('modal-phase-content');
  if (existing) existing.remove();
  var div = document.createElement('div');
  div.id = 'modal-phase-content';
  div.innerHTML =
    '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:280px;gap:12px">' +
      '<h2 class="k-display modal-headline">generating<span class="red">.</span></h2>' +
      '<span class="k-mono" style="color:var(--kimba-mute)">building your session prompt</span>' +
    '</div>';
  document.getElementById('modal-inner').appendChild(div);
}

function showPhase2Error() {
  var existing = document.getElementById('modal-phase-content');
  if (existing) existing.remove();
  var div = document.createElement('div');
  div.id = 'modal-phase-content';
  div.innerHTML =
    '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:280px;gap:12px">' +
      '<span class="k-mono" style="color:var(--kimba-mute)">something went wrong generating the prompt</span>' +
      '<button class="k-btn k-btn-ghost" onclick="backToPhase1()">try again</button>' +
    '</div>';
  document.getElementById('modal-inner').appendChild(div);
}

function showPhase3(data) {
  modalGenerated = data;
  var existing = document.getElementById('modal-phase-content');
  if (existing) existing.remove();
  var closingForJson = modalPhase1 ? modalPhase1.closing : '';
  var jsonPreview = JSON.stringify({
    intake_system_prompt:  data.intake_system_prompt,
    opener_message:        data.opener_message,
    analysis_system_prompt: data.analysis_system_prompt,
    scoring_dimensions:    data.scoring_dimensions,
    closing_message:       closingForJson || null
  }, null, 2);
  var div = document.createElement('div');
  div.id = 'modal-phase-content';
  div.style.cssText = 'display:flex;width:100%;height:100%;min-height:0';
  div.innerHTML =
    '<div class="modal-form-col" style="display:flex;flex-direction:column">' +
      '<div class="modal-top">' +
        '<span class="k-mono k-slash">review prompt</span>' +
        '<button class="modal-close" onclick="closeModal()">close ✕</button>' +
      '</div>' +
      '<h2 class="k-display modal-headline" id="modal-heading">review<span class="red">.</span></h2>' +
      '<div style="flex:1;display:flex;flex-direction:column;gap:12px;overflow-y:auto">' +
        '<div>' +
          '<label class="k-mono modal-label" for="phase3-prompt">/ kimba\'s system prompt</label>' +
          '<textarea class="k-input" id="phase3-prompt" rows="10" style="font-size:12px;line-height:1.5;resize:vertical;font-family:var(--kimba-mono,monospace);width:100%">' + esc(data.intake_system_prompt) + '</textarea>' +
        '</div>' +
        '<div>' +
          '<label class="k-mono modal-label" for="phase3-opener">/ opener</label>' +
          '<input class="k-input" type="text" id="phase3-opener" value="' + esc(data.opener_message) + '" style="width:100%">' +
        '</div>' +
      '</div>' +
      '<div class="modal-footer">' +
        '<a href="#" class="k-mono" style="color:var(--kimba-mute);font-size:11px;text-decoration:none;align-self:center" onclick="backToPhase1(event)">← back</a>' +
        '<button class="k-btn k-btn-red" id="phase3-submit" onclick="createSessionFromPrompt()" style="margin-left:auto">create &amp; generate link →</button>' +
      '</div>' +
    '</div>' +
    '<div class="modal-preview-col" style="display:flex;flex-direction:column">' +
      '<span class="k-mono k-slash modal-preview-preview-tag">advanced</span>' +
      '<details style="margin-top:8px">' +
        '<summary class="k-mono" style="cursor:pointer;font-size:11px;color:var(--kimba-mute);list-style:none">/ full config json</summary>' +
        '<pre style="font-size:9px;overflow:auto;max-height:220px;margin-top:8px;color:var(--kimba-mute);white-space:pre-wrap;word-break:break-word">' + esc(jsonPreview) + '</pre>' +
      '</details>' +
      '<div style="margin-top:auto;padding-top:16px;display:flex;flex-direction:column;gap:8px">' +
        '<button class="k-btn k-btn-ghost" id="save-template-btn" onclick="showSaveAsTemplate()">save as template</button>' +
        '<div id="save-template-form" style="display:none">' +
          '<input class="k-input" type="text" id="template-name" placeholder="e.g. brand discovery — lifestyle" style="margin-bottom:6px;width:100%">' +
          '<button class="k-btn k-btn-ghost" onclick="confirmSaveAsTemplate()" style="width:100%">confirm save</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  document.getElementById('modal-inner').appendChild(div);
  if (modalTrapClean) { modalTrapClean(); modalTrapClean = null; }
  modalTrapClean = trapFocus(document.getElementById('modal-new-session'));
}
```

- [ ] **Step 2: Add generatePrompt() function**

Immediately after the functions above, add:

```javascript
function generatePrompt() {
  var name    = document.getElementById('modal-name').value.trim();
  var desc    = document.getElementById('modal-desc').value.trim();
  var closing = document.getElementById('modal-closing').value.trim();
  var maxEx   = parseInt(document.getElementById('modal-max-exchanges').value, 10) || 10;
  var count   = parseInt(document.getElementById('modal-count').value, 10) || 8;
  if (!name) return;

  modalPhase1         = { name: name, closing: closing, maxEx: maxEx, count: count };
  modalClosingMessage = closing;
  showPhase2();

  var baseGoal = MODE_DETAILS[selectedMode] ? MODE_DETAILS[selectedMode].key : null;

  apiFetch('/api/vh-admin', {
    method: 'POST',
    body: JSON.stringify({
      action:      'generate_prompt',
      description: desc || ('session for ' + name),
      base_goal:   baseGoal
    })
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    if (data.intake_system_prompt) {
      showPhase3(data);
    } else {
      showPhase2Error();
    }
  })
  .catch(function() {
    showPhase2Error();
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add verseandhook/intake/admin.html
git commit -m "feat: prompt builder — phase 2 loading and phase 3 review"
```

- [ ] **Step 4: Smoke test phases 2 and 3**

Deploy. Open admin → "+ new session" → type client name → click "Generate prompt →". Confirm:
- Phase 2 shows "generating." with muted subtext
- After ~5s, phase 3 appears with system prompt textarea and opener field (both editable)
- Right column shows "/ full config json" accordion (collapsed); expanding shows valid JSON including `closing_message`
- "← back" returns to phase 1 with description intact

---

## Task 8: admin.html — create session and save-as-template

**Files:**
- Modify: `verseandhook/intake/admin.html` (script section)

- [ ] **Step 1: Add generateGoalKey(), createSessionFromPrompt(), showSaveAsTemplate(), confirmSaveAsTemplate()**

After `generatePrompt()`, add:

```javascript
function generateGoalKey() {
  var arr = new Uint8Array(4);
  window.crypto.getRandomValues(arr);
  return 'custom-' + Array.from(arr).map(function(b) {
    return b.toString(16).padStart(2, '0');
  }).join('');
}

function createSessionFromPrompt() {
  var btn = document.getElementById('phase3-submit');
  if (!btn || btn.disabled) return;
  btn.disabled     = true;
  btn.textContent  = 'creating…';

  var goalKey      = generateGoalKey();
  var systemPrompt = document.getElementById('phase3-prompt').value;
  var opener       = document.getElementById('phase3-opener').value;
  var templateNameEl = document.getElementById('template-name');
  var templateName = (modalSaveAsTemplate && templateNameEl) ? templateNameEl.value.trim() : '';

  var goalConfig = {
    goal_key:               goalKey,
    name:                   (modalSaveAsTemplate && templateName) ? templateName : modalPhase1.name,
    intake_system_prompt:   systemPrompt,
    opener_message:         opener,
    analysis_system_prompt: modalGenerated.analysis_system_prompt,
    scoring_dimensions:     modalGenerated.scoring_dimensions,
    closing_message:        modalClosingMessage || null,
    is_template:            modalSaveAsTemplate
  };

  apiFetch('/api/vh-goal-config', { method: 'PUT', body: JSON.stringify(goalConfig) })
    .then(function(r) {
      if (!r.ok) throw new Error('goal config save failed');
      return apiFetch('/api/vh-session', {
        method: 'POST',
        body: JSON.stringify({
          client_name:               modalPhase1.name,
          extraction_goal:           goalKey,
          expected_respondent_count: modalPhase1.count,
          max_exchanges:             modalPhase1.maxEx
        })
      });
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.token) {
        // Remove phase content before showSessionCreated hides the columns
        var phaseContent = document.getElementById('modal-phase-content');
        if (phaseContent) phaseContent.remove();
        showSessionCreated(data);
      } else {
        if (btn) { btn.disabled = false; btn.textContent = 'create & generate link →'; }
      }
    })
    .catch(function() {
      if (btn) { btn.disabled = false; btn.textContent = 'create & generate link →'; }
    });
}

function showSaveAsTemplate() {
  document.getElementById('save-template-btn').style.display = 'none';
  var form = document.getElementById('save-template-form');
  form.style.display         = 'flex';
  form.style.flexDirection   = 'column';
  setTimeout(function() {
    var nameEl = document.getElementById('template-name');
    if (nameEl) nameEl.focus();
  }, 50);
}

function confirmSaveAsTemplate() {
  modalSaveAsTemplate = true;
  document.getElementById('save-template-form').style.display = 'none';
  var btn = document.getElementById('save-template-btn');
  btn.textContent = '✓ will save as template';
  btn.disabled    = true;
  btn.style.display = '';
}
```

- [ ] **Step 2: Delete the now-unused submitNewSession() function**

Find `function submitNewSession()` (~line 1893) and delete the entire function body through its closing `}`. It is no longer called — the `onclick="submitNewSession()"` button was replaced in Task 5. `showSessionCreated` stays.

- [ ] **Step 3: Commit**

```bash
git add verseandhook/intake/admin.html
git commit -m "feat: prompt builder — create session and save-as-template flow"
```

- [ ] **Step 4: End-to-end smoke test**

Deploy. Full flow:

1. Admin → "+ new session" → type client name
2. Select "brand discovery" → description textarea updates
3. Fill closing message: "thanks for your time — this was really helpful"
4. Click "Generate prompt →" → loading phase appears
5. Phase 3 loads with editable system prompt and opener
6. Edit a word in the system prompt textarea — confirm it accepts input
7. Expand "/ full config json" → confirm `closing_message` appears in the JSON
8. Click "save as template" → template name input appears → type "brand discovery — custom" → click "confirm save" → button updates to "✓ will save as template"
9. Click "Create & generate link →" → session created state with copyable link
10. Supabase `vh_goal_configs`: new row with `goal_key` starting with `custom-`, `is_template: true`, your edited system prompt, `closing_message` set
11. Supabase `vh_clients`: new row with `extraction_goal` matching that key, `max_exchanges: 10`
12. Open the respondent link → session loads, Kimba's opener matches what was in the phase 3 opener field
