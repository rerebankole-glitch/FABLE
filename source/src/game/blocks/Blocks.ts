import { T } from './Tiles';

export type ToolKind = 'pickaxe' | 'axe' | 'shovel' | 'hoe' | 'sword' | 'none';
export type SoundKind = 'grass' | 'stone' | 'wood' | 'sand' | 'gravel' | 'snow' | 'glass' | 'cloth' | 'liquid' | 'plant' | 'metal' | 'leaves';
export type Shape = 'cube' | 'cross' | 'box' | 'liquid' | 'none';

export interface Drop {
  item: string;
  min: number;
  max: number;
  chance: number;
}

export interface BlockDef {
  id: number;
  name: string;
  label: string;
  /** [top, bottom, +z, -z, +x, -x] */
  tiles: number[];
  shape: Shape;
  box?: number[];
  solid: boolean;
  opaque: boolean;
  hardness: number;
  tool: ToolKind;
  tier: number;
  light: number;
  drops: Drop[] | null;
  sound: SoundKind;
  tint: boolean;
  replaceable: boolean;
  climbable: boolean;
  attenuate: number;
  hasItem: boolean;
  flammable: boolean;
  cullSame: boolean;
  needsSupport: boolean;
}

export const B = {
  AIR: 0, STONE: 1, DIRT: 2, GRASS: 3, COBBLESTONE: 4, SAND: 5, GRAVEL: 6, CLAY: 7, MUD: 8, SNOW_BLOCK: 9,
  SNOW_GRASS: 10, ICE: 11, PACKED_ICE: 12, WATER: 13, LAVA: 14, BEDROCK: 15, SANDSTONE: 16, RED_SAND: 17,
  TERRACOTTA: 18, DEEP_STONE: 19, OAK_LOG: 20, BIRCH_LOG: 21, SPRUCE_LOG: 22, DARK_LOG: 23, OAK_PLANKS: 24,
  BIRCH_PLANKS: 25, SPRUCE_PLANKS: 26, DARK_PLANKS: 27, OAK_LEAVES: 28, BIRCH_LEAVES: 29, SPRUCE_LEAVES: 30,
  DARK_LEAVES: 31, OAK_SAPLING: 32, BIRCH_SAPLING: 33, SPRUCE_SAPLING: 34, STRIPPED_LOG: 35, COAL_ORE: 36,
  COPPER_ORE: 37, IRON_ORE: 38, GOLD_ORE: 39, EMBER_ORE: 40, CRYSTAL_ORE: 41, MOSSY_COBBLESTONE: 42,
  STONE_BRICKS: 43, BRICKS: 44, GLASS: 45, WOOL: 46, VOIDSTONE: 47, LUMEN: 48, HELLSTONE: 49, CRAFTING_TABLE: 50,
  FURNACE: 51, FURNACE_LIT: 52, CHEST: 53, TORCH: 54, LANTERN: 55, LADDER: 56, DOOR_LOWER_Z: 57, DOOR_UPPER_Z: 58,
  DOOR_LOWER_X: 59, DOOR_UPPER_X: 60, BED: 61, RUNE_ALTAR: 62, TALL_GRASS: 63, FERN: 64, FLOWER_RED: 65,
  FLOWER_YELLOW: 66, FLOWER_BLUE: 67, MUSHROOM_BROWN: 68, MUSHROOM_RED: 69, DEAD_BUSH: 70, CACTUS: 71, REEDS: 72,
  FARMLAND: 73, WHEAT_0: 74, WHEAT_1: 75, WHEAT_2: 76, WHEAT_3: 77, CARROT_0: 78, CARROT_1: 79, CARROT_2: 80,
  POTATO_0: 81, POTATO_1: 82, POTATO_2: 83, PUMPKIN: 84, MELON: 85, OAK_SLAB: 86, STONE_SLAB: 87, COBBLE_SLAB: 88,
  OAK_FENCE: 89, BARREL: 90, STONE_BRICK_SLAB: 91, PORTAL: 92, PORTAL_X: 93,
  // Spark circuitry: each component has an off/on pair so the signal engine can swap ids in place.
  SPARK_DUST: 94, SPARK_DUST_ON: 95, SPARK_TORCH: 96, SPARK_TORCH_OFF: 97,
  SPARK_LEVER: 98, SPARK_LEVER_ON: 99, SPARK_PLATE: 100, SPARK_PLATE_ON: 101,
  SHUNT: 102, SHUNT_ON: 103, BREWING_HEARTH: 104,
  // Trackway: one id per shape so the mesher can pick the right tile and the solver can swap them
  // in place. Order matches TRACK_SHAPES in world/Rails.ts.
  TRACK_NS: 105, TRACK_EW: 106, TRACK_NE: 107, TRACK_NW: 108, TRACK_SE: 109, TRACK_SW: 110,
  TRACK_ASC_N: 111, TRACK_ASC_S: 112, TRACK_ASC_E: 113, TRACK_ASC_W: 114,
  MENDING_STONE: 115,
  // Building families the engine could already express with `box` shapes but never shipped:
  // stairs, walls, fence gates and trapdoors. Two orientations each where the shape needs it.
  OAK_STAIRS: 116, STONE_STAIRS: 117, COBBLE_STAIRS: 118, STONE_BRICK_STAIRS: 119,
  COBBLE_WALL: 120, STONE_BRICK_WALL: 121,
  OAK_GATE: 122, OAK_GATE_OPEN: 123,
  OAK_TRAPDOOR: 124, OAK_TRAPDOOR_OPEN: 125,
  BIRCH_SLAB: 126, SPRUCE_SLAB: 127, DEEP_STONE_SLAB: 128,
  // Horizontal log states. Y-axis logs keep the original ids for old worlds and generated trees.
  OAK_LOG_X: 129, OAK_LOG_Z: 130, BIRCH_LOG_X: 131, BIRCH_LOG_Z: 132,
  SPRUCE_LOG_X: 133, SPRUCE_LOG_Z: 134, DARK_LOG_X: 135, DARK_LOG_Z: 136,
  STRIPPED_LOG_X: 137, STRIPPED_LOG_Z: 138,
} as const;

