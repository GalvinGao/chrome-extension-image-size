// Optional authoring tool: requires rsvg-convert (librsvg). Not part of extension packaging.
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'docs/store/assets');
const photo = `data:image/webp;base64,${(await readFile(path.join(output, 'alpine-lake.webp'))).toString('base64')}`;
const icon = await readFile(path.join(root, 'icons/icon.svg'), 'utf8');
for (const size of [16, 32, 48, 128]) {
  const png = execFileSync('rsvg-convert', ['-w', String(size), '-h', String(size)], { input: icon });
  await writeFile(path.join(root, `icons/icon-${size}.png`), png);
}
function shell(width, height, content) {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#f1f2e7"/><g font-family="Arial, Helvetica, sans-serif" fill="#173e34">${content}</g></svg>`;
}
const small = shell(440, 280, `
  <defs><clipPath id="photo"><rect x="24" y="108" width="392" height="148" rx="14"/></clipPath></defs>
  ${icon.replace('<svg ', '<svg x="376" y="21" width="40" height="40" ')}
  <text x="24" y="52" font-size="28" font-weight="700" letter-spacing="-.8">Image File Size</text>
  <text x="25" y="78" font-size="14" fill="#50685a">No duplicate downloads.</text>
  <image x="24" y="108" width="392" height="148" preserveAspectRatio="xMidYMid slice" clip-path="url(#photo)" xlink:href="${photo}"/>
  <rect x="286" y="122" width="114" height="33" rx="7" fill="#173e34"/>
  <text x="343" y="144" text-anchor="middle" font-size="17" font-weight="600" fill="#fff">B · KB · MB</text>
`);
const marquee = shell(1400, 560, `
  <defs><clipPath id="photo"><rect x="710" y="36" width="654" height="488" rx="26"/></clipPath></defs>
  ${icon.replace('<svg ', '<svg x="62" y="60" width="66" height="66" ')}
  <text x="148" y="102" font-size="23" font-weight="600" letter-spacing=".2">Image File Size</text>
  <text x="64" y="240" font-size="72" font-weight="700" letter-spacing="-3">See the size.</text>
  <text x="64" y="320" font-size="72" font-weight="700" letter-spacing="-3">Keep the view.</text>
  <text x="68" y="400" font-size="24" fill="#50685a">Image weights, directly on the page.</text>
  <text x="68" y="438" font-size="24" fill="#50685a">No duplicate downloads.</text>
  <image x="710" y="36" width="654" height="488" preserveAspectRatio="xMidYMid slice" clip-path="url(#photo)" xlink:href="${photo}"/>
  <rect x="1080" y="63" width="253" height="76" rx="16" fill="#173e34"/>
  <text x="1206" y="113" text-anchor="middle" font-size="38" font-weight="600" fill="#fff">B · KB · MB</text>
`);
for (const [name, svg] of [['promo-small.png', small], ['promo-marquee.png', marquee]]) {
  await writeFile(path.join(output, name), execFileSync('rsvg-convert', [], { input: svg, maxBuffer: 8 * 1024 * 1024 }));
  console.log(name);
}
