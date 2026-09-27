/** Free resource packs, built right here in the browser. Each pack is a small, genuine Minecraft-format
 *  texture zip (assets/minecraft/textures/block|item/*.png + pack.mcmeta) generated procedurally and fed
 *  straight into the regular resource-pack loader, so it behaves exactly like an imported pack: live atlas
 *  re-skin, item icons, IndexedDB persistence. Nothing is downloaded from the network and nothing costs
 *  coins — these are free community-style extras shipped with the Marketplace. */
import { zipSync } from 'fflate';
import { loadResourcePack, type PackResult } from './ResourcePacks';

type RGB = [number, number, number];
const hex = (h: string): RGB => {
  const v = parseInt(h.startsWith('#') ? h.slice(1) : h, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};
/** tiny deterministic PRNG so a pack always renders the same art */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const mix = (a: RGB, b: RGB, t: number): RGB => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];

interface Paint { (px: (x: number, y: number, c: RGB) => void, r: () => number): void }

/** speckled stone-like base */
const stoneArt = (base: string, dark: string, light: string): Paint => (px, r) => {
  const B = hex(base), D = hex(dark), L = hex(light);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const n = r();
    px(x, y, n < 0.18 ? D : n > 0.86 ? L : mix(B, D, r() * 0.35));
  }
};
/** plank rows with grain + seams */
const plankArt = (base: string, seam: string): Paint => (px, r) => {
  const B = hex(base), S = hex(seam);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const row = y >> 2;
    const seamX = (row * 7 + 3) % 16;
    if (y % 4 === 3 || x === seamX) { px(x, y, S); continue; }
    px(x, y, mix(B, S, r() < 0.12 ? 0.5 : r() * 0.18));
  }
};
/** ore: stone base with a gem cluster */
const oreArt = (base: string, gem: string, glow: string): Paint => (px, r) => {
  stoneArt(base, '#20242c', '#6a707c')(px, r);
  const G = hex(gem), W = hex(glow);
  const spots: [number, number][] = [[3, 3], [4, 4], [10, 3], [11, 4], [4, 10], [3, 11], [10, 11], [11, 10], [7, 7], [8, 8]];
  for (const [x, y] of spots) { px(x, y, G); }
  px(4, 3, W); px(11, 3, W); px(3, 10, W); px(10, 11, W); px(7, 7, W);
};
/** leafy texture with holes-free dense clusters */
const leafArt = (base: string, dark: string, light: string): Paint => (px, r) => {
  const B = hex(base), D = hex(dark), L = hex(light);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const n = r();
    px(x, y, n < 0.3 ? D : n > 0.82 ? L : B);
  }
};
/** soft single-colour wool with weave */
const woolArt = (base: string): Paint => (px, r) => {
  const B = hex(base);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const w = ((x + y) & 1) ? 0.94 : 1.04;
    const c: RGB = [Math.min(255, B[0] * w), Math.min(255, B[1] * w), Math.min(255, B[2] * w)];
    px(x, y, r() < 0.06 ? mix(c, [255, 255, 255], 0.15) : c);
  }
};
/** ingot: metal bar stack */
const ingotArt = (base: string, hi: string, lo: string): Paint => (px) => {
  const B = hex(base), H = hex(hi), L = hex(lo);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(x, y, [0, 0, 0]);
  const bar = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      px(x, y, y === y0 ? H : y === y1 ? L : B);
    }
  };
  bar(2, 4, 13, 7); bar(2, 9, 13, 12);
};

export interface FreePack {
  id: string;
  name: string;
  desc: string;
  tags: string[];
  accent: string;
  seed: number;
  textures: { path: string; paint: Paint }[];
}

