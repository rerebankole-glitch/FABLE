// Publish the built site into this repository's branch-root GitHub Pages source.
// Run from the source package with `npm run publish:pages` after the build succeeds.
import { cpSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const sourceRoot = new URL('..', import.meta.url).pathname;
const repoRoot = join(sourceRoot, '..');
const builtSite = join(sourceRoot, 'site-dist');

if (!existsSync(join(builtSite, 'index.html')) || !existsSync(join(builtSite, 'game', 'index.html'))) {
  throw new Error('site-dist is missing the built landing page or game; run `npm run build:site` first');
}
const builtWorker = join(builtSite, 'sw.js');
if (!existsSync(builtWorker)) throw new Error('site-dist/sw.js is missing');

// Keep a copy of the complete deployment directory for manual hosting/downloads too.
const archivedSite = join(repoRoot, 'site-dist');
rmSync(archivedSite, { recursive: true, force: true });
cpSync(builtSite, archivedSite, { recursive: true });

// GitHub Pages is configured to publish the repository root on main. Replace only generated public
// output; preserve source/, music/, packages, reports and other repository files.
for (const name of ['assets', 'game']) rmSync(join(repoRoot, name), { recursive: true, force: true });
for (const name of readdirSync(builtSite)) {
  cpSync(join(builtSite, name), join(repoRoot, name), { recursive: true, force: true });
}

console.log(`Published ${readdirSync(builtSite).length} site entries into the GitHub Pages branch root.`);
console.log('GitHub Pages will update after this branch is merged into main and its Pages deployment succeeds.');
