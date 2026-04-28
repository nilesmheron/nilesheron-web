// api/vh-link-meta.js — proxies oEmbed for YouTube/Vimeo; detects link type
import { validateAdminToken } from './vh-auth.js';

function detectType(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtube.com' || host === 'youtu.be') return 'youtube';
    if (host === 'vimeo.com') return 'vimeo';
    if (host === 'drive.google.com') return 'drive';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!validateAdminToken(req)) return res.status(401).json({ error: 'Unauthorized' });

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url required' });

  const type = detectType(url);

  if (type !== 'youtube' && type !== 'vimeo') {
    return res.status(200).json({ type, title: null, author: null });
  }

  const oembedBase = type === 'youtube'
    ? 'https://www.youtube.com/oembed'
    : 'https://vimeo.com/api/oembed.json';

  try {
    const r = await fetch(`${oembedBase}?url=${encodeURIComponent(url)}&format=json`);
    if (!r.ok) return res.status(200).json({ type, title: null, author: null });
    const data = await r.json();
    return res.status(200).json({ type, title: data.title || null, author: data.author_name || null });
  } catch {
    return res.status(200).json({ type, title: null, author: null });
  }
}
