import { mulberry32 } from '../world/Noise';
import { ITEMS, makeStack } from '../items/Items';
import type { ItemStack } from '../core/types';

interface LootEntry { id: string; min: number; max: number; weight: number; ench?: boolean }

/** Enchantments known to the game, with the item kinds they apply to and their max level. */
export const ENCHANTMENTS: Record<string, { name: string; max: number; applies: (id: string) => boolean; desc: string }> = {
  sharpness: { name: 'Sharpness', max: 3, applies: (id) => id.endsWith('_sword') || id.endsWith('_axe'), desc: '+1.25 damage per level' },
  knockback: { name: 'Knockback', max: 1, applies: (id) => id.endsWith('_sword'), desc: 'Hits push enemies further' },
  swiftness: { name: 'Swiftness', max: 3, applies: (id) => /_(pickaxe|axe|shovel|hoe)$/.test(id), desc: 'Mine much faster' },
  fortune: { name: 'Fortune', max: 3, applies: (id) => id.endsWith('_pickaxe'), desc: 'More drops from ores' },
  endurance: { name: 'Endurance', max: 3, applies: () => true, desc: 'Chance to not use durability' },
  power: { name: 'Power', max: 3, applies: (id) => id === 'bow', desc: 'Arrows deal more damage' },
  protection: { name: 'Protection', max: 3, applies: (id) => /_(helmet|chestplate|leggings|boots)$/.test(id), desc: 'Reduces all damage taken' },
};

/** Enchantments that can be applied to an item id (in display order). */
export function enchantsFor(id: string): string[] {
  if (!ITEMS.get(id)?.tool && !ITEMS.get(id)?.armor && id !== 'bow') return [];
  return Object.keys(ENCHANTMENTS).filter((k) => ENCHANTMENTS[k].applies(id));
}

