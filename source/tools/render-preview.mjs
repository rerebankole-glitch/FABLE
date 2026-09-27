// Debug helper: renders built-in skin sheets/portraits to PNGs for visual inspection.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { builtinSkinPixels, builtinPortraitPixels, SKIN_PRESETS, SKIN_SHEET } from '../src/game/core/Skins';

// minimal PNG encoder (RGBA)
const crcTable = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
export function png(rgba, w, h) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function upscale(buf, w, h, s) {
  const out = new Uint8ClampedArray(w * s * h * s * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const src = (y * w + x) * 4;
    for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) {
      const d = ((y * s + dy) * w * s + (x * s + dx)) * 4;
      for (let c = 0; c < 4; c++) out[d + c] = buf[src + c];
    }
  }
  return out;
}

mkdirSync('dist/preview', { recursive: true });
// checkerboard behind transparent pixels
function withChecker(buf, w, h) {
  const out = new Uint8ClampedArray(buf);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (out[i + 3] < 255) {
      const t = ((x >> 3) + (y >> 3)) & 1 ? 200 : 120;
      const a = out[i + 3] / 255;
      out[i] = out[i] * a + t * (1 - a); out[i + 1] = out[i + 1] * a + t * (1 - a); out[i + 2] = out[i + 2] * a + t * (1 - a); out[i + 3] = 255;
    }
  }
  return out;
}

const only = process.argv.slice(2);
for (const p of SKIN_PRESETS) {
  if (only.length && !only.includes(p.id)) continue;
  const sheet = builtinSkinPixels(p);
  const s2 = upscale(withChecker(sheet, 64, 64), 64, 64, 6); writeFileSync(`dist/preview/${p.id}-sheet.png`, png(s2, 384, 384));
  const portrait = builtinPortraitPixels(p);
  const p2 = upscale(withChecker(portrait, 16, 32), 16, 32, 12); writeFileSync(`dist/preview/${p.id}-portrait.png`, png(p2, 192, 384));
  console.log('wrote', p.id);
}
