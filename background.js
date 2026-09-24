import { defaults, normalizeSettings, changeSetting } from './settings.js';
import { headerSize, bodySize, canonicalURL, responseMetadata, requestMetrics, encodedFileSize } from './sizes.js';

const tabs = new Map();
const busy = new Set();
let settings = { ...defaults };
const settingsReady = chrome.storage.local.get('displaySettings').then(saved => {
  settings = normalizeSettings(saved.displaySettings);
}).catch(error => console.warn('Image File Size settings:', error));
let settingsQueue = settingsReady;

function saveSetting(key, value) {
  const pending = settingsQueue.then(async () => {
    const next = changeSetting(settings, key, value);
    await chrome.storage.local.set({ displaySettings: next });
    settings = next;
    await Promise.all([...tabs.keys()].map(tabId => publish(tabId, { type: 'settings', settings })));
    return { settings };
  });
  settingsQueue = pending.catch(() => {});
  return pending;
}
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
    await settingsReady;
    if (tabs.has(tabId)) { await stop(tabId); return { enabled: false }; }
    await chrome.debugger.attach({ tabId }, '1.3');
    attached = true;
    tabs.set(tabId, { requests: new Map(), results: new Map(), revision: 0 });
    await configure({ tabId });
    // Covers pages opened before installation. The content script is idempotent.
    await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['content.js'] });
    await publish(tabId, { type: 'state', enabled: true, settings });
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
  if (['popup-status', 'popup-toggle', 'popup-setting'].includes(message.type)) {
    if (sender.url !== chrome.runtime.getURL('popup.html')) return;
    if (message.type === 'popup-setting') {
      saveSetting(message.key, message.value).then(reply, error => reply({ settings, error: error.message }));
      return true;
    }
    if (!Number.isInteger(message.tabId)) return;
    settingsReady.then(async () => {
      if (message.type === 'popup-toggle') return { ...await toggle(message.tabId), settings };
      return { enabled: tabs.has(message.tabId), busy: busy.has(message.tabId), settings };
    }).then(reply, error => reply({ enabled: tabs.has(message.tabId), settings, error: error.message }));
    return true;
  }
  if (message.type !== 'snapshot') return;
  settingsReady.then(() => {
    const state = tabs.get(sender.tab?.id);
    reply({ enabled: !!state, settings, results: state ? [...state.results] : [] });
  }, () => reply({ enabled: false, settings, results: [] }));
  return true;
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
    state.requests.set(key, { urls, bytes: 0, chunks: false, encodedChunks: 0, startedAt: params.timestamp });
    // Ignore unbounded streaming requests; responseReceived still creates image records.
    if (state.requests.size > 5000) state.requests.delete(state.requests.keys().next().value);
  } else if (method === 'Network.responseReceivedExtraInfo') {
    const request = state.requests.get(key);
    if (request) request.actualStatus = params.statusCode;
  } else if (method === 'Network.requestServedFromCache') {
    const request = state.requests.get(key);
    if (request) request.cached = true;
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
    if (request) { request.bytes += params.dataLength; request.chunks = true;
      if (params.encodedDataLength > 0) request.encodedChunks += params.encodedDataLength; }
  } else if (method === 'Network.loadingFailed') {
    const request = state.requests.get(key);
    state.requests.delete(key);
    if (request?.response) record(tabId, state, request.urls, { bytes: null, reason: 'Image request failed', ...responseMetadata(request.response) });
  } else if (method === 'Network.loadingFinished') {
    const request = state.requests.get(key);
    state.requests.delete(key);
    if (!request?.response) return;
    const revision = state.revision;
    const response = request.response;
    const networkBytes = Number.isFinite(params.encodedDataLength) && params.encodedDataLength >= 0 ? params.encodedDataLength : null;
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
    if (state.revision === revision) record(tabId, state, request.urls, { bytes, fileBytes: encodedFileSize(response, bytes, request.encodedChunks), networkBytes, ...requestMetrics(request, params.timestamp), reason, ...responseMetadata(response) });
  }
}
chrome.debugger.onEvent.addListener((source, method, params) => {
  void onEvent(source, method, params).catch(error => console.warn('Image File Size:', method, error));
});