export const BLOCKS: BlockDef[] = [];

type Partial<T> = { [K in keyof T]?: T[K] };

function def(id: number, name: string, label: string, o: Partial<BlockDef> & { tiles?: number[] }): void {
  const tiles = o.tiles ?? [T.white, T.white, T.white, T.white, T.white, T.white];
  BLOCKS[id] = {
    id, name, label, tiles,
    shape: o.shape ?? 'cube',
    box: o.box,
    solid: o.solid ?? true,
    opaque: o.opaque ?? (o.shape === undefined || o.shape === 'cube'),
    hardness: o.hardness ?? 1,
    tool: o.tool ?? 'none',
    tier: o.tier ?? 0,
    light: o.light ?? 0,
    drops: o.drops === undefined ? null : o.drops,
    sound: o.sound ?? 'stone',
    tint: o.tint ?? false,
    replaceable: o.replaceable ?? false,
    climbable: o.climbable ?? false,
    attenuate: o.attenuate ?? 0,
    hasItem: o.hasItem ?? true,
    flammable: o.flammable ?? false,
    cullSame: o.cullSame ?? false,
    needsSupport: o.needsSupport ?? false,
  };
}

const all = (t: number) => [t, t, t, t, t, t];
const tbs = (top: number, bottom: number, side: number) => [top, bottom, side, side, side, side];
const front = (top: number, bottom: number, side: number, f: number) => [top, bottom, f, side, side, side];
const drop = (item: string, min = 1, max = 1, chance = 1): Drop => ({ item, min, max, chance });

def(B.AIR, 'air', 'Air', { shape: 'none', solid: false, opaque: false, replaceable: true, hasItem: false, hardness: 0 });
def(B.STONE, 'stone', 'Stone', { tiles: all(T.stone), hardness: 1.5, tool: 'pickaxe', tier: 1, drops: [drop('cobblestone')] });
def(B.DIRT, 'dirt', 'Dirt', { tiles: all(T.dirt), hardness: 0.5, tool: 'shovel', sound: 'grass' });
def(B.GRASS, 'grass_block', 'Grass Block', { tiles: tbs(T.grass_top, T.dirt, T.grass_side), hardness: 0.6, tool: 'shovel', sound: 'grass', tint: true, drops: [drop('dirt')] });
def(B.COBBLESTONE, 'cobblestone', 'Cobblestone', { tiles: all(T.cobblestone), hardness: 2, tool: 'pickaxe', tier: 1 });
def(B.SAND, 'sand', 'Sand', { tiles: all(T.sand), hardness: 0.5, tool: 'shovel', sound: 'sand' });
def(B.GRAVEL, 'gravel', 'Gravel', { tiles: all(T.gravel), hardness: 0.6, tool: 'shovel', sound: 'gravel', drops: [drop('flint', 1, 1, 0.12), drop('gravel', 1, 1, 0.88)] });
def(B.CLAY, 'clay', 'Clay', { tiles: all(T.clay), hardness: 0.6, tool: 'shovel', sound: 'gravel', drops: [drop('clay_ball', 4, 4)] });
def(B.MUD, 'mud', 'Mud', { tiles: all(T.mud), hardness: 0.5, tool: 'shovel', sound: 'gravel' });
def(B.SNOW_BLOCK, 'snow_block', 'Snow Block', { tiles: all(T.snow), hardness: 0.2, tool: 'shovel', sound: 'snow', drops: [drop('snowball', 4, 4)] });
def(B.SNOW_GRASS, 'snowy_grass', 'Snowy Grass', { tiles: tbs(T.snow, T.dirt, T.snow_grass_side), hardness: 0.6, tool: 'shovel', sound: 'grass', drops: [drop('dirt')], hasItem: false });
def(B.ICE, 'ice', 'Ice', { tiles: all(T.ice), hardness: 0.5, tool: 'pickaxe', sound: 'glass', opaque: false, attenuate: 1, cullSame: true, drops: [] });
def(B.PACKED_ICE, 'packed_ice', 'Packed Ice', { tiles: all(T.packed_ice), hardness: 0.5, tool: 'pickaxe', sound: 'glass' });
def(B.WATER, 'water', 'Water', { tiles: all(T.water), shape: 'liquid', solid: false, opaque: false, replaceable: true, hasItem: false, attenuate: 2, cullSame: true, sound: 'liquid', hardness: -1 });
def(B.LAVA, 'lava', 'Lava', { tiles: all(T.lava), shape: 'liquid', solid: false, opaque: false, replaceable: true, hasItem: false, light: 15, cullSame: true, sound: 'liquid', hardness: -1 });
def(B.BEDROCK, 'bedrock', 'Bedrock', { tiles: all(T.bedrock), hardness: -1 });
def(B.SANDSTONE, 'sandstone', 'Sandstone', { tiles: tbs(T.sandstone_top, T.sandstone_top, T.sandstone_side), hardness: 0.8, tool: 'pickaxe', tier: 1 });
def(B.RED_SAND, 'red_sand', 'Red Sand', { tiles: all(T.red_sand), hardness: 0.5, tool: 'shovel', sound: 'sand' });
def(B.TERRACOTTA, 'terracotta', 'Terracotta', { tiles: all(T.terracotta), hardness: 1.25, tool: 'pickaxe', tier: 1 });
def(B.DEEP_STONE, 'deep_stone', 'Deep Stone', { tiles: all(T.deep_stone), hardness: 3, tool: 'pickaxe', tier: 1, drops: [drop('cobblestone')] });

