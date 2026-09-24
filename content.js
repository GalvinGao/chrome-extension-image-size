(() => {
  if (globalThis.__imageFileSizeInstalled) return;
  globalThis.__imageFileSizeInstalled = true;
  const entries = new Map();
  const sizes = new Map();
  const prefix = `--ifs-${Math.random().toString(36).slice(2)}-`;
  let sequence = 0;
  let enabled = false;
  let receivedState = false;
  let frame = 0;
  const observer = new MutationObserver(schedule);
  const timing = new PerformanceObserver(schedule);
  const canonical = url => url.split('#')[0];
  const format = bytes => bytes < 1000 ? `${bytes} B` : bytes < 1e6 ? `${(bytes / 1000).toFixed(1)} KB` : `${(bytes / 1e6).toFixed(2)} MB`;

  function remove(img, entry) {
    entry.host.remove();
    if (img.style.getPropertyValue('anchor-name') === entry.assigned) {
      if (entry.original) img.style.setProperty('anchor-name', entry.original, entry.priority);
      else img.style.removeProperty('anchor-name');
    }
    entries.delete(img);
  }

  function schedule() {
    if (enabled && !frame) frame = requestAnimationFrame(render);
  }

  function render() {
    frame = 0;
    if (!enabled || !document.documentElement) return;
    observer.disconnect();
    for (const [img, entry] of entries) if (!img.isConnected) remove(img, entry);
    for (const img of document.querySelectorAll('img')) {
      let entry = entries.get(img);
      if (!entry) {
        const name = prefix + ++sequence;
        const original = img.style.getPropertyValue('anchor-name');
        const priority = img.style.getPropertyPriority('anchor-name');
        const current = getComputedStyle(img).getPropertyValue('anchor-name').trim();
        const assigned = current && current !== 'none' ? `${current}, ${name}` : name;
        img.style.setProperty('anchor-name', assigned, 'important');
        const host = document.createElement('span');
        host.dataset.imageFileSize = '';
        host.setAttribute('aria-hidden', 'true');
        host.style.cssText = `all:initial!important;position:absolute!important;position-anchor:${name}!important;top:anchor(top)!important;left:anchor(right)!important;transform:translateX(-100%)!important;margin:2px 0 0 -2px!important;padding:0!important;border:0!important;pointer-events:none!important;z-index:2147483647!important;position-visibility:anchors-visible!important;`;
        const root = host.attachShadow({ mode: 'closed' });
        const label = document.createElement('span');
        label.style.cssText = 'display:block;padding:1px 3px;border-radius:2px;background:#000c;color:white;font:9px/12px ui-monospace,SFMono-Regular,Consolas,monospace;white-space:nowrap;user-select:none';
        root.append(label);
        entry = { host, label, original, priority, assigned };
        entries.set(img, entry);
      }
      if (img.nextSibling !== entry.host) img.after(entry.host);
      const url = img.currentSrc || img.src;
      let result = sizes.get(canonical(url));
      if (!result || result.bytes === null) {
        const resource = performance.getEntriesByName(url).findLast(item => item.decodedBodySize > 0);
        if (resource) result = { bytes: resource.decodedBodySize };
      }
      entry.label.textContent = result?.bytes != null ? format(result.bytes) : '—';
      entry.host.title = result?.bytes != null ? `${result.bytes.toLocaleString()} bytes` : result?.reason || 'Not captured. Reload with monitoring enabled to capture image requests.';
      entry.host.style.setProperty('display', img.naturalWidth ? 'block' : 'none', 'important');
    }
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['src', 'srcset', 'sizes'] });
  }

  function setEnabled(value) {
    if (enabled === value) return;
    enabled = value;
    if (enabled) {
      timing.observe({ type: 'resource', buffered: true });
      schedule();
    } else {
      observer.disconnect();
      timing.disconnect();
      cancelAnimationFrame(frame);
      frame = 0;
      for (const [img, entry] of entries) remove(img, entry);
      sizes.clear();
    }
  }

  chrome.runtime.onMessage.addListener(message => {
    if (message.type === 'state') { receivedState = true; setEnabled(message.enabled); }
    if (message.type === 'reset') { sizes.clear(); schedule(); }
    if (message.type === 'sizes') {
      for (const [url, result] of message.results) sizes.set(url, result);
      while (sizes.size > 3000) sizes.delete(sizes.keys().next().value);
      schedule();
    }
  });
  chrome.runtime.sendMessage({ type: 'snapshot' }).then(state => {
    if (receivedState) return;
    for (const [url, result] of state.results || []) sizes.set(url, result);
    setEnabled(state.enabled);
  }).catch(() => {});
  document.addEventListener('load', schedule, true);
  document.addEventListener('DOMContentLoaded', schedule);
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('pageshow', schedule);
})();
