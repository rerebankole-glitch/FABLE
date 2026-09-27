import { B, BLOCKS, type ToolKind } from '../blocks/Blocks';
import type { ItemStack } from '../core/types';

export type ItemType = 'block' | 'tool' | 'food' | 'material' | 'armor' | 'bow' | 'shield' | 'misc';

export interface ToolStats { kind: ToolKind; tier: number; speed: number; damage: number; durability: number }
export interface ArmorStats { slot: number; defense: number; durability: number }
export interface FoodStats { hunger: number; saturation: number; effect?: 'regen' | 'speed' | 'strength' }

export interface ItemDef {
  id: string;
  name: string;
  type: ItemType;
  block?: number;
  maxStack: number;
  tool?: ToolStats;
  armor?: ArmorStats;
  food?: FoodStats;
  fuel?: number;
  icon: { art: string; colors?: Record<string, string> } | { block: number };
  desc?: string;
}

export const ITEMS = new Map<string, ItemDef>();

function add(def: ItemDef): void {
  ITEMS.set(def.id, def);
}

// Block items
for (const b of BLOCKS) {
  if (!b.hasItem || b.id === B.AIR) continue;
  add({
    id: b.name, name: b.label, type: 'block', block: b.id, maxStack: 64, icon: { block: b.id },
    fuel: b.flammable ? (b.name.includes('log') ? 15 : b.name.includes('planks') ? 15 : b.name.includes('sapling') ? 5 : b.flammable ? 10 : undefined) : undefined,
  });
}
ITEMS.get('coal_ore')!.fuel = undefined;

const mat = (id: string, name: string, art: string, colors: Record<string, string>, extra: Partial<ItemDef> = {}) =>
  add({ id, name, type: 'material', maxStack: 64, icon: { art, colors }, ...extra });

mat('stick', 'Stick', 'stick', { A: '#8a6a3a', B: '#6a4a24' }, { fuel: 5 });
mat('coal', 'Coal', 'lump', { A: '#2a2a2a', B: '#141414', C: '#404040' }, { fuel: 80 });
mat('charcoal', 'Charcoal', 'lump', { A: '#3a3028', B: '#1c1814', C: '#504840' }, { fuel: 80 });
mat('raw_copper', 'Raw Copper', 'lump', { A: '#c87a45', B: '#9a5a30', C: '#e0a070' });
mat('copper_ingot', 'Copper Ingot', 'ingot', { A: '#d88a55', B: '#a0603a', C: '#f0b080' });
mat('raw_iron', 'Raw Iron', 'lump', { A: '#dcb090', B: '#a88070', C: '#f0d0b0' });
mat('iron_ingot', 'Iron Ingot', 'ingot', { A: '#d8d8d8', B: '#909090', C: '#ffffff' });
mat('raw_gold', 'Raw Gold', 'lump', { A: '#f2d243', B: '#b89a20', C: '#fff0a0' });
mat('gold_ingot', 'Gold Ingot', 'ingot', { A: '#f6d64a', B: '#c0a020', C: '#fff6b0' });
mat('ember_dust', 'Ember Dust', 'dust', { A: '#f04a20', B: '#a02a10', C: '#ffa060' });
mat('sky_crystal', 'Sky Crystal', 'gem', { A: '#5fe8e0', B: '#2aa8a0', C: '#d0fffc' });
mat('lumen_shard', 'Lumen Shard', 'dust', { A: '#f6e27a', B: '#c0a030', C: '#fff8c0' });
mat('flint', 'Flint', 'lump', { A: '#3a3a3a', B: '#202020', C: '#5a5a5a' });
mat('string', 'String', 'string', { A: '#e8e8e8', B: '#b0b0b0' });
mat('feather', 'Feather', 'feather', { A: '#f4f4f4', B: '#c0c0c0', C: '#8a8a8a' });
mat('leather', 'Leather', 'leather', { A: '#a8623a', B: '#7a4424' });
mat('clay_ball', 'Clay Ball', 'ball', { A: '#9ea4b0', B: '#6e7480' });
mat('brick', 'Brick', 'ingot', { A: '#9a4a3a', B: '#6a2a20', C: '#c07060' });
mat('snowball', 'Snowball', 'ball', { A: '#f4f8ff', B: '#c0d0e0' }, { maxStack: 16 });
mat('bone', 'Bone', 'bone', { A: '#e8e4d0', B: '#b0a890' });
mat('wheat', 'Wheat', 'wheat', { A: '#d8b040', B: '#a88020', C: '#e8d060' });
mat('wheat_seeds', 'Wheat Seeds', 'seeds', { A: '#6fa03a', B: '#3a6a20' });
mat('egg', 'Egg', 'ball', { A: '#f0e8d0', B: '#c0b090' }, { maxStack: 16 });
mat('arrow', 'Arrow', 'arrow', { A: '#8a6a3a', B: '#d0d0d0', C: '#f0f0f0' });
mat('fire_striker', 'Fire Striker', 'striker', { A: '#909090', B: '#3a3a3a', C: '#ff8a20' }, { maxStack: 1, type: 'misc' });
mat('oak_door', 'Oak Door', 'door', { A: '#9c7a4a', B: '#6a4f2c', C: '#bfe8ff' }, { block: B.DOOR_LOWER_Z, type: 'block' });
mat('spider_silk', 'Crawler Silk', 'string', { A: '#c8c0e0', B: '#8880a0' });
mat('void_essence', 'Void Essence', 'gem', { A: '#7a3ad0', B: '#3a1a70', C: '#d0a0ff' });
mat('shadow_wing', 'Shadow Wing', 'feather', { A: '#3a3050', B: '#201a30', C: '#6a5a90' });

