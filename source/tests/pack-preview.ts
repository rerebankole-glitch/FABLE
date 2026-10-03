// Renders every free pack's block tiles and item icons into a labelled review sheet so the art can
// be looked at without a browser:
//   node tools/pack-preview-build.mjs && node dist/pack-preview.mjs [packId]
import { createCanvas } from '@napi-rs/canvas';
import { writeFileSync } from 'node:fs';
import { artistIds, getArtist, paintPackTile, paintPackIcon } from '../src/game/blocks/packArt';
import '../src/game/blocks/packArtists'; // registers the packs

const K = 4;
const COLS = 10;
const TILE = 16 * K;
const LABEL = 18;
const only = process.argv[2];
const packs = artistIds().filter((id) => !only || id === only);

for (const id of packs) {
  const artist = getArtist(id)!;
  const tileRows = Math.ceil(artist.tiles.length / COLS);
  const itemRows = Math.ceil(artist.items.length / COLS);
  const W = COLS * TILE + 24;
  const H = 60 + tileRows * (TILE + LABEL) + 40 + itemRows * (TILE + LABEL) + 40;
  const out = createCanvas(W, H);
  const g = out.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#12141c';
  g.fillRect(0, 0, W, H);
  const label = (text: string, y: number, size = 20) => {
    g.fillStyle = '#57e08a';
    g.font = `bold ${size}px sans-serif`;
    g.fillText(text, 16, y);
  };
  const drawTile = (px: Uint8ClampedArray, x: number, y: number, name: string) => {
    for (let py = 0; py < 16; py++) for (let pxi = 0; pxi < 16; pxi++) {
      const i = (py * 16 + pxi) * 4;
      const a = px[i + 3];
      if (!a) { g.fillStyle = ((pxi >> 1) + (py >> 1)) % 2 ? '#2a2e3a' : '#22252f'; g.fillRect(x + pxi * K, y + py * K, K, K); continue; }
      g.fillStyle = `rgba(${px[i]},${px[i + 1]},${px[i + 2]},${a / 255})`;
      g.fillRect(x + pxi * K, y + py * K, K, K);
    }
    g.fillStyle = '#aab2c8';
    g.font = '12px sans-serif';
    g.fillText(name, x, y + TILE + 13);
  };

  label(`${id} — ${artist.tiles.length} block tiles`, 30);
  let idx = 0;
  for (const tile of artist.tiles) {
    const px = paintPackTile(id, tile, 7);
    if (!px) continue;
    const cx = 12 + (idx % COLS) * TILE;
    const cy = 50 + Math.floor(idx / COLS) * (TILE + LABEL);
    drawTile(px, cx, cy, tile);
    idx++;
  }
  let y = 50 + Math.ceil(idx / COLS) * (TILE + LABEL) + 30;
  label(`${id} — ${artist.items.length} item icons`, y);
  y += 20;
  idx = 0;
  for (const item of artist.items) {
    const px = paintPackIcon(id, item, 7);
    if (!px) continue;
    const cx = 12 + (idx % COLS) * TILE;
    const cy = y + Math.floor(idx / COLS) * (TILE + LABEL);
    drawTile(px, cx, cy, item);
    idx++;
  }
  const file = process.env.PACK_PNG ?? `/tmp/pack-${id}.png`;
  writeFileSync(file, out.toBuffer('image/png'));
  console.log('wrote', file, `${W}x${H}`);
}
