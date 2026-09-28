import test from 'node:test';
import assert from 'node:assert/strict';
import { accessToken, run } from '../scripts/chrome-webstore.mjs';

const extensionId = 'abcdefghijklmnopabcdefghijklmnop';
const options = { mode: 'publish', publisherId: 'publisher-test', extensionId, token: 'test-token', zip: Buffer.from('fixture'), version: '1.5.2', wait: async () => {} };
function mock(responses) {
  const requests = [];
  return { requests, fetcher: async (url, init = {}) => {
    requests.push({ url, ...init });
    assert.ok(responses.length, 'Unexpected extra API request');
    return new Response(JSON.stringify(responses.shift()), { status: 200 });
  } };
}

test('polls asynchronous upload before submitting; reports review state instead of claiming publication', async () => {
  const fixture = mock([{}, { uploadState: 'IN_PROGRESS' }, { lastAsyncUploadState: 'IN_PROGRESS' }, { lastAsyncUploadState: 'SUCCEEDED' }, { state: 'PENDING_REVIEW' }]);
  const result = await run({ ...options, ...fixture });
  assert.equal(result.submissionState, 'PENDING_REVIEW');
  assert.equal(fixture.requests.length, 5);
  assert.match(fixture.requests[1].url, /\/upload\/v2\/publishers\/publisher-test\/items\/.+:upload$/);
  assert.deepEqual(JSON.parse(fixture.requests[4].body), { publishType: 'DEFAULT_PUBLISH', skipReview: false, blockOnWarnings: true });
});

test('upload mode never submits for review', async () => {
  const fixture = mock([{}, { uploadState: 'SUCCEEDED', crxVersion: '1.5.2' }]);
  assert.equal((await run({ ...options, ...fixture, mode: 'upload' })).uploadState, 'SUCCEEDED');
  assert.equal(fixture.requests.length, 2);
});

test('stage requests deferred publication', async () => {
  const fixture = mock([{}, { uploadState: 'SUCCEEDED' }, { state: 'PENDING_REVIEW' }]);
  await run({ ...options, ...fixture, mode: 'stage' });
  assert.equal(JSON.parse(fixture.requests.at(-1).body).publishType, 'STAGED_PUBLISH');
});

test('failed, missing, or timed-out upload states never publish', async () => {
  for (const state of ['FAILED', 'NOT_FOUND', undefined, 'IN_PROGRESS']) {
    const fixture = mock([{}, { uploadState: state }, { lastAsyncUploadState: 'IN_PROGRESS' }]);
    await assert.rejects(run({ ...options, ...fixture, attempts: 1 }), /No submission was made/);
    assert.ok(fixture.requests.every(request => !request.url.endsWith(':publish')));
  }
});

test('existing reviews, staged releases, and policy warnings prevent uploading', async () => {
  for (const status of [{ submittedItemRevisionStatus: { state: 'PENDING_REVIEW' } }, { submittedItemRevisionStatus: { state: 'STAGED' } }, { warned: true }, { takenDown: true }]) {
    const fixture = mock([status]);
    await assert.rejects(run({ ...options, ...fixture }), /dashboard before uploading/);
    assert.equal(fixture.requests.length, 1);
  }
});

test('version mismatch prevents submission', async () => {
  const fixture = mock([{}, { uploadState: 'SUCCEEDED', crxVersion: '9.0' }]);
  await assert.rejects(run({ ...options, ...fixture }), /version differs/);
  assert.equal(fixture.requests.length, 2);
});

test('status only reads state and does not require a package', async () => {
  const fixture = mock([{ publishedItemRevisionStatus: { state: 'PUBLISHED' } }]);
  const result = await run({ ...options, ...fixture, mode: 'status', zip: undefined });
  assert.equal(result.published.state, 'PUBLISHED');
  assert.equal(fixture.requests.length, 1);
  assert.equal(fixture.requests[0].method, undefined);
});

test('requires explicit valid target identifiers before sending requests', async () => {
  const fixture = mock([]);
  await assert.rejects(run({ ...options, ...fixture, extensionId: '' }), /CWS_EXTENSION_ID/);
  await assert.rejects(run({ ...options, ...fixture, publisherId: '../other' }), /CWS_PUBLISHER_ID/);
  assert.equal(fixture.requests.length, 0);
});

test('reuses only OAuth credentials from SUBMIT_KEYS, never its old extension ID', async () => {
  const fixture = mock([{ access_token: 'new-token' }]);
  const token = await accessToken({ SUBMIT_KEYS: JSON.stringify({ chrome: { clientId: 'client', clientSecret: 'secret', refreshToken: 'refresh', extId: 'old-extension' } }) }, fixture.fetcher);
  assert.equal(token, 'new-token');
  assert.deepEqual(Object.fromEntries(fixture.requests[0].body), { client_id: 'client', client_secret: 'secret', refresh_token: 'refresh', grant_type: 'refresh_token' });
});

test('OAuth and store failure messages do not echo response bodies or credentials', async () => {
  const fetcher = async () => new Response(JSON.stringify({ error: 'test-secret-value' }), { status: 401 });
  await assert.rejects(accessToken({ CWS_CLIENT_ID: 'client', CWS_CLIENT_SECRET: 'test-secret-value', CWS_REFRESH_TOKEN: 'refresh' }, fetcher), error => !error.message.includes('test-secret-value') && error.message.includes('401'));
  await assert.rejects(run({ ...options, fetcher }), error => !error.message.includes('test-secret-value') && error.message.includes('401'));
});
