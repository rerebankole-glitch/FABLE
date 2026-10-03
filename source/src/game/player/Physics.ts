import { B, BLOCKS } from '../blocks/Blocks';

export interface BlockGetter {
  getBlock(x: number, y: number, z: number): number;
}

export interface Body {
  x: number; y: number; z: number;   // feet centre
  vx: number; vy: number; vz: number;
  w: number; h: number;              // half-width, height
  onGround: boolean;
  inWater: boolean;
  inLava: boolean;
  onLadder: boolean;
  stepHeight: number;
  collidedH: boolean;
  /** true when the body started the last move overlapping solid geometry (block placed / fell into it) */
  embedded: boolean;
}

export function makeBody(x: number, y: number, z: number, w: number, h: number): Body {
  return { x, y, z, vx: 0, vy: 0, vz: 0, w, h, onGround: false, inWater: false, inLava: false, onLadder: false, stepHeight: 0.6, collidedH: false, embedded: false };
}

interface Box { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number }

// Reused between calls: no per-frame allocations in the hot path.
const tmpBoxes: Box[] = [];
const boxPool: Box[] = [];
function pushBox(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
  let b = boxPool[tmpBoxes.length];
  if (!b) { b = { x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0 }; boxPool[tmpBoxes.length] = b; }
  b.x0 = x0; b.y0 = y0; b.z0 = z0; b.x1 = x1; b.y1 = y1; b.z1 = z1;
  tmpBoxes.push(b);
}

/** Collects the collision boxes of all solid blocks intersecting the given region. */
function collectBoxes(world: BlockGetter, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Box[] {
  tmpBoxes.length = 0;
  const bx0 = Math.floor(x0), bx1 = Math.floor(x1);
  const by0 = Math.max(0, Math.floor(y0)), by1 = Math.floor(y1);
  const bz0 = Math.floor(z0), bz1 = Math.floor(z1);
  for (let x = bx0; x <= bx1; x++) for (let y = by0; y <= by1; y++) for (let z = bz0; z <= bz1; z++) {
    const id = world.getBlock(x, y, z);
    if (id === B.AIR) continue;
    const def = BLOCKS[id];
    if (!def || !def.solid) continue;
    if (def.box) {
      const b = def.box;
      pushBox(x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]);
    } else pushBox(x, y, z, x + 1, y + 1, z + 1);
  }
  return tmpBoxes;
}

function overlaps(ax0: number, ay0: number, az0: number, ax1: number, ay1: number, az1: number, b: Box): boolean {
  return ax0 < b.x1 && ax1 > b.x0 && ay0 < b.y1 && ay1 > b.y0 && az0 < b.z1 && az1 > b.z0;
}

const EPS = 1e-4;
/** Largest distance a body may travel per sub-step (prevents corner clipping at low frame rates). */
const MAX_STEP = 0.45;

/** True when the body's box (shrunk by a hair) intersects any solid block. */
export function bodyOverlapsWorld(world: BlockGetter, b: Body, x = b.x, y = b.y, z = b.z): boolean {
  const boxes = collectBoxes(world, x - b.w, y, z - b.w, x + b.w, y + b.h, z + b.w);
  for (let i = 0; i < boxes.length; i++) if (overlaps(x - b.w + EPS, y + EPS, z - b.w + EPS, x + b.w - EPS, y + b.h - EPS, z + b.w - EPS, boxes[i])) return true;
  return false;
}

/**
 * If the body starts inside solid geometry (a block was placed or fell into it, a chunk loaded around it),
 * push it out along the shortest free direction. Upward pushes are preferred for shallow overlaps
 * (standing inside a slab or a freshly-grown crop block). Returns true when a push happened.
 */