// The pail and its two filled states. Fluids in FABLE are static sources, so the pail is a
// straight pick-up/put-down tool -- see game/items/Bucket.ts for the fill/empty rules.
mat('pail', 'Pail', 'pail', { A: '#b8bcc4', B: '#7a8088', C: '#e0e4ec', D: '#5a6068' }, { maxStack: 16 });
mat('pail_water', 'Pail of Water', 'pail', { A: '#b8bcc4', B: '#7a8088', C: '#e0e4ec', D: '#3a7ad0' }, { maxStack: 1 });
mat('pail_lava', 'Pail of Lava', 'pail', { A: '#b8bcc4', B: '#7a8088', C: '#e0e4ec', D: '#e86a18' }, { maxStack: 1, fuel: 800 });

// Alchemy glassware and the draughts brewed in it. The flask is the base every recipe starts
// from; each draught reuses the same flask silhouette retinted to its own liquid, so the shelf
// reads as one family at a glance. Ingredients and effects live in game/brewing/Brewing.ts.
mat('glass_flask', 'Glass Flask', 'flask', { A: '#cfe6f0', B: '#9ab8c6', C: '#eef8ff', D: '#8a6a3a' });

const draught = (id: string, name: string, colors: Record<string, string>, desc: string) =>
  add({ id, name, type: 'misc', maxStack: 16, icon: { art: 'flask', colors }, desc });

draught('draught_mending',   'Mending Draught',   { A: '#e8496a', B: '#a82848', C: '#ffd0dc', D: '#8a6a3a' }, 'Knits wounds closed on the spot.');
draught('draught_swift',     'Swift Draught',     { A: '#4ac8e8', B: '#2080a8', C: '#d0f4ff', D: '#8a6a3a' }, 'Quickens the stride.');
draught('draught_stonehide', 'Stonehide Draught', { A: '#9aa0ac', B: '#666c78', C: '#e0e4ec', D: '#8a6a3a' }, 'Hardens the skin against blows.');
draught('draught_owlsight',  'Owlsight Draught',  { A: '#2a3a7a', B: '#141e4a', C: '#8aa0e0', D: '#8a6a3a' }, 'Draws light out of the dark.');
draught('draught_emberskin', 'Emberskin Draught', { A: '#f08030', B: '#b04a10', C: '#ffd8a0', D: '#8a6a3a' }, 'Lets flame wash over you.');
draught('draught_tidelung',  'Tidelung Draught',  { A: '#3aa88a', B: '#1a6a58', C: '#b0f0dc', D: '#8a6a3a' }, 'Turns water to air in the lungs.');

const food = (id: string, name: string, art: string, colors: Record<string, string>, hunger: number, saturation: number, effect?: FoodStats['effect']) =>
  add({ id, name, type: 'food', maxStack: 64, icon: { art, colors }, food: { hunger, saturation, effect } });
