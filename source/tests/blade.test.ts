// Ancient Blade: model geometry and the rules that keep it seated correctly in a block.
//
// The visual result has to be checked by eye, but the things that go wrong mechanically -- floating,
// burying, wrong scale, a runaway triangle count, a tilt that lies flat -- are all measurable, so
// they are pinned here.
import { bladeGeometry, bladeMesh, BLADE_HEIGHT, BLADE_GRIP_HEIGHT, BLADE_SINK } from '../src/game/items/BladeModel';
import { ITEMS } from '../src/game/items/Items';
import { RECIPES } from '../src/game/crafting/Recipes';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string): void => { if (c) pass++; else { fail++; console.error('FAIL: ' + m); } };

// ---- geometry is real, closed and sanely sized ------------------------------------------------
{
  const g = bladeGeometry();
  const pos = g.getAttribute('position');
  const col = g.getAttribute('color');
  ok(pos.count > 0, 'the blade has geometry');
  ok(col.count === pos.count, 'every vertex carries a colour');
  ok(g.getIndex() !== null, 'geometry is indexed');
  const tris = g.getIndex()!.count / 3;
  // One draw call, and small enough that several on screen cost nothing on a phone.
  ok(tris < 900, `triangle count stays modest for mobile, got ${tris}`);
  ok(tris > 100, `the sword is genuinely multi-part, not one box, got ${tris} triangles`);
  console.log(`  geometry: ${pos.count} verts, ${tris} triangles, 1 draw call`);

  // caching: the same buffer comes back, so many blades share one upload
  ok(bladeGeometry() === g, 'geometry is cached and shared between instances');
}

// ---- bounds: proportions match a chunky greatsword ---------------------------------------------
{
  const g = bladeGeometry();
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  const h = bb.max.y - bb.min.y, w = bb.max.x - bb.min.x, d = bb.max.z - bb.min.z;

  ok(Math.abs(bb.min.y) < 1e-6, `the pivot sits exactly at the base of the pommel, got y=${bb.min.y}`);
  ok(Math.abs(h - BLADE_HEIGHT) < 1e-6, `reported height matches the geometry: ${h} vs ${BLADE_HEIGHT}`);
  ok(h > 2.5 && h < 3.5, `a landmark sword is roughly 3 blocks tall, got ${h.toFixed(2)}`);
  // The crossguard is the widest point: 12 voxels of bar plus the stepped tips that sit proud of
  // each end, which is what keeps the guard reading as blocky rather than as a smooth bar.
  ok(Math.abs(w - 14 / 16) < 1e-6, `crossguard spans 14 voxels including its stepped tips, got ${(w * 16).toFixed(1)}`);
  ok(d > 0.15 && d < 0.4, `the blade has real depth (not a flat plate), got ${(d * 16).toFixed(1)} voxels`);
  // it must read as a sword: much taller than wide
  ok(h / w > 3, `sword proportions: height/width = ${(h / w).toFixed(1)}, must be > 3`);
  ok(d / w < 1, 'depth is less than the guard width, so it still reads as a blade');
  console.log(`  bounds: ${(w * 16).toFixed(1)} x ${(h * 16).toFixed(1)} x ${(d * 16).toFixed(1)} voxels`);
}

