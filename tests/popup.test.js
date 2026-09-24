import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('popup renders saved tab state, toggles, recovers from errors, and follows detach', async () => {
  const elements = Object.fromEntries(['monitor', 'status', 'error', 'size-mode'].map(id => [id, { addEventListener(type, fn) { this[type] = fn; } }]));
  let detach;
  let fail = false;
  let enabled = true;
  let mode = 'resource';
  const sent = [];
  const context = vm.createContext({
    document: { querySelector: selector => elements[selector.slice(1)] },
    chrome: {
      tabs: { query: async () => [{ id: 42 }] },
      debugger: { onDetach: { addListener(fn) { detach = fn; } } },
      runtime: { sendMessage: async message => {
        sent.push(message);
        if (fail) return { enabled, error: 'Cannot attach debugger' };
        if (message.type === 'popup-toggle') enabled = !enabled;
        if (message.type === 'popup-mode') mode = message.mode;
        return { enabled, mode };
      } },
    },
  });
  vm.runInContext(await readFile(new URL('../popup.js', import.meta.url), 'utf8'), context);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(elements.monitor.checked, true);
  assert.equal(elements.monitor.disabled, false);
  elements['size-mode'].value = 'network';
  await elements['size-mode'].change();
  assert.equal(elements['size-mode'].value, 'network');
  assert.equal(sent.at(-1).type, 'popup-mode');
  elements.monitor.checked = false;
  await elements.monitor.change();
  assert.equal(elements.monitor.checked, false);
  assert.equal(sent.at(-1).tabId, 42);
  fail = true;
  elements.monitor.checked = true;
  await elements.monitor.change();
  assert.equal(elements.monitor.checked, false);
  assert.equal(elements.error.textContent, 'Cannot attach debugger');
  assert.equal(elements.error.hidden, false);
  fail = false;
  await elements.monitor.change();
  assert.equal(elements.monitor.checked, true);
  detach({ tabId: 42 });
  assert.equal(elements.monitor.checked, false);
});
