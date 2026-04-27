// api/vh-attachment.js
import { validateAdminToken } from './vh-auth.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const MAX_BYTES = 4 * 1024 * 1024; // 4MB decoded limit

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!validateAdminToken(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(500).json({ error: 'Supabase not configured' });

  const { fileName, contentType, data } = req.body || {};
  if (!fileName || !contentType || !data) {
    return res.status(400).json({ error: 'fileName, contentType, and data required' });
  }

  let buffer;
  try {
    buffer = Buffer.from(data, 'base64');
  } catch {
    return res.status(400).json({ error: 'Invalid base64 data' });
  }

  if (buffer.length > MAX_BYTES) {
    return res.status(413).json({ error: 'File must be under 4MB' });
  }

  const ext  = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.')) : '';
  const rand = Math.random().toString(36).slice(2, 10);
  const path = `${Date.now()}-${rand}${ext}`;

  try {
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/vh-attachments/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SUPABASE_KEY}`,
        apikey:        SUPABASE_KEY,
        'Content-Type': contentType,
        'x-upsert':    'true',
      },
      body: buffer,
    });

    if (!r.ok) {
      const err = await r.text();
      return res.status(r.status).json({ error: 'Storage upload failed: ' + err });
    }

    return res.status(200).json({
      url: `${SUPABASE_URL}/storage/v1/object/public/vh-attachments/${path}`,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
