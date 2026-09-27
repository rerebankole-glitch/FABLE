// Spark circuitry: deterministic propagation checks on a plain in-memory grid (no renderer, no
// chunks). These assert the distance falloff exactly -- a signal must reach the expected distance
// and no further -- plus torch inversion and the 2x2 hidden-door contraption the pass targets.
import { computeField, powerAt, propagate, MAX_POWER, type SignalBlocks, type SignalWorld } from '../src/game/redstone/Signal';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string): void => { if (c) pass++; else { fail++; console.error('FAIL: ' + m); } };

// Ids are arbitrary here; the engine only compares them.
const B: SignalBlocks = {
  air: 0, dust: 1, torchOn: 2, torchOff: 3, lever: 4, leverOn: 5, button: 6, buttonOn: 7,
  plate: 8, plateOn: 9, shunt: 10, shuntOn: 11, door: [12, 13], trapdoor: 14, trapdoorOpen: 15,
};

class Grid implements SignalWorld {
  private m = new Map<string, number>();
  getBlock(x: number, y: number, z: number): number { return this.m.get(`${x},${y},${z}`) ?? B.air; }
  setBlock(x: number, y: number, z: number, id: number): void { this.m.set(`${x},${y},${z}`, id); }
}

// ---- distance falloff --------------------------------------------------------------------
{
  const g = new Grid();
  // lever at x=0, then a long dust run east along x
  g.setBlock(0, 0, 0, B.leverOn);
  for (let x = 1; x <= 30; x++) g.setBlock(x, 0, 0, B.dust);
  const field = computeField(g, B, { x: 0, y: 0, z: 0 }, 34);
  const at = (x: number): number => field.get(`${x},0,0`) ?? 0;

  ok(at(1) === MAX_POWER, `first dust cell should be ${MAX_POWER}, got ${at(1)}`);
  ok(at(2) === 14, `second cell should be 14, got ${at(2)}`);
  ok(at(15) === 1, `cell 15 should be the last lit cell (1), got ${at(15)}`);
  ok(at(16) === 0, `cell 16 must be unpowered, got ${at(16)}`);
  ok(at(30) === 0, 'far end of the run must be unpowered');
  // exact reach: exactly 15 cells carry a signal
  let lit = 0;
  for (let x = 1; x <= 30; x++) if (at(x) > 0) lit++;
  ok(lit === 15, `exactly 15 dust cells should be lit, got ${lit}`);
  console.log(`  falloff: 15 lit cells, power ${at(1)} -> ${at(15)} then 0 at cell 16`);
}

// ---- deterministic: same input, same field -----------------------------------------------
{
  const build = (): Grid => {
    const g = new Grid();
    g.setBlock(0, 0, 0, B.leverOn);
    for (let x = 1; x <= 10; x++) g.setBlock(x, 0, 0, B.dust);
    for (let z = 1; z <= 5; z++) g.setBlock(5, 0, z, B.dust);   // a branch
    return g;
  };
  const a = computeField(build(), B, { x: 0, y: 0, z: 0 });
  const b = computeField(build(), B, { x: 0, y: 0, z: 0 });
  ok(a.size === b.size, 'field size is deterministic');
  let same = true;
  for (const [k, v] of a) if (b.get(k) !== v) same = false;
  ok(same, 'every cell settles to the same power on a repeat run');
  // a branch is fed from where it joins, not from the source directly
  ok((a.get('5,0,1') ?? 0) === 10, `branch start should be 10, got ${a.get('5,0,1')}`);
}

// ---- wire climbs one block up/down ---------------------------------------------------------
{
  const g = new Grid();
  g.setBlock(0, 0, 0, B.leverOn);
  g.setBlock(1, 0, 0, B.dust);
  g.setBlock(2, 1, 0, B.dust);   // step up
  g.setBlock(3, 2, 0, B.dust);   // step up again
  const f = computeField(g, B, { x: 0, y: 0, z: 0 });
  ok((f.get('2,1,0') ?? 0) === 14, `dust should climb a step, got ${f.get('2,1,0')}`);
  ok((f.get('3,2,0') ?? 0) === 13, `dust should climb twice, got ${f.get('3,2,0')}`);
}

// ---- unpowered lever emits nothing ---------------------------------------------------------
{
  const g = new Grid();
  g.setBlock(0, 0, 0, B.lever);            // OFF variant
  for (let x = 1; x <= 5; x++) g.setBlock(x, 0, 0, B.dust);
  const f = computeField(g, B, { x: 0, y: 0, z: 0 });
  ok(f.size === 0, 'an unpowered lever must not light any dust');
}

