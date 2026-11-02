// Share images: the Netherlands laid over well-known places, rendered by the web version in headless Edge.
//   MSR_BROWSER="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" node tools/share-images.js [outdir]
// Uses OpenStreetMap tiles (attribution stays in the corner) and a 640 px frame via ?panel=640.
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BROWSER = process.env.MSR_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = process.env.MSR_WEB || 'https://herberttenhave.github.io/maps-schaalreferentie/web/';
const W = 1280, H = 800, PANEL = 640;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// name, centre lat/lng, zoom (7 makes the Netherlands about 340 px high at these latitudes)
const SCENES = [
  { name: 'nederland-over-new-york', lat: 41.0, lng: -73.6, zoom: 7 },
  { name: 'nederland-over-de-alpen', lat: 46.6, lng: 8.4, zoom: 7 },
  { name: 'nederland-over-san-francisco', lat: 37.6, lng: -122.0, zoom: 7 },
  { name: 'nederland-over-londen', lat: 51.7, lng: -0.8, zoom: 7 },
  { name: 'nederland-over-tokio', lat: 35.9, lng: 139.5, zoom: 7 },
  { name: 'nederland-over-israel', lat: 32.0, lng: 35.0, zoom: 7 },
  { name: 'amsterdam-centrum-over-manhattan', lat: 40.765, lng: -73.975, zoom: 13 },
  { name: 'amsterdam-centrum-over-parijs', lat: 48.858, lng: 2.345, zoom: 13 },
];

function getJSON(port, p) {
  return new Promise((res, rej) => http.get(`http://127.0.0.1:${port}${p}`, (r) => {
    let d = ''; r.on('data', (c) => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
  }).on('error', rej));
}

async function main() {
  const out = process.argv[2] || path.join(__dirname, '..', 'store', 'share');
  fs.mkdirSync(out, { recursive: true });
  const port = 9400 + Math.floor(Math.random() * 500);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'msr-share-'));
  const browser = spawn(BROWSER, [
    '--headless=new', '--no-first-run', '--disable-gpu', '--hide-scrollbars', '--lang=nl',
    `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, `--window-size=${W},${H}`, 'about:blank',
  ], { stdio: 'ignore' });
  let targets = null;
  for (let i = 0; i < 60 && !targets; i++) { try { targets = await getJSON(port, '/json/list'); } catch (e) { await sleep(250); } }
  if (!targets) throw new Error('browser did not start');
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = {};
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; } };
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending[i] = res; ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); return r.result && r.result.result ? r.result.result.value : r; };
  await new Promise((r) => { ws.onopen = r; });
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });

  // First load: seed localStorage so the intro sheet stays closed and the frame sits in the middle.
  await send('Page.navigate', { url: BASE + '?panel=' + PANEL });
  await sleep(3000);
  const frameH = Math.round(PANEL * 200 / 260) + 54;
  await evaluate(`localStorage.setItem('msr.seen', 'true'); localStorage.setItem('msr.lang', '"nl"'); localStorage.setItem('msr.map', '"osm"');
    localStorage.setItem('msr.pos', JSON.stringify({ right: ${Math.round((W - PANEL) / 2)}, bottom: ${Math.round((H - frameH) / 2)} })); 'ok'`);

  for (const s of SCENES) {
    await send('Page.navigate', { url: `${BASE}?panel=${PANEL}&ui=0&s=${Date.now()}#${s.lat},${s.lng},${s.zoom}z` });
    await sleep(6000);   // tiles
    const name = await evaluate(`document.querySelector('.msr-name') && document.querySelector('.msr-name').textContent`);
    const r = await send('Page.captureScreenshot', { format: 'png' });
    const file = path.join(out, s.name + '.png');
    fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
    console.log('saved', file, '| reference:', name);
  }

  ws.close();
  browser.kill();
  if (process.platform === 'win32') { try { require('child_process').execSync(`taskkill /PID ${browser.pid} /T /F`, { stdio: 'ignore' }); } catch (e) { /* gone */ } }
  await sleep(500);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* locked */ }
}

main().catch((e) => { console.error('FAIL', e); process.exit(1); });