export const LOOT_TABLES: Record<string, LootEntry[]> = {
  dungeon: [
    { id: 'bread', min: 1, max: 3, weight: 10 }, { id: 'iron_ingot', min: 1, max: 4, weight: 10 }, { id: 'gold_ingot', min: 1, max: 3, weight: 5 },
    { id: 'string', min: 1, max: 4, weight: 8 }, { id: 'bone', min: 1, max: 4, weight: 8 }, { id: 'coal', min: 2, max: 6, weight: 10 },
    { id: 'ember_dust', min: 1, max: 3, weight: 6 }, { id: 'iron_sword', min: 1, max: 1, weight: 4, ench: true }, { id: 'iron_pickaxe', min: 1, max: 1, weight: 3, ench: true },
    { id: 'honey_apple', min: 1, max: 1, weight: 2 }, { id: 'sky_crystal', min: 1, max: 2, weight: 2 }, { id: 'arrow', min: 4, max: 12, weight: 6 },
    { id: 'torch', min: 3, max: 8, weight: 8 }, { id: 'lumen_shard', min: 1, max: 3, weight: 4 }, { id: 'spider_silk', min: 1, max: 3, weight: 5 },
    { id: 'ancient_blade', min: 1, max: 1, weight: 1, ench: true },
  ],
  village: [
    { id: 'bread', min: 1, max: 4, weight: 15 }, { id: 'apple', min: 1, max: 3, weight: 10 }, { id: 'wheat', min: 2, max: 6, weight: 10 }, { id: 'carrot', min: 2, max: 5, weight: 8 },
    { id: 'potato', min: 2, max: 5, weight: 8 }, { id: 'gold_ingot', min: 1, max: 2, weight: 4 }, { id: 'iron_ingot', min: 1, max: 3, weight: 5 }, { id: 'oak_sapling', min: 1, max: 2, weight: 5 },
    { id: 'leather', min: 1, max: 3, weight: 5 }, { id: 'wheat_seeds', min: 2, max: 6, weight: 8 }, { id: 'iron_helmet', min: 1, max: 1, weight: 2 }, { id: 'leather_boots', min: 1, max: 1, weight: 3 },
    { id: 'egg', min: 1, max: 4, weight: 6 }, { id: 'wool', min: 1, max: 4, weight: 6 }, { id: 'lantern', min: 1, max: 1, weight: 3 },
  ],
  temple: [
    { id: 'sky_crystal', min: 1, max: 3, weight: 5 }, { id: 'iron_ingot', min: 1, max: 5, weight: 12 }, { id: 'gold_ingot', min: 2, max: 7, weight: 12 }, { id: 'ember_dust', min: 1, max: 4, weight: 8 },
    { id: 'bone', min: 4, max: 6, weight: 15 }, { id: 'honey_apple', min: 1, max: 1, weight: 4 }, { id: 'crystal_sword', min: 1, max: 1, weight: 1, ench: true }, { id: 'gold_helmet', min: 1, max: 1, weight: 3, ench: true },
    { id: 'bow', min: 1, max: 1, weight: 4, ench: true }, { id: 'arrow', min: 6, max: 16, weight: 8 }, { id: 'sandstone', min: 4, max: 12, weight: 6 }, { id: 'lumen_shard', min: 2, max: 5, weight: 5 },
  ],
  ruins: [
    { id: 'mossy_cobblestone', min: 2, max: 6, weight: 10 }, { id: 'stone_bricks', min: 2, max: 8, weight: 10 }, { id: 'coal', min: 2, max: 5, weight: 10 }, { id: 'iron_ingot', min: 1, max: 3, weight: 8 },
    { id: 'bread', min: 1, max: 2, weight: 8 }, { id: 'stone_pickaxe', min: 1, max: 1, weight: 4 }, { id: 'stone_sword', min: 1, max: 1, weight: 4 }, { id: 'ember_dust', min: 1, max: 2, weight: 4 },
    { id: 'torch', min: 2, max: 6, weight: 8 }, { id: 'lumen_shard', min: 1, max: 2, weight: 4 }, { id: 'copper_ingot', min: 1, max: 4, weight: 8 },
  ],
  shipwreck: [
    { id: 'iron_ingot', min: 1, max: 5, weight: 10 }, { id: 'gold_ingot', min: 1, max: 5, weight: 8 }, { id: 'copper_ingot', min: 1, max: 5, weight: 8 }, { id: 'sky_crystal', min: 1, max: 1, weight: 3 },
    { id: 'wheat', min: 8, max: 21, weight: 10 }, { id: 'carrot', min: 4, max: 8, weight: 8 }, { id: 'potato', min: 2, max: 6, weight: 8 }, { id: 'leather_chestplate', min: 1, max: 1, weight: 3 },
    { id: 'string', min: 2, max: 6, weight: 8 }, { id: 'oak_planks', min: 4, max: 16, weight: 8 }, { id: 'bow', min: 1, max: 1, weight: 3, ench: true }, { id: 'feather', min: 2, max: 6, weight: 6 },
  ],
  tower: [
    { id: 'arrow', min: 8, max: 24, weight: 12 }, { id: 'bow', min: 1, max: 1, weight: 6, ench: true }, { id: 'iron_ingot', min: 2, max: 5, weight: 10 }, { id: 'ember_dust', min: 2, max: 5, weight: 8 },
    { id: 'iron_chestplate', min: 1, max: 1, weight: 3, ench: true }, { id: 'iron_leggings', min: 1, max: 1, weight: 3 }, { id: 'sky_crystal', min: 1, max: 2, weight: 3 }, { id: 'cooked_beef', min: 2, max: 5, weight: 8 },
    { id: 'lantern', min: 1, max: 2, weight: 5 }, { id: 'gold_ingot', min: 1, max: 4, weight: 6 },
  ],
  void: [
    { id: 'void_essence', min: 2, max: 6, weight: 15 }, { id: 'sky_crystal', min: 1, max: 4, weight: 6 }, { id: 'shadow_wing', min: 1, max: 3, weight: 8 }, { id: 'honey_apple', min: 1, max: 2, weight: 4 },
    { id: 'crystal_sword', min: 1, max: 1, weight: 2, ench: true }, { id: 'crystal_pickaxe', min: 1, max: 1, weight: 2, ench: true }, { id: 'crystal_helmet', min: 1, max: 1, weight: 2, ench: true },
    { id: 'ember_dust', min: 3, max: 8, weight: 10 }, { id: 'lumen_shard', min: 2, max: 6, weight: 8 }, { id: 'voidstone', min: 2, max: 8, weight: 6 }, { id: 'gold_ingot', min: 2, max: 6, weight: 5 },
  ],
};

