// api/motif-alert.js — the shared back half of Motif error reporting: parse
// the user agent, store the error, and email Niles.
//
// Called by api/motif-report.js for every client report, and by the other
// api/motif-* routes when they fail with a 5xx. Lives in api/ so Vercel
// bundles it with its callers; like motif-tools-guard.js it is therefore also
// a route, and its default export answers 404.
//
// STORED (public.motif_errors, 90 days, pg_cron-enforced): code, severity,
// detail, slug, position, service, the pulse listen id, the user agent and
// its parsed browser/OS/device, and the player's step trace — which can
// include song titles; that is accepted here, while pulse stays title-free.
//
// NEVER STORED OR SENT: Apple or Spotify user ids, tokens, email addresses,
// IP addresses. The request's IP is never read.
//
// Nothing here may throw to the caller or change its response. A storage
// failure is logged and swallowed — it must never surface to a listener.

import errors from '../motif/errors.js';

const TABLE = 'motif_errors';
const HOURLY_ROW_CAP = 500;     // the endpoint is public; past this, log only
const WINDOW_MIN = 15;          // one email per code + slug per 15 minutes
const HOURLY_EMAIL_CAP = 20;    // then one "paused" email, then silence
const PUBLIC_BASE = 'https://dev.nilesheron.com';

/* ── user agent → plain words ──
   Hand-written, no dependency. The target is "Chrome · iPhone · iOS 26.6".
   Order matters: in-app browsers and Chrome/Firefox/Edge on iOS all say
   "Safari" too, so the specific tokens are checked first. */