function resolveEmbedding(world: BlockGetter, b: Body): boolean {
  const x0 = b.x - b.w, x1 = b.x + b.w, y0 = b.y, y1 = b.y + b.h, z0 = b.z - b.w, z1 = b.z + b.w;
  const boxes = collectBoxes(world, x0, y0, z0, x1, y1, z1);
  let up = 0, down = 0, px = 0, nx = 0, pz = 0, nz = 0, any = false;
  for (let i = 0; i < boxes.length; i++) {
    const bx = boxes[i];
    if (!overlaps(x0 + EPS, y0 + EPS, z0 + EPS, x1 - EPS, y1 - EPS, z1 - EPS, bx)) continue;
    any = true;
    up = Math.max(up, bx.y1 - y0); down = Math.max(down, y1 - bx.y0);
    px = Math.max(px, bx.x1 - x0); nx = Math.max(nx, x1 - bx.x0);
    pz = Math.max(pz, bx.z1 - z0); nz = Math.max(nz, z1 - bx.z0);
  }
  if (!any) return false;
  // Candidate pushes: [cost, dx, dy, dz]. Pushing up is discounted for shallow overlaps
  // (standing inside a slab / a block that just grew under the feet).
  PUSH[0][0] = up <= 0.65 ? up * 0.5 : up; PUSH[0][2] = up;
  PUSH[1][0] = px; PUSH[1][1] = px;
  PUSH[2][0] = nx; PUSH[2][1] = -nx;
  PUSH[3][0] = pz; PUSH[3][3] = pz;
  PUSH[4][0] = nz; PUSH[4][3] = -nz;
  PUSH[5][0] = down * 1.5; PUSH[5][2] = -down;
  let best = -1, bestCost = Infinity;
  for (let i = 0; i < PUSH.length; i++) {
    const c = PUSH[i];
    const amount = Math.abs(c[1]) + Math.abs(c[2]) + Math.abs(c[3]);
    if (amount <= 0 || amount > 1.05 || c[0] >= bestCost) continue;
    if (!bodyOverlapsWorld(world, b, b.x + c[1] * 1.001, b.y + c[2] * 1.001 + EPS * 2, b.z + c[3] * 1.001)) { bestCost = c[0]; best = i; }
  }
  if (best < 0) return false;
  const c = PUSH[best];
  b.x += c[1] + Math.sign(c[1]) * EPS; b.y += c[2] + Math.sign(c[2]) * EPS; b.z += c[3] + Math.sign(c[3]) * EPS;
  if (c[1] > 0) b.vx = Math.max(0, b.vx); else if (c[1] < 0) b.vx = Math.min(0, b.vx);
  if (c[3] > 0) b.vz = Math.max(0, b.vz); else if (c[3] < 0) b.vz = Math.min(0, b.vz);
  if (c[2] > 0) { b.vy = Math.max(0, b.vy); b.onGround = true; } else if (c[2] < 0) b.vy = Math.min(0, b.vy);
  return true;
}
const PUSH: [number, number, number, number][] = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];

/** Swept AABB movement; resolves each axis separately, supports auto-step, sub-steps long moves. */
export function moveBody(world: BlockGetter, b: Body, dt: number, noclip = false): void {
  b.collidedH = false;
  if (noclip) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    b.onGround = false; b.inWater = false; b.inLava = false; b.onLadder = false; b.embedded = false;
    return;
  }
  b.embedded = resolveEmbedding(world, b);
  const dx = b.vx * dt, dy = b.vy * dt, dz = b.vz * dt;
  const longest = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
  const steps = Math.min(8, Math.max(1, Math.ceil(longest / MAX_STEP)));
  const wasOnGround = b.onGround;
  let onGround = false;
  for (let s = 0; s < steps; s++) {
    // velocities may have been zeroed by a collision in an earlier sub-step
    const sdx = (b.vx * dt) / steps, sdy = (b.vy * dt) / steps, sdz = (b.vz * dt) / steps;
    moveStep(world, b, sdx, sdy, sdz, wasOnGround || onGround);
    onGround = onGround || b.onGround;
    if (b.vx === 0 && b.vy === 0 && b.vz === 0) break;
  }
  b.onGround = onGround;
  // Fluids / ladders
  b.inWater = false; b.inLava = false; b.onLadder = false;
  const fx0 = Math.floor(b.x - b.w + 0.05), fx1 = Math.floor(b.x + b.w - 0.05);
  const fz0 = Math.floor(b.z - b.w + 0.05), fz1 = Math.floor(b.z + b.w - 0.05);
  const fy0 = Math.floor(b.y + 0.05), fy1 = Math.floor(b.y + b.h - 0.1);
  for (let x = fx0; x <= fx1; x++) for (let y = fy0; y <= fy1; y++) for (let z = fz0; z <= fz1; z++) {
    const id = world.getBlock(x, y, z);
    if (id === B.WATER) b.inWater = true;
    else if (id === B.LAVA) b.inLava = true;
    else if (BLOCKS[id]?.climbable) b.onLadder = true;
  }
  if (b.inLava) b.inWater = false;
}

