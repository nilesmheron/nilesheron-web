// api/motif-resolve.js — turn a list of songs into tracks[] for a Motif entry
//
// APPLE IS PRIMARY. That is the product decision made 2026-09-11 (Apple is the
// front door, Spotify the side door, capped at five listeners) finally showing
// up in the tooling. A curator building a mixtape is choosing songs, not
// choosing Spotify songs and then also finding them on Apple.
//
// Three jobs, keyed on which body field is present:
//
//   { lines: [...] }    "Title — Artist" per line → Apple candidates.
//   { spotify: [...] }  a chosen song → the matching Spotify track.
//   { playlist: url }   an Apple playlist link → its tracks, exactly.
//
// Why the asymmetry between the two services:
//
// Apple will hand us a playlist's contents for a plain developer token, so an
// Apple playlist imports exactly with nothing to guess. Spotify refuses —
// GET /playlists/{id}/tracks returns 403 for this app on a public playlist,
// for its owner, with every scope, because of their tightened API policy for
// new apps. Confirmed 2026-09-03 and unchanged. So there is no Spotify import
// and there never will be on these credentials.
//
// Search returns CANDIDATES, never a single answer. Measured 2026-09-13: bare
// Apple search agrees with duration-verified truth 18 times out of 18 when the
// line names a real song by a real artist, and goes confidently wrong when it
// does not — "Rain / Tobe Nwigwe", a song that does not exist, comes back as
// "HEAD SHOTS". A resolver that silently takes the top hit will put wrong
// songs in front of listeners.
//
// Spotify is matched FROM the chosen Apple track rather than from the line,
// because by then the recording is settled and title + artist + duration
// identify it almost uniquely. Same technique in the other direction scored
// 18/18 at +0s drift on the real mixtape.
//
// Consumer: motif/tools/build.html (Basic Auth gated via middleware.js).

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

   Two entry points, and the difference between them is the whole design.

   appleFromLine() guesses from "Title — Artist" and is the primary path. It
   has a title and an artist and nothing else, so it holds a lower bar and the
   curator always confirms.

   resolveAppleOne() matches a recording that is already settled — used when a
   line was a pasted Spotify link, and by the Spotify direction in reverse. It
   also has duration, which identifies a master almost uniquely, so it can hold
   a much higher bar and be trusted without a human.

   Neither auto-selects below its bar. 'Rain / Tobe Nwigwe' is not a real song
   and Apple answers 'HEAD SHOTS' with no hesitation at all; anything that
   takes the top hit regardless puts that in front of a listener.
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

/* ---------- line → Apple ----------
   No duration to lean on here, unlike matching from a chosen track, so the bar
   is title plus artist and the curator still confirms. */
function scoreAppleLine(cand, title, artist) {
  let s = 0;
  const ct = norm(cand.title);
  const wt = norm(title);
  if (ct === wt) s += 4;
  else if (ct && wt && (ct.includes(wt) || wt.includes(ct))) s += 2;

  const ca = norm(cand.artist);
  const wa = norm(artist);
  if (!wa) return s; // artist-less line can never be confident
  if (ca === wa) s += 3;
  else if (ca.includes(wa) || wa.includes(ca)) s += 2;
  else if (wa.split(' ').some((w) => w.length > 2 && ca.includes(w))) s += 1;
  return s;
}

