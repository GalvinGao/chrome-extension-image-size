import { appendFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

const api = 'https://chromewebstore.googleapis.com';
export const modes = ['status', 'upload', 'stage', 'publish'];

export async function accessToken(env, fetcher = fetch) {
  if (env.CWS_ACCESS_TOKEN) return env.CWS_ACCESS_TOKEN;
  let legacy = {};
  if (env.SUBMIT_KEYS) {
    try { legacy = JSON.parse(env.SUBMIT_KEYS).chrome || {}; }
    catch { throw new Error('SUBMIT_KEYS must be valid JSON.'); }
  }
  // Only reuse account credentials from BPP. Its extId must never select this release target.
  const credentials = {
    client_id: env.CWS_CLIENT_ID || legacy.clientId,
    client_secret: env.CWS_CLIENT_SECRET || legacy.clientSecret,
    refresh_token: env.CWS_REFRESH_TOKEN || legacy.refreshToken,
  };
  if (Object.values(credentials).some(value => typeof value !== 'string' || !value)) {
    throw new Error('Provide a scoped CWS_ACCESS_TOKEN, OAuth credentials, or SUBMIT_KEYS.chrome credentials.');
  }
  const response = await fetcher('https://oauth2.googleapis.com/token', {
    method: 'POST', body: new URLSearchParams({ ...credentials, grant_type: 'refresh_token' }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`OAuth token refresh failed (HTTP ${response.status}). Check authorization and token expiry.`);
  const data = await response.json();
  if (typeof data.access_token !== 'string' || !data.access_token) throw new Error('OAuth response did not contain an access token.');
  return data.access_token;
}

export async function run({ mode, publisherId, extensionId, token, zip, version, fetcher = fetch, wait = setTimeout, attempts = 60 }) {
  if (!modes.includes(mode)) throw new Error(`Mode must be one of: ${modes.join(', ')}.`);
  if (!/^[a-zA-Z0-9_-]+$/.test(publisherId || '')) throw new Error('Set CWS_PUBLISHER_ID to your publisher ID.');
  if (!/^[a-p]{32}$/.test(extensionId || '')) throw new Error('Set CWS_EXTENSION_ID to this extension’s 32-character store ID.');
  if (!token) throw new Error('Missing access token.');
  const item = `publishers/${publisherId}/items/${extensionId}`;
  const request = async (url, options = {}) => {
    const response = await fetcher(url, { ...options, headers: { ...options.headers, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(120_000) });
    // Avoid logging response bodies: OAuth/API diagnostics may contain sensitive values.
    if (!response.ok) throw new Error(`Chrome Web Store request failed (HTTP ${response.status}). Inspect the item in the developer dashboard; no automatic retry was made.`);
    return response.json();
  };
  const statusURL = `${api}/v2/${item}:fetchStatus`;
  const before = await request(statusURL);
  if (before.itemId && before.itemId !== extensionId) throw new Error('Store returned a different extension ID.');
  if (mode === 'status') return { mode, extensionId, published: before.publishedItemRevisionStatus, submitted: before.submittedItemRevisionStatus, warned: !!before.warned, takenDown: !!before.takenDown };
  if (before.takenDown || before.warned || ['PENDING_REVIEW', 'STAGED'].includes(before.submittedItemRevisionStatus?.state)) {
    throw new Error('Resolve the existing review, staged release, or policy warning in the dashboard before uploading.');
  }
  if (!Buffer.isBuffer(zip) || !zip.length || !version) throw new Error('A ZIP package and expected manifest version are required.');
  const uploaded = await request(`${api}/upload/v2/${item}:upload`, { method: 'POST', headers: { 'Content-Type': 'application/zip' }, body: zip });
  if (uploaded.itemId && uploaded.itemId !== extensionId) throw new Error('Upload returned a different extension ID.');
  if (uploaded.crxVersion && uploaded.crxVersion !== version) throw new Error('Uploaded version differs from the local manifest.');
  let state = uploaded.uploadState;
  for (let i = 0; state === 'IN_PROGRESS' && i < attempts; i++) {
    await wait(5000);
    state = (await request(statusURL)).lastAsyncUploadState;
  }
  if (state !== 'SUCCEEDED') throw new Error(`Upload did not complete successfully (${state || 'missing state'}). No submission was made.`);
  const result = { mode, extensionId, version, uploadState: state };
  if (mode === 'upload') return result;
  const submitted = await request(`${api}/v2/${item}:publish`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publishType: mode === 'stage' ? 'STAGED_PUBLISH' : 'DEFAULT_PUBLISH', skipReview: false, blockOnWarnings: true }),
  });
  if (!['PENDING_REVIEW', 'STAGED', 'PUBLISHED', 'PUBLISHED_TO_TESTERS'].includes(submitted.state)) {
    throw new Error(`Submission was not accepted (${submitted.state || 'missing state'}). Check the dashboard.`);
  }
  return { ...result, submissionState: submitted.state };
}

async function main() {
  const mode = process.argv[2] || 'status';
  if (!modes.includes(mode)) throw new Error('Unknown mode. Use status, upload, stage, or publish.');
  const root = path.resolve(import.meta.dirname, '..');
  const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
  const zip = mode === 'status' ? undefined : await readFile(path.join(root, 'dist', `image-file-size-${manifest.version}.zip`));
  const token = await accessToken(process.env);
  const result = await run({ mode, publisherId: process.env.CWS_PUBLISHER_ID, extensionId: process.env.CWS_EXTENSION_ID, token, zip, version: manifest.version });
  console.log(JSON.stringify(result, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Chrome Web Store\n\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\`\n\nUpload and review submission are not proof of a public release. Check the developer dashboard for review progress.\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
