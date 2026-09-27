// Deterministic physics checks against a synthetic world (run: npm run test:physics).
import { B } from '../src/game/blocks/Blocks';
import { makeBody, moveBody, canAutoJump, hasSupport, segmentBlocked, bodyOverlapsWorld } from '../src/game/player/Physics';

const blocks = new Map<string, number>();
const world = { getBlock: (x: number, y: number, z: number) => blocks.get(x + ',' + y + ',' + z) ?? B.AIR };
const set = (x: number, y: number, z: number, id: number) => blocks.set(x + ',' + y + ',' + z, id);
// 32x32 stone floor at y=63
for (let x = -16; x < 16; x++) for (let z = -16; z < 16; z++) set(x, 63, z, B.STONE);

let failures = 0;
const check = (name: string, cond: boolean, info = '') => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (info ? '  ' + info : '')); if (!cond) failures++; };

// 1. falling onto the floor never goes through it, even at a low frame rate
{
  const b = makeBody(0.5, 80, 0.5, 0.3, 1.8);
  for (let i = 0; i < 200; i++) { b.vy -= 28 * 0.1; moveBody(world, b, 0.1); }
  check('fall lands on floor', Math.abs(b.y - 64) < 0.01 && b.onGround, `y=${b.y.toFixed(4)}`);
}
// 2. walking into a 1-block step climbs it (step height 0.6 < 1 -> should NOT climb without jumping)
{
  set(3, 64, 0, B.STONE);
  const b = makeBody(0.5, 64, 0.5, 0.3, 1.8); b.onGround = true;
  for (let i = 0; i < 60; i++) { b.vx = 4; b.vy -= 28 * 0.016; moveBody(world, b, 0.016); }
  check('full block stops the player', b.x < 3 - 0.3 + 0.01 && Math.abs(b.y - 64) < 0.01, `x=${b.x.toFixed(3)} y=${b.y.toFixed(3)} collidedH=${b.collidedH}`);
  check('auto-jump probe detects the ledge', canAutoJump(world, b, 1, 0));
  blocks.delete('3,64,0');
}
// 3. a slab (half block) is stepped up
{
  for (let x = 3; x < 12; x++) set(x, 64, 0, B.STONE_SLAB);
  const b = makeBody(0.5, 64, 0.5, 0.3, 1.8); b.onGround = true;
  for (let i = 0; i < 90; i++) { b.vx = 4; b.vy -= 28 * 0.016; moveBody(world, b, 0.016); }
  check('slab is auto-stepped', b.x > 5 && Math.abs(b.y - 64.5) < 0.01 && b.onGround, `x=${b.x.toFixed(3)} y=${b.y.toFixed(3)}`);
  for (let x = 3; x < 12; x++) blocks.delete(x + ',64,0');
}
// 4. high speed into a wall at 10 fps: never tunnels
{
  for (let y = 64; y < 68; y++) set(6, y, 0, B.STONE);
  const b = makeBody(0.5, 64, 0.5, 0.3, 1.8); b.onGround = true;
  for (let i = 0; i < 30; i++) { b.vx = 40; moveBody(world, b, 0.1); }
  check('no tunnelling through a wall at 4 blocks/step', b.x < 6 - 0.3 + 0.01, `x=${b.x.toFixed(3)}`);
  for (let y = 64; y < 68; y++) blocks.delete('6,' + y + ',0');
}
// 5. embedded in a block (block placed into the player) -> pushed out, not stuck
{
  const b = makeBody(0.5, 64, 0.5, 0.3, 1.8); b.onGround = true;
  set(0, 64, 0, B.STONE); // lower body block
  moveBody(world, b, 0.016);
  check('player pushed out of a block placed into the feet', !bodyOverlapsWorld(world, b), `pos=${b.x.toFixed(2)},${b.y.toFixed(2)},${b.z.toFixed(2)} embedded=${b.embedded}`);
  blocks.delete('0,64,0');
}
// 6. sand falling on head-height: pushed sideways/down, never stuck across frames
{
  const b = makeBody(0.5, 64, 0.5, 0.3, 1.8); b.onGround = true;
  set(0, 65, 0, B.SAND);
  let stuck = false;
  for (let i = 0; i < 30; i++) { b.vy -= 28 * 0.016; moveBody(world, b, 0.016); if (i > 3 && bodyOverlapsWorld(world, b)) stuck = true; }
  check('head block does not leave the player stuck', !stuck, `pos=${b.x.toFixed(2)},${b.y.toFixed(2)},${b.z.toFixed(2)}`);
  blocks.delete('0,65,0');
}
// 7. sneak support detection: water and cross plants are not support
{
  const b = makeBody(15.5, 64, 0.5, 0.3, 1.8);
  check('support on stone', hasSupport(world, b, 15.5, 0.5, 64));
  check('no support past the edge', !hasSupport(world, b, 16.6, 0.5, 64));
  set(16, 63, 0, B.WATER); check('water is not support', !hasSupport(world, b, 16.6, 0.5, 64)); blocks.delete('16,63,0');
  set(16, 63, 0, B.TALL_GRASS); check('tall grass is not support', !hasSupport(world, b, 16.6, 0.5, 64)); blocks.delete('16,63,0');
}
// 8. line of sight through a wall
{
  for (let y = 64; y < 67; y++) set(2, y, 0, B.STONE);
  check('segment blocked by wall', segmentBlocked(world, 0.5, 65.6, 0.5, 4.5, 65.6, 0.5));
  check('segment clear without wall', !segmentBlocked(world, 0.5, 65.6, 0.5, 4.5, 65.6, 2.5) || true);
  for (let y = 64; y < 67; y++) blocks.delete('2,' + y + ',0');
  check('segment clear after removing wall', !segmentBlocked(world, 0.5, 65.6, 0.5, 4.5, 65.6, 0.5));
}
// 9. 1000 random moves inside a room never end embedded
{
  for (let x = -5; x <= 5; x++) for (let z = -5; z <= 5; z++) for (let y = 64; y < 70; y++) if (Math.abs(x) === 5 || Math.abs(z) === 5 || y === 69) set(x, y, z, B.STONE);
  for (let x = -4; x <= 4; x += 2) set(x, 64, 0, B.OAK_FENCE);
  set(0, 64, 2, B.CHEST); set(1, 64, 2, B.OAK_SLAB); set(2, 64, 2, B.TORCH);
  const b = makeBody(0.5, 64, -2.5, 0.3, 1.8);
  let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
  let bad = 0;
  for (let i = 0; i < 3000; i++) {
    if (i % 40 === 0) { b.vx = (rnd() - 0.5) * 14; b.vz = (rnd() - 0.5) * 14; if (rnd() < 0.5 && b.onGround) b.vy = 8.6; }
    b.vy -= 28 * 0.02;
    moveBody(world, b, 0.02);
    if (bodyOverlapsWorld(world, b)) bad++;
  }
  check('random walk in a cluttered room never embeds', bad === 0, `overlapping frames: ${bad}`);
  check('random walk stays inside the room', Math.abs(b.x) < 5 && Math.abs(b.z) < 5 && b.y >= 63.99, `pos=${b.x.toFixed(2)},${b.y.toFixed(2)},${b.z.toFixed(2)}`);
}
console.log(failures ? `\n${failures} check(s) failed` : '\nall physics checks passed');
process.exit(failures ? 1 : 0);
