/**
 * Trackway — FABLE's rail network shape rules.
 *
 * Original naming, per the project's convention (Spark Dust, the Shunt, the Brewing Hearth): the
 * rail is a **Trackway**, the cart that runs on it is an **Ore Cart**.
 *
 * This module is pure: it answers "given the blocks around this spot, what shape should this piece
 * of track be, and where does a cart go next?" without touching Three.js, chunks or entities. That
 * makes the snapping and pathing rules unit-testable against a plain grid, the same way the Spark
 * circuit engine is.
 *
 * Shapes supported this pass: the two straights, the four curves, and the four ascending slopes.
 * Not in this pass (tracked as follow-up): powered/boost track, detector track, and junction
 * switching by signal.
 */

/** The ten track shapes, as an ordered list so a block id can be derived by index. */
export const TRACK_SHAPES = [
  'ns', 'ew',                 // straights
  'ne', 'nw', 'se', 'sw',     // curves, named for the two directions they join
  'asc_n', 'asc_s', 'asc_e', 'asc_w', // ascending toward that compass direction
] as const;
export type TrackShape = (typeof TRACK_SHAPES)[number];

/** Unit steps for the four compass directions. */
export const DIRS = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] } as const;
export type Dir = keyof typeof DIRS;

/** The opposite of a direction. */
export function opposite(d: Dir): Dir {
  return d === 'n' ? 's' : d === 's' ? 'n' : d === 'e' ? 'w' : 'e';
}

/** Which two directions a shape connects. Ascending shapes connect their slope dir and its reverse. */
export function shapeExits(shape: TrackShape): [Dir, Dir] {
  switch (shape) {
    case 'ns': return ['n', 's'];
    case 'ew': return ['e', 'w'];
    case 'ne': return ['n', 'e'];
    case 'nw': return ['n', 'w'];
    case 'se': return ['s', 'e'];
    case 'sw': return ['s', 'w'];
    case 'asc_n': return ['n', 's'];
    case 'asc_s': return ['s', 'n'];
    case 'asc_e': return ['e', 'w'];
    case 'asc_w': return ['w', 'e'];
  }
}

/** True when the shape climbs, and toward which direction. */
export function ascendDir(shape: TrackShape): Dir | null {
  return shape === 'asc_n' ? 'n' : shape === 'asc_s' ? 's' : shape === 'asc_e' ? 'e' : shape === 'asc_w' ? 'w' : null;
}

/** True for the four curve shapes. */
export function isCurve(shape: TrackShape): boolean {
  return shape === 'ne' || shape === 'nw' || shape === 'se' || shape === 'sw';
}

/** Probe used by the shape solver: does a track piece exist at this offset? */
export interface TrackProbe {
  /** track at (x, y, z) — the same level */
  at(x: number, y: number, z: number): boolean;
}

/**
 * Work out the shape a piece of track at (x,y,z) should take, from its neighbours.
 *
 * The rules mirror what players expect from a rail system:
 *   - two neighbours on one axis -> a straight;
 *   - two neighbours on different axes -> the curve joining them;
 *   - one neighbour -> a straight pointing at it;
 *   - none -> default to north/south.
 * A neighbour one block higher makes this piece ascend toward it, which is how a track climbs a
 * step without the player placing a special block.
 */
export function solveShape(probe: TrackProbe, x: number, y: number, z: number): TrackShape {
  const flat: Dir[] = [];
  const up: Dir[] = [];
  for (const d of ['n', 's', 'e', 'w'] as Dir[]) {
    const [dx, dz] = DIRS[d];
    if (probe.at(x + dx, y, z + dz)) { flat.push(d); continue; }
    // a piece one step up in that direction: this tile becomes the ramp to it
    if (probe.at(x + dx, y + 1, z + dz)) { up.push(d); flat.push(d); }
  }
  // Ascending wins: a ramp reads more strongly than the straight it sits on.
  if (up.length > 0) {
    const d = up[0];
    return (`asc_${d}`) as TrackShape;
  }
  if (flat.length === 0) return 'ns';
  if (flat.length === 1) return flat[0] === 'n' || flat[0] === 's' ? 'ns' : 'ew';
  // pick the first two connections and see whether they form a line or a corner
  const [a, b] = flat;
  if ((a === 'n' && b === 's') || (a === 's' && b === 'n')) return 'ns';
  if ((a === 'e' && b === 'w') || (a === 'w' && b === 'e')) return 'ew';
  const ns = flat.find((d) => d === 'n' || d === 's');
  const ew = flat.find((d) => d === 'e' || d === 'w');
  if (ns && ew) return (ns + ew) as TrackShape;
  return 'ns';
}

/**
 * Given the shape a cart is on and the direction it came from, where does it leave?
 *
 * Returns null when the cart entered from a direction this shape does not connect — the caller
 * should stop the cart rather than teleport it.
 */
export function exitDir(shape: TrackShape, entryFrom: Dir): Dir | null {
  const [a, b] = shapeExits(shape);
  if (entryFrom === a) return b;
  if (entryFrom === b) return a;
  return null;
}

/**
 * The centre a cart should be pulled toward on a given track tile, in block-local coordinates
 * (0..1). Straights centre on their axis; curves cut the corner slightly so a cart rounds them
 * without a visible snap.
 */
export function trackCentre(shape: TrackShape): [number, number] {
  if (isCurve(shape)) {
    const [a, b] = shapeExits(shape);
    let cx = 0.5, cz = 0.5;
    for (const d of [a, b]) {
      const [dx, dz] = DIRS[d];
      cx += dx * 0.12; cz += dz * 0.12;
    }
    return [cx, cz];
  }
  return [0.5, 0.5];
}

/** How far up the tile a cart sits, 0..1, for a given shape and progress across it. */
export function trackHeight(shape: TrackShape, progress: number): number {
  const asc = ascendDir(shape);
  if (!asc) return 0.0625;                 // flat rails sit just above the block face
  return 0.0625 + Math.max(0, Math.min(1, progress)) * 0.9375;
}

// -------------------------------------------------------------------------------------------
// Cart physics

/** Everything the cart solver needs to know about the tile the cart is on. */
export interface CartState {
  /** current speed along the track, blocks/second; always non-negative */
  speed: number;
  /** the direction the cart is travelling */
  dir: Dir;
}

/** Terminal speed of a cart, blocks/second. */
export const CART_MAX_SPEED = 8;
/** Rolling resistance applied every second on flat track. */
export const CART_FRICTION = 0.55;
/** Speed gained per second rolling down a slope (and lost climbing one). */
export const CART_SLOPE_ACCEL = 6;

/**
 * Advance a cart's speed for one tick.
 *
 * Deliberately simple, per the brief: rolling resistance, gravity on slopes, a speed cap, and a
 * push from a rider's input. No suspension, no momentum transfer between carts.
 *
 * `slope` is +1 when the cart is climbing, -1 when descending, 0 on the flat.
 * `push` is -1..1 from the rider.
 */
export function stepCartSpeed(speed: number, slope: number, push: number, dt: number): number {
  let s = speed;
  s -= slope * CART_SLOPE_ACCEL * dt;          // climbing bleeds speed, descending adds it
  s += push * 3.5 * dt;                        // the rider can nudge it along
  s -= Math.sign(s) * CART_FRICTION * dt;      // rolling resistance always opposes motion
  if (Math.abs(s) < 0.05 && Math.abs(push) < 0.01 && slope === 0) s = 0; // settle rather than creep
  return Math.max(-CART_MAX_SPEED, Math.min(CART_MAX_SPEED, s));
}