food('apple', 'Apple', 'apple', { A: '#e03030', B: '#a01818', C: '#5a8a2a', D: '#fff' }, 4, 2.4);
food('honey_apple', 'Honey Apple', 'apple', { A: '#f2c030', B: '#c08010', C: '#5a8a2a', D: '#fff' }, 4, 9.6, 'regen');
food('bread', 'Bread', 'bread', { A: '#d8a050', B: '#a07030', C: '#f0c880' }, 5, 6);
food('carrot', 'Carrot', 'carrot', { A: '#f08030', B: '#c05a10', C: '#4a9a30' }, 3, 3.6);
food('potato', 'Potato', 'potato', { A: '#d8b060', B: '#a88040' }, 1, 0.6);
food('baked_potato', 'Baked Potato', 'potato', { A: '#c89040', B: '#8a6020' }, 5, 6);
food('melon_slice', 'Melon Slice', 'melon', { A: '#e04040', B: '#6fae4a', C: '#202020' }, 2, 1.2);
food('raw_beef', 'Raw Bovin Steak', 'meat', { A: '#d04848', B: '#902828', C: '#f0a0a0' }, 3, 1.8);
food('cooked_beef', 'Cooked Steak', 'meat', { A: '#8a5030', B: '#5a3018', C: '#b07850' }, 8, 12.8);
food('raw_mutton', 'Raw Mutton', 'meat', { A: '#d86060', B: '#a03838', C: '#f0b0b0' }, 2, 1.2);
food('cooked_mutton', 'Cooked Mutton', 'meat', { A: '#9a6038', B: '#6a3a1c', C: '#c08a60' }, 6, 9.6);
food('raw_porkchop', 'Raw Porkchop', 'meat', { A: '#f0a0a8', B: '#c07078', C: '#ffd0d8' }, 3, 1.8);
food('cooked_porkchop', 'Cooked Porkchop', 'meat', { A: '#c89060', B: '#8a6030', C: '#e8b080' }, 8, 12.8);
food('raw_chicken', 'Raw Clucker', 'meat', { A: '#f0d0c0', B: '#c0a090', C: '#fff0e8' }, 2, 1.2);
food('cooked_chicken', 'Cooked Clucker', 'meat', { A: '#d09050', B: '#a06a30', C: '#f0c080' }, 6, 7.2);
food('mushroom_stew', 'Mushroom Stew', 'bowl', { A: '#8a6a4a', B: '#c0a080', C: '#6a4a30' }, 6, 7.2);
food('berry', 'Sweet Berries', 'seeds', { A: '#d03050', B: '#801030' }, 2, 0.4);

interface Tier { name: string; label: string; tier: number; speed: number; dmg: number; dur: number; colors: Record<string, string> }
const TIERS: Tier[] = [
  { name: 'wood', label: 'Wooden', tier: 1, speed: 2, dmg: 0, dur: 59, colors: { M: '#b08a50', m: '#7a5a30' } },
  { name: 'stone', label: 'Stone', tier: 2, speed: 4, dmg: 1, dur: 131, colors: { M: '#8a8a8a', m: '#5a5a5a' } },
  { name: 'copper', label: 'Copper', tier: 2, speed: 5, dmg: 1, dur: 190, colors: { M: '#d88a55', m: '#a0603a' } },
  { name: 'iron', label: 'Iron', tier: 3, speed: 6, dmg: 2, dur: 250, colors: { M: '#d8d8d8', m: '#8a8a8a' } },
  { name: 'gold', label: 'Golden', tier: 2, speed: 12, dmg: 0, dur: 32, colors: { M: '#f6d64a', m: '#b89a20' } },
  { name: 'crystal', label: 'Crystal', tier: 4, speed: 8, dmg: 3, dur: 950, colors: { M: '#5fe8e0', m: '#2aa8a0' } },
];
const TOOL_BASE: Record<string, number> = { sword: 4, axe: 3, pickaxe: 2, shovel: 1.5, hoe: 1 };
for (const t of TIERS) {
  for (const kind of ['pickaxe', 'axe', 'shovel', 'hoe', 'sword'] as ToolKind[]) {
    add({
      id: `${t.name}_${kind}`, name: `${t.label} ${kind[0].toUpperCase()}${kind.slice(1)}`, type: 'tool', maxStack: 1,
      icon: { art: kind, colors: { ...t.colors, H: '#6e5230', h: '#453320' } },
      tool: { kind, tier: t.tier, speed: t.speed, damage: TOOL_BASE[kind] + t.dmg, durability: t.dur },
      fuel: t.name === 'wood' ? 10 : undefined,
    });
  }
}
// ---- Trackway, Ore Cart and Skiff ---------------------------------------------------------------
// Vehicles are placed rather than held: using the cart on a Trackway or the skiff on water spawns
// the rideable entity and consumes the item. The shape rules live in game/world/Rails.ts and the
// float rules in game/world/Boating.ts.
// Trackway already has an auto-generated block item (B.TRACK_NS has hasItem), so its `block` field
// must be preserved or the block could not be placed. Only the icon is overridden here: the
// isometric cube icon reads poorly for a flat plate, so it uses a drawn sprite instead.
{
  const tw = ITEMS.get('trackway');
  if (tw) tw.icon = { art: 'track', colors: { A: '#b8bcc4', B: '#74593c', C: '#e0e4ec' } };
}
mat('ore_cart', 'Ore Cart', 'cart', { A: '#8a8a94', B: '#55555e', C: '#6e5230', D: '#3a3a42' }, { maxStack: 1 });
mat('skiff', 'Skiff', 'skiff', { A: '#a8763f', B: '#7a5228', C: '#5a4630' }, { maxStack: 1 });