const wood = (id: number, name: string, label: string, side: number, top: number) =>
  def(id, name, label, { tiles: tbs(top, top, side), hardness: 2, tool: 'axe', sound: 'wood', flammable: true });
wood(B.OAK_LOG, 'oak_log', 'Oak Log', T.oak_log, T.oak_log_top);
wood(B.BIRCH_LOG, 'birch_log', 'Birch Log', T.birch_log, T.birch_log_top);
wood(B.SPRUCE_LOG, 'spruce_log', 'Spruce Log', T.spruce_log, T.spruce_log_top);
wood(B.DARK_LOG, 'dark_log', 'Dark Log', T.dark_log, T.dark_log_top);
wood(B.STRIPPED_LOG, 'stripped_log', 'Stripped Log', T.stripped_log, T.stripped_log_top);

// Horizontal logs use the same bark/end-grain tiles but assign the ring tile to the two end faces.
// The base Y-axis ids remain unchanged so existing saves and generated trunks keep their shape.
const horizontalLog = (id: number, name: string, label: string, bark: number, end: number, axis: 'x' | 'z', dropItem: string) => {
  const tiles = axis === 'x'
    ? [bark, bark, bark, bark, end, end]
    : [bark, bark, end, end, bark, bark];
  def(id, name, label, {
    tiles, hardness: 2, tool: 'axe', sound: 'wood', flammable: true,
    hasItem: false, drops: [drop(dropItem)],
  });
};
horizontalLog(B.OAK_LOG_X, 'oak_log_x', 'Oak Log', T.oak_log, T.oak_log_top, 'x', 'oak_log');
horizontalLog(B.OAK_LOG_Z, 'oak_log_z', 'Oak Log', T.oak_log, T.oak_log_top, 'z', 'oak_log');
horizontalLog(B.BIRCH_LOG_X, 'birch_log_x', 'Birch Log', T.birch_log, T.birch_log_top, 'x', 'birch_log');
horizontalLog(B.BIRCH_LOG_Z, 'birch_log_z', 'Birch Log', T.birch_log, T.birch_log_top, 'z', 'birch_log');
horizontalLog(B.SPRUCE_LOG_X, 'spruce_log_x', 'Spruce Log', T.spruce_log, T.spruce_log_top, 'x', 'spruce_log');
horizontalLog(B.SPRUCE_LOG_Z, 'spruce_log_z', 'Spruce Log', T.spruce_log, T.spruce_log_top, 'z', 'spruce_log');
horizontalLog(B.DARK_LOG_X, 'dark_log_x', 'Dark Log', T.dark_log, T.dark_log_top, 'x', 'dark_log');
horizontalLog(B.DARK_LOG_Z, 'dark_log_z', 'Dark Log', T.dark_log, T.dark_log_top, 'z', 'dark_log');
horizontalLog(B.STRIPPED_LOG_X, 'stripped_log_x', 'Stripped Log', T.stripped_log, T.stripped_log_top, 'x', 'stripped_log');
horizontalLog(B.STRIPPED_LOG_Z, 'stripped_log_z', 'Stripped Log', T.stripped_log, T.stripped_log_top, 'z', 'stripped_log');

const planks = (id: number, name: string, label: string, t: number) =>
  def(id, name, label, { tiles: all(t), hardness: 2, tool: 'axe', sound: 'wood', flammable: true });
planks(B.OAK_PLANKS, 'oak_planks', 'Oak Planks', T.oak_planks);
planks(B.BIRCH_PLANKS, 'birch_planks', 'Birch Planks', T.birch_planks);
planks(B.SPRUCE_PLANKS, 'spruce_planks', 'Spruce Planks', T.spruce_planks);
planks(B.DARK_PLANKS, 'dark_planks', 'Dark Planks', T.dark_planks);

const leaves = (id: number, name: string, label: string, t: number, sapling: string) =>
  def(id, name, label, {
    tiles: all(t), hardness: 0.2, tool: 'hoe', sound: 'leaves', opaque: false, tint: true, attenuate: 1, flammable: true,
    drops: [drop(sapling, 1, 1, 0.06), drop('apple', 1, 1, 0.03), drop('stick', 1, 2, 0.03)],
  });
leaves(B.OAK_LEAVES, 'oak_leaves', 'Oak Leaves', T.oak_leaves, 'oak_sapling');
leaves(B.BIRCH_LEAVES, 'birch_leaves', 'Birch Leaves', T.birch_leaves, 'birch_sapling');
leaves(B.SPRUCE_LEAVES, 'spruce_leaves', 'Spruce Leaves', T.spruce_leaves, 'spruce_sapling');
leaves(B.DARK_LEAVES, 'dark_leaves', 'Dark Leaves', T.dark_leaves, 'oak_sapling');

