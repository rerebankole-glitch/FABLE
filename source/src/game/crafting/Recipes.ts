import type { ItemStack } from '../core/types';
import { matchesTag, makeStack } from '../items/Items';

export interface Recipe {
  id: string;
  result: { id: string; count: number };
  pattern?: string[];
  key?: Record<string, string>;
  ingredients?: string[];
}

export const RECIPES: Recipe[] = [];

function shaped(result: string, count: number, pattern: string[], key: Record<string, string>): void {
  RECIPES.push({ id: result + '_' + RECIPES.length, result: { id: result, count }, pattern, key });
}
function shapeless(result: string, count: number, ingredients: string[]): void {
  RECIPES.push({ id: result + '_' + RECIPES.length, result: { id: result, count }, ingredients });
}

// Wood
for (const w of ['oak', 'birch', 'spruce', 'dark']) shapeless(`${w}_planks`, 4, [`${w}_log`]);
shapeless('oak_planks', 4, ['stripped_log']);
shaped('stick', 4, ['P', 'P'], { P: 'tag:planks' });
shaped('crafting_table', 1, ['PP', 'PP'], { P: 'tag:planks' });
shaped('torch', 4, ['C', 'S'], { C: 'tag:coal', S: 'stick' });
shaped('chest', 1, ['PPP', 'P P', 'PPP'], { P: 'tag:planks' });
shaped('barrel', 1, ['PSP', 'P P', 'PSP'], { P: 'tag:planks', S: 'oak_slab' });
shaped('furnace', 1, ['CCC', 'C C', 'CCC'], { C: 'cobblestone' });
shaped('ladder', 3, ['S S', 'SSS', 'S S'], { S: 'stick' });
shaped('oak_door', 3, ['PP', 'PP', 'PP'], { P: 'tag:planks' });
shaped('oak_fence', 3, ['PSP', 'PSP'], { P: 'tag:planks', S: 'stick' });
shaped('oak_slab', 6, ['PPP'], { P: 'tag:planks' });
shaped('stone_slab', 6, ['SSS'], { S: 'stone' });
shaped('cobblestone_slab', 6, ['CCC'], { C: 'cobblestone' });

// ---- Building families -------------------------------------------------------------------------
// Standard voxel-game shapes: stairs from a staircase pattern (mirrored automatically by the
// matcher), walls and gates from their material, trapdoors from planks.
shaped('oak_stairs', 4, ['P  ', 'PP ', 'PPP'], { P: 'tag:planks' });
shaped('stone_stairs', 4, ['S  ', 'SS ', 'SSS'], { S: 'stone' });
shaped('cobblestone_stairs', 4, ['C  ', 'CC ', 'CCC'], { C: 'cobblestone' });
shaped('stone_brick_stairs', 4, ['B  ', 'BB ', 'BBB'], { B: 'stone_bricks' });
shaped('cobblestone_wall', 6, ['CCC', 'CCC'], { C: 'cobblestone' });
shaped('stone_brick_wall', 6, ['BBB', 'BBB'], { B: 'stone_bricks' });
shaped('oak_gate', 1, ['SPS', 'SPS'], { S: 'stick', P: 'tag:planks' });
shaped('oak_trapdoor', 2, ['PPP', 'PPP'], { P: 'tag:planks' });
shaped('birch_slab', 6, ['PPP'], { P: 'birch_planks' });
shaped('spruce_slab', 6, ['PPP'], { P: 'spruce_planks' });
shaped('deep_stone_slab', 6, ['DDD'], { D: 'deep_stone' });
shaped('stone_brick_slab', 6, ['SSS'], { S: 'stone_bricks' });
shaped('stone_bricks', 4, ['SS', 'SS'], { S: 'stone' });
shaped('bricks', 4, ['BB', 'BB'], { B: 'brick' });
shaped('sandstone', 1, ['SS', 'SS'], { S: 'sand' });
shaped('bed', 1, ['WWW', 'PPP'], { W: 'wool', P: 'tag:planks' });
shaped('wool', 1, ['SS', 'SS'], { S: 'string' });
shaped('lantern', 1, ['I', 'T'], { I: 'iron_ingot', T: 'torch' });
shaped('lumen_block', 1, ['LL', 'LL'], { L: 'lumen_shard' });
shaped('glass', 1, ['SS', 'SS'], { S: 'glass' });
shaped('snow_block', 1, ['SS', 'SS'], { S: 'snowball' });
shaped('packed_ice', 1, ['II', 'II'], { I: 'ice' });
shaped('mossy_cobblestone', 1, ['C', 'F'], { C: 'cobblestone', F: 'fern' });
shapeless('fire_striker', 1, ['iron_ingot', 'flint']);
shapeless('mushroom_stew', 1, ['mushroom_brown', 'mushroom_red']);
shaped('bread', 1, ['WWW'], { W: 'wheat' });
shaped('honey_apple', 1, ['GGG', 'GAG', 'GGG'], { G: 'gold_ingot', A: 'apple' });
shaped('bow', 1, [' SW', 'S W', ' SW'], { S: 'stick', W: 'string' });
shaped('shield', 1, ['PIP', 'PPP', ' P '], { P: 'tag:planks', I: 'iron_ingot' });
shaped('arrow', 4, ['F', 'S', 'E'], { F: 'flint', S: 'stick', E: 'feather' });
shaped('voidstone', 4, ['EOE', 'OEO', 'EOE'], { E: 'ember_dust', O: 'cobblestone' });
shaped('rune_altar', 1, ['CLC', 'SVS', 'SSS'], { C: 'sky_crystal', L: 'lumen_shard', S: 'stone_bricks', V: 'voidstone' });
// Spark circuitry. Dust is the cheap bulk item; everything else is a small step up from it, so a
// player who has found ember and copper can wire a door the same session.
shapeless('spark_dust', 4, ['ember_dust', 'copper_ingot']);
shaped('spark_torch', 2, ['D', 'S'], { D: 'spark_dust', S: 'stick' });
shaped('spark_lever', 1, ['S', 'C'], { S: 'stick', C: 'cobblestone' });
shaped('spark_plate', 1, ['CC'], { C: 'cobblestone' });
shaped('shunt', 1, ['PPP', 'CIC', 'CDC'], { P: 'tag:planks', C: 'cobblestone', I: 'iron_ingot', D: 'spark_dust' });

