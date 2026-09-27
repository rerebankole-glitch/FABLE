/**
 * Resource packs: standard Minecraft resource-pack zips (assets/minecraft/textures/...) overlay
 * their block & item textures onto FABLE's procedurally painted ones. The pack zip is parsed with
 * fflate, mapped onto FABLE's tile/item names (with fallback candidates and tinted grayscale
 * sources), blitted into the live texture atlas and the item-icon caches, and persisted in
 * IndexedDB so it survives reloads. Vanilla-format packs made for Minecraft (e.g. Faithful) work.
 */
import { unzipSync } from 'fflate';
import { getAtlas } from '../blocks/TextureAtlas';
import { TILE_NAMES } from '../blocks/Tiles';
import { ITEMS } from '../items/Items';
import { BIOMES, leafTint } from '../world/Biomes';
import { setPackIconLookup, invalidateIcons } from '../items/Icons';
import { invalidateItemModels } from '../items/ItemModel';
import { ENTITY_MAP, paletteFromPng, setEntityPalette, clearEntityPalettes, entityPaletteCount } from './PackEntities';
import { settings } from './Settings';
import { store } from '../../ui/store';

// ---------------------------------------------------------------- mapping tables
/** FABLE tile name -> candidate paths under assets/minecraft/textures/block/ (first found wins). */
export const TILE_MAP: Record<string, string[]> = {
  stone: ['stone'], deep_stone: ['deepslate'], dirt: ['dirt'],
  grass_top: ['grass_block_top'], grass_side: ['grass_block_side'], snow_grass_side: ['grass_block_snow'],
  snow: ['snow'], sand: ['sand'], red_sand: ['red_sand'], gravel: ['gravel'], clay: ['clay'], mud: ['mud'],
  ice: ['ice'], packed_ice: ['packed_ice'], water: ['water_still'], lava: ['lava_still'], bedrock: ['bedrock'],
  sandstone_top: ['sandstone_top'], sandstone_side: ['sandstone_side'], terracotta: ['terracotta'],
  oak_log: ['oak_log'], oak_log_top: ['oak_log_top'], oak_planks: ['oak_planks'], oak_leaves: ['oak_leaves'],
  birch_log: ['birch_log'], birch_log_top: ['birch_log_top'], birch_planks: ['birch_planks'], birch_leaves: ['birch_leaves'],
  spruce_log: ['spruce_log'], spruce_log_top: ['spruce_log_top'], spruce_planks: ['spruce_planks'], spruce_leaves: ['spruce_leaves'],
  dark_log: ['dark_oak_log'], dark_log_top: ['dark_oak_log_top'], dark_planks: ['dark_oak_planks'], dark_leaves: ['dark_oak_leaves'],
  stripped_log: ['stripped_oak_log'], stripped_log_top: ['stripped_oak_log_top'],
  oak_sapling: ['oak_sapling'], birch_sapling: ['birch_sapling'], spruce_sapling: ['spruce_sapling'],
  coal_ore: ['coal_ore'], copper_ore: ['copper_ore'], iron_ore: ['iron_ore'], gold_ore: ['gold_ore'],
  ember_ore: ['nether_gold_ore', 'redstone_ore'], crystal_ore: ['diamond_ore'],
  cobblestone: ['cobblestone'], mossy_cobblestone: ['mossy_cobblestone'], stone_bricks: ['stone_bricks'], bricks: ['bricks'],
  glass: ['glass'], wool: ['white_wool'], voidstone: ['obsidian'], lumen: ['glowstone'], hellstone: ['netherrack'],
  crafting_table_top: ['crafting_table_top'], crafting_table_side: ['crafting_table_side'],
  furnace_side: ['furnace_side'], furnace_front: ['furnace_front'], furnace_front_lit: ['furnace_front_on'],
  torch: ['torch'], lantern: ['lantern'], ladder: ['ladder'], door_top: ['oak_door_top'], door_bottom: ['oak_door_bottom'],
  // Spark circuitry + Brewing Hearth. FABLE's names are its own, but they map onto the closest
  // vanilla-named textures so an existing resource pack re-skins them instead of leaving the
  // built-in art stranded next to a fully re-textured world.
  spark_dust: ['redstone_dust_dot', 'redstone_dust_line0', 'redstone_dust_line'],
  spark_dust_on: ['redstone_dust_dot', 'redstone_dust_line0', 'redstone_dust_line'],
  spark_torch: ['redstone_torch'], spark_torch_off: ['redstone_torch_off'],
  spark_lever: ['lever'], spark_lever_on: ['lever'],
  spark_plate: ['stone', 'smooth_stone'], spark_plate_on: ['stone', 'smooth_stone'],
  shunt_side: ['piston_side'], shunt_face: ['piston_inner', 'piston_bottom'], shunt_head: ['piston_top', 'piston_top_sticky'],
  hearth_top: ['brewing_stand_base', 'cauldron_top'], hearth_side: ['brewing_stand', 'cauldron_side'],
  tall_grass: ['short_grass', 'grass'], fern: ['fern', 'large_fern_bottom'],
  flower_red: ['poppy'], flower_yellow: ['dandelion'], flower_blue: ['cornflower'],
  mushroom_brown: ['brown_mushroom'], mushroom_red: ['red_mushroom'], dead_bush: ['dead_bush'],
  cactus_side: ['cactus_side'], cactus_top: ['cactus_top'], reeds: ['sugar_cane'], farmland: ['farmland'],
  wheat_0: ['wheat_stage1'], wheat_1: ['wheat_stage3'], wheat_2: ['wheat_stage5'], wheat_3: ['wheat_stage7'],
  carrot_0: ['carrots_stage0'], carrot_1: ['carrots_stage2'], carrot_2: ['carrots_stage3'],
  potato_0: ['potatoes_stage0'], potato_1: ['potatoes_stage2'], potato_2: ['potatoes_stage3'],
  pumpkin_side: ['pumpkin_side'], pumpkin_top: ['pumpkin_top'], melon_side: ['melon_side'], melon_top: ['melon_top'],
};

