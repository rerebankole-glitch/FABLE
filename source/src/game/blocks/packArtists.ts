/**
 * The three free resource packs, painted tile by tile.
 *
 * Each pack is a full art direction rather than a colour filter: it owns its stone structure, its
 * soil, its wood grain, its canopy shape and its ore clusters, and it covers the whole material set
 * the overworld shows. Tinted tiles (grass, leaves, tall grass, fern) are painted in neutral greys
 * with the `TINT_A` flag, exactly like the built-in atlas, so the biome keeps deciding the hue and
 * the pack decides the art.
 */
import {
  N, type S, rgb, shade, ramp,
  type RGB, type PackArtist,
  registerArtist,
  stoneField, cobbleField, plankField, barkField, ringField, canopyField, grassTopField, grassSideField,
  oreField, weaveField, glassField, plantField, grainField, waterField, iceField, brickField, farmlandField,
  cactusField, spriteField, gourdField, ingotItem, gemItem, lumpItem, dustItem, stickItem, fruitItem,
  loafItem, sheafItem, shardItem, ballItem, featherItem, cordItem, boneItem, flintItem, peltItem,
  strippedField, furnaceFrontField, chestField, lightSpriteField, ladderField, panelField, barrelField,
  tableField, saplingField,
} from './packArt';

/** Every tile every pack paints — the material set the overworld actually shows. */
const TILES = [
  'stone', 'deep_stone', 'dirt', 'grass_top', 'grass_side', 'snow_grass_side', 'snow', 'sand', 'red_sand',
  'gravel', 'clay', 'mud', 'ice', 'packed_ice', 'water', 'bedrock', 'sandstone_top', 'sandstone_side',
  'terracotta', 'oak_log', 'oak_log_top', 'oak_planks', 'oak_leaves',
  'birch_log', 'birch_log_top', 'birch_planks', 'birch_leaves',
  'spruce_log', 'spruce_log_top', 'spruce_planks', 'spruce_leaves',
  'dark_log', 'dark_log_top', 'dark_planks', 'dark_leaves',
  'coal_ore', 'copper_ore', 'iron_ore', 'gold_ore', 'ember_ore', 'crystal_ore',
  'cobblestone', 'mossy_cobblestone', 'stone_bricks', 'bricks', 'glass', 'wool',
  'farmland', 'tall_grass', 'fern', 'flower_red', 'flower_yellow', 'flower_blue',
  'mushroom_brown', 'mushroom_red', 'dead_bush', 'cactus_side', 'cactus_top', 'reeds',
  'pumpkin_side', 'pumpkin_top', 'melon_side', 'melon_top',
  'stripped_log', 'stripped_log_top', 'oak_sapling', 'birch_sapling', 'spruce_sapling',
  'crafting_table_top', 'crafting_table_side', 'furnace_side', 'furnace_front', 'furnace_front_lit',
  'chest_top', 'chest_side', 'chest_front', 'torch', 'lantern', 'ladder', 'door_top', 'door_bottom',
  'barrel_side', 'barrel_top',
] as const;

const ITEMS = [
  'coal', 'charcoal', 'raw_copper', 'copper_ingot', 'raw_iron', 'iron_ingot', 'raw_gold', 'gold_ingot',
  'ember_dust', 'sky_crystal', 'lumen_shard', 'void_essence', 'stick', 'apple', 'bread', 'wheat',
  'clay_ball', 'flint', 'snowball', 'leather', 'feather', 'bone', 'string', 'spider_silk',
] as const;

interface Wood { bark: RGB; light: RGB; groove: RGB; ring: RGB; wood: RGB; core: RGB; plank: RGB }

const leaves = (s: S, tone: number, holes: number, salt: number) => canopyField(s, tone, holes, salt);
const plant = (s: S, kind: 'flower' | 'mushroom' | 'bush' | 'reeds', pal: RGB[], salt: number) => spriteField(s, kind, pal, salt);

// ==========================================================================================
// Mossweave — an overgrown, hand-laid world: moss in every mortar line, deep loam, weathered
// timber. Stone is built from big rounded boulders instead of noise plates, and grass grows out
// of the gaps.
// ==========================================================================================
const MOSS: RGB = [96, 130, 66];
const WEAVE_OAK: Wood = { bark: rgb(0x5c4a30), light: rgb(0x8a6c46), groove: rgb(0x382a1a), ring: rgb(0x8a6a3c), wood: rgb(0xa8804c), core: rgb(0x6a4c28), plank: rgb(0xa8845a) };

