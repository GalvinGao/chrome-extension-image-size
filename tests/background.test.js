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
  runtime: { onMessage: listener('message') },
};
const { toggle } = await import('../background.js');
const event = (method, params, sessionId) => events.event({ tabId: 10, ...(sessionId ? { sessionId } : {}) }, method, params);
const settle = () => new Promise(resolve => setImmediate(resolve));

test('network lifecycle records file bytes, handles cache, redirects, partials, frames, and detach', async () => {
  await toggle(10);
  event('Network.requestWillBeSent', { requestId: '1', request: { url: 'https://a/image' } });
  event('Network.requestWillBeSent', { requestId: '1', request: { url: 'https://b/image' }, redirectResponse: {} });
  event('Network.responseReceived', { requestId: '1', type: 'Image', response: { url: 'https://b/image', status: 200, headers: { 'Content-Encoding': 'gzip', 'Content-Length': '5' } } });
  event('Network.dataReceived', { requestId: '1', dataLength: 80, encodedDataLength: 5 });
  event('Network.loadingFinished', { requestId: '1', encodedDataLength: 200 });
  await settle();
  let result = messages.findLast(m => m.type === 'sizes');
  assert.equal(result.results[0][1].bytes, 80);
  assert.deepEqual(result.results.map(([url]) => url), ['https://a/image', 'https://b/image', 'https://b/image']);

  event('Network.responseReceived', { requestId: '2', type: 'Image', response: { url: 'https://a/cached', status: 200, headers: {} } });
  event('Network.loadingFinished', { requestId: '2' });
  await settle();
  assert.equal(messages.findLast(m => m.type === 'sizes').results[0][1].bytes, 3);

  event('Network.responseReceived', { requestId: '3', type: 'Image', response: { url: 'https://a/partial', status: 206, headers: { 'Content-Length': '4' } } });
  event('Network.loadingFinished', { requestId: '3' });
  await settle();
  assert.equal(messages.findLast(m => m.type === 'sizes').results[0][1].bytes, null);

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
