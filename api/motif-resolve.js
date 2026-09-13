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

import { appleDeveloperToken, MISSING_ENV as APPLE_MISSING_ENV } from './motif-apple-token.js';

const DEFAULT_ALLOWED_ORIGINS = ['https://dev.nilesheron.com'];
const MAX_LINES = 40;
const CANDIDATES_PER_LINE = 5;

// Apple catalog IDs are looked up per storefront. 'us' is the only one Phase 1
// authors against; a listener in another storefront may find a given id
// unavailable, which is a Phase 2 problem and noted in the session note.
const APPLE_STOREFRONT = 'us';
const APPLE_SEARCH = 'https://api.music.apple.com/v1/catalog/' + APPLE_STOREFRONT + '/search';
const APPLE_SONGS = 'https://api.music.apple.com/v1/catalog/' + APPLE_STOREFRONT + '/songs';
// Apple enforces the developer token's origin claim on server-side calls too,
// so this header is not optional. Verified 2026-09-13: without it, bare 401.
const APPLE_ORIGIN = 'https://dev.nilesheron.com';
// Two different masters of the same song rarely land within a second of each
// other; two encodings of the same master almost always do.
const DURATION_TOLERANCE_MS = 2500;

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

// A line may be a Spotify link, URI, or bare track id instead of a title. That
// is the escape hatch for songs search keeps getting wrong: grab the link from
// the Spotify app and paste it, and there is nothing left to guess.
function trackIdFrom(raw) {
  const s = String(raw).trim();
  let m = s.match(/^spotify:track:([A-Za-z0-9]{22})$/);
  if (m) return m[1];
  m = s.match(/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?track\/([A-Za-z0-9]{22})/);
  if (m) return m[1];
  m = s.match(/^([A-Za-z0-9]{22})$/);
  if (m) return m[1];
  return null;
}

