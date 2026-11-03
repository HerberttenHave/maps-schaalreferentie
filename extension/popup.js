const builtin = window.MSR_BUILTIN_REFERENCES || [];
const DEFAULTS = {
  enabled: true, boxW: 260, boxH: 200, custom: [], pos: null,
  disabled: builtin.filter((r) => r.id.startsWith('prov-')).map((r) => r.id),
};
const LOCAL_DEFAULTS = { areas: [], markers: {}, address: null };
let settings = { ...DEFAULTS };
let local = { ...LOCAL_DEFAULTS };

const $ = (id) => document.getElementById(id);

function fmtLen(m) {
  if (m >= 10000) return Math.round(m / 1000) + ' km';
  if (m >= 1000) return (m / 1000).toFixed(1).replace('.0', '') + ' km';
  return Math.round(m) + ' m';
}

function setDisabled(id, off) {
  const d = new Set(settings.disabled || []);
  if (off) d.add(id); else d.delete(id);
  settings.disabled = [...d];
  chrome.storage.sync.set({ disabled: settings.disabled });
}

function refRow(r) {
  const off = new Set(settings.disabled || []);
  const row = document.createElement('label');
  row.className = 'row';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = !off.has(r.id);
  cb.addEventListener('change', () => setDisabled(r.id, !cb.checked));
  row.appendChild(cb);
  const name = document.createElement('span');
  name.textContent = r.name;
  name.title = r.source || '';
  row.appendChild(name);
  const size = document.createElement('span');
  size.className = 'size';
  size.textContent = fmtLen(r.width_m) + ' × ' + fmtLen(r.height_m);
  row.appendChild(size);
  if (r.custom) {
    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '✕';
    del.title = 'Verwijderen';
    del.addEventListener('click', (e) => {
      e.preventDefault();
      settings.custom = (settings.custom || []).filter((c) => c.id !== r.id);
      chrome.storage.sync.set({ custom: settings.custom });
      renderRefs();
    });
    row.appendChild(del);
  }
  return row;
}

function renderRefs() {
  const box = $('refs');
  box.innerHTML = '';
  const byArea = (a, b) => b.width_m * b.height_m - a.width_m * a.height_m;
  const provinces = builtin.filter((r) => r.id.startsWith('prov-')).sort((a, b) => a.name.localeCompare(b.name));
  const rest = builtin.filter((r) => !r.id.startsWith('prov-')).concat(local.areas || [], settings.custom || []).sort(byArea);
  for (const r of rest) box.appendChild(refRow(r));
  const det = document.createElement('details');
  const on = provinces.filter((p) => !(settings.disabled || []).includes(p.id)).length;
  const sum = document.createElement('summary');
  sum.textContent = 'Provincies (' + on + ' van ' + provinces.length + ' aan)';
  det.appendChild(sum);
  for (const r of provinces) det.appendChild(refRow(r));
  box.appendChild(det);
}

function renderAddress() {
  const a = local.address;
  $('addrSet').hidden = !a;
  $('addrForm').hidden = !!a;
  if (a) $('addrLabel').textContent = a.label;
}

function activeTab() {
  return new Promise((resolve) => chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs && tabs[0])));
}

function sendToTab(tab, msg) {
  return new Promise((resolve) => {
    if (!tab) { resolve(null); return; }
    try {
      chrome.tabs.sendMessage(tab.id, msg, (resp) => { if (chrome.runtime.lastError) resolve(null); else resolve(resp); });
    } catch (e) { resolve(null); }
  });
}

async function refreshState() {
  const st = await sendToTab(await activeTab(), { type: 'msr:state' });
  const el = $('state');
  const btn = $('capBtn');
  if (!st) { el.textContent = 'Open Google Maps in dit tabblad om de referentie te zien.'; btn.disabled = true; return; }
  btn.disabled = !st.view;
  el.textContent = st.view
    ? 'Nu: ' + (st.current ? st.current.name : '-') + (st.pinnedId ? ' (vastgezet)' : '') + ' · 100 px ≈ ' + fmtLen(st.view.mpp * 100) + ' (' + st.view.mode + ')'
    : 'Nog geen kaartpositie in de URL; beweeg de kaart even.';
}

