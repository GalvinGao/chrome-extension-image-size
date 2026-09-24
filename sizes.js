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

export function requestMetrics(request, finishedAt) {
  const response = request.response;
  const delivery = response.fromServiceWorker ? 'service worker' : response.fromPrefetchCache ? 'prefetch cache' :
    response.fromDiskCache ? 'disk cache' : request.cached ? 'memory cache' : 'network';
  const start = request.startedAt;
  const elapsed = Number.isFinite(start) && Number.isFinite(finishedAt) ? (finishedAt - start) * 1000 : null;
  const timing = response.timing;
  const firstByte = delivery === 'network' && Number.isFinite(start) && Number.isFinite(timing?.requestTime) &&
    Number.isFinite(timing?.receiveHeadersStart) && timing.receiveHeadersStart >= 0 ?
    (timing.requestTime - start) * 1000 + timing.receiveHeadersStart : null;
  return {
    delivery,
    durationMs: elapsed !== null && elapsed >= 0 ? elapsed : null,
    ttfbMs: firstByte !== null && firstByte >= 0 ? firstByte : null,
  };
}
