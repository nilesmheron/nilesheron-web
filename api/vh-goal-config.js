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
          `/vh_goal_configs?goal_key=eq.${encodeURIComponent(goal)}&select=goal_key,name,intake_system_prompt,opener_message,attachment_url,attachment_prompt,attachment_mode,attachment_type,mode,form_schema`
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

    const { goal_key, name, intake_system_prompt, opener_message, analysis_system_prompt, scoring_dimensions, closing_message, is_template, attachment_url, attachment_prompt, attachment_mode, attachment_type, mode, form_schema } = req.body || {};

    const isForm = mode === 'form';
    if (!goal_key || !name || (!isForm && !intake_system_prompt) || (!isForm && !opener_message) || !analysis_system_prompt) {
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
          closing_message:   closing_message   || null,
          is_template:       !!is_template,
          attachment_url:    attachment_url    || null,
          attachment_prompt: attachment_prompt || null,
          attachment_mode:   attachment_mode   || null,
          attachment_type:   attachment_type   || null,
          mode:              mode              || 'interview',
          form_schema:       form_schema       || null,
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
