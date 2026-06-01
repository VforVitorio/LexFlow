/**
 * One-shot icon raster generator (#77).
 *
 * Reads the canonical SVG sources from `frontend/public/` and writes the
 * raster variants that browsers / OS shells still demand:
 *
 *   apple-touch-icon.svg   →  apple-touch-icon.png       (180×180)
 *   maskable-icon.svg      →  maskable-icon.png          (512×512)
 *   og-image.svg           →  og-image.png               (1200×630)
 *   favicon.svg            →  favicon-16.png, favicon-32.png, favicon-48.png
 *                              + bundled into favicon.ico via `to-ico`.
 *
 * The script is designed to run without a permanent devDependency on
 * `sharp` or `to-ico` — both are pulled in on-demand via npx:
 *
 *     npx -y -p sharp@^0.34 -p to-ico@^1.1 node scripts/gen-icons.mjs
 *
 * Re-run only when the SVG sources change. Output PNGs / .ico are
 * committed to the repo so production deploys don't need this script
 * (or sharp's native binaries) at build time.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const sharp = (await import('sharp')).default;
const toIco = (await import('to-ico')).default;

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(here, '..', 'public');

async function rasterise(svgFile, outFile, width, height = width) {
  const svg = await readFile(path.join(publicDir, svgFile));
  await sharp(svg, { density: 384 })
    .resize(width, height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(path.join(publicDir, outFile));
  console.log(`  ✓ ${outFile} (${width}×${height})`);
}

async function buildIco() {
  // Render the favicon SVG into three PNG buffers in-memory and pack them
  // into a single multi-resolution .ico. Older Windows still prefer .ico
  // even though modern browsers happily use favicon.svg.
  const svg = await readFile(path.join(publicDir, 'favicon.svg'));
  const sizes = [16, 32, 48];
  const buffers = await Promise.all(
    sizes.map((size) =>
      sharp(svg, { density: 384 })
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer(),
    ),
  );
  const ico = await toIco(buffers);
  await writeFile(path.join(publicDir, 'favicon.ico'), ico);
  console.log(`  ✓ favicon.ico (${sizes.join(', ')})`);
}

console.log('Generating raster icon variants…');
await rasterise('apple-touch-icon.svg', 'apple-touch-icon.png', 180);
await rasterise('maskable-icon.svg', 'maskable-icon.png', 512);
await rasterise('og-image.svg', 'og-image.png', 1200, 630);
await buildIco();
console.log('Done.');
