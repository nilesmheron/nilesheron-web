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

  /* ── scatter table, matched to entry.js so the deck reads the same ── */
  var SCATTER = [
    { r: -8,  x: -22, y: 14  },
    { r: 6,   x: 18,  y: -8  },
    { r: -3,  x: -4,  y: 20  },
    { r: 11,  x: 26,  y: 4   },
    { r: -12, x: -30, y: -2  },
    { r: 4,   x: 9,   y: 24  },
    { r: -6,  x: -14, y: -12 },
    { r: 9,   x: 30,  y: 16  },
    { r: -10, x: -7,  y: 2   }
  ];
  var SPREAD = 2.5;
  var DECK_Y = -14;

  /* ── platforms ──
     Apple Music is the intended front door: it has no development-mode cap, so
     anyone with a subscription can listen. Spotify stays as a side door for the
     five people Niles can allowlist.

     Enabled 2026-09-13, once the MusicKit adapter existed and the spike had
     cleared all five PRD §9.2 checks on a locked iPhone. An entry still falls
     back to Spotify-only if its tracks carry no apple_id, so switching this on
     cannot strand an entry that predates Apple. */
  var APPLE_ENABLED = true;

  function appleReady() {
    return APPLE_ENABLED && tracks.some(function (t) { return t.apple_id; });
  }

  /* ── state ── */
  var entry = null;
  var tracks = [];
  var revealed = [];        // track indices, in the order they were revealed
  var cardEls = {};         // track index → card element
  var idx = 0;
  var queuedUpTo = -1;
  var focused = null;       // position within revealed[]
  var flipped = false;
  var dragDx = 0;
  var service = 'spotify';   // 'spotify' | 'apple' — set by the splash choice
  var player = null;
  var deviceId = null;
  var paused = false;
  var finished = false;
  var mediaFor = null;
  var starting = false;

  var root = document.getElementById('listen-root');
  var deckZone, npEl, transportEl, statusEl, playBtn, progressEl;

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

  fetch('/motif/data/' + slug + '.json')
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (e) {
      entry = e;
      tracks = e.tracks || [];
      if (!tracks.length) { fatal('this entry has no playlist yet'); return; }
      renderSplash();
    })
    .catch(function () { fatal('entry not found'); });

  /* ============================================================
     SPLASH
     ============================================================ */

  function renderSplash() {
    root.innerHTML = '';
    var wrap = el('div', 'splash');

    if (entry.cover_image_url) {
      var img = el('img', 'splash-cover');
      img.src = entry.cover_image_url;
      img.alt = '';
      wrap.appendChild(img);
    }

    var no = el('div', 'splash-no');
    no.textContent = 'motif' + (entry.no ? ' · ' + entry.no : '');
    wrap.appendChild(no);

    var h = el('h1', 'splash-title');
    h.textContent = entry.title || 'Untitled';
    wrap.appendChild(h);

    var note = el('p', 'splash-note');
    note.textContent = 'Played blind. Each song reveals a card when it begins.';
    wrap.appendChild(note);

    // Say what it costs before they spend a consent screen finding out. The
    // music plays through the listener's own subscription, so this is a real
    // prerequisite rather than a preference.
    var needs = el('p', 'splash-needs');
    needs.textContent = appleReady()
      ? 'Plays through your own Apple Music.'
      : 'Plays through your own Spotify Premium.';
    wrap.appendChild(needs);

    // Count and length both. A count says how many turns this takes without
    // saying what any of them are — it shapes the listen rather than spoiling it.
    var total = totalMs();
    var rt = el('div', 'splash-no');
    rt.textContent = tracks.length + ' songs' + (total ? ' · ' + roughLength(total) : '');
    wrap.appendChild(rt);

    playBtn = el('button', 'play-btn');
    playBtn.textContent = appleReady() ? 'Play with Apple Music' : 'Play';
    // Route through startWith rather than straight to the Spotify handler —
    // the primary button IS Apple once the front door is open.
    playBtn.addEventListener('click', function () {
      startWith(appleReady() ? 'apple' : 'spotify');
    });
    wrap.appendChild(playBtn);

    // Side door. Spotify only works for listeners Niles has added by hand, so
    // say that plainly rather than letting them discover it at the consent
    // screen or, worse, at a silent playback failure.
    if (appleReady()) {
      var side = el('div', 'side-door');
      var link = document.createElement('button');
      link.className = 'side-door-btn';
      link.textContent = 'Use Spotify instead';
      link.addEventListener('click', function () { startWith('spotify'); });
      var why = el('p', 'side-door-note');
      why.textContent = 'Spotify needs Niles to add you first — ask him.';
      side.appendChild(link);
      side.appendChild(why);
      wrap.appendChild(side);
    } else {
      var only = el('p', 'side-door-note');
      only.textContent = 'Spotify needs Niles to add you first — ask him.';
      wrap.appendChild(only);
    }

    if (authFlag === 'denied') {
      wrap.appendChild(errNote('Spotify access was declined. Playback needs it — the music plays through your own subscription.'));
    } else if (authFlag === 'error') {
      wrap.appendChild(errNote('Something went wrong signing in to Spotify. Try again.'));
    }

    root.appendChild(wrap);
    statusEl = el('div', 'status');
    root.appendChild(statusEl);
    prepare();
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
      // Apple tells us the queue drained. No inference needed.
      if (e && e.state === states.completed && !finished) {
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

      // Rule 4: a drained queue replays the seed track. That is the end.
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
     DECK
     ============================================================ */

  function reveal(trackIndex, now) {
    if (revealed.indexOf(trackIndex) !== -1) {
      // Already on the deck — bring it forward rather than stacking a second
      // copy, which is what happened after going back and forward again.
      promote(trackIndex);
      return;
    }
    dropCard(trackIndex); // clear any orphan from a previous pass
    revealed.push(trackIndex);
    var card = buildCard(trackIndex, now, revealed.length - 1);
    cardEls[trackIndex] = card;
    if (deckZone) {
      deckZone.querySelector('.deck').appendChild(card);
      card.classList.add('revealing');
      layout();
    }
  }

  // Move an already-revealed card to the top of the stack. Going back used to
  // leave the later card on top, so the deck disagreed with what was playing.
  function promote(trackIndex) {
    var at = revealed.indexOf(trackIndex);
    if (at === -1) return;
    revealed.splice(at, 1);
    revealed.push(trackIndex);
    var card = cardEls[trackIndex];
    if (card && deckZone) deckZone.querySelector('.deck').appendChild(card);
    focused = null;
    flipped = false;
    layout();
  }

  function dropCard(trackIndex) {
    var card = cardEls[trackIndex];
    if (card && card.parentNode) card.parentNode.removeChild(card);
    delete cardEls[trackIndex];
  }

  // Remove every card for a track after `keepThrough`. Filtering the revealed
  // array alone left the elements in the DOM with stale z-indexes on top.
  function trimCardsAfter(keepThrough) {
    revealed.filter(function (ti) { return ti > keepThrough; }).forEach(dropCard);
    revealed = revealed.filter(function (ti) { return ti <= keepThrough; });
    focused = null;
    flipped = false;
    layout();
  }

  function buildCard(trackIndex, now, pos) {
    var t = tracks[trackIndex];
    var c = t.card || {};

    var card = el('div', 'card');
    card.setAttribute('data-pos', pos);
    var inner = el('div', 'card-inner');

    /* front — curator image if given, else the album art (PRD §6) */
    var front = el('div', 'face face-front');
    var frontUrl = c.front_image_url || (now && now.artUrl) || null;

    if (frontUrl) {
      var art = el('img', 'card-art');
      if (c.fit && c.fit !== 'cover') art.style.objectFit = 'contain';
      art.src = frontUrl;
      art.alt = t.title || '';
      front.appendChild(art);
    } else {
      front.className += ' face-track';
      var n1 = el('div', 't-name'); n1.textContent = t.title || '';
      var a1 = el('div', 't-artist'); a1.textContent = t.artist || '';
      front.appendChild(n1); front.appendChild(a1);
    }
    front.appendChild(el('span', 'seal-dot'));

    /* back — curator text and/or image, else title and artist */
    var back = el('div', 'face face-back');

    var backTop = el('div', 'back-top');
    var logo = el('img', 'back-logo');
    logo.src = '/motif/nm-h-logo.png';
    logo.alt = 'nm.h';
    var no = el('span', 'back-no');
    no.textContent = 'Motif · ' + (entry.no || '');
    backTop.appendChild(logo); backTop.appendChild(no);

    var title = el('div', 'back-title');
    title.textContent = t.title || '';

    var body = el('div', 'back-body');
    if (c.back_image_url) {
      var bi = el('img', 'back-image');
      bi.src = c.back_image_url;
      bi.alt = '';
      body.appendChild(bi);
    }
    var typed = el('div', 'typed');
    var text = c.back_text || t.artist || '';
    String(text).split('\n').forEach(function (line) {
      var ln = el('span', 'ln');
      ln.textContent = line;
      typed.appendChild(ln);
    });
    if (String(text).split('\n').length > 9) body.classList.add('back-body--long');
    body.appendChild(typed);

    var foot = el('div', 'back-foot');
    var d = el('span', 'back-date');
    d.textContent = t.artist || '';
    foot.appendChild(d);

    back.appendChild(backTop);
    back.appendChild(title);
    back.appendChild(body);
    back.appendChild(foot);

    inner.appendChild(front);
    inner.appendChild(back);
    card.appendChild(inner);
    return card;
  }

  function layout() {
    revealed.forEach(function (trackIndex, pos) {
      var card = cardEls[trackIndex];
      if (!card) return;
      var s = SCATTER[pos % SCATTER.length];
      var isFocused = focused === pos;
      var isTop = pos === revealed.length - 1;
      var dx = (isFocused || isTop) ? dragDx : 0;
      var t;
      if (isFocused) {
        t = 'translate(' + dx + 'px, ' + (DECK_Y - 10) + 'px) rotate(0deg) scale(1.3)';
      } else if (isTop) {
        t = 'translate(' + (s.x * SPREAD + dx) + 'px, ' + (s.y * SPREAD - 26 + DECK_Y) + 'px) rotate(' + (s.r * SPREAD * 0.45) + 'deg) scale(1.04)';
      } else {
        t = 'translate(' + (s.x * SPREAD) + 'px, ' + (s.y * SPREAD + DECK_Y) + 'px) rotate(' + (s.r * SPREAD) + 'deg)';
      }
      card.style.transform = t;
      // Strictly by stack position. A card left over from a previous pass used
      // to keep an old z-index and sit above the one actually playing.
      card.style.zIndex = isFocused ? 200 : (isTop ? 100 : pos + 1);
      card.classList.toggle('focused', isFocused);
      card.classList.toggle('flipped', isFocused && flipped);
    });
    if (deckZone) deckZone.classList.toggle('is-focused', focused !== null);
    document.documentElement.classList.toggle('focus-lock', focused !== null);
  }

  /* ── gestures ──
     Swipe on the deck drives PLAYBACK, not focus: left is the next song,
     right is the previous one. Both are user-initiated, so re-seeding on
     "back" is safe — a gesture carries the activation iOS requires.
     Tap flips the top card to its info side. Tap off the deck drops focus. ── */
  function onDown(e) {
    var startX = e.clientX, startY = e.clientY;
    var moved = false;
    var focusedAtDown = focused;
    var axis = null;

    function onMove(ev) {
      var dx = ev.clientX - startX, dy = ev.clientY - startY;
      if (!axis && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
        axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
        moved = true;
      }
      if (axis === 'x') { dragDx = dx * 0.34; layout(); }
    }

    function onUp(ev) {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);

      var dx = ev.clientX - startX, dy = ev.clientY - startY;
      dragDx = 0;

      if (moved && Math.abs(dx) > 34 && Math.abs(dx) > Math.abs(dy)) {
        flipped = false;
        focused = null;
        layout();
        if (dx < 0) goNext(); else goBack();
        return;
      }
      if (moved) { layout(); return; }

      var hit = document.elementFromPoint(ev.clientX, ev.clientY);
      var cardEl = hit && hit.closest && hit.closest('.card');
      if (cardEl) {
        var pos = parseInt(cardEl.getAttribute('data-pos'), 10);
        if (focusedAtDown === pos) {
          flipped = !flipped;          // tap the focused card → info side
        } else {
          focused = pos; flipped = false;  // bring it forward first
        }
      } else if (focusedAtDown !== null) {
        focused = null; flipped = false;
      }
      layout();
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  /* ============================================================
     PLAYER CHROME
     ============================================================ */

  function renderPlayer() {
    pulse('start', 0);
    root.innerHTML = '';

    npEl = el('div', 'np');
    root.appendChild(npEl);

    progressEl = el('div', 'progress');
    progressEl.innerHTML =
      '<span class="pr-now">1</span>' +
      '<span class="pr-track"><span class="pr-fill"></span></span>' +
      '<span class="pr-total">' + tracks.length + '</span>';
    root.appendChild(progressEl);
    updateProgress(0);

    deckZone = el('div', 'listen-deck-zone');
    var deck = el('div', 'deck');
    deckZone.appendChild(deck);
    deckZone.appendChild(el('div', 'veil'));
    var hint = el('div', 'deck-hint');
    hint.textContent = 'swipe to change songs · tap a card for info';
    deckZone.appendChild(hint);

    deckZone.addEventListener('pointerdown', function (e) {
      deckZone.classList.add('touched');
      onDown(e);
    });
    root.appendChild(deckZone);

    statusEl = el('div', 'status');
    root.appendChild(statusEl);

    transportEl = el('div', 'transport');
    transportEl.appendChild(tbtn('t-back', 'Back', goBack));
    transportEl.appendChild(tbtn('t-play', 'Pause', togglePlay));
    transportEl.appendChild(tbtn('t-next', 'Next', goNext));
    root.appendChild(transportEl);

    // any cards already revealed before the chrome existed
    revealed.forEach(function (ti) { if (cardEls[ti]) deck.appendChild(cardEls[ti]); });
    layout();
  }

  function tbtn(cls, label, fn) {
    var b = document.createElement('button');
    b.className = cls;
    b.textContent = label;
    b.addEventListener('click', fn);
    return b;
  }

  function updateTransport() {
    if (!transportEl) return;
    var p = transportEl.querySelector('.t-play');
    if (p) p.textContent = paused ? 'Play' : 'Pause';
    var b = transportEl.querySelector('.t-back');
    if (b) b.disabled = idx === 0;
  }

  /* ---- runtime and progress ----
     Deliberately no track numbers and no "3 of 12". Position within a known
     length tells the listener this was composed and has an end — the thing a
     radio stream cannot say — without telling them what is coming. ---- */

  function totalMs() {
    var sum = 0;
    for (var i = 0; i < tracks.length; i++) {
      if (!tracks[i].duration_ms) return 0;   // incomplete data, show nothing
      sum += tracks[i].duration_ms;
    }
    return sum;
  }

  function roughLength(ms) {
    var mins = Math.round(ms / 60000);
    if (mins < 60) return 'about ' + mins + ' minutes';
    var h = Math.floor(mins / 60), m = mins % 60;
    return 'about ' + h + 'h ' + (m ? m + 'm' : '');
  }

  function clock(ms) {
    var s = Math.max(0, Math.round(ms / 1000));
    var m = Math.floor(s / 60);
    return m + ':' + String(s % 60).padStart(2, '0');
  }

  // Position by track, not by clock. The bar still creeps within a song so it
  // reads as alive rather than stepping, but the numbers are songs — which is
  // what tells a listener where they are in something somebody sequenced.
  function updateProgress(position, duration) {
    if (!progressEl || !tracks.length) return;
    var within = (duration && position) ? Math.min(1, position / duration) : 0;
    var pct = Math.max(0, Math.min(100, ((idx + within) / tracks.length) * 100));
    progressEl.querySelector('.pr-fill').style.width = pct + '%';
    progressEl.querySelector('.pr-now').textContent = String(idx + 1);
    progressEl.querySelector('.pr-total').textContent = String(tracks.length);
  }

  function renderNowPlaying(now) {
    if (!npEl) return;
    npEl.innerHTML = '';
    var l = el('div', 'np-label');
    l.textContent = 'now playing';
    var t = el('div', 'np-title');
    t.textContent = now.title;
    var a = el('div', 'np-artist');
    a.textContent = now.artist;
    npEl.appendChild(l); npEl.appendChild(t); npEl.appendChild(a);
  }

  /* ---------- transport, routed to whichever service is playing ----------
     Every one of these asks the player what is actually happening rather than
     trusting the cached flag. They can disagree: a stale "playing" made the
     first press pause an already-paused player, so it took two presses to
     start anything. That bug is service-agnostic and so is the fix. */
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
    if (finished) return;
    if (service !== 'apple' && !player) return;
    if (idx >= tracks.length - 1) { finish(); return; }
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

  /* ============================================================
     COMPLETION (PRD §5.3)
     ============================================================ */

  function finish() {
    if (finished) return;
    finished = true;
    pulse('complete', idx);
    svcPause();
    releaseWakeLock();
    if (npEl) npEl.innerHTML = '';
    if (transportEl) transportEl.remove();

    focused = null;
    layout();

    var done = el('div', 'done');
    var h = el('div', 'done-h');
    h.textContent = 'that was ' + (entry.title || 'the mixtape');
    done.appendChild(h);

    /* Matching service only — PRD §15 Q3, and the fallback that used to be
       here was actively wrong: it offered an Apple listener the SPOTIFY
       playlist, which is exactly the service they cannot use. Better to show
       no call to action than one that leads nowhere they can go. If this is
       missing, the entry needs an apple_playlist_url; the builder now says so. */
    var url = service === 'apple' ? entry.apple_playlist_url : entry.spotify_playlist_url;
    if (url) {
      var a = document.createElement('a');
      a.className = 'add-link';
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = 'Add this playlist';
      done.appendChild(a);
    }

    var again = el('button', 'play-btn ghost');
    again.textContent = 'Play again';
    again.addEventListener('click', function () {
      revealed = [];
      Object.keys(cardEls).forEach(dropCard);
      cardEls = {};
      mediaFor = null;
      var deck = deckZone.querySelector('.deck');
      if (deck) deck.innerHTML = '';
      done.remove();
      root.appendChild(transportEl);
      // seedAny, not seedAt — seedAt is the Spotify seeder and would fail
      // outright on Apple. Never caught because nobody has reached this screen.
      seedAny(0).catch(function (e) { say(friendly(e), true); });
    });
    done.appendChild(again);

    /* Above the deck, not after it. Appending put the primary call to action
       (PRD §5.3) below the whole deck, in the slot the transport had just
       vacated — technically on screen, but the last thing the eye reaches on
       the one screen that is asking for an action. Reported 2026-09-14 on the
       first completion anyone has ever seen. Provisional: the completion
       screen is part of the visual redesign. */
    root.insertBefore(done, deckZone);
  }

  /* ============================================================
     PLATFORM BITS
     ============================================================ */

  function setMediaSession(now) {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: now.title,
        artist: now.artist,
        album: entry.title || 'Motif',
        artwork: now.artwork || []
      });
      navigator.mediaSession.playbackState = paused ? 'paused' : 'playing';
      navigator.mediaSession.setActionHandler('play', function () { svcResume(); });
      navigator.mediaSession.setActionHandler('pause', function () { svcPause(); });
      navigator.mediaSession.setActionHandler('nexttrack', goNext);
      navigator.mediaSession.setActionHandler('previoustrack', goBack);
    } catch (_) {}
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
    if (!wakeLock && !finished && deckZone) requestWakeLock();
  });

  /* ============================================================
     HELPERS
     ============================================================ */

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