function enchantFor(id: string, rnd: () => number): Record<string, number> | undefined {
  const pool = enchantsFor(id);
  if (!pool.length) return undefined;
  const out: Record<string, number> = {};
  const n = 1 + (rnd() < 0.3 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const e = pool[Math.floor(rnd() * pool.length)];
    out[e] = Math.max(out[e] ?? 0, 1 + Math.floor(rnd() * ENCHANTMENTS[e].max));
  }
  return out;
}

/** Deterministically fill a container with loot from a table. */
export function generateLoot(table: string, seed: number, slots = 27, rolls?: [number, number]): (ItemStack | null)[] {
  const entries = (LOOT_TABLES[table] ?? LOOT_TABLES.dungeon).filter((e) => ITEMS.has(e.id));
  const rnd = mulberry32(Math.floor(seed) >>> 0);
  const out: (ItemStack | null)[] = new Array(slots).fill(null);
  const [rMin, rMax] = rolls ?? [3, 8];
  const n = rMin + Math.floor(rnd() * (rMax - rMin + 1));
  const totalW = entries.reduce((a, e) => a + e.weight, 0);
  for (let i = 0; i < n; i++) {
    let r = rnd() * totalW;
    let pick = entries[0];
    for (const e of entries) { r -= e.weight; if (r <= 0) { pick = e; break; } }
    const count = pick.min + Math.floor(rnd() * (pick.max - pick.min + 1));
    const stack = makeStack(pick.id, count);
    if (pick.ench && rnd() < 0.7) { const ench = enchantFor(pick.id, rnd); if (ench) stack.ench = ench; }
    let slot = Math.floor(rnd() * slots);
    let tries = 0;
    while (out[slot] && tries < slots) { slot = (slot + 1) % slots; tries++; }
    if (!out[slot]) out[slot] = stack;
  }
  return out;
}

// ------------------------------------------------------------------ Keeper trades

export interface Trade {
  /** what the player pays */
  cost: ItemStack;
  /** optional second payment */
  cost2?: ItemStack;
  /** what the player receives */
  result: ItemStack;
  uses: number;
  maxUses: number;
}

type TradeDef = [cost: [string, number], result: [string, number, Record<string, number>?], maxUses?: number, cost2?: [string, number]];

export const PROFESSION_NAMES = ['Farmer', 'Smith', 'Mystic'];

