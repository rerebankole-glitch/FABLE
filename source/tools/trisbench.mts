// Triangle-count benchmark for the chunk mesher, over real generated terrain at the default
// render distance (6). Reports opaque/water triangles per chunk so greedy meshing can be measured.
import { Generator } from '../src/game/world/Generator';
import { Region, meshChunk } from '../src/game/world/Mesher';

const R = 6;                      // default render distance
const SEED = 1337;
const gen = new Generator({ seed: SEED, structures: true, worldType: 'normal', dimension: 'overworld' } as never);
const cache = new Map<string, { data: Uint8Array; biomes: Uint8Array }>();
const src = {
  get(cx: number, cz: number) {
    const k = `${cx},${cz}`;
    let c = cache.get(k);
    if (!c) { const g = gen.generateChunk(cx, cz); c = { data: g.data, biomes: g.biomes }; cache.set(k, c); }
    return c;
  },
};
const region = new Region();
let opaqueTris = 0, waterTris = 0, chunks = 0, verts = 0;
const t0 = Date.now();
for (let cx = -R; cx <= R; cx++) for (let cz = -R; cz <= R; cz++) {
  if (cx * cx + cz * cz > R * R) continue;   // circular render distance
  region.load(src, cx, cz);
  region.computeLight();
  const m = meshChunk(region, cx, cz, true);
  opaqueTris += m.opaque.index.length / 3;
  waterTris += m.water.index.length / 3;
  verts += m.opaque.pos.length / 3;
  chunks++;
}
const ms = Date.now() - t0;
console.log(`chunks meshed      ${chunks} (render distance ${R}, seed ${SEED})`);
console.log(`opaque triangles   ${opaqueTris} total, ${(opaqueTris / chunks).toFixed(0)}/chunk`);
console.log(`water triangles    ${waterTris} total, ${(waterTris / chunks).toFixed(0)}/chunk`);
console.log(`opaque vertices    ${verts} total, ${(verts / chunks).toFixed(0)}/chunk`);
console.log(`mesh time          ${ms}ms (${(ms / chunks).toFixed(1)}ms/chunk)`);