function moveStep(world: BlockGetter, b: Body, dx: number, dy: number, dz: number, canStep: boolean): void {
  const startY = b.y;
  b.onGround = false;
  // Y axis
  moveAxis(world, b, 1, dy);
  const landed = b.onGround;
  // X then Z with stepping
  const beforeX = b.x, beforeZ = b.z;
  const movedX = moveAxis(world, b, 0, dx);
  const movedZ = moveAxis(world, b, 2, dz);
  const blockedX = movedX !== dx, blockedZ = movedZ !== dz;
  if ((blockedX || blockedZ) && canStep && b.stepHeight > 0) {
    // try again from a raised position
    const sx = b.x, sy = b.y, sz = b.z, svy = b.vy;
    b.x = beforeX; b.z = beforeZ; b.y = startY + (dy < 0 ? 0 : dy);
    b.onGround = false;
    const up = moveAxis(world, b, 1, b.stepHeight);
    const mx2 = moveAxis(world, b, 0, dx);
    const mz2 = moveAxis(world, b, 2, dz);
    moveAxis(world, b, 1, -up - 0.002);
    const gained = Math.abs(mx2) + Math.abs(mz2);
    const prev = Math.abs(movedX) + Math.abs(movedZ);
    if (gained > prev + 1e-6 && b.onGround && b.y > sy - 1e-6) {
      // step accepted; report any remaining collision on the raised path
      b.vy = Math.max(0, svy);
      if (mx2 !== dx) { b.vx = 0; b.collidedH = true; }
      if (mz2 !== dz) { b.vz = 0; b.collidedH = true; }
      return;
    }
    b.x = sx; b.y = sy; b.z = sz; b.vy = svy; b.onGround = landed;
  }
  if (blockedX) { b.vx = 0; b.collidedH = true; }
  if (blockedZ) { b.vz = 0; b.collidedH = true; }
}

/** Moves body along one axis by amount, stopping at collisions. Returns actual moved distance. */
function moveAxis(world: BlockGetter, b: Body, axis: 0 | 1 | 2, amount: number): number {
  if (amount === 0) return 0;
  const x0 = b.x - b.w, x1 = b.x + b.w;
  const y0 = b.y, y1 = b.y + b.h;
  const z0 = b.z - b.w, z1 = b.z + b.w;
  // broadphase region
  const rx0 = Math.min(x0, x0 + (axis === 0 ? amount : 0)), rx1 = Math.max(x1, x1 + (axis === 0 ? amount : 0));
  const ry0 = Math.min(y0, y0 + (axis === 1 ? amount : 0)), ry1 = Math.max(y1, y1 + (axis === 1 ? amount : 0));
  const rz0 = Math.min(z0, z0 + (axis === 2 ? amount : 0)), rz1 = Math.max(z1, z1 + (axis === 2 ? amount : 0));
  const boxes = collectBoxes(world, rx0 - 1, ry0 - 1, rz0 - 1, rx1 + 1, ry1 + 1, rz1 + 1);
  let move = amount;
  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i];
    if (axis === 0) {
      if (!(y0 < box.y1 - EPS && y1 > box.y0 + EPS && z0 < box.z1 - EPS && z1 > box.z0 + EPS)) continue;
      if (move > 0 && x1 <= box.x0 + EPS) move = Math.min(move, box.x0 - x1 - EPS);
      else if (move < 0 && x0 >= box.x1 - EPS) move = Math.max(move, box.x1 - x0 + EPS);
    } else if (axis === 1) {
      if (!(x0 < box.x1 - EPS && x1 > box.x0 + EPS && z0 < box.z1 - EPS && z1 > box.z0 + EPS)) continue;
      if (move > 0 && y1 <= box.y0 + EPS) move = Math.min(move, box.y0 - y1 - EPS);
      else if (move < 0 && y0 >= box.y1 - EPS) move = Math.max(move, box.y1 - y0 + EPS);
    } else {
      if (!(x0 < box.x1 - EPS && x1 > box.x0 + EPS && y0 < box.y1 - EPS && y1 > box.y0 + EPS)) continue;
      if (move > 0 && z1 <= box.z0 + EPS) move = Math.min(move, box.z0 - z1 - EPS);
      else if (move < 0 && z0 >= box.z1 - EPS) move = Math.max(move, box.z1 - z0 + EPS);
    }
  }
  if (Math.abs(move) < EPS) move = 0;
  if (axis === 0) b.x += move;
  else if (axis === 1) {
    b.y += move;
    if (move !== amount) {
      if (amount < 0) b.onGround = true;
      b.vy = 0;
    }
  } else b.z += move;
  return move;
}

/** True when there is solid support anywhere under the body's footprint (used by sneaking / AI). */
export function hasSupport(world: BlockGetter, b: Body, x = b.x, z = b.z, y = b.y): boolean {
  const boxes = collectBoxes(world, x - b.w, y - 0.1, z - b.w, x + b.w, y, z + b.w);
  for (let i = 0; i < boxes.length; i++) if (overlaps(x - b.w + EPS, y - 0.1, z - b.w + EPS, x + b.w - EPS, y + 0.05, z + b.w - EPS, boxes[i])) return true;
  return false;
}

/**
 * Auto-jump probe: true when the body is pushing against a one-block-high obstacle in the movement
 * direction that has enough head room to land on.
 */