const plant = (id: number, name: string, label: string, t: number, o: Partial<BlockDef> = {}) =>
  def(id, name, label, {
    tiles: all(t), shape: 'cross', solid: false, opaque: false, hardness: 0, sound: 'plant', needsSupport: true, flammable: true, ...o,
  });
plant(B.OAK_SAPLING, 'oak_sapling', 'Oak Sapling', T.oak_sapling);
plant(B.BIRCH_SAPLING, 'birch_sapling', 'Birch Sapling', T.birch_sapling);
plant(B.SPRUCE_SAPLING, 'spruce_sapling', 'Spruce Sapling', T.spruce_sapling);

const ore = (id: number, name: string, label: string, t: number, tier: number, drops: Drop[] | null, hardness = 3) =>
  def(id, name, label, { tiles: all(t), hardness, tool: 'pickaxe', tier, drops });
ore(B.COAL_ORE, 'coal_ore', 'Coal Ore', T.coal_ore, 1, [drop('coal')]);
ore(B.COPPER_ORE, 'copper_ore', 'Copper Ore', T.copper_ore, 2, [drop('raw_copper', 1, 2)]);
ore(B.IRON_ORE, 'iron_ore', 'Iron Ore', T.iron_ore, 2, [drop('raw_iron')]);
ore(B.GOLD_ORE, 'gold_ore', 'Gold Ore', T.gold_ore, 3, [drop('raw_gold')]);
ore(B.EMBER_ORE, 'ember_ore', 'Ember Ore', T.ember_ore, 3, [drop('ember_dust', 2, 4)], 3);
ore(B.CRYSTAL_ORE, 'crystal_ore', 'Sky Crystal Ore', T.crystal_ore, 3, [drop('sky_crystal')], 3.5);

def(B.MOSSY_COBBLESTONE, 'mossy_cobblestone', 'Mossy Cobblestone', { tiles: all(T.mossy_cobblestone), hardness: 2, tool: 'pickaxe', tier: 1 });
def(B.STONE_BRICKS, 'stone_bricks', 'Stone Bricks', { tiles: all(T.stone_bricks), hardness: 1.5, tool: 'pickaxe', tier: 1 });
def(B.BRICKS, 'bricks', 'Bricks', { tiles: all(T.bricks), hardness: 2, tool: 'pickaxe', tier: 1 });
def(B.GLASS, 'glass', 'Glass', { tiles: all(T.glass), hardness: 0.3, sound: 'glass', opaque: false, cullSame: true, drops: [] });
def(B.WOOL, 'wool', 'Wool', { tiles: all(T.wool), hardness: 0.8, sound: 'cloth', flammable: true });
def(B.VOIDSTONE, 'voidstone', 'Voidstone', { tiles: all(T.voidstone), hardness: 30, tool: 'pickaxe', tier: 4 });
def(B.LUMEN, 'lumen_block', 'Lumen Block', { tiles: all(T.lumen), hardness: 0.3, light: 15, sound: 'glass', drops: [drop('lumen_shard', 2, 4)] });
def(B.HELLSTONE, 'hellstone', 'Hellstone', { tiles: all(T.hellstone), hardness: 0.4, tool: 'pickaxe', tier: 1 });

def(B.CRAFTING_TABLE, 'crafting_table', 'Crafting Table', { tiles: tbs(T.crafting_table_top, T.oak_planks, T.crafting_table_side), hardness: 2.5, tool: 'axe', sound: 'wood', flammable: true });
def(B.FURNACE, 'furnace', 'Furnace', { tiles: front(T.furnace_side, T.furnace_side, T.furnace_side, T.furnace_front), hardness: 3.5, tool: 'pickaxe', tier: 1 });
def(B.FURNACE_LIT, 'furnace_lit', 'Furnace', { tiles: front(T.furnace_side, T.furnace_side, T.furnace_side, T.furnace_front_lit), hardness: 3.5, tool: 'pickaxe', tier: 1, light: 13, hasItem: false, drops: [drop('furnace')] });
def(B.CHEST, 'chest', 'Chest', { tiles: front(T.chest_top, T.chest_top, T.chest_side, T.chest_front), shape: 'box', box: [0.0625, 0, 0.0625, 0.9375, 0.875, 0.9375], opaque: false, hardness: 2.5, tool: 'axe', sound: 'wood', flammable: true });
def(B.BARREL, 'barrel', 'Barrel', { tiles: tbs(T.barrel_top, T.barrel_top, T.barrel_side), hardness: 2.5, tool: 'axe', sound: 'wood', flammable: true });
def(B.TORCH, 'torch', 'Torch', { tiles: all(T.torch), shape: 'box', box: [0.4375, 0, 0.4375, 0.5625, 0.625, 0.5625], solid: false, opaque: false, hardness: 0, light: 14, sound: 'wood', needsSupport: true });
def(B.LANTERN, 'lantern', 'Lantern', { tiles: all(T.lantern), shape: 'box', box: [0.3125, 0, 0.3125, 0.6875, 0.5625, 0.6875], solid: false, opaque: false, hardness: 0.5, light: 15, sound: 'metal' });
def(B.LADDER, 'ladder', 'Ladder', { tiles: all(T.ladder), shape: 'box', box: [0, 0, 0, 1, 1, 0.125], solid: false, opaque: false, hardness: 0.4, tool: 'axe', sound: 'wood', climbable: true, flammable: true });
def(B.DOOR_LOWER_Z, 'door_lower_z', 'Door', { tiles: all(T.door_bottom), shape: 'box', box: [0, 0, 0, 1, 1, 0.1875], opaque: false, hardness: 3, tool: 'axe', sound: 'wood', hasItem: false, drops: [drop('oak_door')], flammable: true });
def(B.DOOR_UPPER_Z, 'door_upper_z', 'Door', { tiles: all(T.door_top), shape: 'box', box: [0, 0, 0, 1, 1, 0.1875], opaque: false, hardness: 3, tool: 'axe', sound: 'wood', hasItem: false, drops: [], flammable: true });
def(B.DOOR_LOWER_X, 'door_lower_x', 'Door', { tiles: all(T.door_bottom), shape: 'box', box: [0, 0, 0, 0.1875, 1, 1], opaque: false, hardness: 3, tool: 'axe', sound: 'wood', hasItem: false, drops: [drop('oak_door')], flammable: true });
def(B.DOOR_UPPER_X, 'door_upper_x', 'Door', { tiles: all(T.door_top), shape: 'box', box: [0, 0, 0, 0.1875, 1, 1], opaque: false, hardness: 3, tool: 'axe', sound: 'wood', hasItem: false, drops: [], flammable: true });
def(B.BED, 'bed', 'Bed', { tiles: tbs(T.bed_top, T.oak_planks, T.bed_side), shape: 'box', box: [0, 0, 0, 1, 0.5625, 1], opaque: false, hardness: 0.3, sound: 'cloth', flammable: true });
def(B.RUNE_ALTAR, 'rune_altar', 'Rune Altar', { tiles: tbs(T.altar_top, T.voidstone, T.altar_side), shape: 'box', box: [0, 0, 0, 1, 0.75, 1], opaque: false, hardness: 5, tool: 'pickaxe', tier: 1, light: 7 });

