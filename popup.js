const monitor = document.querySelector('#monitor');
const status = document.querySelector('#status');
const error = document.querySelector('#error');
const sizeMode = document.querySelector('#size-mode');
let mode = 'resource';
let tabId;
let enabled = false;

function showState(state) {
  enabled = state.enabled;
  mode = state.mode || mode;
  sizeMode.value = mode;
  sizeMode.disabled = !enabled || !!state.busy;
  monitor.checked = enabled;
  monitor.disabled = !!state.busy;
  status.textContent = state.busy ? 'Updating…' : enabled ? 'On · watching new image loads' : 'Off';
  error.textContent = state.error || '';
  error.hidden = !state.error;
}

async function initialize() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!Number.isInteger(tab?.id)) throw new Error('No active tab is available.');
    tabId = tab.id;
    showState(await chrome.runtime.sendMessage({ type: 'popup-status', tabId }));
  } catch (failure) {
    showState({ enabled: false, error: failure.message });
    monitor.disabled = true;
    status.textContent = 'Unavailable';
  }
}

monitor.addEventListener('change', async () => {
  monitor.disabled = true;
  sizeMode.disabled = true;
  status.textContent = monitor.checked ? 'Enabling…' : 'Disabling…';
  try {
    showState(await chrome.runtime.sendMessage({ type: 'popup-toggle', tabId }));
  } catch (failure) {
    showState({ enabled, error: failure.message });
  }
});

sizeMode.addEventListener('change', async () => {
  sizeMode.disabled = true;
  monitor.disabled = true;
  try {
    showState(await chrome.runtime.sendMessage({ type: 'popup-mode', tabId, mode: sizeMode.value }));
  } catch (failure) {
    showState({ enabled, mode, error: failure.message });
  }
});

// Keep an open popup accurate if Chrome's debugger banner is dismissed.
chrome.debugger.onDetach.addListener(source => {
  if (source.tabId === tabId) showState({ enabled: false });
});
void initialize();
