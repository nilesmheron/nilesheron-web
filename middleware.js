// middleware.js — HTTP Basic Auth gate for /grav/*
// Password is read from GRAV_PASSWORD env var (set in Vercel dashboard, not committed).
// Any username is accepted — the password is the gate.

export const config = {
  matcher: ['/grav', '/grav/:path*'],
};

export default function middleware(request) {
  const expected = process.env.GRAV_PASSWORD;

  if (!expected) {
    return new Response(
      'Configuration error: GRAV_PASSWORD env var is not set on this deployment.',
      { status: 503, headers: { 'Content-Type': 'text/plain' } }
    );
  }

  const auth = request.headers.get('authorization');

  if (auth && auth.startsWith('Basic ')) {
    try {
      const decoded = atob(auth.slice(6));
      const colonIdx = decoded.indexOf(':');
      const password = colonIdx >= 0 ? decoded.slice(colonIdx + 1) : decoded;

      if (password === expected) {
        return; // authenticated — let the request continue to the static file
      }
    } catch (_) {
      // malformed header — fall through to 401
    }
  }

  return new Response('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Gravillis preview"',
      'Content-Type': 'text/plain',
    },
  });
}
