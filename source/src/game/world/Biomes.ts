import { B } from '../blocks/Blocks';

export type TreeType = 'oak' | 'birch' | 'spruce' | 'dark' | 'jungle' | 'acacia' | 'swamp' | 'none';

export interface BiomeDef {
  id: number;
  name: string;
  /** grass tint (0..1 rgb) */
  grass: [number, number, number];
  /** foliage / leaves tint (0..1 rgb) */
  foliage: [number, number, number];
  /** surface block */
  top: number;
  /** block under the surface */
  filler: number;
  /** probability per column of a tree */
  treeDensity: number;
  trees: TreeType[];
  grassDensity: number;
  flowerDensity: number;
  flowers: number[];
  /** wild animals that may spawn here */
  animals: string[];
  temperature: number;
  humidity: number;
  /** whether precipitation happens here (deserts / badlands are always dry) */
  rain: boolean;
  /** optional fog colour override (0..1 rgb) */
  fog?: [number, number, number] | null;
  mushrooms?: boolean;
  pumpkins?: boolean;
  cactus?: boolean;
  deadBush?: boolean;
  reeds?: boolean;
  villages?: boolean;
}

const c = (hex: number): [number, number, number] => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];

export const BIOME = {
  OCEAN: 0, BEACH: 1, RIVER: 2, PLAINS: 3, FOREST: 4, BIRCH_FOREST: 5, TAIGA: 6, SNOWY_PLAINS: 7, DESERT: 8,
  SAVANNA: 9, JUNGLE: 10, SWAMP: 11, MOUNTAINS: 12, SNOWY_MOUNTAINS: 13, MUSHROOM_ISLE: 14, DEEP_OCEAN: 15,
  FROZEN_OCEAN: 16, SNOWY_TAIGA: 17, DARK_FOREST: 18, BADLANDS: 19,
} as const;

export type BiomeId = (typeof BIOME)[keyof typeof BIOME];

export const BIOMES: BiomeDef[] = [];

const FARM = ['bovin', 'woolly', 'snouter', 'clucker'];
const TEMPERATE_FLOWERS = [B.FLOWER_RED, B.FLOWER_YELLOW, B.FLOWER_BLUE];

function def(b: Omit<BiomeDef, 'flowers' | 'animals' | 'rain' | 'humidity'> & Partial<Pick<BiomeDef, 'flowers' | 'animals' | 'rain' | 'humidity'>>): void {
  BIOMES[b.id] = { flowers: TEMPERATE_FLOWERS, animals: [], rain: true, humidity: 0.5, ...b };
}

