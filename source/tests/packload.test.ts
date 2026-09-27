// End-to-end resource-pack load: drives the REAL loader (ResourcePacks.loadResourcePack) over a
// real pack zip and asserts textures actually land. Node has no canvas/createImageBitmap, so this
// shims just enough of both (backed by a small PNG decoder) for the loader's image path to run.
//
//   node tools/packload-build.mjs && node dist/packload.test.mjs [pack.zip]
import { unzlibSync, zlibSync } from 'fflate';
import { readFileSync, existsSync } from 'node:fs';

let pass = 0, fail = 0;
function ok(c: boolean, m: string): void {
  if (c) { pass++; } else { fail++; console.error('FAIL: ' + m); }
}

// ---------------------------------------------------------------- minimal PNG decode
/** Decode a non-interlaced PNG (8-bit RGB/RGBA/grey/palette) to RGBA pixels. */
function decodePng(bytes: Uint8Array): { width: number; height: number; data: Uint8Array } {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 8, width = 0, height = 0, depth = 8, color = 6;
  const idat: Uint8Array[] = [];
  let palette: Uint8Array | null = null, trns: Uint8Array | null = null;
  while (p < bytes.length) {
    const len = dv.getUint32(p); const type = String.fromCharCode(bytes[p + 4], bytes[p + 5], bytes[p + 6], bytes[p + 7]);
    const body = bytes.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { width = dv.getUint32(p + 8); height = dv.getUint32(p + 12); depth = bytes[p + 16]; color = bytes[p + 17]; }
    else if (type === 'PLTE') palette = body;
    else if (type === 'tRNS') trns = body;
    else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (depth !== 8) throw new Error('unsupported bit depth ' + depth);
  const total = idat.reduce((n, c) => n + c.length, 0);
  const z = new Uint8Array(total);
  let o = 0; for (const c of idat) { z.set(c, o); o += c.length; }
  const raw = unzlibSync(z);
  const ch = color === 6 ? 4 : color === 2 ? 3 : color === 4 ? 2 : 1;
  const stride = width * ch;
  const out = new Uint8Array(width * height * 4);
  const line = new Uint8Array(stride), prev = new Uint8Array(stride);
  let rp = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[rp++];
    line.set(raw.subarray(rp, rp + stride)); rp += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? line[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0;
      let v = line[i];
      if (filter === 1) v += a; else if (filter === 2) v += b; else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      line[i] = v & 255;
    }
    for (let x = 0; x < width; x++) {
      const s = x * ch, d = (y * width + x) * 4;
      if (color === 6) { out[d] = line[s]; out[d + 1] = line[s + 1]; out[d + 2] = line[s + 2]; out[d + 3] = line[s + 3]; }
      else if (color === 2) { out[d] = line[s]; out[d + 1] = line[s + 1]; out[d + 2] = line[s + 2]; out[d + 3] = 255; }
      else if (color === 4) { out[d] = out[d + 1] = out[d + 2] = line[s]; out[d + 3] = line[s + 1]; }
      else if (color === 3 && palette) { const pi = line[s] * 3; out[d] = palette[pi]; out[d + 1] = palette[pi + 1]; out[d + 2] = palette[pi + 2]; out[d + 3] = trns && line[s] < trns.length ? trns[line[s]] : 255; }
      else { out[d] = out[d + 1] = out[d + 2] = line[s]; out[d + 3] = 255; }
    }
    prev.set(line);
  }
  return { width, height, data: out };
}

