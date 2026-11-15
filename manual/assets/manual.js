/* Alpaquitay AI · manual viewer: theme, navigation, search, copy buttons, lightbox and the live model list. No dependencies. */
(function () {
  'use strict';
  var root = (document.currentScript && document.currentScript.getAttribute('data-root')) || './';
  var L = {
    es: { copy: 'Copiar', copied: 'Copiado', copyFail: 'Selecciona y copia', noResults: 'Sin resultados. Prueba con otra palabra (por ejemplo «diff», «Ollama», «privacidad»).',
      noIndex: 'No se pudo cargar el índice de búsqueda.', unavailable: 'No disponible ahora', netError: 'error de red',
      cdnFail: 'No se pudo consultar el CDN desde este navegador (sin conexión o bloqueado). Los datos medidos están en la tabla de abajo.',
      cdnOk: 'Datos leídos ahora mismo del CDN. La firma se comprobó en tu navegador con las mismas claves públicas que trae la extensión.',
      valid: 'firma válida', invalid: 'firma inválida', untrusted: 'clave no confiable', unsupported: 'tu navegador no verifica Ed25519', isDefault: 'modelo por defecto',
      license: 'Licencia', download: 'Descarga', files: 'ficheros', precision: 'Precisión', requires: 'Requiere', gpuOrCpu: 'WebGPU o CPU', ram: 'de RAM', revision: 'Revisión', sequence: 'secuencia', dec: ',' },
    en: { copy: 'Copy', copied: 'Copied', copyFail: 'Select and copy', noResults: 'No results. Try another word (for example “diff”, “Ollama”, “privacy”).',
      noIndex: 'The search index could not be loaded.', unavailable: 'Not available right now', netError: 'network error',
      cdnFail: 'This browser could not reach the CDN (offline or blocked). The measured data is in the table below.',
      cdnOk: 'Read from the CDN just now. The signature was checked in your browser with the same public keys the extension ships.',
      valid: 'valid signature', invalid: 'invalid signature', untrusted: 'untrusted key', unsupported: 'your browser cannot verify Ed25519', isDefault: 'default model',
      license: 'License', download: 'Download', files: 'files', precision: 'Precision', requires: 'Requires', gpuOrCpu: 'WebGPU or CPU', ram: 'of RAM', revision: 'Revision', sequence: 'sequence', dec: '.' },
  }[document.documentElement.lang === 'en' ? 'en' : 'es'];
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode: theme just isn't remembered */ } }
  };

  // Theme
  $('#themeBtn').addEventListener('click', function () {
    var next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    store.set('alpaquitay-manual-theme', next);
  });

  // Mobile navigation
  var menuBtn = $('#menuBtn');
  function setNav(open) { document.body.classList.toggle('nav-open', open); menuBtn.setAttribute('aria-expanded', String(open)); }
  menuBtn.addEventListener('click', function () { setNav(!document.body.classList.contains('nav-open')); });
  document.addEventListener('click', function (e) { if (document.body.classList.contains('nav-open') && !e.target.closest('#sidebar') && !e.target.closest('#menuBtn')) { setNav(false); } });

  // Copy buttons on code blocks
  document.querySelectorAll('.code').forEach(function (block) {
    var btn = document.createElement('button');
    btn.className = 'copy'; btn.type = 'button'; btn.textContent = L.copy;
    btn.addEventListener('click', function () {
      var text = block.querySelector('code').innerText;
      var done = function () { btn.textContent = L.copied; setTimeout(function () { btn.textContent = L.copy; }, 1600); };
      if (navigator.clipboard) { navigator.clipboard.writeText(text).then(done, function () { btn.textContent = L.copyFail; }); }
    });
    block.appendChild(btn);
  });

  // Active heading in the on-page TOC
  var tocLinks = Array.prototype.slice.call(document.querySelectorAll('.toc a'));
  if (tocLinks.length && 'IntersectionObserver' in window) {
    var byId = {}; tocLinks.forEach(function (a) { byId[decodeURIComponent(a.hash.slice(1))] = a; });
    var visible = {};
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { visible[en.target.id] = en.isIntersecting; });
      var first = tocLinks.find(function (a) { return visible[decodeURIComponent(a.hash.slice(1))]; });
      if (first) { tocLinks.forEach(function (a) { a.classList.toggle('active', a === first); }); }
    }, { rootMargin: '-70px 0px -65% 0px' });
    Object.keys(byId).forEach(function (id) { var h = document.getElementById(id); if (h) { io.observe(h); } });
  }

  // Lightbox for figures
  var lb = $('#lightbox');
  document.addEventListener('click', function (e) {
    var z = e.target.closest('a.zoom');
    if (!z) { return; }
    e.preventDefault();
    var img = z.querySelector('img');
    $('img', lb).src = z.getAttribute('href'); $('img', lb).alt = img ? img.alt : '';
    lb.hidden = false;
  });
  lb.addEventListener('click', function () { lb.hidden = true; });

  // Search (index loaded on first use)
  var search = $('#search'); var input = $('#searchInput'); var list = $('#searchResults');
  var index = null; var sel = 0; var results = [];
  var norm = function (s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); };
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function highlight(text, terms) {
    var out = escapeHtml(text);
    terms.forEach(function (t) {
      if (t.length < 2) { return; }
      var n = norm(out); var i = n.indexOf(t);
      if (i >= 0) { out = out.slice(0, i) + '<mark>' + out.slice(i, i + t.length) + '</mark>' + out.slice(i + t.length); }
    });
    return out;
  }
  function snippet(x, terms) {
    var n = norm(x); var pos = -1;
    terms.some(function (t) { pos = n.indexOf(t); return pos >= 0; });
    var start = Math.max(0, pos - 60);
    return (start > 0 ? '…' : '') + x.slice(start, start + 170) + (x.length > start + 170 ? '…' : '');
  }
  function run() {
    var q = norm(input.value.trim());
    var terms = q.split(/\s+/).filter(Boolean);
    if (!terms.length || !index) { list.innerHTML = ''; results = []; return; }
    results = index.map(function (e) {
      var h = norm(e.h); var p = norm(e.p); var x = norm(e.x); var score = 0;
      for (var i = 0; i < terms.length; i++) {
        var t = terms[i]; var s = 0;
        if (h.indexOf(t) >= 0) { s += 8; }
        if (p.indexOf(t) >= 0) { s += 3; }
        if (x.indexOf(t) >= 0) { s += 1 + Math.min(3, x.split(t).length - 2); }
        if (!s) { return null; }
        score += s;
      }
      return { e: e, score: score };
    }).filter(Boolean).sort(function (a, b) { return b.score - a.score; }).slice(0, 14);
    sel = 0;
    list.innerHTML = results.length ? results.map(function (r, i) {
      return '<li' + (i === 0 ? ' class="sel"' : '') + '><a href="' + root + r.e.u + '"><span class="sp">' + escapeHtml(r.e.p) + '</span><span class="sh">' + highlight(r.e.h, terms) + '</span><span class="sx">' + highlight(snippet(r.e.x, terms), terms) + '</span></a></li>';
    }).join('') : '<li class="empty">' + L.noResults + '</li>';
  }
  function openSearch() {
    search.hidden = false; input.focus(); input.select();
    if (!index) {
      fetch(root + 'search-index.json').then(function (r) { return r.json(); }).then(function (j) { index = j; run(); })
        .catch(function () { list.innerHTML = '<li class="empty">' + L.noIndex + '</li>'; });
    }
  }
  function closeSearch() { search.hidden = true; }
  $('#searchBtn').addEventListener('click', openSearch);
  input.addEventListener('input', run);
  search.addEventListener('click', function (e) { if (e.target === search) { closeSearch(); } });
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); return; }
    if (e.key === '/' && search.hidden && !/input|textarea/i.test(document.activeElement.tagName)) { e.preventDefault(); openSearch(); return; }
    if (e.key === 'Escape') { closeSearch(); lb.hidden = true; setNav(false); return; }
    if (search.hidden || !results.length) { return; }
    var items = list.querySelectorAll('li');
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      items[sel].classList.remove('sel');
      sel = (sel + (e.key === 'ArrowDown' ? 1 : results.length - 1)) % results.length;
      items[sel].classList.add('sel'); items[sel].scrollIntoView({ block: 'nearest' });
    }
    if (e.key === 'Enter') { e.preventDefault(); location.href = items[sel].querySelector('a').href; closeSearch(); }
  });

  // Live model list: fetches the signed manifests from the CDN and verifies them in the browser, like the extension does.
  var live = $('.models-live');
  if (live) { renderModels(live, JSON.parse(live.getAttribute('data-models'))); }

  function b64(s) { var bin = atob(s); var out = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) { out[i] = bin.charCodeAt(i); } return out; }
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  // Same units as the extension's consent dialog (binary: 1 GB = 1024^3 bytes).
  function fmtBytes(n) { return n >= 1073741824 ? (n / 1073741824).toFixed(2).replace('.', L.dec) + ' GB' : (n / 1048576).toFixed(0) + ' MB'; }

  function verify(keys, bytes, sig) {
    if (!window.crypto || !crypto.subtle) { return Promise.resolve('unsupported'); }
    return Promise.all(keys.map(function (k) { return crypto.subtle.digest('SHA-256', b64(k)).then(function (d) { return { k: k, id: hex(d).slice(0, 16) }; }); }))
      .then(function (ids) {
        var match = ids.filter(function (x) { return x.id === sig.keyId; })[0];
        if (!match) { return 'untrusted'; }
        return crypto.subtle.importKey('raw', b64(match.k), { name: 'Ed25519' }, false, ['verify'])
          .then(function (key) { return crypto.subtle.verify({ name: 'Ed25519' }, key, b64(sig.sig), bytes); })
          .then(function (ok) { return ok ? 'valid' : 'invalid'; }, function () { return 'unsupported'; });
      });
  }

  function renderModels(el, cfg) {
    var status = $('.models-status', el);
    var grid = document.createElement('div'); grid.className = 'model-grid';
    var pending = cfg.models.length; var failures = 0;
    var slots = cfg.models.map(function () { var d = document.createElement('div'); grid.appendChild(d); return d; });
    cfg.models.forEach(function (id, i) {
      var base = cfg.cdn + '/models/' + id + '/';
      Promise.all([
        fetch(base + 'manifest.json', { cache: 'no-store' }).then(function (r) { if (!r.ok) { throw new Error('HTTP ' + r.status); } return r.arrayBuffer(); }),
        fetch(base + 'manifest.sig.json', { cache: 'no-store' }).then(function (r) { if (!r.ok) { throw new Error('HTTP ' + r.status); } return r.json(); })
      ]).then(function (res) {
        var bytes = new Uint8Array(res[0]); var m = JSON.parse(new TextDecoder().decode(bytes));
        return verify(cfg.keys, bytes, res[1]).then(function (v) { grid.replaceChild(card(id, m, v, res[1], cfg.defaultId), slots[i]); });
      }).catch(function (err) {
        failures++;
        var c = document.createElement('div'); c.className = 'model-card';
        c.innerHTML = '<h3>' + escapeHtml(id) + '</h3><p class="mid">' + L.unavailable + ' (' + escapeHtml(err.message || L.netError) + ').</p>';
        grid.replaceChild(c, slots[i]);
      }).then(function () {
        if (--pending === 0) {
          status.textContent = failures === cfg.models.length
            ? L.cdnFail
            : L.cdnOk;
          el.appendChild(grid);
        }
      });
    });
  }

  function card(id, m, verdict, sig, defaultId) {
    var size = (m.files || []).reduce(function (s, f) { return s + (f.size || 0); }, 0);
    var r = m.runtime || {};
    var badge = { valid: '<span class="badge ok">' + L.valid + ' · ' + escapeHtml(sig.keyId) + '</span>', invalid: '<span class="badge bad">' + L.invalid + '</span>', untrusted: '<span class="badge bad">' + L.untrusted + '</span>', unsupported: '<span class="badge warn">' + L.unsupported + '</span>' }[verdict];
    var el = document.createElement('div'); el.className = 'model-card';
    el.innerHTML = '<h3>' + escapeHtml(m.label || id) + '</h3><div class="mid">' + escapeHtml(id) + '</div>' +
      (id === defaultId ? '<span class="badge default">' + L.isDefault + '</span> ' : '') + badge +
      '<dl><dt>' + L.license + '</dt><dd>' + escapeHtml(m.license || '—') + '</dd>' +
      '<dt>' + L.download + '</dt><dd>' + fmtBytes(size) + ' · ' + (m.files || []).length + ' ' + L.files + '</dd>' +
      '<dt>' + L.precision + '</dt><dd>' + escapeHtml((r.dtypes || []).join(', ') || '—') + '</dd>' +
      '<dt>' + L.requires + '</dt><dd>' + (r.requiresWebGpu ? 'WebGPU' : L.gpuOrCpu) + (r.minRamBytes ? ' · ' + Math.round(r.minRamBytes / 1073741824) + ' GB ' + L.ram : '') + '</dd>' +
      '<dt>' + L.revision + '</dt><dd><code>' + escapeHtml(m.revision || '—') + '</code> · ' + L.sequence + ' ' + escapeHtml(String(m.sequence || '—')) + '</dd></dl>';
    return el;
  }
})();