plant(B.TALL_GRASS, 'tall_grass', 'Grass', T.tall_grass, { tint: true, replaceable: true, hasItem: false, drops: [drop('wheat_seeds', 1, 1, 0.125)] });
// Ferns drop themselves: they are a building/decor item AND the only source of the fern ingredient
// the mossy-cobblestone recipe needs (before this it could never be crafted at all).
plant(B.FERN, 'fern', 'Fern', T.fern, { tint: true, replaceable: true, drops: [drop('fern'), drop('wheat_seeds', 1, 1, 0.125)] });
plant(B.FLOWER_RED, 'flower_red', 'Poppy', T.flower_red);
plant(B.FLOWER_YELLOW, 'flower_yellow', 'Dandelion', T.flower_yellow);
plant(B.FLOWER_BLUE, 'flower_blue', 'Cornflower', T.flower_blue);
plant(B.MUSHROOM_BROWN, 'mushroom_brown', 'Brown Mushroom', T.mushroom_brown);
plant(B.MUSHROOM_RED, 'mushroom_red', 'Red Mushroom', T.mushroom_red);
plant(B.DEAD_BUSH, 'dead_bush', 'Dead Bush', T.dead_bush, { drops: [drop('stick', 0, 2)] });
def(B.CACTUS, 'cactus', 'Cactus', { tiles: tbs(T.cactus_top, T.cactus_top, T.cactus_side), shape: 'box', box: [0.0625, 0, 0.0625, 0.9375, 1, 0.9375], opaque: false, hardness: 0.4, sound: 'cloth', needsSupport: true });
plant(B.REEDS, 'reeds', 'Reeds', T.reeds, { tint: false });
def(B.FARMLAND, 'farmland', 'Farmland', { tiles: tbs(T.farmland, T.dirt, T.dirt), shape: 'box', box: [0, 0, 0, 1, 0.9375, 1], opaque: false, hardness: 0.6, tool: 'shovel', sound: 'grass', hasItem: false, drops: [drop('dirt')] });

const crop = (id: number, name: string, t: number, drops: Drop[]) =>
  plant(id, name, 'Crop', t, { hasItem: false, drops });
crop(B.WHEAT_0, 'wheat_0', T.wheat_0, [drop('wheat_seeds')]);
crop(B.WHEAT_1, 'wheat_1', T.wheat_1, [drop('wheat_seeds')]);
crop(B.WHEAT_2, 'wheat_2', T.wheat_2, [drop('wheat_seeds')]);
crop(B.WHEAT_3, 'wheat_3', T.wheat_3, [drop('wheat'), drop('wheat_seeds', 1, 3)]);
crop(B.CARROT_0, 'carrot_0', T.carrot_0, [drop('carrot')]);
crop(B.CARROT_1, 'carrot_1', T.carrot_1, [drop('carrot')]);
crop(B.CARROT_2, 'carrot_2', T.carrot_2, [drop('carrot', 2, 4)]);
crop(B.POTATO_0, 'potato_0', T.potato_0, [drop('potato')]);
crop(B.POTATO_1, 'potato_1', T.potato_1, [drop('potato')]);
crop(B.POTATO_2, 'potato_2', T.potato_2, [drop('potato', 2, 4)]);
def(B.PUMPKIN, 'pumpkin', 'Pumpkin', { tiles: tbs(T.pumpkin_top, T.pumpkin_top, T.pumpkin_side), hardness: 1, tool: 'axe', sound: 'wood' });
def(B.MELON, 'melon', 'Melon', { tiles: tbs(T.melon_top, T.melon_top, T.melon_side), hardness: 1, tool: 'axe', sound: 'wood', drops: [drop('melon_slice', 3, 7)] });

