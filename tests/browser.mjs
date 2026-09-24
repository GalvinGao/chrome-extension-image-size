// Optional real-browser smoke test. Uses a fresh profile and only local HTTP fixtures.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';

const executable = process.env.CHROME_BIN;
if (!executable) throw new Error('Set CHROME_BIN to a Chromium executable supporting --load-extension.');
const extension = path.resolve(import.meta.dirname, '..');
const profile = await mkdtemp(path.join(tmpdir(), 'image-size-test-'));
const counts = new Map();
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="teal"/></svg>';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6w2kAAAAASUVORK5CYII=', 'base64');
const server = createServer((req, res) => {
  counts.set(req.url, (counts.get(req.url) || 0) + 1);
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
await new Promise(resolve => server.listen(0, '0.0.0.0', resolve));
const port = server.address().port;
const chrome = spawn(executable, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, `--disable-extensions-except=${extension}`, `--load-extension=${extension}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
let stderr = '';
chrome.stderr.on('data', data => { stderr += data; });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, message) {
  for (let i = 0; i < 150; i++) { const value = await fn(); if (value) return value; await delay(100); }
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
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
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
  const worker = await until(async () => (await cdp('Target.getTargets')).targetInfos.find(t => t.type === 'service_worker' && t.url.includes('background.js')), 'Extension service worker');
  const { sessionId: workerSession } = await cdp('Target.attachToTarget', { targetId: worker.targetId, flatten: true });
  async function evaluate(session, expression) {
    const result = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, session);
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  console.log('Worker attached');
  const url = `http://127.0.0.1:${port}/`;
  const tabId = await evaluate(workerSession, `(async () => (await chrome.tabs.create({url:${JSON.stringify(url)}})).id)()`);
  console.log('Created tab', tabId);
  const target = await until(async () => (await cdp('Target.getTargets')).targetInfos.find(t => t.type === 'page' && t.url === url), 'Fixture tab');
  const { sessionId: pageSession } = await cdp('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  await evaluate(workerSession, `(async () => { const module = await import(chrome.runtime.getURL('background.js')); await module.toggle(${tabId}); })()`);
  console.log('Monitoring enabled');
  assert.equal(await evaluate(workerSession, `chrome.action.getBadgeText({tabId:${tabId}})`), 'ON');
  await evaluate(pageSession, `(() => {
    for (const suffix of ['plain', 'gzip', 'chunked', 'png']) {
      const img = document.createElement('img'); img.id = suffix;
      img.src = 'http://127.0.0.2:${port}/image-' + suffix; document.body.append(img);
    }
  })()`);
  await until(async () => await evaluate(pageSession, `document.querySelectorAll('[data-image-file-size]').length === 4 && [...document.querySelectorAll('[data-image-file-size]')].every(el => /^Image network size \\d/.test(el.getAttribute('aria-label')))`), 'All cross-origin sizes appear');
  const values = await evaluate(pageSession, `[...document.images].map(img => ({id:img.id, title:img.nextSibling.getAttribute('aria-label'), top:img.getBoundingClientRect().top, labelTop:img.nextSibling.getBoundingClientRect().top}))`);
  for (const value of values) {
    assert.match(value.title, /^Image network size [0-9]/);
    assert.ok(Math.abs(value.labelTop - value.top - 2) < 1, JSON.stringify(value));
  }
  for (const suffix of ['plain', 'gzip', 'chunked', 'png']) assert.equal(counts.get('/image-' + suffix), 1, 'No duplicate image request');
  await evaluate(pageSession, 'window.scrollTo(0, 80)');
  await delay(100);
  assert.ok(await evaluate(pageSession, `Math.abs(document.images[0].nextSibling.getBoundingClientRect().top - document.images[0].getBoundingClientRect().top - 2) < 1`));
  await evaluate(workerSession, `(async () => { const module = await import(chrome.runtime.getURL('background.js')); await module.toggle(${tabId}); })()`);
  await until(async () => await evaluate(pageSession, `document.querySelectorAll('[data-image-file-size]').length === 0`), 'Disable removes labels');
  assert.equal(await evaluate(pageSession, '[...document.images].every(img => !img.style.getPropertyValue("anchor-name"))'), true);
  console.log('PASS: actual extension, cross-origin PNG/SVG, gzip, chunked responses, network labels, one request each, absolute position/scroll, toggle cleanup.');
} finally {
  socket?.close();
  chrome.kill('SIGTERM');
  if (chrome.exitCode === null) await Promise.race([new Promise(resolve => chrome.once('exit', resolve)), delay(3000)]);
  server.close();
  await rm(profile, { recursive: true, force: true });
}
