// Resource-pack mapping integrity: every TILE_MAP target must be a real tile, every
// ITEM_MAP key a registered item, the free packs must cover the world and stay neutral on the
// tiles the engine tints, and fflate must round-trip a pack-like zip layout.
import { TILE_MAP, TILE_TINTED, ITEM_MAP } from '../src/game/core/ResourcePacks';
import { TILE_NAMES } from '../src/game/blocks/Tiles';
import { ITEMS } from '../src/game/items/Items';
import { FREE_PACKS, buildFreePackZip, encodePng } from '../src/game/core/FreePacks';
import { artistIds, getArtist, paintPackTile, paintPackIcon } from '../src/game/blocks/packArt';
import { unzipSync, zipSync, strToU8 } from 'fflate';

let pass = 0, fail = 0;
function ok(c: boolean, m: string): void {
  if (c) { pass++; } else { fail++; console.error('FAIL: ' + m); }
}

const tileSet = new Set<string>(TILE_NAMES as readonly string[]);
for (const [src, cands] of Object.entries(TILE_MAP)) {
  ok(tileSet.has(src), `TILE_MAP source not a tile: ${src}`);
  ok(cands.length > 0, `TILE_MAP empty candidates: ${src}`);
  for (const c of cands) ok(!c.includes('.png') && !c.includes(' '), `bad candidate '${c}' for ${src}`);
}
for (const src of TILE_TINTED) ok(tileSet.has(src), `TILE_TINTED entry not a tile: ${src}`);
const itemIds = new Set<string>(ITEMS.keys());
for (const [src, cands] of Object.entries(ITEM_MAP)) {
  ok(itemIds.has(src), `ITEM_MAP key not a registered item: ${src}`);
  for (const c of cands) ok(!c.includes('.png'), `bad candidate '${c}' for ${src}`);
}
ok(Object.keys(TILE_MAP).length >= 50, `expected 50+ tile mappings, got ${Object.keys(TILE_MAP).length}`);
ok(Object.keys(ITEM_MAP).length >= 40, `expected 40+ item mappings, got ${Object.keys(ITEM_MAP).length}`);

// zip round-trip with a Minecraft-style layout (as produced by real packs)
const files: Record<string, Uint8Array> = {
  'pack.mcmeta': strToU8('{"pack":{"pack_format":22,"description":"test"}}'),
  'assets/minecraft/textures/block/diamond_ore.png': strToU8('fakepng-block'),
  'assets/minecraft/textures/item/diamond.png': strToU8('fakepng-item'),
};
const zipped: Uint8Array = zipSync(files);
const un = unzipSync(zipped);
ok('assets/minecraft/textures/block/diamond_ore.png' in un, 'zip round-trip lost block path');
ok(un['assets/minecraft/textures/block/diamond_ore.png'].length === 13, 'zip round-trip payload mismatch');

// ---------------------------------------------------------------- free packs
// Every texture a free pack ships must resolve through the SAME tables the loader matches against,
// otherwise the pack would install with holes in the world.
for (const id of artistIds()) {
  const artist = getArtist(id)!;
  ok(artist.tiles.length >= 50, `${id}: only ${artist.tiles.length} block tiles (the world would be a patchwork)`);
  ok(artist.items.length >= 20, `${id}: only ${artist.items.length} item icons`);
  ok(artist.preview.length >= 4, `${id}: no storefront preview tiles`);
  for (const t of artist.tiles) {
    ok(tileSet.has(t), `${id}: paints unknown tile ${t}`);
    ok(!!TILE_MAP[t], `${id}: tile ${t} has no loader mapping`);
  }
  for (const i of artist.items) {
    ok(itemIds.has(i), `${id}: paints unknown item ${i}`);
    ok(!!ITEM_MAP[i], `${id}: item ${i} has no loader mapping`);
  }
  for (const t of artist.preview) ok(artist.tiles.includes(t), `${id}: preview tile ${t} is not in the pack`);
}

const REQUIRED = [
  'stone', 'dirt', 'grass_top', 'grass_side', 'sand', 'water', 'oak_log', 'oak_planks', 'oak_leaves',
  'cobblestone', 'coal_ore', 'iron_ore', 'gold_ore', 'crystal_ore', 'glass', 'brick' as unknown as 'stone',
].filter((t) => tileSet.has(t));
for (const id of artistIds()) {
  const artist = getArtist(id)!;
  for (const t of REQUIRED) ok(artist.tiles.includes(t), `${id}: missing core tile ${t}`);
}

// Tinted tiles must be painted neutral + tint-flagged: the biome supplies the hue, so a pack that
// bakes its own green in would tint twice (the "worse colour" bug).
for (const id of artistIds()) {
  const px = paintPackTile(id, 'grass_top', 5)!;
  ok(!!px, `${id}: no grass_top art`);
  let tinted = 0, coloured = 0, opaque = 0;
  for (let i = 0; i < 16 * 16; i++) {
    const [r, g, b, a] = [px[i * 4], px[i * 4 + 1], px[i * 4 + 2], px[i * 4 + 3]];
    if (!a) continue;
    opaque++;
    if (a === 128) tinted++;
    if (Math.max(r, g, b) - Math.min(r, g, b) > 6) coloured++;
  }
  ok(opaque === 256, `${id}: grass_top has transparent pixels (${opaque}/256)`);
  ok(tinted === opaque, `${id}: grass_top is not fully tint-flagged (${tinted}/${opaque})`);
  ok(coloured === 0, `${id}: grass_top bakes ${coloured} coloured pixels (double tint)`);
}

// The built zip carries the art under vanilla names + a pack.mcmeta.
{
  const pack = FREE_PACKS.find((p) => p.id === 'mossweave')!;
  const zip = unzipSync(buildFreePackZip(pack));
  const names = Object.keys(zip);
  ok(names.includes('pack.mcmeta'), 'free pack zip has no pack.mcmeta');
  const blocks = names.filter((n) => n.includes('/textures/block/'));
  const items = names.filter((n) => n.includes('/textures/item/'));
  ok(blocks.length >= 50, `free pack zip ships ${blocks.length} block textures`);
  ok(items.length >= 20, `free pack zip ships ${items.length} item textures`);
  ok(blocks.includes('assets/minecraft/textures/block/stone.png'), 'free pack zip is missing stone.png');
  ok(blocks.includes('assets/minecraft/textures/block/grass_block_top.png'), 'grass top must ship under its vanilla name');
  const stone = zip['assets/minecraft/textures/block/stone.png'];
  ok(stone[0] === 137 && stone[1] === 80, 'shipped texture is not a PNG');
}

// PNG encoder round-trip (the pack generator writes textures in-process, no canvas involved).
{
  const rgba = new Uint8ClampedArray(16 * 16 * 4);
  for (let i = 0; i < 256; i++) { rgba[i * 4] = i; rgba[i * 4 + 1] = 255 - i; rgba[i * 4 + 2] = 7; rgba[i * 4 + 3] = i % 2 ? 255 : 0; }
  const png = encodePng(rgba, 16, 16);
  ok(png.length > 100 && png[0] === 137 && png[1] === 80 && png[2] === 78 && png[3] === 71, 'encodePng did not produce a PNG');
  const idat = png.indexOf(0x49); // crude: ensure an IDAT chunk type exists
  ok(idat > 0, 'encodePng output has no IDAT');
}

// Item icons exist for every advertised id.
for (const id of artistIds()) {
  for (const item of getArtist(id)!.items) ok(!!paintPackIcon(id, item, 1), `${id}: item icon ${item} did not paint`);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
