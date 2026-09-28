// Optional real-browser smoke test. Uses a fresh profile and only local HTTP fixtures.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';

const executable = process.env.CHROME_BIN;
if (!executable) throw new Error('Set CHROME_BIN to a Chromium executable supporting --load-extension.');
const extension = path.resolve(import.meta.dirname, '..');
const captureStore = process.env.STORE_SCREENSHOTS === '1';
const storeHTML = captureStore ? await readFile(path.join(extension, 'docs/store/demo.html')) : null;
const storeImage = captureStore ? await readFile(path.join(extension, 'docs/store/assets/alpine-lake.webp')) : null;
const profile = await mkdtemp(path.join(tmpdir(), 'image-size-test-'));
const counts = new Map();
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="teal"/></svg>';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6w2kAAAAASUVORK5CYII=', 'base64');
const server = createServer((req, res) => {
  counts.set(req.url, (counts.get(req.url) || 0) + 1);
  if (captureStore && req.url === '/store/demo.html') {
    res.setHeader('Content-Type', 'text/html'); res.end(storeHTML); return;
  }
  if (captureStore && req.url === '/store/assets/alpine-lake.webp') {
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Content-Length', storeImage.length);
    res.end(storeImage); return;
  }
  if (req.url.startsWith('/image')) {
    res.setHeader('Content-Type', req.url.includes('png') ? 'image/png' : 'image/svg+xml');
    res.setHeader('Cache-Control', 'max-age=3600');
    if (req.url.includes('gzip')) {
      res.setHeader('Content-Encoding', 'gzip');
      res.end(gzipSync(svg));
    } else if (req.url.includes('chunked')) {
      res.write(svg.slice(0, 40)); res.end(svg.slice(40));
    } else res.end(req.url.includes('png') ? png : svg);
  } else {
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><style>body{min-height:3000px}img{width:200px;height:100px}</style><h1>Fixture</h1>');
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
// Different ports provide distinct origins without relying on 127.0.0.2 routing.
const imageServer = createServer(server.listeners('request')[0]);
await new Promise(resolve => imageServer.listen(0, '127.0.0.1', resolve));
const imagePort = imageServer.address().port;
const chrome = spawn(executable, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, `--disable-extensions-except=${extension}`, `--load-extension=${extension}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
let stderr = '';
chrome.stderr.on('data', data => { stderr += data; });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, message) {
  for (let i = 0; i < 150; i++) {
    try { const value = await fn(); if (value) return value; }
    catch (error) {
      if (!/Cannot find (default execution )?context|Execution context was destroyed/.test(error.message)) throw error;
    }
    await delay(100);
  }
  throw new Error(message + '\n' + stderr.slice(-2000));
}
let socket;
try {
  const wsURL = await until(async () => {
    const logged = stderr.match(/DevTools listening on (ws:\/\/\S+)/)?.[1];
    if (logged) return logged;
    try {
      const [port, endpoint] = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).trim().split('\n');
      return `ws://127.0.0.1:${port}${endpoint}`;
    } catch { return null; }
  }, 'Browser startup');
  socket = new WebSocket(wsURL);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Browser WebSocket connection timed out')), 15000);
    socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Browser WebSocket connection failed')); }, { once: true });
  });
  let serial = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const data = JSON.parse(event.data);
    if (!data.id) return;
    const promise = pending.get(data.id);
    pending.delete(data.id);
    if (data.error) promise.reject(new Error(data.error.message)); else promise.resolve(data.result);
  });
  function cdp(method, params = {}, sessionId) {
    const id = ++serial;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP timeout: ' + method)), 15000);
      pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
      socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }
  console.log('Browser connected');
  async function evaluate(session, expression) {
    const result = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, session);
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  // Chromium can also start built-in extension workers named background.js.
  const workerSessions = new Map();
  const { worker, workerSession } = await until(async () => {
    for (const target of (await cdp('Target.getTargets')).targetInfos) {
      if (target.type !== 'service_worker' || !target.url.startsWith('chrome-extension://')) continue;
      if (!workerSessions.has(target.targetId)) {
        const { sessionId } = await cdp('Target.attachToTarget', { targetId: target.targetId, flatten: true });
        workerSessions.set(target.targetId, sessionId);
      }
      const session = workerSessions.get(target.targetId);
      const manifest = await evaluate(session, 'globalThis.chrome?.runtime?.getManifest()');
      if (manifest?.name === 'Image File Size' && manifest.action?.default_popup === 'popup.html') {
        return { worker: target, workerSession: session };
      }
    }
  }, 'Image File Size service worker');
  console.log('Image File Size worker attached');
  const popupURL = worker.url.replace('background.js', 'popup.html');
  await evaluate(workerSession, `chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') })`);
  const popupTarget = await until(async () => (await cdp('Target.getTargets')).targetInfos.find(t => t.type === 'page' && t.url === popupURL), 'Popup target');
  const { sessionId: popupSession } = await cdp('Target.attachToTarget', { targetId: popupTarget.targetId, flatten: true });
  await cdp('Runtime.enable', {}, popupSession);
  await until(async () => await evaluate(popupSession, 'typeof chrome.runtime?.sendMessage === "function"'), 'Popup ready');
  const url = `http://127.0.0.1:${port}/`;
  const tabId = await evaluate(workerSession, `(async () => (await chrome.tabs.create({url:${JSON.stringify(url)}})).id)()`);
  console.log('Created tab', tabId);
  const target = await until(async () => (await cdp('Target.getTargets')).targetInfos.find(t => t.type === 'page' && t.url === url), 'Fixture tab');
  const { sessionId: pageSession } = await cdp('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  await until(async () => await evaluate(pageSession, `location.href === ${JSON.stringify(url)} && document.readyState === 'complete'`), 'Fixture ready');
  const toggle = async () => {
    const result = await evaluate(popupSession, `chrome.runtime.sendMessage({ type: 'popup-toggle', tabId: ${tabId} })`);
    assert.ok(!result.error, result.error);
    return result;
  };
  await toggle();
  console.log('Monitoring enabled');
  assert.equal(await evaluate(workerSession, `chrome.action.getBadgeText({tabId:${tabId}})`), 'ON');
  await evaluate(pageSession, `(() => {
    for (const suffix of ['plain', 'gzip', 'chunked', 'png']) {
      const img = document.createElement('img'); img.id = suffix;
      img.src = 'http://127.0.0.1:${imagePort}/image-' + suffix; document.body.append(img);
    }
  })()`);
  try {
    await until(async () => await evaluate(pageSession, `document.querySelectorAll('[data-image-file-size]').length === 4 && [...document.querySelectorAll('[data-image-file-size]')].every(el => /^Image file size \\d/.test(el.getAttribute('aria-label')))`), 'All cross-origin sizes appear');
  } catch (error) {
    console.log('Fixture diagnostics', await evaluate(pageSession, `({images:[...document.images].map(img => ({id:img.id, loaded:img.complete, width:img.naturalWidth})), labels:[...document.querySelectorAll('[data-image-file-size]')].map(el=>el.getAttribute('aria-label'))})`));
    throw error;
  }
  const values = await evaluate(pageSession, `[...document.images].map(img => ({id:img.id, title:img.nextSibling.getAttribute('aria-label'), top:img.getBoundingClientRect().top, labelTop:img.nextSibling.getBoundingClientRect().top}))`);
  for (const value of values) {
    assert.match(value.title, /^Image file size [0-9]/);
    assert.ok(Math.abs(value.labelTop - value.top - 2) < 1, JSON.stringify(value));
  }
  for (const suffix of ['plain', 'gzip', 'chunked', 'png']) assert.equal(counts.get('/image-' + suffix), 1, 'No duplicate image request');
  await evaluate(pageSession, 'window.scrollTo(0, 80)');
  await delay(100);
  assert.ok(await evaluate(pageSession, `Math.abs(document.images[0].nextSibling.getBoundingClientRect().top - document.images[0].getBoundingClientRect().top - 2) < 1`));
  await toggle();
  await until(async () => await evaluate(pageSession, `document.querySelectorAll('[data-image-file-size]').length === 0`), 'Disable removes labels');
  assert.equal(await evaluate(pageSession, '[...document.images].every(img => !img.style.getPropertyValue("anchor-name"))'), true);
  console.log('PASS: actual extension, cross-origin PNG/SVG, gzip, chunked responses, file-size labels, one request each, absolute position/scroll, toggle cleanup.');
  if (captureStore) {
    await cdp('Emulation.setDeviceMetricsOverride', { width: 640, height: 400, deviceScaleFactor: 2, mobile: false }, pageSession);
    await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/store/demo.html` }, pageSession);
    await until(async () => await evaluate(pageSession, 'document.readyState === "complete" && document.images.length === 1'), 'Store fixture ready');
    await toggle();
    await cdp('Page.reload', {}, pageSession);
    await until(async () => await evaluate(pageSession, '/^Image file size \\d/.test(document.querySelector("[data-image-file-size]")?.getAttribute("aria-label") || "")'), 'Store image measurement');
    async function capture(name) {
      const { data } = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, pageSession);
      await writeFile(path.join(extension, 'docs/store/assets', name), Buffer.from(data, 'base64'));
    }
    await capture('screenshot-overview.png');
    await evaluate(pageSession, 'document.querySelector("[data-image-file-size]").focus()');
    await until(async () => await evaluate(pageSession, 'document.querySelector("[data-image-file-size]").hasAttribute("data-expanded")'), 'Expanded details');
    await capture('screenshot-details.png');
    await toggle();
    console.log('Saved two 1280x800 screenshots of the actual extension.');
  }
} finally {
  socket?.close();
  chrome.kill('SIGTERM');
  if (chrome.exitCode === null) await Promise.race([new Promise(resolve => chrome.once('exit', resolve)), delay(3000)]);
  server.close();
  imageServer.close();
  await rm(profile, { recursive: true, force: true });
}
