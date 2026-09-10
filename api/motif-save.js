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

// Reject anything that would produce an entry the player cannot read.
function validateEntry(entry, slug) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return 'entry must be an object';
  if (entry.slug !== slug) return 'entry.slug must match the slug being saved';
  if (!Array.isArray(entry.tracks) || !entry.tracks.length) return 'entry.tracks must be a non-empty array';
  for (const t of entry.tracks) {
    if (!t || typeof t !== 'object') return 'each track must be an object';
    if (typeof t.spotify_uri !== 'string' || !/^spotify:track:[A-Za-z0-9]{22}$/.test(t.spotify_uri)) {
      return `track "${t.id || t.title || '?'}" has an invalid spotify_uri`;
    }
    if (typeof t.id !== 'string' || !t.id) return 'each track needs an id';
  }
  if (entry.poems && !Array.isArray(entry.poems)) return 'poems must be an array if present';
  return null;
}

export default async function handler(req, res) {
  if (!requireCurator(req, res)) return;

  if (!process.env.GITHUB_TOKEN) {
    return res.status(503).json({ error: 'GITHUB_TOKEN not configured on this deployment' });
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

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'GET or POST only' });
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

  return res.status(200).json({
    ok: true,
    created: !sha,
    path,
    commit: result.commit && result.commit.sha,
    listen: `/motif/${slug}/listen`,
  });
}
