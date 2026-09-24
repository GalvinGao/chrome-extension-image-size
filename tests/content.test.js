import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

test('image label renders MIME below size, with muted prefix and optional encoding', async () => {
  const element = () => ({
    style: { setProperty(k, v) { this[k] = v; }, getPropertyValue(k) { return this[k] || ''; }, getPropertyPriority() { return ''; } },
    children: [], dataset: {}, setAttribute() {},
    append(...nodes) { this.children.push(...nodes); },
    attachShadow() { this.shadow = element(); return this.shadow; },
  });
  const img = { ...element(), isConnected: true, naturalWidth: 200, src: 'https://example.com/a', after(node) { this.nextSibling = node; } };
  let onMessage;
  const frames = [];
  const context = vm.createContext({
    document: { documentElement: {}, querySelectorAll: () => [img], createElement: element, addEventListener() {} },
    window: { addEventListener() {} },
    MutationObserver: class { observe() {} disconnect() {} },
    getComputedStyle: () => ({ getPropertyValue: () => 'none' }),
    requestAnimationFrame(fn) { frames.push(fn); return frames.length; },
    chrome: { runtime: { onMessage: { addListener(fn) { onMessage = fn; } }, sendMessage: async () => ({ enabled: false }) } },
  });
  vm.runInContext(await readFile(new URL('../content.js', import.meta.url), 'utf8'), context);
  await new Promise(resolve => setImmediate(resolve));
  onMessage({ type: 'state', enabled: true });
  onMessage({ type: 'sizes', results: [[img.src, { bytes: 14700, networkBytes: 5100, mimeType: 'image/jpeg', contentEncoding: 'gzip' }]] });
  frames.shift()();
  const label = img.nextSibling.shadow.children[0];
  assert.equal(label.children[0].textContent, '14.7 KB');
  const details = label.children[1];
  assert.equal(details.children[0].textContent, 'image/');
  assert.equal(details.children[0].style.color, '#a5a5a5');
  assert.equal(details.children[1].textContent, 'jpeg');
  assert.equal(details.children[2].textContent, ' + gzip');
  assert.match(details.style.cssText, /text-align:right/);
  onMessage({ type: 'mode', mode: 'network' });
  frames.shift()();
  assert.equal(label.children[0].textContent, '5.1 KB');
  onMessage({ type: 'sizes', results: [[img.src, { bytes: 4000, networkBytes: 0, delivery: 'cache' }]] });
  frames.shift()();
  assert.equal(label.children[0].textContent, '0 B');
  assert.match(img.nextSibling.title, /cache/);
  onMessage({ type: 'sizes', results: [[img.src, { bytes: 4000 }]] });
  frames.shift()();
  assert.equal(label.children[0].textContent, '—');
  onMessage({ type: 'mode', mode: 'resource' });
  frames.shift()();
  assert.equal(label.children[0].textContent, '4.0 KB');
  onMessage({ type: 'sizes', results: [[img.src, { bytes: 4000, mimeType: 'image/png', contentEncoding: '' }]] });
  frames.shift()();
  assert.equal(details.children[2].textContent, '');
  onMessage({ type: 'sizes', results: [[img.src, { bytes: 4000 }]] });
  frames.shift()();
  assert.equal(details.style.display, 'none');
});
