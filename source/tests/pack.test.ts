// Resource-pack mapping integrity: every TILE_MAP target must be a real tile, every
// ITEM_MAP key a registered item, and fflate must round-trip a pack-like zip layout.
import { TILE_MAP, TILE_TINTS, ITEM_MAP } from '../src/game/core/ResourcePacks';
import { TILE_NAMES } from '../src/game/blocks/Tiles';
import { ITEMS } from '../src/game/items/Items';
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
for (const [src, tint] of Object.entries(TILE_TINTS)) {
  ok(tileSet.has(src), `TILE_TINTS source not a tile: ${src}`);
  ok(tint.length === 3 && tint.every((v) => v >= 0 && v <= 255), `bad tint for ${src}`);
}
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

console.log(`${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
