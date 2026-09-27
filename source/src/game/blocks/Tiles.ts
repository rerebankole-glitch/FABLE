// Names of every tile in the procedurally generated texture atlas.
// The index in this array is the tile index used by blocks and the mesher.
export const TILE_NAMES = [
  'stone', 'deep_stone', 'dirt', 'grass_top', 'grass_side', 'snow_grass_side', 'snow', 'sand', 'red_sand', 'gravel',
  'clay', 'mud', 'ice', 'packed_ice', 'water', 'lava', 'bedrock', 'sandstone_top', 'sandstone_side', 'terracotta',
  'oak_log', 'oak_log_top', 'oak_planks', 'oak_leaves', 'birch_log', 'birch_log_top', 'birch_planks', 'birch_leaves',
  'spruce_log', 'spruce_log_top', 'spruce_planks', 'spruce_leaves', 'dark_log', 'dark_log_top', 'dark_planks', 'dark_leaves',
  'stripped_log', 'stripped_log_top', 'oak_sapling', 'birch_sapling', 'spruce_sapling',
  'coal_ore', 'copper_ore', 'iron_ore', 'gold_ore', 'ember_ore', 'crystal_ore',
  'cobblestone', 'mossy_cobblestone', 'stone_bricks', 'bricks', 'glass', 'wool', 'voidstone', 'lumen', 'hellstone',
  'crafting_table_top', 'crafting_table_side', 'furnace_side', 'furnace_front', 'furnace_front_lit',
  'chest_top', 'chest_side', 'chest_front', 'torch', 'lantern', 'ladder', 'door_top', 'door_bottom', 'bed_top', 'bed_side',
  'altar_top', 'altar_side', 'barrel_side', 'barrel_top',
  'tall_grass', 'fern', 'flower_red', 'flower_yellow', 'flower_blue', 'mushroom_brown', 'mushroom_red', 'dead_bush',
  'cactus_side', 'cactus_top', 'reeds', 'farmland',
  'wheat_0', 'wheat_1', 'wheat_2', 'wheat_3', 'carrot_0', 'carrot_1', 'carrot_2', 'potato_0', 'potato_1', 'potato_2',
  'pumpkin_side', 'pumpkin_top', 'melon_side', 'melon_top',
  'crack_0', 'crack_1', 'crack_2', 'crack_3', 'crack_4', 'crack_5', 'crack_6', 'crack_7', 'crack_8', 'crack_9',
  'white', 'sun', 'moon', 'portal',
  // Spark circuitry + the Brewing Hearth
  'spark_dust', 'spark_dust_on', 'spark_torch', 'spark_torch_off', 'spark_lever', 'spark_lever_on',
  'spark_plate', 'spark_plate_on', 'shunt_side', 'shunt_face', 'shunt_head', 'hearth_top', 'hearth_side',
  // Trackway + the Mending Stone
  'track_straight', 'track_curve', 'track_slope', 'mending_top', 'mending_side',
] as const;

export type TileName = (typeof TILE_NAMES)[number];

export const T: Record<TileName, number> = Object.fromEntries(
  TILE_NAMES.map((n, i) => [n, i]),
) as Record<TileName, number>;

export const ATLAS_COLS = 16;
export const ATLAS_ROWS = 16;
export const TILE_PX = 16;
