export const defaults = Object.freeze({
  badge: 'file', colors: true, mime: true, resource: true, transfer: true,
  intrinsic: true, displayed: true, delivery: true, duration: true, density: true, srcset: true,
});

export function normalizeSettings(value = {}) {
  return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [key,
    key === 'badge' ? ['file', 'resource', 'transfer', 'density'].includes(value?.[key]) ? value[key] : fallback :
      typeof value?.[key] === 'boolean' ? value[key] : fallback,
  ]));
}

export function changeSetting(current, key, value) {
  if (!Object.hasOwn(defaults, key) ||
      (key === 'badge' ? !['file', 'resource', 'transfer', 'density'].includes(value) : typeof value !== 'boolean')) {
    throw new Error('Invalid display setting');
  }
  return { ...current, [key]: value };
}
