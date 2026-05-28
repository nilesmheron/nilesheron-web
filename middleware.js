// middleware.js — HTTP Basic Auth gate for protected preview pages
// Passwords (and optional usernames) read from env vars set in Vercel dashboard.
// Each gate matches a path prefix and checks against its own env vars.

const GATES = [
  {
    prefix: '/grav',
    passwordEnv: 'GRAV_PASSWORD',
    realm: 'Gravillis preview',
    // username ignored by design — any user accepted
  },
  {
    prefix: '/mothership/budget',
    userEnv: 'MOTHERSHIP_BUDGET_USER',
    passwordEnv: 'MOTHERSHIP_BUDGET_PASSWORD',
    realm: 'Mothership budget preview',
    // both user and password checked
  },
];

export const config = {
  matcher: [
    '/grav',
    '/grav/:path*',
    '/mothership/budget',
    '/mothership/budget/:path*',
    '/motif/:path*',
  ],
};

export default async function middleware(request) {
  const url = new URL(request.url);

  // Serve /motif/:slug by fetching entry.html and proxying the response.
  // Lives in middleware (not vercel.json rewrites) because cleanUrls intercepts
  // the request and returns 404 before afterFiles rewrites get a chance to run.
  // Subrequests made inside middleware bypass middleware, so no loop risk.
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments[0] === 'motif' && segments.length === 2 && !segments[1].includes('.')) {
    const entryUrl = new URL('/motif/entry', request.url);
    const res = await fetch(entryUrl);
    const html = await res.text();
    return new Response(html, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }

  const gate = GATES.find(
    (g) => url.pathname === g.prefix || url.pathname.startsWith(g.prefix + '/')
  );

  if (!gate) return; // shouldn't happen given matcher, but fail open to static

  const expectedPassword = process.env[gate.passwordEnv];
  const expectedUser = gate.userEnv ? process.env[gate.userEnv] : null;

  if (!expectedPassword) {
    return new Response(
      `Configuration error: ${gate.passwordEnv} env var is not set on this deployment.`,
      { status: 503, headers: { 'Content-Type': 'text/plain' } }
    );
  }

  const auth = request.headers.get('authorization');

  if (auth && auth.startsWith('Basic ')) {
    try {
      const decoded = atob(auth.slice(6));
      const colonIdx = decoded.indexOf(':');
      const user = colonIdx >= 0 ? decoded.slice(0, colonIdx) : '';
      const password = colonIdx >= 0 ? decoded.slice(colonIdx + 1) : decoded;

      const passwordOk = password === expectedPassword;
      const userOk = expectedUser ? user === expectedUser : true;

      if (passwordOk && userOk) {
        return; // authenticated — let the request continue to the static file
      }
    } catch (_) {
      // malformed header — fall through to 401
    }
  }

  return new Response('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': `Basic realm="${gate.realm}"`,
      'Content-Type': 'text/plain',
    },
  });
}
