// 15-second demo clip: Greenland is dragged off its own place to Africa and shrinks to its true size.
// Records the real web version in headless Edge (a real mouse drag through the DevTools protocol) and
// encodes the frames with ffmpeg.
//   MSR_BROWSER="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" node tools/demo-video.js [nl|en] [outdir] [--stills]
// MSR_WEB overrides the page (default: the live site), e.g. http://127.0.0.1:8765/web/ for a local server.
const { spawn, execFileSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BROWSER = process.env.MSR_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = process.env.MSR_WEB || 'https://herberttenhave.github.io/maps-schaalreferentie/web/';
const LANG = (process.argv[2] === 'en') ? 'en' : 'nl';
const OUT = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : path.join(__dirname, '..', 'store', 'video');
const STILLS = process.argv.includes('--stills');

const W = 864, H = 1536, DSF = 1.25, FPS = 30;     // 1080 x 1920 output, portrait for phones
const VIEW = { lat: 51.46, lng: 0, zoom: 3 };      // Greenland top left, Africa bottom right; a whole zoom level, so no tile seams
const TARGET = { lat: -14, lng: 20.5 };            // where the bottom centre of the outline ends up: the heart of Africa
const T = {                                        // seconds
  hold: 3.0, move: 6.5, total: 15,
};
const TEXT = {
  nl: {
    ref: 'Groenland',
    c1: 'Groenland lijkt even groot als Afrika.',
    c2: 'Maar de kaart rekt alles bij de polen uit\u2026',
    c3: 'In het echt is Afrika 14 keer groter.',
    foot: 'Zie zelf hoe groot iets is',
  },
  en: {
    ref: 'Greenland',
    c1: 'Greenland looks as big as Africa.',
    c2: 'But the map stretches everything near the poles\u2026',
    c3: 'In reality, Africa is 14 times bigger.',
    foot: 'See for yourself how big things really are',
  },
}[LANG];
const URL_LINE = 'herberttenhave.github.io/maps-schaalreferentie';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const mercY = (latDeg) => Math.log(Math.tan(Math.PI / 4 + latDeg * Math.PI / 360));

function getJSON(port, p) {
  return new Promise((res, rej) => http.get(`http://127.0.0.1:${port}${p}`, (r) => {
    let d = ''; r.on('data', (c) => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
  }).on('error', rej));
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const frames = fs.mkdtempSync(path.join(os.tmpdir(), 'msr-frames-'));
  const port = 9400 + Math.floor(Math.random() * 500);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'msr-video-'));
  const browser = spawn(BROWSER, [
    '--headless=new', '--no-first-run', '--disable-gpu', '--hide-scrollbars', `--lang=${LANG}`,
    `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, `--window-size=${W},${H}`, 'about:blank',
  ], { stdio: 'ignore' });
  let targets = null;
  for (let i = 0; i < 60 && !targets; i++) { try { targets = await getJSON(port, '/json/list'); } catch (e) { await sleep(250); } }
  if (!targets) throw new Error('browser did not start');
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pending = {};
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; } };
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending[i] = res; ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); return r.result && r.result.result ? r.result.result.value : r; };
  await new Promise((r) => { ws.onopen = r; });
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DSF, mobile: false });

  // First load: settings, so the intro sheet stays closed and the language is right.
  await send('Page.navigate', { url: BASE + '?ui=0' });
  await sleep(2500);
  await evaluate(`localStorage.clear(); localStorage.setItem('msr.seen', 'true'); localStorage.setItem('msr.lang', '"${LANG}"'); localStorage.setItem('msr.map', '"osm"'); 'ok'`);
  const url = `${BASE}?ref=${encodeURIComponent(TEXT.ref)}&home=1&ui=0&panel=620&t=${Date.now()}#${VIEW.lat},${VIEW.lng},${VIEW.zoom}z`;
  await send('Page.navigate', { url });
  await sleep(7000);   // reference lookup and tiles

  // Captions, footer and a pointer dot: recording dressing, not part of the app.
  await evaluate(`(() => {
    const st = document.createElement('style');
    st.textContent = \`
      #msr-widget { font-size: 23px !important; }
      #msr-widget .msr-size { font-size: 18px !important; }
      #msr-widget .msr-tools { display: none !important; }
      #map, .leaflet-container { background: #aad3df !important; }
      .vid-cap { position: fixed; left: 24px; right: 24px; top: 34px; z-index: 5000; text-align: center; pointer-events: none;
        font: 600 37px/1.25 'Segoe UI', system-ui, sans-serif; color: #202124; background: rgba(255,255,255,.94);
        border-radius: 18px; padding: 18px 20px; box-shadow: 0 2px 10px rgba(0,0,0,.25); opacity: 0; }
      .vid-cap b { color: #d32f2f; font-weight: 700; }
      #vidFoot { position: fixed; left: 24px; right: 24px; bottom: 30px; z-index: 5000; text-align: center; pointer-events: none;
        font: 500 27px/1.3 'Segoe UI', system-ui, sans-serif; color: #fff; background: rgba(32,33,36,.9);
        border-radius: 16px; padding: 14px 16px; opacity: 0; }
      #vidFoot span { display: block; font-weight: 700; font-size: 29px; margin-top: 2px; }
      #vidDot { position: fixed; z-index: 5001; width: 50px; height: 50px; margin: 34px 0 0 -25px; border-radius: 50%;
        background: rgba(26,115,232,.35); border: 3px solid #fff; box-shadow: 0 1px 6px rgba(0,0,0,.4); pointer-events: none; opacity: 0; }
      .leaflet-control-attribution { font-size: 14px !important; }
    \`;
    document.head.appendChild(st);
    const mk = (id, cls, html) => { const d = document.createElement('div'); d.id = id; d.className = cls; d.innerHTML = html; document.body.appendChild(d); };
    mk('vidC1', 'vid-cap', ${JSON.stringify(TEXT.c1)});
    mk('vidC2', 'vid-cap', ${JSON.stringify(TEXT.c2)});
    mk('vidC3', 'vid-cap', ${JSON.stringify(TEXT.c3)});
    mk('vidFoot', '', ${JSON.stringify(TEXT.foot)} + '<span>${URL_LINE}</span>');
    mk('vidDot', '', '');
    window.dispatchEvent(new Event('resize'));
    return 'ok';
  })()`);
  await sleep(600);

  const geo = await evaluate(`(() => {
    const w = document.getElementById('msr-widget'), c = w.querySelector('canvas').getBoundingClientRect(), h = w.querySelector('.msr-head').getBoundingClientRect();
    return { name: w.querySelector('.msr-name').textContent, size: w.querySelector('.msr-size').textContent, vis: w.style.visibility,
      ax: c.left + c.width / 2, ay: c.top + c.height - 4, gx: h.left + h.width / 2, gy: h.top + h.height / 2, right: w.style.right, bottom: w.style.bottom };
  })()`);
  console.log('reference:', geo.name, '|', geo.size, '| anchor', Math.round(geo.ax), Math.round(geo.ay));
  if (!geo.name) throw new Error('reference not shown');

  // Screen position of the target (Web Mercator around the view centre).
  const K = 256 * Math.pow(2, VIEW.zoom) / (2 * Math.PI);
  const tx = W / 2 + (TARGET.lng - VIEW.lng) * Math.PI / 180 * K;
  const ty = H / 2 - (mercY(TARGET.lat) - mercY(VIEW.lat)) * K;
  const dx = tx - geo.ax, dy = ty - geo.ay;

  const total = Math.round(T.total * FPS), f0 = Math.round(T.hold * FPS), f1 = f0 + Math.round(T.move * FPS);
  const fade = (f, a, b, n = 9) => Math.max(0, Math.min(1, (f - a) / n, (b - f) / n));
  const list = STILLS ? [0, f0 + Math.round((f1 - f0) * 0.5), f1 + 30] : [...Array(total).keys()];
  let pressed = false, n = 0;
  const mouse = (type, x, y, buttons) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: 1, pointerType: 'mouse' });

  for (const f of list) {
    const p = f <= f0 ? 0 : f >= f1 ? 1 : ease((f - f0) / (f1 - f0));
    const mx = geo.gx + dx * p, my = geo.gy + dy * p;
    if (f >= f0 - 6 && !pressed) { await mouse('mousePressed', geo.gx, geo.gy, 1); pressed = true; }
    if (pressed) await mouse('mouseMoved', mx, my, 1);
    await evaluate(`(() => {
      const o = (id, v) => { document.getElementById(id).style.opacity = v; };
      o('vidC1', ${fade(f, -9, f0 + 12)}); o('vidC2', ${fade(f, f0 + 16, f1 - 4)}); o('vidC3', ${fade(f, f1, total + 30)});
      o('vidFoot', ${fade(f, f1 + 20, total + 30)});
      const d = document.getElementById('vidDot'); d.style.left = '${mx}px'; d.style.top = '${my}px'; d.style.opacity = ${fade(f, f0 - 24, f1 + 14, 8)};
      return 1;
    })()`);
    await sleep(STILLS ? 400 : 55);     // the app redraws 16 ms after a move
    const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 93 });
    const file = STILLS ? path.join(OUT, `still-${LANG}-${String(f).padStart(3, '0')}.jpg`) : path.join(frames, `f_${String(n).padStart(4, '0')}.jpg`);
    fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
    n++;
    if (!STILLS && n % 90 === 0) console.log('frame', n, '/', total);
  }
  if (pressed) await mouse('mouseReleased', geo.gx + dx, geo.gy + dy, 0);
  const end = await evaluate(`(() => { const w = document.getElementById('msr-widget'); return w.querySelector('.msr-name').textContent + ' | right ' + w.style.right + ' bottom ' + w.style.bottom; })()`);
  console.log('end:', end);

  ws.close();
  browser.kill();
  if (process.platform === 'win32') { try { execFileSync('taskkill', ['/PID', String(browser.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (e) { /* gone */ } }
  await sleep(500);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* locked */ }

  if (!STILLS) {
    const mp4 = path.join(OUT, `groenland-afrika-${LANG}.mp4`);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(frames, 'f_%04d.jpg'),
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4], { stdio: 'inherit' });
    console.log('saved', mp4, Math.round(fs.statSync(mp4).size / 1024) + ' kB');
    fs.rmSync(frames, { recursive: true, force: true });
  } else {
    console.log('stills in', OUT);
  }
}

main().catch((e) => { console.error('FAIL', e); process.exit(1); });
