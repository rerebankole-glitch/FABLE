// Trackway shape solving, Ore Cart physics, Skiff buoyancy, and Mending Stone reforging.
// All four are pure modules, so every rule below is checked against plain values with no world,
// no renderer and no entities involved.
import {
  TRACK_SHAPES, solveShape, shapeExits, exitDir, ascendDir, isCurve, opposite,
  trackCentre, trackHeight, stepCartSpeed, CART_MAX_SPEED, CART_FRICTION, type TrackShape, type Dir,
} from '../src/game/world/Rails';
import {
  stepBuoyancy, submersionAt, stepPaddle, stepHeading,
  SKIFF_DRAFT, SKIFF_MAX_SPEED,
} from '../src/game/world/Boating';
import { fuse, canFuse, strip, canStrip, runesOn, remainingOf, maxDurabilityOf, STRIP_COST } from '../src/game/crafting/Reforging';
import { makeStack, ITEMS } from '../src/game/items/Items';
import { RECIPES } from '../src/game/crafting/Recipes';
import type { ItemStack } from '../src/game/core/types';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string): void => { if (c) pass++; else { fail++; console.error('FAIL: ' + m); } };

// ============================================================ Trackway shapes
console.log('=== trackway');

/** A tiny grid of track positions for the shape solver. */
class Track {
  private s = new Set<string>();
  add(x: number, y: number, z: number): this { this.s.add(`${x},${y},${z}`); return this; }
  at(x: number, y: number, z: number): boolean { return this.s.has(`${x},${y},${z}`); }
}

// every shape is self-consistent
for (const sh of TRACK_SHAPES) {
  const [a, b] = shapeExits(sh);
  ok(a !== b, `shape '${sh}' connects two distinct directions`);
  ok(exitDir(sh, a) === b, `entering '${sh}' from ${a} leaves ${b}`);
  ok(exitDir(sh, b) === a, `entering '${sh}' from ${b} leaves ${a}`);
  // entering from a direction it does not connect is refused, not guessed
  const others = (['n', 's', 'e', 'w'] as Dir[]).filter((d) => d !== a && d !== b);
  for (const o of others) ok(exitDir(sh, o) === null, `'${sh}' refuses an entry from ${o}`);
}
console.log(`  ${TRACK_SHAPES.length} shapes, all exits reciprocal`);

// isolated piece
ok(solveShape(new Track(), 0, 0, 0) === 'ns', 'a lone track defaults to north/south');

// straights
{
  const t = new Track().add(0, 0, 0).add(0, 0, -1).add(0, 0, 1);
  ok(solveShape(t, 0, 0, 0) === 'ns', 'neighbours north and south make a NS straight');
  const u = new Track().add(0, 0, 0).add(-1, 0, 0).add(1, 0, 0);
  ok(solveShape(u, 0, 0, 0) === 'ew', 'neighbours east and west make an EW straight');
}

// a single neighbour points the straight at it
{
  const t = new Track().add(0, 0, 0).add(1, 0, 0);
  ok(solveShape(t, 0, 0, 0) === 'ew', 'one east neighbour makes an EW straight');
  const u = new Track().add(0, 0, 0).add(0, 0, -1);
  ok(solveShape(u, 0, 0, 0) === 'ns', 'one north neighbour makes a NS straight');
}

// curves: all four corners
{
  const cases: [Dir, Dir, TrackShape][] = [['n', 'e', 'ne'], ['n', 'w', 'nw'], ['s', 'e', 'se'], ['s', 'w', 'sw']];
  for (const [d1, d2, want] of cases) {
    const t = new Track().add(0, 0, 0);
    for (const d of [d1, d2]) {
      const off: Record<Dir, [number, number]> = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
      const [dx, dz] = off[d];
      t.add(dx, 0, dz);
    }
    const got = solveShape(t, 0, 0, 0);
    ok(got === want, `neighbours ${d1}+${d2} make the '${want}' curve, got '${got}'`);
    ok(isCurve(got), `'${got}' is recognised as a curve`);
  }
}