export function parseUA(ua) {
  const s = String(ua || '');
  let browser = 'Unknown';
  if (/Instagram/.test(s)) browser = 'Instagram';
  else if (/FBAN|FBAV|FB_IAB/.test(s)) browser = 'Facebook';
  else if (/musical_ly|BytedanceWebview|TikTok/.test(s)) browser = 'TikTok';
  else if (/Snapchat/.test(s)) browser = 'Snapchat';
  else if (/LinkedInApp/.test(s)) browser = 'LinkedIn';
  else if (/\bLine\//.test(s)) browser = 'LINE';
  else if (/\bGSA\//.test(s)) browser = 'Google app';
  else if (/EdgiOS|EdgA|Edg\//.test(s)) browser = 'Edge';
  else if (/OPiOS|OPR\//.test(s)) browser = 'Opera';
  else if (/SamsungBrowser/.test(s)) browser = 'Samsung Internet';
  else if (/CriOS/.test(s)) browser = 'Chrome';
  else if (/FxiOS/.test(s)) browser = 'Firefox';
  else if (/Firefox\//.test(s)) browser = 'Firefox';
  else if (/Chrome\//.test(s)) browser = 'Chrome';
  else if (/Version\/[\d.]+.*Safari\//.test(s)) browser = 'Safari';

  let os = 'Unknown';
  let device = 'Unknown';
  const ios = s.match(/(?:iPhone|CPU) OS (\d+)[_.](\d+)/);
  if (/iPhone|iPod/.test(s) || /iPad/.test(s)) {
    device = /iPad/.test(s) ? 'iPad' : 'iPhone';
    let v = ios ? ios[1] + '.' + ios[2] : '';
    /* Safari on iOS 26 froze the OS token at 18_6; its Version/ token carries
       the real release. Trust Version/ when it is 26 or later and the OS
       token is the frozen value. */
    const ver = s.match(/Version\/(\d+)(?:\.(\d+))?/);
    if (ver && Number(ver[1]) >= 26 && v === '18.6') v = ver[1] + '.' + (ver[2] || '0');
    os = (device === 'iPad' ? 'iPadOS' : 'iOS') + (v ? ' ' + v : '');
  } else if (/Android/.test(s)) {
    const a = s.match(/Android (\d+(?:\.\d+)?)/);
    os = 'Android' + (a ? ' ' + a[1] : '');
    device = /Mobile/.test(s) ? 'Android phone' : 'Android tablet';
  } else if (/Macintosh|Mac OS X/.test(s)) {
    // The macOS version in a UA has been frozen at 10_15_7 for years; it says
    // nothing, so it is left off. (An iPad in desktop mode also lands here.)
    os = 'macOS';
    device = 'Mac';
  } else if (/Windows/.test(s)) {
    os = 'Windows';
    device = 'PC';
  } else if (/CrOS/.test(s)) {
    os = 'ChromeOS';
    device = 'Chromebook';
  } else if (/Linux/.test(s)) {
    os = 'Linux';
    device = 'PC';
  }
  return { browser, os, device };
}

function store() {
  const base = process.env.MOTIF_SUPABASE_URL;
  const key = process.env.MOTIF_SUPABASE_SERVICE_KEY;
  if (!base || !key) return null;
  return {
    rest: base.replace(/\/$/, '') + '/rest/v1/' + TABLE,
    headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
  };
}

// Rows in the last hour, via PostgREST's exact count in Content-Range.
async function countSince(db, iso, extra) {
  const r = await fetch(db.rest + '?select=id&created_at=gte.' + encodeURIComponent(iso) + (extra || ''), {
    headers: { ...db.headers, Prefer: 'count=exact', Range: '0-0' },
  });
  if (!r.ok) throw new Error('count ' + r.status);
  const m = String(r.headers.get('content-range') || '').match(/\/(\d+)$/);
  return m ? Number(m[1]) : 0;
}

/* Store one error and alert on it. `rec` is already validated by the
   caller: { source, slug, code, severity, detail, service, track_index,
   side, elapsed_s, attempt, listen_id, trace }, plus `user_agent`.
   Returns the stored row id, or null. Never throws. */
export async function recordError(rec) {
  try {
    const ua = parseUA(rec.user_agent);
    const row = { ...rec, browser: ua.browser, os: ua.os, device: ua.device };
    const db = store();
    if (!db) {
      console.log('[MOTIF-FAIL] store skipped: MOTIF_SUPABASE_URL / MOTIF_SUPABASE_SERVICE_KEY not set');
      return null;
    }
    const hourAgo = new Date(Date.now() - 3600 * 1000).toISOString();
    if ((await countSince(db, hourAgo)) >= HOURLY_ROW_CAP) {
      console.log('[MOTIF-FAIL] store skipped: ' + HOURLY_ROW_CAP + ' rows in the last hour (abuse cap)');
      return null;
    }
    const r = await fetch(db.rest, {
      method: 'POST',
      headers: { ...db.headers, Prefer: 'return=representation' },
      body: JSON.stringify(row),
    });
    if (!r.ok) {
      console.log('[MOTIF-FAIL] store failed: ' + r.status + ' ' + (await r.text()).slice(0, 200));
      return null;
    }
    const out = await r.json();
    const id = (out && out[0] && out[0].id) || null;
    if (id) await alert(db, { ...row, id });
    return id;
  } catch (e) {
    console.log('[MOTIF-FAIL] store error: ' + ((e && e.message) || e));
    return null;
  }
}

/* ============================================================
   ALERT — email via Resend's HTTP API, no SDK.

   One notify() so a second channel (Slack, later) is a small change.
   The throttle lives in the table, not in memory, so it holds across
   function instances:
     · one email per code + slug per 15 minutes; later reports in the window
       bump `suppressed` on the row that got the email, and the next email
       says "N more since the last alert";
     · at most 20 emails an hour; the 21st slot is one "alerts paused" email,
       then nothing until the hour rolls over;
     · severity `test` always sends (smoke tests must be visible) but still
       counts toward the hourly cap.
   ============================================================ */

let warnedNoEmail = false;

function emailConfig() {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.MOTIF_ALERT_TO;
  const from = process.env.MOTIF_ALERT_FROM;
  if (!key || !to || !from) return null;
  return { key, from, to: to.split(',').map((x) => x.trim()).filter(Boolean) };
}

const enc = encodeURIComponent;
const slugFilter = (slug) => (slug ? 'slug=eq.' + enc(slug) : 'slug=is.null');

async function rows(db, query) {
  const r = await fetch(db.rest + '?' + query, { headers: db.headers });
  if (!r.ok) throw new Error('query ' + r.status);
  return r.json();
}

async function markAlerted(db, id) {
  await fetch(db.rest + '?id=eq.' + id, {
    method: 'PATCH',
    headers: { ...db.headers, Prefer: 'return=minimal' },
    body: JSON.stringify({ alerted_at: new Date().toISOString() }),
  });
}

async function suppressInto(db, id) {
  const base = db.rest.replace(/\/rest\/v1\/.*$/, '/rest/v1/rpc/motif_error_suppress');
  await fetch(base, { method: 'POST', headers: db.headers, body: JSON.stringify({ p_id: id }) });
}

async function alert(db, row) {
  try {
    const cfg = emailConfig();
    if (!cfg) {
      if (!warnedNoEmail) {
        warnedNoEmail = true;
        console.log('[MOTIF-FAIL] email skipped: RESEND_API_KEY / MOTIF_ALERT_TO / MOTIF_ALERT_FROM not set');
      }
      return;
    }
    const isTest = row.severity === 'test';
    const now = Date.now();

    // The last alert for this code + slug, at any age: inside the window it
    // absorbs this report; outside it, its folded count goes in this email.
    const prev = (await rows(db, 'select=id,alerted_at,suppressed&code=eq.' + enc(row.code) + '&' +
      slugFilter(row.slug) + '&alerted_at=not.is.null&id=neq.' + row.id + '&order=alerted_at.desc&limit=1'))[0];
    if (!isTest && prev && now - Date.parse(prev.alerted_at) < WINDOW_MIN * 60 * 1000) {
      await suppressInto(db, prev.id);
      return;
    }

    const hourAgo = new Date(now - 3600 * 1000).toISOString();
    const sent = await countSince(db, hourAgo, '&alerted_at=gte.' + enc(hourAgo));
    if (!isTest && sent > HOURLY_EMAIL_CAP) return;          // already paused this hour
    if (!isTest && sent === HOURLY_EMAIL_CAP) {
      const stored = await countSince(db, hourAgo);
      const ok = await notify(cfg, pausedEmail(stored));
      if (ok) await markAlerted(db, row.id);                 // the 21st mark: never again this hour
      return;
    }

    const ok = await notify(cfg, await errorEmail(row, prev ? prev.suppressed : 0));
    if (ok) await markAlerted(db, row.id);
  } catch (e) {
    console.log('[MOTIF-FAIL] alert error: ' + ((e && e.message) || e));
  }
}

/* The one channel today. Returns true when the message was accepted. */
async function notify(cfg, msg) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + cfg.key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: cfg.from, to: cfg.to, subject: msg.subject, text: msg.text }),
  });
  if (!r.ok) {
    console.log('[MOTIF-FAIL] email failed: ' + r.status + ' ' + (await r.text()).slice(0, 200));
    return false;
  }
  return true;
}

// The tape's title, read from its public JSON; the slug if that fails fast.
async function tapeTitle(slug) {
  if (!slug || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)) return null;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 1500);
    const r = await fetch(PUBLIC_BASE + '/motif/data/' + slug + '.json', { signal: ctl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const e = await r.json();
    return e && e.title ? String(e.title).slice(0, 120) : null;
  } catch (_) {
    return null;
  }
}

export async function errorEmail(row, folded) {
  const c = errors.lookup(row.code);
  const title = await tapeTitle(row.slug);
  const tape = title || row.slug || 'no tape';
  const headline = c.headline || row.code;
  const subject = '[Motif · ' + row.severity + '] ' + headline + ' — ' + tape +
    ' · ' + (row.browser || 'Unknown') + ', ' + (row.device || 'Unknown');

  const where = [];
  if (row.side) where.push('side ' + row.side);
  if (row.track_index !== null && row.track_index !== undefined) where.push('song ' + (row.track_index + 1) + ' on the tape');
  if (row.elapsed_s !== null && row.elapsed_s !== undefined) where.push(row.elapsed_s + 's after the page loaded');

  const L = [];
  L.push(c.note || '');
  L.push('');
  L.push('Code:     ' + row.code + (c.known ? '' : ' (not in the catalog)'));
  if (row.detail) L.push('Detail:   ' + row.detail);
  L.push('Tape:     ' + (title ? title + ' (' + row.slug + ')' : (row.slug || '—')));
  if (where.length) L.push('Where:    ' + where.join(' · '));
  L.push('Service:  ' + (row.service || '—'));
  L.push('Browser:  ' + [row.browser, row.os, row.device].filter(Boolean).join(' · '));
  if (row.attempt) L.push('Attempt:  ' + row.attempt + ' on this page load');
  if (folded) L.push('Repeats:  ' + folded + ' more since the last alert');
  L.push('Source:   ' + row.source);
  if (row.trace && row.trace.length) {
    L.push('');
    L.push('Trace:');
    row.trace.forEach((l) => L.push('  ' + l));
  }
  L.push('');
  L.push('Row ' + row.id + ' in public.motif_errors (Supabase project nilesheron).');
  L.push('Vercel log search: MOTIF-FAIL');
  return { subject, text: L.join('\n') };
}

function pausedEmail(stored) {
  return {
    subject: '[Motif] Alerts paused for the hour — ' + stored + ' errors stored',
    text: [
      HOURLY_EMAIL_CAP + ' alert emails went out in the last hour, so the rest are paused until it rolls over.',
      '',
      stored + ' errors were stored in the last hour. Every one is in public.motif_errors (Supabase project nilesheron); nothing is lost.',
      '',
      'Vercel log search: MOTIF-FAIL',
    ].join('\n'),
  };
}

export default function handler(req, res) {
  return res.status(404).json({ error: 'not found' });
}