const BASIC: TradeDef[][] = [
  // 0: farmer – food & farming for gold
  [
    [['wheat', 12], ['gold_ingot', 1], 12], [['carrot', 10], ['gold_ingot', 1], 12], [['potato', 10], ['gold_ingot', 1], 12],
    [['gold_ingot', 1], ['bread', 4], 16], [['gold_ingot', 1], ['apple', 5], 16], [['gold_ingot', 2], ['wheat_seeds', 8], 8],
    [['gold_ingot', 1], ['egg', 4], 8], [['leather', 6], ['gold_ingot', 1], 8], [['gold_ingot', 2], ['oak_sapling', 2], 8],
  ],
  // 1: smith – ores, tools, armour
  [
    [['coal', 12], ['gold_ingot', 1], 12], [['iron_ingot', 3], ['gold_ingot', 1], 12], [['raw_copper', 8], ['gold_ingot', 1], 8],
    [['gold_ingot', 3], ['iron_pickaxe', 1], 4], [['gold_ingot', 3], ['iron_sword', 1], 4], [['gold_ingot', 2], ['iron_helmet', 1], 4],
    [['gold_ingot', 4], ['iron_chestplate', 1], 4], [['gold_ingot', 2], ['iron_boots', 1], 4], [['gold_ingot', 1], ['torch', 12], 16],
  ],
  // 2: mystic – dust, crystals, arrows
  [
    [['bone', 8], ['gold_ingot', 1], 12], [['string', 8], ['gold_ingot', 1], 12], [['gold_ingot', 2], ['ember_dust', 2], 12],
    [['gold_ingot', 1], ['arrow', 8], 16], [['gold_ingot', 3], ['bow', 1], 4], [['gold_ingot', 2], ['lantern', 1], 8],
    [['gold_ingot', 3], ['lumen_shard', 2], 8], [['spider_silk', 4], ['gold_ingot', 1], 8], [['gold_ingot', 4], ['honey_apple', 1], 3],
  ],
];

const ADVANCED: TradeDef[][] = [
  [
    [['gold_ingot', 3], ['honey_apple', 1], 4], [['gold_ingot', 2], ['cooked_beef', 4], 8], [['gold_ingot', 2], ['mushroom_stew', 2], 8],
    [['gold_ingot', 4], ['birch_sapling', 2], 6], [['gold_ingot', 4], ['spruce_sapling', 2], 6], [['gold_ingot', 6], ['bed', 1], 2],
  ],
  [
    [['gold_ingot', 6], ['iron_sword', 1, { sharpness: 2 }], 2], [['gold_ingot', 6], ['iron_pickaxe', 1, { swiftness: 2 }], 2],
    [['gold_ingot', 5], ['iron_leggings', 1], 3], [['sky_crystal', 2], ['gold_ingot', 5], 6], [['gold_ingot', 12], ['crystal_pickaxe', 1], 1, ['sky_crystal', 3]],
    [['gold_ingot', 12], ['crystal_sword', 1], 1, ['sky_crystal', 2]],
  ],
  [
    [['gold_ingot', 5], ['bow', 1, { power: 2 }], 2], [['gold_ingot', 4], ['ember_dust', 5], 6], [['void_essence', 3], ['gold_ingot', 4], 6],
    [['gold_ingot', 8], ['rune_altar', 1], 1, ['ember_dust', 4]], [['gold_ingot', 3], ['lumen_block', 1], 6], [['shadow_wing', 2], ['gold_ingot', 3], 6],
  ],
];

function toTrade(d: TradeDef): Trade {
  const [cost, result, maxUses = 8, cost2] = d;
  const res = makeStack(result[0], result[1]);
  if (result[2]) res.ench = { ...result[2] };
  return { cost: makeStack(cost[0], cost[1]), cost2: cost2 ? makeStack(cost2[0], cost2[1]) : undefined, result: res, uses: 0, maxUses };
}

/**
 * Build the trade list for a Keeper.
 * @param profession 0 farmer, 1 smith, 2 mystic
 * @param advanced true once the player has traded 3 times with this keeper (unlocks the rarer offers)
 */
export function makeTrades(profession: number, advanced: boolean): Trade[] {
  const p = ((profession % BASIC.length) + BASIC.length) % BASIC.length;
  const rnd = mulberry32((p + 1) * 7919 + (advanced ? 31 : 0) + Math.floor(Math.random() * 1e6));
  const pool = BASIC[p].slice();
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const trades = pool.slice(0, 5).map(toTrade);
  if (advanced) {
    const adv = ADVANCED[p].slice();
    for (let i = adv.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [adv[i], adv[j]] = [adv[j], adv[i]]; }
    trades.push(...adv.slice(0, 3).map(toTrade));
  }
  return trades.filter((t) => ITEMS.has(t.cost.id) && ITEMS.has(t.result.id) && (!t.cost2 || ITEMS.has(t.cost2.id)));
}