// slopes: a neighbour one block up turns this tile into a ramp
{
  const t = new Track().add(0, 0, 0).add(1, 1, 0);
  const sh = solveShape(t, 0, 0, 0);
  ok(sh === 'asc_e', `a track one step up to the east makes an east ramp, got '${sh}'`);
  ok(ascendDir(sh) === 'e', 'the ramp climbs east');
  ok(!isCurve(sh), 'a ramp is not a curve');
  // a flat straight does not climb
  ok(ascendDir('ns') === null, 'a flat straight does not climb');
}

// geometry helpers
{
  ok(trackHeight('ns', 0.5) < 0.2, 'a flat track sits just above the block face');
  ok(trackHeight('asc_n', 0) < trackHeight('asc_n', 1), 'a ramp rises across the tile');
  ok(Math.abs(trackHeight('asc_n', 1) - 1) < 0.01, 'a ramp reaches the top of its block');
  const [cx, cz] = trackCentre('ns');
  ok(cx === 0.5 && cz === 0.5, 'a straight centres the cart');
  const [qx, qz] = trackCentre('ne');
  ok(qx !== 0.5 || qz !== 0.5, 'a curve offsets the cart so it cuts the corner');
}

// direction helpers
ok(opposite('n') === 's' && opposite('e') === 'w', 'opposite() pairs the compass');

// ---- a cart can actually traverse a built line, end to end
{
  // a straight run east with a curve north at the end
  const t = new Track();
  for (let x = 0; x <= 4; x++) t.add(x, 0, 0);
  t.add(4, 0, -1);
  let x = 0, z = 0;
  let dir: Dir = 'e';
  const visited: string[] = [];
  for (let step = 0; step < 10; step++) {
    visited.push(`${x},${z}`);
    const sh = solveShape(t, x, 0, z);
    const next = exitDir(sh, opposite(dir));
    if (!next) break;
    const off: Record<Dir, [number, number]> = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
    const [dx, dz] = off[next];
    if (!t.at(x + dx, 0, z + dz)) break;
    x += dx; z += dz; dir = next;
  }
  ok(visited.length >= 5, `the cart runs the whole line, visited ${visited.length} tiles`);
  ok(x === 4 && z === -1, `the cart takes the curve and ends north of the corner, at ${x},${z}`);
  console.log(`  traversal: ${visited.length} tiles then the curve, ending ${x},${z}`);
}

// ============================================================ Ore Cart physics
console.log('=== ore cart');
{
  // friction alone brings a rolling cart to rest
  let s = 4;
  for (let i = 0; i < 600; i++) s = stepCartSpeed(s, 0, 0, 1 / 60);
  ok(s === 0, `a coasting cart stops on the flat, got ${s.toFixed(3)}`);

  // a descending cart accelerates
  let d = 0;
  for (let i = 0; i < 60; i++) d = stepCartSpeed(d, -1, 0, 1 / 60);
  ok(d > 2, `a cart rolls downhill, reaching ${d.toFixed(2)} b/s after 1s`);

  // a climbing cart loses speed and can stall
  let u = 3;
  for (let i = 0; i < 120; i++) u = stepCartSpeed(u, 1, 0, 1 / 60);
  ok(u < 0, `a cart run out of momentum rolls back down, got ${u.toFixed(2)}`);

  // the speed cap holds under sustained push
  let f = 0;
  for (let i = 0; i < 1200; i++) f = stepCartSpeed(f, 0, 1, 1 / 60);
  ok(f <= CART_MAX_SPEED + 1e-9, `speed is capped at ${CART_MAX_SPEED}, got ${f.toFixed(2)}`);
  ok(f > CART_MAX_SPEED * 0.9, 'a pushed cart does reach near top speed');
  console.log(`  top speed ${f.toFixed(2)} b/s, friction ${CART_FRICTION}/s, stalls uphill`);

  // deterministic
  const runA = (() => { let v = 2; for (let i = 0; i < 100; i++) v = stepCartSpeed(v, 0, 0.5, 1 / 60); return v; })();
  const runB = (() => { let v = 2; for (let i = 0; i < 100; i++) v = stepCartSpeed(v, 0, 0.5, 1 / 60); return v; })();
  ok(runA === runB, 'cart physics is deterministic');
}

