export function header(headers, name) {
  return Object.entries(headers || {}).find(([key]) => key.toLowerCase() === name)?.[1];
}

export function headerSize(response) {
  // Content-Length is compressed on the wire; partial responses are not whole files.
  const encoding = String(header(response.headers, 'content-encoding') || 'identity');
  const length = String(header(response.headers, 'content-length') ?? '');
  if (response.status !== 200 || encoding !== 'identity' || !/^\d+$/.test(length)) return null;
  const bytes = Number(length);
  return Number.isSafeInteger(bytes) ? bytes : null;
}

export function bodySize({ body, base64Encoded }) {
  if (!base64Encoded) return new TextEncoder().encode(body).byteLength;
  return body.length * 3 / 4 - (body.endsWith('==') ? 2 : body.endsWith('=') ? 1 : 0);
}

export function canonicalURL(url) {
  return url.split('#')[0];
}

export function responseMetadata(response) {
  const candidate = String(response.mimeType || header(response.headers, 'content-type') || '').split(';')[0].trim().toLowerCase();
  const mimeType = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(candidate) ? candidate : '';
  const contentEncoding = String(header(response.headers, 'content-encoding') || '')
    .split(',').map(value => value.trim().toLowerCase())
    .filter(value => value && value !== 'identity').join(', ');
  return { mimeType, contentEncoding };
}
