import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const root = path.resolve(import.meta.dirname, '..');
export const packageFiles = [
  'manifest.json', 'background.js', 'content.js', 'popup.html', 'popup.css',
  'popup.js', 'settings.js', 'sizes.js',
  ...[16, 32, 48, 128].map(size => `icons/icon-${size}.png`),
];

export async function packageExtension(directory = root, output = path.join(directory, 'dist')) {
  const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
  const pkg = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
  if (manifest.manifest_version !== 3 || manifest.version !== pkg.version) {
    throw new Error('Manifest V3 and matching manifest/package versions are required.');
  }
  const parts = manifest.version.split('.');
  if (!/^\d+(\.\d+){0,3}$/.test(manifest.version) || parts.some(p => Number(p) > 65535 || (p.length > 1 && p[0] === '0')) || parts.every(p => Number(p) === 0)) {
    throw new Error('Invalid Chrome extension version.');
  }
  if (!manifest.description || manifest.description.length > 132) throw new Error('Invalid store description length.');
  const staging = await mkdtemp(path.join(tmpdir(), 'image-file-size-package-'));
  try {
    for (const file of packageFiles) {
      const destination = path.join(staging, file);
      await mkdir(path.dirname(destination), { recursive: true });
      await copyFile(path.join(directory, file), destination);
      // Stable ZIP metadata; no checkout timestamps or unrelated files enter the archive.
      await utimes(destination, new Date('2000-01-01T00:00:00Z'), new Date('2000-01-01T00:00:00Z'));
    }
    for (const size of [16, 32, 48, 128]) {
      const file = `icons/icon-${size}.png`;
      const png = await readFile(path.join(staging, file));
      if (manifest.icons?.[size] !== file || !png.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) || png.readUInt32BE(16) !== size || png.readUInt32BE(20) !== size) {
        throw new Error(`Invalid ${size}px extension icon.`);
      }
    }
    const archive = path.join(staging, 'extension.zip');
    execFileSync('zip', ['-X', '-q', archive, ...packageFiles], { cwd: staging, env: { ...process.env, TZ: 'UTC' } });
    await mkdir(output, { recursive: true });
    const destination = path.join(output, `image-file-size-${manifest.version}.zip`);
    const bytes = await readFile(archive);
    await copyFile(archive, destination);
    await writeFile(`${destination}.sha256`, `${createHash('sha256').update(bytes).digest('hex')}  ${path.basename(destination)}\n`);
    return destination;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  console.log(await packageExtension());
}