async function lookupTrack(token, id) {
  const r = await fetch('https://api.spotify.com/v1/tracks/' + id, {
    headers: { Authorization: 'Bearer ' + token },
  });
  if (!r.ok) return null;
  return r.json();
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
  const date = (t.album && t.album.release_date) || '';
  return {
    uri: t.uri,
    id: t.id,
    title: t.name,
    artist: t.artists.map((a) => a.name).join(', '),
    album: (t.album && t.album.name) || '',
    duration_ms: t.duration_ms,
    // Full-size art for the card front, thumbnail for the picker.
    art: art.length ? art[0].url : null,
    thumb: art.length ? art[art.length - 1].url : null,
    // The distinctions that separate near-identical results: explicit vs clean,
    // original vs reissue, and which pressing Spotify considers canonical.
    explicit: Boolean(t.explicit),
    year: date ? date.slice(0, 4) : '',
    popularity: typeof t.popularity === 'number' ? t.popularity : null,
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

/* ============================================================
   APPLE MUSIC

   Deliberately NOT a second copy of the Spotify path. By the time this runs
   the curator has already picked an exact Spotify track, so we are not
   guessing at "Title — Artist" any more, we are finding the same recording in
   another catalogue. That is a much stronger problem: title, artist and
   duration together identify a master almost uniquely.

   It matters because bare search is bad. The MusicKit spike searched five
   terms and got two wrong — 'Reign Tobe Nwigwe' came back as AMBER FREESTYLE,
   'Rain Tobe Nwigwe' as EAT. Anything that takes the top hit on a loose query
   will put wrong songs into entries, which is the same lesson the Spotify
   resolver above already carries.
   ============================================================ */

// music.apple.com/us/album/<name>/<albumId>?i=<songId> is what the share sheet
// gives you; the song id is the `i` param, not the path id. A /song/ URL puts
// it in the path instead. Both, plus a bare numeric id, are the escape hatch
// for anything matching gets wrong.
function appleIdFrom(raw) {
  const s = String(raw).trim();
  let m = s.match(/[?&]i=(\d+)/);
  if (m) return m[1];
  m = s.match(/music\.apple\.com\/[^/]+\/song\/[^/]+\/(\d+)/);
  if (m) return m[1];
  m = s.match(/^(\d{6,})$/);
  if (m) return m[1];
  return null;
}

async function appleFetch(url, token) {
  const r = await fetch(url, {
    headers: { Authorization: 'Bearer ' + token, Origin: APPLE_ORIGIN },
  });
  if (!r.ok) return null;
  return r.json();
}

function shapeApple(song) {
  const a = song.attributes || {};
  const artUrl = (size) =>
    a.artwork && a.artwork.url ? a.artwork.url.replace('{w}', size).replace('{h}', size) : null;
  return {
    apple_id: song.id,
    title: a.name || '',
    artist: a.artistName || '',
    album: a.albumName || '',
    duration_ms: a.durationInMillis || 0,
    art: artUrl(1000),
    thumb: artUrl(120),
    explicit: (a.contentRating || '') === 'explicit',
    year: (a.releaseDate || '').slice(0, 4),
  };
}

function norm(s) {
  return String(s || '')
    .toLowerCase()
    // "(feat. X)", "- Remastered 2011", "[Live]" are the usual reasons two
    // catalogues disagree about a title for the same recording.
    .replace(/\((feat|ft)\.?[^)]*\)/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s+-\s+.*$/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Scored out of 10 so the threshold reads plainly. Duration is weighted
// heaviest because it is the only field that describes the recording rather
// than how someone chose to label it.
function scoreApple(cand, want) {
  let s = 0;
  const ct = norm(cand.title);
  const wt = norm(want.title);
  if (ct === wt) s += 4;
  else if (ct && wt && (ct.includes(wt) || wt.includes(ct))) s += 2;

  const ca = norm(cand.artist);
  const wa = norm(want.artist);
  if (ca === wa) s += 3;
  else if (ca && wa && (ca.includes(wa) || wa.includes(ca))) s += 2;
  else if (wa && wa.split(' ').some((w) => w.length > 2 && ca.includes(w))) s += 1;

  if (want.duration_ms && cand.duration_ms) {
    const d = Math.abs(cand.duration_ms - want.duration_ms);
    if (d <= DURATION_TOLERANCE_MS) s += 3;
    else if (d <= 15000) s += 1;
    else s -= 2; // a different length is a different recording
  }
  return s;
}

async function resolveAppleOne(token, want) {
  // An explicit link wins outright — nothing left to guess.
  const direct = appleIdFrom(want.link || '');
  if (direct) {
    const d = await appleFetch(APPLE_SONGS + '/' + direct, token);
    const song = d && d.data && d.data[0];
    return {
      want,
      direct: true,
      confident: Boolean(song),
      candidates: song ? [{ ...shapeApple(song), score: 10 }] : [],
    };
  }

  const terms = [
    `${want.title} ${want.artist}`,
    want.album ? `${want.title} ${want.artist} ${want.album}` : null,
    want.title,
  ].filter(Boolean);

  const byId = new Map();
  for (const term of terms) {
    const url = `${APPLE_SEARCH}?${new URLSearchParams({ types: 'songs', limit: '10', term })}`;
    const d = await appleFetch(url, token);
    const hits = (d && d.results && d.results.songs && d.results.songs.data) || [];
    for (const song of hits) {
      if (!byId.has(song.id)) byId.set(song.id, shapeApple(song));
    }
    // Stop as soon as something clears the bar; extra queries only add noise.
    if ([...byId.values()].some((c) => scoreApple(c, want) >= 9)) break;
  }

  const candidates = [...byId.values()]
    .map((c) => ({ ...c, score: scoreApple(c, want) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, CANDIDATES_PER_LINE);

  return {
    want,
    direct: false,
    // 9 of 10 means title, artist and duration all agree. Anything less goes
    // to the curator rather than into an entry.
    confident: candidates.length > 0 && candidates[0].score >= 9,
    candidates,
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

  /* Apple branch. Keyed on a distinct body field rather than a mode flag so
     the existing builder call — { lines: [...] } — reaches the Spotify path
     byte for byte and cannot regress. */
  const appleWants = (req.body && req.body.apple) || null;
  if (Array.isArray(appleWants)) {
    const missing = APPLE_MISSING_ENV();
    if (missing.length) {
      return res.status(503).json({ error: 'Apple credentials not configured: ' + missing.join(', ') });
    }
    if (!appleWants.length) {
      return res.status(400).json({ error: 'apple[] was empty' });
    }
    if (appleWants.length > MAX_LINES) {
      return res.status(400).json({ error: `at most ${MAX_LINES} tracks per request` });
    }

    let token;
    try {
      token = appleDeveloperToken().token;
    } catch (e) {
      return res.status(502).json({ error: 'apple token failed: ' + e.message });
    }

    const results = [];
    for (const w of appleWants) {
      const want = {
        title: String((w && w.title) || '').slice(0, 200),
        artist: String((w && w.artist) || '').slice(0, 200),
        album: String((w && w.album) || '').slice(0, 200),
        duration_ms: Number((w && w.duration_ms) || 0) || 0,
        link: String((w && w.link) || '').slice(0, 400),
        id: (w && w.id) || null,
      };
      if (!want.title && !want.link) {
        results.push({ want, direct: false, confident: false, candidates: [] });
        continue;
      }
      try {
        results.push(await resolveAppleOne(token, want));
      } catch (e) {
        // One bad lookup must not sink a 20-track resolve.
        results.push({ want, direct: false, confident: false, candidates: [], error: e.message });
      }
    }
    return res.status(200).json({ service: 'apple', results });
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

    // Direct link / URI / id — exact, no guessing.
    const directId = trackIdFrom(raw);
    if (directId) {
      const t = await lookupTrack(token, directId);
      results.push({
        line: String(raw).trim(),
        parsed: { title: t ? t.name : directId, artist: t ? t.artists.map((a) => a.name).join(', ') : '' },
        confident: Boolean(t),
        direct: true,
        candidates: t ? [{ ...shape(t), score: 10 }] : [],
      });
      continue;
    }

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
