/**
 * Generate Expected Files Manifest
 *
 * Scans dist/ for .js files and writes them to dist/data/expected-files.txt.
 * Can run once (default) or watch for changes.
 *
 * Usage:
 *   node build/gen-manifest.js           # One-shot
 *   node build/gen-manifest.js --watch   # Watch mode
 */
const fs = require('node:fs');
const path = require('node:path');
const fg = require('fast-glob');
const chokidar = require('chokidar');
const { dist } = require('./config');

const SKIP_PREFIXES = ['data/', 'cache/'];
const MANIFEST_PATH = path.join(dist, 'data', 'expected-files.txt');

async function generateManifest() {
  const files = await fg(`${dist}/**/*.js`);
  const relative = files
    .map(f => path.relative(dist, f).replace(/\\/g, '/'))
    .filter(f => !SKIP_PREFIXES.some(prefix => f.startsWith(prefix)))
    .sort();

  // Ensure data/ directory exists
  const dataDir = path.join(dist, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  fs.writeFileSync(MANIFEST_PATH, relative.join('\n') + '\n');
  console.log(`manifest: ${relative.length} files -> ${MANIFEST_PATH}`);
}

const watchMode = process.argv.includes('--watch');

// Always generate once at startup
generateManifest().then(() => {
  if (watchMode) {
    console.log('manifest: watching for .js file changes...');
    let debounce = null;
    chokidar.watch(`${dist}/**/*.js`, {
      ignoreInitial: true,
      ignored: MANIFEST_PATH,
    }).on('all', (event) => {
      if (event === 'add' || event === 'unlink') {
        clearTimeout(debounce);
        debounce = setTimeout(generateManifest, 500);
      }
    });
  }
});
