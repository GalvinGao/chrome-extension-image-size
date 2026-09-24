import { headerSize, bodySize, canonicalURL } from './sizes.js';

const tabs = new Map();
const busy = new Set();
const send = (target, method, params = {}) => chrome.debugger.sendCommand(target, method, params);
const publish = (tabId, message) => chrome.tabs.sendMessage(tabId, message).catch(() => {});

async function badge(tabId, text, title) {
  await Promise.all([
    chrome.action.setBadgeText({ tabId, text }),
    chrome.action.setBadgeBackgroundColor({ tabId, color: text === '!' ? '#b42318' : '#242424' }),
    chrome.action.setTitle({ tabId, title }),
  ]).catch(() => {});
}

async function configure(target) {
  await send(target, 'Network.enable', { maxTotalBufferSize: 33554432, maxResourceBufferSize: 8388608 });
  await send(target, 'Page.enable');
  await send(target, 'Target.setAutoAttach', {
    autoAttach: true, waitForDebuggerOnStart: false, flatten: true,
    filter: [{ type: 'iframe', exclude: false }, { exclude: true }],
  });
}

async function stop(tabId, detach = true) {
  tabs.delete(tabId);
  await publish(tabId, { type: 'state', enabled: false });
  if (detach) await chrome.debugger.detach({ tabId }).catch(() => {});
  await badge(tabId, '', 'Show image file sizes');
}

export async function toggle(tabId) {
  if (busy.has(tabId)) return { enabled: tabs.has(tabId), error: 'Monitoring is already changing. Please try again.' };
  busy.add(tabId);
  let attached = false;
  try {
    if (tabs.has(tabId)) { await stop(tabId); return { enabled: false }; }
    await chrome.debugger.attach({ tabId }, '1.3');
    attached = true;
    tabs.set(tabId, { requests: new Map(), results: new Map(), revision: 0 });
    await configure({ tabId });
    // Covers pages opened before installation. The content script is idempotent.
    await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['content.js'] });
    await publish(tabId, { type: 'state', enabled: true });
    await badge(tabId, 'ON', 'Image File Size — monitoring this tab');
    return { enabled: true };
  } catch (error) {
    if (attached) await stop(tabId);
    await badge(tabId, '!', `Cannot monitor this tab: ${error.message}`);
    console.warn('Image File Size:', error);
    return { enabled: false, error: error.message };
  } finally {
    busy.delete(tabId);
  }
}

chrome.debugger.onDetach.addListener(source => { if (source.tabId !== undefined) void stop(source.tabId, false); });
chrome.tabs.onRemoved.addListener(tabId => { tabs.delete(tabId); });

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message.type === 'popup-status' || message.type === 'popup-toggle') {
    // Only the extension popup can attach a debugger to an explicitly selected tab.
    if (sender.url !== chrome.runtime.getURL('popup.html') || !Number.isInteger(message.tabId)) return;
    if (message.type === 'popup-status') {
      reply({ enabled: tabs.has(message.tabId), busy: busy.has(message.tabId) });
    } else {
      toggle(message.tabId).then(reply, error => reply({ enabled: tabs.has(message.tabId), error: error.message }));
      return true;
    }
    return;
  }
  if (message.type !== 'snapshot') return;
  const state = tabs.get(sender.tab?.id);
  reply({ enabled: !!state, results: state ? [...state.results] : [] });
});

function record(tabId, state, urls, value) {
  if (tabs.get(tabId) !== state) return;
  const results = urls.map(url => [canonicalURL(url), value]);
  for (const [url, result] of results) {
    state.results.delete(url);
    state.results.set(url, result);
  }
  // Bound retained metadata; no response bodies are retained by this extension.
  while (state.results.size > 3000) state.results.delete(state.results.keys().next().value);
  void publish(tabId, { type: 'sizes', results });
}

async function onEvent(source, method, params) {
  const tabId = source.tabId;
  const state = tabs.get(tabId);
  if (!state) return;
  const key = `${source.sessionId || 'root'}:${params.requestId}`;
  if (method === 'Target.attachedToTarget') {
    await configure({ tabId, sessionId: params.sessionId });
    return;
  }
  if (method === 'Page.frameNavigated' && !source.sessionId && !params.frame.parentId) {
    state.revision++;
    state.results.clear();
    state.requests.clear();
    void publish(tabId, { type: 'reset' });
    return;
  }
  if (method === 'Network.requestWillBeSent') {
    const previous = state.requests.get(key);
    const urls = previous && params.redirectResponse ? previous.urls : [];
    urls.push(params.request.url);
    state.requests.set(key, { urls, bytes: 0, chunks: false });
    // Ignore unbounded streaming requests; responseReceived still creates image records.
    if (state.requests.size > 5000) state.requests.delete(state.requests.keys().next().value);
  } else if (method === 'Network.responseReceived') {
    const response = params.response;
    if (params.type !== 'Image' && !response.mimeType?.startsWith('image/')) {
      state.requests.delete(key);
      return;
    }
    const request = state.requests.get(key);
    // Ignore requests already in flight when monitoring started.
    if (!request) return;
    request.urls.push(response.url);
    request.response = response;
    state.requests.set(key, request);
  } else if (method === 'Network.dataReceived') {
    const request = state.requests.get(key);
    if (request) { request.bytes += params.dataLength; request.chunks = true; }
  } else if (method === 'Network.loadingFailed') {
    const request = state.requests.get(key);
    state.requests.delete(key);
    if (request?.response) record(tabId, state, request.urls, { bytes: null, reason: 'Image request failed' });
  } else if (method === 'Network.loadingFinished') {
    const request = state.requests.get(key);
    state.requests.delete(key);
    if (!request?.response) return;
    const revision = state.revision;
    const response = request.response;
    let bytes = null;
    let reason = 'Response size unavailable; no extra request was made';
    if (response.status === 206) {
      reason = 'Partial response; whole file size unavailable';
    } else if (response.status >= 200 && response.status < 400) {
      if (request.chunks && request.bytes > 0) bytes = request.bytes;
      else bytes = headerSize(response);
      if (bytes === null) {
        try {
          // Reads Chrome's existing response buffer; this command never refetches.
          bytes = bodySize(await send(source, 'Network.getResponseBody', { requestId: params.requestId }));
        } catch { /* Evicted/cached bodies may no longer be accessible. */ }
      }
    } else reason = `HTTP ${response.status}`;
    if (state.revision === revision) record(tabId, state, request.urls, { bytes, reason });
  }
}
chrome.debugger.onEvent.addListener((source, method, params) => {
  void onEvent(source, method, params).catch(error => console.warn('Image File Size:', method, error));
});
