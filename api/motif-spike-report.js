// api/motif-spike-report.js — continuous step trace from the MusicKit spike.
//
// THROWAWAY. Delete with motif/spike/ and the other spike endpoints once the
// platform decision is recorded.
//
// Deliberately NOT api/motif-report.js. That one serves the live player, fires
// only on playback failure, caps at 60 lines and is read by the listener never
// knowing it exists. This one is the opposite on every axis: it ships every
// step of a spike run, success or failure, from a page only Niles opens.
// Keeping them separate means the player's telemetry posture is not quietly
// widened to serve a debugging session, and this file disappears when the
// spike does.
//
// Why a server-side trace at all, when the page already logs to screen: the
// run that matters happens with the phone LOCKED. Nobody is reading the page
// then, and asking the tester to reconstruct a fail state afterwards makes
// them the diagnostician instead of the listener. The trace lands in the
// Vercel runtime log, read with the Vercel MCP get_runtime_logs filtered on
// MK-SPIKE. Nothing is stored.
//
// Sequence numbers are load-bearing. The client stamps every line with a
// monotonic seq before it tries to send. A gap in the received sequence is not
// noise, it is the measurement: it says iOS suspended us between those two
// lines. A trace that silently renumbered on retry would destroy the only
// direct evidence of JS suspension we can get.

const DEFAULT_ALLOWED_ORIGINS = ['https://dev.nilesheron.com'];
const MAX_LINES = 200;
const MAX_LINE = 400;

function parseList(envValue, fallback) {
  if (!envValue) return fallback;
  return envValue.split(',').map((s) => s.trim()).filter(Boolean);
}

// The spike handles a developer token and a Music User Token. Neither should
// ever reach a trace line, but scrub anyway — a debugging endpoint is exactly
// where that assumption goes stale.
function scrub(line) {
  return String(line)
    .slice(0, MAX_LINE)
    .replace(/(access_token|refresh_token|developerToken|musicUserToken|Bearer)\s*[:=]?\s*\S+/gi, '$1 [redacted]')
    .replace(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[jwt redacted]');
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

  // sendBeacon posts a Blob, which Vercel may hand over unparsed depending on
  // how the content-type survives. Accept either shape rather than dropping
  // the one batch that matters.
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { body = {}; }
  }
  const { run, mode, phase, lines } = body || {};

  const batch = Array.isArray(lines) ? lines.slice(0, MAX_LINES) : [];
  const tag = '[MK-SPIKE] ';

  console.log(
    tag + JSON.stringify({
      run: String(run || '?').slice(0, 24),
      mode: String(mode || '?').slice(0, 16),
      phase: String(phase || '?').slice(0, 24),
      lines: batch.length,
      seqFirst: batch.length ? batch[0].seq : null,
      seqLast: batch.length ? batch[batch.length - 1].seq : null,
    })
  );

  batch.forEach((l) => {
    const seq = String(l && l.seq !== undefined ? l.seq : '?').padStart(4, '0');
    const vis = String((l && l.vis) || '?').slice(0, 9);
    const t = String((l && l.t) || '?').slice(0, 8);
    console.log(tag + '  ' + seq + ' ' + t + ' ' + vis.padEnd(9) + ' ' + scrub((l && l.m) || ''));
  });

  return res.status(204).end();
}
