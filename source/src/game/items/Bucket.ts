/**
 * Pail handling — filling and emptying the pail on the world's fluid blocks.
 *
 * FABLE's fluids are static source blocks: there is no flow simulation, and this pass deliberately
 * does not add one. What the pail needs is therefore small and exact:
 *   - used on a water or lava block, it scoops that source up and leaves air;
 *   - used on anything else while full, it places its source into the adjacent empty space;
 *   - infinite source behaviour follows vanilla's rule: a water source with two or more water
 *     neighbours regenerates when scooped, so a 2x2 pool never runs dry, while a lone source and
 *     all lava sources are finite.
 *
 * The logic is pure so it can be unit-tested against a plain grid, the same way the circuitry
 * engine is; `Game` supplies the real world and the inventory swap.
 */

export interface PailWorld {
  getBlock(x: number, y: number, z: number): number;
  setBlock(x: number, y: number, z: number, id: number): void;
}

export interface PailBlocks { air: number; water: number; lava: number }

/** The three pail item ids. */
export const PAIL_EMPTY = 'pail';
export const PAIL_WATER = 'pail_water';
export const PAIL_LAVA = 'pail_lava';

export type PailState = typeof PAIL_EMPTY | typeof PAIL_WATER | typeof PAIL_LAVA;

const HORIZ: [number, number, number][] = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];

/**
 * Vanilla's infinite-water rule: a water source surrounded by two or more other water sources is
 * immediately replaced when you scoop it. Lava never does this.
 */
export function regenerates(world: PailWorld, B: PailBlocks, x: number, y: number, z: number): boolean {
  if (world.getBlock(x, y, z) !== B.water) return false;
  let n = 0;
  for (const [dx, dy, dz] of HORIZ) if (world.getBlock(x + dx, y + dy, z + dz) === B.water) n++;
  return n >= 2;
}

/**
 * Scoop the fluid at (x,y,z). Returns the pail state produced, or null when there is nothing to
 * pick up. Honours the infinite-source rule: a regenerating source is left in place.
 */
export function fill(world: PailWorld, B: PailBlocks, x: number, y: number, z: number): PailState | null {
  const id = world.getBlock(x, y, z);
  if (id !== B.water && id !== B.lava) return null;
  if (!regenerates(world, B, x, y, z)) world.setBlock(x, y, z, B.air);
  return id === B.water ? PAIL_WATER : PAIL_LAVA;
}

/**
 * Empty a full pail into (x,y,z). Returns true when the source was placed; the caller swaps the
 * held stack back to an empty pail. `replaceable` lets Game pass its own rule for what a fluid may
 * overwrite (air, grass, flowers) without this module importing the block table.
 */
export function empty(
  world: PailWorld, B: PailBlocks, state: PailState,
  x: number, y: number, z: number,
  replaceable: (id: number) => boolean = (id) => id === B.air,
): boolean {
  if (state === PAIL_EMPTY) return false;
  if (!replaceable(world.getBlock(x, y, z))) return false;
  world.setBlock(x, y, z, state === PAIL_WATER ? B.water : B.lava);
  return true;
}

/** The item id a pail becomes after being used in the given state. */