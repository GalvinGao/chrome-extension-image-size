import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { packageExtension, packageFiles, root } from '../scripts/package.mjs';

test('package is reproducible, has a root manifest, and excludes credentials, docs, and tests', async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), 'image-size-package-test-'));
  try {
    for (const file of [...packageFiles, 'package.json']) {
      await mkdir(path.dirname(path.join(fixture, file)), { recursive: true });
      await copyFile(path.join(root, file), path.join(fixture, file));
    }
    await writeFile(path.join(fixture, 'gha-creds-test.json'), '{"token":"not-a-real-token"}');
    await writeFile(path.join(fixture, '.env'), 'TEST=not-a-real-secret');
    await writeFile(path.join(fixture, 'unrelated.js'), 'this must not ship');
    const first = await packageExtension(fixture, path.join(fixture, 'first'));
    const second = await packageExtension(fixture, path.join(fixture, 'second'));
    assert.deepEqual(await readFile(first), await readFile(second));
    const entries = execFileSync('unzip', ['-Z1', first], { encoding: 'utf8' }).trim().split('\n');
    assert.deepEqual(entries, packageFiles);
    const manifest = JSON.parse(execFileSync('unzip', ['-p', first, 'manifest.json'], { encoding: 'utf8' }));
    assert.equal(manifest.manifest_version, 3);
    const pkg = JSON.parse(await readFile(path.join(fixture, 'package.json'), 'utf8'));
    pkg.version = '0.0.1';
    await writeFile(path.join(fixture, 'package.json'), JSON.stringify(pkg));
    await assert.rejects(packageExtension(fixture), /matching manifest\/package versions/);
  } finally { await rm(fixture, { recursive: true, force: true }); }
});
