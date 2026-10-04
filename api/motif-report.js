// api/motif-report.js — receives every error a Motif listener hits, from a
// subscription problem to an unknown crash, stores it for 90 days, and alerts
// Niles. Spec: docs/specs/2026-10-03-motif-error-alerts.md.
//
// This used to write to the Vercel runtime log only, and the header said
// "nothing is stored". That was reversed on 2026-10-03: on the Hobby plan the
// log is searchable for a few days at most, which left no history. Rows now
// live in public.motif_errors for 90 days (see api/motif-alert.js for exactly
// what is and is never stored, and CLAUDE.md for the decision).
//
// The runtime log line stays ([MOTIF-FAIL]) — it is still the fastest place
// to look.
//
// Payload: { slug, code, detail, listen, service, idx, side, elapsed,
// attempt, diag }. Codes resolve against motif/errors.js — the same file the
// player loads. A code not in it is stored as unknown / bug with the original
// kept in detail, never dropped. The old { slug, reason, diag } shape is still
// accepted, because cached pages will keep sending it for a while.
//
// Always 204 for a well-formed request: a storage or email failure is logged
// and swallowed, and must never surface to the listener.

import errors from '../motif/errors.js';
import { recordError } from './motif-alert.js';

const DEFAULT_ALLOWED_ORIGINS = ['https://dev.nilesheron.com'];
const MAX_LINES = 60;
const MAX_LINE = 300;

function parseList(envValue, fallback) {
  if (!envValue) return fallback;
  return envValue.split(',').map((s) => s.trim()).filter(Boolean);
}

// Belt and braces: the client is not supposed to send anything secret, but a
// trace line should never carry one even if the player changes later.
function scrub(line) {
  return String(line)
    .slice(0, MAX_LINE)
    .replace(/(access_token|refresh_token|Bearer)\s*[:=]?\s*\S+/gi, '$1 [redacted]')
    // A bare "token" only when it is assigned — "developer token ok" is a
    // trace line, not a secret.
    .replace(/(media-user-token|musicUserToken|token)\s*[:=]\s*\S+/gi, '$1 [redacted]');
}

const str = (v, max) => (v === undefined || v === null ? null : String(v).slice(0, max));
const int = (v, lo, hi) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n) : null;
};

export default async function handler(req, res) {
  const allowed = parseList(process.env.CHAT_ALLOWED_ORIGINS, DEFAULT_ALLOWED_ORIGINS);
  const origin = req.headers.origin;
  if (origin && !allowed.includes(origin)) {
    return res.status(403).json({ error: 'origin not allowed' });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  // sendBeacon posts a Blob; the body may arrive unparsed.
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { body = {}; }
  }
  body = body || {};

  // The old shape had `reason` and no `code`.
  const rawCode = body.code !== undefined ? String(body.code).slice(0, 60) : null;
  const rawDetail = body.code !== undefined ? body.detail : body.reason;
  const entry = errors.lookup(rawCode);
  let detail = scrub(rawDetail == null ? '' : rawDetail).slice(0, 500);
  if (!entry.known) detail = ((rawCode ? rawCode + ': ' : '') + detail).slice(0, 500);

  const lines = Array.isArray(body.diag) ? body.diag.slice(0, MAX_LINES).map(scrub) : [];
  const service = body.service === 'apple' || body.service === 'spotify' ? body.service : null;

  const rec = {
    source: 'client',
    slug: str(body.slug, 80),
    code: entry.code,
    severity: entry.severity,
    detail: detail || null,
    service,
    track_index: int(body.idx, 0, 999),
    side: str(body.side, 4),
    elapsed_s: int(body.elapsed, 0, 86400 * 2),
    attempt: int(body.attempt, 0, 99),
    listen_id: body.listen ? String(body.listen).replace(/[^a-z0-9]/gi, '').slice(0, 16) : null,
    user_agent: str(req.headers['user-agent'], 400),
    trace: lines,
  };

  console.log('[MOTIF-FAIL] ' + JSON.stringify({
    slug: rec.slug, code: rec.code, severity: rec.severity, detail: rec.detail, idx: rec.track_index, lines: lines.length,
  }));
  lines.forEach((l) => console.log('[MOTIF-FAIL]   ' + l));

  await recordError(rec);
  return res.status(204).end();
}
