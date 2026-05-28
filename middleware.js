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
    '/motif/:path+',
  ],
};

export default function middleware(request) {
  const url = new URL(request.url);

  // Rewrite /motif/:slug to /motif/entry.html — must happen before cleanUrls
  // processes the request, which is why this lives in middleware rather than
  // vercel.json rewrites (cleanUrls returns 404 before afterFiles rewrites run).
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments[0] === 'motif' && segments.length === 2 && !segments[1].includes('.')) {
    return new Response(null, {
      headers: {
        'x-middleware-rewrite': new URL('/motif/entry.html', request.url).toString(),
      },
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
