// Pail: fill/empty against a plain grid, including the vanilla infinite-source rule.
import { fill, empty, regenerates, PAIL_EMPTY, PAIL_WATER, PAIL_LAVA, type PailWorld, type PailBlocks } from '../src/game/items/Bucket';
import { ITEMS } from '../src/game/items/Items';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string): void => { if (c) pass++; else { fail++; console.error('FAIL: ' + m); } };

const B: PailBlocks = { air: 0, water: 13, lava: 14 };
class Grid implements PailWorld {
  private m = new Map<string, number>();
  getBlock(x: number, y: number, z: number): number { return this.m.get(`${x},${y},${z}`) ?? B.air; }
  setBlock(x: number, y: number, z: number, id: number): void { this.m.set(`${x},${y},${z}`, id); }
}

// the three pail items must really exist
for (const id of [PAIL_EMPTY, PAIL_WATER, PAIL_LAVA]) ok(ITEMS.has(id), `pail item '${id}' must exist in the item table`);

// ---- a lone water source is finite ----
{
  const g = new Grid();
  g.setBlock(0, 0, 0, B.water);
  ok(!regenerates(g, B, 0, 0, 0), 'a lone source does not regenerate');
  ok(fill(g, B, 0, 0, 0) === PAIL_WATER, 'scooping water yields a water pail');
  ok(g.getBlock(0, 0, 0) === B.air, 'a lone source is consumed');
}

// ---- a 2x2 pool is infinite ----
{
  const g = new Grid();
  for (const [x, z] of [[0,0],[1,0],[0,1],[1,1]]) g.setBlock(x, 0, z, B.water);
  ok(regenerates(g, B, 0, 0, 0), 'a 2x2 pool corner has two water neighbours, so it regenerates');
  ok(fill(g, B, 0, 0, 0) === PAIL_WATER, 'you still get a full pail');
  ok(g.getBlock(0, 0, 0) === B.water, 'the source refills: a 2x2 pool never runs dry');
  // and it stays infinite no matter how often you scoop
  for (let i = 0; i < 20; i++) fill(g, B, 0, 0, 0);
  let left = 0;
  for (const [x, z] of [[0,0],[1,0],[0,1],[1,1]]) if (g.getBlock(x, 0, z) === B.water) left++;
  ok(left === 4, `the pool is intact after 20 scoops, got ${left}/4`);
}

// ---- a 1x2 line is NOT infinite (only one neighbour each) ----
{
  const g = new Grid();
  g.setBlock(0, 0, 0, B.water); g.setBlock(1, 0, 0, B.water);
  ok(!regenerates(g, B, 0, 0, 0), 'a two-block line has only one neighbour, so it is finite');
  fill(g, B, 0, 0, 0);
  ok(g.getBlock(0, 0, 0) === B.air, 'and it drains');
}

// ---- lava is always finite ----
{
  const g = new Grid();
  for (const [x, z] of [[0,0],[1,0],[0,1],[1,1]]) g.setBlock(x, 0, z, B.lava);
  ok(!regenerates(g, B, 0, 0, 0), 'lava never regenerates, even in a pool');
  ok(fill(g, B, 0, 0, 0) === PAIL_LAVA, 'scooping lava yields a lava pail');
  ok(g.getBlock(0, 0, 0) === B.air, 'the lava source is consumed');
}

// ---- nothing to scoop ----
{
  const g = new Grid();
  ok(fill(g, B, 0, 0, 0) === null, 'scooping air yields nothing');
  g.setBlock(0, 0, 0, 1);
  ok(fill(g, B, 0, 0, 0) === null, 'scooping stone yields nothing');
}

// ---- emptying ----
{
  const g = new Grid();
  ok(empty(g, B, PAIL_WATER, 0, 0, 0), 'a water pail empties into air');
  ok(g.getBlock(0, 0, 0) === B.water, 'and leaves a water source');
  ok(!empty(g, B, PAIL_EMPTY, 1, 0, 0), 'an empty pail places nothing');
  ok(g.getBlock(1, 0, 0) === B.air, 'and the target stays air');

  g.setBlock(2, 0, 0, 1);
  ok(!empty(g, B, PAIL_LAVA, 2, 0, 0), 'a fluid will not overwrite solid stone');
  ok(g.getBlock(2, 0, 0) === 1, 'the stone survives');
  // with a caller-supplied replaceable rule, grass is fair game
  ok(empty(g, B, PAIL_LAVA, 2, 0, 0, (id) => id === 1), 'a custom replaceable rule is honoured');
  ok(g.getBlock(2, 0, 0) === B.lava, 'lava placed over the replaceable block');
}

// ---- round trip: scoop then pour restores the world ----
{
  const g = new Grid();
  g.setBlock(5, 2, 5, B.water);
  const state = fill(g, B, 5, 2, 5)!;
  ok(g.getBlock(5, 2, 5) === B.air, 'scooped');
  empty(g, B, state, 5, 2, 5);
  ok(g.getBlock(5, 2, 5) === B.water, 'poured back: the world is unchanged after a round trip');
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
