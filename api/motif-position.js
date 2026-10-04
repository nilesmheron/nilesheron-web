// api/motif-position.js — where a listener was in a tape, so a reloaded page
// can offer to pick it back up.
//
// Why it exists: iOS discards a backgrounded tab (a phone call is enough) and
// Safari reloads it from scratch. Seen 2026-10-03: six songs in, a call, and
// the listener came back to a fresh splash. The page cannot remember on its
// own — our code stores nothing in the browser (CLAUDE.md) — so it is held
// here, briefly.
//
// THE KEY: `session` is sha256(Music User Token + "|" + slug), computed in the
// page. The raw token never leaves the browser and cannot be recovered from
// the hash. MusicKit restores the token itself after a reload, so the page can
// recompute the key on the splash. A re-authorisation mints a new token, which
// means a new session and a fresh start — accepted (Niles, 2026-10-03).
//
// WHAT IS STORED: the key, the slug, the track index, whether the tape is
// waiting for the flip, a short fingerprint of the tape's song order (so an
// edited tape is not resumed into the wrong song), and two timestamps. No
// titles, no account, no token. Never joined with pulse: the listen id there
// and this key are unrelated by construction.
//
// HOW LONG: 48 hours from the last update. Older rows are invisible to GET and
// deleted on the next write. Finishing the tape or "Start over" deletes the row.
//
//   GET    ?session=&slug=                  → { idx, flip, fp } or 404
//   POST   { session, slug, idx, flip, fp } → upsert
//   DELETE { session, slug }                → remove
//
// Table: public.motif_positions in the Motif Supabase project (RLS on, no
// policies — only this service key reaches it).

const DEFAULT_ALLOWED_ORIGINS = ['https://dev.nilesheron.com'];
const TTL_HOURS = 48;
const TABLE = 'motif_positions';

function parseList(envValue, fallback) {
  if (!envValue) return fallback;
  return envValue.split(',').map((s) => s.trim()).filter(Boolean);
}

const isSession = (v) => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
const isSlug = (v) => typeof v === 'string' && /^[a-z0-9][a-z0-9-]{0,79}$/.test(v);
const isIdx = (v) => Number.isInteger(v) && v >= 0 && v <= 999;
const isFp = (v) => typeof v === 'string' && /^[0-9a-f]{8,32}$/.test(v);

function readBody(req) {
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (_) { b = {}; } }
  return b || {};
}

export default async function handler(req, res) {
  const allowed = parseList(process.env.CHAT_ALLOWED_ORIGINS, DEFAULT_ALLOWED_ORIGINS);
  const origin = req.headers && req.headers.origin;
  if (origin && !allowed.includes(origin)) {
    return res.status(403).json({ error: 'origin not allowed' });
  }

  const base = process.env.MOTIF_SUPABASE_URL;
  const key = process.env.MOTIF_SUPABASE_SERVICE_KEY;
  if (!base || !key) {
    return res.status(503).json({ error: 'MOTIF_SUPABASE_URL / MOTIF_SUPABASE_SERVICE_KEY not configured' });
  }
  const rest = base.replace(/\/$/, '') + '/rest/v1/' + TABLE;
  const headers = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
  const cutoff = () => new Date(Date.now() - TTL_HOURS * 3600 * 1000).toISOString();
  const eq = (v) => 'eq.' + encodeURIComponent(v);

  try {
    if (req.method === 'GET') {
      const { session, slug } = req.query || {};
      if (!isSession(session) || !isSlug(slug)) return res.status(400).json({ error: 'bad request' });
      const r = await fetch(rest + '?select=idx,awaiting_flip,fp&session=' + eq(session) + '&slug=' + eq(slug) +
        '&updated_at=gt.' + encodeURIComponent(cutoff()) + '&limit=1', { headers });
      if (!r.ok) return res.status(502).json({ error: 'store unavailable' });
      const rows = await r.json();
      if (!rows.length) return res.status(404).json({ error: 'no position' });
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ idx: rows[0].idx, flip: rows[0].awaiting_flip, fp: rows[0].fp });
    }

    if (req.method === 'POST') {
      const { session, slug, idx, flip, fp } = readBody(req);
      if (!isSession(session) || !isSlug(slug) || !isIdx(idx) || typeof flip !== 'boolean' || !isFp(fp)) {
        return res.status(400).json({ error: 'bad request' });
      }
      // started_at is left to its default on insert and untouched on update:
      // merge-duplicates only writes the columns sent.
      const r = await fetch(rest + '?on_conflict=session,slug', {
        method: 'POST',
        headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ session, slug, idx, awaiting_flip: flip, fp, updated_at: new Date().toISOString() }),
      });
      if (!r.ok) return res.status(502).json({ error: 'store unavailable' });
      // Keep the 48-hour promise without a scheduler: every write sweeps.
      // Awaited — a serverless function may be frozen the moment it responds.
      await fetch(rest + '?updated_at=lt.' + encodeURIComponent(cutoff()), { method: 'DELETE', headers })
        .catch(() => {});
      return res.status(204).end();
    }

    if (req.method === 'DELETE') {
      const { session, slug } = readBody(req);
      if (!isSession(session) || !isSlug(slug)) return res.status(400).json({ error: 'bad request' });
      const r = await fetch(rest + '?session=' + eq(session) + '&slug=' + eq(slug), { method: 'DELETE', headers });
      if (!r.ok) return res.status(502).json({ error: 'store unavailable' });
      return res.status(204).end();
    }

    return res.status(405).json({ error: 'GET, POST or DELETE' });
  } catch (_) {
    return res.status(502).json({ error: 'store unavailable' });
  }
}