// ---------------------------------------------------------------- DOM shim
interface Bitmap { width: number; height: number; data: Uint8Array }
{
  const g = globalThis as unknown as Record<string, unknown>;
  g.createImageBitmap = async (blob: { _bytes: Uint8Array }): Promise<Bitmap> => {
    const d = decodePng(blob._bytes);
    return { width: d.width, height: d.height, data: d.data };
  };
  class FakeBlob { _bytes: Uint8Array; constructor(parts: Uint8Array[]) { this._bytes = parts[0]; } }
  g.Blob = FakeBlob;
  class FakeFile extends FakeBlob { name: string; constructor(parts: Uint8Array[], name: string) { super(parts); this.name = name; } async arrayBuffer() { return this._bytes.buffer; } }
  g.File = FakeFile;
  // canvas shim: drawImage does nearest-neighbour scaling of the source rect, which is exactly what
  // the loader relies on (imageSmoothingEnabled = false)
  g.document = {
    createElement: () => {
      const cv = { width: 0, height: 0, _px: new Uint8Array(0), getContext: () => ctx, toDataURL: () => 'data:,' };
      const ctx = {
        imageSmoothingEnabled: false,
        drawImage(bmp: Bitmap, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number) {
          if (dw === undefined) { dx = sx; dy = sy; dw = bmp.width; dh = bmp.height; sx = 0; sy = 0; sw = bmp.width; sh = bmp.height; }
          cv._px = new Uint8Array(cv.width * cv.height * 4);
          for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
            const srcX = Math.min(bmp.width - 1, sx + Math.floor(x * sw / dw));
            const srcY = Math.min(bmp.height - 1, sy + Math.floor(y * sh / dh));
            const s = (srcY * bmp.width + srcX) * 4, d = ((dy + y) * cv.width + dx + x) * 4;
            if (d + 3 < cv._px.length) { cv._px[d] = bmp.data[s]; cv._px[d + 1] = bmp.data[s + 1]; cv._px[d + 2] = bmp.data[s + 2]; cv._px[d + 3] = bmp.data[s + 3]; }
          }
        },
        getImageData: (x: number, y: number, w: number, h: number) => ({ data: cv._px.length ? cv._px : new Uint8Array(w * h * 4), width: w, height: h }),
        putImageData: (img: { data: Uint8Array }) => { cv._px = img.data; },
        fillRect: () => undefined, fillText: () => undefined, clearRect: () => undefined,
        save: () => undefined, restore: () => undefined, scale: () => undefined, translate: () => undefined,
        createImageData: (w: number, h: number) => ({ data: new Uint8Array(w * h * 4), width: w, height: h }),
        measureText: () => ({ width: 8 }),
        set fillStyle(_v: string) { /* ignored */ },
      };
      return cv;
    },
    createElementNS: () => ({ style: {} }),
    documentElement: { style: { setProperty: () => undefined }, classList: { toggle: () => undefined } },
  };
  g.window = { devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720, addEventListener: () => undefined, matchMedia: () => ({ matches: false, addEventListener: () => undefined }) };
  g.localStorage = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
  g.indexedDB = undefined; // persistence is skipped in the harness (idb() resolves null)
}

// imports must come after the shim so module-level canvas work succeeds
const { loadResourcePack, clearResourcePack, packCounts } = await import('../src/game/core/ResourcePacks');
const { entityPalette, ENTITY_MAP } = await import('../src/game/core/PackEntities');

const zipPath = process.argv[2] ?? '/home/user/FABLE/FreshAnimations_v1.10.5.zip';
if (!existsSync(zipPath)) { console.error('pack zip not found: ' + zipPath); process.exit(1); }
const bytes = new Uint8Array(readFileSync(zipPath));
const FileCtor = (globalThis as unknown as { File: new (p: Uint8Array[], n: string) => File }).File;

console.log('=== loading ' + zipPath.split('/').pop());
const res = await loadResourcePack(new FileCtor([bytes], 'FreshAnimations_v1.10.5.zip'));
console.log(`  -> ${res.tiles} block textures, ${res.items} item textures, ${res.mobs} mob skins`);

ok(res.mobs > 0, 'entity-only pack produced no mob skins (it used to throw "No compatible textures")');
ok(res.mobs >= 8, `expected most mobs mapped, got ${res.mobs}/${Object.keys(ENTITY_MAP).length}`);

for (const type of Object.keys(ENTITY_MAP)) {
  const p = entityPalette(type);
  if (!p) { console.log(`  (no skin for ${type})`); continue; }
  const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
  console.log(`  ${type.padEnd(15)} head ${hex(p.head)}  body ${hex(p.body)}  legs ${hex(p.legs)}`);
  ok(p.body >= 0 && p.body <= 0xffffff, `${type}: body colour out of range`);
  ok(!(p.head === 0 && p.body === 0 && p.legs === 0), `${type}: palette is all black (decode failed?)`);
}

