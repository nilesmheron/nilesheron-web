/* motif/errors.js — the Motif error catalog. ONE list, read by both sides.

   The player loads it with a <script> tag (it sets window.MotifErrors) and
   api/motif-report.js imports it in Node (module.exports). There is no build
   step, so it is written to work as both: plain ES5, no import/export syntax.

   Each code has a severity (drives the alert email's subject), the copy a
   listener sees (null where the listener is shown nothing — the failure is
   reported silently), and a one-line note for Niles that goes in the email.

   Add codes HERE. Never invent one at a call site: the client sends only codes
   it finds in this list, and the server files anything else as unknown / bug
   with the original string kept in detail, rather than dropping it — the
   pulse endpoint silently dropped unrecognised events three times.

   Listener copy is rendered with textContent only (the MusicKit storage
   condition in CLAUDE.md). Keep it plain text. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MotifErrors = api;
})(this, function () {
  var GENERIC = 'Something went wrong starting playback. Try again, and tell Niles if it keeps happening.';
  var COULD_NOT = 'Could not start the tape';

  // code: [severity, headline, listener message, note for Niles]
  var C = {
    /* ── listener: their account or browser, nothing broken ── */
    apple_subscription_required: ['listener', 'Previews only',
      'This Apple ID does not have an Apple Music subscription, so Apple only allows 30-second previews. A mixtape needs the full songs.',
      'Their Apple ID has no Apple Music subscription — Apple allows only 30-second previews.'],
    apple_auth_unfinished: ['listener', 'Apple sign-in didn’t finish',
      'Apple sign-in didn’t finish. Try again.',
      'MusicKit authorize() was rejected — the Apple sign-in sheet was closed, blocked, or failed (often "Unauthorized").'],
    premium_required: ['listener', 'Spotify Premium required',
      'This needs a Spotify Premium account. The music plays through your own subscription, and Spotify does not allow free accounts to stream this way. Premium Duo and Family work; mobile-only Premium plans do not.',
      'Spotify refused playback: the account is not Premium (or is a mobile-only Premium plan). Spotify door is closed to listeners.'],
    not_authenticated: ['listener', 'Not signed in',
      'Your Spotify sign-in expired. Reload the page and press play again.',
      'The Spotify session cookie was missing or expired.'],

    /* ── content: a tape problem, fixable in the builder ── */
    entry_not_found: ['content', 'Tape not found', 'entry not found',
      'The tape JSON for this slug did not load (404 or a bad response). Wrong link, or the tape was deleted.'],
    entry_empty: ['content', 'Tape has no songs', 'this entry has no playlist yet',
      'The tape exists but has no tracks.'],
    bad_url: ['content', 'Bad link', 'no entry in this URL',
      'The player was opened at a URL with no tape slug in it.'],
    tape_not_on_apple: ['content', 'Not playable yet',
      'This tape isn’t on Apple Music yet. Nothing has played and nothing has been revealed.',
      'No track on this tape has an apple_id, so there is nothing to play. Fix it in the builder.'],
    not_on_spotify: ['content', COULD_NOT, 'None of this tape is on Spotify. Use Apple Music instead.',
      'No track on this tape has a spotify_uri.'],
    sides_mismatch: ['content', null, null,
      'The tape’s sides do not add up to its track count, so the player fell back to one side. The listener is not blocked. Fix the sides in the builder.'],

    /* ── service: Apple, Spotify, the network, or our API ── */
    apple_token: ['service', COULD_NOT, 'Could not start Apple Music. Try again in a moment.',
      'The MusicKit developer token could not be fetched from /api/motif-apple-token.'],
    apple_warm_failed: ['service', null, null,
      'MusicKit failed to load or configure while the splash was open. The listener was shown nothing yet; their tap may fail.'],
    apple_playback_error: ['service', null, null,
      'MusicKit raised mediaPlaybackError during the tape.'],
    queue_failed: ['service', null, null,
      'MusicKit playLater() failed, so the next song may not have been queued. The tape can stop at the end of the current song.'],
    sdk_load: ['service', COULD_NOT, 'Could not load Spotify. Check your connection and try again.',
      'The Spotify Web Playback SDK script failed to load.'],
    sdk_timeout: ['service', COULD_NOT, 'Spotify did not respond. Check your connection, or try reloading.',
      'The Spotify SDK did not become ready in time.'],
    token_failed: ['service', COULD_NOT, 'Could not get a playback token from Spotify. Reload and try again.',
      'Spotify playback token fetch failed.'],
    device_lost: ['service', COULD_NOT, 'Lost the connection to Spotify. Reload to start again.',
      'The Spotify player device went away mid-listen.'],
    server_error: ['service', null, null,
      'One of our api/motif-* endpoints returned a 5xx. The endpoint and status are in detail.'],

    /* ── bug: our code ── */
    mid_listen: ['bug', null, null,
      'A guarded playback handler threw while the tape was playing. The handler name is in detail. The music may have stopped with no message.'],
    uncaught: ['bug', null, null,
      'An uncaught exception reached window.onerror. "Script error." means a cross-origin script (likely MusicKit) and no details.'],
    unhandled_rejection: ['bug', null, null,
      'A promise rejected with nothing to catch it.'],
    unknown: ['bug', COULD_NOT, GENERIC,
      'Not in the catalog. The original message is in detail — add a code for it if it recurs.'],

    /* ── test: smoke tests only ── */
    test: ['test', 'Test alert', null, 'A smoke test. Nothing is wrong.']
  };

  function lookup(code) {
    var known = Object.prototype.hasOwnProperty.call(C, code);
    var r = C[known ? code : 'unknown'];
    return {
      code: known ? code : 'unknown',
      known: known,
      severity: r[0],
      headline: r[1],
      message: r[2],
      note: r[3]
    };
  }

  return {
    lookup: lookup,
    has: function (code) { return Object.prototype.hasOwnProperty.call(C, code); },
    codes: function () { return Object.keys(C); },
    GENERIC: GENERIC,
    COULD_NOT: COULD_NOT
  };
});
