(() => {
  if (globalThis.__imageFileSizeInstalled) return;
  globalThis.__imageFileSizeInstalled = true;
  const entries = new Map();
  const sizes = new Map();
  const prefix = `--ifs-${Math.random().toString(36).slice(2)}-`;
  let sequence = 0;
  let enabled = false;
  let settings = {};
  let receivedSettings = false;
  let receivedState = false;
  let frame = 0;
  const observer = new MutationObserver(schedule);
  const resizeObserver = new ResizeObserver(schedule);
  const canonical = url => url.split('#')[0];
  const format = bytes => bytes < 1000 ? `${bytes} B` : bytes < 1e6 ? `${(bytes / 1000).toFixed(1)} KB` : `${(bytes / 1e6).toFixed(2)} MB`;

  function remove(img, entry) {
    resizeObserver.unobserve(img);
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
        host.tabIndex = 0;
        host.setAttribute('role', 'group');
        host.popover = 'manual';
        host.style.cssText = `all:initial!important;position:absolute!important;position-anchor:${name}!important;top:anchor(top)!important;left:anchor(right)!important;transform:translateX(-100%)!important;margin:2px 0 0 -2px!important;padding:0!important;border:0!important;pointer-events:auto!important;z-index:2147483647!important;position-visibility:anchors-visible!important;`;
        const root = host.attachShadow({ mode: 'closed' });
        const label = document.createElement('span');
        label.className = 'label';
        const size = document.createElement('span');
        size.className = 'size';
        const details = document.createElement('span');
        details.className = 'details';
        const mimeLine = document.createElement('span');
        mimeLine.className = 'mime';
        const mimePrefix = document.createElement('span');
        mimePrefix.style.color = '#aaa';
        const subtype = document.createElement('span');
        const encoding = document.createElement('span');
        mimeLine.append(mimePrefix, subtype, encoding);
        details.append(mimeLine);
        const rows = {};
        for (const [key, caption] of [['resource', 'Resource'], ['transfer', 'Transferred'], ['intrinsic', 'Intrinsic'], ['displayed', 'Displayed'], ['delivery', 'Source'], ['duration', 'Load / TTFB'], ['density', 'Bytes / displayed MP'], ['srcset', 'srcset']]) {
          const row = document.createElement('span');
          row.className = 'row';
          const name = document.createElement('span');
          name.textContent = caption;
          const value = document.createElement('span');
          row.append(name, value);
          details.append(row);
          rows[key] = { row, value };
        }
        const note = document.createElement('span');
        note.className = 'note';
        details.append(note);
        label.append(size, details);
        const style = document.createElement('style');
        style.textContent = `
          :host::backdrop { background: transparent !important; pointer-events: none !important; }
          .label { display:block;padding:1px 3px;border-radius:3px;background:#16181eeF;color:#fff;font:9px/12px ui-monospace,SFMono-Regular,Consolas,monospace;text-align:right; }
          :host([data-density="warning"]) .label { background:#9a420d; }
          :host([data-density="high"]) .label { background:#a32222; }
          .size { display:block;white-space:nowrap; }
          .details { display:none; }
          :host([data-expanded]) .label { padding:6px 8px; }
          :host([data-expanded]) .details { display:block;width:250px;max-width:calc(100vw - 24px);font-size:10px;line-height:16px; }
          :host(:focus-visible) .label { outline:2px solid #9ccaff;outline-offset:2px; }
          .mime { display:block;margin:2px 0 5px;overflow-wrap:anywhere; }
          .row { display:flex;justify-content:space-between;gap:14px; }
          .row > :first-child { color:#ddd;text-align:left; }
          .row > :last-child { text-align:right; }
          .note { display:block;max-width:270px;margin-top:5px;color:#ddd;text-align:left;white-space:normal; }
          [hidden] { display:none!important; }
        `;
        root.append(label, style);
        entry = { host, size, details, mimeLine, rows, note, prefix: mimePrefix, subtype, encoding, original, priority, assigned };
        const expand = () => { host.dataset.expanded = ''; schedule(); };
        const collapse = () => { if (!host.matches(':hover') && !host.matches(':focus-within')) { delete host.dataset.expanded; host.style.removeProperty('margin-left'); } };
        host.addEventListener('pointerenter', expand);
        host.addEventListener('pointerleave', collapse);
        host.addEventListener('focusin', expand);
        host.addEventListener('focusout', collapse);
        host.addEventListener('keydown', event => {
          if (event.key === 'Escape') { delete host.dataset.expanded; host.style.removeProperty('margin-left'); host.blur(); event.stopPropagation(); }
        });
        // The small interactive label must not activate a surrounding image link.
        host.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); });
        resizeObserver.observe(img);
        entries.set(img, entry);
      }
      if (img.nextSibling !== entry.host) img.after(entry.host);
      const url = img.currentSrc || img.src;
      const result = sizes.get(canonical(url));
      const bytes = settings.badge === 'resource' ? result?.bytes : settings.badge === 'transfer' ? result?.networkBytes : result?.fileBytes;
      entry.size.textContent = bytes != null ? format(bytes) : '—';
      const mime = result?.mimeType || '';
      const slash = mime.indexOf('/');
      entry.prefix.textContent = slash >= 0 ? mime.slice(0, slash + 1) : '';
      entry.subtype.textContent = slash >= 0 ? mime.slice(slash + 1) : mime;
      entry.encoding.textContent = result?.contentEncoding ? `${mime ? ' + ' : ''}${result.contentEncoding}` : '';
      entry.mimeLine.hidden = settings.mime === false || (!mime && !result?.contentEncoding);
      const rect = img.getBoundingClientRect();
      const pixels = rect.width * rect.height;
      const density = pixels > 0 && result?.bytes != null ? result.bytes * 1e6 / pixels : null;
      const severity = density > 8e6 ? 'high' : density !== null && density >= 3e6 ? 'warning' : '';
      if (severity && settings.colors !== false) entry.host.dataset.density = severity;
      else delete entry.host.dataset.density;
      const time = value => value == null ? '—' : `${Math.round(value)} ms`;
      entry.rows.transfer.value.textContent = result?.networkBytes != null ? format(result.networkBytes) : '—';
      entry.rows.resource.value.textContent = result?.bytes != null ? format(result.bytes) : '—';
      entry.rows.delivery.value.textContent = result?.delivery || '—';
      entry.rows.duration.value.textContent = `${time(result?.durationMs)} / ${time(result?.ttfbMs)}`;
      entry.rows.density.value.textContent = density !== null ? `${format(density)} / MP${severity ? ` · ${severity}` : ''}` : '—';
      const hasSrcset = !!img.srcset?.trim() || [...(img.closest('picture')?.querySelectorAll('source[srcset]') || [])].some(source => source.getAttribute('srcset')?.trim());
      for (const [key, row] of Object.entries(entry.rows)) row.row.hidden = settings[key] === false;
      entry.rows.srcset.row.hidden = settings.srcset === false || !hasSrcset;
      entry.rows.srcset.value.textContent = 'YES';
      entry.note.textContent = severity ? `${severity === 'high' ? 'Above 8' : '3–8'} MB per displayed MP of resource bytes. A heuristic; small icons and animated images can score high.` : result ? '' : 'Enable monitoring, then reload to capture this image.';
      entry.note.hidden = !entry.note.textContent || (result && settings.density === false);
      if ('expanded' in entry.host.dataset) {
        const panelWidth = entry.host.getBoundingClientRect().width;
        entry.host.style.setProperty('margin-left', `${Math.max(0, panelWidth + 6 - rect.right) - 2}px`, 'important');
        entry.rows.intrinsic.value.textContent = `${img.naturalWidth}×${img.naturalHeight}`;
        entry.rows.displayed.value.textContent = `${Math.round(rect.width)}×${Math.round(rect.height)}`;
      }
      entry.host.setAttribute('aria-label', `Image ${settings.badge === 'transfer' ? 'transferred' : settings.badge === 'resource' ? 'resource' : 'file'} size ${entry.size.textContent}${severity ? `, ${severity} bytes per displayed megapixel` : ''}. Focus for details.`);
      const visible = img.naturalWidth > 0;
      entry.host.style.setProperty('display', visible ? 'block' : 'none', 'important');
      // z-index cannot escape an ancestor stacking context; the top layer can.
      // CSS anchors still handle positioning and scrolling without measurements.
      if (visible && !entry.host.matches(':popover-open')) entry.host.showPopover();
      else if (!visible && entry.host.matches(':popover-open')) entry.host.hidePopover();
    }
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['src', 'srcset', 'sizes'] });
  }

  function setEnabled(value) {
    if (enabled === value) return;
    enabled = value;
    if (enabled) {
      schedule();
    } else {
      observer.disconnect();
      resizeObserver.disconnect();
      cancelAnimationFrame(frame);
      frame = 0;
      for (const [img, entry] of entries) remove(img, entry);
      sizes.clear();
    }
  }

  chrome.runtime.onMessage.addListener(message => {
    if (message.type === 'state') { receivedState = true; if (message.settings) settings = message.settings; setEnabled(message.enabled); }
    if (message.type === 'settings') { receivedSettings = true; settings = message.settings; schedule(); }
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
    if (!receivedSettings) settings = state.settings || {};
    setEnabled(state.enabled);
  }).catch(() => {});
  document.addEventListener('load', schedule, true);
  document.addEventListener('DOMContentLoaded', schedule);
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('pageshow', schedule);
})();
