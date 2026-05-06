// api/vh-auth.js
import crypto from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TOKEN_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

function sb(path, options = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      ...(options.headers || {}),
    },
  });
}

// Deprecated — kept so existing imports don't break at load time
export function computeToken(password) {
  return crypto.createHash('sha256').update(password + 'vh-salt-v1').digest('hex');
}

function mintToken(uid, role) {
  const secret = process.env.VH_TOKEN_SECRET;
  if (!secret) throw new Error('VH_TOKEN_SECRET not configured');
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + TOKEN_TTL;
  const payloadBuf = Buffer.from(JSON.stringify({ uid, role, iat, exp }));
  const sig = crypto.createHmac('sha256', secret).update(payloadBuf).digest();
  return `${payloadBuf.toString('base64url')}.${sig.toString('base64url')}`;
}

export async function getAuth(req) {
  const FAIL = { ok: false, userId: null, role: null, isSuperadmin: false };
  const raw = req.headers['x-vh-token'];
  const secret = process.env.VH_TOKEN_SECRET;
  if (!raw || !secret) return FAIL;

  const dot = raw.lastIndexOf('.');
  if (dot < 1) return FAIL;

  let payloadBuf, sigBuf;
  try {
    payloadBuf = Buffer.from(raw.slice(0, dot), 'base64url');
    sigBuf     = Buffer.from(raw.slice(dot + 1), 'base64url');
  } catch {
    return FAIL;
  }

  const expected = crypto.createHmac('sha256', secret).update(payloadBuf).digest();
  if (sigBuf.length !== expected.length || !crypto.timingSafeEqual(sigBuf, expected)) return FAIL;

  let payload;
  try {
    payload = JSON.parse(payloadBuf.toString('utf8'));
  } catch {
    return FAIL;
  }

  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return FAIL;

  if (payload.uid === '__superadmin__') {
    return { ok: true, userId: null, role: 'admin', isSuperadmin: true };
  }

  try {
    const r = await sb(`/vh_users?id=eq.${encodeURIComponent(payload.uid)}&select=role,disabled_at`);
    if (!r.ok) return FAIL;
    const rows = await r.json();
    if (!rows.length || rows[0].disabled_at) return FAIL;
    return { ok: true, userId: payload.uid, role: rows[0].role, isSuperadmin: false };
  } catch {
    return FAIL;
  }
}

export async function getAccess(auth, client_id) {
  const none = { visible: false, canEdit: false, canDelete: false, canShare: false };
  if (!auth.ok) return none;
  if (auth.isSuperadmin || auth.role === 'admin') {
    return { visible: true, canEdit: true, canDelete: true, canShare: true };
  }

  try {
    const clientRes = await sb(`/vh_clients?id=eq.${encodeURIComponent(client_id)}&select=created_by`);
    if (!clientRes.ok) return none;
    const clients = await clientRes.json();
    if (!clients.length) return none;

    if (clients[0].created_by === auth.userId) {
      return { visible: true, canEdit: true, canDelete: true, canShare: true };
    }

    const shareRes = await sb(
      `/vh_session_shares?client_id=eq.${encodeURIComponent(client_id)}&user_id=eq.${encodeURIComponent(auth.userId)}&select=level`
    );
    if (!shareRes.ok) return none;
    const shares = await shareRes.json();
    if (!shares.length) return none;

    if (shares[0].level === 'edit') return { visible: true, canEdit: true, canDelete: false, canShare: false };
    return { visible: true, canEdit: false, canDelete: false, canShare: false };
  } catch {
    return none;
  }
}

// Back-compat alias — now async because getAuth is async
export async function validateAdminToken(req) {
  const auth = await getAuth(req);
  return auth.ok && (auth.role === 'admin' || auth.isSuperadmin);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const action = req.query?.action;

  if (action === 'create_user') {
    if (!await validateAdminToken(req)) return res.status(401).json({ error: 'Unauthorized' });
    const { username, password, role } = req.body || {};
    if (!username || !password || !role) {
      return res.status(400).json({ error: 'username, password, and role required' });
    }
    if (!/^[a-z0-9][a-z0-9._-]{1,30}$/.test(username)) {
      return res.status(400).json({ error: 'invalid username format' });
    }
    if (!['admin', 'user', 'viewer'].includes(role)) {
      return res.status(400).json({ error: 'role must be admin, user, or viewer' });
    }
    if (password.length < 12) {
      return res.status(400).json({ error: 'password must be at least 12 characters' });
    }
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.createHash('sha256').update(password + salt + 'vh-salt-v2').digest('hex');
    try {
      const r = await sb('/vh_users', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ username, password_hash: hash, password_salt: salt, role }),
      });
      if (!r.ok) {
        const err = await r.text();
        return res.status(r.status).json({ error: err });
      }
      const rows = await r.json();
      const u = rows[0];
      return res.status(200).json({ id: u.id, username: u.username, role: u.role });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (action === 'disable_user') {
    if (!await validateAdminToken(req)) return res.status(401).json({ error: 'Unauthorized' });
    const { user_id } = req.body || {};
    if (!user_id) return res.status(400).json({ error: 'user_id required' });
    try {
      const r = await sb(`/vh_users?id=eq.${encodeURIComponent(user_id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ disabled_at: new Date().toISOString() }),
      });
      if (!r.ok) return res.status(500).json({ error: 'Update failed' });
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // Standard login
  const secret = process.env.VH_TOKEN_SECRET;
  const adminPassword = process.env.VH_ADMIN_PASSWORD;
  if (!secret || !adminPassword) return res.status(500).json({ error: 'Auth not configured' });

  const { username, password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'password required' });

  // Legacy superadmin path: {password} only
  if (!username) {
    if (password !== adminPassword) return res.status(401).json({ error: 'Invalid password' });
    const token = mintToken('__superadmin__', 'admin');
    return res.status(200).json({
      token,
      user: { id: '__superadmin__', username: 'admin', role: 'admin' },
    });
  }

  // Named user login
  try {
    const r = await sb(
      `/vh_users?username=eq.${encodeURIComponent(username)}&select=id,role,password_hash,password_salt,disabled_at`
    );
    if (!r.ok) return res.status(500).json({ error: 'Auth lookup failed' });
    const rows = await r.json();
    if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' });
    const user = rows[0];
    if (user.disabled_at) return res.status(401).json({ error: 'Account disabled' });

    const expectedBuf = Buffer.from(
      crypto.createHash('sha256').update(password + user.password_salt + 'vh-salt-v2').digest('hex')
    );
    const actualBuf = Buffer.from(user.password_hash);
    if (expectedBuf.length !== actualBuf.length || !crypto.timingSafeEqual(expectedBuf, actualBuf)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = mintToken(user.id, user.role);
    return res.status(200).json({
      token,
      user: { id: user.id, username, role: user.role },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
