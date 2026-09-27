// Renders the procedural texture atlas to dist/atlas.png (scaled 4x) so it can be reviewed visually.
import { TextureAtlas } from '../src/game/blocks/TextureAtlas';
import { ATLAS_COLS, ATLAS_ROWS, TILE_PX, TILE_NAMES } from '../src/game/blocks/Tiles';
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const atlas = new TextureAtlas();
const SCALE = 4;
const W = ATLAS_COLS * TILE_PX * SCALE, H = Math.ceil(TILE_NAMES.length / ATLAS_COLS) * TILE_PX * SCALE;
const raw = Buffer.alloc((W * 4 + 1) * H);
for (let y = 0; y < H; y++) {
  raw[y * (W * 4 + 1)] = 0;
  for (let x = 0; x < W; x++) {
    const sx = Math.floor(x / SCALE), sy = Math.floor(y / SCALE);
    const col = Math.floor(sx / TILE_PX), row = Math.floor(sy / TILE_PX);
    const t = row * ATLAS_COLS + col;
    const o = y * (W * 4 + 1) + 1 + x * 4;
    if (t >= TILE_NAMES.length) { raw[o + 3] = 0; continue; }
    const tile = atlas.tiles[t];
    const i = ((sy % TILE_PX) * TILE_PX + (sx % TILE_PX)) * 4;
    const a = tile[i + 3];
    // checkerboard behind transparent pixels
    const bg = ((sx >> 2) + (sy >> 2)) % 2 ? 90 : 60;
    raw[o] = a ? tile[i] : bg; raw[o + 1] = a ? tile[i + 1] : bg; raw[o + 2] = a ? tile[i + 2] : bg + 20; raw[o + 3] = 255;
  }
}
const crc = (buf: Buffer) => { let c = ~0; for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
const chunk = (type: string, data: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
writeFileSync(process.argv[2] ?? 'dist/atlas.png', png);
console.log('wrote', process.argv[2] ?? 'dist/atlas.png', W + 'x' + H, ATLAS_ROWS);