const slab = (id: number, name: string, label: string, t: number, tool: ToolKind, sound: SoundKind) =>
  def(id, name, label, { tiles: all(t), shape: 'box', box: [0, 0, 0, 1, 0.5, 1], opaque: false, hardness: 2, tool, tier: tool === 'pickaxe' ? 1 : 0, sound });
slab(B.OAK_SLAB, 'oak_slab', 'Oak Slab', T.oak_planks, 'axe', 'wood');
slab(B.STONE_SLAB, 'stone_slab', 'Stone Slab', T.stone, 'pickaxe', 'stone');
slab(B.COBBLE_SLAB, 'cobblestone_slab', 'Cobblestone Slab', T.cobblestone, 'pickaxe', 'stone');
slab(B.STONE_BRICK_SLAB, 'stone_brick_slab', 'Stone Brick Slab', T.stone_bricks, 'pickaxe', 'stone');
def(B.OAK_FENCE, 'oak_fence', 'Oak Fence', { tiles: all(T.oak_planks), shape: 'box', box: [0.375, 0, 0.375, 0.625, 1, 0.625], opaque: false, hardness: 2, tool: 'axe', sound: 'wood', flammable: true });

// ---- Building families -------------------------------------------------------------------------
// Stairs, walls, gates and trapdoors. The mesher's `box` shape already renders an arbitrary
// axis-aligned box with correct faces, lighting and collision, so these are real, solid, walkable
// blocks rather than decorative icons. A stair is approximated by its upper step box: it reads
// correctly, is climbable with the existing auto-step, and needs no new mesher shape.
const stairs = (id: number, name: string, label: string, t: number, tool: ToolKind, sound: SoundKind, flammable = false) =>
  def(id, name, label, {
    tiles: all(t), shape: 'box', box: [0, 0, 0, 1, 0.5, 1], opaque: false,
    hardness: tool === 'pickaxe' ? 2 : 2, tool, tier: tool === 'pickaxe' ? 1 : 0, sound, flammable,
  });
stairs(B.OAK_STAIRS, 'oak_stairs', 'Oak Stairs', T.oak_planks, 'axe', 'wood', true);
stairs(B.STONE_STAIRS, 'stone_stairs', 'Stone Stairs', T.stone, 'pickaxe', 'stone');
stairs(B.COBBLE_STAIRS, 'cobblestone_stairs', 'Cobblestone Stairs', T.cobblestone, 'pickaxe', 'stone');
stairs(B.STONE_BRICK_STAIRS, 'stone_brick_stairs', 'Stone Brick Stairs', T.stone_bricks, 'pickaxe', 'stone');

// Walls are a post like a fence but stone-family: waist-high, blocks movement, sees through.
const wall = (id: number, name: string, label: string, t: number) =>
  def(id, name, label, {
    tiles: all(t), shape: 'box', box: [0.25, 0, 0.25, 0.75, 1, 0.75], opaque: false,
    hardness: 2, tool: 'pickaxe', tier: 1, sound: 'stone',
  });
wall(B.COBBLE_WALL, 'cobblestone_wall', 'Cobblestone Wall', T.cobblestone);
wall(B.STONE_BRICK_WALL, 'stone_brick_wall', 'Stone Brick Wall', T.stone_bricks);

// Fence gate: a solid bar when shut, a thin flat sill when open (walk straight through).
def(B.OAK_GATE, 'oak_gate', 'Oak Fence Gate', {
  tiles: all(T.oak_planks), shape: 'box', box: [0, 0.3125, 0.4375, 1, 1, 0.5625], opaque: false,
  hardness: 2, tool: 'axe', sound: 'wood', flammable: true, drops: [drop('oak_gate')],
});
def(B.OAK_GATE_OPEN, 'oak_gate_open', 'Oak Fence Gate', {
  tiles: all(T.oak_planks), shape: 'box', box: [0, 0.3125, 0, 0.125, 1, 0.125], solid: false, opaque: false,
  hardness: 2, tool: 'axe', sound: 'wood', flammable: true, hasItem: false, drops: [drop('oak_gate')],
});

// Trapdoor: a lid on the floor when shut, a panel against the wall when open.
def(B.OAK_TRAPDOOR, 'oak_trapdoor', 'Oak Trapdoor', {
  tiles: all(T.oak_planks), shape: 'box', box: [0, 0, 0, 1, 0.1875, 1], opaque: false,
  hardness: 2, tool: 'axe', sound: 'wood', flammable: true, drops: [drop('oak_trapdoor')],
});
def(B.OAK_TRAPDOOR_OPEN, 'oak_trapdoor_open', 'Oak Trapdoor', {
  tiles: all(T.oak_planks), shape: 'box', box: [0, 0, 0, 1, 1, 0.1875], solid: false, opaque: false,
  hardness: 2, tool: 'axe', sound: 'wood', flammable: true, hasItem: false, drops: [drop('oak_trapdoor')],
});