/** Grayscale (tint-in-Minecraft) sources get multiplied by FABLE's plains biome colours at draw time. */
export const TILE_TINTS: Record<string, [number, number, number]> = {
  grass_top: [0x91 / 255, 0xbd / 255, 0x59 / 255],
  oak_leaves: [0x59 / 255, 0xae / 255, 0x30 / 255], spruce_leaves: [0x68 / 255, 0xa4 / 255, 0x64 / 255],
  dark_leaves: [0x3f / 255, 0x6e / 255, 0x24 / 255],
};

/** FABLE item id -> candidate paths under assets/minecraft/textures/item/. */
export const ITEM_MAP: Record<string, string[]> = {
  pail: ['bucket'], pail_water: ['water_bucket'], pail_lava: ['lava_bucket'],
  glass_flask: ['glass_bottle'], spark_dust: ['redstone'], spark_torch: ['redstone_torch'],
  draught_mending: ['potion'], draught_swift: ['potion'], draught_stonehide: ['potion'],
  draught_owlsight: ['potion'], draught_emberskin: ['potion'], draught_tidelung: ['potion'],
  wood_pickaxe: ['wooden_pickaxe'], wood_axe: ['wooden_axe'], wood_shovel: ['wooden_shovel'], wood_hoe: ['wooden_hoe'], wood_sword: ['wooden_sword'],
  stone_pickaxe: ['stone_pickaxe'], stone_axe: ['stone_axe'], stone_shovel: ['stone_shovel'], stone_hoe: ['stone_hoe'], stone_sword: ['stone_sword'],
  copper_pickaxe: ['copper_pickaxe', 'iron_pickaxe'], copper_axe: ['copper_axe', 'iron_axe'], copper_shovel: ['copper_shovel', 'iron_shovel'], copper_hoe: ['copper_hoe', 'iron_hoe'], copper_sword: ['copper_sword', 'iron_sword'],
  iron_pickaxe: ['iron_pickaxe'], iron_axe: ['iron_axe'], iron_shovel: ['iron_shovel'], iron_hoe: ['iron_hoe'], iron_sword: ['iron_sword'],
  gold_pickaxe: ['golden_pickaxe'], gold_axe: ['golden_axe'], gold_shovel: ['golden_shovel'], gold_hoe: ['golden_hoe'], gold_sword: ['golden_sword'],
  crystal_pickaxe: ['diamond_pickaxe', 'netherite_pickaxe'], crystal_axe: ['diamond_axe', 'netherite_axe'], crystal_shovel: ['diamond_shovel', 'netherite_shovel'], crystal_hoe: ['diamond_hoe', 'netherite_hoe'], crystal_sword: ['diamond_sword', 'netherite_sword'],
  leather_helmet: ['leather_helmet'], leather_chestplate: ['leather_chestplate'], leather_leggings: ['leather_leggings'], leather_boots: ['leather_boots'],
  iron_helmet: ['iron_helmet'], iron_chestplate: ['iron_chestplate'], iron_leggings: ['iron_leggings'], iron_boots: ['iron_boots'],
  gold_helmet: ['golden_helmet'], gold_chestplate: ['golden_chestplate'], gold_leggings: ['golden_leggings'], gold_boots: ['golden_boots'],
  crystal_helmet: ['diamond_helmet'], crystal_chestplate: ['diamond_chestplate'], crystal_leggings: ['diamond_leggings'], crystal_boots: ['diamond_boots'],
  stick: ['stick'], coal: ['coal'], charcoal: ['charcoal'], iron_ingot: ['iron_ingot'], gold_ingot: ['gold_ingot'], copper_ingot: ['copper_ingot', 'iron_ingot'],
  raw_copper: ['raw_copper'], raw_gold: ['raw_gold'], raw_iron: ['raw_iron'],
  sky_crystal: ['diamond', 'emerald'], ember_dust: ['blaze_powder', 'redstone'], void_essence: ['ender_pearl', 'ender_eye'],
  shadow_wing: ['phantom_membrane', 'feather'], lumen_shard: ['glowstone_dust', 'glowstone'], spider_silk: ['string', 'spider_eye'],
  leather: ['leather'], feather: ['feather'], string: ['string'], bone: ['bone'], arrow: ['arrow'], bow: ['bow'],
  apple: ['apple'], honey_apple: ['golden_apple', 'apple'], bread: ['bread'], melon_slice: ['melon_slice'],
  wheat: ['wheat'], wheat_seeds: ['wheat_seeds'], carrot: ['carrot'], potato: ['potato'], baked_potato: ['baked_potato'],
  raw_beef: ['beef'], cooked_beef: ['cooked_beef'], raw_porkchop: ['porkchop'], cooked_porkchop: ['cooked_porkchop'],
  raw_mutton: ['mutton'], cooked_mutton: ['cooked_mutton'], raw_chicken: ['chicken'], cooked_chicken: ['cooked_chicken'],
  egg: ['egg'], berry: ['sweet_berries', 'apple'], mushroom_stew: ['mushroom_stew'],
  clay_ball: ['clay_ball'], brick: ['brick'], snowball: ['snowball'], flint: ['flint'],
  fire_striker: ['flint_and_steel'], oak_door: ['oak_door'], shield: ['shield'],
};