export function canAutoJump(world: BlockGetter, b: Body, dirX: number, dirZ: number): boolean {
  const l = Math.hypot(dirX, dirZ);
  if (l < 0.01) return false;
  const px = b.x + (dirX / l) * (b.w + 0.35), pz = b.z + (dirZ / l) * (b.w + 0.35);
  const fy = Math.floor(b.y + 0.05);
  const bx = Math.floor(px), bz = Math.floor(pz);
  const front = world.getBlock(bx, fy, bz);
  if (front === B.AIR || !BLOCKS[front]?.solid) return false;
  // the obstacle must be at most ~1 block tall and the landing spot free for the whole body height.
  // `?.` matters here: the probes can land above the world ceiling (build limit) where a block
  // getter is allowed to report an unknown id — that must read as "clear", never crash the frame.
  const need = Math.ceil(b.h);
  for (let i = 1; i <= need; i++) {
    const id = world.getBlock(bx, fy + i, bz);
    if (id !== B.AIR && BLOCKS[id]?.solid) return false;
  }
  // head room above the current position too
  const top = world.getBlock(Math.floor(b.x), Math.floor(b.y + b.h + 1.0), Math.floor(b.z));
  return top === B.AIR || !BLOCKS[top]?.solid;
}

/** Ray-march through blocks. Returns hit block, previous (face) position. */
export function raycast(world: BlockGetter, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number, solidOnly = true): { x: number; y: number; z: number; px: number; py: number; pz: number; face: number; dist: number; id: number } | null {
  let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
  const stepX = Math.sign(dx), stepY = Math.sign(dy), stepZ = Math.sign(dz);
  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;
  let tMaxX = dx > 0 ? (x + 1 - ox) * tDeltaX : dx < 0 ? (ox - x) * tDeltaX : Infinity;
  let tMaxY = dy > 0 ? (y + 1 - oy) * tDeltaY : dy < 0 ? (oy - y) * tDeltaY : Infinity;
  let tMaxZ = dz > 0 ? (z + 1 - oz) * tDeltaZ : dz < 0 ? (oz - z) * tDeltaZ : Infinity;
  let px = x, py = y, pz = z;
  let face = -1;
  let dist = 0;
  for (let i = 0; i < 256; i++) {
    const id = world.getBlock(x, y, z);
    if (id !== B.AIR) {
      const def = BLOCKS[id];
      const hittable = solidOnly ? (def.solid || def.shape === 'cross' || def.shape === 'box') : true;
      if (hittable && def.shape !== 'liquid') {
        // precise box test for sub-blocks
        if (def.box) {
          const t = rayBox(ox, oy, oz, dx, dy, dz, x + def.box[0], y + def.box[1], z + def.box[2], x + def.box[3], y + def.box[4], z + def.box[5]);
          if (t !== null && t <= maxDist) return { x, y, z, px, py, pz, face, dist: t, id };
        } else if (def.shape === 'cross') {
          const t = rayBox(ox, oy, oz, dx, dy, dz, x + 0.1, y, z + 0.1, x + 0.9, y + 0.8, z + 0.9);
          if (t !== null && t <= maxDist) return { x, y, z, px, py, pz, face, dist: t, id };
        } else return { x, y, z, px, py, pz, face, dist, id };
      } else if (!solidOnly) return { x, y, z, px, py, pz, face, dist, id };
    }
    px = x; py = y; pz = z;
    if (tMaxX < tMaxY) {
      if (tMaxX < tMaxZ) { x += stepX; dist = tMaxX; tMaxX += tDeltaX; face = stepX > 0 ? 5 : 4; }
      else { z += stepZ; dist = tMaxZ; tMaxZ += tDeltaZ; face = stepZ > 0 ? 3 : 2; }
    } else {
      if (tMaxY < tMaxZ) { y += stepY; dist = tMaxY; tMaxY += tDeltaY; face = stepY > 0 ? 1 : 0; }
      else { z += stepZ; dist = tMaxZ; tMaxZ += tDeltaZ; face = stepZ > 0 ? 3 : 2; }
    }
    if (dist > maxDist) return null;
  }
  return null;
}

function rayBox(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): number | null {
  let tmin = -Infinity, tmax = Infinity;
  const o = [ox, oy, oz], d = [dx, dy, dz], lo = [x0, y0, z0], hi = [x1, y1, z1];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) { if (o[i] < lo[i] || o[i] > hi[i]) return null; continue; }
    let t1 = (lo[i] - o[i]) / d[i], t2 = (hi[i] - o[i]) / d[i];
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin >= 0 ? tmin : (tmax >= 0 ? 0 : null);
}

/** True when a solid block at (x,y,z) would occlude the segment between two points (used for line-of-sight checks). */
export function segmentBlocked(world: BlockGetter, ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return false;
  const hit = raycast(world, ax, ay, az, dx / len, dy / len, dz / len, len, true);
  return hit !== null && hit.dist < len - 0.05;
}
