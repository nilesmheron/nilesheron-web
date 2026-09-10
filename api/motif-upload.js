// api/motif-upload.js — signed upload URLs for curator card media.
//
// Returns a short-lived signed URL so the browser uploads straight to Supabase
// storage. The service key never leaves the server, and the file never passes
// through this function — which also sidesteps Vercel's request body limit on
// anything larger than a small image.
//
// Media lands in the `motif-images` bucket on the **nilesheron** Supabase
// project, where the poem scans already live. That is deliberately NOT the
// project this repo's shared SUPABASE_* vars point at (personal-ai-os), so it
// uses its own vars and stays independent of the pending consolidation:
//   MOTIF_SUPABASE_URL, MOTIF_SUPABASE_SERVICE_KEY

import { requireCurator, validSlug } from './motif-tools-guard.js';

const BUCKET = process.env.MOTIF_MEDIA_BUCKET || 'motif-images';
const MAX_BYTES = 12 * 1024 * 1024;

const ALLOWED = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

// Storage keys end up in public URLs. Strip anything surprising.
function safeName(name, contentType) {
  const ext = ALLOWED[contentType];
  const base = String(name || 'image')
    .replace(/\.[A-Za-z0-9]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'image';
  return `${base}.${ext}`;
}

export default async function handler(req, res) {
  if (!requireCurator(req, res)) return;

  const url = process.env.MOTIF_SUPABASE_URL;
  const key = process.env.MOTIF_SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    return res.status(503).json({
      error: 'MOTIF_SUPABASE_URL / MOTIF_SUPABASE_SERVICE_KEY not configured',
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const { slug, filename, contentType, size } = req.body || {};
  if (!validSlug(slug)) return res.status(400).json({ error: 'bad slug' });
  if (!ALLOWED[contentType]) {
    return res.status(400).json({ error: 'only jpeg, png, webp or gif' });
  }
  if (typeof size === 'number' && size > MAX_BYTES) {
    return res.status(400).json({ error: 'file is larger than 12MB' });
  }

  // A per-request suffix keeps re-uploads of the same filename from colliding,
  // and avoids stale CDN copies of a replaced image.
  const stamp = Date.now().toString(36);
  const path = `mixtape/${slug}/${stamp}-${safeName(filename, contentType)}`;

  const signed = await fetch(
    `${url}/storage/v1/object/upload/sign/${BUCKET}/${path}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        apikey: key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ expiresIn: 600 }),
    }
  );

  const data = await signed.json().catch(() => ({}));

  if (!signed.ok) {
    return res.status(signed.status).json({
      error: data.message || data.error || 'could not sign upload',
      hint: signed.status === 404
        ? `bucket "${BUCKET}" not found on that Supabase project`
        : undefined,
    });
  }

  // Supabase returns a relative signed path; the browser PUTs the file there.
  const uploadUrl = `${url}/storage/v1${data.url.startsWith('/') ? '' : '/'}${data.url}`;
  const publicUrl = `${url}/storage/v1/object/public/${BUCKET}/${path}`;

  return res.status(200).json({ uploadUrl, publicUrl, path });
}