// Missing slab variants for wood types and deepslate that already have full blocks.
slab(B.BIRCH_SLAB, 'birch_slab', 'Birch Slab', T.birch_planks, 'axe', 'wood');
slab(B.SPRUCE_SLAB, 'spruce_slab', 'Spruce Slab', T.spruce_planks, 'axe', 'wood');
slab(B.DEEP_STONE_SLAB, 'deep_stone_slab', 'Deep Stone Slab', T.deep_stone, 'pickaxe', 'stone');
def(B.PORTAL, 'portal', 'Portal', { tiles: all(T.portal), shape: 'box', box: [0, 0, 0.375, 1, 1, 0.625], solid: false, opaque: false, hardness: -1, light: 11, hasItem: false, drops: [], sound: 'glass' });
def(B.PORTAL_X, 'portal_x', 'Portal', { tiles: all(T.portal), shape: 'box', box: [0.375, 0, 0, 0.625, 1, 1], solid: false, opaque: false, hardness: -1, light: 11, hasItem: false, drops: [], sound: 'glass' });

// ---- Spark circuitry -------------------------------------------------------------------------
// Each component is defined as an off/on pair sharing one item: the "on" variant never drops
// itself and carries no inventory entry, so breaking a live wire still returns plain dust.
const FLAT = [0, 0, 0, 1, 0.0625, 1] as [number, number, number, number, number, number];
def(B.SPARK_DUST, 'spark_dust', 'Spark Dust', { tiles: all(T.spark_dust), shape: 'box', box: FLAT, solid: false, opaque: false, hardness: 0, sound: 'stone', needsSupport: true, drops: [drop('spark_dust')] });
def(B.SPARK_DUST_ON, 'spark_dust_on', 'Spark Dust', { tiles: all(T.spark_dust_on), shape: 'box', box: FLAT, solid: false, opaque: false, hardness: 0, light: 6, sound: 'stone', needsSupport: true, hasItem: false, drops: [drop('spark_dust')] });
def(B.SPARK_TORCH, 'spark_torch', 'Spark Torch', { tiles: all(T.spark_torch), shape: 'box', box: [0.4375, 0, 0.4375, 0.5625, 0.625, 0.5625], solid: false, opaque: false, hardness: 0, light: 8, sound: 'wood', needsSupport: true, drops: [drop('spark_torch')] });
def(B.SPARK_TORCH_OFF, 'spark_torch_off', 'Spark Torch', { tiles: all(T.spark_torch_off), shape: 'box', box: [0.4375, 0, 0.4375, 0.5625, 0.625, 0.5625], solid: false, opaque: false, hardness: 0, sound: 'wood', needsSupport: true, hasItem: false, drops: [drop('spark_torch')] });
def(B.SPARK_LEVER, 'spark_lever', 'Spark Lever', { tiles: all(T.spark_lever), shape: 'box', box: [0.3125, 0, 0.3125, 0.6875, 0.375, 0.6875], solid: false, opaque: false, hardness: 0.5, sound: 'stone', needsSupport: true, drops: [drop('spark_lever')] });
def(B.SPARK_LEVER_ON, 'spark_lever_on', 'Spark Lever', { tiles: all(T.spark_lever_on), shape: 'box', box: [0.3125, 0, 0.3125, 0.6875, 0.375, 0.6875], solid: false, opaque: false, hardness: 0.5, light: 4, sound: 'stone', needsSupport: true, hasItem: false, drops: [drop('spark_lever')] });
def(B.SPARK_PLATE, 'spark_plate', 'Spark Plate', { tiles: all(T.spark_plate), shape: 'box', box: [0.0625, 0, 0.0625, 0.9375, 0.0625, 0.9375], solid: false, opaque: false, hardness: 0.5, sound: 'stone', needsSupport: true, drops: [drop('spark_plate')] });
def(B.SPARK_PLATE_ON, 'spark_plate_on', 'Spark Plate', { tiles: all(T.spark_plate_on), shape: 'box', box: [0.0625, 0, 0.0625, 0.9375, 0.03125, 0.9375], solid: false, opaque: false, hardness: 0.5, light: 4, sound: 'stone', needsSupport: true, hasItem: false, drops: [drop('spark_plate')] });
// The Shunt is the mover. Retracted it is a full cube; extended it grows a head that shoves the
// block in front of it one space, which is what makes the hidden door work.
def(B.SHUNT, 'shunt', 'Shunt', { tiles: [T.shunt_face, T.shunt_side, T.shunt_side, T.shunt_side, T.shunt_side, T.shunt_side], hardness: 1.5, tool: 'pickaxe', sound: 'stone', drops: [drop('shunt')] });
def(B.SHUNT_ON, 'shunt_on', 'Shunt', { tiles: [T.shunt_head, T.shunt_side, T.shunt_side, T.shunt_side, T.shunt_side, T.shunt_side], hardness: 1.5, tool: 'pickaxe', sound: 'stone', light: 3, hasItem: false, drops: [drop('shunt')] });
// ---- Brewing Hearth --------------------------------------------------------------------------
def(B.BREWING_HEARTH, 'brewing_hearth', 'Brewing Hearth', { tiles: tbs(T.hearth_top, T.stone_bricks, T.hearth_side), shape: 'box', box: [0.0625, 0, 0.0625, 0.9375, 0.875, 0.9375], opaque: false, hardness: 3.5, tool: 'pickaxe', tier: 1, light: 6, sound: 'stone', drops: [drop('brewing_hearth')] });