// the palettes must differ between creatures — a bug that averaged the whole atlas would make them equal
const cow = entityPalette('bovin'), sheep = entityPalette('woolly');
if (cow && sheep) ok(cow.body !== sheep.body, 'bovin and woolly got identical body colours');

// clearing restores the built-in look
await clearResourcePack();
ok(packCounts().mobs === 0, 'clearResourcePack left mob palettes behind');
ok(entityPalette('bovin') === undefined, 'palette survived a pack clear');

/** Build a real solid-colour PNG (used to synthesise test packs). */
function solidPng(r: number, g: number, b: number, size: number): Uint8Array {
  // build a real PNG: IHDR + IDAT (zlib) + IEND, 8-bit RGBA, one filter byte per row
  const raw = new Uint8Array(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = 255;
    }
  }
  const idat = zlibSync(raw);
  const crcT: number[] = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = (b: Uint8Array): number => { let c = 0xffffffff; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, body: Uint8Array): Uint8Array => {
    const out = new Uint8Array(12 + body.length);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, body.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(body, 8);
    dv.setUint32(8 + body.length, crc(out.subarray(4, 8 + body.length)));
    return out;
  };
  const ihdr = new Uint8Array(13);
  new DataView(ihdr.buffer).setUint32(0, size); new DataView(ihdr.buffer).setUint32(4, size);
  ihdr[8] = 8; ihdr[9] = 6;
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', new Uint8Array(0))];
  const total = parts.reduce((n, c) => n + c.length, 0);
  const png = new Uint8Array(total);
  let o = 0; for (const c of parts) { png.set(c, o); o += c.length; }
  return png;
}

// ---------------------------------------------------------------- synthetic block/item pack
// Proves the block/item path still works, and covers the two layout fixes: legacy `blocks`/`items`
// folder names, and a pack nested in a subfolder inside the zip (both used to resolve to nothing).
{
  const { zipSync } = await import('fflate');
  const zipped = zipSync({
    'pack.mcmeta': new TextEncoder().encode('{"pack":{"pack_format":22}}'),
    // legacy folder names, nested one level deep, and a 64x HD texture
    'MyPack/assets/minecraft/textures/blocks/stone.png': solidPng(200, 10, 10, 64),
    'MyPack/assets/minecraft/textures/items/stick.png': solidPng(10, 200, 10, 32),
  });
  console.log('\n=== loading synthetic legacy/nested/HD pack');
  const r2 = await loadResourcePack(new FileCtor([zipped], 'legacy.zip'));
  console.log(`  -> ${r2.tiles} block textures, ${r2.items} item textures, ${r2.mobs} mob skins`);
  ok(r2.tiles > 0, 'legacy `blocks/` folder in a nested subfolder resolved no block textures');
  ok(r2.items > 0, 'legacy `items/` folder resolved no item textures');
  await clearResourcePack();
}

