import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

test('file-size badge expands details, flags density, updates dimensions and cleans up', async () => {
  const element = () => ({
    style: { setProperty(k, v) { this[k] = v; }, getPropertyValue(k) { return this[k] || ''; }, getPropertyPriority() { return ''; }, removeProperty(k) { delete this[k]; } },
    children: [], dataset: {}, attrs: {}, events: {},
    getBoundingClientRect() { return { width: 266 }; },
    setAttribute(k,v) { this.attrs[k] = v; },
    matches(selector) { return selector === ':popover-open' && !!this.open; },
    showPopover() { this.open = true; }, hidePopover() { this.open = false; },
    remove() { this.removed = true; this.open = false; }, blur() {},
    addEventListener(event, fn) { this.events[event] = fn; },
    append(...nodes) { this.children.push(...nodes); },
    attachShadow() { this.shadow = element(); return this.shadow; },
  });
  let displayWidth = 100;
  let picture = null;
  const img = { ...element(), isConnected: true, naturalWidth: 200, naturalHeight: 100, src: 'https://example.com/a', srcset: '',
    after(node) { this.nextSibling = node; }, closest() { return picture; },
    getBoundingClientRect() { return { width: displayWidth, height: 50, right: 180 }; },
  };
  let onMessage;
  let resized;
  const frames = [];
  const context = vm.createContext({
    document: { documentElement: {}, querySelectorAll: () => [img], createElement: element, addEventListener() {} },
    window: { addEventListener() {} },
    MutationObserver: class { observe() {} disconnect() {} },
    ResizeObserver: class { constructor(fn) { resized = fn; } observe() {} unobserve() {} disconnect() {} },
    getComputedStyle: () => ({ getPropertyValue: () => 'none' }),
    cancelAnimationFrame() {}, requestAnimationFrame(fn) { frames.push(fn); return frames.length; },
    chrome: { runtime: { onMessage: { addListener(fn) { onMessage = fn; } }, sendMessage: async () => ({ enabled: false }) } },
  });
  vm.runInContext(await readFile(new URL('../content.js', import.meta.url), 'utf8'), context);
  await new Promise(resolve => setImmediate(resolve));
  const result = { bytes: 30000, fileBytes: 30000, networkBytes: 0, delivery: 'disk cache', durationMs: 12, ttfbMs: null, mimeType: 'image/jpeg', contentEncoding: 'gzip' };
  onMessage({ type: 'state', enabled: true });
  onMessage({ type: 'sizes', results: [[img.src, result]] });
  frames.shift()();
  const host = img.nextSibling;
  const [label, style] = host.shadow.children;
  const [size, details] = label.children;
  assert.equal(size.textContent, '30.0 KB');
  assert.equal(host.popover, 'manual');
  assert.equal(host.open, true);
  assert.ok('heavy' in host.dataset);
  assert.equal('expanded' in host.dataset, false);
  assert.match(style.textContent, /\.details \{ display:none/);
  assert.match(style.textContent, /data-heavy.*background:#a32222/);
  assert.match(host.style.cssText, /position:absolute/);
  host.events.pointerenter();
  frames.shift()();
  assert.ok('expanded' in host.dataset);
  assert.equal(details.children[0].children[0].textContent, 'image/');
  assert.equal(details.children[0].children[2].textContent, ' + gzip');
  assert.equal(details.children[1].children[1].textContent, '30.0 KB');
  assert.equal(details.children[2].children[1].textContent, '0 B');
  assert.equal(details.children[3].children[1].textContent, '200×100');
  assert.equal(details.children[4].children[1].textContent, '100×50');
  assert.equal(details.children[5].children[1].textContent, 'disk cache');
  assert.equal(details.children[6].children[1].textContent, '12 ms / —');
  assert.equal(details.children[7].children[1].textContent, '1.50 MB / MP · high');
  assert.equal(details.children[8].hidden, true);
  img.srcset = 'a 1x, b 2x';
  displayWidth = 80;
  resized(); frames.shift()();
  assert.equal(details.children[8].hidden, false);
  assert.equal(details.children[8].children[1].textContent, 'YES');
  assert.equal(details.children[3].children[1].textContent, '200×100');
  assert.equal(details.children[4].children[1].textContent, '80×50');
  img.srcset = '';
  picture = { querySelectorAll: () => [{ getAttribute: () => 'a 2x' }] };
  onMessage({ type: 'sizes', results: [[img.src, { ...result, bytes: 20000 }]] }); frames.shift()();
  assert.equal('heavy' in host.dataset, false, 'Exactly the threshold is not high');
  assert.equal(details.children[8].hidden, false);
  host.events.pointerleave();
  assert.equal('expanded' in host.dataset, false);
  host.events.focusin(); frames.shift()();
  assert.ok('expanded' in host.dataset);
  host.events.keydown({ key: 'Escape', stopPropagation() {} });
  assert.equal('expanded' in host.dataset, false);
  onMessage({ type: 'sizes', results: [[img.src, {}]] }); frames.shift()();
  assert.equal(size.textContent, '—');
  assert.equal('heavy' in host.dataset, false);
  onMessage({ type: 'state', enabled: false });
  assert.equal(host.open, false);
  assert.equal(host.removed, true);
});