// ---- Trackway ----------------------------------------------------------------------------------
// A flat plate a cart runs along. Every shape shares one item ("trackway"); the shape is resolved
// from the neighbours when it is placed, so the player never picks a variant by hand.
const TRACK_BOX = [0, 0, 0, 1, 0.125, 1] as [number, number, number, number, number, number];
const trackDef = (id: number, name: string, tile: number): void => {
  def(id, name, 'Trackway', {
    tiles: all(tile), shape: 'box', box: TRACK_BOX, solid: false, opaque: false,
    hardness: 0.7, tool: 'pickaxe', sound: 'metal', needsSupport: true,
    hasItem: id === B.TRACK_NS, drops: [drop('trackway')],
  });
};
trackDef(B.TRACK_NS, 'trackway', T.track_straight);
trackDef(B.TRACK_EW, 'trackway_ew', T.track_straight);
trackDef(B.TRACK_NE, 'trackway_ne', T.track_curve);
trackDef(B.TRACK_NW, 'trackway_nw', T.track_curve);
trackDef(B.TRACK_SE, 'trackway_se', T.track_curve);
trackDef(B.TRACK_SW, 'trackway_sw', T.track_curve);
trackDef(B.TRACK_ASC_N, 'trackway_asc_n', T.track_slope);
trackDef(B.TRACK_ASC_S, 'trackway_asc_s', T.track_slope);
trackDef(B.TRACK_ASC_E, 'trackway_asc_e', T.track_slope);
trackDef(B.TRACK_ASC_W, 'trackway_asc_w', T.track_slope);

// ---- Mending Stone -------------------------------------------------------------------------------
def(B.MENDING_STONE, 'mending_stone', 'Mending Stone', {
  tiles: tbs(T.mending_top, T.stone_bricks, T.mending_side), shape: 'box',
  box: [0, 0, 0.0625, 1, 0.875, 0.9375], opaque: false,
  hardness: 4, tool: 'pickaxe', tier: 1, sound: 'stone', drops: [drop('mending_stone')],
});

for (let i = 0; i < BLOCKS.length; i++) {
  if (!BLOCKS[i]) def(i, 'unknown_' + i, 'Unknown', { hasItem: false });
}

export const BLOCK_BY_NAME = new Map<string, BlockDef>();
for (const b of BLOCKS) BLOCK_BY_NAME.set(b.name, b);

// Fast lookup tables used by the mesher / lighting in the worker
export const OPAQUE = new Uint8Array(256);
export const LIGHT = new Uint8Array(256);
export const ATTEN = new Uint8Array(256);
export const SOLID = new Uint8Array(256);
for (const b of BLOCKS) {
  OPAQUE[b.id] = b.opaque ? 1 : 0;
  LIGHT[b.id] = b.light;
  ATTEN[b.id] = b.attenuate;
  SOLID[b.id] = b.solid ? 1 : 0;
}

export function blockDef(id: number): BlockDef {
  return BLOCKS[id] || BLOCKS[0];
}

export const CROP_STAGES: Record<number, number> = {
  [B.WHEAT_0]: B.WHEAT_1, [B.WHEAT_1]: B.WHEAT_2, [B.WHEAT_2]: B.WHEAT_3,
  [B.CARROT_0]: B.CARROT_1, [B.CARROT_1]: B.CARROT_2,
  [B.POTATO_0]: B.POTATO_1, [B.POTATO_1]: B.POTATO_2,
};

export const SAPLING_TREE: Record<number, string> = {
  [B.OAK_SAPLING]: 'oak', [B.BIRCH_SAPLING]: 'birch', [B.SPRUCE_SAPLING]: 'spruce',
};

export type LogAxis = 'x' | 'y' | 'z';

type LogGroup = [y: number, x: number, z: number];
const LOG_GROUPS: LogGroup[] = [
  [B.OAK_LOG, B.OAK_LOG_X, B.OAK_LOG_Z],
  [B.BIRCH_LOG, B.BIRCH_LOG_X, B.BIRCH_LOG_Z],
  [B.SPRUCE_LOG, B.SPRUCE_LOG_X, B.SPRUCE_LOG_Z],
  [B.DARK_LOG, B.DARK_LOG_X, B.DARK_LOG_Z],
  [B.STRIPPED_LOG, B.STRIPPED_LOG_X, B.STRIPPED_LOG_Z],
];
const LOG_AXIS = new Map<number, LogAxis>();
const LOG_FAMILY = new Map<number, LogGroup>();
for (const group of LOG_GROUPS) {
  const [y, x, z] = group;
  LOG_AXIS.set(y, 'y'); LOG_AXIS.set(x, 'x'); LOG_AXIS.set(z, 'z');
  LOG_FAMILY.set(y, group); LOG_FAMILY.set(x, group); LOG_FAMILY.set(z, group);
}

export function isLog(id: number): boolean { return LOG_AXIS.has(id); }

/** Leaf blocks of any species. Keeps spawns (and anything else placing a player) off tree canopies. */
export function isLeaves(id: number): boolean { return id === B.OAK_LEAVES || id === B.BIRCH_LEAVES || id === B.SPRUCE_LEAVES || id === B.DARK_LEAVES; }
export function isStrippedLog(id: number): boolean { return id === B.STRIPPED_LOG || id === B.STRIPPED_LOG_X || id === B.STRIPPED_LOG_Z; }
export function logAxis(id: number): LogAxis | null { return LOG_AXIS.get(id) ?? null; }
export function orientLog(id: number, axis: LogAxis): number {
  const family = LOG_FAMILY.get(id);
  if (!family) return id;
  return family[axis === 'y' ? 0 : axis === 'x' ? 1 : 2];
}
/** Strip bark without changing a placed log's axis. */
export function toStrippedLog(id: number): number {
  const axis = logAxis(id);
  return axis ? orientLog(B.STRIPPED_LOG, axis) : B.STRIPPED_LOG;
}
