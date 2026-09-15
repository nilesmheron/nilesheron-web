(function () {
  'use strict';

  /* ============================================================
     MOTIF — blind playlist player (PRD §5)

     Two services, two sets of rules. The SPOTIFY rules below were each
     established by the 2026-09-08/09 spike; the Apple ones live with the
     MusicKit adapter further down and are deliberately different, because
     Spotify's constraints came from having no client-side queue and Apple
     hands us a real one.

     Changing any of these breaks locked-screen listening, which is the
     product. Spotify:

       1. Seed the Spotify context with exactly ONE track.
       2. Keep exactly one track queued ahead via POST /me/player/queue,
          appending each time a track starts.
       3. Never issue a new play call mid-listen. A new play call starts a
          new media source, and iOS refuses to autoplay one while locked —
          the track loads and sits paused. Every automatic transition must
          come from the queue. (User-initiated jumps are fine: a tap is a
          user activation.)
       4. When the queue drains, Spotify falls back to the seed context and
          replays it. Detect the final track and stop.
     ============================================================ */

  /* ── platforms ──
     Apple Music is the front door: no development-mode cap, so anyone with a
     subscription can listen. Spotify is the side door for the five people
     Niles can allowlist by hand. An entry whose tracks carry no apple_id
     falls back to Spotify-only, so nothing that predates Apple is stranded. */
  var APPLE_ENABLED = true;

  function appleReady() {
    return APPLE_ENABLED && tracks.some(function (t) { return t.apple_id; });
  }

  /* ============================================================
     THE SIDES MODEL

     A tape declares its sides; nothing about them is hard-coded. Every label,
     counter, tick row and deck block derives from this one declaration, which
     is why pos() exists — nothing else in the player needs to know that sides
     are a thing.

       sides: [{ label: 'A', total: 9 }, { label: 'B', total: 9 }]
       sides: [{ label: 'A', total: 18 }]            // one-sided, reads as before
     ============================================================ */

  var sides = [];

  function buildSides(e) {
    var declared = e && e.sides;
    if (Object.prototype.toString.call(declared) === '[object Array]' && declared.length) {
      var sum = 0, out = [];
      for (var i = 0; i < declared.length; i++) {
        var t = Number(declared[i].total) || 0;
        if (t <= 0) break;
        out.push({ label: String(declared[i].label || String.fromCharCode(65 + i)), total: t });
        sum += t;
      }
      // Only trust a declaration that accounts for every track; a partial one
      // would strand the remainder in a side that never appears.
      if (sum === tracks.length) return out;
      trace('sides declaration does not sum to ' + tracks.length + ' — falling back to one side');
    }
    return [{ label: 'A', total: tracks.length }];
  }

  // Everything the view needs about where a song sits.
  function pos(i) {
    var run = 0;
    for (var n = 0; n < sides.length; n++) {
      if (i < run + sides[n].total) {
        return {
          index: i,
          side: n,
          label: sides[n].label,
          inSide: i - run,
          total: sides[n].total,
          first: run,
          sided: sides.length > 1
        };
      }
      run += sides[n].total;
    }
    var last = sides.length - 1;
    return { index: i, side: last, label: sides[last].label, inSide: sides[last].total - 1,
             total: sides[last].total, first: run - sides[last].total, sided: sides.length > 1 };
  }

  function sideStart(n) {
    var run = 0;
    for (var i = 0; i < n; i++) run += sides[i].total;
    return run;
  }

  // The last song of a side, and there is another side after it.
  function atSideBreak() {
    if (finished || sides.length < 2) return false;
    var p = pos(idx);
    return p.inSide === p.total - 1 && p.side < sides.length - 1;
  }

  /* ============================================================
     THE CARD MODEL

     Four independent curator overrides, all sixteen combinations legal.
     Resolved in one place so no view re-derives the rules.
     ============================================================ */

  function face(t, artUrl) {
    var c = (t && t.card) || {};
    return {
      src: c.front_image_url || artUrl || null,
      // fit governs the FRONT. A back image is always contained: there is no
      // cover mode for a poem you are meant to read.
      contain: Boolean(c.front_image_url) && c.fit === 'contain',
      img: c.back_image_url || null,
      text: c.back_text || null
    };
  }

  /* ── state ──
     Everything the views read. Kept together and above them: the Tape rewrite
     replaced the blocks these used to sit in and took the declarations with
     them, which under 'use strict' fails at the first assignment. */
  var entry = null;
  var tracks = [];
  var revealed = [];        // track indices, in the order they were revealed
  var idx = 0;
  var queuedUpTo = -1;
  var awaitingFlip = false;
  var mode = 'rest';        // 'rest' | 'spot' | 'turn' | 'flip'
  var flippedInGrid = {};   // played index -> showing its back in the grid

  var service = 'spotify';   // 'spotify' | 'apple' — set by the splash choice
  var player = null;
  var deviceId = null;
  var paused = false;
  var finished = false;
  var mediaFor = null;
  var starting = false;

  var root = document.getElementById('listen-root');
  var npEl, transportEl, statusEl, playBtn;

  /* ── diagnostics ──
     A listener cannot open a console, and "Starting then Play" looks identical
     whatever caused it. Record the steps so a failure can be reported rather
     than guessed at — the same thing that made the playback spike tractable. */
  var t0 = Date.now();
  var diag = [];
  function trace(msg) {
    diag.push(((Date.now() - t0) / 1000).toFixed(1) + 's  ' + msg);
    if (window.console && console.log) console.log('[motif] ' + msg);
  }
  trace('ua: ' + navigator.userAgent);
  trace('standalone: ' + !!window.navigator.standalone + ' · cookies: ' + navigator.cookieEnabled);

  /* ── pulse: how the tape was actually listened to ──
     Deliberately replacing an accident. Until now the only record of a listen
     was that the nm.h logo sat on every card back, so each reveal produced a
     static-asset request and a listen could be reconstructed from timings.
     The Tape redesign removes that logo from the grid and the trace with it.

     A per-listen random id, never stored, dead when the tab closes — two
     listens by the same person are not linkable. No account id, no token, no
     title, no user agent. See api/motif-pulse.js. */
  var listenId = Math.random().toString(36).slice(2, 10);
  var pulseSeq = 0;
  var pulseBox = [];

  function pulse(ev, i) {
    pulseBox.push({
      seq: ++pulseSeq,
      t: Math.round((Date.now() - t0) / 1000),
      ev: ev,
      i: (i === undefined ? null : i),
      svc: service
    });
    // 'complete' and 'leave' are the two that must not be lost, so they go at
    // once and by beacon; the rest ride along in batches.
    if (ev === 'complete' || ev === 'leave') flushPulse(true);
    else if (pulseBox.length >= 6) flushPulse(false);
  }

  function flushPulse(beacon) {
    if (!pulseBox.length) return;
    var batch = pulseBox.splice(0, 40);
    var payload = JSON.stringify({ slug: slug, listen: listenId, events: batch });
    try {
      if (beacon && navigator.sendBeacon) {
        if (navigator.sendBeacon('/api/motif-pulse', new Blob([payload], { type: 'application/json' }))) return;
      }
      fetch('/api/motif-pulse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true
      }).catch(function () {});
    } catch (_) { /* never let telemetry break playback */ }
  }

  // A listener who closes the tab mid-tape is the most informative case and
  // the easiest to lose. pagehide fires where unload does not on iOS.
  window.addEventListener('pagehide', function () {
    if (finished) return;
    pulse('leave', idx);
  });

  /* ── routing: /motif/<slug>/listen ── */
  var m = window.location.pathname.match(/^\/motif\/([^/]+)\/listen\/?$/);
  var slug = m ? m[1] : '';
  if (!slug) { fatal('no entry in this URL'); return; }

  var params = new URLSearchParams(window.location.search);
  var authFlag = params.get('auth');
  if (authFlag) {
    history.replaceState({}, '', window.location.pathname);
  }

  /* The render is deliberately OUTSIDE the fetch chain. Calling it inside a
     .then means any error it throws lands in the .catch below and is reported
     as "entry not found" — which is what happened on 2026-09-15 when a helper
     went missing in a refactor, and cost real time because the message named
     the wrong thing entirely. */
  fetch('/motif/data/' + slug + '.json')
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .catch(function () { fatal('entry not found'); return null; })
    .then(function (e) {
      if (!e) return;
      entry = e;
      tracks = e.tracks || [];
      if (!tracks.length) { fatal('this entry has no playlist yet'); return; }
      sides = buildSides(e);
      renderSplash();
    });

  /* ============================================================
     SPLASH
     ============================================================ */

  function renderSplash() {
    root.innerHTML = '';

    root.appendChild(deckHead({ empty: true }));

    var wrap = el('div', 'splash');
    var top = el('div', 'splash-top');

    /* The label: cover art over a printed band. Four sleeves if there is no
       cover image — the borrowed-art placeholder the design still calls
       unsolved, but it is what exists. */
    var label = el('div', 'label');
    label.appendChild(coverArt('label-art'));
    var band = el('div', 'label-band');
    band.innerHTML = '<span>Motif · No. ' + esc(entry.no || 'T') + '</span><span>' +
      (sides.length > 1 ? 'Side ' + esc(sides[0].label) : 'One side') + '</span>';
    label.appendChild(band);
    top.appendChild(label);

    var title = el('div', 'splash-title');
    title.appendChild(el('div', 'no', 'Memorex · mixtape'));
    var h = document.createElement('h1');
    h.textContent = entry.title || 'Untitled';
    title.appendChild(h);

    // Who it is from, above the blurb: the answer changes whether the blurb
    // gets read at all. Quiet, and never absent.
    var cur = entry.curator || {};
    if (cur.name || cur.handle) {
      var by = el('div', 'by');
      by.innerHTML = '<span class="v">a mixtape by <b>' + esc(cur.name || cur.handle) + '</b></span>' +
        (cur.handle ? '<span class="h">' + esc(cur.handle) + '</span>' : '');
      title.appendChild(by);
    }

    var blurb = document.createElement('p');
    blurb.textContent = 'Played blind. Each song turns a card face up as it begins.';
    title.appendChild(blurb);
    top.appendChild(title);
    wrap.appendChild(top);
    wrap.appendChild(el('div', 'splash-slack'));

    /* Load-bearing: the requirement appears before the tap, never at a consent
       screen halfway in. A real listener was lost for want of this line. */
    var facts = el('div', 'facts');
    facts.appendChild(fact('Requires', appleReady()
      ? 'Plays through your own Apple Music'
      : 'Plays through your own Spotify Premium'));
    var total = totalMs();
    facts.appendChild(fact('Length', tracks.length + ' songs' + (total ? ' · ' + roughLength(total) : '')));
    if (sides.length > 1) {
      facts.appendChild(fact('Sides', sides.map(function (x) { return x.label; }).join(' and ') +
        ' — it stops between them'));
    }
    wrap.appendChild(facts);

    var doors = el('div', 'doors');

    if (authFlag === 'denied') {
      doors.appendChild(notice('Permission declined',
        'Memorex could not reach your music service, so nothing has played and nothing has been revealed. You can try again whenever you like.'));
    } else if (authFlag === 'error') {
      doors.appendChild(notice('Could not sign in',
        'Something went wrong signing in. Try again.'));
    }

    playBtn = el('button', 'key');
    /* "Play side A" on a multi-side tape. It discloses that another side
       exists and nothing else — no songs — so the blind holds, and the flip
       stops being an ambush when it arrives. */
    playBtn.textContent = sides.length > 1 ? 'Play side ' + sides[0].label : 'Start the tape';
    playBtn.addEventListener('click', function () {
      startWith(appleReady() ? 'apple' : 'spotify');
    });
    doors.appendChild(playBtn);

    // The side door, stated as a plaque rather than a second button: it is a
    // fact about access, not an equal choice.
    var p2 = el('div', 'plaque');
    var k = el('div', 'k');
    k.innerHTML = '<span>Spotify · side door</span><span>5 seats · by hand</span>';
    var v = el('div', 'v');
    v.textContent = 'Spotify needs Niles to add you first — ask him.';
    p2.appendChild(k); p2.appendChild(v);
    if (appleReady()) {
      p2.style.cursor = 'pointer';
      p2.addEventListener('click', function () { startWith('spotify'); });
    }
    doors.appendChild(p2);

    wrap.appendChild(doors);
    root.appendChild(wrap);

    statusEl = el('div', 'status-line');
    root.appendChild(statusEl);
    prepare();
  }

  function fact(k, v) {
    var d = el('div', 'fact');
    var a = el('span', 'k'); a.textContent = k;
    var b = el('span', 'v'); b.textContent = v;
    d.appendChild(a); d.appendChild(b);
    return d;
  }

  function notice(h, b, id) {
    var n = el('div', 'notice');
    var x = el('div', 'h'); x.textContent = h;
    var y = el('div', 'b'); y.textContent = b;
    n.appendChild(x); n.appendChild(y);
    if (id) { var z = el('div', 'id'); z.textContent = id; n.appendChild(z); }
    return n;
  }

  /* The tape's own art: the cover if there is one, else the first four
     sleeves. Used on the splash label, and on the flip's lock screen. */
  function coverArt(cls) {
    var art = el('div', cls);
    if (entry.cover_image_url) {
      art.className = cls + ' ' + cls + '--single';
      var one = document.createElement('img');
      one.src = entry.cover_image_url;
      one.alt = '';
      art.appendChild(one);
      return art;
    }
    for (var i = 0; i < 4; i++) {
      var im = document.createElement('img');
      var t = tracks[i] || tracks[0];
      im.src = (t && t.card && t.card.front_image_url) || '';
      im.alt = '';
      art.appendChild(im);
    }
    return art;
  }

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Connect the SDK while the listener is still reading the splash. Connecting
  // needs no gesture; only starting audio does. Without this the first tap is
  // spent loading the SDK and appears to do nothing.
  function prepare() {
    // Warm whichever front door this entry actually opens. Configuring
    // MusicKit needs no gesture and takes a moment; doing it now means the
    // first tap spends itself on playback rather than on setup.
    if (appleReady()) {
      ensureMusic().catch(function (e) { trace('apple warm failed: ' + (e && e.message)); });
      // Deliberately NOT returning. The Spotify side door needs its SDK warm
      // too, or the first tap on "Use Spotify instead" is spent loading it and
      // appears to do nothing — the exact failure the note below describes.
      // A listener who never touches the side door pays one idle SDK load.
    }
    ensureAuth().then(function (ok) {
      if (!ok) return; // first tap sends them to Spotify instead
      // Warm the SDK quietly. The button stays live the whole time — tapping
      // during connection is fine now, it simply waits. Disabling it here is
      // what made the button look like it was cycling for no reason.
      ensurePlayer().catch(function (e) {
        // On an Apple-first entry this is only the SIDE DOOR warming up, and a
        // failure here must stay silent. A listener with Apple Music and no
        // Spotify Premium was being shown "needs Spotify Premium" on the
        // splash of a mixtape that plays perfectly well on Apple — which is
        // exactly the audience Apple exists to reach. Observed 2026-09-13/14:
        // the same listener bounced four times.
        //
        // ensurePlayer() remembers a terminal refusal and rejects immediately
        // on the next call, so if they do choose Spotify they still get the
        // real reason, at the moment it is actually true for them.
        if (appleReady()) {
          trace('spotify side door unavailable: ' + (e && e.message));
          markSideDoorClosed(e);
          return;
        }
        // A permanent refusal is worth surfacing before they tap and wait.
        if (terminalReason) blockedNote(e);
        else say(friendly(e), true);
      });
    });
  }

  /* The side door is not available to this listener. Say so quietly, on the
     side-door note itself, rather than letting them tap into a refusal we
     already know about. Never an error box: nothing is wrong with the mixtape
     and Apple is sitting right there. */
  function markSideDoorClosed(e) {
    var note = root.querySelector('.side-door-note');
    if (!note) return;
    note.textContent = (e && e.message === 'premium_required')
      ? 'Spotify needs its own Premium subscription — use Apple Music above.'
      : 'Spotify is not available right now — use Apple Music above.';
    var btn = root.querySelector('.side-door-btn');
    if (btn) btn.style.opacity = '0.45';
  }

  function errNote(text) {
    var p = el('p', 'splash-err');
    p.textContent = text;
    return p;
  }

  /* ============================================================
     AUTH + START
     ============================================================ */

  // Explicit platform choice from the splash. Apple is the front door and
  // needs no allowlist; Spotify is the side door for the five people Niles
  // can add by hand.
  function startWith(which) {
    if (which === 'apple') { onApplePlayTap(); return; }
    service = 'spotify';
    onPlayTap();
  }

  function onPlayTap() {
    if (starting) return;

    // MUST be the first thing, synchronously: iOS unlocks the audio element
    // only during a real user interaction. Any await before this spends the
    // gesture and the tap silently does nothing. The unlock persists on the
    // element afterwards, which is why a tap can safely wait for the SDK.
    activate();

    starting = true;
    playBtn.disabled = true;
    playBtn.textContent = 'Starting';
    say('');

    // A cookie existing is not the same as a working token — a revoked or
    // expired refresh token still leaves the cookie in place. Prove the token
    // works before handing the SDK something that will never arrive.
    ensureAuth()
      .then(function (ok) {
        trace('auth status: ' + ok);
        if (!ok) return false;
        return getToken().then(function () { trace('token ok'); return true; }).catch(function (e) {
          trace('token failed: ' + (e && e.message));
          if (e && e.message === 'not_authenticated') return false;
          throw e;
        });
      })
      .then(function (ok) {
        if (!ok) {
          window.location.href = '/api/motif-auth?action=login&return=' +
            encodeURIComponent(window.location.pathname);
          return null;
        }
        // Wait for the device rather than sending the listener back to a Play
        // button. The gesture is already spent and still counts.
        return ensurePlayer().then(beginPlayback);
      })
      .catch(function (e) {
        starting = false;
        playBtn.disabled = false;
        playBtn.textContent = 'Play';
        // A one-line status under the deck is too easy to miss when the button
        // just springs back. Blocking reasons belong on the splash itself.
        blockedNote(e);
      });
  }

  var reported = false;
  function reportFailure(e) {
    if (reported) return;
    reported = true;
    try {
      fetch('/api/motif-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: entry && entry.slug,
          reason: (e && e.message) || 'unknown',
          diag: diag
        })
      }).catch(function () {});
    } catch (_) {}
  }

  function blockedNote(e) {
    say('');
    trace('blocked: ' + (e && e.message));
    reportFailure(e);
    var wrap = root.querySelector('.splash');
    if (!wrap) { say(friendly(e), true); return; }
    var old = wrap.querySelector('.splash-err');
    if (old) old.remove();

    var box = errNote(friendly(e));
    var copy = document.createElement('button');
    copy.className = 'play-btn ghost';
    copy.style.marginTop = '14px';
    copy.textContent = 'Copy details';
    copy.addEventListener('click', function () {
      var text = 'MOTIF PLAYER — ' + (entry && entry.slug) + '\n' + diag.join('\n');
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(
          function () { copy.textContent = 'Copied — send these to Niles'; },
          function () { showRaw(box, text); }
        );
      } else {
        showRaw(box, text);
      }
    });
    box.appendChild(document.createElement('br'));
    box.appendChild(copy);
    wrap.appendChild(box);
  }

  // Clipboard is blocked in some in-app browsers; fall back to selectable text.
  function showRaw(box, text) {
    var pre = document.createElement('textarea');
    pre.readOnly = true;
    pre.value = text;
    pre.style.cssText = 'width:100%;min-height:140px;margin-top:10px;font-size:11px;' +
      'font-family:var(--mono);background:var(--card-bg);border:1px solid var(--hair);' +
      'border-radius:6px;padding:8px;color:var(--ink)';
    box.appendChild(pre);
    pre.select();
  }

  function ensureAuth() {
    return fetch('/api/motif-auth?action=status', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (d) { return Boolean(d.authenticated); })
      .catch(function () { return false; });
  }

  var tokenCache = { value: null, expiresAt: 0 };
  function getToken() {
    if (tokenCache.value && Date.now() < tokenCache.expiresAt - 30000) {
      return Promise.resolve(tokenCache.value);
    }
    return fetch('/api/motif-token', { credentials: 'same-origin' })
      .then(function (r) {
        if (r.status === 401) throw new Error('not_authenticated');
        if (!r.ok) throw new Error('token_' + r.status);
        return r.json();
      })
      .then(function (d) {
        tokenCache.value = d.access_token;
        tokenCache.expiresAt = Date.now() + (d.expires_in || 3600) * 1000;
        return d.access_token;
      });
  }

  function api(path, opts) {
    var o = opts || {};
    return getToken().then(function (tok) {
      return fetch('https://api.spotify.com/v1' + path, {
        method: o.method || 'GET',
        headers: {
          Authorization: 'Bearer ' + tok,
          'Content-Type': 'application/json'
        },
        body: o.body ? JSON.stringify(o.body) : undefined
      });
    });
  }

  // Single-flight. Called from both the splash and the Play tap, and without
  // this each call built another Spotify.Player — stacked instances competing
  // for the same account, which is why repeated taps went nowhere.
  var playerPromise = null;
  // Some refusals are permanent for this account — retrying cannot change the
  // answer. Remembering them means the listener is told the real reason at
  // once, instead of waiting out a reconnect that reports a timeout. A
  // non-Premium account hit exactly that: Spotify said "premium only" at 1.1s,
  // and the tap at 18.6s reported a network timeout at 33.6s.
  var terminalReason = null;

  function ensurePlayer() {
    if (deviceId) return Promise.resolve(true);
    if (terminalReason) return Promise.reject(new Error(terminalReason));
    if (playerPromise) return playerPromise;
    playerPromise = connectPlayer().catch(function (e) {
      playerPromise = null;   // let a later attempt rebuild it
      throw e;
    });
    return playerPromise;
  }

  function connectPlayer() {
    if (player) {
      // Already built, just not ready yet — reconnect rather than duplicate.
      return new Promise(function (resolve, reject) {
        var t = setTimeout(function () { reject(new Error('sdk_timeout')); }, 15000);
        var check = setInterval(function () {
          if (deviceId) { clearInterval(check); clearTimeout(t); resolve(true); }
        }, 250);
        player.connect();
      });
    }
    trace('connecting player');
    return loadSdk().then(function () {
      trace('sdk script loaded');
      return new Promise(function (resolve, reject) {
        var settled = false;
        var timer = setTimeout(function () {
          if (!settled) { settled = true; reject(new Error('sdk_timeout')); }
        }, 15000);

        player = new window.Spotify.Player({
          name: 'Motif',
          getOAuthToken: function (cb) {
            // Swallowing a failure here is fatal-but-silent: the SDK simply
            // never receives a token, never becomes ready, and the listener
            // waits out the timeout for what looks like no reason.
            getToken().then(cb).catch(function (err) {
              fail(err && err.message === 'not_authenticated' ? 'not_authenticated' : 'token_failed');
            });
          },
          volume: 0.85
        });

        player.addListener('ready', function (d) {
          trace('player ready: ' + d.device_id);
          deviceId = d.device_id;
          if (!settled) { settled = true; clearTimeout(timer); resolve(true); }
        });
        player.addListener('not_ready', function () { trace('not_ready'); deviceId = null; });
        player.addListener('player_state_changed', onStateChange);

        // These have to settle the promise, not just log. A free account fires
        // account_error and then never becomes ready, so leaving it unsettled
        // meant the listener stared at "Starting" for the full 15s timeout and
        // was then told the network had failed, which was simply untrue.
        function fail(reason) {
          trace('FAIL: ' + reason);
          if (reason === 'premium_required' || reason === 'not_authenticated') {
            terminalReason = reason;
          }
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(new Error(reason));
        }
        player.addListener('account_error', function (e) {
          trace('account_error: ' + (e && e.message));
          fail('premium_required');
        });
        player.addListener('authentication_error', function () { fail('not_authenticated'); });
        player.addListener('initialization_error', function (e) {
          trace('initialization_error: ' + (e && e.message));
          fail(e && e.message ? 'init:' + e.message : 'init');
        });
        player.addListener('playback_error', function (e) { trace('playback_error: ' + (e && e.message)); });

        player.connect().then(function (ok) { trace('connect() returned ' + ok); });
      });
    });
  }

  /* ============================================================
     APPLE MUSIC — MusicKit adapter

     Proven by the 2026-09-13 spike, and deliberately NOT a port of the Spotify
     rules above. Those exist because Spotify gave us no client-side queue.
     MusicKit gives the page a real one, so:

       · Rule 2 (never seed more than one URI) has no counterpart. Apple does
         not reorder appended tracks ahead of the context.
       · Rule 4 (detect the seed context replaying) is obsolete. Apple reaches
         playbackState "completed" on its own.

     What DOES carry over is rule 3, because it is a platform rule and not a
     Spotify one: iOS will not start a new media source without a user
     activation. Automatic transitions must come from the queue. Verified with
     the phone locked: four consecutive transitions and three appends, all
     while hidden.

     autoplay:false is load-bearing. Left on, MusicKit appends a station of
     similar songs when the list runs out, which both breaks the blind and
     means the tape never ends.
     ============================================================ */

  var music = null;
  var appleQueuedUpTo = -1;

  function loadMusicKit() {
    if (window.MusicKit) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      // The library dispatches musickitloaded as it parses, so the listener
      // has to be attached before the script is injected.
      document.addEventListener('musickitloaded', function () { resolve(); });
      var s = document.createElement('script');
      s.src = 'https://js-cdn.music.apple.com/musickit/v3/musickit.js';
      s.async = true;
      s.onload = function () { if (window.MusicKit) resolve(); };
      s.onerror = function () { reject(new Error('sdk_load')); };
      document.head.appendChild(s);
    });
  }

  function ensureMusic() {
    if (music) return Promise.resolve(music);
    return loadMusicKit()
      .then(function () {
        return fetch('/api/motif-apple-token', { credentials: 'same-origin' })
          .then(function (r) {
            if (!r.ok) throw new Error('apple_token');
            return r.json();
          });
      })
      .then(function (d) {
        trace('apple developer token ok');
        return window.MusicKit.configure({
          developerToken: d.token,
          app: { name: 'Motif', build: '1.0.0' }
        });
      })
      .then(function () {
        music = window.MusicKit.getInstance();
        wireApple();
        trace('musickit configured');
        return music;
      });
  }

  function wireApple() {
    var E = window.MusicKit.Events;

    music.addEventListener(E.nowPlayingItemDidChange, function () {
      var item = music.nowPlayingItem;
      if (!item) return;
      var now = normApple(item);
      if (now.key === mediaFor) return;
      mediaFor = now.key;

      var known = indexOfAppleId(now.key);
      trace('apple now playing [' + known + '] ' + now.title);
      if (known > -1) {
        idx = known;
        pulse('track', known);
        reveal(known, now);
        appleAppendNext();
      }
      setMediaSession(now);
      renderNowPlaying(now);
      updateTransport();
    });

    music.addEventListener(E.playbackStateDidChange, function (e) {
      var states = window.MusicKit.PlaybackStates || {};
      paused = e && (e.state === states.paused || e.state === states.stopped);
      updateTransport();
      // Apple tells us the queue drained. No inference needed — but a drained
      // queue now means one of two things, and the index says which.
      if (e && e.state === states.completed && !finished && !awaitingFlip) {
        if (atSideBreak()) { trace('apple: side A ran out'); flipPrompt(); return; }
        trace('apple queue completed');
        finish();
      }
    });

    music.addEventListener(E.playbackTimeDidChange, function () {
      updateProgress(music.currentPlaybackTime || 0, music.currentPlaybackDuration || 0);
    });

    music.addEventListener(E.mediaPlaybackError, function (e) {
      trace('apple playback error: ' + JSON.stringify((e && e.error) || e).slice(0, 160));
    });
  }

  function indexOfAppleId(id) {
    for (var i = 0; i < tracks.length; i++) {
      if (String(tracks[i].apple_id) === String(id)) return i;
    }
    return -1;
  }

  function appleSeedAt(i) {
    idx = i;
    appleQueuedUpTo = i;
    finished = false;
    mediaFor = null;
    return music.setQueue({
      songs: [String(tracks[i].apple_id)],
      startPlaying: true,
      autoplay: false
    }).then(function () {
      paused = false;
      return appleAppendNext();
    });
  }

  // One song ahead, appended as each starts. Confirmed working while hidden,
  // which is what makes the blind hold at depth two rather than needing the
  // whole list handed over up front.
  function appleAppendNext() {
    var n = appleQueuedUpTo + 1;
    if (!music || n >= tracks.length) return Promise.resolve(false);
    // The whole flip: simply stop feeding the queue at the boundary.
    // The whole flip: stop feeding the queue at the boundary and let it run out.
    if (pos(n).side !== pos(idx).side) {
      trace('holding at side break — not queueing track ' + n);
      return Promise.resolve(false);
    }
    var id = tracks[n].apple_id;
    if (!id) return Promise.resolve(false);
    return music.playLater({ songs: [String(id)] })
      .then(function () { appleQueuedUpTo = n; return true; })
      .catch(function (e) { trace('playLater failed: ' + (e && e.message)); return false; });
  }

  function onApplePlayTap() {
    if (starting) return;
    starting = true;
    service = 'apple';
    playBtn.disabled = true;
    playBtn.textContent = 'Starting';
    say('');

    ensureMusic()
      .then(function () {
        // authorize() opens a popup rather than redirecting away, so the page
        // survives and the activation with it. The spike confirmed one tap is
        // enough — unlike Spotify, whose redirect destroys the gesture.
        if (music.isAuthorized) return true;
        return music.authorize().then(function () { return true; });
      })
      .then(function () {
        var modes = window.MusicKit.PlaybackMode || {};
        if (music.playbackMode === modes.PREVIEW_ONLY) {
          throw new Error('apple_subscription_required');
        }
        idx = 0;
        return appleSeedAt(0);
      })
      .then(function () {
        renderPlayer();
        requestWakeLock();
      })
      .catch(function (e) {
        starting = false;
        playBtn.disabled = false;
        playBtn.textContent = 'Play';
        trace('apple start failed: ' + (e && e.message));
        blockedNote(e);
      });
  }

  function loadSdk() {
    if (window.Spotify) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      window.onSpotifyWebPlaybackSDKReady = resolve;
      var s = document.createElement('script');
      s.src = 'https://sdk.scdn.co/spotify-player.js';
      s.onerror = function () { reject(new Error('sdk_load')); };
      document.head.appendChild(s);
    });
  }

  function activate() {
    if (player && player.activateElement) {
      try { player.activateElement(); } catch (_) {}
    }
  }

  function beginPlayback() {
    idx = 0;
    return seedAt(0).then(function () {
      renderPlayer();
      requestWakeLock();
    });
  }

  /* ── Rule 1: seed the context with exactly ONE track. Only ever called
     from a user gesture (first play, back, replay). ── */
  function seedAt(i) {
    idx = i;
    queuedUpTo = i;
    finished = false;
    return api('/me/player/play?device_id=' + deviceId, {
      method: 'PUT',
      body: { uris: [tracks[i].spotify_uri] }
    }).then(function (r) {
      trace('play http ' + r.status);
      if (r.status === 404) { deviceId = null; throw new Error('device_lost'); }
      if (r.status === 403) throw new Error('premium_required');
      if (!r.ok) throw new Error('play_' + r.status);
      paused = false;
      return appendNext();
    });
  }

  /* ── Rule 2: keep exactly one track queued ahead. ── */
  function appendNext() {
    var n = queuedUpTo + 1;
    if (!deviceId || n >= tracks.length) return Promise.resolve(false);
    // The whole flip: stop feeding the queue at the boundary and let it run out.
    if (pos(n).side !== pos(idx).side) {
      trace('holding at side break — not queueing track ' + n);
      return Promise.resolve(false);
    }
    return api('/me/player/queue?device_id=' + deviceId +
               '&uri=' + encodeURIComponent(tracks[n].spotify_uri), { method: 'POST' })
      .then(function (r) {
        if (!r.ok) return false;
        queuedUpTo = n;
        return true;
      })
      .catch(function () { return false; });
  }

  function indexOfUri(uri) {
    for (var i = 0; i < tracks.length; i++) {
      if (tracks[i].spotify_uri === uri) return i;
    }
    return -1;
  }

  /* ============================================================
     PLAYBACK EVENTS
     ============================================================ */

  function onStateChange(state) {
    if (!state) return;
    var cur = state.track_window && state.track_window.current_track;
    paused = state.paused;
    updateTransport();
    updateProgress(state.position, state.duration);

    if (!cur) return;

    if (cur.uri !== mediaFor) {
      mediaFor = cur.uri;
      var known = indexOfUri(cur.uri);

      /* Rule 4: a drained queue replays the seed track. That used to mean the
         end; with sides it can also mean side A ran out, because we stopped
         feeding the queue at the boundary. Spotify gives the same signal for
         both, so the index disambiguates — and the flip is checked first
         because it is the earlier boundary. */
      if (known === 0 && !finished && !awaitingFlip && atSideBreak()) {
        svcPause();
        flipPrompt();
        return;
      }
      if (known === 0 && revealed.length >= tracks.length && !finished) {
        finish();
        return;
      }

      var now = normSpotify(cur);
      if (known > -1) {
        idx = known;
        pulse('track', known);
        reveal(known, now);
        appendNext();
      }
      setMediaSession(now);
      renderNowPlaying(now);
    }

    if (state.paused && state.position === 0 && !finished && !awaitingFlip && atSideBreak()) {
      flipPrompt();
      return;
    }
    if (state.paused && state.position === 0 && idx === tracks.length - 1 &&
        revealed.length >= tracks.length && !finished) {
      finish();
    }
  }

  /* ============================================================
     WHAT IS PLAYING — one shape, either service

     The deck, the card, the now-playing line and the lock screen all used to
     take a raw Spotify track object and dig through .artists[].name and
     .album.images[0].url. Normalising here is what lets a second service exist
     without a second copy of the deck.
     ============================================================ */

  function normSpotify(cur) {
    var imgs = (cur.album && cur.album.images) || [];
    return {
      key: cur.uri,
      title: cur.name || '',
      artist: (cur.artists || []).map(function (a) { return a.name; }).join(', '),
      artUrl: imgs.length ? imgs[0].url : null,
      artwork: imgs.map(function (i) {
        return { src: i.url, sizes: i.width + 'x' + i.height, type: 'image/jpeg' };
      })
    };
  }

  function normApple(item) {
    // MusicKit exposes artwork as a template with {w}/{h} placeholders.
    var art = null;
    try { art = item.artwork && item.artwork.url; } catch (_) { art = null; }
    function at(px) { return art ? art.replace('{w}', px).replace('{h}', px) : null; }
    var title = '';
    var artist = '';
    try { title = item.title || (item.attributes && item.attributes.name) || ''; } catch (_) {}
    try { artist = item.artistName || (item.attributes && item.attributes.artistName) || ''; } catch (_) {}
    return {
      key: String(item.id || ''),
      title: title,
      artist: artist,
      artUrl: at(1000),
      artwork: art
        ? [256, 512, 1000].map(function (px) {
            return { src: at(px), sizes: px + 'x' + px, type: 'image/jpeg' };
          })
        : []
    };
  }

  /* ============================================================
     DECK — one block per side, a grid of slots, cards as they play
     ============================================================ */

  /* The transport panel: two reels and the ticks of the CURRENT side only.
     A two-sided tape is two runs of nine, not one run of eighteen. */
  function deckHead(opts) {
    opts = opts || {};
    var head = el('div', 'deck-head');

    var supply = el('div', 'reel reel--supply');
    var takeup = el('div', 'reel reel--takeup');
    if (opts.spent) { supply.className = 'reel reel--empty'; takeup.className = 'reel reel--full'; }
    supply.appendChild(document.createElement('i'));
    takeup.appendChild(document.createElement('i'));

    var counter = el('div', 'counter');
    var ticks = el('div', 'ticks');
    var line = el('div', 'counter-line');

    var p = tracks.length ? pos(idx) : null;
    var n = opts.empty ? (p ? p.total : tracks.length) : p.total;
    for (var i = 0; i < n; i++) {
      var t = document.createElement('span');
      if (!opts.empty) {
        // Ticks are derived from the played index, never from a clock, so the
        // panel is correct on return from background with nothing running.
        if (i < p.inSide) t.className = 'played';
        else if (i === p.inSide && !opts.spent) t.className = 'current';
        else if (opts.spent) t.className = 'played';
      }
      ticks.appendChild(t);
    }

    if (opts.empty) {
      line.innerHTML = '<span><b>Song —</b></span><span>of —</span>';
    } else if (opts.spent) {
      line.innerHTML = '<span><b>End of side ' + esc(p.label) + '</b></span><span>' +
        p.total + ' of ' + p.total + '</span>';
    } else {
      line.innerHTML = '<span><b>Song ' + String(p.inSide + 1).padStart(2, '0') + '</b></span><span>of ' +
        p.total + (p.sided ? ' · side ' + esc(p.label) : '') + '</span>';
    }

    counter.appendChild(ticks); counter.appendChild(line);
    head.appendChild(supply); head.appendChild(counter); head.appendChild(takeup);
    return head;
  }

  function buildDeck() {
    var deck = el('div', 'deck');

    if (mode === 'rest') {
      var hint = el('div', 'deck-hint');
      var p = pos(idx);
      hint.innerHTML = '<span>Press the lit card to open it</span><b>' +
        (p.inSide + 1) + ' / ' + p.total + '</b>';
      deck.appendChild(hint);
    }

    var blocks = el('div', 'deck-sides');
    var run = 0;
    for (var n = 0; n < sides.length; n++) {
      var block = el('div', 'side-block');
      var live = pos(idx).side === n;

      /* Only labelled when there is more than one side — a one-sided tape
         renders exactly as before. */
      if (sides.length > 1) {
        var lab = el('div', 'side-label' + (live ? ' side-label--live' : ''));
        var done = revealed.filter(function (ti) { return pos(ti).side === n; }).length;
        var status = live ? (awaitingFlip ? 'Complete' : 'Playing')
                          : (done >= sides[n].total ? 'Complete' : (done ? 'Complete' : (n > pos(idx).side ? (awaitingFlip ? 'Waiting' : 'Not started') : 'Complete')));
        lab.innerHTML = '<span>Side ' + esc(sides[n].label) + '</span><b>' + status + '</b>';
        block.appendChild(lab);
      }

      var grid = el('div', 'grid');
      for (var i = 0; i < sides[n].total; i++) {
        grid.appendChild(slotFor(run + i));
      }
      block.appendChild(grid);
      blocks.appendChild(block);
      run += sides[n].total;
    }
    deck.appendChild(blocks);
    return deck;
  }

  /* One tile. Unplayed slots are inert divs with no content and no handler —
     no title, no art, no alt text. That is the blind. */
  function slotFor(i) {
    if (revealed.indexOf(i) === -1) return el('div', 'slot');

    var t = tracks[i];
    var f = face(t, artFor(i));
    var isCurrent = (i === idx) && !awaitingFlip && !finished;

    if (flippedInGrid[i]) return gridBack(i, t, f);

    var card = el('div', 'card' + (f.contain ? ' card--contain' : '') + (isCurrent ? ' card--current' : ''));
    if (f.src) {
      var im = document.createElement('img');
      im.src = f.src; im.alt = '';
      card.appendChild(im);
    } else {
      card.className += ' card--back';
      var nb = el('div', 'no');
      nb.innerHTML = '<span>' + esc(entry.no || 'T') + '</span><span>' + String(i + 1).padStart(2, '0') + '</span>';
      var tb = el('div', 't'); tb.textContent = t.title || '';
      card.appendChild(nb); card.appendChild(tb);
    }
    card.addEventListener('click', function (e) {
      e.stopPropagation();
      // The spotlight is for the current song. Anything already played flips
      // in place instead.
      if (isCurrent) { mode = 'spot'; renderPlayer(); }
      else { flippedInGrid[i] = !flippedInGrid[i]; renderPlayer(); }
    });
    return card;
  }

  function gridBack(i, t, f) {
    var card = el('div', 'card card--back');
    var nb = el('div', 'no');
    nb.innerHTML = '<span>' + esc(entry.no || 'T') + '</span><span>' + String(i + 1).padStart(2, '0') + '</span>';
    card.appendChild(nb);

    if (f.img) {
      /* At tile size an image and a note cannot both survive. The image wins;
         the note is one press away on the full liner note. */
      var fig = el('div', 'fig');
      var im = document.createElement('img');
      im.src = f.img; im.alt = '';
      fig.appendChild(im);
      card.appendChild(fig);
    } else {
      var body = el('div');
      var tb = el('div', 't'); tb.textContent = t.title || '';
      var ab = el('div', 'a'); ab.textContent = t.artist || '';
      body.appendChild(tb); body.appendChild(ab);
      if (f.text) {
        var nn = el('div', 'n');
        nn.textContent = f.text.length > 90 ? f.text.slice(0, 88) + '…' : f.text;
        body.appendChild(nn);
      }
      card.appendChild(body);
    }
    card.addEventListener('click', function (e) {
      e.stopPropagation();
      flippedInGrid[i] = false;
      renderPlayer();
    });
    return card;
  }

  /* ---- the spotlight: the deck becomes the card ---- */

  function buildStage() {
    var stage = el('div', 'stage');
    var t = tracks[idx];
    var f = face(t, artFor(idx));
    var p = pos(idx);

    var bar = el('div', 'stage-bar');
    bar.innerHTML = mode === 'spot'
      ? '<span class="live">Song ' + (p.inSide + 1) + ' of ' + p.total + '</span><span>Close</span>'
      : '<span class="live">Memorex · ' + esc(entry.no || 'T') + ' · ' + esc(p.label) +
        String(p.inSide + 1).padStart(2, '0') + '</span><span>Close</span>';
    bar.addEventListener('click', function (e) { e.stopPropagation(); mode = 'rest'; renderPlayer(); });
    stage.appendChild(bar);

    stage.appendChild(mode === 'spot' ? buildSleeve(t, f) : buildLiner(t, f, p));
    return stage;
  }

  function buildSleeve(t, f) {
    /* fit:"contain" drops the scrim and the dark caption band entirely — a
       near-solid band across a sheet of paper reads as damage. The scrim
       exists only because the listener's album art is arbitrary, and a
       curator-supplied scan is not. */
    var sl = el('div', 'sleeve' + (f.contain ? ' sleeve--paper' : ''));
    if (f.contain) {
      var holder = el('div', 'sleeve-art');
      var im = document.createElement('img'); im.src = f.src || ''; im.alt = '';
      holder.appendChild(im);
      sl.appendChild(holder);
    } else {
      var im2 = document.createElement('img'); im2.src = f.src || ''; im2.alt = '';
      sl.appendChild(im2);
      sl.appendChild(el('div', 'sleeve-ramp'));
    }
    var cap = el('div', 'sleeve-cap');
    var tt = el('div', 't'); tt.textContent = t.title || '';
    var aa = el('div', 'a'); aa.textContent = t.artist || '';
    var hh = el('div', 'h'); hh.textContent = 'Press the sleeve to turn it over';
    cap.appendChild(tt); cap.appendChild(aa); cap.appendChild(hh);
    sl.appendChild(cap);
    sl.addEventListener('click', function (e) { e.stopPropagation(); mode = 'turn'; renderPlayer(); });
    return sl;
  }

  function buildLiner(t, f, p) {
    var liner = el('div', 'liner' + (f.img ? ' liner--figured' : ''));
    liner.appendChild(el('div', 'liner-rules'));

    var top = el('div', 'liner-band liner-band--top');
    top.innerHTML = '<span>Memorex · No. ' + esc(entry.no || 'T') + '</span><span>' +
      (p.sided ? 'Side ' + esc(p.label) + ' · ' : '') + String(p.inSide + 1).padStart(2, '0') + '</span>';
    liner.appendChild(top);

    var body = el('div', 'liner-body');
    var head = document.createElement('div');
    head.style.cssText = 'display:flex;flex-direction:column;gap:5px;flex:0 0 auto';
    var tt = el('div', 't'); tt.textContent = t.title || '';
    var aa = el('div', 'a'); aa.textContent = t.artist || '';
    head.appendChild(tt); head.appendChild(aa);
    body.appendChild(head);

    /* Order is not negotiable: image above text. A typed note under its
       handwritten original reads as a transcription; the reverse reads as a
       caption on a photo. */
    if (f.img) {
      var fig = el('div', 'liner-figure');
      var im = document.createElement('img'); im.src = f.img; im.alt = '';
      fig.appendChild(im);
      body.appendChild(fig);
    }
    body.appendChild(el('div', 'rule'));
    if (f.text) { var nn = el('div', 'n'); nn.textContent = f.text; body.appendChild(nn); }
    liner.appendChild(body);

    var bot = el('div', 'liner-band liner-band--bottom');
    bot.innerHTML = '<span>Press to see the sleeve</span>';
    var logo = document.createElement('img');
    logo.src = '/motif/nm-h-logo.png'; logo.alt = '';
    bot.appendChild(logo);
    liner.appendChild(bot);

    /* A long poem scrolls rather than being clipped, so a drag must not read
       as a press. Movement threshold on the same handler. */
    var sy = 0, sx = 0;
    liner.addEventListener('pointerdown', function (e) { sy = e.clientY; sx = e.clientX; });
    liner.addEventListener('click', function (e) {
      e.stopPropagation();
      if (Math.abs(e.clientY - sy) > 8 || Math.abs(e.clientX - sx) > 8) return;
      mode = 'spot'; renderPlayer();
    });
    return liner;
  }

  // Album art for a track, from whichever service is playing.
  var artCache = {};
  function artFor(i) { return artCache[i] || null; }

  function reveal(trackIndex, now) {
    if (now && now.artUrl) artCache[trackIndex] = now.artUrl;
    if (revealed.indexOf(trackIndex) === -1) revealed.push(trackIndex);
    renderPlayer();
  }

  // Going back drops the cards after the target so the deck agrees with what
  // is playing.
  function trimCardsAfter(keepThrough) {
    revealed = revealed.filter(function (ti) { return ti <= keepThrough; });
    Object.keys(flippedInGrid).forEach(function (k) {
      if (Number(k) > keepThrough) delete flippedInGrid[k];
    });
    mode = 'rest';
  }

  /* ============================================================
     PLAYER CHROME
     ============================================================ */

  /* ============================================================
     THE PLAYER — one render, four modes

     mode is derivable from playback state alone: no timers, no persistence.
     A listener who backgrounds at a side break and returns an hour later
     finds the flip screen, not a dead player.
     ============================================================ */

  function renderPlayer() {
    root.innerHTML = '';
    headAt = idx;

    root.appendChild(deckHead({ spent: awaitingFlip }));

    if (finished) { renderClosing(); return; }
    if (awaitingFlip) { renderFlip(); return; }

    if (mode === 'spot' || mode === 'turn') {
      root.appendChild(buildStage());
    } else {
      npEl = el('div', 'np');
      root.appendChild(npEl);
      root.appendChild(buildDeck());
      if (nowShowing) paintNowPlaying(nowShowing);
    }

    statusEl = el('div', 'status-line');
    root.appendChild(statusEl);

    transportEl = el('div', 'transport');
    transportEl.appendChild(tbtn('t-back', 'Back', goBack));
    transportEl.appendChild(tbtn('t-play', paused ? 'Play' : 'Pause', togglePlay));
    transportEl.appendChild(tbtn('t-next', 'Next', goNext));
    root.appendChild(transportEl);
    updateTransport();
  }

  /* Attached once, not per render: renderPlayer() runs on every track start
     and root survives innerHTML = '', so binding here would stack a listener
     per song. Pressing anywhere outside a card returns to the deck. */
  root.addEventListener('click', function () {
    if (!finished && !awaitingFlip && mode !== 'rest') { mode = 'rest'; renderPlayer(); }
  });

  function tbtn(cls, label, fn) {
    var b = document.createElement('button');
    b.className = cls;
    b.textContent = label;
    b.addEventListener('click', function (e) { e.stopPropagation(); fn(); });
    return b;
  }

  function updateTransport() {
    if (!transportEl) return;
    var p = pos(idx);
    var back = transportEl.querySelector('.t-back');
    var next = transportEl.querySelector('.t-next');
    var play = transportEl.querySelector('.t-play');
    // Back at the first song of a side and next at the last disable rather
    // than wrap. Next does NOT flip the tape: the flip is a deliberate act
    // with its own key, and advancing into the next side by pressing next
    // would defeat the stop entirely.
    if (back) back.disabled = p.inSide === 0;
    if (next) next.disabled = p.inSide === p.total - 1;
    if (play) play.textContent = paused ? 'Play' : 'Pause';
  }

  /* Progress lives in the transport panel, and the panel counts SONGS. This
     fires on every playback tick, so it must do nothing unless the song has
     actually changed — otherwise it rebuilds the head several times a second. */
  var headAt = -1;
  function updateProgress() {
    if (!root || finished || awaitingFlip) return;
    if (idx === headAt) return;
    headAt = idx;
    var head = root.querySelector('.deck-head');
    if (head) root.replaceChild(deckHead({}), head);
  }

  var nowShowing = null;

  function renderNowPlaying(now) {
    nowShowing = now;
    paintNowPlaying(now);
  }

  function paintNowPlaying(now) {
    if (!npEl) return;
    npEl.innerHTML = '';
    var l = el('div', 'np-label'); l.textContent = 'Playing now';
    var t = el('div', 'np-title'); t.textContent = now.title;
    var a = el('div', 'np-artist'); a.textContent = now.artist;
    npEl.appendChild(l); npEl.appendChild(t); npEl.appendChild(a);
  }

  function svcResume() {
    if (service === 'apple') { if (music) music.play(); return; }
    if (player) player.resume();
  }

  function svcPause() {
    if (service === 'apple') { if (music) music.pause(); return; }
    if (player) player.pause();
  }

  function togglePlay() {
    if (service === 'apple') {
      if (!music) return;
      var states = (window.MusicKit && MusicKit.PlaybackStates) || {};
      var playing = music.playbackState === states.playing;
      paused = playing;           // about to become paused
      updateTransport();
      if (playing) music.pause(); else music.play();
      return;
    }
    if (!player) return;
    player.getCurrentState().then(function (s) {
      if (!s) { player.resume(); return; }
      paused = s.paused;
      updateTransport();
      return s.paused ? player.resume() : player.pause();
    }).catch(function () {});
  }

  // Both directions re-seed rather than driving Spotify's queue. Spotify has
  // no way to clear a queue we have already appended to, so after a back the
  // stale entry was still sitting there and the next skip jumped past a track.
  // Re-seeding is deterministic, and a tap carries the user activation a new
  // play call needs. Automatic transitions still ride the queue — that is the
  // path that has to survive a locked screen, and it is untouched.
  function goNext() {
    if (finished || awaitingFlip) return;
    if (service !== 'apple' && !player) return;
    if (idx >= tracks.length - 1) { finish(); return; }
    /* You cannot fast-forward past the end of a side. Next at the last track
       of side A used to cross the boundary silently, which was the only way
       left to reach side B without flipping — and side B is not somewhere a
       listener should arrive by accident (decided 2026-09-15). The flip is
       now the sole entrance, from the splash onward. */
    if (atSideBreak()) { flipPrompt(); return; }
    seedAny(idx + 1).catch(function (e) { say(friendly(e), true); });
  }

  function goBack() {
    if (idx === 0 || finished) return;
    var target = idx - 1;
    trimCardsAfter(target);
    seedAny(target).catch(function (e) { say(friendly(e), true); });
  }

  // A user-initiated jump re-seeds on both services. Neither lets us clear a
  // queue we have already appended to, so without this a back leaves a stale
  // entry and the next skip jumps a track. A tap carries the user activation
  // a fresh play call needs. AUTOMATIC transitions still ride the queue on
  // both — that is the path that has to survive a locked screen.
  function seedAny(i) {
    return service === 'apple' ? appleSeedAt(i) : seedAt(i);
  }

  /* Lock screen for an ordinary track. Artwork comes from the song; the flip
     screen deliberately overrides this with the tape's own cover. */
  function setMediaSession(now) {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: now.title,
        artist: now.artist,
        album: entry.title || 'Memorex',
        artwork: now.artwork || []
      });
      navigator.mediaSession.playbackState = paused ? 'paused' : 'playing';
      navigator.mediaSession.setActionHandler('play', function () { svcResume(); });
      navigator.mediaSession.setActionHandler('pause', function () { svcPause(); });
      navigator.mediaSession.setActionHandler('nexttrack', goNext);
      navigator.mediaSession.setActionHandler('previoustrack', goBack);
    } catch (_) {}
  }

  /* ============================================================
     THE FLIP

     Side A has run out. The tape stops and waits. Niles accepted that this
     will read as a bug the first time someone hits it, which is the honest
     cost — the music stops in a pocket and does not restart until the phone
     comes out. So the prompt has to be unmissable, and the lock screen has to
     say something too, because that is where most listeners will be.
     ============================================================ */

  function flipPrompt() {
    if (awaitingFlip || finished) return;
    awaitingFlip = true;
    mode = 'rest';
    svcPause();
    releaseWakeLock();
    pulse('flip', idx);
    trace('side break reached at track ' + idx);
    renderPlayer();
    setFlipLockScreen();
  }

  function renderFlip() {
    var p = pos(idx);
    var nextLabel = sides[p.side + 1] ? sides[p.side + 1].label : '';

    var card = el('div', 'flip');
    var k = el('div', 'k');
    k.textContent = 'End of side ' + p.label;
    card.appendChild(k);

    /* The whole illustration: side B's chip upside down, because that is how
       the label sits on a real cassette. No drawn tape, no icon. */
    var chips = el('div', 'flip-sides');
    var a = el('div', 'flip-chip flip-chip--done'); a.textContent = 'Side ' + p.label;
    var arrow = el('div', 'flip-arrow'); arrow.textContent = '→';
    var b = el('div', 'flip-chip flip-chip--next'); b.textContent = 'Side ' + nextLabel;
    chips.appendChild(a); chips.appendChild(arrow); chips.appendChild(b);
    card.appendChild(chips);

    var line = el('div', 'b');
    line.textContent = 'Side ' + nextLabel + ' is waiting. Nothing plays until you turn it over.';
    card.appendChild(line);
    root.appendChild(card);

    // The waiting half of the deck is a second, quieter statement of the same
    // fact. No hint row: there is no lit card to press.
    root.appendChild(buildDeck());

    statusEl = el('div', 'status-line');
    root.appendChild(statusEl);

    /* The card explains and the rail acts — the same division the completion
       screen uses. A flip screen with a dead rail reads as one that has
       crashed rather than one that is waiting. */
    var rail = el('div', 'rail');
    var key = el('button', 'key');
    key.textContent = 'Flip the tape';
    key.addEventListener('click', function (e) {
      e.stopPropagation();
      // A tap is exactly what iOS needs to start a new media source, so
      // side B is an ordinary seed rather than a special case.
      awaitingFlip = false;
      requestWakeLock();
      seedAny(sideStart(pos(idx).side + 1)).catch(function (e2) { say(friendly(e2), true); });
    });
    rail.appendChild(key);
    root.appendChild(rail);
  }

  /* Most listeners meet the flip here first — the music simply stops. The
     media item's own fields carry it, with no custom UI. Artwork is the
     TAPE's cover, not the last song's sleeve: the song is over, the object
     that needs an action is the tape. */
  function setFlipLockScreen() {
    if (!('mediaSession' in navigator)) return;
    try {
      var p = pos(idx);
      var art = [];
      if (entry.cover_image_url) {
        art = [{ src: entry.cover_image_url, sizes: '512x512', type: 'image/jpeg' }];
      }
      navigator.mediaSession.metadata = new window.MediaMetadata({
        // Lead with the reason: truncation must never cut "flip the tape"
        // before the words that explain why.
        title: 'End of side ' + p.label + ' — flip the tape',
        artist: (entry.title || 'Memorex') + ((entry.curator && entry.curator.name) ? ' · ' + entry.curator.name : ''),
        album: 'Memorex',
        artwork: art
      });
      navigator.mediaSession.playbackState = 'paused';
      var go = function () {
        var k = root.querySelector('.rail .key');
        if (k) k.click();
      };
      navigator.mediaSession.setActionHandler('play', go);
      navigator.mediaSession.setActionHandler('nexttrack', go);
    } catch (_) {}
  }

  /* ============================================================
     COMPLETION
     ============================================================ */

  function finish() {
    if (finished) return;
    finished = true;
    pulse('complete', idx);
    svcPause();
    releaseWakeLock();
    mode = 'rest';
    renderPlayer();
  }

  function renderClosing() {
    var closing = el('div', 'closing');
    var k = el('div', 'k'); k.textContent = 'That was the tape';
    var t = el('div', 't'); t.textContent = entry.title || 'the mixtape';
    closing.appendChild(k); closing.appendChild(t);
    var cur = entry.curator || {};
    if (cur.name) {
      var sfoot = el('div', 's');
      sfoot.textContent = 'a mixtape by ' + cur.name + ' · ' + tracks.length + ' songs' +
        (sides.length > 1 ? ' · ' + sides.length + ' sides' : '');
      closing.appendChild(sfoot);
    }
    root.appendChild(closing);

    root.appendChild(buildDeck());

    /* Matching service only. The fallback that used to be here offered an
       Apple listener the Spotify playlist, which is the one service they
       cannot use. */
    var url = service === 'apple' ? entry.apple_playlist_url : entry.spotify_playlist_url;

    var rail = el('div', 'rail');
    if (url) {
      var a = document.createElement('a');
      a.className = 'key';
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.style.textAlign = 'center';
      a.style.textDecoration = 'none';
      a.textContent = 'Add this playlist';
      rail.appendChild(a);
    }
    var again = el('button', 'key' + (url ? ' key--quiet' : ''));
    again.textContent = 'Play again';
    again.addEventListener('click', function (e) {
      e.stopPropagation();
      revealed = [];
      flippedInGrid = {};
      artCache = {};
      mediaFor = null;
      finished = false;
      awaitingFlip = false;
      mode = 'rest';
      idx = 0;
      renderPlayer();
      seedAny(0).catch(function (e2) { say(friendly(e2), true); });
    });
    rail.appendChild(again);

    // The primary's slot is spoken for rather than left empty.
    if (!url) {
      var note = el('div', 'rail-note');
      note.textContent = 'No ' + (service === 'apple' ? 'Apple Music' : 'Spotify') + ' playlist link on this tape';
      root.appendChild(note);
    }
    root.appendChild(rail);
  }

  // The screen lock cannot be re-taken silently after backgrounding — iOS
  // denies it without a user gesture. Re-request on the next interaction.
  var wakeLock = null;
  function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    navigator.wakeLock.request('screen')
      .then(function (l) {
        wakeLock = l;
        l.addEventListener('release', function () { wakeLock = null; });
      })
      .catch(function () { wakeLock = null; });
  }
  function releaseWakeLock() {
    if (wakeLock) { try { wakeLock.release(); } catch (_) {} wakeLock = null; }
  }
  document.addEventListener('pointerdown', function () {
    if (!wakeLock && !finished && !awaitingFlip) requestWakeLock();
  });

  /* ============================================================
     HELPERS
     ============================================================ */

  /* Length, for the splash only. "about 1h 2m" rather than a precise number:
     a mixtape announces roughly how long it asks for. */
  function totalMs() {
    var n = 0;
    for (var i = 0; i < tracks.length; i++) n += tracks[i].duration_ms || 0;
    return n;
  }

  function roughLength(ms) {
    var mins = Math.round(ms / 60000);
    if (mins < 60) return 'about ' + mins + ' min';
    var h = Math.floor(mins / 60), m = mins % 60;
    return 'about ' + h + 'h' + (m ? ' ' + m + 'm' : '');
  }

  function el(tag, cls) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }

  function say(msg, bad) {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    statusEl.className = 'status' + (bad ? ' bad' : '');
  }

  function friendly(e) {
    if (e && e.message === 'apple_subscription_required') {
      return 'This Apple ID does not have an Apple Music subscription, so Apple only ' +
             'allows 30-second previews. A mixtape needs the full songs.';
    }
    if (e && e.message === 'apple_token') {
      return 'Could not start Apple Music. Try again in a moment.';
    }
    var k = (e && e.message) || '';
    if (k === 'premium_required') {
      return 'This needs a Spotify Premium account. The music plays through your own ' +
             'subscription, and Spotify does not allow free accounts to stream this way. ' +
             'Premium Duo and Family work; mobile-only Premium plans do not.';
    }
    if (k === 'not_authenticated') return 'Your Spotify sign-in expired. Reload the page and press play again.';
    if (k === 'token_failed') return 'Could not get a playback token from Spotify. Reload and try again.';
    if (k === 'device_lost') return 'Lost the connection to Spotify. Reload to start again.';
    if (k === 'sdk_timeout') return 'Spotify did not respond. Check your connection, or try reloading.';
    if (k === 'sdk_load') return 'Could not load Spotify. Check your connection and try again.';
    return 'Something went wrong starting playback. Try again, and tell Niles if it keeps happening.';
  }

  function fatal(msg) {
    root.innerHTML = '';
    var wrap = el('div', 'splash');
    var p = el('p', 'splash-err');
    p.textContent = msg;
    wrap.appendChild(p);
    root.appendChild(wrap);
  }
})();