// ---------------------------------------------------------------- coverage against a vanilla-named pack
// Build a pack that supplies EVERY vanilla texture name FABLE's tables ask for, plus the plain
// names of each tile, and assert the loader resolves the overwhelming majority. This is the
// "will real packs work?" measurement, not a hand-picked sample.
{
  const { zipSync } = await import('fflate');
  const { TILE_MAP, ITEM_MAP } = await import('../src/game/core/ResourcePacks');
  const { TILE_NAMES } = await import('../src/game/blocks/Tiles');
  const { ITEMS } = await import('../src/game/items/Items');
  const files: Record<string, Uint8Array> = { 'pack.mcmeta': new TextEncoder().encode('{"pack":{"pack_format":22}}') };
  const png = solidPng(120, 140, 160, 16);
  for (const cands of Object.values(TILE_MAP)) for (const c of cands) files[`assets/minecraft/textures/block/${c}.png`] = png;
  for (const cands of Object.values(ITEM_MAP)) for (const c of cands) files[`assets/minecraft/textures/item/${c}.png`] = png;
  console.log('\n=== loading a full vanilla-named pack');
  const r3 = await loadResourcePack(new FileCtor([zipSync(files)], 'vanilla-like.zip'));
  // Some tiles are engine-internal and can never come from a pack: the 10 destroy-stage crack
  // overlays, the blank `white` tile, and the sun/moon/portal sky art. Coverage is measured
  // against the tiles a pack could actually supply.
  const INTERNAL = new Set(['white', 'sun', 'moon', 'portal', ...Array.from({ length: 10 }, (_, i) => `crack_${i}`)]);
  const packable = (TILE_NAMES as readonly string[]).filter((t) => !INTERNAL.has(t)).length;
  const tilePct = Math.round(r3.tiles / packable * 100);
  const itemPct = Math.round(r3.items / ITEMS.size * 100);
  console.log(`  -> ${r3.tiles}/${packable} packable tiles (${tilePct}%), ${r3.items}/${ITEMS.size} items (${itemPct}%)`);
  ok(tilePct >= 85, `world texture coverage is only ${tilePct}% — most of the world would keep built-in art`);
  ok(r3.tiles >= Object.keys(TILE_MAP).length, `resolved ${r3.tiles} tiles, expected at least the ${Object.keys(TILE_MAP).length} mapped ones`);
  ok(r3.items >= Object.keys(ITEM_MAP).length, `resolved ${r3.items} items, expected at least the ${Object.keys(ITEM_MAP).length} mapped ones`);
  await clearResourcePack();
}

// ---------------------------------------------------------------- END-TO-END ATLAS PROOF
// Everything above proves textures are RESOLVED (counts). This proves they are actually APPLIED:
// a one-texture pack is built, loaded, and the real atlas buffer the renderer uploads to the GPU
// is read back to confirm the stone tile's pixels genuinely changed -- and that clearing the pack
// restores the built-in art. Without this, a loader that counted matches but never touched the
// atlas would still pass the suite.
{
  const { zipSync } = await import('fflate');
  const { getAtlas } = await import('../src/game/blocks/TextureAtlas');
  const { T } = await import('../src/game/blocks/Tiles');

  /** Mean RGB of a tile, read straight from the atlas buffer the chunk shader samples. */
  const tileRgb = (tile: number): [number, number, number] => {
    const buf = getAtlas().tiles[tile];
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < buf.length; i += 4) {
      if (buf[i + 3] === 0) continue;
      r += buf[i]; g += buf[i + 1]; b += buf[i + 2]; n++;
    }
    return n ? [Math.round(r / n), Math.round(g / n), Math.round(b / n)] : [0, 0, 0];
  };

  console.log('\n=== end-to-end: does one overridden texture actually reach the atlas?');
  const before = tileRgb(T.stone);
  console.log(`  stone tile before: rgb(${before})`);

  // a real pack containing exactly ONE texture: unmistakable magenta
  const one = zipSync({
    'pack.mcmeta': new TextEncoder().encode('{"pack":{"pack_format":22,"description":"FABLE atlas proof"}}'),
    'assets/minecraft/textures/block/stone.png': solidPng(255, 0, 255, 16),
  });
  const rp = await loadResourcePack(new FileCtor([one], 'atlas-proof.zip'));
  const after = tileRgb(T.stone);
  console.log(`  stone tile after : rgb(${after})  (loader reported ${rp.tiles} tile(s))`);

  ok(rp.tiles >= 1, `one-texture pack resolved ${rp.tiles} tiles, expected at least 1`);
  ok(after.join() !== before.join(), 'the stone tile did not change at all — the pack never reached the atlas');
  ok(after[0] > 200 && after[1] < 60 && after[2] > 200, `stone should now be the pack's magenta, got rgb(${after})`);

  await clearResourcePack();
  const restored = tileRgb(T.stone);
  console.log(`  stone tile after clearing the pack: rgb(${restored})`);
  ok(restored.join() === before.join(), `clearing the pack did not restore the built-in texture (rgb(${restored}) vs rgb(${before}))`);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