// ---- The Ancient Blade ------------------------------------------------------------------------
// A greatsword that doubles as a world landmark: used on the ground it drives into the block and
// becomes a StuckBlade world object, and it is a real weapon in the hand. Crystal-tier damage, but
// slow and heavy, so it is a trophy rather than a strict upgrade.
add({
  id: 'ancient_blade', name: 'Ancient Blade', type: 'tool', maxStack: 1,
  icon: { art: 'sword', colors: { M: '#6e6e78', m: '#2a2a30', L: '#9a9aa6', G: '#1c1c1f', H: '#6e5230', h: '#453320', w: '#1c1c1f' } },
  tool: { kind: 'sword', tier: 4, speed: 4, damage: 9, durability: 1200 },
  desc: 'Use it on the ground to drive it in.',
});

add({ id: 'bow', name: 'Bow', type: 'bow', maxStack: 1, icon: { art: 'bow', colors: { A: '#8a6a3a', B: '#e8e8e8' } }, tool: { kind: 'none', tier: 0, speed: 1, damage: 1, durability: 384 } });
// Shield: goes in the off-hand slot. While held there, hold sneak to raise it and block most melee / arrow damage.
add({ id: 'shield', name: 'Shield', type: 'shield', maxStack: 1, icon: { art: 'shield', colors: { A: '#8a6a3a', B: '#5a4020', C: '#b8b8b8', D: '#3f6f9f' } }, tool: { kind: 'none', tier: 0, speed: 1, damage: 1, durability: 336 }, desc: 'Hold Sneak to block while it is in your off-hand.' });

interface ArmorTier { name: string; label: string; def: number[]; dur: number; colors: Record<string, string> }
const ARMOR_TIERS: ArmorTier[] = [
  { name: 'leather', label: 'Leather', def: [1, 3, 2, 1], dur: 80, colors: { A: '#a8623a', B: '#7a4424' } },
  { name: 'iron', label: 'Iron', def: [2, 6, 5, 2], dur: 240, colors: { A: '#d8d8d8', B: '#8a8a8a' } },
  { name: 'gold', label: 'Golden', def: [2, 5, 3, 1], dur: 110, colors: { A: '#f6d64a', B: '#b89a20' } },
  { name: 'crystal', label: 'Crystal', def: [3, 8, 6, 3], dur: 520, colors: { A: '#5fe8e0', B: '#2aa8a0' } },
];
const ARMOR_SLOTS = ['helmet', 'chestplate', 'leggings', 'boots'];
for (const a of ARMOR_TIERS) {
  ARMOR_SLOTS.forEach((slot, i) => {
    add({
      id: `${a.name}_${slot}`, name: `${a.label} ${slot[0].toUpperCase()}${slot.slice(1)}`, type: 'armor', maxStack: 1,
      icon: { art: slot, colors: a.colors }, armor: { slot: i, defense: a.def[i], durability: Math.round(a.dur * [0.7, 1, 0.95, 0.8][i]) },
    });
  });
}

export function itemDef(id: string): ItemDef | undefined {
  return ITEMS.get(id);
}
export function maxStack(id: string): number {
  return ITEMS.get(id)?.maxStack ?? 64;
}
export function makeStack(id: string, count = 1): ItemStack {
  const def = ITEMS.get(id);
  const s: ItemStack = { id, count };
  if (def?.tool) s.durability = def.tool.durability;
  else if (def?.armor) s.durability = def.armor.durability;
  return s;
}
export function maxDurability(id: string): number {
  const def = ITEMS.get(id);
  return def?.tool?.durability ?? def?.armor?.durability ?? 0;
}
export function canStack(a: ItemStack, b: ItemStack): boolean {
  return a.id === b.id && a.durability === undefined && b.durability === undefined && !a.ench && !b.ench;
}

export const TAGS: Record<string, string[]> = {
  planks: ['oak_planks', 'birch_planks', 'spruce_planks', 'dark_planks'],
  log: ['oak_log', 'birch_log', 'spruce_log', 'dark_log', 'stripped_log'],
  stone_tool_material: ['cobblestone', 'deep_stone'],
  coal: ['coal', 'charcoal'],
  sapling: ['oak_sapling', 'birch_sapling', 'spruce_sapling'],
};
export function matchesTag(tag: string, id: string): boolean {
  return TAGS[tag]?.includes(id) ?? false;
}

export const ALL_ITEM_IDS = (): string[] => Array.from(ITEMS.keys());