// ---- seating maths: not floating, not buried ----------------------------------------------------
{
  const sink = BLADE_SINK;
  ok(sink > 0, 'the blade sinks into the block rather than resting on top of it');
  ok(sink < BLADE_GRIP_HEIGHT, 'it never sinks past the grip, so the crossguard stays visible');
  ok(sink < 0.5, `it sinks less than half a block, got ${sink.toFixed(3)}`);
  const exposed = BLADE_HEIGHT - sink;
  ok(exposed > BLADE_HEIGHT * 0.85, `most of the sword stays above ground: ${(exposed / BLADE_HEIGHT * 100).toFixed(0)}%`);
  console.log(`  seating: sinks ${(sink * 16).toFixed(1)} voxels, ${(exposed / BLADE_HEIGHT * 100).toFixed(0)}% exposed`);

  const tilt = 0.28;
  const tipOffset = Math.sin(tilt) * BLADE_HEIGHT;
  ok(tipOffset > 0.3, `the lean is visible, tip moves ${tipOffset.toFixed(2)} blocks`);
  ok(tipOffset < 1.2, `the lean stays believable, tip moves ${tipOffset.toFixed(2)} blocks`);
  ok(tilt < Math.PI / 4, 'the blade leans, it does not fall over');
  console.log(`  lean: ${(tilt * 180 / Math.PI).toFixed(0)} degrees, tip offset ${tipOffset.toFixed(2)} blocks`);

  // With the lean applied, the LOWEST corner of the crossguard must still clear the block's top
  // face, or the guard visibly sinks into the ground on the downhill side. Guard bar: bottom at
  // y=8 voxels, half-width 7 (including the stepped tips), half-depth 2.
  const V = 16;
  let lowestGuard = Infinity;
  for (const gz of [-2, 2]) {
    const y = (8 - sink * V) * Math.cos(tilt) - gz * Math.sin(tilt);
    lowestGuard = Math.min(lowestGuard, y);
  }
  ok(lowestGuard > 0, `the crossguard clears the block surface by ${lowestGuard.toFixed(2)} voxels`);
  ok(lowestGuard < 3, `but it still sits close to the surface, ${lowestGuard.toFixed(2)} voxels`);

  // And the pommel must be genuinely inside the block -- but not through the far side of it.
  let deepest = -Infinity;
  for (const gz of [-1.7, 1.7]) {
    const y = (0 - sink * V) * Math.cos(tilt) - gz * Math.sin(tilt);
    deepest = Math.max(deepest, -y);
  }
  ok(deepest > 3, `the pommel is buried ${deepest.toFixed(2)} voxels deep, so it reads as driven in`);
  ok(deepest < V, `it does not punch through the bottom of the block, ${deepest.toFixed(2)} of ${V} voxels`);
  console.log(`  in-block: guard clears by ${lowestGuard.toFixed(2)}v, pommel buried ${deepest.toFixed(2)}v of ${V}`);
}

// ---- palette: grey blade, brown grip, dark accents ----------------------------------------------
{
  const g = bladeGeometry();
  const col = g.getAttribute('color');
  let greyish = 0, warm = 0;
  const seen = new Set<string>();
  for (let i = 0; i < col.count; i++) {
    const r = col.getX(i), gg = col.getY(i), b = col.getZ(i);
    seen.add(`${r.toFixed(2)},${gg.toFixed(2)},${b.toFixed(2)}`);
    // grey: all three channels close together
    if (Math.abs(r - gg) < 0.06 && Math.abs(gg - b) < 0.08) greyish++;
    // warm: clearly more red than blue (the grip)
    if (r - b > 0.1) warm++;
  }
  ok(greyish / col.count > 0.7, `the sword is predominantly grey, got ${(greyish / col.count * 100).toFixed(0)}%`);
  ok(warm > 0, 'there is a warm-toned grip');
  ok(seen.size >= 12, `multiple shaded sections, got ${seen.size} distinct shaded colours`);
  console.log(`  palette: ${seen.size} shaded tones, ${(greyish / col.count * 100).toFixed(0)}% grey, warm grip present`);
}

// ---- the item exists, is a real weapon, and is obtainable ----------------------------------------
{
  const def = ITEMS.get('ancient_blade');
  ok(!!def, 'ancient_blade is a real item');
  ok(def!.type === 'tool' && def!.tool?.kind === 'sword', 'it is a sword, so it works as a weapon');
  ok((def!.tool?.damage ?? 0) > 7, `it hits hard, ${def!.tool?.damage} damage`);
  ok(def!.maxStack === 1, 'it does not stack');
  ok((def!.tool?.durability ?? 0) > 500, 'it is durable');
  // obtainable: a recipe exists and every ingredient is real
  const recipe = RECIPES.find((r) => r.result.id === 'ancient_blade');
  ok(!!recipe, 'there is a recipe for it');
  for (const ing of Object.values(recipe!.key ?? {})) {
    ok(ing.startsWith('tag:') || ITEMS.has(ing), `recipe ingredient '${ing}' is a real item`);
  }
}

// ---- meshes share geometry and are flagged so disposal does not free the cache -------------------
{
  const a = bladeMesh(true), b = bladeMesh(false);
  ok(a.geometry === b.geometry, 'both lit and unlit meshes share one geometry');
  ok(a.userData.sharedGeometry === true, 'shared geometry is flagged so the cache survives disposal');
  ok(!Array.isArray(a.material) && a.material.type === 'MeshLambertMaterial', 'the world blade takes scene lighting');
  ok(!Array.isArray(b.material) && b.material.type === 'MeshBasicMaterial', 'the held blade uses the unlit hand material');
  ok((a.material as { vertexColors: boolean }).vertexColors === true, 'materials use the baked vertex colours');
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
