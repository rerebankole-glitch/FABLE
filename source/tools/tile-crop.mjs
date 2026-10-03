// Crop named atlas tiles out of the rendered atlas (needs @napi-rs/canvas):
//   npx esbuild tests/atlas-preview.ts --bundle --platform=node --format=esm --outfile=dist/atlas.mjs && node dist/atlas.mjs
//   node tools/tile-crop.mjs stone dirt gravel
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { writeFileSync, readFileSync } from 'node:fs';
const names = process.argv.slice(2);
const map = JSON.parse(readFileSync('dist/tilemap.json', 'utf8'));
const img = await loadImage('dist/atlas.png');
const TILE = 64, COLS = 16, K = 3;
const cols = Math.min(8, names.length);
const rows = Math.ceil(names.length / cols);
const out = createCanvas(cols * TILE * K, rows * (TILE * K + 20));
const g = out.getContext('2d');
g.imageSmoothingEnabled = false;
g.fillStyle = '#14161f'; g.fillRect(0, 0, out.width, out.height);
names.forEach((n, i) => {
  const t = map[n];
  const cx = (i % cols) * TILE * K, cy = Math.floor(i / cols) * (TILE * K + 20);
  if (t === undefined) { g.fillStyle = '#f66'; g.font = '12px sans-serif'; g.fillText('?' + n, cx + 6, cy + 20); return; }
  g.drawImage(img, (t % COLS) * TILE, Math.floor(t / COLS) * TILE, TILE, TILE, cx, cy, TILE * K, TILE * K);
  g.fillStyle = '#cfd6e6'; g.font = '13px sans-serif';
  g.fillText(`${n} (#${t})`, cx + 4, cy + TILE * K + 15);
});
writeFileSync(process.env.TILE_PNG || '/tmp/tiles.png', out.toBuffer('image/png'));
console.log('wrote', process.env.TILE_PNG || '/tmp/tiles.png', names.length, 'tiles');
