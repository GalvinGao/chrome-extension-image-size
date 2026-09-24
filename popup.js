const monitor = document.querySelector('#monitor');
const status = document.querySelector('#status');
const error = document.querySelector('#error');
const displaySettings = document.querySelector('#display-settings');
const settingInputs = [...document.querySelectorAll('[data-setting]')];
let tabId;
let enabled = false;
let savedSettings = {};

function showSettings(settings) {
  savedSettings = settings;
  for (const input of settingInputs) {
    if (input.dataset.setting === 'badge') input.value = settings.badge || 'file';
    else input.checked = settings[input.dataset.setting] !== false;
  }
  displaySettings.disabled = false;
}

function showState(state) {
  if (state.settings) showSettings(state.settings);
  enabled = state.enabled;
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
  status.textContent = monitor.checked ? 'Enabling…' : 'Disabling…';
  try {
    showState(await chrome.runtime.sendMessage({ type: 'popup-toggle', tabId }));
  } catch (failure) {
    showState({ enabled, error: failure.message });
  }
});

displaySettings.addEventListener('change', async event => {
  const input = event.target;
  if (!input.dataset.setting) return;
  displaySettings.disabled = true;
  try {
    const response = await chrome.runtime.sendMessage({ type: 'popup-setting', key: input.dataset.setting,
      value: input.dataset.setting === 'badge' ? input.value : input.checked });
    showSettings(response.settings);
    error.textContent = response.error || '';
    error.hidden = !response.error;
  } catch (failure) {
    showSettings(savedSettings);
    error.textContent = failure.message;
    error.hidden = false;
  }
});

// Keep an open popup accurate if Chrome's debugger banner is dismissed.
chrome.debugger.onDetach.addListener(source => {
  if (source.tabId === tabId) showState({ enabled: false });
});
void initialize();