def({ id: BIOME.OCEAN, name: 'Ocean', grass: c(0x8eb971), foliage: c(0x71a74d), top: B.SAND, filler: B.GRAVEL, treeDensity: 0, trees: ['none'], grassDensity: 0, flowerDensity: 0, temperature: 0.5, humidity: 0.7 });
def({ id: BIOME.DEEP_OCEAN, name: 'Deep Ocean', grass: c(0x8eb971), foliage: c(0x71a74d), top: B.GRAVEL, filler: B.GRAVEL, treeDensity: 0, trees: ['none'], grassDensity: 0, flowerDensity: 0, temperature: 0.5, humidity: 0.7 });
def({ id: BIOME.FROZEN_OCEAN, name: 'Frozen Ocean', grass: c(0x80b497), foliage: c(0x60a17b), top: B.GRAVEL, filler: B.GRAVEL, treeDensity: 0, trees: ['none'], grassDensity: 0, flowerDensity: 0, temperature: 0.1, humidity: 0.6 });
def({ id: BIOME.BEACH, name: 'Beach', grass: c(0x91bd59), foliage: c(0x77ab2f), top: B.SAND, filler: B.SAND, treeDensity: 0, trees: ['none'], grassDensity: 0, flowerDensity: 0, temperature: 0.6, reeds: true });
def({ id: BIOME.RIVER, name: 'River', grass: c(0x8eb971), foliage: c(0x71a74d), top: B.SAND, filler: B.DIRT, treeDensity: 0, trees: ['none'], grassDensity: 0, flowerDensity: 0, temperature: 0.5, reeds: true });
def({ id: BIOME.PLAINS, name: 'Plains', grass: c(0x91bd59), foliage: c(0x77ab2f), top: B.GRASS, filler: B.DIRT, treeDensity: 0.003, trees: ['oak'], grassDensity: 0.18, flowerDensity: 0.03, temperature: 0.6, humidity: 0.4, animals: FARM, pumpkins: true, reeds: true, villages: true });
def({ id: BIOME.FOREST, name: 'Forest', grass: c(0x79c05a), foliage: c(0x59ae30), top: B.GRASS, filler: B.DIRT, treeDensity: 0.055, trees: ['oak', 'oak', 'oak', 'birch'], grassDensity: 0.1, flowerDensity: 0.02, temperature: 0.55, humidity: 0.6, animals: ['bovin', 'woolly', 'clucker'], mushrooms: true, reeds: true });
def({ id: BIOME.BIRCH_FOREST, name: 'Birch Forest', grass: c(0x88bb67), foliage: c(0x6ba941), top: B.GRASS, filler: B.DIRT, treeDensity: 0.05, trees: ['birch', 'birch', 'birch', 'oak'], grassDensity: 0.1, flowerDensity: 0.03, temperature: 0.5, humidity: 0.6, animals: ['woolly', 'clucker'], reeds: true });
def({ id: BIOME.DARK_FOREST, name: 'Dark Forest', grass: c(0x507a32), foliage: c(0x3f6e24), top: B.GRASS, filler: B.DIRT, treeDensity: 0.085, trees: ['dark', 'dark', 'dark', 'oak'], grassDensity: 0.08, flowerDensity: 0.01, temperature: 0.55, humidity: 0.75, animals: ['snouter'], mushrooms: true, fog: [0.55, 0.62, 0.55] });
def({ id: BIOME.TAIGA, name: 'Taiga', grass: c(0x86b783), foliage: c(0x68a464), top: B.GRASS, filler: B.DIRT, treeDensity: 0.045, trees: ['spruce'], grassDensity: 0.06, flowerDensity: 0.005, temperature: 0.3, humidity: 0.6, animals: ['woolly', 'bovin'], mushrooms: true, villages: true });
def({ id: BIOME.SNOWY_TAIGA, name: 'Snowy Taiga', grass: c(0x80b497), foliage: c(0x60a17b), top: B.SNOW_GRASS, filler: B.DIRT, treeDensity: 0.04, trees: ['spruce'], grassDensity: 0.02, flowerDensity: 0, temperature: 0.12, humidity: 0.6, animals: ['woolly'], mushrooms: true });
def({ id: BIOME.SNOWY_PLAINS, name: 'Snowy Plains', grass: c(0x80b497), foliage: c(0x60a17b), top: B.SNOW_GRASS, filler: B.DIRT, treeDensity: 0.003, trees: ['spruce'], grassDensity: 0.01, flowerDensity: 0, temperature: 0.1, humidity: 0.4, animals: ['woolly'], villages: true });
def({ id: BIOME.DESERT, name: 'Desert', grass: c(0xbfb755), foliage: c(0xaea42a), top: B.SAND, filler: B.SANDSTONE, treeDensity: 0, trees: ['none'], grassDensity: 0, flowerDensity: 0, temperature: 0.95, humidity: 0.1, rain: false, cactus: true, deadBush: true, reeds: true, villages: true });
def({ id: BIOME.SAVANNA, name: 'Savanna', grass: c(0xbfb755), foliage: c(0xaea42a), top: B.GRASS, filler: B.DIRT, treeDensity: 0.006, trees: ['acacia'], grassDensity: 0.2, flowerDensity: 0.002, flowers: [B.FLOWER_YELLOW], temperature: 0.85, humidity: 0.25, rain: false, animals: ['bovin', 'clucker'], villages: true });
def({ id: BIOME.JUNGLE, name: 'Jungle', grass: c(0x59c93c), foliage: c(0x30bb0b), top: B.GRASS, filler: B.DIRT, treeDensity: 0.09, trees: ['jungle', 'jungle', 'oak'], grassDensity: 0.25, flowerDensity: 0.02, flowers: [B.FLOWER_RED, B.FLOWER_BLUE], temperature: 0.9, humidity: 0.9, animals: ['clucker', 'snouter'], reeds: true, fog: [0.6, 0.72, 0.6] });
def({ id: BIOME.SWAMP, name: 'Swamp', grass: c(0x6a7039), foliage: c(0x6a7039), top: B.GRASS, filler: B.DIRT, treeDensity: 0.02, trees: ['swamp'], grassDensity: 0.12, flowerDensity: 0.01, flowers: [B.FLOWER_BLUE, B.MUSHROOM_BROWN], temperature: 0.75, humidity: 0.9, animals: ['snouter'], mushrooms: true, reeds: true, fog: [0.55, 0.6, 0.5] });
def({ id: BIOME.MOUNTAINS, name: 'Mountains', grass: c(0x8ab689), foliage: c(0x6da36b), top: B.GRASS, filler: B.STONE, treeDensity: 0.012, trees: ['spruce', 'oak'], grassDensity: 0.05, flowerDensity: 0.005, temperature: 0.35, humidity: 0.4, animals: ['woolly'] });
def({ id: BIOME.SNOWY_MOUNTAINS, name: 'Snowy Peaks', grass: c(0x80b497), foliage: c(0x60a17b), top: B.SNOW_BLOCK, filler: B.STONE, treeDensity: 0.002, trees: ['spruce'], grassDensity: 0, flowerDensity: 0, temperature: 0.05, humidity: 0.4 });
def({ id: BIOME.MUSHROOM_ISLE, name: 'Mushroom Isle', grass: c(0x55c93f), foliage: c(0x2bbb0f), top: B.MUD, filler: B.DIRT, treeDensity: 0, trees: ['none'], grassDensity: 0, flowerDensity: 0, temperature: 0.7, humidity: 0.9, mushrooms: true, fog: [0.7, 0.62, 0.72] });
def({ id: BIOME.BADLANDS, name: 'Badlands', grass: c(0x90814d), foliage: c(0x9e814d), top: B.RED_SAND, filler: B.TERRACOTTA, treeDensity: 0, trees: ['none'], grassDensity: 0.02, flowerDensity: 0, temperature: 0.95, humidity: 0.1, rain: false, deadBush: true });

// Any biome id that is not defined falls back to plains (keeps the mesher / HUD safe).
for (let i = 0; i < BIOMES.length; i++) if (!BIOMES[i]) BIOMES[i] = BIOMES[BIOME.PLAINS];

/**
 * Per-species leaf colour, layered on top of the biome foliage tint.
 * Birch is paler/yellower, spruce is a darker blue-green, dark forest leaves are deep green;
 * oak (and anything else) uses the biome colour as-is. Shared by the mesher, item icons and the hand model.
 */
const LEAF_SPECIES: Record<string, [number, number, number]> = {
  birch_leaves: [1.08, 1.1, 0.72],
  spruce_leaves: [0.7, 0.86, 0.82],
  dark_leaves: [0.62, 0.8, 0.55],
};
export function leafTint(blockName: string, foliage: [number, number, number]): [number, number, number] {
  const m = LEAF_SPECIES[blockName];
  if (!m) return foliage;
  return [Math.min(1, foliage[0] * m[0]), Math.min(1, foliage[1] * m[1]), Math.min(1, foliage[2] * m[2])];
}

export function biomeName(id: number): string {
  return BIOMES[id]?.name ?? 'Unknown';
}