async function capture() {
  const resp = await sendToTab(await activeTab(), { type: 'msr:capture', name: $('capName').value });
  const msg = $('msg');
  if (!resp || resp.error) { msg.className = 'msg err'; msg.textContent = (resp && resp.error) || 'Geen Google Maps-tabblad actief.'; return; }
  msg.className = 'msg';
  msg.textContent = 'Opgeslagen: ' + resp.ref.name + ' (' + fmtLen(resp.ref.width_m) + ' × ' + fmtLen(resp.ref.height_m) + ')';
  $('capName').value = '';
  chrome.storage.sync.get(DEFAULTS, (s) => { settings = { ...DEFAULTS, ...s }; renderRefs(); });
}

async function setAddress() {
  const q = $('addrInput').value.trim();
  const msg = $('addrMsg');
  if (!q) return;
  msg.className = 'msg';
  msg.textContent = 'Opzoeken bij PDOK...';
  $('addrBtn').disabled = true;
  try {
    const geo = await MSR_PDOK.geocode(q);
    if (!geo) throw new Error('Adres niet gevonden. Probeer "straat huisnummer, plaats".');
    const areas = await MSR_PDOK.fetchAreas(geo, MSR_GEO);
    if (!areas.length) throw new Error('Geen gebiedsomtrekken gevonden voor dit adres.');
    const markers = {};
    if (geo.lon != null) {
      for (const a of areas) { const m = MSR_GEO.markerFor(a, geo.lon, geo.lat); if (m) a.marker = m; }
      for (const r of builtin) { const m = MSR_GEO.markerFor(r, geo.lon, geo.lat); if (m) markers[r.id] = m; }
    }
    const provId = geo.provinciecode ? 'prov-' + geo.provinciecode : null;
    const prov = builtin.find((r) => r.id === provId) || builtin.find((r) => r.id.startsWith('prov-') && r.name === geo.provincienaam);
    local = { ...local, areas, markers, address: { label: geo.label, provId: prov ? prov.id : null } };
    await new Promise((res) => chrome.storage.local.set({ areas, markers, address: local.address }, res));
    if (prov) setDisabled(prov.id, false);
    setDisabled('amsterdam-centrum', true);   // your own city replaces the Amsterdam example
    msg.textContent = 'Ingesteld: ' + areas.map((a) => a.name).join(', ') + (prov ? ', ' + prov.name : '') + '.';
    $('addrInput').value = '';
    renderAddress();
    renderRefs();
  } catch (e) {
    msg.className = 'msg err';
    msg.textContent = e.message || String(e);
  }
  $('addrBtn').disabled = false;
}

function clearAddress() {
  local = { ...LOCAL_DEFAULTS };
  chrome.storage.local.remove(['areas', 'markers', 'address']);
  setDisabled('amsterdam-centrum', false);
  $('addrMsg').textContent = '';
  renderAddress();
  renderRefs();
}

function bindSliders() {
  for (const k of ['boxW', 'boxH']) {
    const inp = $(k), val = $(k + 'v');
    inp.value = settings[k];
    val.textContent = settings[k] + ' px';
    inp.addEventListener('input', () => {
      val.textContent = inp.value + ' px';
      settings[k] = +inp.value;
      chrome.storage.sync.set({ [k]: +inp.value });
    });
  }
}

(async () => {
  settings = await new Promise((r) => chrome.storage.sync.get(DEFAULTS, (s) => r({ ...DEFAULTS, ...s })));
  local = await new Promise((r) => chrome.storage.local.get(LOCAL_DEFAULTS, (l) => r({ ...LOCAL_DEFAULTS, ...l })));
  const en = $('enabled');
  en.checked = settings.enabled !== false;
  en.addEventListener('change', () => chrome.storage.sync.set({ enabled: en.checked }));
  renderAddress();
  renderRefs();
  bindSliders();
  $('capBtn').addEventListener('click', capture);
  $('addrBtn').addEventListener('click', setAddress);
  $('addrInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') setAddress(); });
  $('addrClear').addEventListener('click', clearAddress);
  refreshState();
})();
