// MapLibre's worker script (maplibre-gl-worker.mjs) does a relative
// `import "./maplibre-gl-shared.mjs"` internally. Turbopack's static-asset
// bundling (new URL(..., import.meta.url)) fingerprints one referenced file at a
// time and doesn't rewrite that internal relative import, so the worker's own
// import 404s once it's served from a hashed /_next/static/media/ path.
// Serving both files verbatim from public/ instead keeps them side-by-side, so
// the relative import resolves correctly. Re-run on every `npm install`
// (wired as postinstall) so this stays in sync with the installed maplibre-gl
// version automatically instead of silently going stale on a version bump.
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(root, '..', 'node_modules', 'maplibre-gl', 'dist');
const destDir = path.join(root, '..', 'public', 'maplibre');

const files = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'];

if (!existsSync(srcDir)) {
  console.warn('[copy-maplibre-worker] maplibre-gl not installed yet, skipping.');
  process.exit(0);
}

mkdirSync(destDir, { recursive: true });
for (const file of files) {
  copyFileSync(path.join(srcDir, file), path.join(destDir, file));
}
console.log(`[copy-maplibre-worker] copied ${files.join(', ')} to public/maplibre/`);
