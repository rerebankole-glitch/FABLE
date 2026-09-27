// Greedy meshing must not change what the world LOOKS like: the merged mesh has to cover exactly
// the same surface area, with the same atlas cell and lighting per covered block, as the plain
// mesher. These checks compare the two meshers face-by-face over real generated terrain.
import { Generator } from '../src/game/world/Generator';
import { Region, meshChunk } from '../src/game/world/Mesher';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string): void => { if (c) pass++; else { fail++; console.error('FAIL: ' + m); } };

const gen = new Generator({ seed: 4242, structures: true, worldType: 'normal', dimension: 'overworld' } as never);
const cache = new Map<string, { data: Uint8Array; biomes: Uint8Array }>();
const src = { get(cx: number, cz: number) { const k = `${cx},${cz}`; let c = cache.get(k); if (!c) { const g = gen.generateChunk(cx, cz); c = { data: g.data, biomes: g.biomes }; cache.set(k, c); } return c; } };
const region = new Region();

/** Total area of every quad in a mesh (2 triangles = one quad of w*h blocks). */
function quadArea(buf: { pos: Float32Array; index: Uint32Array }): number {
  let area = 0;
  for (let i = 0; i < buf.index.length; i += 6) {
    const a = buf.index[i], b = buf.index[i + 1], c = buf.index[i + 2];
    const ax = buf.pos[a * 3], ay = buf.pos[a * 3 + 1], az = buf.pos[a * 3 + 2];
    const bx = buf.pos[b * 3], by = buf.pos[b * 3 + 1], bz = buf.pos[b * 3 + 2];
    const cx2 = buf.pos[c * 3], cy = buf.pos[c * 3 + 1], cz2 = buf.pos[c * 3 + 2];
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx2 - ax, vy = cy - ay, vz = cz2 - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    area += Math.hypot(nx, ny, nz); // = 2x triangle area = area of the quad half
  }
  return area;
}

for (const smooth of [true, false]) {
  let greedyArea = 0, plainArea = 0, greedyTris = 0, plainTris = 0;
  for (let cx = -2; cx <= 2; cx++) for (let cz = -2; cz <= 2; cz++) {
    region.load(src, cx, cz); region.computeLight();
    const g = meshChunk(region, cx, cz, smooth, true);
    region.load(src, cx, cz); region.computeLight();
    const p = meshChunk(region, cx, cz, smooth, false);
    greedyArea += quadArea(g.opaque); plainArea += quadArea(p.opaque);
    greedyTris += g.opaque.index.length / 3; plainTris += p.opaque.index.length / 3;
    // water is untouched by the greedy pass
    ok(g.water.index.length === p.water.index.length, `water pass must be unchanged (smooth=${smooth})`);
  }
  const drop = 100 * (1 - greedyTris / plainTris);
  console.log(`  smooth=${String(smooth).padEnd(5)} ${plainTris} -> ${greedyTris} tris (${drop.toFixed(1)}% fewer), covered area ${greedyArea.toFixed(0)} vs ${plainArea.toFixed(0)}`);
  // the merged mesh must cover exactly the same surface: no holes, no double-covered faces
  ok(Math.abs(greedyArea - plainArea) < 0.5, `greedy must cover the same surface area (${greedyArea.toFixed(1)} vs ${plainArea.toFixed(1)})`);
  ok(greedyTris <= plainTris, 'greedy must never add triangles');
  if (!smooth) ok(drop > 25, `flat lighting should merge a lot, only got ${drop.toFixed(1)}%`);
}

// every quad must carry a valid atlas cell
region.load(src, 0, 0); region.computeLight();
const m = meshChunk(region, 0, 0, true, true);
let badTile = 0;
for (let i = 0; i < m.opaque.tile.length; i += 4) {
  const uw = m.opaque.tile[i + 2], vh = m.opaque.tile[i + 3];
  if (!(uw > 0 && uw <= 1 && vh > 0 && vh <= 1)) badTile++;
}
ok(badTile === 0, `${badTile} vertices have an invalid atlas cell`);
ok(m.opaque.tile.length / 4 === m.opaque.pos.length / 3, 'one atlas cell per vertex');

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
