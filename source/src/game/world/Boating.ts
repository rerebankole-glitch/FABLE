/**
 * Skiff — FABLE's small boat, and the buoyancy rules that float it.
 *
 * Original naming per the project convention: the craft is a **Skiff**.
 *
 * Pure logic only: given how deeply the hull is submerged and what the paddler is doing, this
 * returns the new vertical and horizontal velocity. No Three.js, no world access — the caller
 * samples the water and supplies the numbers, which keeps the float behaviour unit-testable.
 *
 * Deliberately simple, per the brief: buoyancy toward a rest waterline, damping so it settles
 * instead of bobbing forever, and directional paddling. No wave simulation, no wake, no capsizing.
 */

/** How far the hull sits below the water surface when floating at rest, in blocks. */
export const SKIFF_DRAFT = 0.18;
/** Upward acceleration per block of extra submersion. */
export const SKIFF_BUOYANCY = 42;
/** Vertical damping, so the hull settles rather than oscillating. */
export const SKIFF_VDAMP = 6.5;
/** Top paddling speed, blocks/second. */
export const SKIFF_MAX_SPEED = 5.2;
/**
 * Paddle acceleration, blocks/second squared.
 *
 * Terminal speed under linear drag is ACCEL / DRAG, so this is chosen to land just above
 * SKIFF_MAX_SPEED — otherwise the cap would be unreachable dead code and the skiff would quietly
 * top out slower than advertised.
 */
export const SKIFF_ACCEL = 10;
/** Water drag applied to horizontal motion each second. */
export const SKIFF_DRAG = 1.9;
/** Drag applied on land, so a beached skiff stops quickly. */
export const SKIFF_LAND_DRAG = 6;
/** Gravity applied when the hull is clear of the water. */
export const SKIFF_GRAVITY = 20;

/**
 * New vertical velocity for one tick.
 *
 * `submersion` is how far the hull's waterline sits below the surface, in blocks: 0 means the hull
 * is exactly at the surface, positive means it is pushed under, negative means it is in the air.
 * Out of the water the skiff simply falls.
 */
export function stepBuoyancy(vy: number, submersion: number, dt: number): number {
  if (submersion <= 0) {
    // airborne: plain gravity, no buoyant force to apply
    return vy - SKIFF_GRAVITY * dt;
  }
  // Restoring spring toward the waterline, plus damping so it settles instead of bobbing.
  //
  // Gravity is deliberately NOT applied here. Subtracting it would shift the equilibrium to
  // wherever buoyancy happens to cancel weight (submersion = GRAVITY / BUOYANCY, about half a
  // block deeper), which made SKIFF_DRAFT a lie: the hull rested far below its stated draft line.
  // Treating the submerged case as a spring centred on zero means the skiff comes to rest with its
  // draft line exactly at the surface, which is what the constant claims and what looks right.
  let v = vy + SKIFF_BUOYANCY * submersion * dt;
  v -= v * Math.min(1, SKIFF_VDAMP * dt);
  return v;
}

/**
 * The depth of submersion for a hull whose base sits at `hullY`, given the water surface height.
 * Returns a value clamped so a deeply sunk hull does not launch itself out of the sea.
 */
export function submersionAt(hullY: number, waterTopY: number): number {
  return Math.max(-1, Math.min(0.6, waterTopY - (hullY + SKIFF_DRAFT)));
}

/** Horizontal paddling result. */
export interface Paddle { vx: number; vz: number }

/**
 * Apply one tick of paddling and drag.
 *
 * `forward` is -1..1 (back-paddle to full ahead) and `dirX`/`dirZ` is the unit heading the skiff
 * points along. `afloat` selects water drag or the much heavier land drag.
 */
export function stepPaddle(vx: number, vz: number, dirX: number, dirZ: number, forward: number, afloat: boolean, dt: number): Paddle {
  let nx = vx, nz = vz;
  if (afloat && forward !== 0) {
    nx += dirX * forward * SKIFF_ACCEL * dt;
    nz += dirZ * forward * SKIFF_ACCEL * dt;
  }
  const drag = afloat ? SKIFF_DRAG : SKIFF_LAND_DRAG;
  const k = Math.max(0, 1 - drag * dt);
  nx *= k; nz *= k;
  // cap the speed without changing the heading
  const sp = Math.hypot(nx, nz);
  if (sp > SKIFF_MAX_SPEED) { nx = (nx / sp) * SKIFF_MAX_SPEED; nz = (nz / sp) * SKIFF_MAX_SPEED; }
  if (sp < 0.02 && forward === 0) { nx = 0; nz = 0; }   // settle instead of drifting forever
  return { vx: nx, vz: nz };
}

/** Turn rate in radians/second while paddling. */
export const SKIFF_TURN = 2.1;

/** New heading after one tick of steering input (-1..1). */
export function stepHeading(yaw: number, turn: number, dt: number): number {
  return yaw + turn * SKIFF_TURN * dt;
}
