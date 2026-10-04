// api/motif-alert.js — the shared back half of Motif error reporting: parse
// the user agent, store the error, and (from the next commit) alert Niles.
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

const TABLE = 'motif_errors';
const HOURLY_ROW_CAP = 500;     // the endpoint is public; past this, log only

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
    return (out && out[0] && out[0].id) || null;
  } catch (e) {
    console.log('[MOTIF-FAIL] store error: ' + ((e && e.message) || e));
    return null;
  }
}

export default function handler(req, res) {
  return res.status(404).json({ error: 'not found' });
}