registerArtist({
  id: 'mossweave',
  tiles: [...TILES],
  items: [...ITEMS],
  preview: [
    'grass_top', 'stone', 'dirt', 'oak_log', 'oak_planks', 'oak_leaves', 'mossy_cobblestone', 'crystal_ore',
    'sand', 'gravel', 'stone_bricks', 'bricks', 'tall_grass', 'flower_red', 'torch', 'chest_front',
  ],
  paint(tile, s) {
    const SALT = 11;
    const mossStone = () => cobbleField(s, rgb(0x7a7468), { moss: MOSS, mossP: 0.62, cells: 7, salt: SALT });
    const deepMossStone = () => cobbleField(s, rgb(0x4a4844), { moss: rgb(0x5e7a44), mossP: 0.7, cells: 8, salt: SALT + 1 });
    const loam = (base = 0x6e4e32) => grainField(s, rgb(base), { scale: 3, lumps: 5, grainP: 0.12, salt: SALT });
    switch (tile) {
      case 'stone': stoneField(s, rgb(0x7b766a), { blotch: 0.45, pebbles: 5, cracks: 4, salt: SALT });
        for (let i = 0; i < 14; i++) { const x = s.ri(N), y = s.ri(N); if (s.blob(x, y, 3, SALT + 2) > 0.86) s.set(x, y, shade(MOSS, 0.8)); }
        return true;
      case 'deep_stone': stoneField(s, rgb(0x4c4a44), { blotch: 0.5, pebbles: 3, cracks: 5, salt: SALT + 4 });
        for (let i = 0; i < 34; i++) { const x = s.ri(N), y = s.ri(N); if (s.blob(x, y, 3, SALT + 5) > 0.78) s.set(x, y, shade(rgb(0x53703c), 0.9)); }
        return true;
      case 'dirt': case 'mud': loam(tile === 'mud' ? 0x4a3624 : 0x6e4e32);
        for (let i = 0; i < 4; i++) { const x = s.ri(N), y = s.ri(N); s.set(x, y, rgb(0x3a2a1a)); s.set(x + 1, y, rgb(0x51402a)); }
        return true;
      case 'grass_top': grassTopField(s, SALT, 'tufty'); return true;
      case 'grass_side': grassSideField(s, false, () => loam(), SALT); return true;
      case 'snow_grass_side': grassSideField(s, true, () => loam(), SALT); return true;
      case 'farmland': farmlandField(s, rgb(0x60442c), SALT); return true;
      case 'sand': grainField(s, rgb(0xc8bb90), { scale: 3.4, lumps: 3, salt: SALT + 6 }); return true;
      case 'red_sand': grainField(s, rgb(0xa8643a), { scale: 3.2, lumps: 3, salt: SALT + 7 }); return true;
      case 'gravel': grainField(s, rgb(0x7c766c), { scale: 2.4, lumps: 8, grainP: 0.16, salt: SALT + 8 });
        for (let i = 0; i < 18; i++) { const x = s.ri(N), y = s.ri(N); if (s.hash(x, y, 9) > 0.7) s.set(x, y, shade(MOSS, 0.85)); }
        return true;
      case 'clay': grainField(s, rgb(0x9aa094), { scale: 3.6, lumps: 2, salt: SALT + 10 }); return true;
      case 'snow': grainField(s, rgb(0xeef4fb), { scale: 4, lumps: 2, dark: 0.92, light: 1.02, salt: SALT + 11 }); return true;
      case 'ice': iceField(s, rgb(0x9fc4e4)); return true;
      case 'packed_ice': iceField(s, rgb(0x86b0d6)); return true;
      case 'water': waterField(s, rgb(0x2f5f92)); return true;
      case 'bedrock': stoneField(s, rgb(0x4a4a48), { blotch: 0.7, pebbles: 6, cracks: 6, salt: SALT + 12 }); return true;
      case 'sandstone_top': grainField(s, rgb(0xd4c894), { scale: 4, lumps: 2, salt: SALT + 13 }); return true;
      case 'sandstone_side': brickField(s, rgb(0xd0c28e), rgb(0xa89a6c), { bw: 16, bh: 5, salt: SALT + 14 }); return true;
      case 'terracotta': grainField(s, rgb(0x96654c), { scale: 3.4, lumps: 2, salt: SALT + 15 }); return true;
      case 'bricks': brickField(s, rgb(0x9c5a48), rgb(0xb0a48e), { salt: SALT + 16 });
        for (let i = 0; i < 12; i++) { const x = s.ri(N), y = s.ri(N); if (s.hash(x, y, 17) > 0.72) s.set(x, y, shade(MOSS, 0.9)); }
        return true;
      case 'stone_bricks': brickField(s, rgb(0x7c786e), rgb(0x4e4c46), { salt: SALT + 18 });
        for (let i = 0; i < 22; i++) { const x = s.ri(N), y = s.ri(N); if (s.hash(x, y, 19) > 0.68) s.set(x, y, shade(MOSS, 0.85 + s.hash(x, y, 2) * 0.4)); }
        return true;
      case 'cobblestone': cobbleField(s, rgb(0x7e786c), { moss: MOSS, mossP: 0.9, scatter: 0.06, cells: 10, salt: SALT + 20 }); return true;
      case 'mossy_cobblestone': cobbleField(s, rgb(0x74705f), { moss: rgb(0x6f9a4a), mossP: 0.35, scatter: 0.45, cells: 9, salt: SALT + 20 }); return true;
      case 'glass': glassField(s, rgb(0xa8c9a4)); return true;
      case 'wool': weaveField(s, rgb(0xdcdcc8), SALT); return true;
      case 'oak_log': barkField(s, WEAVE_OAK.bark, { salt: SALT }); return true;
      case 'oak_log_top': ringField(s, WEAVE_OAK.groove, WEAVE_OAK.ring, rgb(0xb08a56), rgb(0x7a5a34)); return true;
      case 'oak_planks': plankField(s, rgb(0xa8834e), { nails: true, knots: true, weather: 2, salt: SALT }); return true;
      case 'oak_leaves': leaves(s, 152, 0.3, SALT); return true;
      case 'birch_log': barkField(s, rgb(0xd8d4c2), { salt: SALT + 21 });
        for (let i = 0; i < 7; i++) { const x = 1 + Math.floor(s.hash(i, 6, 1) * 12); const y = 1 + Math.floor(s.hash(8, i, 1) * 13); const w = 1 + Math.floor(s.hash(i, 9, 1) * 3); for (let k = 0; k < w; k++) s.set(x + k, y, rgb(0x3a3a34)); }
        return true;
      case 'birch_log_top': ringField(s, rgb(0x3a3a34), rgb(0xd8d0b0), rgb(0xe8e0c4), rgb(0xbcae8c)); return true;
      case 'birch_planks': plankField(s, rgb(0xccc0a0), { nails: true, knots: true, salt: SALT + 22 }); return true;
      case 'birch_leaves': leaves(s, 172, 0.28, SALT + 23); return true;
      case 'spruce_log': barkField(s, rgb(0x4a3626), { knots: true, salt: SALT + 24 }); return true;
      case 'spruce_log_top': ringField(s, rgb(0x35251a), rgb(0x7c5c38), rgb(0x93703f), rgb(0x5e4326)); return true;
      case 'spruce_planks': plankField(s, rgb(0x7a5a3a), { nails: true, salt: SALT + 25 }); return true;
      case 'spruce_leaves': leaves(s, 138, 0.34, SALT + 26); return true;
      case 'dark_log': barkField(s, rgb(0x3a2b1c), { knots: true, salt: SALT + 27 }); return true;
      case 'dark_log_top': ringField(s, rgb(0x281c12), rgb(0x62472c), rgb(0x74542f), rgb(0x4a3420)); return true;
      case 'dark_planks': plankField(s, rgb(0x66492c), { knots: true, salt: SALT + 28 }); return true;
      case 'dark_leaves': leaves(s, 130, 0.36, SALT + 29); return true;
      case 'coal_ore': oreField(s, rgb(0x2c2c2e), { stone: mossStone, count: 7, big: 0.45, salt: SALT + 30 }); return true;
      case 'copper_ore': oreField(s, rgb(0xc87850), { stone: mossStone, count: 6, big: 0.45, salt: SALT + 31 }); return true;
      case 'iron_ore': oreField(s, rgb(0xd0b098), { stone: mossStone, count: 6, big: 0.45, salt: SALT + 32 }); return true;
      case 'gold_ore': oreField(s, rgb(0xe8c04a), { stone: mossStone, count: 5, big: 0.5, salt: SALT + 33 }); return true;
      case 'ember_ore': oreField(s, rgb(0xe85526), { stone: deepMossStone, count: 6, big: 0.55, sparkle: true, salt: SALT + 34 }); return true;
      case 'crystal_ore': oreField(s, rgb(0x62d6c4), { stone: deepMossStone, count: 4, big: 0.55, sparkle: true, salt: SALT + 35 }); return true;
      case 'tall_grass': plantField(s, 'grass', SALT); return true;
      case 'fern': plantField(s, 'fern', SALT); return true;
      case 'flower_red': plant(s, 'flower', [rgb(0xc23e3a), rgb(0xe0b84a), rgb(0x5f8a3e)], SALT); return true;
      case 'flower_yellow': plant(s, 'flower', [rgb(0xdca83c), rgb(0x8a5c22), rgb(0x5f8a3e)], SALT); return true;
      case 'flower_blue': plant(s, 'flower', [rgb(0x5478c4), rgb(0xe0cc5a), rgb(0x5f8a3e)], SALT); return true;
      case 'mushroom_brown': plant(s, 'mushroom', [rgb(0x8c6a4a), false as unknown as RGB], SALT); return true;
      case 'mushroom_red': plant(s, 'mushroom', [rgb(0xc03a34), true as unknown as RGB], SALT); return true;
      case 'dead_bush': plant(s, 'bush', [rgb(0x7a5c34), rgb(0x9a7a44)], SALT); return true;
      case 'cactus_side': cactusField(s, rgb(0x5f8f48), false); return true;
      case 'cactus_top': cactusField(s, rgb(0x6f9f52), true); return true;
      case 'reeds': plant(s, 'reeds', [rgb(0x9ab86a), rgb(0x6f9a44)], SALT); return true;
      case 'pumpkin_side': gourdField(s, rgb(0xd07c28), { salt: SALT }); return true;
      case 'pumpkin_top': gourdField(s, rgb(0xc87a2c), { top: true, salt: SALT }); return true;
      case 'melon_side': gourdField(s, rgb(0x6e9e4c), { watermelon: true, salt: SALT }); return true;
      case 'melon_top': gourdField(s, rgb(0x6e9e4c), { top: true, watermelon: true, salt: SALT }); return true;
      case 'stripped_log': strippedField(s, rgb(0xa8834e), SALT + 50); return true;
      case 'stripped_log_top': ringField(s, shade(rgb(0xa8834e), 0.7), shade(rgb(0xa8834e), 1.05), shade(rgb(0xa8834e), 1.15), shade(rgb(0xa8834e), 0.85)); return true;
      case 'oak_sapling': saplingField(s, rgb(0x9ec46a), rgb(0x7c5c34), 'round', SALT); return true;
      case 'birch_sapling': saplingField(s, rgb(0xbcd88a), rgb(0xd8d0c0), 'birch', SALT); return true;
      case 'spruce_sapling': saplingField(s, rgb(0x7fa860), rgb(0x6a4a28), 'cone', SALT); return true;
      case 'crafting_table_top': tableField(s, rgb(0xa8834e), 'top', SALT); return true;
      case 'crafting_table_side': tableField(s, rgb(0xa8834e), 'side', SALT); return true;
      case 'furnace_side': cobbleField(s, rgb(0x7e786c), { moss: MOSS, mossP: 0.95, scatter: 0.06, cells: 10, salt: SALT + 50 }); return true;
      case 'furnace_front': furnaceFrontField(s, (t) => cobbleField(t, rgb(0x7e786c), { moss: MOSS, mossP: 0.95, scatter: 0.06, cells: 10, salt: SALT + 50 }), false, SALT); return true;
      case 'furnace_front_lit': furnaceFrontField(s, (t) => cobbleField(t, rgb(0x7e786c), { moss: MOSS, mossP: 0.95, scatter: 0.06, cells: 10, salt: SALT + 50 }), true, SALT); return true;
      case 'chest_top': chestField(s, rgb(0xa8834e), rgb(0x5a5348), 'top'); return true;
      case 'chest_side': chestField(s, rgb(0xa8834e), rgb(0x5a5348), 'side'); return true;
      case 'chest_front': chestField(s, rgb(0xa8834e), rgb(0x5a5348), 'front'); return true;
      case 'torch': lightSpriteField(s, 'torch', shade(rgb(0xa8834e), 0.9), rgb(0xffa028), rgb(0x5a5348), SALT); return true;
      case 'lantern': lightSpriteField(s, 'lantern', shade(rgb(0xa8834e), 0.9), rgb(0xffc84a), rgb(0x5a5348), SALT); return true;
      case 'ladder': ladderField(s, rgb(0xa8834e), SALT); return true;
      case 'door_top': panelField(s, shade(rgb(0xa8834e), 0.96), { top: true, handle: true, salt: SALT }); return true;
      case 'door_bottom': panelField(s, shade(rgb(0xa8834e), 0.96), { bands: true, salt: SALT }); return true;
      case 'barrel_side': barrelField(s, shade(rgb(0xa8834e), 0.96), false, SALT); return true;
      case 'barrel_top': barrelField(s, shade(rgb(0xa8834e), 0.96), true, SALT); return true;
      default: return false;
    }
  },
  paintItem(id, s) {
    switch (id) {
      case 'coal': case 'charcoal': lumpItem(s, id === 'coal' ? rgb(0x2e2e30) : rgb(0x3a322a)); return true;
      case 'raw_copper': lumpItem(s, rgb(0xc27a4c)); return true;
      case 'raw_iron': lumpItem(s, rgb(0xd0aa8c)); return true;
      case 'raw_gold': lumpItem(s, rgb(0xe0b83c)); return true;
      case 'copper_ingot': ingotItem(s, rgb(0xc87c4c)); return true;
      case 'iron_ingot': ingotItem(s, rgb(0xc8c8c4)); return true;
      case 'gold_ingot': ingotItem(s, rgb(0xe8c042)); return true;
      case 'ember_dust': dustItem(s, rgb(0xe4551f)); return true;
      case 'lumen_shard': dustItem(s, rgb(0xe8d070)); return true;
      case 'sky_crystal': gemItem(s, rgb(0x62d6c4)); return true;
      case 'void_essence': gemItem(s, rgb(0x7a4ac0)); return true;
      case 'stick': stickItem(s, rgb(0x7a5a34)); return true;
      case 'apple': fruitItem(s, rgb(0xc44a3a), rgb(0x5f8a3e)); return true;
      case 'bread': loafItem(s, rgb(0xbc8848)); return true;
      case 'wheat': sheafItem(s, rgb(0xc0a041), rgb(0x8a7a3a)); return true;
      case 'clay_ball': lumpItem(s, rgb(0x9aa094)); return true;
      case 'flint': flintItem(s, rgb(0x3a3a38)); return true;
      case 'snowball': ballItem(s, rgb(0xeef4fb)); return true;
      case 'leather': peltItem(s, rgb(0x9a6238)); return true;
      case 'feather': featherItem(s, rgb(0xe8e8e0)); return true;
      case 'bone': boneItem(s, rgb(0xe0dcc4)); return true;
      case 'string': cordItem(s, rgb(0xe0e0d8)); return true;
      case 'spider_silk': cordItem(s, rgb(0xb8aed6)); return true;
      default: return false;
    }
  },
});

