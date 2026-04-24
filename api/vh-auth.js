// api/vh-auth.js
import crypto from 'crypto';

const SALT = 'vh-salt-v1';

export function computeToken(password) {
  return crypto.createHash('sha256').update(password + SALT).digest('hex');
}

export function validateAdminToken(req) {
  const token = req.headers['x-vh-token'];
  if (!token) return false;
  const adminPassword = process.env.VH_ADMIN_PASSWORD;
  if (!adminPassword) return false;
  return token === computeToken(adminPassword);
}

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'password required' });

  const adminPassword = process.env.VH_ADMIN_PASSWORD;
  if (!adminPassword) return res.status(500).json({ error: 'Admin password not configured' });

  if (password !== adminPassword) return res.status(401).json({ error: 'Invalid password' });

  return res.status(200).json({ token: computeToken(adminPassword) });
}