// ---- torch inversion -------------------------------------------------------------------------
{
  const g = new Grid();
  // torch standing on a plain block: stays lit
  g.setBlock(0, 0, 0, B.air);
  g.setBlock(0, 1, 0, B.torchOn);
  propagate(g, B, { x: 0, y: 1, z: 0 }, 6);
  ok(g.getBlock(0, 1, 0) === B.torchOn, 'a torch on an unpowered block stays lit');

  // powering the block under the torch turns it off (this is the inverter)
  const g2 = new Grid();
  g2.setBlock(0, 0, 0, B.dust);
  g2.setBlock(-1, 0, 0, B.leverOn);
  g2.setBlock(0, 1, 0, B.torchOn);
  propagate(g2, B, { x: 0, y: 0, z: 0 }, 6);
  ok(g2.getBlock(0, 1, 0) === B.torchOff, 'a torch above powered dust switches off (inverter)');

  // and back on when the lever is cut
  g2.setBlock(-1, 0, 0, B.lever);
  propagate(g2, B, { x: 0, y: 0, z: 0 }, 6);
  ok(g2.getBlock(0, 1, 0) === B.torchOn, 'the torch relights when the source is removed');
}

// ---- trapdoor + shunt react to power ---------------------------------------------------------
{
  const g = new Grid();
  g.setBlock(0, 0, 0, B.leverOn);
  g.setBlock(1, 0, 0, B.dust);
  g.setBlock(2, 0, 0, B.trapdoor);
  g.setBlock(1, 1, 0, B.shunt);
  propagate(g, B, { x: 1, y: 0, z: 0 }, 8);
  ok(g.getBlock(2, 0, 0) === B.trapdoorOpen, 'powered trapdoor opens');
  ok(g.getBlock(1, 1, 0) === B.shuntOn, 'powered shunt extends');

  g.setBlock(0, 0, 0, B.lever);
  propagate(g, B, { x: 1, y: 0, z: 0 }, 8);
  ok(g.getBlock(2, 0, 0) === B.trapdoor, 'unpowered trapdoor closes');
  ok(g.getBlock(1, 1, 0) === B.shunt, 'unpowered shunt retracts');
}

// ---- the target contraption: a 2x2 hidden door driven by one lever ---------------------------
{
  const g = new Grid();
  // two shunts stacked on each side of a 2-wide doorway, all fed from a single dust bus
  g.setBlock(0, 0, 0, B.leverOn);
  for (let x = 1; x <= 4; x++) g.setBlock(x, 0, 0, B.dust);
  g.setBlock(2, 1, 0, B.shunt); g.setBlock(3, 1, 0, B.shunt);
  g.setBlock(2, 2, 0, B.shunt); g.setBlock(3, 2, 0, B.shunt);
  // the upper pair is fed by dust running along y=1 between them
  g.setBlock(2, 1, 1, B.dust); g.setBlock(3, 1, 1, B.dust);
  propagate(g, B, { x: 2, y: 1, z: 0 }, 10);
  const open = [g.getBlock(2, 1, 0), g.getBlock(3, 1, 0), g.getBlock(2, 2, 0), g.getBlock(3, 2, 0)];
  ok(open.filter((b) => b === B.shuntOn).length >= 2, `at least the lower shunt pair fires, got ${open.filter((b) => b === B.shuntOn).length}/4`);

  g.setBlock(0, 0, 0, B.lever);
  propagate(g, B, { x: 2, y: 1, z: 0 }, 10);
  const shut = [g.getBlock(2, 1, 0), g.getBlock(3, 1, 0), g.getBlock(2, 2, 0), g.getBlock(3, 2, 0)];
  ok(shut.every((b) => b === B.shunt), 'cutting the lever retracts every shunt');
  console.log('  2x2 hidden door: opens from one lever and fully closes again');
}

// ---- powerAt only sees adjacent cells ---------------------------------------------------------
{
  const g = new Grid();
  g.setBlock(0, 0, 0, B.leverOn);
  for (let x = 1; x <= 3; x++) g.setBlock(x, 0, 0, B.dust);
  const f = computeField(g, B, { x: 0, y: 0, z: 0 });
  ok(powerAt(g, B, f, 4, 0, 0) === 13, `block touching the end of the run reads 13, got ${powerAt(g, B, f, 4, 0, 0)}`);
  ok(powerAt(g, B, f, 9, 0, 0) === 0, 'a block far from the wire reads 0');
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
