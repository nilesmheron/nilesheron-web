(function () {
  'use strict';

  /* ============================================================
     MOTIF — blind playlist player (PRD §5)

     The playback rules below are not obvious and were each established by
     the 2026-09-08/09 spike. Changing any of them breaks locked-screen
     listening, which is the product:

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
  var player = null;
  var deviceId = null;
  var paused = false;
  var finished = false;
  var mediaFor = null;
  var starting = false;

  var root = document.getElementById('listen-root');
  var deckZone, npEl, transportEl, statusEl, playBtn;

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

    playBtn = el('button', 'play-btn');
    playBtn.textContent = 'Play';
    playBtn.addEventListener('click', onPlayTap);
    wrap.appendChild(playBtn);

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
    ensureAuth().then(function (ok) {
      if (!ok) return; // first tap sends them to Spotify instead
      playBtn.disabled = true;
      playBtn.textContent = 'Preparing';
      ensurePlayer()
        .then(function () {
          playBtn.disabled = false;
          playBtn.textContent = 'Play';
        })
        .catch(function (e) {
          playBtn.disabled = false;
          playBtn.textContent = 'Play';
          say(friendly(e), true);
        });
    });
  }

  function errNote(text) {
    var p = el('p', 'splash-err');
    p.textContent = text;
    return p;
  }

  /* ============================================================
     AUTH + START
     ============================================================ */

  function onPlayTap() {
    if (starting) return;

    // MUST be the first thing, synchronously: iOS unlocks the audio element
    // only during a real user interaction. Any await before this spends the
    // gesture and the tap silently does nothing.
    activate();

    if (!deviceId) {
      ensureAuth().then(function (ok) {
        if (!ok) {
          window.location.href = '/api/motif-auth?action=login&return=' +
            encodeURIComponent(window.location.pathname);
        } else {
          prepare(); // authorized but the SDK is still connecting
        }
      });
      return;
    }

    starting = true;
    playBtn.disabled = true;
    playBtn.textContent = 'Starting';
    say('');

    beginPlayback().catch(function (e) {
      starting = false;
      playBtn.disabled = false;
      playBtn.textContent = 'Play';
      say(friendly(e), true);
    });
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

  function ensurePlayer() {
    if (deviceId) return Promise.resolve(true);
    return loadSdk().then(function () {
      return new Promise(function (resolve, reject) {
        var settled = false;
        var timer = setTimeout(function () {
          if (!settled) { settled = true; reject(new Error('sdk_timeout')); }
        }, 15000);

        player = new window.Spotify.Player({
          name: 'Motif',
          getOAuthToken: function (cb) { getToken().then(cb).catch(function () {}); },
          volume: 0.85
        });

        player.addListener('ready', function (d) {
          deviceId = d.device_id;
          if (!settled) { settled = true; clearTimeout(timer); resolve(true); }
        });
        player.addListener('not_ready', function () { deviceId = null; });
        player.addListener('player_state_changed', onStateChange);
        player.addListener('account_error', function () {
          say('Spotify Premium is required to play here. Free accounts can sign in but not stream.', true);
        });
        player.addListener('authentication_error', function () {
          say('Spotify sign-in expired. Reload and play again.', true);
        });
        player.addListener('initialization_error', function (e) {
          if (!settled) { settled = true; clearTimeout(timer); reject(new Error(e.message || 'init')); }
        });

        player.connect();
      });
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

    if (!cur) return;

    if (cur.uri !== mediaFor) {
      mediaFor = cur.uri;
      var known = indexOfUri(cur.uri);

      // Rule 4: a drained queue replays the seed track. That is the end.
      if (known === 0 && revealed.length >= tracks.length && !finished) {
        finish();
        return;
      }

      if (known > -1) {
        idx = known;
        reveal(known, cur);
        appendNext();
      }
      setMediaSession(cur);
      renderNowPlaying(cur);
    }

    if (state.paused && state.position === 0 && idx === tracks.length - 1 &&
        revealed.length >= tracks.length && !finished) {
      finish();
    }
  }

  /* ============================================================
     DECK
     ============================================================ */

  function reveal(trackIndex, spotifyTrack) {
    if (revealed.indexOf(trackIndex) !== -1) return;
    revealed.push(trackIndex);
    var card = buildCard(trackIndex, spotifyTrack, revealed.length - 1);
    cardEls[trackIndex] = card;
    if (deckZone) {
      deckZone.querySelector('.deck').appendChild(card);
      card.classList.add('revealing');
      layout();
    }
  }

  function buildCard(trackIndex, spotifyTrack, pos) {
    var t = tracks[trackIndex];
    var c = t.card || {};

    var card = el('div', 'card');
    card.setAttribute('data-pos', pos);
    var inner = el('div', 'card-inner');

    /* front — curator image if given, else the album art (PRD §6) */
    var front = el('div', 'face face-front');
    var frontUrl = c.front_image_url ||
      (spotifyTrack && spotifyTrack.album && spotifyTrack.album.images &&
       spotifyTrack.album.images.length ? spotifyTrack.album.images[0].url : null);

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
      card.style.zIndex = isFocused ? 60 : (isTop ? 50 : pos + 1);
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
    root.innerHTML = '';

    npEl = el('div', 'np');
    root.appendChild(npEl);

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

  function renderNowPlaying(cur) {
    if (!npEl) return;
    npEl.innerHTML = '';
    var l = el('div', 'np-label');
    l.textContent = 'now playing';
    var t = el('div', 'np-title');
    t.textContent = cur.name;
    var a = el('div', 'np-artist');
    a.textContent = cur.artists.map(function (x) { return x.name; }).join(', ');
    npEl.appendChild(l); npEl.appendChild(t); npEl.appendChild(a);
  }

  // Ask the SDK what is actually happening rather than trusting the cached
  // flag. They can disagree — a stale "playing" made the first press pause an
  // already-paused player, so it took two presses to start anything.
  function togglePlay() {
    if (!player) return;
    player.getCurrentState().then(function (s) {
      if (!s) { player.resume(); return; }
      paused = s.paused;
      updateTransport();
      return s.paused ? player.resume() : player.pause();
    }).catch(function () {});
  }

  // Skip forward: a queue operation, so it keeps the audio element's activation.
  function goNext() {
    if (!player || finished) return;
    if (idx >= tracks.length - 1) { finish(); return; }
    player.nextTrack();
  }

  // Back re-seeds, which is a new play call — allowed here because a tap is a
  // user activation. Never do this automatically.
  function goBack() {
    if (idx === 0 || finished) return;
    var target = idx - 1;
    revealed = revealed.filter(function (ti) { return ti <= target; });
    seedAt(target).catch(function (e) { say(friendly(e), true); });
  }

  /* ============================================================
     COMPLETION (PRD §5.3)
     ============================================================ */

  function finish() {
    if (finished) return;
    finished = true;
    if (player) player.pause();
    releaseWakeLock();
    if (npEl) npEl.innerHTML = '';
    if (transportEl) transportEl.remove();

    focused = null;
    layout();

    var done = el('div', 'done');
    var h = el('div', 'done-h');
    h.textContent = 'that was ' + (entry.title || 'the mixtape');
    done.appendChild(h);

    var url = entry.spotify_playlist_url;
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
      cardEls = {};
      mediaFor = null;
      var deck = deckZone.querySelector('.deck');
      if (deck) deck.innerHTML = '';
      done.remove();
      root.appendChild(transportEl);
      seedAt(0).catch(function (e) { say(friendly(e), true); });
    });
    done.appendChild(again);

    root.appendChild(done);
  }

  /* ============================================================
     PLATFORM BITS
     ============================================================ */

  function setMediaSession(cur) {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: cur.name,
        artist: cur.artists.map(function (a) { return a.name; }).join(', '),
        album: entry.title || 'Motif',
        artwork: ((cur.album && cur.album.images) || []).map(function (i) {
          return { src: i.url, sizes: i.width + 'x' + i.height, type: 'image/jpeg' };
        })
      });
      navigator.mediaSession.playbackState = paused ? 'paused' : 'playing';
      navigator.mediaSession.setActionHandler('play', function () { player && player.resume(); });
      navigator.mediaSession.setActionHandler('pause', function () { player && player.pause(); });
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
    var k = (e && e.message) || '';
    if (k === 'premium_required') return 'Spotify Premium is required to play here.';
    if (k === 'not_authenticated') return 'Sign-in expired. Reload and play again.';
    if (k === 'device_lost') return 'Lost the connection to Spotify. Reload to start again.';
    if (k === 'sdk_timeout' || k === 'sdk_load') return 'Could not reach Spotify. Check your connection and try again.';
    return 'Something went wrong starting playback. Try again.';
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
