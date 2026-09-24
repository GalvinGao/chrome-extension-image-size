import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

test('image label renders MIME below size, with muted prefix and optional encoding', async () => {
  const element = () => ({
    style: { setProperty(k, v) { this[k] = v; }, getPropertyValue(k) { return this[k] || ''; }, getPropertyPriority() { return ''; }, removeProperty(k) { delete this[k]; } },
    children: [], dataset: {}, setAttribute() {},
    matches(selector) { return selector === ':popover-open' && !!this.open; },
    showPopover() { this.open = true; this.shows = (this.shows || 0) + 1; },
    hidePopover() { this.open = false; },
    remove() { this.removed = true; this.open = false; },
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
    cancelAnimationFrame() {},
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
  assert.equal(img.nextSibling.popover, 'manual');
  assert.equal(img.nextSibling.open, true);
  assert.match(img.nextSibling.style.cssText, /position:absolute!important/);
  assert.match(img.nextSibling.style.cssText, /pointer-events:none!important/);
  assert.match(img.nextSibling.shadow.children[1].textContent, /pointer-events: none !important/);
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
  assert.equal(img.nextSibling.shows, 1, 'Rendering updates do not reopen the popover');
  img.naturalWidth = 0;
  onMessage({ type: 'reset' });
  frames.shift()();
  assert.equal(img.nextSibling.open, false);
  img.naturalWidth = 200;
  onMessage({ type: 'reset' });
  frames.shift()();
  assert.equal(img.nextSibling.open, true);
  onMessage({ type: 'state', enabled: false });
  assert.equal(img.nextSibling.open, false);
  assert.equal(img.nextSibling.removed, true);
});
