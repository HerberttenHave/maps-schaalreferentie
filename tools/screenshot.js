// End-to-end check and store screenshots with the real extension in headless Chrome.
//   node tools/screenshot.js <outdir> ["Straat 1, Plaats"]
// Loads the unpacked extension, opens Google Maps (declining the cookie banner), verifies the
// widget appears, optionally sets an address through the real popup page, and saves 1280x800 PNGs.
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

// Google Chrome 137+ ignores --load-extension; use Chromium, Chrome for Testing or Edge via MSR_BROWSER.
const CHROME = process.env.MSR_BROWSER || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EXT = path.resolve(__dirname, '..', 'extension');
const PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function extensionId(dir) { // unpacked extension id: sha256 of the path, first 32 hex digits mapped to a-p
  const h = crypto.createHash('sha256').update(dir).digest('hex').slice(0, 32);
  return [...h].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
}

function getJSON(p) {
  return new Promise((res, rej) => http.get(`http://127.0.0.1:${PORT}${p}`, (r) => {
    let d = ''; r.on('data', (c) => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
  }).on('error', rej));
}

async function main() {
  const out = process.argv[2] || path.join(__dirname, '..', 'store', 'screenshots');
  const address = process.argv[3];
  fs.mkdirSync(out, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'msr-shot-'));
  const chrome = spawn(CHROME, [
    '--headless=new', '--no-first-run', '--disable-gpu', '--hide-scrollbars', '--lang=nl',
    `--user-data-dir=${profile}`, `--load-extension=${EXT}`, `--remote-debugging-port=${PORT}`,
    '--window-size=1280,800', 'about:blank',
  ], { stdio: 'ignore' });

  let targets = null;
  for (let i = 0; i < 60 && !targets; i++) { try { targets = await getJSON('/json/list'); } catch (e) { await sleep(250); } }
  if (!targets) throw new Error('Chrome did not start');
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = {};
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; } };
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending[i] = res; ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); return r.result && r.result.result ? r.result.result.value : r; };
  await new Promise((r) => { ws.onopen = r; });
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });

  async function openMaps(url) {
    await send('Page.navigate', { url });
    await sleep(5000);
    const consent = await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => /alles afwijzen|reject all/i.test(b.textContent)); if (b) { b.click(); return 'consent declined'; } return 'no consent page'; })()`);
    console.log(consent);
    if (consent === 'consent declined') await sleep(7000);
    for (let i = 0; i < 20; i++) {
      const w = await evaluate(`(() => { const w = document.getElementById('msr-widget'); return w && w.style.visibility !== 'hidden' ? w.querySelector('.msr-name').textContent + ' | ' + w.querySelector('.msr-size').textContent + ' | ' + w.querySelector('.msr-scale').textContent : null; })()`);
      if (w) return w;
      await sleep(500);
    }
    return null;
  }

  async function shot(name) {
    await sleep(1500);
    const r = await send('Page.captureScreenshot', { format: 'png' });
    const file = path.join(out, name);
    fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
    console.log('saved', file);
  }

  const results = {};
  results.nl = await openMaps('https://www.google.com/maps/@35.6,139.7,6z?hl=nl');
  console.log('widget (Tokyo, 6z):', results.nl);
  if (!results.nl) { // diagnostics
    console.log('page:', await evaluate(`location.href + ' | widget: ' + !!document.getElementById('msr-widget') + ' | title: ' + document.title`));
    await send('Page.navigate', { url: 'chrome://extensions-internals/' });
    await sleep(1500);
    const txt = await evaluate('document.body.innerText');
    const ids = [...String(txt).matchAll(/"id": "([a-p]{32})"[\s\S]*?"location": "([^"]+)"[\s\S]*?"name": "([^"]+)"/g)].map((m) => m.slice(1).join(' '));
    console.log('installed extensions:', ids.length ? ids : String(txt).slice(0, 400));
  }
  if (results.nl) await shot('1-nederland-japan.png');

  if (address) {
    // Find the real id (the hash-of-path rule is not reliable across browsers): read extensions-internals.
    await send('Page.navigate', { url: 'chrome://extensions-internals/' });
    await sleep(1500);
    const txt = String(await evaluate('document.body.innerText'));
    const m = /"id": "([a-p]{32})"(?:(?!"id": )[\s\S])*?"name": "Maps schaalreferentie"/.exec(txt);
    const extId = m ? m[1] : extensionId(EXT);
    const popup = `chrome-extension://${extId}/popup.html`;
    await send('Page.navigate', { url: popup });
    await sleep(1500);
    const title = await evaluate('document.title');
    if (title !== 'Maps schaalreferentie') { console.log('popup not reachable at', popup, '(title', title, ')'); }
    else {
      const r = await evaluate(`(async () => {
        document.getElementById('addrInput').value = ${JSON.stringify(address)};
        document.getElementById('addrBtn').click();
        for (let i = 0; i < 60; i++) { await new Promise((r) => setTimeout(r, 500)); const t = document.getElementById('addrMsg').textContent; if (t && !/Opzoeken/.test(t)) return t; }
        return 'timeout';
      })()`);
      console.log('popup address:', r);
      results.address = r;
      results.areas = await evaluate(`new Promise((r) => chrome.storage.local.get(null, (l) => r((l.areas || []).map((a) => a.name + ' ' + a.width_m + 'x' + a.height_m))))`);
      console.log('stored areas:', results.areas);
      results.city = await openMaps('https://www.google.com/maps/@40.7484,-73.9857,12z?hl=nl');
      console.log('widget (Manhattan, 12z):', results.city);
      if (results.city) await shot('2-gemeente-manhattan.png');
    }
  }

  ws.close();
  chrome.kill();
  await sleep(500);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* profile may still be locked */ }
  const ok = !!results.nl && (!address || (results.areas && results.areas.length === 3 && !!results.city));
  console.log(ok ? 'E2E OK' : 'E2E FAILED');
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error('FAIL', e); process.exit(1); });
