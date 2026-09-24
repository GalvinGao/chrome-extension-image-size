import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('popup renders saved tab state, toggles, recovers from errors, and follows detach', async () => {
  const elements = Object.fromEntries(['monitor', 'status', 'error', 'display-settings'].map(id => [id, { addEventListener(type, fn) { this[type] = fn; } }]));
  const controls = [{dataset:{setting:'badge'},value:'file'}, {dataset:{setting:'intrinsic'},checked:true}];
  let settings = {badge:'file',intrinsic:true};
  let detach;
  let fail = false;
  let enabled = true;
  const sent = [];
  const context = vm.createContext({
    document: { querySelectorAll: () => controls, querySelector: selector => elements[selector.slice(1)] },
    chrome: {
      tabs: { query: async () => [{ id: 42 }] },
      debugger: { onDetach: { addListener(fn) { detach = fn; } } },
      runtime: { sendMessage: async message => {
        sent.push(message);
        if (fail) return { enabled, error: 'Cannot attach debugger' };
        if (message.type === 'popup-setting') settings = {...settings,[message.key]:message.value};
        if (message.type === 'popup-toggle') enabled = !enabled;
        return { enabled, settings };
      } },
    },
  });
  vm.runInContext(await readFile(new URL('../popup.js', import.meta.url), 'utf8'), context);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(elements.monitor.checked, true);
  assert.equal(elements.monitor.disabled, false);
  assert.equal(elements['display-settings'].disabled, false);
  controls[0].value = 'transfer';
  await elements['display-settings'].change({target:controls[0]});
  assert.equal(sent.at(-1).type, 'popup-setting');
  assert.equal(sent.at(-1).value, 'transfer');
  controls[1].checked = false;
  await elements['display-settings'].change({target:controls[1]});
  assert.equal(settings.intrinsic, false);
  assert.equal(controls[1].checked, false);
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
