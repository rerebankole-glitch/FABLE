// Renders each pack's tiles repeated 3x3 so seam/pattern problems are visible:
//   npx esbuild tests/tile-tiling.ts --bundle --platform=node --format=esm --outfile=dist/tile-tiling.mjs --log-level=error --external:@napi-rs/canvas && node dist/tile-tiling.mjs
import { createCanvas } from '@napi-rs/canvas';
import { writeFileSync } from 'node:fs';
import { paintPackTile } from '../src/game/blocks/packArt';
import '../src/game/blocks/packArtists';

const K = 4, REP = 3, TILE = 16 * K;
const SHOW = ['stone', 'dirt', 'oak_planks', 'cobblestone', 'grass_side', 'sand'];
const packs = ['mossweave', 'gilded_ores', 'cloudsoft'];
const cols = SHOW.length;
const W = cols * TILE * REP + 16, H = packs.length * (TILE * REP + 26) + 16;
const out = createCanvas(W, H);
const g = out.getContext('2d');
g.imageSmoothingEnabled = false;
g.fillStyle = '#12141c'; g.fillRect(0, 0, W, H);
packs.forEach((pack, pi) => {
  const y0 = 8 + pi * (TILE * REP + 26);
  SHOW.forEach((tile, ci) => {
    const px = paintPackTile(pack, tile, pi === 0 ? 11 : pi === 1 ? 23 : 37)!;
    const x0 = 8 + ci * TILE * REP;
    for (let ry = 0; ry < REP; ry++) for (let rx = 0; rx < REP; rx++) {
      for (let y = 0; y < 16 * K; y++) for (let x = 0; x < 16 * K; x++) {
        const si = ((Math.floor(y / K) * 16) + Math.floor(x / K)) * 4;
        const a = px[si + 3];
        if (!a) continue;
        g.fillStyle = `rgba(${px[si]},${px[si + 1]},${px[si + 2]},${a / 255})`;
        g.fillRect(x0 + rx * TILE + x, y0 + ry * TILE + y, 1, 1);
      }
    }
  });
  g.fillStyle = '#57e08a'; g.font = 'bold 15px sans-serif';
  g.fillText(pack + ' — ' + SHOW.join(' · '), 8, y0 + TILE * REP + 19);
});
writeFileSync(process.env.TILING_PNG ?? '/tmp/tiling.png', out.toBuffer('image/png'));
console.log('wrote', process.env.TILING_PNG ?? '/tmp/tiling.png', W + 'x' + H);
