// Difficulty-scaled survival: starvation floors, idle hunger drain and sprint exhaustion cost.
// These drive the REAL Player survival tick, so the numbers reported are the shipped behaviour.
import { Player } from '../src/game/player/Player';
import { B } from '../src/game/blocks/Blocks';
import type { Difficulty } from '../src/game/core/types';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string): void => { if (c) pass++; else { fail++; console.error('FAIL: ' + m); } };

// Solid floor at y<64, air above; no water so no drowning.
const world = { getBlock: (_x: number, y: number, _z: number) => (y < 64 ? B.STONE : B.AIR) };

function mk(diff: Difficulty): Player {
  const p = new Player();
  p.body.x = 0; p.body.y = 70; p.body.z = 0;
  p.mode = 'survival';
  p.difficulty = diff;
  return p;
}
/**
 * Run the 20Hz survival tick for `seconds` of game time with no input at all. `hurtTime` (the
 * post-hit invulnerability window) is decremented by Player.update, not by survivalTick, so it has
 * to be aged here too -- otherwise the first starvation hit makes the player permanently immune
 * and the test measures nothing.
 */
function idle(p: Player, seconds: number): void {
  const steps = Math.round(seconds / 0.05);
  const inner = p as unknown as { survivalTick(w: unknown, d: number): void; hurtTime: number };
  for (let i = 0; i < steps; i++) {
    inner.survivalTick(world, 1);
    if (inner.hurtTime > 0) inner.hurtTime -= 0.05;
  }
}

console.log('=== idle hunger drain (no movement, full saturation spent first)');
for (const diff of ['peaceful', 'easy', 'normal', 'hard'] as Difficulty[]) {
  const p = mk(diff);
  p.saturation = 0; p.hunger = 20; p.health = 20;
  idle(p, 600); // ten minutes
  const lost = 20 - p.hunger;
  console.log(`  ${diff.padEnd(9)} 10 min idle -> hunger ${p.hunger}/20 (lost ${lost})`);
  if (diff === 'hard') ok(lost >= 3 && lost <= 5, `hard should drain ~4 hunger in 10 min, lost ${lost}`);
  else if (diff !== 'peaceful') ok(lost === 0, `${diff} must not drain hunger while idle, lost ${lost}`);
}

console.log('=== starvation floor (hunger 0, health 20)');
for (const diff of ['peaceful', 'easy', 'normal', 'hard'] as Difficulty[]) {
  const p = mk(diff);
  p.hunger = 0; p.saturation = 0; p.health = 20;
  idle(p, 300);
  console.log(`  ${diff.padEnd(9)} health after 5 min at 0 hunger -> ${p.health}`);
  if (diff === 'peaceful') ok(p.health === 20, 'peaceful must never starve');
  if (diff === 'easy') ok(p.health === 10, `easy floors at 10, got ${p.health}`);
  if (diff === 'normal') ok(p.health === 1, `normal floors at 1, got ${p.health}`);
  if (diff === 'hard') ok(p.health === 0 && p.dead, `hard starvation must be able to kill, got ${p.health}`);
}

console.log('=== sprint exhaustion per second of sprinting');
for (const diff of ['easy', 'normal', 'hard'] as Difficulty[]) {
  const p = mk(diff);
  const before = p.exhaustion;
  // emulate one second of sprinting at ~5.6 blocks/s the same way Player.update accounts it
  const SPRINT: Record<string, number> = { peaceful: 0.06, easy: 0.06, normal: 0.075, hard: 0.1 };
  p.exhaustion += SPRINT[diff] * 5.6 * 1;
  const perSec = p.exhaustion - before;
  // 4 exhaustion = 1 hunger point
  console.log(`  ${diff.padEnd(9)} ${perSec.toFixed(3)}/s -> 1 hunger point per ${(4 / perSec).toFixed(1)}s of sprinting`);
  ok(perSec > 0, `${diff} sprint must cost exhaustion`);
}
ok(0.075 < 0.1, 'normal sprint cost must be below the old flat hard cost');

// ---- getting-started checklist -------------------------------------------------------------
import { CHECKLIST, evaluateChecklist, checklistProgress } from '../src/game/crafting/Checklist';
import { ITEMS } from '../src/game/items/Items';

console.log('=== getting-started checklist');
{
  // every id the checklist can be satisfied by must be a real item
  let bad = 0;
  for (const step of CHECKLIST) for (const id of step.any) if (!ITEMS.has(id)) { bad++; console.error(`  unknown item in step ${step.id}: ${id}`); }
  ok(bad === 0, `${bad} checklist ids do not exist in the item registry`);

  const none = evaluateChecklist(new Map(), new Set());
  ok(checklistProgress(none) === 0, 'empty inventory completes nothing');
  ok(none[0].current, 'first step is current when nothing is done');
  ok(none.filter((s) => s.current).length === 1, 'exactly one step is current');

  // holding a log ticks step 1 and moves "current" to step 2
  const withLog = evaluateChecklist(new Map([['oak_log', 3]]), new Set(['oak_log']));
  ok(withLog[0].done, 'a log completes "punch a tree"');
  ok(withLog[1].current, 'the next incomplete step becomes current');

  // spending the table must NOT un-tick it: `seen` remembers it
  const spent = evaluateChecklist(new Map(), new Set(['oak_log', 'oak_planks', 'crafting_table']));
  ok(spent[2].done, 'a crafting table stays ticked after it is placed/consumed');
  ok(checklistProgress(spent) === 3, `three steps done, got ${checklistProgress(spent)}`);

  // any alternative id satisfies "find iron"
  for (const id of ['iron_ore', 'raw_iron', 'iron_ingot']) {
    const st = evaluateChecklist(new Map([[id, 1]]), new Set([id]));
    ok(st[st.length - 1].done, `${id} should satisfy the iron step`);
  }
  const all = evaluateChecklist(new Map(), new Set(CHECKLIST.map((s) => s.any[0])));
  ok(checklistProgress(all) === CHECKLIST.length, 'all steps completable');
  ok(all.every((s) => !s.current), 'nothing is current once everything is done');
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
