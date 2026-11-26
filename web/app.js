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
    en: {
      title: 'How big is it?', cta: 'Add my home', ctaDone: 'My places',
      searchPlaceholder: 'Search', search: 'Search', close: 'Close',
      locate: 'My location', panelHint: 'Tap to select, drag to move',
      larger: 'Larger', smaller: 'Smaller', backToAuto: 'Back to automatic',
      aboutText: 'The red outline is a place you know, drawn at the scale of the map. Add your own:',
      myAddress: 'Your home', addressPlaceholder: 'Street 12, Town', set: 'Add', clear: 'Remove',
      addressHelp: 'Dutch addresses only. Somewhere else? Add your town below.',
      ownRef: 'Any place in the world', ownRefPlaceholder: 'Town, country or island', add: 'Add', remove: 'Remove',
      lookingUp: 'Looking up...', searching: 'Searching...', notFound: 'Not found. Try "Street 12, Town".',
      noAreas: 'No outlines found for this address.', setTo: 'Added: ',
      more: 'More options', references: 'Outlines', provinces: 'Dutch provinces', on: 'on', of: 'of',
      aboutPrivacy: 'No cookies, no tracking. Lookups go to PDOK and OpenStreetMap.',
      extensionLink: 'Chrome extension for Google Maps',
      sources: 'Data: OpenStreetMap, CBS via PDOK, Natural Earth.',
      nothingFound: 'Nothing found', searchFail: 'Search failed, try again later',
      geoFail: 'Location not available', geoDenied: 'Allow the browser to use your location',
      kind: { gemeente: 'municipality', wijk: 'district', buurt: 'neighbourhood' },
      names: { nl: 'The Netherlands', km2: '1 square kilometre', voetbalveld: 'Football pitch' },
      mapChoice: 'Map', mapChoiceHelp: 'Google Maps loads only if you pick it.',
      googleLoading: 'Loading Google Maps...', googleFail: 'Google Maps could not load, back to OpenStreetMap.',
      placeSearching: 'Looking up...', placeNotFound: 'Nothing found. Try another name.',
      placeFail: 'Lookup failed, try again later.', placeAdded: ' is now your reference.',
    },
    nl: {   // only through ?lang=nl (demo video, share images); the visible app is English
      title: 'Hoe groot is het?', cta: 'Mijn huis toevoegen', ctaDone: 'Mijn plekken',
      searchPlaceholder: 'Zoeken', search: 'Zoeken', close: 'Sluiten',
      locate: 'Mijn locatie', panelHint: 'Tik om te selecteren, sleep om te verplaatsen',
      larger: 'Groter', smaller: 'Kleiner', backToAuto: 'Terug naar automatisch',
      aboutText: 'De rode omtrek is een plek die je kent, op de schaal van de kaart. Voeg je eigen plek toe:',
      myAddress: 'Je huis', addressPlaceholder: 'Straat 12, plaats', set: 'Toevoegen', clear: 'Verwijderen',
      addressHelp: 'Alleen Nederlandse adressen. Ergens anders? Voeg hieronder je plaats toe.',
      ownRef: 'Elke plek ter wereld', ownRefPlaceholder: 'Plaats, land of eiland', add: 'Toevoegen', remove: 'Verwijderen',
      lookingUp: 'Opzoeken...', searching: 'Zoeken...', notFound: 'Niet gevonden. Probeer "Straat 12, plaats".',
      noAreas: 'Geen omtrekken gevonden voor dit adres.', setTo: 'Toegevoegd: ',
      more: 'Meer opties', references: 'Omtrekken', provinces: 'Provincies', on: 'aan', of: 'van',
      aboutPrivacy: 'Geen cookies, geen tracking. Opzoeken gaat via PDOK en OpenStreetMap.',
      extensionLink: 'Chrome-extensie voor Google Maps',
      sources: 'Data: OpenStreetMap, CBS via PDOK, Natural Earth.',
      nothingFound: 'Niets gevonden', searchFail: 'Zoeken mislukt, probeer het later opnieuw',
      geoFail: 'Locatie niet beschikbaar', geoDenied: 'Geef de browser toegang tot je locatie',
      kind: { gemeente: 'gemeente', wijk: 'wijk', buurt: 'buurt' },
      names: {},
      mapChoice: 'Kaart', mapChoiceHelp: 'Google Maps wordt alleen geladen als je het kiest.',
      googleLoading: 'Google Maps laden...', googleFail: 'Google Maps kon niet laden, terug naar OpenStreetMap.',
      placeSearching: 'Opzoeken...', placeNotFound: 'Niets gevonden. Probeer een andere naam.',
      placeFail: 'Opzoeken mislukt, probeer het later opnieuw.', placeAdded: ' is nu je referentie.',
    },
  };

  // ---------- storage (localStorage only) ----------
  const KEYS = { lang: 'msr.lang', disabled: 'msr.disabled', areas: 'msr.areas', markers: 'msr.markers', address: 'msr.address', view: 'msr.view', seen: 'msr.seen', pos: 'msr.pos', map: 'msr.map', places: 'msr.places' };
  function load(key, fallback) {
    try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
  }
  function save(key, value) {
    try { if (value == null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode */ }
  }

  const PROVINCE_IDS = BUILTIN.filter((r) => r.id.startsWith('prov-')).map((r) => r.id);
  const lang = new URLSearchParams(location.search).get('lang') === 'nl' ? 'nl' : 'en';   // English; ?lang=nl for tools
  let disabled = new Set(load(KEYS.disabled, PROVINCE_IDS));
  let areas = load(KEYS.areas, []);
  let markers = load(KEYS.markers, {});
  let address = load(KEYS.address, null);
  let places = load(KEYS.places, []);      // own references from anywhere in the world, see web/places.js

  // Share links: ?ref=Zuid-Afrika#72,-41,3z pins that reference and lays it in the middle of the screen,
  // over whatever the view in the hash shows. The reference is looked up like an own reference.
  const REF_QUERY = (new URLSearchParams(location.search).get('ref') || '').trim();
  let refLoading = !!REF_QUERY;
  // ...&home=1 lays the outline on the reference's own place on the map, glued there until it is dragged away.
  let homeLock = !!REF_QUERY && new URLSearchParams(location.search).get('home') === '1';
  if (REF_QUERY && !homeLock) document.body.classList.add('ref-mid');

  let pinnedId = null, currentId = null, flashTimer = 0, raf = 0;
  let boxW = 260, boxH = 200;
  let view = null; // {lat, lng, mpp, zoom}

  const t = (k) => (T[lang][k] != null ? T[lang][k] : T.en[k]);
  function refName(r) { return T[lang].names[r.id] || r.name; }

  // ---------- references ----------
  function allReferences() { return BUILTIN.concat(areas || [], places || []); }
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
    // one overflows the panel by at most a factor 2, show the larger one clipped instead.
    for (let i = 0; i < refs.length; i++) {
      const r = refs[i];
      if (!fits(r, mpp, w, h)) continue;
      if (i > 0 && Math.max(r.width_m, r.height_m) / mpp < 12) {
        const big = refs[i - 1];
        if (big.width_m / mpp <= 2 * w && big.height_m / mpp <= 2 * h) return big;
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

  // Base map: OpenStreetMap in Leaflet (default) or Google Maps, only when web/config.js holds a key.
  // Both sit behind the same small adapter so the panel, search and address flow do not care which one runs.
  // Google tiles are never loaded into Leaflet; Google is shown only through its own JavaScript API.
  const CONFIG = window.MSR_CONFIG || {};
  const GOOGLE_KEY = String(CONFIG.googleMapsKey || '').trim();
  let mapChoice = GOOGLE_KEY && load(KEYS.map, 'osm') === 'google' ? 'google' : 'osm';
  let mapApi = null;

  function setView(v) {
    const mpp = metresPerPixel(v.lat, v.zoom);
    if (!(mpp > 0) || !isFinite(mpp)) return;
    view = { lat: v.lat, lng: v.lng, mpp, zoom: v.zoom };
  }
  function readView() {
    const v = mapApi && mapApi.getView();
    if (v) setView(v);
  }
  function schedule() {
    readView();
    if (!raf) raf = setTimeout(draw, 16);   // setTimeout, not requestAnimationFrame: the latter stalls in background tabs
  }
  function persistView() {
    if (!view) return;
    const v = { lat: +view.lat.toFixed(5), lng: +view.lng.toFixed(5), zoom: +view.zoom.toFixed(2) };
    save(KEYS.view, v);
    history.replaceState(null, '', '#' + v.lat + ',' + v.lng + ',' + v.zoom + 'z');
  }
  window.addEventListener('hashchange', () => {
    const v = viewFromHash();
    if (v && mapApi) mapApi.setView(v.lat, v.lng, v.zoom);
  });

  // Adapter interface: getView() -> {lat, lng, zoom} or null; setView(lat, lng, zoom); fitBounds(s, w, n, e, maxZoom);
  // setHere(lat, lng); on('move', cb) continuous (cb gets the target view during an animated zoom); on('moveend', cb); destroy().
  function makeEmitter() {
    const handlers = { move: [], moveend: [] };
    return { on: (k, cb) => handlers[k].push(cb), emit: (k, v) => handlers[k].forEach((cb) => cb(v)) };
  }

  function leafletAdapter(el, v) {
    const map = L.map(el, {
      center: [v.lat, v.lng], zoom: v.zoom,
      zoomControl: true, zoomSnap: 0.25, zoomDelta: 0.5, wheelPxPerZoomLevel: 90,
      worldCopyJump: true, attributionControl: false, minZoom: 2,
    });
    L.control.attribution({ position: 'bottomleft', prefix: false }).addTo(map);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    }).addTo(map);
    const ev = makeEmitter();
    map.on('move zoom resize', () => ev.emit('move'));
    map.on('zoomanim', (e) => ev.emit('move', { lat: e.center.lat, lng: e.center.lng, zoom: e.zoom }));   // target scale at once
    map.on('moveend zoomend', () => ev.emit('moveend'));
    let here = null;
    return {
      kind: 'osm', on: ev.on,
      getView() { const c = map.getCenter(); return { lat: c.lat, lng: c.lng, zoom: map.getZoom() }; },
      setView(lat, lng, zoom) { map.setView([lat, lng], zoom); },
      fitBounds(s, w, n, e, maxZoom) { map.fitBounds([[s, w], [n, e]], { maxZoom }); },
      setHere(lat, lng) {
        if (here) here.remove();
        here = L.circleMarker([lat, lng], { radius: 7, color: '#fff', weight: 2, fillColor: '#1a73e8', fillOpacity: 1 }).addTo(map);
      },
      destroy() { map.remove(); },
    };
  }

  function googleAdapter(el, v) {
    const g = google.maps;
    const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
    const map = new g.Map(el, {
      center: { lat: v.lat, lng: v.lng }, zoom: v.zoom, minZoom: 2,
      mapTypeId: 'roadmap',
      mapTypeControl: true,   // roadmap / satellite, bottom left above the Google logo
      mapTypeControlOptions: { style: g.MapTypeControlStyle.DROPDOWN_MENU, position: g.ControlPosition.LEFT_BOTTOM },
      zoomControl: !coarse, zoomControlOptions: { position: g.ControlPosition.LEFT_CENTER },
      streetViewControl: false, fullscreenControl: false, clickableIcons: false,
      gestureHandling: 'greedy',
    });
    const ev = makeEmitter();
    map.addListener('bounds_changed', () => ev.emit('move'));
    map.addListener('idle', () => ev.emit('moveend'));
    let here = null;
    return {
      kind: 'google', on: ev.on,
      getView() {
        const c = map.getCenter(), z = map.getZoom();
        return c && z != null ? { lat: c.lat(), lng: c.lng(), zoom: z } : null;
      },
      setView(lat, lng, zoom) { map.moveCamera({ center: { lat, lng }, zoom }); },
      fitBounds(s, w, n, e, maxZoom) {
        map.fitBounds(new g.LatLngBounds({ lat: s, lng: w }, { lat: n, lng: e }), 0);
        g.event.addListenerOnce(map, 'idle', () => { if (map.getZoom() > maxZoom) map.setZoom(maxZoom); });
      },
      setHere(lat, lng) {
        if (here) here.setMap(null);
        here = new g.Marker({
          position: { lat, lng }, map, clickable: false,
          icon: { path: g.SymbolPath.CIRCLE, scale: 7, fillColor: '#1a73e8', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 },
        });
      },
      destroy() { g.event.clearInstanceListeners(map); },
    };
  }

  // Loads the Google Maps JavaScript API once. Rejects on a network error or a timeout; an invalid or
  // unauthorised key is reported later by Google through gm_authFailure (see mountMap).
  let googleLoad = null;
  function loadGoogle() {
    if (googleLoad) return googleLoad;
    googleLoad = new Promise((resolve, reject) => {
      if (window.google && google.maps && google.maps.Map) { resolve(); return; }
      const timer = setTimeout(() => reject(new Error('timeout')), 15000);
      window.__msrGoogleReady = () => { clearTimeout(timer); resolve(); };
      const s = document.createElement('script');
      s.src = 'https://maps.googleapis.com/maps/api/js?' + new URLSearchParams({
        key: GOOGLE_KEY, v: 'weekly', loading: 'async', callback: '__msrGoogleReady', language: lang, region: 'NL',
      }).toString();
      s.async = true;
      s.onerror = () => { clearTimeout(timer); reject(new Error('load')); };
      document.head.appendChild(s);
    });
    googleLoad.catch(() => { googleLoad = null; });
    return googleLoad;
  }
  window.gm_authFailure = () => { if (mapChoice === 'google') failGoogle(); };

  let mounting = 0;
  async function mountMap(kind) {
    const token = ++mounting;
    const v = view ? { lat: view.lat, lng: view.lng, zoom: view.zoom } : start;
    if (mapApi) { mapApi.destroy(); mapApi = null; }
    const el = $('map');
    el.innerHTML = '';
    el.removeAttribute('style');
    el.className = '';
    if (kind === 'google') {
      toast(t('googleLoading'));
      try { await loadGoogle(); } catch (e) { if (token === mounting) failGoogle(); return; }
      if (token !== mounting) return;
      $('searchMsg').hidden = true;
      mapApi = googleAdapter(el, v);
    } else {
      mapApi = leafletAdapter(el, v);
    }
    document.body.classList.toggle('map-google', kind === 'google');
    mapApi.on('move', (target) => {
      if (target) { setView(target); if (!raf) raf = setTimeout(draw, 16); } else schedule();
    });
    mapApi.on('moveend', () => { schedule(); persistView(); });
    schedule();
  }
  function failGoogle() {
    toast(t('googleFail'), 4000);
    setMapChoice('osm');
  }
  function setMapChoice(kind) {
    if (kind === 'google' && !GOOGLE_KEY) kind = 'osm';
    mapChoice = kind;
    save(KEYS.map, kind);
    document.querySelectorAll('.mapPick').forEach((b) => b.classList.toggle('on', b.dataset.map === kind));
    if (!mapApi || mapApi.kind !== kind) mountMap(kind);
  }

  // ---------- panel ----------
  const widget = $('msr-widget');
  const nameEl = widget.querySelector('.msr-name');
  const sizeEl = widget.querySelector('.msr-size');
  const pinBtn = widget.querySelector('[data-act="auto"]');
  const canvas = widget.querySelector('canvas');
  const ctx = canvas.getContext('2d');

  if (new URLSearchParams(location.search).get('ui') === '0') document.body.classList.add('no-ui');   // ?ui=0 hides the controls (screenshots)
  function sizePanel() {
    // ?panel=600 forces a larger frame (big screens, screenshots); otherwise it follows the screen width
    const forced = +(new URLSearchParams(location.search).get('panel') || 0);
    boxW = forced >= 120 ? Math.min(forced, window.innerWidth - 20)
      : REF_QUERY ? Math.min(420, window.innerWidth - 20)            // a share link gets a larger frame
      : Math.min(260, Math.max(180, Math.floor(window.innerWidth * 0.6)));
    boxH = Math.round(boxW * 200 / 260);
    document.documentElement.style.setProperty('--panel-w', boxW + 'px');
    document.documentElement.style.setProperty('--frame-h', boxH + 'px');
    // Size the canvas here, not in draw(): the scale is taken at the latitude under the frame, so the
    // frame must have its real size and place before the first drawing.
    canvas.style.width = boxW + 'px';
    canvas.style.height = boxH + 'px';
    document.documentElement.style.setProperty('--panel-h', (boxH + 54) + 'px');
  }
  window.addEventListener('resize', () => { sizePanel(); schedule(); });
  sizePanel();

  widget.addEventListener('click', (e) => {
    const act = e.target.dataset && e.target.dataset.act;
    if (!act) return;                      // plain taps select or drag, see setupDrag
    const refs = enabledReferences();
    const idx = refs.findIndex((r) => r.id === (pinnedId || currentId));
    if (act === 'auto') { pinnedId = null; }
    else if (act === 'prev') { pinnedId = refs[Math.max(0, idx - 1)] ? refs[Math.max(0, idx - 1)].id : null; }
    else if (act === 'next') { pinnedId = refs[Math.min(refs.length - 1, idx + 1)] ? refs[Math.min(refs.length - 1, idx + 1)].id : null; }
    schedule();
  });

  // Select and drag: a tap on the label row toggles selection; while selected the whole frame can be
  // dragged (mouse or finger). Dragging from the label row works without selecting first.
  function setupDrag() {
    let start = null;
    widget.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.tagName === 'BUTTON') return;
      const onLabel = !!e.target.closest('.msr-head');
      if (!onLabel && !widget.classList.contains('msr-selected')) return;
      const r = widget.getBoundingClientRect();
      start = { id: e.pointerId, x: e.clientX, y: e.clientY, right: window.innerWidth - r.right, bottom: window.innerHeight - r.bottom, moved: false, onLabel };
      widget.setPointerCapture(e.pointerId);
      e.preventDefault();
      e.stopPropagation();
    });
    widget.addEventListener('pointermove', (e) => {
      if (!start || e.pointerId !== start.id) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!start.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
      start.moved = true;
      document.body.classList.remove('ref-mid');   // a dragged frame leaves the centred share-link position
      homeLock = false;
      widget.classList.add('msr-dragging');
      widget.style.right = Math.max(0, start.right - dx) + 'px';
      widget.style.bottom = Math.max(0, start.bottom - dy) + 'px';
      schedule();                                  // the outline changes size and shape while it moves
    });
    const end = (e) => {
      if (!start || e.pointerId !== start.id) return;
      if (start.moved) {
        widget.classList.remove('msr-dragging');
        savePosition();
        schedule();
      } else if (start.onLabel) {
        widget.classList.toggle('msr-selected');
      }
      start = null;
    };
    widget.addEventListener('pointerup', end);
    widget.addEventListener('pointercancel', end);
    document.addEventListener('pointerdown', (e) => { if (!widget.contains(e.target)) widget.classList.remove('msr-selected'); }, true);
  }
  function savePosition() {
    save(KEYS.pos, { right: parseFloat(widget.style.right), bottom: parseFloat(widget.style.bottom) });
  }
  (function restorePosition() {
    const pos = REF_QUERY ? null : load(KEYS.pos, null);
    if (pos && typeof pos.right === 'number' && typeof pos.bottom === 'number') {
      widget.style.right = Math.max(0, Math.min(pos.right, window.innerWidth - 60)) + 'px';
      widget.style.bottom = Math.max(0, Math.min(pos.bottom, window.innerHeight - 60)) + 'px';
    }
  })();
  setupDrag();


  // Web Mercator stretches the map towards the poles. The scale is computed at the latitude under the
  // frame itself, not at the map centre: on a tall phone zoomed out, the centre can lie near the pole
  // while the frame sits over the Netherlands.
  function latAtOffset(centerLat, zoom, dyPx) {   // dyPx positive = below the centre
    const scale = 256 * Math.pow(2, zoom) / (2 * Math.PI);
    const y = Math.log(Math.tan(Math.PI / 4 + centerLat * Math.PI / 360)) * scale - dyPx;
    const lat = (2 * Math.atan(Math.exp(y / scale)) - Math.PI / 2) * 180 / Math.PI;
    return Math.max(-85, Math.min(85, lat));
  }
  function frameMpp() {
    const zoom = Math.log2(156543.03392 * Math.cos(view.lat * Math.PI / 180) / view.mpp);
    const r = canvas.getBoundingClientRect();
    const dy = (r.top + r.height / 2) - window.innerHeight / 2;
    return 156543.03392 * Math.cos(latAtOffset(view.lat, zoom, dy) * Math.PI / 180) / Math.pow(2, zoom);
  }

  // ---------- true-size drawing ----------
  // The outline is drawn on a full-screen canvas, vertex by vertex through the map's own projection
  // (Web Mercator): the shape is laid on the globe at the place under the frame and projected the way
  // the map itself is. Small shapes look as before. A country or continent stretches towards the poles
  // exactly like the map, so Greenland laid on Greenland covers it, and shrinks when dragged to the equator.
  const overlay = document.createElement('canvas');
  overlay.id = 'msr-overlay';
  document.body.appendChild(overlay);
  const octx = overlay.getContext('2d');
  const R_EARTH = 6371008.8, RAD = Math.PI / 180, MAX_LAT = 85.0511 * RAD;
  const mercY = (phi) => Math.log(Math.tan(Math.PI / 4 + phi / 2));
  const polarCache = new WeakMap();
  function polar(ref) {          // per vertex: sin and cos of the angular distance and of the bearing from the shape's origin
    let c = polarCache.get(ref);
    if (!c) {
      const conv = (pts) => {
        const a = new Float64Array(pts.length * 4);
        pts.forEach((q, i) => {
          const d = Math.hypot(q[0], q[1]) / R_EARTH, th = Math.atan2(q[0], q[1]);
          a[i * 4] = Math.sin(d); a[i * 4 + 1] = Math.cos(d); a[i * 4 + 2] = Math.sin(th); a[i * 4 + 3] = Math.cos(th);
        });
        return { a, out: new Float64Array(pts.length * 2) };
      };
      c = { rings: [], lines: (ref.lines || []).map(conv) };
      for (const poly of ref.polygons) for (const ring of poly) c.rings.push(conv(ring));
      polarCache.set(ref, c);
    }
    return c;
  }
  // Screen position of one point given as (sin d, cos d, sin bearing, cos bearing) from an origin at latitude phi1
  // whose own screen position is (ox, oy). K = map pixels per radian.
  function projectPoint(sd, cd, st, ct, s1, c1, m1, ox, oy, K, out, j) {
    let s2 = s1 * cd + c1 * sd * ct;
    if (s2 > 1) s2 = 1; else if (s2 < -1) s2 = -1;
    let phi2 = Math.asin(s2);
    if (phi2 > MAX_LAT) phi2 = MAX_LAT; else if (phi2 < -MAX_LAT) phi2 = -MAX_LAT;
    out[j] = ox + Math.atan2(st * sd * c1, cd - s1 * s2) * K;
    out[j + 1] = oy - (mercY(phi2) - m1) * K;
  }
  function projectShape(pc, phi1, ox, oy, K) {   // fills the out buffers, returns the screen bbox of the rings
    const s1 = Math.sin(phi1), c1 = Math.cos(phi1), m1 = mercY(phi1);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const g of pc.rings) {
      const a = g.a, out = g.out;
      for (let i = 0, n = out.length / 2; i < n; i++) {
        projectPoint(a[i * 4], a[i * 4 + 1], a[i * 4 + 2], a[i * 4 + 3], s1, c1, m1, ox, oy, K, out, i * 2);
        const x = out[i * 2], y = out[i * 2 + 1];
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    for (const g of pc.lines) {
      const a = g.a, out = g.out;
      for (let i = 0, n = out.length / 2; i < n; i++) projectPoint(a[i * 4], a[i * 4 + 1], a[i * 4 + 2], a[i * 4 + 3], s1, c1, m1, ox, oy, K, out, i * 2);
    }
    return [x0, y0, x1, y1];
  }
  // Share link with home=1: move the frame so that the outline lies on the reference's own place.
  function layAtHome(ref, zoom, K) {
    if (!ref.origin) return;
    const W0 = window.innerWidth, H0 = window.innerHeight;
    let dl = (ref.origin[0] - view.lng) % 360; if (dl > 180) dl -= 360; else if (dl < -180) dl += 360;
    const phi0 = ref.origin[1] * RAD;
    const hx = W0 / 2 + dl * RAD * K, hy = H0 / 2 - (mercY(phi0) - mercY(view.lat * RAD)) * K;
    const bb = projectShape(polar(ref), phi0, hx, hy, K);
    const r = canvas.getBoundingClientRect(), wr = widget.getBoundingClientRect();
    const dx = (bb[0] + bb[2]) / 2 - (r.left + r.width / 2), dy = bb[3] - (r.top + r.height - 4);
    widget.style.right = (W0 - wr.right - dx) + 'px';
    widget.style.bottom = (H0 - wr.bottom - dy) + 'px';
  }
  function draw() {
    raf = 0;
    if (!view) return;
    if (refLoading) { widget.style.visibility = 'hidden'; octx.clearRect(0, 0, overlay.width, overlay.height); return; }   // share link: wait for its reference
    const mpp = frameMpp();
    const ref = chooseReference(mpp);
    if (!ref) { widget.style.visibility = 'hidden'; octx.clearRect(0, 0, overlay.width, overlay.height); return; }
    widget.style.visibility = '';

    if (ref.id !== currentId) {
      currentId = ref.id;
      nameEl.classList.add('msr-flash');
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => nameEl.classList.remove('msr-flash'), 1200);
    }
    nameEl.textContent = refName(ref);
    sizeEl.textContent = fmtLen(ref.width_m) + ' × ' + fmtLen(ref.height_m);
    pinBtn.style.visibility = pinnedId ? '' : 'hidden';

    const W = boxW, H = boxH;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);                // the frame's own canvas is only the layout box; the outline is on the overlay

    const s = 1 / mpp;                        // px per metre at the frame's own latitude
    const b = ref.bbox;                       // [minx, miny, maxx, maxy] metres
    const tooBig = ref.width_m * s > W || ref.height_m * s > H;
    // The shape sits on the bottom edge of the frame, so the label row reads directly under it;
    // a shape larger than the frame, or a share link, is centred on the frame instead.
    const mid = tooBig || document.body.classList.contains('ref-mid');
    const tiny = Math.max(ref.width_m, ref.height_m) * s < 6;

    const W0 = window.innerWidth, H0 = window.innerHeight;
    if (overlay.width !== Math.round(W0 * dpr) || overlay.height !== Math.round(H0 * dpr)) {
      overlay.width = Math.round(W0 * dpr); overlay.height = Math.round(H0 * dpr);
    }
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    octx.clearRect(0, 0, W0, H0);

    const zoom = view.zoom;
    const K = 256 * Math.pow(2, zoom) / (2 * Math.PI);          // map pixels per radian
    if (homeLock) layAtHome(ref, zoom, K);
    const r = canvas.getBoundingClientRect();
    const pc = polar(ref);
    // Where the shape has to end up: its bottom centre on the frame's bottom centre (or centre on centre).
    const tx = r.left + W / 2, ty = mid ? r.top + H / 2 : r.top + H - 4;
    // First guess for the screen position of the shape's origin: the flat layout. Two corrections bring
    // the projected shape onto the target, because its size depends on the latitude it lands on.
    let ox = r.left + W / 2 - ((b[0] + b[2]) / 2) * s;
    let oy = r.top + (mid ? H / 2 + ((b[1] + b[3]) / 2) * s : (H - 4) + b[1] * s);
    let phi1 = 0;
    for (let pass = 0; pass < 3; pass++) {
      phi1 = latAtOffset(view.lat, zoom, oy - H0 / 2) * RAD;
      const bb = projectShape(pc, phi1, ox, oy, K);
      if (pass === 2) break;
      ox += tx - (bb[0] + bb[2]) / 2;
      oy += ty - (mid ? (bb[1] + bb[3]) / 2 : bb[3]);
    }

    // Outline only, no fill, no panel background: the shape lies over the map like a stencil.
    // A white halo under the red line keeps it readable on any map colour.
    octx.lineJoin = 'round';
    octx.lineCap = 'round';
    const trace = () => {
      octx.beginPath();
      for (const g of pc.rings) {
        const o = g.out;
        for (let i = 0, n = o.length / 2; i < n; i++) { if (i === 0) octx.moveTo(o[0], o[1]); else octx.lineTo(o[i * 2], o[i * 2 + 1]); }
        octx.closePath();
      }
      for (const g of pc.lines) {
        const o = g.out;
        for (let i = 0, n = o.length / 2; i < n; i++) { if (i === 0) octx.moveTo(o[0], o[1]); else octx.lineTo(o[i * 2], o[i * 2 + 1]); }
      }
    };
    // Line weight follows the drawn size, so a small Netherlands stays an outline instead of a red blob.
    const px = Math.max(ref.width_m, ref.height_m) * s;
    const lw = px < 40 ? 0.8 : px < 90 ? 1.2 : px < 160 ? 1.6 : 2;
    trace(); octx.lineWidth = lw + (px < 40 ? 1.2 : 2.5); octx.strokeStyle = 'rgba(255, 255, 255, 0.85)'; octx.stroke();
    trace(); octx.lineWidth = lw; octx.strokeStyle = '#d32f2f'; octx.stroke();
    const marker = ref.marker || markers[ref.id];
    if (marker && !tiny) {
      const d = Math.hypot(marker[0], marker[1]) / R_EARTH, th = Math.atan2(marker[0], marker[1]), mk = [0, 0];
      projectPoint(Math.sin(d), Math.cos(d), Math.sin(th), Math.cos(th), Math.sin(phi1), Math.cos(phi1), mercY(phi1), ox, oy, K, mk, 0);
      octx.beginPath();
      octx.arc(mk[0], mk[1], 2.5, 0, Math.PI * 2);
      octx.fillStyle = '#1a73e8';
      octx.fill();
    }
    if (tiny) { // make a near-invisible speck findable
      octx.beginPath();
      octx.arc(tx, ty - (mid ? 0 : 3), 7, 0, Math.PI * 2);
      octx.lineWidth = 3; octx.strokeStyle = 'rgba(255, 255, 255, 0.85)'; octx.stroke();
      octx.lineWidth = 1; octx.strokeStyle = 'rgba(211, 47, 47, 0.7)'; octx.stroke();
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
      if (mapApi) mapApi.fitBounds(bb[0], bb[2], bb[1], bb[3], 16);
      toast(h.display_name, 4000);
    } catch (err) {
      toast(t('searchFail'), 3000);
    }
  });

  // ---------- geolocation ----------
  $('locateBtn').addEventListener('click', () => {
    if (!navigator.geolocation) { toast(t('geoFail'), 2500); return; }
    $('locateBtn').classList.add('busy');
    navigator.geolocation.getCurrentPosition((pos) => {
      $('locateBtn').classList.remove('busy');
      if (!mapApi) return;
      const lat = pos.coords.latitude, lng = pos.coords.longitude;
      const cur = mapApi.getView();
      mapApi.setView(lat, lng, Math.max(15, cur ? cur.zoom : 0));
      mapApi.setHere(lat, lng);
    }, (err) => {
      $('locateBtn').classList.remove('busy');
      toast(err.code === 1 ? t('geoDenied') : t('geoFail'), 3000);
    }, { enableHighAccuracy: true, timeout: 12000 });
  });

  // ---------- sheet: about, address, references ----------
  function openSheet() { $('sheet').hidden = false; $('sheetBackdrop').hidden = false; }
  function closeSheet() { $('sheet').hidden = true; $('sheetBackdrop').hidden = true; save(KEYS.seen, true); }
  $('helpBtn').addEventListener('click', () => {
    openSheet();
    if (!address) $('addrInput').focus();      // the button promises "add my home": the cursor is already there
  });
  $('closeBtn').addEventListener('click', closeSheet);
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
    if (r.custom) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'del';
      del.textContent = '✕';
      del.title = t('remove');
      del.setAttribute('aria-label', t('remove') + ' ' + r.name);
      del.addEventListener('click', (e) => { e.preventDefault(); removePlace(r.id); });
      row.appendChild(del);
    }
    return row;
  }
  function renderRefs() {
    const box = $('refs');
    box.innerHTML = '';
    const byArea = (a, b) => b.width_m * b.height_m - a.width_m * a.height_m;
    const provinces = BUILTIN.filter((r) => r.id.startsWith('prov-')).sort((a, b) => a.name.localeCompare(b.name));
    const rest = BUILTIN.filter((r) => !r.id.startsWith('prov-')).concat(areas || [], places || []).sort(byArea);
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
    $('helpLabel').textContent = t(address ? 'ctaDone' : 'cta');
    $('helpBtn').classList.toggle('done', !!address);
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
      disabled.add('amsterdam-centrum');       // your own city replaces the Amsterdam example
      if (prov) setDisabled(prov.id, false); else save(KEYS.disabled, [...disabled]);
      pinnedId = null;
      msg.textContent = '';
      $('addrInput').value = '';
      renderAddress();
      renderRefs();
      closeSheet();
      toast(t('setTo') + areas.map((a) => a.name).join(', ') + (prov ? ', ' + prov.name : '') + '.', 5000);
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
    setDisabled('amsterdam-centrum', false);
    $('addrMsg').textContent = '';
    renderAddress();
    renderRefs();
    schedule();
  }
  $('addrBtn').addEventListener('click', setAddress);
  $('addrInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); setAddress(); } });
  $('addrClear').addEventListener('click', clearAddress);

  // ---------- own references: any country, continent, region, city or island ----------
  async function addPlace() {
    const q = $('placeInput').value.trim();
    const msg = $('placeMsg');
    if (!q) return;
    msg.className = 'msg';
    msg.textContent = t('placeSearching');
    $('placeBtn').disabled = true;
    try {
      const found = await window.MSR_PLACES.find(q, lang, '../extension/world.json?v=1');
      const shape = found && window.MSR_PLACES.project(found.geoms, GEO);
      if (!shape) {
        msg.className = 'msg err';
        msg.textContent = t('placeNotFound');
      } else {
        const ref = { id: 'place-' + found.key, name: found.name, custom: true, source: found.source, ...shape };
        places = places.filter((p) => p.id !== ref.id).concat([ref]);
        save(KEYS.places, places);
        disabled.delete(ref.id);
        save(KEYS.disabled, [...disabled]);
        pinnedId = ref.id;                 // show it at once; "auto" returns to the automatic choice
        $('placeInput').value = '';
        msg.textContent = '';
        renderRefs();
        fitReference(ref);
        closeSheet();
        toast(ref.name + t('placeAdded'), 4000);
        schedule();
      }
    } catch (e) {
      msg.className = 'msg err';
      msg.textContent = t('placeFail');
    }
    $('placeBtn').disabled = false;
  }
  // Zooms the map out just far enough for a new reference to fit its frame (never in).
  function fitReference(ref) {
    if (!view || !mapApi) return;
    const need = Math.max(ref.width_m / (boxW - 2 * PAD), ref.height_m / (boxH - 2 * PAD));
    const mpp = frameMpp();
    if (need <= mpp) return;
    const zoom = Math.max(2, Math.floor((view.zoom - Math.log2(need / mpp)) * 4) / 4);
    if (zoom < view.zoom) mapApi.setView(view.lat, view.lng, mapApi.kind === 'google' ? Math.floor(zoom) : zoom);
  }
  function removePlace(id) {
    places = places.filter((p) => p.id !== id);
    save(KEYS.places, places.length ? places : null);
    if (pinnedId === id) pinnedId = null;
    renderRefs();
    schedule();
  }
  // Share link (?ref=...): look the reference up, pin it for this visit and show it centred.
  async function pinFromQuery() {
    try {
      const found = await window.MSR_PLACES.find(REF_QUERY, lang, '../extension/world.json?v=1');
      const shape = found && window.MSR_PLACES.project(found.geoms, GEO);
      if (shape) {
        const ref = { id: 'place-' + found.key, name: found.name, custom: true, source: found.source, ...shape };
        places = places.filter((p) => p.id !== ref.id).concat([ref]);   // not saved: a link should not fill someone's list
        disabled.delete(ref.id);
        pinnedId = ref.id;
        renderRefs();
        if (!viewFromHash()) fitReference(ref);
      } else {
        document.body.classList.remove('ref-mid');
        toast(t('placeNotFound'), 3000);
      }
    } catch (e) {
      document.body.classList.remove('ref-mid');
      toast(t('placeFail'), 3000);
    }
    refLoading = false;
    schedule();
  }
  $('placeBtn').addEventListener('click', addPlace);
  $('placeInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addPlace(); } });

  // ---------- language ----------
  function applyLang() {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => { el.placeholder = t(el.dataset.i18nPlaceholder); });
    document.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); el.setAttribute('aria-label', t(el.dataset.i18nTitle)); });
    renderAddress();
    renderRefs();
    currentId = null;
    schedule();
  }

  // ---------- map choice (only shown when a Google key is configured) ----------
  $('mapChoice').hidden = !GOOGLE_KEY;
  document.querySelectorAll('.mapPick').forEach((b) => b.addEventListener('click', () => setMapChoice(b.dataset.map)));

  // ---------- start ----------
  renderAddress();
  applyLang();
  if (!load(KEYS.seen, false) && !REF_QUERY) openSheet();   // a share link shows its example first
  setMapChoice(mapChoice);
  if (REF_QUERY) pinFromQuery();
})();
