// Maps schaalreferentie: draws a known shape at the current map scale, bottom right.
(() => {
  if (window.__msrLoaded) return;
  window.__msrLoaded = true;

  const BUILTIN = window.MSR_BUILTIN_REFERENCES || [];
  // Provinces are off until the user picks one (or enters an address); all twelve at once would flicker.
  const DEFAULTS = {
    enabled: true, boxW: 260, boxH: 200, custom: [], pos: null,
    disabled: BUILTIN.filter((r) => r.id.startsWith('prov-')).map((r) => r.id),
  };
  const LOCAL_DEFAULTS = { areas: [], markers: {} };   // address-based areas live in storage.local only
  const PAD = 6;
  const storage = (typeof chrome !== 'undefined' && chrome.storage) ? chrome.storage.sync : null;
  const localStore = (typeof chrome !== 'undefined' && chrome.storage) ? chrome.storage.local : null;

  let settings = { ...DEFAULTS };
  let local = { ...LOCAL_DEFAULTS };
  let pinnedId = null;        // id of a manually chosen reference, null = automatic
  let currentId = null;
  let flashUntil = 0;
  let lastHref = '';
  let lastHeight = 0;
  let view = null;            // {lat, lng, mpp, mode}
  let raf = 0;

  // ---------- settings ----------
  function loadSettings(cb) {
    if (!storage) { cb(); return; }
    storage.get(DEFAULTS, (s) => {
      settings = { ...DEFAULTS, ...s };
      localStore.get(LOCAL_DEFAULTS, (l) => { local = { ...LOCAL_DEFAULTS, ...l }; cb(); });
    });
  }
  function saveSettings(patch) {
    Object.assign(settings, patch);
    if (storage) storage.set(patch);
  }
  if (storage) {
    chrome.storage.onChanged.addListener((changes, area) => {
      const target = area === 'sync' ? settings : area === 'local' ? local : null;
      if (!target) return;
      for (const k of Object.keys(changes)) {
        const v = changes[k].newValue;
        target[k] = v === undefined ? (area === 'sync' ? DEFAULTS[k] : LOCAL_DEFAULTS[k]) : v;
      }
      applyPosition();
      schedule(true);
    });
  }

  function allReferences() {
    return BUILTIN.concat(local.areas || [], settings.custom || []);
  }
  function enabledReferences() {
    const off = new Set(settings.disabled || []);
    return allReferences().filter((r) => !off.has(r.id)).sort((a, b) => b.width_m * b.height_m - a.width_m * a.height_m);
  }

  // ---------- view from URL ----------
  // Map mode:       @lat,lng,13.5z   -> Web Mercator zoom, 256 px tiles
  // Satellite mode: @lat,lng,5310m   -> visible map height in metres (verified against zoom levels)
  // 3D mode:        @lat,lng,1234a,35y,45h,60t -> altitude, field of view, heading, tilt (approximation)
  const RE = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(\d+(?:\.\d+)?)([zma])(?:,(\d+(?:\.\d+)?)y)?(?:,(-?\d+(?:\.\d+)?)h)?(?:,(\d+(?:\.\d+)?)t)?/;
  function parseView(href) {
    const m = href.match(RE);
    if (!m) return null;
    const lat = +m[1], lng = +m[2], val = +m[3], unit = m[4];
    const H = window.innerHeight || 800;
    let mpp, mode, approx = false;
    if (unit === 'z') {
      mpp = 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, val);
      mode = 'kaart';
    } else if (unit === 'm') {
      mpp = val / H;
      mode = 'satelliet';
    } else {
      const fov = m[5] ? +m[5] : 35;
      mpp = 2 * val * Math.tan(fov * Math.PI / 360) / H;
      mode = '3D';
      approx = true;
    }
    if (!(mpp > 0) || !isFinite(mpp)) return null;
    return { lat, lng, mpp, mode, approx };
  }

  // ---------- widget ----------
  let widget, nameEl, sizeEl, canvas, ctx, scaleEl, pinBtn, toolsEl;
  function build() {
    widget = document.createElement('div');
    widget.id = 'msr-widget';
    widget.innerHTML =
      '<div class="msr-head"><span class="msr-name"></span><span class="msr-size"></span></div>' +
      '<canvas></canvas>' +
      '<div class="msr-foot"><span class="msr-scale"></span><span class="msr-tools">' +
      '<button data-act="prev" title="Grotere referentie">&#9664;</button>' +
      '<button data-act="auto" class="msr-pin" title="Terug naar automatisch">auto</button>' +
      '<button data-act="next" title="Kleinere referentie">&#9654;</button>' +
      '<button data-act="hide" title="Verbergen tot herladen">&#10005;</button>' +
      '</span></div>';
    document.documentElement.appendChild(widget);
    nameEl = widget.querySelector('.msr-name');
    sizeEl = widget.querySelector('.msr-size');
    scaleEl = widget.querySelector('.msr-scale');
    pinBtn = widget.querySelector('[data-act="auto"]');
    toolsEl = widget.querySelector('.msr-tools');
    canvas = widget.querySelector('canvas');
    ctx = canvas.getContext('2d');
    widget.addEventListener('click', onClick);
    widget.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    setupDrag();
    applyPosition();
  }

  function applyPosition() {
    if (!widget) return;
    const p = settings.pos;
    if (p && typeof p.right === 'number' && typeof p.bottom === 'number') {
      widget.style.right = Math.max(0, p.right) + 'px';
      widget.style.bottom = Math.max(0, p.bottom) + 'px';
    } else {
      widget.style.right = '';
      widget.style.bottom = '';
    }
  }

  function setupDrag() {
    let start = null;
    widget.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || e.target.tagName === 'BUTTON') return;
      const r = widget.getBoundingClientRect();
      start = { x: e.clientX, y: e.clientY, right: window.innerWidth - r.right, bottom: window.innerHeight - r.bottom, moved: false };
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!start) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!start.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
      start.moved = true;
      widget.classList.add('msr-dragging');
      widget.style.right = Math.max(0, start.right - dx) + 'px';
      widget.style.bottom = Math.max(0, start.bottom - dy) + 'px';
    });
    window.addEventListener('mouseup', () => {
      if (!start) return;
      if (start.moved) {
        widget.classList.remove('msr-dragging');
        saveSettings({ pos: { right: parseFloat(widget.style.right), bottom: parseFloat(widget.style.bottom) } });
        widget.__suppressClick = true;
        setTimeout(() => { widget.__suppressClick = false; }, 0);
      }
      start = null;
    });
  }

  function onClick(e) {
    if (widget.__suppressClick) return;
    const act = e.target.dataset && e.target.dataset.act;
    const refs = enabledReferences();
    const idx = refs.findIndex((r) => r.id === (pinnedId || currentId));
    if (act === 'hide') { widget.classList.add('msr-hidden'); return; }
    if (act === 'auto') { pinnedId = null; }
    else if (act === 'prev') { pinnedId = refs[Math.max(0, idx - 1)] ? refs[Math.max(0, idx - 1)].id : null; }
    else if (act === 'next') { pinnedId = refs[Math.min(refs.length - 1, idx + 1)] ? refs[Math.min(refs.length - 1, idx + 1)].id : null; }
    else { // plain click: cycle to the next smaller reference, then back to automatic
      if (idx >= 0 && idx < refs.length - 1) pinnedId = refs[idx + 1].id; else pinnedId = null;
    }
    schedule(true);
  }

  // ---------- selection ----------
  function fits(ref, mpp, w, h) {
    return ref.width_m / mpp <= w && ref.height_m / mpp <= h;
  }
  function chooseReference(mpp) {
    const refs = enabledReferences();
    if (!refs.length) return null;
    if (pinnedId) {
      const p = refs.find((r) => r.id === pinnedId);
      if (p) return p;
      pinnedId = null;
    }
    const w = settings.boxW - 2 * PAD, h = settings.boxH - 2 * PAD;
    // Largest reference that fits. If that one would be a speck (under 12 px) while the next larger
    // one overflows the panel by at most 60 percent, show the larger one clipped instead.
    for (let i = 0; i < refs.length; i++) {
      const r = refs[i];
      if (!fits(r, mpp, w, h)) continue;
      if (i > 0 && Math.max(r.width_m, r.height_m) / mpp < 12) {
        const big = refs[i - 1];
        if (big.width_m / mpp <= 1.6 * w && big.height_m / mpp <= 1.6 * h) return big;
      }
      return r;
    }
    return refs[refs.length - 1];                              // nothing fits: smallest, clipped
  }

  // ---------- formatting ----------
  function fmtLen(m) {
    if (m >= 10000) return Math.round(m / 1000) + ' km';
    if (m >= 1000) return (m / 1000).toFixed(1).replace('.0', '') + ' km';
    return Math.round(m) + ' m';
  }
  function fmtScale(mpp) {
    const target = 100; // metres per 100 px, a size people can read
    const v = mpp * target;
    return '100 px ≈ ' + fmtLen(v);
  }

  // ---------- drawing ----------
  function draw() {
    raf = 0;
    if (!widget) return;
    if (!settings.enabled || !view) { widget.style.visibility = 'hidden'; return; }
    const ref = chooseReference(view.mpp);
    if (!ref) { widget.style.visibility = 'hidden'; return; }
    widget.style.visibility = '';

    if (ref.id !== currentId) {
      currentId = ref.id;
      flashUntil = performance.now() + 1200;
      nameEl.classList.add('msr-flash');
      setTimeout(() => { if (performance.now() >= flashUntil) nameEl.classList.remove('msr-flash'); }, 1250);
    }
    nameEl.textContent = ref.name;
    sizeEl.textContent = fmtLen(ref.width_m) + ' × ' + fmtLen(ref.height_m);
    scaleEl.textContent = fmtScale(view.mpp) + (view.approx ? ' (' + view.mode + ', bij benadering)' : '');
    pinBtn.style.visibility = pinnedId ? '' : 'hidden';

    const W = settings.boxW, H = settings.boxH;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    }
    widget.style.width = W + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const s = 1 / view.mpp;                   // px per metre
    const b = ref.bbox;                       // [minx, miny, maxx, maxy] metres
    const cx = W / 2 - ((b[0] + b[2]) / 2) * s;
    const cy = H / 2 + ((b[1] + b[3]) / 2) * s;
    const X = (x) => cx + x * s;
    const Y = (y) => cy - y * s;

    const tooBig = ref.width_m * s > W || ref.height_m * s > H;
    const tiny = Math.max(ref.width_m, ref.height_m) * s < 6;

    ctx.lineJoin = 'round';
    ctx.lineWidth = tiny ? 1 : 1.5;
    ctx.fillStyle = 'rgba(234, 88, 12, 0.28)';
    ctx.strokeStyle = 'rgba(194, 65, 12, 0.95)';
    for (const poly of ref.polygons) {
      ctx.beginPath();
      for (const ring of poly) {
        ring.forEach((p, i) => { if (i === 0) ctx.moveTo(X(p[0]), Y(p[1])); else ctx.lineTo(X(p[0]), Y(p[1])); });
        ctx.closePath();
      }
      ctx.fill('evenodd');
      ctx.stroke();
    }
    if (ref.lines) {
      ctx.beginPath();
      for (const line of ref.lines) line.forEach((p, i) => { if (i === 0) ctx.moveTo(X(p[0]), Y(p[1])); else ctx.lineTo(X(p[0]), Y(p[1])); });
      ctx.stroke();
    }
    const marker = ref.marker || (local.markers && local.markers[ref.id]);
    if (marker && !tiny) {
      ctx.beginPath();
      ctx.arc(X(marker[0]), Y(marker[1]), 2.5, 0, Math.PI * 2);
      ctx.fillStyle = '#1a73e8';
      ctx.fill();
    }
    if (tiny) { // make a near-invisible speck findable
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, 7, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(194, 65, 12, 0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    if (tooBig) {
      ctx.fillStyle = 'rgba(32, 33, 36, 0.7)';
      ctx.font = '11px Roboto, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('groter dan dit venster', W / 2, H - 6);
    }
  }

  function schedule(force) {
    const href = location.href;
    const h = window.innerHeight;
    if (!force && href === lastHref && h === lastHeight) return;
    lastHref = href; lastHeight = h;
    const v = parseView(href);
    if (v) view = v;
    // setTimeout rather than requestAnimationFrame: the latter never fires in a background tab
    if (!raf) raf = setTimeout(draw, 16);
  }

  // ---------- messages from the popup ----------
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, sender, reply) => {
      if (!msg || typeof msg.type !== 'string') return;
      if (msg.type === 'msr:state') {
        const ref = view ? chooseReference(view.mpp) : null;
        reply({ view, current: ref ? { id: ref.id, name: ref.name } : null, pinnedId });
      } else if (msg.type === 'msr:capture') {
        if (!view) { reply({ error: 'Geen kaartpositie gevonden in de URL.' }); return; }
        const w = Math.round(window.innerWidth * view.mpp);
        const h = Math.round(window.innerHeight * view.mpp);
        const name = (msg.name || '').trim() || ('Uitsnede ' + new Date().toLocaleDateString('nl-NL'));
        const ref = {
          id: 'custom-' + Date.now(),
          name, width_m: w, height_m: h,
          bbox: [-w / 2, -h / 2, w / 2, h / 2],
          polygons: [[[[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2], [-w / 2, -h / 2]]]],
          center: [view.lat, view.lng],
          source: 'Eigen kaartuitsnede, ' + new Date().toISOString().slice(0, 10),
          custom: true,
        };
        const custom = (settings.custom || []).concat([ref]);
        saveSettings({ custom });
        reply({ ok: true, ref: { id: ref.id, name, width_m: w, height_m: h } });
      } else if (msg.type === 'msr:show') {
        widget.classList.remove('msr-hidden');
        reply({ ok: true });
      }
    });
  }

  // ---------- start ----------
  loadSettings(() => {
    build();
    schedule(true);
    setInterval(() => schedule(false), 250);
    window.addEventListener('resize', () => schedule(true));
  });
})();
