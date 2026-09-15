// api/motif-save.js — commit a Motif entry to the repo.
//
// Writes motif/data/<slug>.json to nilesmheron/nilesheron-web on main, which
// Vercel then redeploys. The repo stays the single source of truth and every
// entry gets version history — the reason this goes through GitHub rather
// than a database in Phase 1.
//
// GET  ?slug=<slug>  → the current entry, so the builder can load and edit one
// POST { slug, entry } → commit it
//
// Requires GITHUB_TOKEN: a fine-grained PAT with Contents: read and write on
// this repo only.

import { requireCurator, validSlug } from './motif-tools-guard.js';

const REPO = process.env.MOTIF_REPO || 'nilesmheron/nilesheron-web';
const BRANCH = process.env.MOTIF_BRANCH || 'main';
const DIR = 'motif/data';

function gh(path, options = {}) {
  return fetch(`https://api.github.com/repos/${REPO}/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'motif-builder',
      ...(options.headers || {}),
    },
  });
}

const MANIFEST = `${DIR}/mixtapes.json`;

// Read one entry through the GitHub API rather than the download_url the
// contents listing hands back.
//
// download_url points at raw.githubusercontent.com, which is CDN-cached and
// does NOT reflect a commit made moments ago. rebuildManifest() runs about a
// second after the entry is written, so it was reading the PREVIOUS version of
// the file it had just changed: saving a new cover updated the entry and left
// the public index showing the old one. Observed 2026-09-13, entry commit
// 977ffc3 and index rebuild 9605ae7 one second apart.
//
// The API honours ?ref and is read-your-writes consistent, which is the whole
// reason to pay for an extra request per file here.
async function readEntry(path) {
  const r = await gh(`contents/${path}?ref=${BRANCH}`);
  if (!r.ok) throw new Error('read failed ' + r.status);
  const meta = await r.json();
  return JSON.parse(Buffer.from(meta.content, 'base64').toString('utf8'));
}

// Read every entry once and return the mixtape ones (those with tracks).
async function readAllEntries() {
  const dir = await gh(`contents/${DIR}?ref=${BRANCH}`);
  if (!dir.ok) throw new Error('list failed ' + dir.status);
  const files = (await dir.json()).filter(
    (f) => f.type === 'file' && f.name.endsWith('.json') &&
      f.name !== 'entries.json' && f.name !== 'mixtapes.json'
  );
  const out = await Promise.all(files.map(async (f) => {
    try {
      const e = await readEntry(`${DIR}/${f.name}`);
      return { slug: f.name.replace(/\.json$/, ''), entry: e };
    } catch (_) {
      return null;
    }
  }));
  return out.filter(Boolean);
}

// The public index reads a static manifest rather than calling an API, so
// /motif/mixtape keeps working even if the GitHub token expires. Regenerated
// after every save and delete; a failure here is logged, not fatal, because
// the entry itself is already committed.
// `fresh` is the entry this request just wrote, and `dropSlug` the one it just
// deleted. Both are applied over whatever the listing returns, so the file that
// actually changed is authoritative from memory and cannot be wrong however
// GitHub decides to cache today.
async function rebuildManifest(fresh, dropSlug) {
  const all = await readAllEntries();

  if (fresh && fresh.slug) {
    const at = all.findIndex((x) => x.slug === fresh.slug);
    if (at === -1) all.push({ slug: fresh.slug, entry: fresh.entry });
    else all[at] = { slug: fresh.slug, entry: fresh.entry };
  }

  const kept = dropSlug ? all.filter((x) => x.slug !== dropSlug) : all;

  const mixtapes = kept
    // `unlisted` keeps an entry out of the public index while leaving it fully
    // playable at its own URL. Needed because every entry with tracks is
    // published to /motif/mixtape automatically, so a throwaway test tape
    // would otherwise appear to the public the moment it was saved.
    .filter(({ entry }) => Array.isArray(entry.tracks) && entry.tracks.length && !entry.unlisted)
    .map(({ slug, entry }) => ({
      slug,
      title: entry.title || slug,
      date: entry.date || '',
      cover_image_url: entry.cover_image_url || null,
      track_count: entry.tracks.length,
    }))
    .sort((a, b) => a.title.localeCompare(b.title));

  let sha;
  const existing = await gh(`contents/${MANIFEST}?ref=${BRANCH}`);
  if (existing.ok) sha = (await existing.json()).sha;

  const content = Buffer.from(JSON.stringify(mixtapes, null, 2) + '\n', 'utf8').toString('base64');
  const put = await gh(`contents/${MANIFEST}`, {
    method: 'PUT',
    body: JSON.stringify({
      message: 'chore(motif): rebuild mixtape index',
      content,
      branch: BRANCH,
      ...(sha ? { sha } : {}),
    }),
  });
  return put.ok;
}

// Reject anything that would produce an entry the player cannot read.
function validateEntry(entry, slug) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return 'entry must be an object';
  if (entry.slug !== slug) return 'entry.slug must match the slug being saved';
  if (!Array.isArray(entry.tracks) || !entry.tracks.length) return 'entry.tracks must be a non-empty array';
  for (const t of entry.tracks) {
    if (!t || typeof t !== 'object') return 'each track must be an object';
    const name = t.id || t.title || '?';

    // PRD §7: a track may carry one platform only. This used to demand a
    // spotify_uri on every track, which was right when Spotify was the only
    // player and wrong the moment Apple became the front door — it would
    // reject an Apple-only song, and Apple is the side of this with no
    // listener cap. Require at least one playable id, and validate whichever
    // are present.
    const hasApple = typeof t.apple_id === 'string' && /^\d+$/.test(t.apple_id);
    const hasSpotify = typeof t.spotify_uri === 'string' &&
      /^spotify:track:[A-Za-z0-9]{22}$/.test(t.spotify_uri);

    if (t.apple_id !== undefined && !hasApple) {
      return `track "${name}" has an invalid apple_id`;
    }
    if (t.spotify_uri !== undefined && !hasSpotify) {
      return `track "${name}" has an invalid spotify_uri`;
    }
    if (!hasApple && !hasSpotify) {
      return `track "${name}" has no apple_id or spotify_uri — nothing could play it`;
    }
    if (typeof t.id !== 'string' || !t.id) return 'each track needs an id';
  }
  if (entry.poems && !Array.isArray(entry.poems)) return 'poems must be an array if present';
  if (entry.unlisted !== undefined && typeof entry.unlisted !== 'boolean') {
    return 'unlisted must be true or false if present';
  }
  // The side break. Out of range would either strand side B or make side A
  // empty, and the player would stop at a boundary it can never cross.
  if (entry.side_b_starts_at !== undefined) {
    const sb = entry.side_b_starts_at;
    if (!Number.isInteger(sb) || sb < 1 || sb >= entry.tracks.length) {
      return 'side_b_starts_at must be a whole number between 1 and ' + (entry.tracks.length - 1);
    }
  }
  return null;
}

export default async function handler(req, res) {
  if (!requireCurator(req, res)) return;

  if (!process.env.GITHUB_TOKEN) {
    return res.status(503).json({ error: 'GITHUB_TOKEN not configured on this deployment' });
  }

  // List every entry so the builder can offer them for editing. One directory
  // listing plus a parallel API read per file — GitHub rather than the
  // deployed /motif/data/*.json, so a just-saved entry appears immediately
  // instead of after the next deploy.
  if (req.method === 'GET' && req.query.action === 'list') {
    const dir = await gh(`contents/${DIR}?ref=${BRANCH}`);
    if (!dir.ok) return res.status(502).json({ error: 'github list failed: ' + dir.status });
    const files = (await dir.json())
      // mixtapes.json is the generated public index and entries.json is the
      // poetry archive index — neither is an entry.
      .filter((f) => f.type === 'file' && f.name.endsWith('.json') &&
        f.name !== 'entries.json' && f.name !== 'mixtapes.json')
      .slice(0, 50);

    const entries = await Promise.all(files.map(async (f) => {
      const slug = f.name.replace(/\.json$/, '');
      try {
        // Same staleness trap as the manifest — the picker showed the old
        // cover for a few minutes after a save.
        const e = await readEntry(`${DIR}/${f.name}`);
        return {
          slug,
          title: e.title || slug,
          tracks: Array.isArray(e.tracks) ? e.tracks.length : 0,
          poems: Array.isArray(e.poems) ? e.poems.length : 0,
          cover: e.cover_image_url || null,
        };
      } catch (_) {
        return { slug, title: slug, tracks: 0, poems: 0, cover: null, unreadable: true };
      }
    }));

    entries.sort((a, b) => a.slug.localeCompare(b.slug));
    return res.status(200).json({ entries });
  }

  if (req.method === 'GET') {
    const slug = String(req.query.slug || '');
    if (!validSlug(slug)) return res.status(400).json({ error: 'bad slug' });
    const r = await gh(`contents/${DIR}/${slug}.json?ref=${BRANCH}`);
    if (r.status === 404) return res.status(404).json({ error: 'not found' });
    if (!r.ok) return res.status(502).json({ error: 'github read failed: ' + r.status });
    const d = await r.json();
    let entry = null;
    try {
      entry = JSON.parse(Buffer.from(d.content, 'base64').toString('utf8'));
    } catch (_) {
      return res.status(500).json({ error: 'stored entry is not valid JSON' });
    }
    return res.status(200).json({ entry, sha: d.sha });
  }

  if (req.method === 'DELETE') {
    const slug = String(req.query.slug || '');
    if (!validSlug(slug)) return res.status(400).json({ error: 'bad slug' });

    const path = `${DIR}/${slug}.json`;
    const existing = await gh(`contents/${path}?ref=${BRANCH}`);
    if (existing.status === 404) return res.status(404).json({ error: 'no such entry' });
    if (!existing.ok) return res.status(502).json({ error: 'github read failed: ' + existing.status });
    const { sha } = await existing.json();

    const del = await gh(`contents/${path}`, {
      method: 'DELETE',
      body: JSON.stringify({
        message: `chore(motif): delete ${slug} entry from the builder`,
        sha,
        branch: BRANCH,
      }),
    });

    if (!del.ok) {
      const d = await del.json().catch(() => ({}));
      return res.status(del.status).json({ error: d.message || 'github delete failed' });
    }

    const indexed = await rebuildManifest(null, slug).catch(() => false);

    // The file is gone from main but stays in history — recoverable with
    // `git show <commit>^:motif/data/<slug>.json` if it was a mistake.
    return res.status(200).json({ ok: true, deleted: path, indexed });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'GET, POST or DELETE only' });
  }

  const { slug, entry } = req.body || {};
  if (!validSlug(slug)) {
    return res.status(400).json({ error: 'slug must be lowercase letters, numbers and hyphens' });
  }
  const problem = validateEntry(entry, slug);
  if (problem) return res.status(400).json({ error: problem });

  const path = `${DIR}/${slug}.json`;

  // Existing file needs its sha to update rather than fail.
  let sha;
  const existing = await gh(`contents/${path}?ref=${BRANCH}`);
  if (existing.ok) {
    sha = (await existing.json()).sha;
  } else if (existing.status !== 404) {
    return res.status(502).json({ error: 'github read failed: ' + existing.status });
  }

  const content = Buffer.from(JSON.stringify(entry, null, 2) + '\n', 'utf8').toString('base64');

  const put = await gh(`contents/${path}`, {
    method: 'PUT',
    body: JSON.stringify({
      message: `${sha ? 'update' : 'add'}(motif): ${slug} entry from the builder`,
      content,
      branch: BRANCH,
      ...(sha ? { sha } : {}),
    }),
  });

  const result = await put.json().catch(() => ({}));

  if (!put.ok) {
    return res.status(put.status).json({
      error: result.message || 'github write failed',
    });
  }

  const indexed = await rebuildManifest({ slug, entry }).catch(() => false);

  return res.status(200).json({
    ok: true,
    created: !sha,
    path,
    indexed,
    commit: result.commit && result.commit.sha,
    listen: `/motif/${slug}/listen`,
  });
}
