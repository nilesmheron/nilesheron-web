// api/chat.js — proxy to Anthropic Messages API
//
// Hardened with three cost-attack defenses:
//   1. Origin allow-list (env: CHAT_ALLOWED_ORIGINS, comma-separated)
//   2. Model allow-list (env: CHAT_ALLOWED_MODELS, comma-separated)
//   3. max_tokens ceiling (env: CHAT_MAX_TOKENS, integer)
//
// All three have sensible defaults if env vars are missing, so this ships
// safely without a Vercel dashboard change. Tune via env vars when ready.
//
// Known consumers (keep in sync with CHAT_ALLOWED_ORIGINS in Vercel):
//   - https://dev.nilesheron.com            (sandbox/personal-ai-os)
//   - https://tasks.nilesheron.com          (task dashboard chat windows)
//   - https://niles-task-dashboard.vercel.app (task dashboard preview URL)

const DEFAULT_ALLOWED_ORIGINS = [
  'https://dev.nilesheron.com',
  'https://tasks.nilesheron.com',
  'https://niles-task-dashboard.vercel.app',
];

const DEFAULT_ALLOWED_MODELS = [
  'claude-haiku-4-5',
  'claude-sonnet-4-6',
];

const DEFAULT_MAX_TOKENS = 2048;

function parseList(envValue, fallback) {
  if (!envValue) return fallback;
  return envValue
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function getRequestOrigin(req) {
  const origin = req.headers.origin;
  if (origin) return origin;

  // Fall back to Referer for same-origin requests (some browsers omit Origin on same-origin fetch)
  const referer = req.headers.referer;
  if (!referer) return null;
  try {
    const url = new URL(referer);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  const allowedOrigins = parseList(process.env.CHAT_ALLOWED_ORIGINS, DEFAULT_ALLOWED_ORIGINS);
  const allowedModels = parseList(process.env.CHAT_ALLOWED_MODELS, DEFAULT_ALLOWED_MODELS);
  const maxTokensCeiling = parseInt(process.env.CHAT_MAX_TOKENS, 10) || DEFAULT_MAX_TOKENS;

  const requestOrigin = getRequestOrigin(req);
  const originAllowed = requestOrigin && allowedOrigins.includes(requestOrigin);

  // CORS preflight — must also be origin-gated
  if (req.method === 'OPTIONS') {
    if (!originAllowed) {
      return res.status(403).json({ error: 'Origin not allowed' });
    }
    res.setHeader('Access-Control-Allow-Origin', requestOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Origin gate — rejects curl, other sites, and spoofed browser clients that forget the header
  if (!originAllowed) {
    return res.status(403).json({
      error: 'Origin not allowed',
      origin: requestOrigin || 'none',
    });
  }

  // Echo CORS header so the browser actually accepts the response
  res.setHeader('Access-Control-Allow-Origin', requestOrigin);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  // Payload validation
  const body = req.body || {};
  const { model, max_tokens } = body;

  if (!model) {
    return res.status(400).json({ error: 'model is required' });
  }

  if (!allowedModels.includes(model)) {
    return res.status(403).json({
      error: 'Model not allowed',
      requested: model,
      allowed: allowedModels,
    });
  }

  // Clamp max_tokens to ceiling — don't reject, just cap
  const requestedTokens = typeof max_tokens === 'number' ? max_tokens : maxTokensCeiling;
  const clampedTokens = Math.min(requestedTokens, maxTokensCeiling);

  const upstreamBody = {
    ...body,
    max_tokens: clampedTokens,
  };

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(upstreamBody),
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
