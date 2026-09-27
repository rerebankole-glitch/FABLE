/**
 * Spark circuitry — FABLE's original take on signal wiring.
 *
 * Naming is deliberately ours, not Mojang's: the wire is **Spark Dust**, the inverter/source is a
 * **Spark Torch**, the toggle is a **Spark Lever**, the momentary is a **Spark Button**, the floor
 * trigger is a **Spark Plate** and the mover is a **Shunt** (piston-equivalent).
 *
 * The engine here is deliberately pure: it reads and writes the world only through the small
 * `SignalWorld` interface, so the propagation rules can be unit-tested with a plain in-memory grid
 * and no renderer, chunks or Three.js involved. `Game` owns the real world and just calls
 * `propagate()` whenever a circuit block changes.
 *
 * Rules (kept narrow on purpose — this pass targets doors, trapdoors and a 2x2 hidden door):
 *   - A source emits power 15.
 *   - Spark Dust carries power with distance falloff: each step of dust costs 1, so a run of dust
 *     reaches 15 blocks from its source and no further.
 *   - Dust connects to the 4 horizontal neighbours, and also steps up/down one block so wiring can
 *     climb stairs, the way players expect.
 *   - A Spark Torch sitting on a powered block turns OFF; otherwise it is a source. That inversion
 *     is what makes logic gates (and the hidden door) possible.
 *   - Doors, trapdoors and Shunts read the strongest power of any neighbour.
 *
 * Not in this pass (tracked as follow-up): repeaters, comparators, signal strength readers,
 * instant-wire quirks and slab/stair-aware routing.
 */

/** Maximum power a source emits, and therefore the maximum reach of a dust run. */
export const MAX_POWER = 15;

/** The block roles the signal engine understands. Ids are supplied by the caller. */
export interface SignalBlocks {
  dust: number;
  torchOn: number;
  torchOff: number;
  lever: number;
  leverOn: number;
  button: number;
  buttonOn: number;
  plate: number;
  plateOn: number;
  shunt: number;
  shuntOn: number;
  door: number[];
  trapdoor: number;
  trapdoorOpen: number;
  air: number;
}

/** Minimal world view the engine needs. */
export interface SignalWorld {
  getBlock(x: number, y: number, z: number): number;
  setBlock(x: number, y: number, z: number, id: number): void;
}

export interface Vec3 { x: number; y: number; z: number }

const HORIZ: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** True for blocks that emit full power on their own. */
export function isSource(id: number, B: SignalBlocks): boolean {
  return id === B.torchOn || id === B.leverOn || id === B.buttonOn || id === B.plateOn;
}

/** True for blocks a dust run should chain through. */
export function isDust(id: number, B: SignalBlocks): boolean {
  return id === B.dust;
}

/** Blocks that react to being powered. */
export function isConsumer(id: number, B: SignalBlocks): boolean {
  return B.door.includes(id) || id === B.trapdoor || id === B.trapdoorOpen || id === B.shunt || id === B.shuntOn || id === B.torchOn || id === B.torchOff;
}

const key = (x: number, y: number, z: number): string => `${x},${y},${z}`;

/**
 * Flood the power field outward from every source within `radius` of `origin`.
 *
 * Returns a map of "x,y,z" -> power for every dust cell reached. This is the whole propagation
 * model and is what the test asserts against: a source at one end of a dust line yields exactly
 * MAX_POWER at the first dust cell, decreasing by one per step, and nothing beyond 15 cells.
 */