// ============================================================ Skiff
console.log('=== skiff');
{
  // a hull dropped onto water settles at the waterline instead of sinking or launching
  let y = 64.9, vy = 0;
  for (let i = 0; i < 900; i++) {
    const sub = submersionAt(y, 64.0);
    vy = stepBuoyancy(vy, sub, 1 / 60);
    y += vy / 60;
  }
  const restDepth = 64.0 - y;
  ok(Math.abs(restDepth - SKIFF_DRAFT) < 0.06, `the skiff floats at its draft line, sits ${restDepth.toFixed(3)} below the surface (draft ${SKIFF_DRAFT})`);
  ok(Math.abs(vy) < 0.05, `and it comes to rest rather than bobbing, vy=${vy.toFixed(4)}`);
  console.log(`  floats at ${restDepth.toFixed(3)} blocks submerged, settles to vy=${vy.toFixed(4)}`);

  // out of the water it falls
  const air = stepBuoyancy(0, submersionAt(80, 64), 1 / 60);
  ok(air < 0, 'a skiff in mid-air falls');

  // pushed under, it pops back up
  const deep = stepBuoyancy(0, submersionAt(63.0, 64.0), 1 / 60);
  ok(deep > 0, 'a submerged hull is pushed upward');

  // paddling accelerates along the heading, and drag stops it again
  let p = stepPaddle(0, 0, 1, 0, 1, true, 1 / 60);
  ok(p.vx > 0 && p.vz === 0, 'paddling forward drives along the heading');
  for (let i = 0; i < 600; i++) p = stepPaddle(p.vx, p.vz, 1, 0, 1, true, 1 / 60);
  ok(Math.hypot(p.vx, p.vz) <= SKIFF_MAX_SPEED + 1e-9, `skiff speed is capped at ${SKIFF_MAX_SPEED}, got ${Math.hypot(p.vx, p.vz).toFixed(2)}`);
  console.log(`  paddle top speed ${Math.hypot(p.vx, p.vz).toFixed(2)} b/s`);

  // releasing the paddle brings it to a stop
  let c = { vx: 3, vz: 0 };
  for (let i = 0; i < 900; i++) c = stepPaddle(c.vx, c.vz, 1, 0, 0, true, 1 / 60);
  ok(c.vx === 0 && c.vz === 0, `a drifting skiff comes to rest, got ${c.vx.toFixed(3)}`);

  // a beached skiff stops much faster than a floating one
  const water = (() => { let v = { vx: 3, vz: 0 }; for (let i = 0; i < 30; i++) v = stepPaddle(v.vx, v.vz, 1, 0, 0, true, 1 / 60); return v.vx; })();
  const land = (() => { let v = { vx: 3, vz: 0 }; for (let i = 0; i < 30; i++) v = stepPaddle(v.vx, v.vz, 1, 0, 0, false, 1 / 60); return v.vx; })();
  ok(land < water, `a beached skiff slows faster (${land.toFixed(2)}) than a floating one (${water.toFixed(2)})`);

  // steering turns the heading
  ok(stepHeading(0, 1, 0.5) > 0, 'steering right increases the heading');
  ok(stepHeading(0, -1, 0.5) < 0, 'steering left decreases it');
}