// ==========================================================================================
// Gilded Ores — the miner's pack: cool granite, chunky faceted gems with occlusion rings and
// specular sparkle, honey timber. Built to make veins readable from across a cave.
// ==========================================================================================
registerArtist({
  id: 'gilded_ores',
  tiles: [...TILES],
  items: [...ITEMS],
  preview: [
    'gold_ore', 'crystal_ore', 'iron_ore', 'coal_ore', 'stone', 'deep_stone', 'cobblestone', 'oak_planks',
    'sandstone_side', 'terracotta', 'glass', 'bricks', 'oak_log', 'oak_leaves', 'furnace_front_lit', 'barrel_side',
  ],
  paint(tile, s) {
    const SALT = 41;
    const granite = () => {
      stoneField(s, rgb(0x82828c), { blotch: 0.42, pebbles: 5, cracks: 3, salt: SALT });
      for (let i = 0; i < 5; i++) { const x = s.ri(N), y = s.ri(N); s.set(x, y, rgb(0xc2c2ce)); }
    };
    const darkGranite = () => {
      stoneField(s, rgb(0x52525c), { blotch: 0.46, pebbles: 4, cracks: 4, salt: SALT + 1 });
      for (let i = 0; i < 4; i++) { const x = s.ri(N), y = s.ri(N); s.set(x, y, rgb(0x7c7c88)); }
    };
    const soil = (base: number) => grainField(s, rgb(base), { scale: 3, lumps: 4, salt: SALT + 2 });
    switch (tile) {
      case 'stone': granite(); return true;
      case 'deep_stone': darkGranite(); return true;
      case 'dirt': soil(0x7c5a3a); return true;
      case 'mud': soil(0x4c3a2c); return true;
      case 'grass_top': grassTopField(s, SALT + 3, 'speckled'); return true;
      case 'grass_side': grassSideField(s, false, () => soil(0x7c5a3a), SALT + 4); return true;
      case 'snow_grass_side': grassSideField(s, true, () => soil(0x7c5a3a), SALT + 4); return true;
      case 'farmland': farmlandField(s, rgb(0x6c4e30), SALT + 5); return true;
      case 'sand': grainField(s, rgb(0xdcd0a0), { scale: 3.6, lumps: 2, dark: 0.86, light: 1.06, salt: SALT + 6 }); return true;
      case 'red_sand': grainField(s, rgb(0xba6a34), { scale: 3.4, lumps: 2, salt: SALT + 7 }); return true;
      case 'gravel': grainField(s, rgb(0x8e8a86), { scale: 2.4, lumps: 9, grainP: 0.15, salt: SALT + 8 }); return true;
      case 'clay': grainField(s, rgb(0xa8aeb6), { scale: 3.6, lumps: 2, salt: SALT + 9 }); return true;
      case 'snow': grainField(s, rgb(0xf2f8ff), { scale: 4, lumps: 2, dark: 0.93, light: 1.02, salt: SALT + 10 }); return true;
      case 'ice': iceField(s, rgb(0xaacdf0)); return true;
      case 'packed_ice': iceField(s, rgb(0x8cb8e0)); return true;
      case 'water': waterField(s, rgb(0x2b58c0)); return true;
      case 'bedrock': stoneField(s, rgb(0x44444a), { blotch: 0.8, pebbles: 6, cracks: 6, salt: SALT + 11 }); return true;
      case 'sandstone_top': grainField(s, rgb(0xdccf94), { scale: 4, lumps: 2, salt: SALT + 12 }); return true;
      case 'sandstone_side': brickField(s, rgb(0xd8c98e), rgb(0xb0a068), { bw: 16, bh: 5, salt: SALT + 13 }); return true;
      case 'terracotta': grainField(s, rgb(0xa85e3c), { scale: 3.4, lumps: 2, salt: SALT + 14 }); return true;
      case 'bricks': brickField(s, rgb(0xa8523c), rgb(0xbeb0a0), { salt: SALT + 15 }); return true;
      case 'stone_bricks': brickField(s, rgb(0x84848c), rgb(0x4a4a52), { salt: SALT + 16 }); return true;
      case 'cobblestone': cobbleField(s, rgb(0x8a8a94), { cells: 11, salt: SALT + 17 }); return true;
      case 'mossy_cobblestone': cobbleField(s, rgb(0x84848c), { moss: rgb(0x6f8a46), mossP: 0.5, cells: 11, salt: SALT + 17 }); return true;
      case 'glass': glassField(s, rgb(0xcfe6ff)); return true;
      case 'wool': weaveField(s, rgb(0xe8ecf2), SALT + 18); return true;
      case 'oak_log': barkField(s, rgb(0x6a4e2c), { knots: true, salt: SALT + 19 }); return true;
      case 'oak_log_top': ringField(s, rgb(0x4c3720), rgb(0xa87e42), rgb(0xc09a56), rgb(0x84602f)); return true;
      case 'oak_planks': plankField(s, rgb(0xbe8c46), { nails: true, knots: true, weather: 1, salt: SALT + 20 }); return true;
      case 'oak_leaves': leaves(s, 146, 0.32, SALT + 21); return true;
      case 'birch_log': barkField(s, rgb(0xe2ded0), { salt: SALT + 22 });
        for (let i = 0; i < 6; i++) { const x = 1 + Math.floor(s.hash(i, 6, 2) * 12); const y = 1 + Math.floor(s.hash(8, i, 2) * 13); const w = 1 + Math.floor(s.hash(i, 9, 2) * 3); for (let k = 0; k < w; k++) s.set(x + k, y, rgb(0x2e2e2a)); }
        return true;
      case 'birch_log_top': ringField(s, rgb(0x2e2e2a), rgb(0xd8cc9e), rgb(0xe8dcb4), rgb(0xbaa478)); return true;
      case 'birch_planks': plankField(s, rgb(0xe0cc96), { nails: true, salt: SALT + 23 }); return true;
      case 'birch_leaves': leaves(s, 164, 0.3, SALT + 24); return true;
      case 'spruce_log': barkField(s, rgb(0x4e3622), { knots: true, salt: SALT + 25 }); return true;
      case 'spruce_log_top': ringField(s, rgb(0x33231a), rgb(0x7a5a30), rgb(0x8f6c3a), rgb(0x5c4022)); return true;
      case 'spruce_planks': plankField(s, rgb(0x8c6236), { nails: true, knots: true, salt: SALT + 26 }); return true;
      case 'spruce_leaves': leaves(s, 134, 0.34, SALT + 27); return true;
      case 'dark_log': barkField(s, rgb(0x402d1a), { knots: true, salt: SALT + 28 }); return true;
      case 'dark_log_top': ringField(s, rgb(0x2a1d10), rgb(0x6a4a26), rgb(0x7e5a2e), rgb(0x4e361c)); return true;
      case 'dark_planks': plankField(s, rgb(0x70502c), { knots: true, salt: SALT + 29 }); return true;
      case 'dark_leaves': leaves(s, 126, 0.36, SALT + 30); return true;
      case 'coal_ore': oreField(s, rgb(0x33333a), { stone: granite, count: 8, big: 0.6, sparkle: true, salt: SALT + 31 }); return true;
      case 'copper_ore': oreField(s, rgb(0xd07a3c), { stone: granite, count: 8, big: 0.6, sparkle: true, salt: SALT + 32 }); return true;
      case 'iron_ore': oreField(s, rgb(0xdcd6c0), { stone: granite, count: 8, big: 0.6, sparkle: true, salt: SALT + 33 }); return true;
      case 'gold_ore': oreField(s, rgb(0xf2cc44), { stone: granite, count: 7, big: 0.65, sparkle: true, salt: SALT + 34 }); return true;
      case 'ember_ore': oreField(s, rgb(0xf25a22), { stone: darkGranite, count: 8, big: 0.65, sparkle: true, salt: SALT + 35 }); return true;
      case 'crystal_ore': oreField(s, rgb(0x5ce4e0), { stone: darkGranite, count: 7, big: 0.7, sparkle: true, salt: SALT + 36 }); return true;
      case 'tall_grass': plantField(s, 'grass', SALT + 37); return true;
      case 'fern': plantField(s, 'fern', SALT + 37); return true;
      case 'flower_red': plant(s, 'flower', [rgb(0xd04040), rgb(0xf0c850), rgb(0x4f8a3a)], SALT + 38); return true;
      case 'flower_yellow': plant(s, 'flower', [rgb(0xf0c840), rgb(0x96621c), rgb(0x4f8a3a)], SALT + 38); return true;
      case 'flower_blue': plant(s, 'flower', [rgb(0x5a7cd8), rgb(0xf0e070), rgb(0x4f8a3a)], SALT + 38); return true;
      case 'mushroom_brown': plant(s, 'mushroom', [rgb(0x94704c), false as unknown as RGB], SALT + 39); return true;
      case 'mushroom_red': plant(s, 'mushroom', [rgb(0xd03030), true as unknown as RGB], SALT + 39); return true;
      case 'dead_bush': plant(s, 'bush', [rgb(0x7e5c30), rgb(0xa07c40)], SALT + 40); return true;
      case 'cactus_side': cactusField(s, rgb(0x5f9a3c), false); return true;
      case 'cactus_top': cactusField(s, rgb(0x6faa46), true); return true;
      case 'reeds': plant(s, 'reeds', [rgb(0x9cc060), rgb(0x6f9a44)], SALT + 41); return true;
      case 'pumpkin_side': gourdField(s, rgb(0xd8862c), { salt: SALT + 42 }); return true;
      case 'pumpkin_top': gourdField(s, rgb(0xd08028), { top: true, salt: SALT + 42 }); return true;
      case 'melon_side': gourdField(s, rgb(0x74a848), { watermelon: true, salt: SALT + 43 }); return true;
      case 'melon_top': gourdField(s, rgb(0x74a848), { top: true, watermelon: true, salt: SALT + 43 }); return true;
      case 'stripped_log': strippedField(s, rgb(0xbe8c46), SALT + 50); return true;
      case 'stripped_log_top': ringField(s, shade(rgb(0xbe8c46), 0.7), shade(rgb(0xbe8c46), 1.05), shade(rgb(0xbe8c46), 1.15), shade(rgb(0xbe8c46), 0.85)); return true;
      case 'oak_sapling': saplingField(s, rgb(0x9ec46a), rgb(0x8a6634), 'round', SALT + 50); return true;
      case 'birch_sapling': saplingField(s, rgb(0xbcd88a), rgb(0xd8d0c0), 'birch', SALT + 50); return true;
      case 'spruce_sapling': saplingField(s, rgb(0x7fa860), rgb(0x6a4a28), 'cone', SALT + 50); return true;
      case 'crafting_table_top': tableField(s, rgb(0xbe8c46), 'top', SALT + 50); return true;
      case 'crafting_table_side': tableField(s, rgb(0xbe8c46), 'side', SALT + 50); return true;
      case 'furnace_side': cobbleField(s, rgb(0x8a8a94), { cells: 11, salt: SALT + 50 }); return true;
      case 'furnace_front': furnaceFrontField(s, (t) => cobbleField(t, rgb(0x8a8a94), { cells: 11, salt: SALT + 50 }), false, SALT); return true;
      case 'furnace_front_lit': furnaceFrontField(s, (t) => cobbleField(t, rgb(0x8a8a94), { cells: 11, salt: SALT + 50 }), true, SALT); return true;
      case 'chest_top': chestField(s, rgb(0xbe8c46), rgb(0x6a6252), 'top'); return true;
      case 'chest_side': chestField(s, rgb(0xbe8c46), rgb(0x6a6252), 'side'); return true;
      case 'chest_front': chestField(s, rgb(0xbe8c46), rgb(0x6a6252), 'front'); return true;
      case 'torch': lightSpriteField(s, 'torch', shade(rgb(0xbe8c46), 0.9), rgb(0xffb038), rgb(0x6a6252), SALT); return true;
      case 'lantern': lightSpriteField(s, 'lantern', shade(rgb(0xbe8c46), 0.9), rgb(0xffd45a), rgb(0x6a6252), SALT); return true;
      case 'ladder': ladderField(s, rgb(0xbe8c46), SALT); return true;
      case 'door_top': panelField(s, shade(rgb(0xbe8c46), 0.96), { top: true, handle: true, salt: SALT }); return true;
      case 'door_bottom': panelField(s, shade(rgb(0xbe8c46), 0.96), { bands: true, salt: SALT }); return true;
      case 'barrel_side': barrelField(s, shade(rgb(0xbe8c46), 0.96), false, SALT); return true;
      case 'barrel_top': barrelField(s, shade(rgb(0xbe8c46), 0.96), true, SALT); return true;
      default: return false;
    }
  },
  paintItem(id, s) {
    switch (id) {
      case 'coal': case 'charcoal': lumpItem(s, id === 'coal' ? rgb(0x2a2a30) : rgb(0x3a3028)); return true;
      case 'raw_copper': lumpItem(s, rgb(0xc8823c)); return true;
      case 'raw_iron': lumpItem(s, rgb(0xdcd6c0)); return true;
      case 'raw_gold': lumpItem(s, rgb(0xf0c83c)); return true;
      case 'copper_ingot': ingotItem(s, rgb(0xd8863c)); return true;
      case 'iron_ingot': ingotItem(s, rgb(0xdcdcd8)); return true;
      case 'gold_ingot': ingotItem(s, rgb(0xf5d040)); return true;
      case 'ember_dust': dustItem(s, rgb(0xf25a22)); return true;
      case 'lumen_shard': dustItem(s, rgb(0xf2dc6c)); return true;
      case 'sky_crystal': gemItem(s, rgb(0x5ce4e0)); return true;
      case 'void_essence': gemItem(s, rgb(0x8a52d8)); return true;
      case 'stick': stickItem(s, rgb(0x8a6634)); return true;
      case 'apple': fruitItem(s, rgb(0xd04030), rgb(0x5f9a3c)); return true;
      case 'bread': loafItem(s, rgb(0xc8924a)); return true;
      case 'wheat': sheafItem(s, rgb(0xd0ac44), rgb(0x9a8038)); return true;
      case 'clay_ball': lumpItem(s, rgb(0xa8aeb6)); return true;
      case 'flint': flintItem(s, rgb(0x3c3c3e)); return true;
      case 'snowball': ballItem(s, rgb(0xf2f8ff)); return true;
      case 'leather': peltItem(s, rgb(0xa8683c)); return true;
      case 'feather': featherItem(s, rgb(0xf0f0ea)); return true;
      case 'bone': boneItem(s, rgb(0xe8e4cc)); return true;
      case 'string': cordItem(s, rgb(0xe8e8e0)); return true;
      case 'spider_silk': cordItem(s, rgb(0xc0b6de)); return true;
      default: return false;
    }
  },
});

