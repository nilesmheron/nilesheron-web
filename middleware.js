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
  {
    prefix: '/motif/tools',
    userEnv: 'MOTIF_TOOLS_USER',
    passwordEnv: 'MOTIF_TOOLS_PASSWORD',
    realm: 'Motif curator tools',
    // both user and password checked
    // Curator-only surface (playlist builder). Already inside the existing
    // '/motif/:path*' matcher, so no matcher change was needed.
    // Note: only paths of three or more segments reach this gate — the bare
    // '/motif/tools' is two segments with no dot and is answered by the entry
    // slug branch below. Tool pages therefore live at /motif/tools/<name>.
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

// Fetch a static page and return it under the requested URL. Subrequests made
// inside middleware bypass middleware, so there is no loop risk.
async function proxyStatic(path, request) {
  const res = await fetch(new URL(path, request.url));
  const html = await res.text();
  return new Response(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

// Token the curator tools present to the write endpoints under /api.
// Format: "<expiryMs>.<hex hmac of expiryMs>", keyed on the tools password, so
// no extra secret to manage. Verified by api/motif-tools-guard.js.
const TOOLS_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

async function mintToolsToken(secret) {
  const exp = String(Date.now() + TOOLS_TOKEN_TTL_MS);
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(exp));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${exp}.${hex}`;
}

async function injectToolsToken(request, secret) {
  const res = await fetch(request.url, { headers: { 'x-motif-internal': '1' } });
  const type = res.headers.get('content-type') || '';
  if (!type.includes('text/html')) return; // assets pass through untouched

  const html = await res.text();
  const token = await mintToolsToken(secret);
  const tag = `<script>window.__MOTIF_TOOLS_TOKEN__=${JSON.stringify(token)};</script>`;
  const out = html.includes('</head>')
    ? html.replace('</head>', tag + '</head>')
    : tag + html;

  return new Response(out, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store', // the token is per-response; never cache it
    },
  });
}

export default async function middleware(request) {
  const url = new URL(request.url);

  // Serve /motif/:slug by fetching entry.html and proxying the response.
  // Lives in middleware (not vercel.json rewrites) because cleanUrls intercepts
  // the request and returns 404 before afterFiles rewrites get a chance to run.
  // Subrequests made inside middleware bypass middleware, so no loop risk.
  const segments = url.pathname.split('/').filter(Boolean);

  // Two-segment /motif/* paths that are pages, not entry slugs. Without this
  // they fall into the slug branch below and get answered with entry.html.
  const MOTIF_PAGES = { mixtape: '/motif/mixtape-index' };

  // /motif/by/<handle> — one curator's shelf, same page as the global index.
  if (segments[0] === 'motif' && segments.length === 3 && segments[1] === 'by') {
    return proxyStatic('/motif/mixtape-index', request);
  }

  if (segments[0] === 'motif' && segments.length === 2 && MOTIF_PAGES[segments[1]]) {
    return proxyStatic(MOTIF_PAGES[segments[1]], request);
  }

  if (segments[0] === 'motif' && segments.length === 2 && !segments[1].includes('.')) {
    return proxyStatic('/motif/entry', request);
  }

  /* Link previews.

     A shared mixtape link is the default way in — texted, or posted — and a
     bare URL with no card is a link nobody taps. The player page is static,
     so the tags cannot be per-tape in the file; they are injected here, where
     the slug is already known. Subrequests inside middleware bypass
     middleware, so reading the entry JSON is safe.

     Failure is silent on purpose: a missing preview must never cost a play. */
  async function withPreview(path, request, slug) {
    const res = await fetch(new URL(path, request.url));
    let html = await res.text();
    try {
      const data = await fetch(new URL('/motif/data/' + slug + '.json', request.url));
      if (data.ok) {
        const e = await data.json();
        const esc = (v) => String(v == null ? '' : v)
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const title = esc(e.title || 'A mixtape');
        const by = e.curator && e.curator.name ? ' by ' + esc(e.curator.name) : '';
        const desc = 'A mixtape' + by +
          ', played blind. You cannot see what is next — each song turns a card face up as it starts.';
        const img = e.cover_image_url ? esc(e.cover_image_url) : '';
        const url = esc(request.url.split('?')[0]);

        const tags = [
          `<meta property="og:type" content="music.playlist">`,
          `<meta property="og:site_name" content="Memorex">`,
          `<meta property="og:title" content="${title}">`,
          `<meta property="og:description" content="${desc}">`,
          `<meta property="og:url" content="${url}">`,
          img ? `<meta property="og:image" content="${img}">` : '',
          img ? `<meta property="og:image:width" content="1000">` : '',
          img ? `<meta property="og:image:height" content="1000">` : '',
          `<meta name="twitter:card" content="${img ? 'summary_large_image' : 'summary'}">`,
          `<meta name="twitter:title" content="${title}">`,
          `<meta name="twitter:description" content="${desc}">`,
          img ? `<meta name="twitter:image" content="${img}">` : '',
          `<meta name="description" content="${desc}">`,
        ].filter(Boolean).join('\n  ');

        /* Injected at the TOP of <head>, not before </head>. Several link
           scrapers — iMessage among them — read only the first few kilobytes,
           and the page's head opens with a long comment block and three font
           links. Tags that lead are tags that get read. */
        html = html.includes('<head>')
          ? html.replace('<head>', '<head>\n  ' + tags)
          : html.replace('</head>', '  ' + tags + '\n</head>');
      }
    } catch (_) {
      // no preview rather than no page
    }
    return new Response(html, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }

  // Serve /motif/:slug/listen (the blind player) the same way. A vercel.json
  // rewrite was tried first and 404s for the same reason as above — verified
  // live 2026-09-09 — so PRD §10's instruction to add a rewrite does not work
  // and this mirrors the existing mechanism instead.
  if (segments[0] === 'motif' && segments.length === 3 && segments[2] === 'listen') {
    return withPreview('/motif/listen', request, segments[1]);
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
        // The curator tools call write endpoints under /api, which this
        // matcher does not cover — and browsers do not reliably attach cached
        // Basic credentials across path trees on a fetch. Rather than asking
        // for the password a second time on the page, mint a short-lived
        // token here (the gate has already proven who they are) and inject it
        // into the HTML for the page's own fetches to carry.
        if (gate.prefix === '/motif/tools') {
          return injectToolsToken(request, expectedPassword);
        }
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
