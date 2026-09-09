// api/motif-resolve.js — resolve "Title — Artist" lines to Spotify track URIs
//
// Exists because Spotify refuses playlist contents to this app: GET
// /playlists/{id}/tracks and GET /v1/tracks?ids= both return 403, while
// /v1/search and /v1/tracks/{id} still work. There is therefore no ingest
// path for a playlist — tracks[] can only be built by resolving titles.
//
// Returns CANDIDATES, never a single answer. Search matching is not exact:
// "Fire / SiR" resolves to Jordan St. Cyr's "Fires" on an obvious query and
// needs an album-scoped search to find the right track. A resolver that
// silently takes the top hit will put wrong songs into entries.
//
// Consumer: motif/tools/build.html (Basic Auth gated via middleware.js).
//
// Uses the client-credentials grant — no user context needed for catalog
// search, and the client secret stays server-side.

const DEFAULT_ALLOWED_ORIGINS = ['https://dev.nilesheron.com'];
const MAX_LINES = 40;
const CANDIDATES_PER_LINE = 5;

const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SEARCH_URL = 'https://api.spotify.com/v1/search';

// Cached across warm invocations so a 30-line resolve is one token call.
let cachedToken = { value: null, expiresAt: 0 };

function parseList(envValue, fallback) {
  if (!envValue) return fallback;
  return envValue.split(',').map((s) => s.trim()).filter(Boolean);
}

async function appToken() {
  if (cachedToken.value && Date.now() < cachedToken.expiresAt - 30000) {
    return cachedToken.value;
  }
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' }),
  });
  if (!r.ok) throw new Error('token ' + r.status);
  const d = await r.json();
  cachedToken = {
    value: d.access_token,
    expiresAt: Date.now() + (d.expires_in || 3600) * 1000,
  };
  return cachedToken.value;
}

// "Title — Artist" is the documented form. Accepts em dash, en dash, or a
// spaced hyphen, and tolerates a leading list number.
function splitLine(raw) {
  const line = raw.replace(/^\s*\d+[.)]\s*/, '').trim();
  const m = line.split(/\s+[—–]\s+|\s+-\s+/);
  if (m.length >= 2) {
    return { title: m[0].trim(), artist: m.slice(1).join(' - ').trim() };
  }
  return { title: line, artist: '' };
}

function queriesFor(title, artist) {
  if (!artist) return [title];
  return [
    `track:"${title}" artist:"${artist}"`,
    `artist:${artist} track:${title}`,
    `${title} ${artist}`,
    // last resort: the reverse reading, in case the line was "Artist — Title"
    `track:"${artist}" artist:"${title}"`,
  ];
}

async function search(token, q) {
  const url = `${SEARCH_URL}?${new URLSearchParams({ q, type: 'track', limit: '5' })}`;
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) return [];
  const d = await r.json();
  return (d.tracks && d.tracks.items) || [];
}

function shape(t) {
  const art = (t.album && t.album.images) || [];
  return {
    uri: t.uri,
    id: t.id,
    title: t.name,
    artist: t.artists.map((a) => a.name).join(', '),
    album: (t.album && t.album.name) || '',
    duration_ms: t.duration_ms,
    art: art.length ? art[art.length - 1].url : null,
  };
}

// Rough confidence, used only to order candidates and flag weak matches in the
// UI. Never used to auto-select.
function score(cand, title, artist) {
  const ct = cand.title.toLowerCase();
  const ca = cand.artist.toLowerCase();
  const wt = title.toLowerCase();
  const wa = artist.toLowerCase();
  let s = 0;
  if (ct === wt) s += 3;
  else if (ct.includes(wt) || wt.includes(ct)) s += 1;
  if (wa && ca.includes(wa)) s += 3;
  else if (wa && wa.split(/\s+/).some((w) => w.length > 2 && ca.includes(w))) s += 1;
  return s;
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
  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
    return res.status(503).json({ error: 'Spotify credentials not configured' });
  }

  const lines = (req.body && req.body.lines) || [];
  if (!Array.isArray(lines) || !lines.length) {
    return res.status(400).json({ error: 'lines[] required' });
  }
  if (lines.length > MAX_LINES) {
    return res.status(400).json({ error: `at most ${MAX_LINES} lines per request` });
  }

  let token;
  try {
    token = await appToken();
  } catch (e) {
    return res.status(502).json({ error: 'spotify auth failed: ' + e.message });
  }

  const results = [];
  for (const raw of lines) {
    if (!String(raw).trim()) continue;
    const { title, artist } = splitLine(String(raw));
    const byUri = new Map();

    for (const q of queriesFor(title, artist)) {
      let items = [];
      try {
        items = await search(token, q);
      } catch (_) {
        // one bad query should not sink the line
      }
      for (const t of items) {
        if (!byUri.has(t.uri)) byUri.set(t.uri, shape(t));
      }
      // Stop early once we have a confident match plus alternatives to show.
      const best = [...byUri.values()].some((c) => score(c, title, artist) >= 6);
      if (best && byUri.size >= 3) break;
    }

    const candidates = [...byUri.values()]
      .map((c) => ({ ...c, score: score(c, title, artist) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, CANDIDATES_PER_LINE);

    results.push({
      line: String(raw).trim(),
      parsed: { title, artist },
      confident: candidates.length > 0 && candidates[0].score >= 6,
      candidates,
    });
  }

  return res.status(200).json({ results });
}