// ==========================================================================================
// Cloudsoft Pastels — the builder's pack: palette-knife softness, ordered-dither shading,
// rounded bevels and a cream/pastel material set that stays cohesive in daylight.
// ==========================================================================================
registerArtist({
  id: 'cloudsoft',
  tiles: [...TILES],
  items: [...ITEMS],
  preview: [
    'wool', 'sandstone_top', 'oak_planks', 'birch_planks', 'bricks', 'stone_bricks', 'glass', 'crystal_ore',
    'grass_top', 'cobblestone', 'sand', 'clay', 'lantern', 'crafting_table_top', 'door_top', 'chest_front',
  ],
  paint(tile, s) {
    const SALT = 71;
    const soft = (base: number, scale = 3.4) => {
      const pal = ramp(rgb(base), 0.9, 1.06, 6);
      s.each((x, y) => {
        const v = s.blob(x, y, scale, SALT) * 0.86 + (((y % 4) * 4 + (x % 4)) % 16) / 16 * 0.14;
        return pal[Math.max(0, Math.min(5, Math.floor(v * 6)))];
      });
    };
    const pastelStone = () => {
      soft(0xb8b8c6, 4);
      for (let i = 0; i < 5; i++) {
        const cx = s.ri(N), cy = s.ri(N);
        const inside = (x: number, y: number) => ((x - cx + 8) % 16 - 8) ** 2 / 3.2 + ((y - cy + 8) % 16 - 8) ** 2 / 2.4 <= 1;
        for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 2; x <= cx + 2; x++) if (inside(x, y)) s.set(x, y, shade(rgb(0xc8c8d6), 0.98));
      }
    };
    const soil = (base: number) => { soft(base, 3); for (let i = 0; i < 26; i++) { const x = s.ri(N), y = s.ri(N); s.set(x, y, shade(rgb(base), 0.86)); } };
    switch (tile) {
      case 'stone': pastelStone(); return true;
      case 'deep_stone': soft(0x8e90a0, 4); return true;
      case 'dirt': soil(0xb08a68); return true;
      case 'mud': soil(0x94807a); return true;
      case 'grass_top': grassTopField(s, SALT + 1, 'soft'); return true;
      case 'grass_side': grassSideField(s, false, () => soil(0xb08a68), SALT + 2); return true;
      case 'snow_grass_side': grassSideField(s, true, () => soil(0xb08a68), SALT + 2); return true;
      case 'farmland': farmlandField(s, rgb(0xa07c58), SALT + 3); return true;
      case 'sand': soft(0xe8dcb4, 4); return true;
      case 'red_sand': soft(0xe0a894, 3.4); return true;
      case 'gravel': soft(0xc8c4c8, 2.6); for (let i = 0; i < 20; i++) { const x = s.ri(N), y = s.ri(N); s.set(x, y, shade(rgb(0xc8c4c8), 0.86)); } return true;
      case 'clay': soft(0xd6dae4, 3.6); return true;
      case 'snow': grainField(s, rgb(0xf6fbff), { scale: 4.2, lumps: 2, dark: 0.95, light: 1.01, salt: SALT + 4 }); return true;
      case 'ice': iceField(s, rgb(0xc4e0f8)); return true;
      case 'packed_ice': iceField(s, rgb(0xa8ccf0)); return true;
      case 'water': waterField(s, rgb(0x5f9ee0)); return true;
      case 'bedrock': soft(0x8a8a92, 5); return true;
      case 'sandstone_top': soft(0xf0e4bc, 4.4); return true;
      case 'sandstone_side': brickField(s, rgb(0xf0e2b8), rgb(0xd2c096), { bw: 16, bh: 5, salt: SALT + 5 }); return true;
      case 'terracotta': soft(0xe0a894, 3.6); return true;
      case 'bricks': brickField(s, rgb(0xe0a0a0), rgb(0xf2e8dc), { salt: SALT + 6 }); return true;
      case 'stone_bricks': brickField(s, rgb(0xc0c0ce), rgb(0x9a9aaa), { salt: SALT + 7 }); return true;
      case 'cobblestone': cobbleField(s, rgb(0xb6b6c4), { cells: 9, salt: SALT + 8 }); return true;
      case 'mossy_cobblestone': cobbleField(s, rgb(0xb0b0be), { moss: rgb(0x9cc48a), mossP: 0.55, cells: 8, salt: SALT + 8 }); return true;
      case 'glass': glassField(s, rgb(0xd8ecf6)); return true;
      case 'wool': weaveField(s, rgb(0xf6eeee), SALT + 9); return true;
      case 'oak_log': barkField(s, rgb(0xb08a62), { knots: true, salt: SALT + 10 }); return true;
      case 'oak_log_top': ringField(s, rgb(0x8f6d4c), rgb(0xd8b487), rgb(0xe6c8a0), rgb(0xbc9a72)); return true;
      case 'oak_planks': plankField(s, rgb(0xe0c69c), { nails: true, knots: true, salt: SALT + 11 }); return true;
      case 'oak_leaves': leaves(s, 178, 0.26, SALT + 12); return true;
      case 'birch_log': barkField(s, rgb(0xeee6da), { salt: SALT + 13 }); return true;
      case 'birch_log_top': ringField(s, rgb(0xa89a90), rgb(0xe2d4b8), rgb(0xeee0c4), rgb(0xc4b498)); return true;
      case 'birch_planks': plankField(s, rgb(0xf2e4c4), { nails: true, salt: SALT + 14 }); return true;
      case 'birch_leaves': leaves(s, 190, 0.24, SALT + 15); return true;
      case 'spruce_log': barkField(s, rgb(0x8a6b50), { knots: true, salt: SALT + 16 }); return true;
      case 'spruce_log_top': ringField(s, rgb(0x6f5238), rgb(0xb99a74), rgb(0xc4a37c), rgb(0x9a7b58)); return true;
      case 'spruce_planks': plankField(s, rgb(0xd0aa80), { nails: true, knots: true, salt: SALT + 17 }); return true;
      case 'spruce_leaves': leaves(s, 166, 0.3, SALT + 18); return true;
      case 'dark_log': barkField(s, rgb(0x7a5f48), { knots: true, salt: SALT + 19 }); return true;
      case 'dark_log_top': ringField(s, rgb(0x60472f), rgb(0xa88a64), rgb(0xb2946c), rgb(0x8a6f4c)); return true;
      case 'dark_planks': plankField(s, rgb(0xb4906c), { knots: true, salt: SALT + 20 }); return true;
      case 'dark_leaves': leaves(s, 158, 0.32, SALT + 21); return true;
      case 'coal_ore': oreField(s, rgb(0x6a6a78), { stone: pastelStone, count: 6, big: 0.4, salt: SALT + 22 }); return true;
      case 'copper_ore': oreField(s, rgb(0xe0a488), { stone: pastelStone, count: 6, big: 0.4, salt: SALT + 23 }); return true;
      case 'iron_ore': oreField(s, rgb(0xdcd0c8), { stone: pastelStone, count: 6, big: 0.4, salt: SALT + 24 }); return true;
      case 'gold_ore': oreField(s, rgb(0xf2d488), { stone: pastelStone, count: 5, big: 0.45, salt: SALT + 25 }); return true;
      case 'ember_ore': oreField(s, rgb(0xf0a088), { stone: pastelStone, count: 6, big: 0.45, salt: SALT + 26 }); return true;
      case 'crystal_ore': oreField(s, rgb(0xa8e4ec), { stone: pastelStone, count: 5, big: 0.5, salt: SALT + 27 }); return true;
      case 'tall_grass': plantField(s, 'grass', SALT + 28); return true;
      case 'fern': plantField(s, 'fern', SALT + 28); return true;
      case 'flower_red': plant(s, 'flower', [rgb(0xf08a90), rgb(0xf6e08c), rgb(0x9cc47c)], SALT + 29); return true;
      case 'flower_yellow': plant(s, 'flower', [rgb(0xf6dc84), rgb(0xd0a45c), rgb(0x9cc47c)], SALT + 29); return true;
      case 'flower_blue': plant(s, 'flower', [rgb(0x9cb8f0), rgb(0xf6e8a8), rgb(0x9cc47c)], SALT + 29); return true;
      case 'mushroom_brown': plant(s, 'mushroom', [rgb(0xc0a084), false as unknown as RGB], SALT + 30); return true;
      case 'mushroom_red': plant(s, 'mushroom', [rgb(0xf08a84), true as unknown as RGB], SALT + 30); return true;
      case 'dead_bush': plant(s, 'bush', [rgb(0xc0a480), rgb(0xd8bc94)], SALT + 31); return true;
      case 'cactus_side': cactusField(s, rgb(0x9cc47c), false); return true;
      case 'cactus_top': cactusField(s, rgb(0xa8d088), true); return true;
      case 'reeds': plant(s, 'reeds', [rgb(0xc8dc9c), rgb(0x9cc47c)], SALT + 32); return true;
      case 'pumpkin_side': gourdField(s, rgb(0xe8b878), { salt: SALT + 33 }); return true;
      case 'pumpkin_top': gourdField(s, rgb(0xe4b474), { top: true, salt: SALT + 33 }); return true;
      case 'melon_side': gourdField(s, rgb(0xa8d09c), { watermelon: true, salt: SALT + 34 }); return true;
      case 'melon_top': gourdField(s, rgb(0xa8d09c), { top: true, watermelon: true, salt: SALT + 34 }); return true;
      case 'stripped_log': strippedField(s, rgb(0xe0c69c), SALT + 50); return true;
      case 'stripped_log_top': ringField(s, shade(rgb(0xe0c69c), 0.7), shade(rgb(0xe0c69c), 1.05), shade(rgb(0xe0c69c), 1.15), shade(rgb(0xe0c69c), 0.85)); return true;
      case 'oak_sapling': saplingField(s, rgb(0x9ec46a), rgb(0xc0a480), 'round', SALT + 50); return true;
      case 'birch_sapling': saplingField(s, rgb(0xbcd88a), rgb(0xd8d0c0), 'birch', SALT + 50); return true;
      case 'spruce_sapling': saplingField(s, rgb(0x7fa860), rgb(0x6a4a28), 'cone', SALT + 50); return true;
      case 'crafting_table_top': tableField(s, rgb(0xe0c69c), 'top', SALT + 50); return true;
      case 'crafting_table_side': tableField(s, rgb(0xe0c69c), 'side', SALT + 50); return true;
      case 'furnace_side': cobbleField(s, rgb(0xb6b6c4), { cells: 9, salt: SALT + 50 }); return true;
      case 'furnace_front': furnaceFrontField(s, (t) => cobbleField(t, rgb(0xb6b6c4), { cells: 9, salt: SALT + 50 }), false, SALT); return true;
      case 'furnace_front_lit': furnaceFrontField(s, (t) => cobbleField(t, rgb(0xb6b6c4), { cells: 9, salt: SALT + 50 }), true, SALT); return true;
      case 'chest_top': chestField(s, rgb(0xe0c69c), rgb(0x9a94a0), 'top'); return true;
      case 'chest_side': chestField(s, rgb(0xe0c69c), rgb(0x9a94a0), 'side'); return true;
      case 'chest_front': chestField(s, rgb(0xe0c69c), rgb(0x9a94a0), 'front'); return true;
      case 'torch': lightSpriteField(s, 'torch', shade(rgb(0xe0c69c), 0.9), rgb(0xffc898), rgb(0x9a94a0), SALT); return true;
      case 'lantern': lightSpriteField(s, 'lantern', shade(rgb(0xe0c69c), 0.9), rgb(0xfff0c0), rgb(0x9a94a0), SALT); return true;
      case 'ladder': ladderField(s, rgb(0xe0c69c), SALT); return true;
      case 'door_top': panelField(s, shade(rgb(0xe0c69c), 0.96), { top: true, handle: true, salt: SALT }); return true;
      case 'door_bottom': panelField(s, shade(rgb(0xe0c69c), 0.96), { bands: true, salt: SALT }); return true;
      case 'barrel_side': barrelField(s, shade(rgb(0xe0c69c), 0.96), false, SALT); return true;
      case 'barrel_top': barrelField(s, shade(rgb(0xe0c69c), 0.96), true, SALT); return true;
      default: return false;
    }
  },
  paintItem(id, s) {
    switch (id) {
      case 'coal': case 'charcoal': lumpItem(s, id === 'coal' ? rgb(0x6a6a78) : rgb(0x8a7c72)); return true;
      case 'raw_copper': lumpItem(s, rgb(0xe0a488)); return true;
      case 'raw_iron': lumpItem(s, rgb(0xdcd0c8)); return true;
      case 'raw_gold': lumpItem(s, rgb(0xf2d488)); return true;
      case 'copper_ingot': ingotItem(s, rgb(0xe6b092)); return true;
      case 'iron_ingot': ingotItem(s, rgb(0xe4e0dc)); return true;
      case 'gold_ingot': ingotItem(s, rgb(0xf6dc94)); return true;
      case 'ember_dust': dustItem(s, rgb(0xf2a48c)); return true;
      case 'lumen_shard': dustItem(s, rgb(0xf6e8a8)); return true;
      case 'sky_crystal': gemItem(s, rgb(0xa8e4ec)); return true;
      case 'void_essence': gemItem(s, rgb(0xb89ce8)); return true;
      case 'stick': stickItem(s, rgb(0xc0a480)); return true;
      case 'apple': fruitItem(s, rgb(0xf08a84), rgb(0x9cc47c)); return true;
      case 'bread': loafItem(s, rgb(0xe8c496)); return true;
      case 'wheat': sheafItem(s, rgb(0xf0dc94), rgb(0xc8b878)); return true;
      case 'clay_ball': lumpItem(s, rgb(0xd6dae4)); return true;
      case 'flint': flintItem(s, rgb(0x9a94a0)); return true;
      case 'snowball': ballItem(s, rgb(0xf8fcff)); return true;
      case 'leather': peltItem(s, rgb(0xdca884)); return true;
      case 'feather': featherItem(s, rgb(0xf8f4f0)); return true;
      case 'bone': boneItem(s, rgb(0xf2ecd8)); return true;
      case 'string': cordItem(s, rgb(0xf0ece8)); return true;
      case 'spider_silk': cordItem(s, rgb(0xd8c8ee)); return true;
      default: return false;
    }
  },
});
