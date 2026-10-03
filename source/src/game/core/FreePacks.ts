/**
 * Free resource packs, built in the browser and installed through the normal resource-pack loader.
 *
 * Each pack is generated as a *complete* Minecraft-format texture zip — every block and item texture
 * the world shows, painted by the pack's own artist (see blocks/packArtists.ts) — so installing one
 * re-skins the whole world instead of leaving a patchwork of two art styles. The zip is encoded
 * in-process (no canvas, no network) and handed straight to loadResourcePack, which means a free
 * pack behaves exactly like an imported one: live atlas re-skin, item icons, IndexedDB persistence.
 *
 * Textures are written under the *vanilla* names the loader already looks for (TILE_MAP/ITEM_MAP),
 * so a pack cannot silently miss: the two tables are the same ones the loader matches against.
 */
import { zipSync, zlibSync } from 'fflate';
import { loadResourcePack, TILE_MAP, ITEM_MAP, type PackResult } from './ResourcePacks';
import { getArtist, paintPackTile, paintPackIcon } from '../blocks/packArt';
import '../blocks/packArtists'; // registers the three pack artists

export interface FreePack {
  id: string;
  name: string;
  desc: string;
  tags: string[];
  accent: string;
  seed: number;
  /** painted block textures / item icons (filled in from the artist below) */
  tiles: number;
  items: number;
  /** tile names used for the storefront preview strip */
  preview: string[];
}

interface PackMeta {
  id: string;
  name: string;
  desc: string;
  tags: string[];
  accent: string;
  seed: number;
}

const META: PackMeta[] = [
  {
    id: 'mossweave',
    name: 'Mossweave',
    desc:
      'A hand-laid, overgrown world: boulders with moss creeping along every crack, deep loam, weathered ' +
      'timber and a dense canopy. Covers all 63 block textures and 24 item icons.',
    tags: ['Nature', 'Blocks + items'],
    accent: '#4f8f4f',
    seed: 11,
  },
  {
    id: 'gilded_ores',
    name: 'Gilded Ores',
    desc:
      'The miner\'s pack: cool speckled granite, chunky faceted gems with occlusion shadows and sparkle, ' +
      'warm honey timber. Veins read from across a cavern. Covers all 63 block textures and 24 item icons.',
    tags: ['Ores', 'Utility', 'Blocks + items'],
    accent: '#e0b040',
    seed: 23,
  },
  {
    id: 'cloudsoft',
    name: 'Cloudsoft Pastels',
    desc:
      'A palette-knife building set: ordered-dither shading, rounded bevels, cream sandstone and pastel ' +
      'wool that stays cohesive in daylight. Covers all 63 block textures and 24 item icons.',
    tags: ['Building', 'Pastel', 'Blocks + items'],
    accent: '#c0557f',
    seed: 37,
  },
];

export const FREE_PACKS: FreePack[] = META.map((meta) => {
  const artist = getArtist(meta.id);
  return { ...meta, tiles: artist?.tiles.length ?? 0, items: artist?.items.length ?? 0, preview: artist?.preview ?? [] };
});

export function getFreePack(id: string): FreePack | undefined {
  return FREE_PACKS.find((p) => p.id === id);
}

// ---------------------------------------------------------------- PNG encoder
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + body.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, body.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(body, 8);
  dv.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)));
  return out;
}
/** Encode an RGBA buffer as a non-interlaced 8-bit PNG (filter 0 rows). */
export function encodePng(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): Uint8Array {
  const raw = new Uint8Array(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), row + 1);
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // colour type: RGBA
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlibSync(raw, { level: 9 })), chunk('IEND', new Uint8Array(0))];
  const total = parts.reduce((n, c) => n + c.length, 0);
  const png = new Uint8Array(total);
  let o = 0;
  for (const c of parts) { png.set(c, o); o += c.length; }
  return png;
}

// ---------------------------------------------------------------- pack building
/** Build the pack's zip entirely in-process: vanilla texture paths, FABLE's own pixel art. */
export function buildFreePackZip(pack: FreePack): Uint8Array {
  const entries: Record<string, Uint8Array> = {
    'pack.mcmeta': new TextEncoder().encode(
      JSON.stringify({ pack: { pack_format: 9, description: `${pack.name} — free FABLE marketplace pack (${pack.tiles} block + ${pack.items} item textures)` } })
    ),
  };
  const artist = getArtist(pack.id);
  if (!artist) return zipSync(entries);
  for (const tile of artist.tiles) {
    const px = paintPackTile(pack.id, tile, pack.seed);
    if (!px) continue;
    const name = TILE_MAP[tile]?.[0] ?? tile;
    entries[`assets/minecraft/textures/block/${name}.png`] = encodePng(px, 16, 16);
  }
  for (const item of artist.items) {
    const px = paintPackIcon(pack.id, item, pack.seed);
    if (!px) continue;
    const name = ITEM_MAP[item]?.[0] ?? item;
    entries[`assets/minecraft/textures/item/${name}.png`] = encodePng(px, 16, 16);
  }
  return zipSync(entries, { level: 9 });
}

/** Materialize the pack as a downloadable File (for "Save .zip"). */
export function freePackFile(pack: FreePack): File {
  const zip = buildFreePackZip(pack);
  return new File([zip.slice().buffer as ArrayBuffer], `fable-${pack.id}-pack.zip`, { type: 'application/zip' });
}

/** Build + install the pack through the normal loader (persists in IndexedDB like imported packs). */
export async function installFreePack(pack: FreePack): Promise<PackResult> {
  const file = freePackFile(pack);
  return loadResourcePack(file);
}