// Alchemy. The flask comes from glass; the hearth is the station that steeps draughts.
shaped('glass_flask', 3, ['G G', ' G '], { G: 'glass' });
shaped('brewing_hearth', 1, [' E ', 'SCS', 'SSS'], { E: 'ember_dust', S: 'stone_bricks', C: 'sky_crystal' });

// The pail: three ingots beaten into a bowl.
shaped('pail', 1, ['I I', ' I '], { I: 'iron_ingot' });

// Trackway, the Ore Cart and the Skiff. Track is made in long runs, the way it is consumed.
shaped('trackway', 16, ['I I', 'ISI', 'I I'], { I: 'iron_ingot', S: 'stick' });
shaped('ore_cart', 1, ['I I', 'III'], { I: 'iron_ingot' });
shaped('skiff', 1, ['P P', 'PPP'], { P: 'tag:planks' });
// The Mending Stone: fuse two worn tools into one, or grind a rune back off.
shaped('mending_stone', 1, ['III', 'SSS', 'SSS'], { I: 'iron_ingot', S: 'stone_bricks' });

// The Ancient Blade: a trophy weapon, priced to match. Crystal for the blade, voidstone for the
// core, a lumen shard in the pommel.
shaped('ancient_blade', 1, [' C ', 'CLC', ' V '], { C: 'sky_crystal', L: 'lumen_shard', V: 'voidstone' });

shapeless('wheat_seeds', 1, ['wheat']);
shapeless('melon_slice', 4, ['melon']);
shaped('melon', 1, ['MMM', 'MMM', 'MMM'], { M: 'melon_slice' });

// Tools
const TOOL_MATS: Record<string, string> = {
  wood: 'tag:planks', stone: 'tag:stone_tool_material', copper: 'copper_ingot', iron: 'iron_ingot', gold: 'gold_ingot', crystal: 'sky_crystal',
};
for (const [tier, m] of Object.entries(TOOL_MATS)) {
  shaped(`${tier}_pickaxe`, 1, ['MMM', ' S ', ' S '], { M: m, S: 'stick' });
  shaped(`${tier}_axe`, 1, ['MM', 'MS', ' S'], { M: m, S: 'stick' });
  shaped(`${tier}_shovel`, 1, ['M', 'S', 'S'], { M: m, S: 'stick' });
  shaped(`${tier}_hoe`, 1, ['MM', ' S', ' S'], { M: m, S: 'stick' });
  shaped(`${tier}_sword`, 1, ['M', 'M', 'S'], { M: m, S: 'stick' });
}
// Armor
const ARMOR_MATS: Record<string, string> = { leather: 'leather', iron: 'iron_ingot', gold: 'gold_ingot', crystal: 'sky_crystal' };
for (const [tier, m] of Object.entries(ARMOR_MATS)) {
  shaped(`${tier}_helmet`, 1, ['AAA', 'A A'], { A: m });
  shaped(`${tier}_chestplate`, 1, ['A A', 'AAA', 'AAA'], { A: m });
  shaped(`${tier}_leggings`, 1, ['AAA', 'A A', 'A A'], { A: m });
  shaped(`${tier}_boots`, 1, ['A A', 'A A'], { A: m });
}

