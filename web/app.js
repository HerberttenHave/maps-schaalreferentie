// Maps schaalreferentie, web version. Same reference data and helpers as the Chrome extension
// (../extension/references.js, geo.js, pdok.js), drawn next to a Leaflet map with OpenStreetMap tiles.
(() => {
  const BUILTIN = window.MSR_BUILTIN_REFERENCES || [];
  const GEO = window.MSR_GEO;
  const PDOK = window.MSR_PDOK;
  const PAD = 6;
  const $ = (id) => document.getElementById(id);

  // ---------- texts ----------
  const T = {
    nl: {
      searchPlaceholder: 'Zoek een plaats of adres', search: 'Zoeken', whatIs: 'Wat is dit?', close: 'Sluiten',
      locate: 'Mijn locatie', panelHint: 'Tik om een kleinere referentie te kiezen',
      larger: 'Grotere referentie', smaller: 'Kleinere referentie', backToAuto: 'Terug naar automatisch',
      aboutText: 'Rechtsonder staat een vorm die je kent: Nederland, je provincie, gemeente, wijk of buurt, een vierkante kilometer of een voetbalveld, op precies dezelfde schaal als de kaart. Zoom in of uit en de vorm groeit mee. Past hij niet meer, dan springt het venster naar de volgende. Zo zie je overal ter wereld hoe groot iets is. Tik op het venster om zelf een kleinere referentie te kiezen.',
      aboutPrivacy: 'Geen cookies, geen tracking. Je instellingen en je adres blijven op je telefoon; alleen de opzoeking gaat naar PDOK, de geo-dienst van de overheid.',
      extensionLink: 'Google Maps op een computer? Er is ook een Chrome-extensie (gratis, open source).',
      toMap: 'Naar de kaart', myAddress: 'Mijn adres (Nederland)',
      addressHelp: 'Vul je adres in voor je provincie, gemeente, wijk en buurt, met een blauw stipje op je huis.',
      addressPlaceholder: 'Straat huisnummer, plaats', set: 'Instellen', clear: 'Wissen',
      lookingUp: 'Opzoeken bij PDOK...', searching: 'Zoeken...', notFound: 'Adres niet gevonden. Probeer "straat huisnummer, plaats".',
      noAreas: 'Geen gebiedsomtrekken gevonden voor dit adres.', setTo: 'Ingesteld: ',
      references: 'Referenties', provinces: 'Provincies', on: 'aan', of: 'van', language: 'Taal',
      sources: 'Kaart: OpenStreetMap. Vormen: CBS Gebiedsindelingen en Wijk- en buurtkaart 2024 via PDOK; voetbalveld 105 × 68 m (FIFA). De kaart is in Web Mercator, dus de vorm is zo groot als het gebied zou zijn als het lag waar je nu kijkt.',
      tooBig: 'groter dan dit venster', nothingFound: 'Niets gevonden', searchFail: 'Zoeken mislukt, probeer het later opnieuw',
      geoFail: 'Locatie niet beschikbaar', geoDenied: 'Geef de browser toegang tot je locatie',
      kind: { gemeente: 'gemeente', wijk: 'wijk', buurt: 'buurt' },
      names: {},
    },
    en: {
      searchPlaceholder: 'Search a place or address', search: 'Search', whatIs: 'What is this?', close: 'Close',
      locate: 'My location', panelHint: 'Tap to pick a smaller reference',
      larger: 'Larger reference', smaller: 'Smaller reference', backToAuto: 'Back to automatic',
      aboutText: 'Bottom right you see a shape you know: the Netherlands, a province, municipality, district or neighbourhood, one square kilometre or a football pitch, at exactly the scale of the map. Zoom in or out and the shape grows with the map. When it no longer fits, the panel switches to the next one. So you can see how big anything is, anywhere in the world. Tap the panel to pick a smaller reference yourself.',
      aboutPrivacy: 'No cookies, no tracking. Your settings and address stay on your phone; only the lookup goes to PDOK, the Dutch national geo service.',
      extensionLink: 'Using Google Maps on a computer? There is also a Chrome extension (free, open source).',
      toMap: 'To the map', myAddress: 'My address (Netherlands)',
      addressHelp: 'Enter a Dutch address to get your province, municipality, district and neighbourhood, with a blue dot on your home.',
      addressPlaceholder: 'Street number, town', set: 'Set', clear: 'Clear',
      lookingUp: 'Looking up at PDOK...', searching: 'Searching...', notFound: 'Address not found. Try "street number, town".',
      noAreas: 'No area outlines found for this address.', setTo: 'Set: ',
      references: 'References', provinces: 'Provinces', on: 'on', of: 'of', language: 'Language',
      sources: 'Map: OpenStreetMap. Shapes: CBS area outlines 2024 via PDOK; football pitch 105 × 68 m (FIFA). The map is Web Mercator, so the shape is as big as the area would be if it lay where you are looking.',
      tooBig: 'larger than this panel', nothingFound: 'Nothing found', searchFail: 'Search failed, please try again later',
      geoFail: 'Location not available', geoDenied: 'Allow the browser to use your location',
      kind: { gemeente: 'municipality', wijk: 'district', buurt: 'neighbourhood' },
      names: { nl: 'The Netherlands', km2: '1 square kilometre', voetbalveld: 'Football pitch' },
    },
  };

  // ---------- storage (localStorage only) ----------
  const KEYS = { lang: 'msr.lang', disabled: 'msr.disabled', areas: 'msr.areas', markers: 'msr.markers', address: 'msr.address', view: 'msr.view', seen: 'msr.seen' };
  function load(key, fallback) {
    try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
  }
  function save(key, value) {
    try { if (value == null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode */ }
  }

  const PROVINCE_IDS = BUILTIN.filter((r) => r.id.startsWith('prov-')).map((r) => r.id);
  let lang = load(KEYS.lang, null) === 'en' ? 'en' : 'nl';   // Dutch unless the visitor chose English
  let disabled = new Set(load(KEYS.disabled, PROVINCE_IDS));
  let areas = load(KEYS.areas, []);
  let markers = load(KEYS.markers, {});
  let address = load(KEYS.address, null);

  let pinnedId = null, currentId = null, flashTimer = 0, raf = 0;
  let boxW = 260, boxH = 200;
  let view = null; // {lat, lng, mpp, zoom}

  const t = (k) => (T[lang][k] != null ? T[lang][k] : T.nl[k]);
  function refName(r) { return T[lang].names[r.id] || r.name; }

  // ---------- references ----------
  function allReferences() { return BUILTIN.concat(areas || []); }
  function enabledReferences() {
    return allReferences().filter((r) => !disabled.has(r.id)).sort((a, b) => b.width_m * b.height_m - a.width_m * a.height_m);
  }
  function fits(ref, mpp, w, h) { return ref.width_m / mpp <= w && ref.height_m / mpp <= h; }
  function chooseReference(mpp) {
    const refs = enabledReferences();
    if (!refs.length) return null;
    if (pinnedId) {
      const p = refs.find((r) => r.id === pinnedId);
      if (p) return p;
      pinnedId = null;
    }
    const w = boxW - 2 * PAD, h = boxH - 2 * PAD;
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
  function num(v, digits) {
    const s = v.toFixed(digits).replace(/\.0$/, '');
    return lang === 'nl' ? s.replace('.', ',') : s;
  }
  function fmtLen(m) {
    if (m >= 10000) return Math.round(m / 1000) + ' km';
    if (m >= 1000) return num(m / 1000, 1) + ' km';
    return Math.round(m) + ' m';
  }
  function fmtScale(mpp) { return '100 px ≈ ' + fmtLen(mpp * 100); }

  // ---------- map ----------
  // Metres per pixel at the view centre: Web Mercator with 256 px tiles, the same formula as the extension.
  function metresPerPixel(lat, zoom) { return 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoom); }

  const DEFAULT_VIEW = { lat: 52.2, lng: 5.3, zoom: 6 };
  function viewFromHash() {
    const m = /^#(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(\d+(?:\.\d+)?)z?$/.exec(location.hash || '');
    return m ? { lat: +m[1], lng: +m[2], zoom: +m[3] } : null;
  }
  const start = viewFromHash() || load(KEYS.view, null) || DEFAULT_VIEW;

  const map = L.map('map', {
    center: [start.lat, start.lng], zoom: start.zoom,
    zoomControl: true, zoomSnap: 0.25, zoomDelta: 0.5, wheelPxPerZoomLevel: 90,
    worldCopyJump: true, attributionControl: false, minZoom: 2,
  });
  L.control.attribution({ position: 'bottomleft', prefix: false }).addTo(map);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
  }).addTo(map);

  function readView() {
    const c = map.getCenter();
    const z = map.getZoom();
    const mpp = metresPerPixel(c.lat, z);
    if (!(mpp > 0) || !isFinite(mpp)) return;
    view = { lat: c.lat, lng: c.lng, mpp, zoom: z };
  }
  function schedule() {
    readView();
    if (!raf) raf = setTimeout(draw, 16);   // setTimeout, not requestAnimationFrame: the latter stalls in background tabs
  }
  map.on('move zoom resize', schedule);
  map.on('zoomanim', (e) => {   // animated zoom (wheel, double tap, +/-): draw the target scale at once
    view = { lat: e.center.lat, lng: e.center.lng, mpp: metresPerPixel(e.center.lat, e.zoom), zoom: e.zoom };
    if (!raf) raf = setTimeout(draw, 16);   // setTimeout, not requestAnimationFrame: the latter stalls in background tabs
  });
  map.on('moveend zoomend', () => {
    schedule();
    if (!view) return;
    const v = { lat: +view.lat.toFixed(5), lng: +view.lng.toFixed(5), zoom: +view.zoom.toFixed(2) };
    save(KEYS.view, v);
    history.replaceState(null, '', '#' + v.lat + ',' + v.lng + ',' + v.zoom + 'z');
  });
  window.addEventListener('hashchange', () => {
    const v = viewFromHash();
    if (v) map.setView([v.lat, v.lng], v.zoom);
  });

  // ---------- panel ----------
  const widget = $('msr-widget');
  const nameEl = widget.querySelector('.msr-name');
  const sizeEl = widget.querySelector('.msr-size');
  const scaleEl = widget.querySelector('.msr-scale');
  const pinBtn = widget.querySelector('[data-act="auto"]');
  const canvas = widget.querySelector('canvas');
  const ctx = canvas.getContext('2d');

  function sizePanel() {
    boxW = Math.min(260, Math.max(180, Math.floor(window.innerWidth * 0.6)));
    boxH = Math.round(boxW * 200 / 260);
    document.documentElement.style.setProperty('--panel-w', boxW + 'px');
    document.documentElement.style.setProperty('--panel-h', (boxH + 42) + 'px');
  }
  window.addEventListener('resize', () => { sizePanel(); schedule(); });
  sizePanel();

  widget.addEventListener('click', (e) => {
    const act = e.target.dataset && e.target.dataset.act;
    const refs = enabledReferences();
    const idx = refs.findIndex((r) => r.id === (pinnedId || currentId));
    if (act === 'auto') { pinnedId = null; }
    else if (act === 'prev') { pinnedId = refs[Math.max(0, idx - 1)] ? refs[Math.max(0, idx - 1)].id : null; }
    else if (act === 'next') { pinnedId = refs[Math.min(refs.length - 1, idx + 1)] ? refs[Math.min(refs.length - 1, idx + 1)].id : null; }
    else { // plain tap: next smaller reference, then back to automatic
      if (idx >= 0 && idx < refs.length - 1) pinnedId = refs[idx + 1].id; else pinnedId = null;
    }
    schedule();
  });

  function draw() {
    raf = 0;
    if (!view) return;
    const ref = chooseReference(view.mpp);
    if (!ref) { widget.style.visibility = 'hidden'; return; }
    widget.style.visibility = '';

    if (ref.id !== currentId) {
      currentId = ref.id;
      nameEl.classList.add('msr-flash');
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => nameEl.classList.remove('msr-flash'), 1200);
    }
    nameEl.textContent = refName(ref);
    sizeEl.textContent = fmtLen(ref.width_m) + ' × ' + fmtLen(ref.height_m);
    scaleEl.textContent = fmtScale(view.mpp);
    pinBtn.style.visibility = pinnedId ? '' : 'hidden';

    const W = boxW, H = boxH;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    }
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
    const marker = ref.marker || markers[ref.id];
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
      ctx.fillText(t('tooBig'), W / 2, H - 6);
    }
  }

  // ---------- search (Nominatim, worldwide) ----------
  let toastTimer = 0;
  function toast(msg, ms) {
    const el = $('searchMsg');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    if (ms) toastTimer = setTimeout(() => { el.hidden = true; }, ms);
  }
  $('searchForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = $('searchInput').value.trim();
    if (!q) return;
    $('searchInput').blur();
    toast(t('searching'));
    try {
      const p = new URLSearchParams({ q, format: 'jsonv2', limit: '1', 'accept-language': lang });
      const r = await fetch('https://nominatim.openstreetmap.org/search?' + p.toString(), { headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error(r.status);
      const hits = await r.json();
      if (!hits.length) { toast(t('nothingFound'), 2500); return; }
      const h = hits[0];
      const bb = h.boundingbox.map(Number); // [south, north, west, east]
      map.fitBounds([[bb[0], bb[2]], [bb[1], bb[3]]], { maxZoom: 16 });
      toast(h.display_name, 4000);
    } catch (err) {
      toast(t('searchFail'), 3000);
    }
  });

  // ---------- geolocation ----------
  let hereMarker = null;
  $('locateBtn').addEventListener('click', () => {
    if (!navigator.geolocation) { toast(t('geoFail'), 2500); return; }
    $('locateBtn').classList.add('busy');
    map.locate({ setView: true, maxZoom: 15, enableHighAccuracy: true, timeout: 12000 });
  });
  map.on('locationfound', (e) => {
    $('locateBtn').classList.remove('busy');
    if (hereMarker) hereMarker.remove();
    hereMarker = L.circleMarker(e.latlng, { radius: 7, color: '#fff', weight: 2, fillColor: '#1a73e8', fillOpacity: 1 }).addTo(map);
  });
  map.on('locationerror', (e) => {
    $('locateBtn').classList.remove('busy');
    toast(e.code === 1 ? t('geoDenied') : t('geoFail'), 3000);
  });

  // ---------- sheet: about, address, references, language ----------
  function openSheet() { $('sheet').hidden = false; $('sheetBackdrop').hidden = false; }
  function closeSheet() { $('sheet').hidden = true; $('sheetBackdrop').hidden = true; save(KEYS.seen, true); }
  $('helpBtn').addEventListener('click', openSheet);
  $('closeBtn').addEventListener('click', closeSheet);
  $('goBtn').addEventListener('click', closeSheet);
  $('sheetBackdrop').addEventListener('click', closeSheet);

  function setDisabled(id, off) {
    if (off) disabled.add(id); else disabled.delete(id);
    save(KEYS.disabled, [...disabled]);
    schedule();
  }

  function refRow(r) {
    const row = document.createElement('label');
    row.className = 'row';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !disabled.has(r.id);
    cb.addEventListener('change', () => setDisabled(r.id, !cb.checked));
    row.appendChild(cb);
    const name = document.createElement('span');
    name.textContent = refName(r) + (r.kind ? ' (' + t('kind')[r.kind] + ')' : '');
    name.title = r.source || '';
    row.appendChild(name);
    const size = document.createElement('span');
    size.className = 'size';
    size.textContent = fmtLen(r.width_m) + ' × ' + fmtLen(r.height_m);
    row.appendChild(size);
    return row;
  }
  function renderRefs() {
    const box = $('refs');
    box.innerHTML = '';
    const byArea = (a, b) => b.width_m * b.height_m - a.width_m * a.height_m;
    const provinces = BUILTIN.filter((r) => r.id.startsWith('prov-')).sort((a, b) => a.name.localeCompare(b.name));
    const rest = BUILTIN.filter((r) => !r.id.startsWith('prov-')).concat(areas || []).sort(byArea);
    for (const r of rest) box.appendChild(refRow(r));
    const det = document.createElement('details');
    const on = provinces.filter((p) => !disabled.has(p.id)).length;
    const sum = document.createElement('summary');
    sum.textContent = t('provinces') + ' (' + on + ' ' + t('of') + ' ' + provinces.length + ' ' + t('on') + ')';
    det.appendChild(sum);
    for (const r of provinces) det.appendChild(refRow(r));
    box.appendChild(det);
  }
  function renderAddress() {
    $('addrSet').hidden = !address;
    $('addrForm').hidden = !!address;
    if (address) $('addrLabel').textContent = address.label;
  }

  async function setAddress() {
    const q = $('addrInput').value.trim();
    const msg = $('addrMsg');
    if (!q) return;
    msg.className = 'msg';
    msg.textContent = t('lookingUp');
    $('addrBtn').disabled = true;
    try {
      const geo = await PDOK.geocode(q);
      if (!geo) throw new Error(t('notFound'));
      const found = await PDOK.fetchAreas(geo, GEO);
      if (!found.length) throw new Error(t('noAreas'));
      const mk = {};
      if (geo.lon != null) {
        for (const a of found) { const m = GEO.markerFor(a, geo.lon, geo.lat); if (m) a.marker = m; }
        for (const r of BUILTIN) { const m = GEO.markerFor(r, geo.lon, geo.lat); if (m) mk[r.id] = m; }
      }
      const provId = geo.provinciecode ? 'prov-' + geo.provinciecode : null;
      const prov = BUILTIN.find((r) => r.id === provId) || BUILTIN.find((r) => r.id.startsWith('prov-') && r.name === geo.provincienaam);
      areas = found; markers = mk;
      address = { label: geo.label, provId: prov ? prov.id : null, lat: geo.lat, lon: geo.lon };
      save(KEYS.areas, areas); save(KEYS.markers, markers); save(KEYS.address, address);
      for (const a of areas) disabled.delete(a.id);
      if (prov) setDisabled(prov.id, false); else save(KEYS.disabled, [...disabled]);
      pinnedId = null;
      msg.textContent = t('setTo') + areas.map((a) => a.name).join(', ') + (prov ? ', ' + prov.name : '') + '.';
      $('addrInput').value = '';
      renderAddress();
      renderRefs();
      schedule();
    } catch (e) {
      msg.className = 'msg err';
      msg.textContent = e.message || String(e);
    }
    $('addrBtn').disabled = false;
  }
  function clearAddress() {
    areas = []; markers = {}; address = null;
    save(KEYS.areas, null); save(KEYS.markers, null); save(KEYS.address, null);
    $('addrMsg').textContent = '';
    renderAddress();
    renderRefs();
    schedule();
  }
  $('addrBtn').addEventListener('click', setAddress);
  $('addrInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); setAddress(); } });
  $('addrClear').addEventListener('click', clearAddress);

  // ---------- language ----------
  function applyLang() {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => { el.placeholder = t(el.dataset.i18nPlaceholder); });
    document.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); el.setAttribute('aria-label', t(el.dataset.i18nTitle)); });
    $('langBtn').textContent = lang === 'nl' ? 'EN' : 'NL';
    $('langBtn').title = lang === 'nl' ? 'English' : 'Nederlands';
    document.querySelectorAll('.langPick').forEach((b) => b.classList.toggle('on', b.dataset.lang === lang));
    renderRefs();
    currentId = null;
    schedule();
  }
  function setLang(l) { lang = l; save(KEYS.lang, l); applyLang(); }
  $('langBtn').addEventListener('click', () => setLang(lang === 'nl' ? 'en' : 'nl'));
  document.querySelectorAll('.langPick').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.lang)));

  // ---------- start ----------
  renderAddress();
  applyLang();
  if (!load(KEYS.seen, false)) openSheet();
  schedule();
})();