export function computeField(world: SignalWorld, B: SignalBlocks, origin: Vec3, radius = 24): Map<string, number> {
  const power = new Map<string, number>();
  // Breadth-first from the strongest values downward, so each cell is settled once.
  const queue: { x: number; y: number; z: number; p: number }[] = [];
  const R = radius;
  for (let dx = -R; dx <= R; dx++) for (let dy = -R; dy <= R; dy++) for (let dz = -R; dz <= R; dz++) {
    const x = origin.x + dx, y = origin.y + dy, z = origin.z + dz;
    if (!isSource(world.getBlock(x, y, z), B)) continue;
    // a source pushes MAX_POWER into the dust touching it
    for (const [ox, oz] of HORIZ) for (const oy of [0, 1, -1]) {
      const nx = x + ox, ny = y + oy, nz = z + oz;
      if (!isDust(world.getBlock(nx, ny, nz), B)) continue;
      const k = key(nx, ny, nz);
      if ((power.get(k) ?? -1) < MAX_POWER) { power.set(k, MAX_POWER); queue.push({ x: nx, y: ny, z: nz, p: MAX_POWER }); }
    }
    // A source also powers dust directly above/below it (a torch on the floor under a wire).
    // Exception: a torch never powers its own support block, or it would read its own output and
    // oscillate off the instant it lit.
    const isTorch = world.getBlock(x, y, z) === B.torchOn;
    for (const oy of isTorch ? [1] : [1, -1]) {
      const ny = y + oy;
      if (!isDust(world.getBlock(x, ny, z), B)) continue;
      const k = key(x, ny, z);
      if ((power.get(k) ?? -1) < MAX_POWER) { power.set(k, MAX_POWER); queue.push({ x, y: ny, z, p: MAX_POWER }); }
    }
  }
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur.p <= 1) continue;               // 1 is the last cell that can still light: 0 would be off
    const next = cur.p - 1;
    for (const [ox, oz] of HORIZ) for (const oy of [0, 1, -1]) {
      const nx = cur.x + ox, ny = cur.y + oy, nz = cur.z + oz;
      if (!isDust(world.getBlock(nx, ny, nz), B)) continue;
      const k = key(nx, ny, nz);
      if ((power.get(k) ?? -1) >= next) continue;
      power.set(k, next);
      queue.push({ x: nx, y: ny, z: nz, p: next });
    }
  }
  return power;
}

/** Power level delivered to a single (non-dust) position by adjacent sources and dust. */
export function powerAt(world: SignalWorld, B: SignalBlocks, field: Map<string, number>, x: number, y: number, z: number, ignore?: Vec3): number {
  let best = 0;
  const probe = (nx: number, ny: number, nz: number): void => {
    if (ignore && ignore.x === nx && ignore.y === ny && ignore.z === nz) return;
    const id = world.getBlock(nx, ny, nz);
    if (isSource(id, B)) { best = MAX_POWER; return; }
    const p = field.get(key(nx, ny, nz));
    if (p !== undefined && p > best) best = p;
  };
  for (const [ox, oz] of HORIZ) probe(x + ox, y, z + oz);
  probe(x, y + 1, z);
  probe(x, y - 1, z);
  return best;
}

/**
 * Recompute a neighbourhood and apply the results: torches invert, doors/trapdoors open, shunts
 * extend. Returns the list of positions whose block id actually changed, so the caller can play
 * one sound per change instead of one per tick.
 */
export function propagate(world: SignalWorld, B: SignalBlocks, origin: Vec3, radius = 24): Vec3[] {
  const changed: Vec3[] = [];
  // Torch inversion has to settle before consumers read the field, so run the field twice: once to
  // resolve torches, once for everything that reacts to the final power values.
  for (let pass = 0; pass < 2; pass++) {
    const field = computeField(world, B, origin, radius);
    const R = radius;
    for (let dx = -R; dx <= R; dx++) for (let dy = -R; dy <= R; dy++) for (let dz = -R; dz <= R; dz++) {
      const x = origin.x + dx, y = origin.y + dy, z = origin.z + dz;
      const id = world.getBlock(x, y, z);
      if (!isConsumer(id, B)) continue;
      const p = powerAt(world, B, field, x, y, z);

      if (id === B.torchOn || id === B.torchOff) {
        // A torch is OFF exactly when the block it is attached to (below it) is powered.
        // Read the support block's power while ignoring the torch itself, so the torch cannot
        // see its own output and flicker.
        const support = powerAt(world, B, field, x, y - 1, z, { x, y, z });
        const belowPowered = support > 0 || isSource(world.getBlock(x, y - 1, z), B);
        const want = belowPowered ? B.torchOff : B.torchOn;
        if (want !== id) { world.setBlock(x, y, z, want); changed.push({ x, y, z }); }
        continue;
      }
      if (pass === 0) continue;             // consumers settle on the second pass only

      if (id === B.trapdoor || id === B.trapdoorOpen) {
        const want = p > 0 ? B.trapdoorOpen : B.trapdoor;
        if (want !== id) { world.setBlock(x, y, z, want); changed.push({ x, y, z }); }
      } else if (id === B.shunt || id === B.shuntOn) {
        const want = p > 0 ? B.shuntOn : B.shunt;
        if (want !== id) { world.setBlock(x, y, z, want); changed.push({ x, y, z }); }
      }
    }
  }
  return changed;
}
