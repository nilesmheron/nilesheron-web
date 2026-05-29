(function () {
  /* ── scatter table (deg / x / y), matched exactly to the design prototype) ── */
  var SCATTER = [
    { r: -8,  x: -22, y: 14  },
    { r: 6,   x: 18,  y: -8  },
    { r: -3,  x: -4,  y: 20  },
    { r: 11,  x: 26,  y: 4   },
    { r: -12, x: -30, y: -2  },
    { r: 4,   x: 9,   y: 24  },
    { r: -6,  x: -14, y: -12 },
    { r: 9,   x: 30,  y: 16  },
    { r: -10, x: -7,  y: 2   },
  ];
  var SPREAD = 1.5;

  /* ── state ── */
  var poems = [];
  var active = 0;
  var focused = null;
  var flipped = false;
  var touched = false;
  var dragDx = 0;

  /* ── DOM refs ── */
  var root = document.getElementById('entry-root');
  var deckZone, cardEls, veil, hint, entryMark;

  /* ── routing ── */
  var slug = window.location.pathname.replace(/^\/motif\//, '').replace(/\/$/, '');
  if (!slug) { showError('no entry slug found in URL'); return; }

  fetch('/motif/data/' + slug + '.json')
    .then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    })
    .then(function (entry) { init(entry); })
    .catch(function () { showError('entry not found'); });

  /* ── init ── */
  function init(entry) {
    poems = entry.poems;
    active = poems.length - 1;
    document.title = entry.title + ' — Motif';

    renderAudioZone(entry);
    renderBrandMark();
    renderDeckZone(entry);
    renderCards();
  }

  /* ── brand mark: floats above the deck, beneath the audio iframe ── */
  function renderBrandMark() {
    var wrap = document.createElement('div');
    wrap.className = 'entry-logo';
    var logo = document.createElement('img');
    logo.src = '/motif/nm-h-logo.png';
    logo.alt = 'nm.h';
    wrap.appendChild(logo);
    /* tap the mark to drop any focused card and return to the full stack */
    wrap.addEventListener('click', function () {
      focused = null;
      flipped = false;
      dragDx = 0;
      renderCards();
    });
    root.appendChild(wrap);
  }

  /* ── audio zone ── */
  function renderAudioZone(entry) {
    var zone = document.createElement('div');
    zone.className = 'audio-zone';

    var spotifyUrl = entry.spotify_url || '';
    var appleUrl = entry.apple_music_url || '';
    var hasBoth = spotifyUrl && appleUrl;
    var activeService = spotifyUrl ? 'spotify' : (appleUrl ? 'apple' : '');

    if (hasBoth) {
      var toggle = document.createElement('div');
      toggle.className = 'audio-service-toggle';

      var spotBtn = document.createElement('button');
      spotBtn.textContent = 'Spotify';
      spotBtn.className = activeService === 'spotify' ? 'active' : '';

      var appleBtn = document.createElement('button');
      appleBtn.textContent = 'Apple Music';
      appleBtn.className = activeService === 'apple' ? 'active' : '';

      toggle.appendChild(spotBtn);
      toggle.appendChild(appleBtn);
      zone.appendChild(toggle);

      var iframe = buildIframe(spotifyUrl);
      zone.appendChild(iframe);

      spotBtn.addEventListener('click', function () {
        iframe.src = spotifyUrl;
        spotBtn.className = 'active';
        appleBtn.className = '';
      });
      appleBtn.addEventListener('click', function () {
        iframe.src = appleUrl;
        appleBtn.className = 'active';
        spotBtn.className = '';
      });
    } else if (activeService) {
      var url = activeService === 'spotify' ? spotifyUrl : appleUrl;
      zone.appendChild(buildIframe(url));
    } else {
      return; // no URLs — skip the audio zone entirely
    }

    root.appendChild(zone);
  }

  function buildIframe(src) {
    var iframe = document.createElement('iframe');
    iframe.src = src;
    iframe.width = '100%';
    iframe.height = '100';
    iframe.setAttribute('frameborder', '0');
    iframe.setAttribute('allow', 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture');
    return iframe;
  }

  /* ── deck zone ── */
  function renderDeckZone(entry) {
    deckZone = document.createElement('div');
    deckZone.className = 'deck-zone';

    var deck = document.createElement('div');
    deck.className = 'deck';

    cardEls = poems.map(function (poem, i) {
      return buildCard(poem, entry.no, i);
    });
    cardEls.forEach(function (el) { deck.appendChild(el); });

    veil = document.createElement('div');
    veil.className = 'veil';
    deck.appendChild(veil);

    hint = document.createElement('div');
    hint.className = 'deck-hint';
    hint.textContent = 'tap a card · swipe to riffle';

    deckZone.appendChild(deck);
    deckZone.appendChild(hint);
    root.appendChild(deckZone);

    entryMark = document.createElement('div');
    entryMark.className = 'entry-mark';
    entryMark.textContent = 'motif · ' + entry.slug;
    root.appendChild(entryMark);

    deckZone.addEventListener('pointerdown', onDown);
  }

  /* ── card builder ── */
  function buildCard(poem, entryNo, i) {
    var card = document.createElement('div');
    card.className = 'card';
    card.setAttribute('data-idx', i);

    var inner = document.createElement('div');
    inner.className = 'card-inner';

    /* front — full-width page column, anchored to the top; scrolls when focused.
       Accepts poem.images (array, for multi-page poems) or a single image_url. */
    var images = (poem.images && poem.images.length) ? poem.images
      : (poem.image_url && poem.image_url.indexOf('PLACEHOLDER') !== 0 ? [poem.image_url] : []);
    var front = document.createElement('div');
    var isPlaceholder = images.length === 0;
    front.className = 'face face-front' + (isPlaceholder ? ' face-front--text' : '');

    if (isPlaceholder) {
      var hand = document.createElement('div');
      hand.className = 'hand';
      (poem.text || '').split('\n').forEach(function (line) {
        var ln = document.createElement('span');
        ln.className = 'ln';
        ln.textContent = line;
        hand.appendChild(ln);
      });
      var sig = document.createElement('span');
      sig.className = 'sig';
      sig.textContent = '— nm.h';
      front.appendChild(hand);
      front.appendChild(sig);
    } else {
      var pages = document.createElement('div');
      pages.className = 'card-pages';
      images.forEach(function (url, pi) {
        var img = document.createElement('img');
        img.className = 'card-page';
        img.src = url;
        img.alt = (poem.title || '') + (images.length > 1 ? ' — page ' + (pi + 1) : '');
        pages.appendChild(img);
      });
      front.appendChild(pages);
    }

    var sealDot = document.createElement('span');
    sealDot.className = 'seal-dot';
    front.appendChild(sealDot);

    /* back */
    var back = document.createElement('div');
    back.className = 'face face-back';

    var backTop = document.createElement('div');
    backTop.className = 'back-top';

    var backLogo = document.createElement('img');
    backLogo.className = 'back-logo';
    backLogo.src = '/motif/nm-h-logo.png';
    backLogo.alt = 'nm.h';

    var backNo = document.createElement('span');
    backNo.className = 'back-no';
    backNo.textContent = 'Motif · ' + entryNo;

    backTop.appendChild(backLogo);
    backTop.appendChild(backNo);

    var backTitle = document.createElement('div');
    backTitle.className = 'back-title';
    backTitle.textContent = poem.title || '';

    var backBody = document.createElement('div');
    backBody.className = 'back-body';
    var lineCount = (poem.text || '').split('\n').length;
    if (lineCount > 9) backBody.classList.add('back-body--long');

    var typed = document.createElement('div');
    typed.className = 'typed';
    var lines = poem.text ? poem.text.split('\n') : [];
    lines.forEach(function (line) {
      var ln = document.createElement('span');
      ln.className = 'ln';
      ln.textContent = line;
      typed.appendChild(ln);
    });

    backBody.appendChild(typed);

    var backFoot = document.createElement('div');
    backFoot.className = 'back-foot';

    var backDate = document.createElement('span');
    backDate.className = 'back-date';
    backDate.textContent = poem.date || '';

    backFoot.appendChild(backDate);
    if (poem.source_url) {
      var srcLink = document.createElement('a');
      srcLink.className = 'back-source';
      srcLink.href = poem.source_url;
      srcLink.target = '_blank';
      srcLink.rel = 'noopener noreferrer';
      srcLink.textContent = 'source';
      backFoot.appendChild(srcLink);
    }

    back.appendChild(backTop);
    back.appendChild(backTitle);
    back.appendChild(backBody);
    back.appendChild(backFoot);

    inner.appendChild(front);
    inner.appendChild(back);
    card.appendChild(inner);
    return card;
  }

  /* ── render: apply state to DOM ── */
  function renderCards() {
    cardEls.forEach(function (card, i) {
      var s = SCATTER[i % SCATTER.length];
      var isFocused = focused === i;
      var isActive = active === i;
      var dx = (isActive || isFocused) ? dragDx : 0;
      var t;

      if (isFocused) {
        t = 'translate(' + dx + 'px, -10px) rotate(0deg) scale(1.35)';
      } else if (isActive) {
        t = 'translate(' + (s.x * SPREAD + dx) + 'px, ' + (s.y * SPREAD - 30) + 'px) rotate(' + (s.r * SPREAD * 0.45) + 'deg) scale(1.05)';
      } else {
        t = 'translate(' + (s.x * SPREAD) + 'px, ' + (s.y * SPREAD) + 'px) rotate(' + (s.r * SPREAD) + 'deg)';
      }

      card.style.transform = t;
      card.style.zIndex = isFocused ? 60 : (isActive ? 50 : i + 1);

      card.classList.toggle('focused', isFocused);
      card.classList.toggle('flipped', isFocused && flipped);
    });

    deckZone.classList.toggle('is-focused', focused !== null);
    deckZone.classList.toggle('touched', touched);
  }

  /* ── gesture handling ── */
  /* Window-level pointermove/pointerup for the life of a drag so the release
     is always caught even if the pointer travels off the card or screen. */
  function wrap(n) { return (n + poems.length) % poems.length; }

  function onDown(e) {
    var startX = e.clientX;
    var startY = e.clientY;
    var moved = false;

    /* mirror mutable state into closure-local refs so handlers never go stale */
    var focusedAtDown = focused;
    var activeAtDown = active;

    function onMove(ev) {
      var dx = ev.clientX - startX;
      var dy = ev.clientY - startY;
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) moved = true;
      if (Math.abs(dx) > Math.abs(dy)) {
        dragDx = dx * 0.34;
        renderCards();
      }
    }

    function onUp(ev) {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);

      var dx = ev.clientX - startX;
      var dy = ev.clientY - startY;

      dragDx = 0;
      touched = true;

      /* swipe */
      if (moved && Math.abs(dx) > 34 && Math.abs(dx) > Math.abs(dy)) {
        var dir = dx < 0 ? 1 : -1;
        if (focusedAtDown !== null) {
          var nx = wrap(focusedAtDown + dir);
          focused = nx;
          active = nx;
          flipped = false;
        } else {
          active = wrap(activeAtDown + dir);
        }
        renderCards();
        return;
      }

      if (moved) { renderCards(); return; }

      /* tap — resolve the element under the release point */
      var hit = document.elementFromPoint(ev.clientX, ev.clientY);
      if (hit && hit.closest && hit.closest('a[href]')) { renderCards(); return; }
      var cardEl = hit && hit.closest && hit.closest('.card');

      if (cardEl) {
        var idx = parseInt(cardEl.getAttribute('data-idx'), 10);
        if (focusedAtDown === null) {
          focused = idx;
          active = idx;
          flipped = false;
        } else if (idx === focusedAtDown) {
          flipped = !flipped;
        }
      } else if (focusedAtDown !== null) {
        focused = null;
        flipped = false;
      }

      renderCards();
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  /* ── error state ── */
  function showError(msg) {
    root.innerHTML = '<p style="padding:40px;font-family:monospace;font-size:12px;color:#9a958c;">' + msg + '</p>';
  }
})();