async function appleFromLine(token, raw, spotifyToken) {
  const line = String(raw).trim();

  // An Apple link is exact. Nothing to guess.
  const appleId = appleIdFrom(line);
  if (appleId) {
    const d = await appleFetch(APPLE_SONGS + '/' + appleId, token);
    const song = d && d.data && d.data[0];
    return {
      line,
      parsed: { title: song ? song.attributes.name : appleId, artist: song ? song.attributes.artistName : '' },
      direct: true,
      confident: Boolean(song),
      candidates: song ? [{ ...shapeApple(song), score: 10 }] : [],
    };
  }

  // A Spotify link is also exact, but on the wrong service. Look it up there,
  // then find the same recording on Apple — the curator pasted it because
  // search was getting the song wrong, so honour that.
  const spotId = trackIdFrom(line);
  if (spotId && spotifyToken) {
    const t = await lookupTrack(spotifyToken, spotId);
    if (t) {
      const want = {
        title: t.name,
        artist: t.artists.map((a) => a.name).join(', '),
        album: (t.album && t.album.name) || '',
        duration_ms: t.duration_ms,
      };
      const m = await resolveAppleOne(token, want);
      return { line, parsed: { title: want.title, artist: want.artist }, direct: true,
               confident: m.confident, candidates: m.candidates, viaSpotify: true };
    }
  }

  const { title, artist } = splitLine(line);
  const terms = [artist ? `${title} ${artist}` : title, title].filter(
    (v, i, a) => v && a.indexOf(v) === i
  );

  const byId = new Map();
  for (const term of terms) {
    const url = `${APPLE_SEARCH}?${new URLSearchParams({ types: 'songs', limit: '10', term })}`;
    const d = await appleFetch(url, token);
    const hits = (d && d.results && d.results.songs && d.results.songs.data) || [];
    for (const song of hits) {
      if (!byId.has(song.id)) byId.set(song.id, shapeApple(song));
    }
    if ([...byId.values()].some((c) => scoreAppleLine(c, title, artist) >= 7)) break;
  }

  const candidates = [...byId.values()]
    .map((c) => ({ ...c, score: scoreAppleLine(c, title, artist) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, CANDIDATES_PER_LINE);

  return {
    line,
    parsed: { title, artist },
    direct: false,
    confident: candidates.length > 0 && candidates[0].score >= 6,
    candidates,
  };
}

/* ---------- Apple playlist import ----------
   The thing Spotify will not do. Paginates, because a real mixtape source
   playlist is routinely longer than one page. */
function applePlaylistIdFrom(raw) {
  const s = String(raw).trim();
  const m = s.match(/playlist\/[^/]+\/(pl\.[A-Za-z0-9-]+)/) || s.match(/^(pl\.[A-Za-z0-9-]+)$/);
  return m ? m[1] : null;
}

async function importApplePlaylist(token, url) {
  const id = applePlaylistIdFrom(url);
  if (!id) {
    return { error: 'That does not look like an Apple Music playlist link. Expected something containing pl.…' };
  }

  const meta = await appleFetch(`${APPLE_SONGS.replace('/songs', '/playlists')}/${id}`, token);
  const pl = meta && meta.data && meta.data[0];
  if (!pl) {
    return {
      error: 'Apple would not return that playlist. Personal library playlists are ' +
             'only readable with the owner signed in; a shared or catalogue playlist should work.',
    };
  }

  const tracks = [];
  let next = `${APPLE_SONGS.replace('/songs', '/playlists')}/${id}/tracks?limit=100`;
  // Hard stop so a pathological response cannot loop forever.
  for (let page = 0; next && page < 20; page++) {
    const d = await appleFetch(next, token);
    if (!d || !d.data) break;
    for (const song of d.data) {
      if (song.type === 'songs') tracks.push(shapeApple(song));
    }
    next = d.next ? 'https://api.music.apple.com' + d.next + '&limit=100' : null;
  }

  return {
    playlist: {
      id,
      name: (pl.attributes && pl.attributes.name) || '',
      curator: (pl.attributes && pl.attributes.curatorName) || '',
      url: (pl.attributes && pl.attributes.url) || '',
    },
    tracks,
  };
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

/* ---------- chosen song → Spotify ----------
   The mirror of resolveAppleOne. Runs after the curator has settled on an
   Apple track, so it matches a known recording rather than guessing at a
   line, and duration does most of the work. */
function scoreSpotifyMatch(cand, want) {
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
    else s -= 2;
  }
  return s;
}

async function resolveSpotifyOne(token, want) {
  const direct = trackIdFrom(want.link || '');
  if (direct) {
    const t = await lookupTrack(token, direct);
    return { want, direct: true, confident: Boolean(t),
             candidates: t ? [{ ...shape(t), score: 10 }] : [] };
  }

  const byUri = new Map();
  for (const q of queriesFor(want.title, want.artist)) {
    let items = [];
    try { items = await search(token, q); } catch (_) { /* one bad query is not fatal */ }
    for (const t of items) if (!byUri.has(t.uri)) byUri.set(t.uri, shape(t));
    if ([...byUri.values()].some((c) => scoreSpotifyMatch(c, want) >= 9)) break;
  }

  const candidates = [...byUri.values()]
    .map((c) => ({ ...c, score: scoreSpotifyMatch(c, want) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, CANDIDATES_PER_LINE);

  return {
    want,
    direct: false,
    confident: candidates.length > 0 && candidates[0].score >= 9,
    candidates,
  };
}

function badRequest(res, msg) {
  return res.status(400).json({ error: msg });
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

  const body = req.body || {};
  const appleMissing = APPLE_MISSING_ENV();
  const spotifyReady = Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);

  /* ---- import an Apple playlist ---- */
  if (typeof body.playlist === 'string') {
    if (appleMissing.length) {
      return res.status(503).json({ error: 'Apple credentials not configured: ' + appleMissing.join(', ') });
    }
    let token;
    try { token = appleDeveloperToken().token; }
    catch (e) { return res.status(502).json({ error: 'apple token failed: ' + e.message }); }

    const out = await importApplePlaylist(token, body.playlist);
    if (out.error) return badRequest(res, out.error);
    if (!out.tracks.length) return badRequest(res, 'That playlist came back empty.');
    return res.status(200).json({ service: 'apple', ...out });
  }

  /* ---- a chosen song → its Spotify twin ---- */
  if (Array.isArray(body.spotify)) {
    if (!spotifyReady) {
      return res.status(503).json({ error: 'Spotify credentials not configured' });
    }
    if (!body.spotify.length) return badRequest(res, 'spotify[] was empty');
    if (body.spotify.length > MAX_LINES) {
      return badRequest(res, `at most ${MAX_LINES} tracks per request`);
    }
    let token;
    try { token = await appToken(); }
    catch (e) { return res.status(502).json({ error: 'spotify auth failed: ' + e.message }); }

    const results = [];
    for (const w of body.spotify) {
      const want = {
        title: String((w && w.title) || '').slice(0, 200),
        artist: String((w && w.artist) || '').slice(0, 200),
        album: String((w && w.album) || '').slice(0, 200),
        duration_ms: Number((w && w.duration_ms) || 0) || 0,
        link: String((w && w.link) || '').slice(0, 400),
      };
      if (!want.title && !want.link) {
        results.push({ want, direct: false, confident: false, candidates: [] });
        continue;
      }
      try { results.push(await resolveSpotifyOne(token, want)); }
      catch (e) { results.push({ want, direct: false, confident: false, candidates: [], error: e.message }); }
    }
    return res.status(200).json({ service: 'spotify', results });
  }

  /* ---- lines → Apple candidates (the default path) ---- */
  const lines = Array.isArray(body.lines) ? body.lines : null;
  if (!lines || !lines.length) {
    return badRequest(res, 'lines[], spotify[] or playlist required');
  }
  if (lines.length > MAX_LINES) {
    return badRequest(res, `at most ${MAX_LINES} lines per request`);
  }
  if (appleMissing.length) {
    return res.status(503).json({ error: 'Apple credentials not configured: ' + appleMissing.join(', ') });
  }

  let appleToken;
  try { appleToken = appleDeveloperToken().token; }
  catch (e) { return res.status(502).json({ error: 'apple token failed: ' + e.message }); }

  // Only minted if a line turns out to be a Spotify link. Most runs never
  // touch Spotify at all, which is the point of the reordering.
  let spotifyToken = null;
  if (spotifyReady && lines.some((l) => trackIdFrom(l))) {
    try { spotifyToken = await appToken(); } catch (_) { spotifyToken = null; }
  }

  const results = [];
  for (const raw of lines) {
    if (!String(raw).trim()) continue;
    try { results.push(await appleFromLine(appleToken, raw, spotifyToken)); }
    catch (e) {
      results.push({ line: String(raw).trim(), parsed: { title: String(raw).trim(), artist: '' },
                     direct: false, confident: false, candidates: [], error: e.message });
    }
  }
  return res.status(200).json({ service: 'apple', results });
}
