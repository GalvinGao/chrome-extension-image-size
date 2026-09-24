import { test } from 'node:test';
import assert from 'node:assert/strict';
const events = {};
const calls = [];
const messages = [];
const listener = name => ({ addListener(fn) { events[name] = fn; } });
globalThis.chrome = {
  debugger: {
    attach: async () => {}, detach: async () => {},
    sendCommand: async (source, method) => { calls.push(method); return { body: 'YWJj', base64Encoded: true }; },
    onEvent: listener('event'), onDetach: listener('detach'),
  },
  action: { onClicked: listener('click'), setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {}, setTitle: async () => {} },
  tabs: { onRemoved: listener('removed'), sendMessage: async (id, message) => { messages.push({ id, ...message }); } },
  scripting: { executeScript: async () => {} },
  runtime: { getURL: path => `chrome-extension://test/${path}`, onMessage: listener('message') },
};
const { toggle } = await import('../background.js');
const event = (method, params, sessionId) => events.event({ tabId: 10, ...(sessionId ? { sessionId } : {}) }, method, params);
const settle = () => new Promise(resolve => setImmediate(resolve));

test('network lifecycle records file bytes, handles cache, redirects, partials, frames, and detach', async () => {
  await toggle(10);
  event('Network.requestWillBeSent', { requestId: '1', request: { url: 'https://a/image' } });
  event('Network.requestWillBeSent', { requestId: '1', request: { url: 'https://b/image' }, redirectResponse: {} });
  event('Network.responseReceived', { requestId: '1', type: 'Image', response: { url: 'https://b/image', mimeType: 'image/jpeg', status: 200, headers: { 'Content-Encoding': 'gzip', 'Content-Length': '5' } } });
  event('Network.dataReceived', { requestId: '1', dataLength: 80, encodedDataLength: 5 });
  event('Network.loadingFinished', { requestId: '1', encodedDataLength: 200 });
  await settle();
  let result = messages.findLast(m => m.type === 'sizes');
  assert.equal(result.results[0][1].bytes, 80);
  assert.equal(result.results[0][1].networkBytes, 200);
  assert.equal(result.results[0][1].mimeType, 'image/jpeg');
  assert.equal(result.results[0][1].contentEncoding, 'gzip');
  assert.deepEqual(result.results.map(([url]) => url), ['https://a/image', 'https://b/image', 'https://b/image']);

  event('Network.requestWillBeSent', { requestId: '2', request: { url: 'https://a/2' } });
  event('Network.responseReceived', { requestId: '2', type: 'Image', response: { url: 'https://a/cached', status: 200, headers: {} } });
  event('Network.loadingFinished', { requestId: '2', encodedDataLength: 0 });
  await settle();
  assert.equal(messages.findLast(m => m.type === 'sizes').results[0][1].bytes, 3);
  assert.equal(messages.findLast(m => m.type === 'sizes').results[0][1].networkBytes, 0);

  event('Network.requestWillBeSent', { requestId: '3', request: { url: 'https://a/3' } });
  event('Network.responseReceived', { requestId: '3', type: 'Image', response: { url: 'https://a/partial', status: 206, headers: { 'Content-Length': '4' } } });
  event('Network.loadingFinished', { requestId: '3' });
  await settle();
  assert.equal(messages.findLast(m => m.type === 'sizes').results[0][1].bytes, null);
  assert.equal(messages.findLast(m => m.type === 'sizes').results[0][1].networkBytes, null);

  event('Target.attachedToTarget', { sessionId: 'child' });
  await settle();
  assert.equal(calls.filter(method => method === 'Target.setAutoAttach').length, 2);
  assert.ok(calls.every(method => ['Network.enable', 'Page.enable', 'Target.setAutoAttach', 'Network.getResponseBody'].includes(method)));
  events.detach({ tabId: 10 });
  await settle();
  assert.equal(messages.findLast(m => m.type === 'state').enabled, false);
  let snapshot;
  events.message({ type: 'snapshot' }, { tab: { id: 10 } }, value => { snapshot = value; });
  assert.equal(snapshot.enabled, false);
});


test('popup control returns real state and rejects content-script control messages', async () => {
  const popup = { url: 'chrome-extension://test/popup.html' };
  const request = message => new Promise(resolve => events.message(message, popup, resolve));
  assert.equal((await request({ type: 'popup-status', tabId: 20 })).enabled, false);
  assert.equal((await request({ type: 'popup-toggle', tabId: 20 })).enabled, true);
  assert.equal((await request({ type: 'popup-status', tabId: 20 })).enabled, true);
  let replied = false;
  events.message({ type: 'popup-toggle', tabId: 20 }, { url: 'https://example.com' }, () => { replied = true; });
  assert.equal(replied, false);
  assert.equal((await request({ type: 'popup-toggle', tabId: 20 })).enabled, false);
  const attach = chrome.debugger.attach;
  chrome.debugger.attach = async () => { throw new Error('Restricted page'); };
  const result = await request({ type: 'popup-toggle', tabId: 20 });
  assert.equal(result.enabled, false);
  assert.equal(result.error, 'Restricted page');
  chrome.debugger.attach = attach;
});

test('responses for requests started before enabling are ignored', async () => {
  await toggle(10);
  const count = messages.filter(m => m.type === 'sizes').length;
  event('Network.responseReceived', { requestId: 'old', type: 'Image', response: { url: 'https://a/old', status: 200, headers: { 'Content-Length': '100' } } });
  event('Network.loadingFinished', { requestId: 'old' });
  await settle();
  assert.equal(messages.filter(m => m.type === 'sizes').length, count);
  await toggle(10);
});