export interface SmeltRecipe { result: string; count: number; xp: number; time: number }
export const SMELTING: Record<string, SmeltRecipe> = {
  raw_iron: { result: 'iron_ingot', count: 1, xp: 1, time: 10 },
  raw_copper: { result: 'copper_ingot', count: 1, xp: 1, time: 10 },
  raw_gold: { result: 'gold_ingot', count: 1, xp: 1, time: 10 },
  iron_ore: { result: 'iron_ingot', count: 1, xp: 1, time: 10 },
  copper_ore: { result: 'copper_ingot', count: 1, xp: 1, time: 10 },
  gold_ore: { result: 'gold_ingot', count: 1, xp: 1, time: 10 },
  sand: { result: 'glass', count: 1, xp: 0.2, time: 10 },
  red_sand: { result: 'glass', count: 1, xp: 0.2, time: 10 },
  cobblestone: { result: 'stone', count: 1, xp: 0.1, time: 10 },
  clay_ball: { result: 'brick', count: 1, xp: 0.3, time: 10 },
  clay: { result: 'terracotta', count: 1, xp: 0.3, time: 10 },
  oak_log: { result: 'charcoal', count: 1, xp: 0.2, time: 10 },
  birch_log: { result: 'charcoal', count: 1, xp: 0.2, time: 10 },
  spruce_log: { result: 'charcoal', count: 1, xp: 0.2, time: 10 },
  dark_log: { result: 'charcoal', count: 1, xp: 0.2, time: 10 },
  potato: { result: 'baked_potato', count: 1, xp: 0.3, time: 10 },
  raw_beef: { result: 'cooked_beef', count: 1, xp: 0.3, time: 10 },
  raw_mutton: { result: 'cooked_mutton', count: 1, xp: 0.3, time: 10 },
  raw_porkchop: { result: 'cooked_porkchop', count: 1, xp: 0.3, time: 10 },
  raw_chicken: { result: 'cooked_chicken', count: 1, xp: 0.3, time: 10 },
  cactus: { result: 'lumen_shard', count: 1, xp: 0.5, time: 10 },
  hellstone: { result: 'ember_dust', count: 1, xp: 0.2, time: 10 },
};

function ingredientMatches(ing: string, id: string): boolean {
  if (ing.startsWith('tag:')) return matchesTag(ing.slice(4), id);
  return ing === id;
}

/** Find the matching recipe for a square crafting grid (size 2 or 3). */
export function matchRecipe(grid: (ItemStack | null)[], size: number): Recipe | null {
  let minX = size, minY = size, maxX = -1, maxY = -1, count = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (grid[y * size + x]) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); count++; }
  }
  if (count === 0) return null;
  const w = maxX - minX + 1, h = maxY - minY + 1;
  for (const r of RECIPES) {
    if (r.pattern) {
      const ph = r.pattern.length, pw = Math.max(...r.pattern.map((p) => p.length));
      if (pw !== w || ph !== h || pw > size || ph > size) continue;
      for (const mirror of [false, true]) {
        let ok = true;
        for (let y = 0; y < h && ok; y++) for (let x = 0; x < w; x++) {
          const px = mirror ? w - 1 - x : x;
          const ch = r.pattern[y][px] ?? ' ';
          const cell = grid[(y + minY) * size + (x + minX)];
          if (ch === ' ') { if (cell) { ok = false; break; } continue; }
          const ing = r.key![ch];
          if (!cell || !ing || !ingredientMatches(ing, cell.id)) { ok = false; break; }
        }
        if (ok) return r;
      }
    } else if (r.ingredients) {
      if (r.ingredients.length !== count) continue;
      const remaining = [...r.ingredients];
      let ok = true;
      for (const cell of grid) {
        if (!cell) continue;
        const idx = remaining.findIndex((ing) => ingredientMatches(ing, cell.id));
        if (idx < 0) { ok = false; break; }
        remaining.splice(idx, 1);
      }
      if (ok && remaining.length === 0) return r;
    }
  }
  return null;
}

export function recipeResult(r: Recipe): ItemStack {
  const s = makeStack(r.result.id, r.result.count);
  return s;
}

/** Consume one of each ingredient from the grid. */
export function consumeGrid(grid: (ItemStack | null)[]): void {
  for (let i = 0; i < grid.length; i++) {
    const s = grid[i];
    if (!s) continue;
    s.count--;
    if (s.count <= 0) grid[i] = null;
  }
}
