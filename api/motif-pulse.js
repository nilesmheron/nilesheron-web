// api/motif-pulse.js — how a mixtape was actually listened to.
//
// Replaces an accident. Until now the only way to know whether anyone
// finished a tape was to notice that the nm.h logo sits on the back of every
// card, so `GET /motif/nm-h-logo.png` appeared once per card build, and to
// reconstruct the listen from static-asset timings. That worked once
// (2026-09-13, eighteen tracks recovered to the second) and it is about to
// stop working: the Tape redesign puts bare album art in the grid and renders
// the logo only inside a liner note. The trace disappears with it.
//
// So this records the same thing deliberately, and records it smaller.
//
// WHAT IS SENT: slug, a per-listen random id, a monotonic sequence number,
// seconds since the listen began, the event, and the track index.
//
// WHAT IS NOT SENT, and must never be added: no Apple or Spotify user id, no
// tokens, no email, no IP-derived identity, no track titles, no user agent.
// The listen id is generated in the page, never stored, and dies with the tab
// — two listens from the same person are not linkable, by construction.
//
// PRD §12 lists analytics as a non-goal and that stays true: this answers
// "was the tape finished, and where did people leave" for the curator, not
// "who is this person". It is deliberately too thin to become an analytics
// product, and it should be deleted when it stops earning its place.
//
// Lands in the Vercel runtime log. Read with the Vercel MCP get_runtime_logs
// filtered on MOTIF-PULSE. Nothing is stored anywhere else.

const DEFAULT_ALLOWED_ORIGINS = ['https://dev.nilesheron.com'];

// start · track · complete · leave. Anything else is dropped rather than
// logged, so a future caller cannot quietly widen what this collects.
// 'bounce' = left before choosing a door. 'fail' = playback refused.
// Unknown names are still dropped rather than logged, so the shape cannot be
// widened by a careless caller — but a name the client sends and the server
// discards is a silent hole, which is what these two were.
const EVENTS = new Set(['start', 'track', 'complete', 'leave', 'bounce', 'fail']);
const MAX_BATCH = 40;

function parseList(envValue, fallback) {
  if (!envValue) return fallback;
  return envValue.split(',').map((s) => s.trim()).filter(Boolean);
}

function clean(e) {
  if (!e || typeof e !== 'object') return null;
  if (!EVENTS.has(e.ev)) return null;
  const n = (v, max) => {
    const x = Number(v);
    return Number.isFinite(x) && x >= 0 && x <= max ? Math.round(x) : null;
  };
  return {
    seq: n(e.seq, 100000),
    t: n(e.t, 86400),          // seconds since the listen began
    ev: e.ev,
    i: e.i === undefined || e.i === null ? null : n(e.i, 999),
    svc: e.svc === 'apple' || e.svc === 'spotify' ? e.svc : null,
  };
}

export default async function handler(req, res) {
  const allowed = parseList(process.env.CHAT_ALLOWED_ORIGINS, DEFAULT_ALLOWED_ORIGINS);
  const origin = req.headers.origin;
  if (origin && !allowed.includes(origin)) {
    return res.status(403).json({ error: 'origin not allowed' });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  // sendBeacon posts a Blob; depending on how the content-type survives, the
  // body may arrive unparsed. Accept either rather than dropping the batch
  // that matters — the last one, sent as the listener leaves.
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { body = {}; }
  }
  const { slug, listen, events } = body || {};

  const batch = (Array.isArray(events) ? events : []).slice(0, MAX_BATCH).map(clean).filter(Boolean);
  if (!batch.length) return res.status(204).end();

  const tag = '[MOTIF-PULSE] ';
  console.log(tag + JSON.stringify({
    slug: String(slug || '?').slice(0, 60),
    listen: String(listen || '?').slice(0, 16),
    n: batch.length,
  }));
  batch.forEach((e) => {
    console.log(
      tag + '  ' + String(e.seq).padStart(4, '0') +
      ' ' + String(e.t).padStart(5) + 's ' +
      e.ev.padEnd(8) +
      (e.i === null ? '' : ' track ' + String(e.i + 1).padStart(2)) +
      (e.svc ? ' · ' + e.svc : '')
    );
  });

  return res.status(204).end();
}