export const FREE_PACKS: FreePack[] = [
  {
    id: 'mossweave',
    name: 'Mossweave',
    desc: 'A weathered nature overhaul: moss-kissed stone and cobble, richer oak grain and deep forest leaves.',
    tags: ['Nature', 'Blocks'],
    accent: '#4f8f4f',
    seed: 11,
    textures: [
      { path: 'block/stone.png', paint: stoneArt('#6f7d6a', '#3c4a3a', '#8fa086') },
      { path: 'block/cobblestone.png', paint: stoneArt('#5d6b58', '#2f3b2e', '#7d8d74') },
      { path: 'block/stone_bricks.png', paint: stoneArt('#75836f', '#42503f', '#93a389') },
      { path: 'block/oak_planks.png', paint: plankArt('#7a5a30', '#4a3418') },
      { path: 'block/oak_log.png', paint: plankArt('#5a4426', '#332612') },
      { path: 'block/oak_leaves.png', paint: leafArt('#2e6b2e', '#1c4a1e', '#4f8f3f') },
      { path: 'block/birch_leaves.png', paint: leafArt('#4f8f3f', '#2e6b2e', '#7fb356') },
      { path: 'block/grass_block_top.png', paint: leafArt('#4f9040', '#356a2c', '#6fae52') },
      { path: 'block/dirt.png', paint: stoneArt('#6a4a2c', '#402a16', '#86603c') },
    ],
  },
  {
    id: 'gilded_ores',
    name: 'Gilded Ores',
    desc: 'High-contrast ore sparkle: bright gem clusters and glowing flecks so rare veins read from far away.',
    tags: ['Ores', 'Utility'],
    accent: '#e0b040',
    seed: 23,
    textures: [
      { path: 'block/coal_ore.png', paint: oreArt('#7a7f8a', '#23262e', '#4a4f5a') },
      { path: 'block/copper_ore.png', paint: oreArt('#7a7f8a', '#d07848', '#ffb080') },
      { path: 'block/iron_ore.png', paint: oreArt('#7a7f8a', '#e0b090', '#ffe0c8') },
      { path: 'block/gold_ore.png', paint: oreArt('#7a7f8a', '#f2c832', '#fff0a0') },
      { path: 'block/diamond_ore.png', paint: oreArt('#7a7f8a', '#3fe0d0', '#c0fff6') },
      { path: 'block/nether_gold_ore.png', paint: oreArt('#5a2a2a', '#ff7030', '#ffd0a0') },
      { path: 'block/redstone_ore.png', paint: oreArt('#5a2a2a', '#ff3020', '#ffb0a0') },
      { path: 'block/glowstone.png', paint: oreArt('#8a6a30', '#ffe080', '#fff8d0') },
      { path: 'item/gold_ingot.png', paint: ingotArt('#e8c040', '#fff0a0', '#8a6a20') },
      { path: 'item/iron_ingot.png', paint: ingotArt('#d8d8e0', '#ffffff', '#7a7a88') },
    ],
  },
  {
    id: 'cloudsoft',
    name: 'Cloudsoft Pastels',
    desc: 'A gentle pastel building set: soft wool, powder planks and cream sandstone for cozy builds.',
    tags: ['Building', 'Pastel'],
    accent: '#c0557f',
    seed: 37,
    textures: [
      { path: 'block/white_wool.png', paint: woolArt('#f2e8ec') },
      { path: 'block/oak_planks.png', paint: plankArt('#e8d0b0', '#c0a080') },
      { path: 'block/birch_planks.png', paint: plankArt('#f0e4d0', '#d0b898') },
      { path: 'block/sandstone.png', paint: stoneArt('#f0e0b8', '#d0b888', '#fff0d0') },
      { path: 'block/sandstone_top.png', paint: stoneArt('#f4e6c2', '#d8c090', '#fff4d8') },
      { path: 'block/terracotta.png', paint: stoneArt('#e8b8a8', '#c89080', '#ffd8c8') },
      { path: 'block/bricks.png', paint: plankArt('#e0a8a0', '#b87870') },
      { path: 'block/glass.png', paint: (px) => {
        const E = hex('#d8ecf4'), W = hex('#ffffff');
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
          const edge = x === 0 || y === 0 || x === 15 || y === 15;
          const streak = (x + y) === 6 || (x + y) === 7 || (x + y) === 12;
          if (!edge && !streak) { px(x, y, [0, 0, 0]); continue; } // transparent centre
          px(x, y, streak ? W : E);
        }
      } },
    ],
  },
];

export function getFreePack(id: string): FreePack | undefined {
  return FREE_PACKS.find((p) => p.id === id);
}

function paint16(pack: FreePack, art: Paint): Uint8Array {
  const data = new Uint8ClampedArray(16 * 16 * 4);
  const r = rng(pack.seed * 7919 + art.toString().length * 131);
  art((x, y, c) => {
    if (x < 0 || y < 0 || x > 15 || y > 15) return;
    const i = (y * 16 + x) * 4;
    data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2];
    data[i + 3] = c[0] === 0 && c[1] === 0 && c[2] === 0 ? 0 : 255;
  }, r);
  return new Uint8Array(data.buffer);
}

/** Encode an RGBA 16x16 buffer as a PNG blob (browser canvas). */
async function rgbaToPngBytes(rgba: Uint8Array): Promise<Uint8Array> {
  const cv = document.createElement('canvas');
  cv.width = 16; cv.height = 16;
  const g = cv.getContext('2d');
  if (!g) throw new Error('no 2d context');
  const img = g.createImageData(16, 16);
  img.data.set(rgba);
  g.putImageData(img, 0, 0);
  const url = cv.toDataURL('image/png');
  const b64 = url.split(',')[1];
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Build the pack's zip entirely in-browser. */
export async function buildFreePackZip(pack: FreePack): Promise<Uint8Array> {
  const entries: Record<string, Uint8Array> = {
    'pack.mcmeta': new TextEncoder().encode(JSON.stringify({ pack: { pack_format: 9, description: `${pack.name} — free FABLE marketplace pack` } })),
  };
  for (const t of pack.textures) {
    entries['assets/minecraft/textures/' + t.path] = await rgbaToPngBytes(paint16(pack, t.paint));
  }
  return zipSync(entries, { level: 9 });
}

/** Materialize the pack as a downloadable File (for "Save .zip"). */
export async function freePackFile(pack: FreePack): Promise<File> {
  const zip = await buildFreePackZip(pack);
  return new File([zip.slice().buffer], `fable-${pack.id}-pack.zip`, { type: 'application/zip' });
}

/** Build + install the pack through the normal loader (persists in IndexedDB like imported packs). */
export async function installFreePack(pack: FreePack): Promise<PackResult> {
  const file = await freePackFile(pack);
  return loadResourcePack(file);
}
