import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bodySize, headerSize, canonicalURL, responseMetadata, requestMetrics } from '../sizes.js';

test('file byte counts from base64 padding and Unicode text', () => {
  for (const text of ['a', 'ab', 'abc', '猫', '<svg>猫</svg>']) {
    assert.equal(bodySize({ body: Buffer.from(text).toString('base64'), base64Encoded: true }), Buffer.byteLength(text));
    assert.equal(bodySize({ body: text, base64Encoded: false }), Buffer.byteLength(text));
  }
});
test('headers never confuse compressed or partial bytes with full file size', () => {
  assert.equal(headerSize({ status: 200, headers: { 'Content-Length': '42' } }), 42);
  assert.equal(headerSize({ status: 200, headers: { 'Content-Length': '42', 'Content-Encoding': 'gzip' } }), null);
  assert.equal(headerSize({ status: 206, headers: { 'Content-Length': '42' } }), null);
  assert.equal(headerSize({ status: 200, headers: {} }), null);
  assert.equal(headerSize({ status: 200, headers: { 'Content-Length': '-1' } }), null);
});
test('URL matching retains query variants and removes image fragments', () => {
  assert.equal(canonicalURL('https://example.com/a.svg?size=1#icon'), 'https://example.com/a.svg?size=1');
});

test('MIME and content encoding metadata handle missing headers and multiple codings', () => {
  assert.deepEqual(responseMetadata({ mimeType: 'image/jpeg', headers: { 'Content-Encoding': 'GZip' } }), { mimeType: 'image/jpeg', contentEncoding: 'gzip' });
  assert.deepEqual(responseMetadata({ headers: { 'CONTENT-TYPE': 'image/svg+xml; charset=utf-8', 'content-encoding': ' gzip, br ' } }), { mimeType: 'image/svg+xml', contentEncoding: 'gzip, br' });
  assert.deepEqual(responseMetadata({ mimeType: 'image/png', headers: { 'Transfer-Encoding': 'chunked', 'Content-Encoding': 'identity' } }), { mimeType: 'image/png', contentEncoding: '' });
  assert.deepEqual(responseMetadata({ headers: {} }), { mimeType: '', contentEncoding: '' });
  assert.equal(responseMetadata({ mimeType: '<invalid>' }).mimeType, '');
});

test('load duration and TTFB share the monotonic clock; cache source stays distinct', () => {
  const response = { timing: { requestTime: 10.01, receiveHeadersStart: 90 } };
  const result = requestMetrics({ startedAt: 10, response }, 10.5);
  assert.equal(result.durationMs, 500);
  assert.ok(Math.abs(result.ttfbMs - 100) < 0.001);
  assert.equal(result.delivery, 'network');
  for (const [flag, delivery] of [['fromDiskCache', 'disk cache'], ['fromPrefetchCache', 'prefetch cache'], ['fromServiceWorker', 'service worker']]) {
    const cached = requestMetrics({ startedAt: 10, cached: true, response: { ...response, [flag]: true } }, 10.5);
    assert.equal(cached.delivery, delivery);
    assert.equal(cached.ttfbMs, null);
  }
  assert.equal(requestMetrics({ response: {}, cached: true }, undefined).delivery, 'memory cache');
  assert.equal(requestMetrics({ response: {} }, undefined).durationMs, null);
  assert.equal(requestMetrics({ startedAt: 10, response: { timing: { requestTime: 10, receiveHeadersStart: -1 } } }, 11).ttfbMs, null);
});