/**
 * Fallback texture names for a FABLE tile with no explicit TILE_MAP entry: its own name, plus the
 * usual Minecraft spellings for the same idea. Cheap, and it means a pack covers far more of the
 * world than the hand-written table alone.
 */
function autoTileCandidates(tile: string): string[] {
  const out = [tile];
  // FABLE uses `<x>_top` / `<x>_side`; vanilla often uses the same, but also plain `<x>`
  const base = tile.replace(/_(top|side|bottom|front|end)$/, '');
  if (base !== tile) out.push(base, `${base}_${tile.endsWith('_top') ? 'top' : 'side'}`);
  // `dark_*` is FABLE's dark oak
  if (tile.startsWith('dark_')) out.push(tile.replace(/^dark_/, 'dark_oak_'));
  if (tile.startsWith('deep_')) out.push(tile.replace(/^deep_/, 'deepslate_'), 'deepslate');
  return out;
}

// ---------------------------------------------------------------- live pack state
const packTiles = new Map<number, HTMLCanvasElement>();
const packItems = new Map<string, HTMLCanvasElement>();

/** Icon override hook consumed by items/Icons.ts (avoids a circular import). */
setPackIconLookup((id) => packItems.get(id));

const DB = 'fable-packs', STORE = 'files';
function idb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}
async function idbPut(bytes: ArrayBuffer): Promise<void> {
  const db = await idb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(bytes, 'resource-pack');
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}
async function idbGet(): Promise<ArrayBuffer | null> {
  const db = await idb();
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get('resource-pack');
    req.onsuccess = () => resolve((req.result as ArrayBuffer) ?? null);
    req.onerror = () => resolve(null);
  });
}
async function idbClear(): Promise<void> {
  const db = await idb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete('resource-pack');
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

// ---------------------------------------------------------------- image helpers
async function png16(bytes: Uint8Array, tint?: [number, number, number]): Promise<HTMLCanvasElement | null> {
  try {
    const blob = new Blob([bytes.slice() as unknown as BlobPart], { type: 'image/png' });
    const bmp = await createImageBitmap(blob);
    // Animated Minecraft textures are vertical strips of square frames: take frame 0, which is the
    // top `width x width` square. Everything else (including HD 32x/64x art) is one square image.
    // The old code cropped a 16x16 window out of the middle of HD textures instead of scaling them,
    // so a 32x pack came out as a zoomed-in corner of every block.
    const frame = bmp.height > bmp.width && bmp.height % bmp.width === 0 ? bmp.width : Math.min(bmp.width, bmp.height);
    const cv = document.createElement('canvas');
    cv.width = 16; cv.height = 16;
    const ctx = cv.getContext('2d')!;
    ctx.imageSmoothingEnabled = false; // nearest-neighbour: pack art stays crisp pixel art
    ctx.drawImage(bmp, 0, 0, frame, frame, 0, 0, 16, 16);
    if (tint) {
      const img = ctx.getImageData(0, 0, 16, 16);
      for (let i = 0; i < img.data.length; i += 4) {
        img.data[i] = Math.round(img.data[i] * tint[0]);
        img.data[i + 1] = Math.round(img.data[i + 1] * tint[1]);
        img.data[i + 2] = Math.round(img.data[i + 2] * tint[2]);
      }
      ctx.putImageData(img, 0, 0);
    }
    return cv;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- apply
function applyToAtlas(): number {
  if (!packTiles.size) return 0;
  return getAtlas().applyTileOverrides(packTiles);
}

function applyToItems(): void {
  invalidateIcons();
  invalidateItemModels(); // extruded 3D item models are built from the icons, so they go too
  store.bump();
}

// ---------------------------------------------------------------- public API
export interface PackResult { name: string; tiles: number; items: number; mobs: number }

/** Parse a resource-pack zip (.zip / .mcpack), map its textures onto FABLE's and apply them live. */
export async function loadResourcePack(file: File): Promise<PackResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const entries = unzipSync(bytes);
  // Packs are not all laid out identically: the namespace may not be `minecraft`, the whole pack
  // may sit in a subfolder inside the zip, and Bedrock (.mcpack) drops the `assets/<ns>` prefix
  // altogether. So index every PNG by its path suffix and resolve candidates against that, rather
  // than demanding one exact path — this is what made real-world packs "load" with zero textures.
  const bySuffix = new Map<string, Uint8Array>();
  for (const path of Object.keys(entries)) {
    if (!path.toLowerCase().endsWith('.png')) continue;
    const lower = path.toLowerCase();
    const cut = lower.lastIndexOf('/textures/');
    const key = cut >= 0 ? lower.slice(cut + '/textures/'.length) : lower;
    // first writer wins, so `assets/minecraft/...` beats a stray copy deeper in the zip
    if (!bySuffix.has(key)) bySuffix.set(key, entries[path]);
  }
  /** Look a texture up by its path under textures/, trying each folder a pack might use. */
  const lookup = (folders: string[], candidates: string[]): Uint8Array | null => {
    for (const c of candidates) for (const f of folders) {
      const hit = bySuffix.get(`${f}/${c}.png`.toLowerCase());
      if (hit) return hit;
    }
    return null;
  };
  // `blocks`/`items` are the pre-1.13 (and Bedrock) folder names, still shipped by many packs
  const find = (candidates: string[]): Uint8Array | null => lookup(['block', 'blocks'], candidates);
  const findItem = (candidates: string[]): Uint8Array | null => lookup(['item', 'items'], candidates);
  const findEntity = (candidates: string[]): Uint8Array | null => lookup(['entity'], candidates);
  packTiles.clear();
  packItems.clear();
  clearEntityPalettes();
  for (const tile of TILE_NAMES) {
    // Explicit mapping first, then the tile's own name and a few mechanical variations of it.
    // That auto-coverage is what lets a pack supply art for tiles nobody hand-mapped, and it is
    // how new tiles added to FABLE later pick up pack textures with no extra wiring.
    const candidates = TILE_MAP[tile] ?? autoTileCandidates(tile);
    const data = find(candidates);
    if (!data) continue;
    const cv = await png16(data, TILE_TINTS[tile]);
    if (cv) {
      const idx = TILE_NAMES.indexOf(tile);
      packTiles.set(idx, cv);
    }
  }
  for (const id of ITEMS.keys()) {
    const candidates = ITEM_MAP[id] ?? [id];
    const data = findItem(candidates);
    if (!data) continue;
    const cv = await png16(data);
    if (cv) packItems.set(id, cv);
  }
  // Entity textures: mob-only packs (Fresh Animations and friends) ship nothing but these, and
  // used to be rejected outright. Each mapped skin is reduced to a head/body/legs palette that
  // repaints FABLE's own mob models (see PackEntities).
  for (const [type, candidates] of Object.entries(ENTITY_MAP)) {
    const data = findEntity(candidates);
    if (!data) continue;
    const pal = await paletteFromPng(data);
    if (pal) setEntityPalette(type, pal);
  }
  const mobs = entityPaletteCount();
  if (!packTiles.size && !packItems.size && !mobs) {
    throw new Error('No compatible textures found — is this a Minecraft resource pack?');
  }
  applyToAtlas();
  applyToItems();
  await idbPut(bytes);
  settings.set('resourcePack', file.name);
  return { name: file.name, tiles: packTiles.size, items: packItems.size, mobs };
}

/** Remove the pack and restore FABLE's built-in art. */
export async function clearResourcePack(): Promise<void> {
  packTiles.clear();
  packItems.clear();
  clearEntityPalettes(); // live mobs notice the generation bump and rebuild with FABLE's colours
  getAtlas().resetTiles();
  applyToItems();
  await idbClear();
  settings.set('resourcePack', '');
}

/** Boot-time restore: re-parse the persisted pack zip and re-apply it. */
export async function restoreResourcePack(): Promise<void> {
  if (!settings.value.resourcePack) return;
  const bytes = await idbGet();
  if (!bytes) { settings.set('resourcePack', ''); return; }
  try {
    const name = settings.value.resourcePack;
    await loadResourcePack(new File([bytes], name, { type: 'application/zip' }));
  } catch {
    settings.set('resourcePack', '');
  }
}

/** Test-only / introspection: counts of currently mapped textures. */
export function packCounts(): { tiles: number; items: number; mobs: number } {
  return { tiles: packTiles.size, items: packItems.size, mobs: entityPaletteCount() };
}

// keep BIOMES/leafTint referenced for potential per-biome tinting refinements (tree-sourced tints)
void BIOMES; void leafTint;
