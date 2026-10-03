// Builds one review sheet combining the Keeper professions, the creature cast and the ore tiles:
//   node tools/art-sheet.mjs
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const run = (args, env = {}) => execFileSync(process.execPath, args, { env: { ...process.env, ...env }, stdio: 'pipe' });
run(['tools/mob-preview-build.mjs']);
// the atlas + its name map (tools/tile-crop.mjs needs dist/tilemap.json)
execFileSync('npx', ['esbuild', 'tests/atlas-preview.ts', '--bundle', '--platform=node', '--format=esm', '--outfile=dist/atlas.mjs', '--log-level=error'], { stdio: 'pipe' });
run(['dist/atlas.mjs']);
run(['tools/mob-preview.mjs', 'keeper:0', 'keeper:1', 'keeper:2'], { MOB_ZOOM: '1.25', MOB_SHEET: '/tmp/sheet-keepers.png' });
run(['tools/mob-preview.mjs', 'bovin', 'woolly', 'snouter', 'clucker', 'cave_crawler', 'night_stalker', 'stone_guardian', 'void_wyrm'], { MOB_ZOOM: '0.9', MOB_SHEET: '/tmp/sheet-mobs.png' });
run(['tools/tile-crop.mjs', 'coal_ore', 'copper_ore', 'iron_ore', 'gold_ore', 'ember_ore', 'crystal_ore', 'water', 'stone', 'oak_planks', 'grass_top'], { TILE_PNG: '/tmp/sheet-tiles.png' });

const [keepers, mobs, tiles] = await Promise.all(['/tmp/sheet-keepers.png', '/tmp/sheet-mobs.png', '/tmp/sheet-tiles.png'].map(loadImage));
const W = Math.max(keepers.width, mobs.width, tiles.width) + 48;
const H = 74 + keepers.height + mobs.height + tiles.height + 60;
const out = createCanvas(W, H);
const g = out.getContext('2d');
g.imageSmoothingEnabled = false;
g.fillStyle = '#0f1118';
g.fillRect(0, 0, W, H);
const label = (text, y, size = 20) => {
  g.fillStyle = '#57e08a';
  g.font = `bold ${size}px sans-serif`;
  g.fillText(text, 24, y);
  g.strokeStyle = 'rgba(255,255,255,.07)';
  g.beginPath(); g.moveTo(24, y + 10); g.lineTo(W - 24, y + 10); g.stroke();
};
let y = 40;
label('Keepers — farmer, smith, mystic (were: a recoloured humanoid)', y); y += 18;
g.drawImage(keepers, 24, y); y += keepers.height + 34;
label('Creatures — faces, hides and hooves instead of single-colour boxes', y); y += 18;
g.drawImage(mobs, 24, y); y += mobs.height + 34;
label('Ore veins with rim shading, and water that tiles', y); y += 18;
g.drawImage(tiles, 24, y);

writeFileSync(process.env.ART_SHEET || '/home/user/art-review.png', out.toBuffer('image/png'));
console.log('wrote', process.env.ART_SHEET || '/home/user/art-review.png');
