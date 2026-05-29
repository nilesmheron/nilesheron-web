(function () {
  const root = document.getElementById('archive-root');

  fetch('/motif/data/entries.json')
    .then(function (r) { return r.json(); })
    .then(function (entries) { render(entries); })
    .catch(function () {
      root.innerHTML = '<p style="padding:40px;font-family:monospace;font-size:12px;color:#9a958c;">failed to load entries</p>';
    });

  function render(entries) {
    const mast = document.createElement('div');
    mast.className = 'arch-mast';
    mast.innerHTML =
      '<div class="arch-top">' +
        '<img class="logo-mark" src="/motif/nm-h-logo.png" alt="nm.h">' +
        '<span>index · motif</span>' +
      '</div>' +
      '<h1 class="arch-h">Motif.</h1>' +
      '<p class="arch-lede">Handwritten poems, paired with a playlist. Read one with the sound on.</p>' +
      '<div class="arch-count">' + entries.length + ' entries · newest first</div>';

    const grid = document.createElement('div');
    grid.className = 'arch-grid';

    entries.forEach(function (e) {
      const tile = document.createElement('a');
      tile.className = 'tile';
      tile.href = '/motif/' + e.slug;

      const no = document.createElement('div');
      no.className = 'tile-no';
      if (e.current) {
        const dot = document.createElement('span');
        dot.className = 'live';
        no.appendChild(dot);
      }
      no.appendChild(document.createTextNode('No. ' + e.no));

      const title = document.createElement('div');
      title.className = 'tile-title';
      title.textContent = e.title;

      const meta = document.createElement('div');
      meta.className = 'tile-meta';
      meta.innerHTML =
        '<span>' + e.date + '</span>' +
        '<span class="sep">/</span>' +
        '<span>' + e.poem_count + ' poems</span>';

      tile.appendChild(no);
      tile.appendChild(title);
      tile.appendChild(meta);
      grid.appendChild(tile);
    });

    const foot = document.createElement('div');
    foot.className = 'arch-foot';
    foot.innerHTML = '<span>nilesheron.com</span><span>/motif</span>';

    root.appendChild(mast);
    root.appendChild(grid);
    root.appendChild(foot);
  }
})();