// ============================================================ Mending Stone
console.log('=== mending stone');
{
  const max = maxDurabilityOf(makeStack('iron_pickaxe'));
  ok(max > 0, 'a pickaxe has durability');

  // two damaged tools fuse into one with summed durability
  const a: ItemStack = { id: 'iron_pickaxe', count: 1, durability: 50 };
  const b: ItemStack = { id: 'iron_pickaxe', count: 1, durability: 60 };
  ok(canFuse(a, b), 'two damaged pickaxes can be fused');
  const f = fuse(a, b)!;
  ok(f !== null, 'fusing produces a tool');
  ok(remainingOf(f) === 50 + 60 + Math.floor(max * 0.05), `durability sums with the 5% bonus, got ${remainingOf(f)}`);
  ok(f.count === 1, 'the result is a single tool');
  console.log(`  fuse: 50 + 60 -> ${remainingOf(f)} of ${max}`);

  // the cap holds: two nearly-full tools cannot exceed max
  const big = fuse({ id: 'iron_pickaxe', count: 1, durability: max - 5 }, { id: 'iron_pickaxe', count: 1, durability: max - 5 })!;
  ok(remainingOf(big) === max, `fusing is capped at max durability, got ${remainingOf(big)} of ${max}`);
  ok(big.durability === max, 'a fully repaired tool reports full durability');

  // mismatched or non-durable items are refused
  ok(!canFuse({ id: 'iron_pickaxe', count: 1, durability: 5 }, { id: 'iron_sword', count: 1, durability: 5 }), 'different tools cannot be fused');
  ok(fuse({ id: 'iron_pickaxe', count: 1, durability: 5 }, { id: 'iron_sword', count: 1, durability: 5 }) === null, 'and fuse() returns null for them');
  ok(!canFuse({ id: 'cobblestone', count: 1 }, { id: 'cobblestone', count: 1 }), 'plain blocks have no durability to fuse');
  ok(!canFuse(makeStack('iron_pickaxe'), makeStack('iron_pickaxe')), 'two pristine tools have nothing to repair');

  // runes survive a fuse, taking the higher rank
  const r1: ItemStack = { id: 'iron_pickaxe', count: 1, durability: 30, ench: { swiftness: 1, fortune: 2 } };
  const r2: ItemStack = { id: 'iron_pickaxe', count: 1, durability: 30, ench: { swiftness: 3 } };
  const rf = fuse(r1, r2)!;
  ok(rf.ench?.swiftness === 3, `the higher rune rank wins, got ${rf.ench?.swiftness}`);
  ok(rf.ench?.fortune === 2, 'a rune present on only one input survives');

  // stripping a rune costs levels and leaves the tool otherwise intact
  const s: ItemStack = { id: 'iron_pickaxe', count: 1, durability: 90, ench: { swiftness: 2, fortune: 1 } };
  ok(runesOn(s).length === 2, 'the tool carries two runes');
  ok(canStrip(s, 'swiftness', 5), 'a rune can be stripped when the player can pay');
  ok(!canStrip(s, 'swiftness', STRIP_COST - 1), 'but not when they cannot afford it');
  ok(!canStrip(s, 'protection', 50), 'a rune that is not on the tool cannot be stripped');
  const res = strip(s, 'swiftness', 10)!;
  ok(res.levels === 10 - STRIP_COST, `stripping costs ${STRIP_COST} levels, ${res.levels} left`);
  ok(res.stack.ench?.swiftness === undefined, 'the rune is gone');
  ok(res.stack.ench?.fortune === 1, 'the other rune stays');
  ok(res.stack.durability === 90, 'stripping does not repair the tool');
  ok(s.ench?.swiftness === 2, 'the original stack is not mutated');

  // stripping the last rune clears the record entirely
  const one: ItemStack = { id: 'iron_pickaxe', count: 1, durability: 10, ench: { fortune: 1 } };
  const cleared = strip(one, 'fortune', 5)!;
  ok(cleared.stack.ench === undefined, 'the ench record is removed once the last rune goes');
  ok(strip(one, 'nope', 5) === null, 'stripping an absent rune returns null');
}

// ============================================================ content is real and obtainable
console.log('=== content');
{
  for (const id of ['trackway', 'ore_cart', 'skiff', 'mending_stone']) {
    ok(ITEMS.has(id), `'${id}' exists in the item table`);
    const recipe = RECIPES.find((r) => r.result.id === id);
    ok(!!recipe, `'${id}' has a recipe`);
    if (recipe) {
      const ings = recipe.key ? Object.values(recipe.key) : (recipe.ingredients ?? []);
      for (const ing of ings) ok(ing.startsWith('tag:') || ITEMS.has(ing), `'${id}' ingredient '${ing}' is a real item`);
    }
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
