// Assembles the deployable website: site/ (landing page, play page, PWA files) + dist/index.html (the game)
// into site-dist/. Also writes a zip for itch.io / Newgrounds / GameJolt style uploads and a Steam-ready
// Electron folder. Run after `npm run build`:   node tools/build-site.mjs
import { cpSync, mkdirSync, rmSync, existsSync, writeFileSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const out = join(root, 'site-dist');
const game = join(root, 'dist', 'index.html');
if (!existsSync(game)) { console.error('dist/index.html missing - run `npm run build` first'); process.exit(1); }

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'game'), { recursive: true });
cpSync(join(root, 'site'), out, { recursive: true });
cpSync(game, join(out, 'game', 'index.html'));
// the split build's code/font assets live next to index.html (browser caches them between deploys)
if (existsSync(join(root, 'dist', 'assets'))) cpSync(join(root, 'dist', 'assets'), join(out, 'game', 'assets'), { recursive: true });

// The ambient soundtrack lives in ../music (outside the build tree). The game fetches
// music/<track>.mp3 relative to its own page, so every deployable copy needs the files
// next to its game index.html — copy them into the site and the portal zip.
// Prefer the soundtrack inside the build tree (music/), else the repository root next to it (../music),
// else build without tracks (the game then falls back to procedural ambience).
const musicDir = [join(root, 'music'), join(root, '..', 'music')].find((p) => existsSync(p));
if (musicDir) {
  mkdirSync(join(out, 'game', 'music'), { recursive: true });
  for (const f of readdirSync(musicDir).filter((f) => f.toLowerCase().endsWith('.mp3'))) cpSync(join(musicDir, f), join(out, 'game', 'music', f));
}

// itch.io / web-portal zip: index.html must be at the zip root, so the play page becomes index.html there.
const portal = join(root, 'dist', 'fable-web-portal');
rmSync(portal, { recursive: true, force: true });
mkdirSync(portal, { recursive: true });
cpSync(game, join(portal, 'index.html'));
if (existsSync(join(root, 'dist', 'assets'))) cpSync(join(root, 'dist', 'assets'), join(portal, 'assets'), { recursive: true });
if (existsSync(musicDir)) {
  for (const f of readdirSync(musicDir).filter((f) => f.toLowerCase().endsWith('.mp3'))) {
    mkdirSync(join(portal, 'music'), { recursive: true });
    cpSync(join(musicDir, f), join(portal, 'music', f));
  }
}
execSync(`cd "${portal}" && rm -f ../fable-web-portal.zip && zip -q -9 -r ../fable-web-portal.zip index.html assets ${musicDir ? 'music' : ''}`);

// full site zip (for any static host: unzip and upload)
execSync(`cd "${out}" && rm -f ../dist/fable-site.zip && zip -q -9 -r ../dist/fable-site.zip .`);

const kb = (p) => Math.round(statSync(p).size / 1024) + ' KB';
console.log('site-dist/            ready to deploy (' + kb(join(out, 'game', 'index.html')) + ' game bundle)');
console.log('dist/fable-web-portal.zip  ' + kb(join(root, 'dist', 'fable-web-portal.zip')) + '  <- itch.io "HTML" upload / Newgrounds / GameJolt');
console.log('dist/fable-site.zip        ' + kb(join(root, 'dist', 'fable-site.zip')) + '  <- any static host (Netlify drop, cPanel, S3)');
