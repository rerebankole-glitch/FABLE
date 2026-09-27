// Decode a PNG (8-bit RGB/RGBA/palette/grayscale) and print pixel analysis helpers.
// Usage: node tools/pngdump.mjs file.png [x y w h]  -> ASCII art + unique colors
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import zlib from 'node:zlib';

export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not png');
  let pos = 8, w = 0, h = 0, depth = 0, ctype = 0;
  const idat = [];
  let plte = null;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; ctype = data[9]; }
    else if (type === 'PLTE') plte = data;
    else if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const ch = ctype === 6 ? 4 : ctype === 2 ? 3 : ctype === 3 ? 1 : ctype === 0 ? 1 : 2;
  const stride = w * ch;
  const out = Buffer.alloc(w * h * 4);
  const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = Buffer.from(line);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0;
      if (f === 1) cur[x] = (cur[x] + a) & 255;
      else if (f === 2) cur[x] = (cur[x] + b) & 255;
      else if (f === 3) cur[x] = (cur[x] + ((a + b) >> 1)) & 255;
      else if (f === 4) cur[x] = (cur[x] + paeth(a, b, c)) & 255;
    }
    for (let x = 0; x < w; x++) {
      const i = x * ch;
      if (ctype === 6) out.set([cur[i], cur[i + 1], cur[i + 2], cur[i + 3]], (y * w + x) * 4);
      else if (ctype === 2) out.set([cur[i], cur[i + 1], cur[i + 2], 255], (y * w + x) * 4);
      else if (ctype === 0) out.set([cur[i], cur[i], cur[i], 255], (y * w + x) * 4);
      else if (ctype === 3) { const pi = cur[i] * 3; out.set([plte[pi], plte[pi + 1], plte[pi + 2], 255], (y * w + x) * 4); }
      else if (ctype === 4) { const g = cur[i]; out.set([g, g, g, cur[i + 1]], (y * w + x) * 4); }
    }
    prev = cur;
  }
  return { w, h, px: (x, y) => { const i = (y * w + x) * 4; return [out[i], out[i + 1], out[i + 2], out[i + 3]]; } };
}

function region(px, x0, y0, x1, y1) {
  const cols = new Map();
  const keys = [];
  const k = (c) => { const s = c.join(','); if (!cols.has(s)) { cols.set(s, String.fromCharCode(97 + keys.length)); keys.push(c); } return cols.get(s); };
  let out = '';
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const c = px(x, y);
      if (c[3] < 128) { out += '.'; continue; }
      out += k(c);
    }
    out += '\n';
  }
  out += '\ncolors:\n' + keys.map((c, i) => `  ${String.fromCharCode(97 + i)} = rgb(${c[0]},${c[1]},${c[2]}) a${c[3]}`).join('\n');
  return out;
}

function main() {
  const [, , file, ...args] = process.argv;
  const { w, h, px } = decodePng(readFileSync(file));
  if (args.length >= 4) {
    console.log(`file ${file} ${w}x${h}`);
    console.log(region(px, +args[0], +args[1], +args[0] + +args[2], +args[1] + +args[3]));
  } else {
    for (let y0 = 0; y0 < 18; y0 += 9) {
      let line = '';
      for (let x0 = 0; x0 < 256; x0 += 9) line += region(px, x0, y0, Math.min(256, x0 + 9), y0 + 9).split('\n').slice(0, 9).map((r) => r[0]).join('') + ' ';
      console.log(`row y=${y0}: ${line}`);
    }
  }
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
