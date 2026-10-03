// Verify the new building families are REAL: obtainable via the recipe matcher, solid where they
// should be, non-solid when open, and that their toggle pairs point at each other.
import { RECIPES, matchRecipe } from '../src/game/crafting/Recipes';
import { BLOCKS, B, isLog, isStrippedLog, logAxis, orientLog, toStrippedLog } from '../src/game/blocks/Blocks';
import { T } from '../src/game/blocks/Tiles';
import { ITEMS } from '../src/game/items/Items';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); c ? pass++ : fail++; };

const NEW = ['oak_stairs','stone_stairs','cobblestone_stairs','stone_brick_stairs',
  'cobblestone_wall','stone_brick_wall','oak_gate','oak_trapdoor',
  'birch_slab','spruce_slab','deep_stone_slab'];

for (const id of NEW) {
  ok(`${id}: item exists`, ITEMS.has(id));
  const r = RECIPES.find((x) => x.result.id === id);
  ok(`${id}: has a recipe`, !!r);
  if (r) for (const ing of Object.values(r.key ?? {})) {
    ok(`${id}: ingredient '${ing}' is real`, ing.startsWith('tag:') || ITEMS.has(ing));
  }
}

// geometry sanity: every new block must carry a real box, and stairs/slabs must be half-height
const boxed: [string, number][] = [
  ['oak_stairs', B.OAK_STAIRS], ['cobblestone_wall', B.COBBLE_WALL],
  ['oak_gate', B.OAK_GATE], ['oak_trapdoor', B.OAK_TRAPDOOR], ['birch_slab', B.BIRCH_SLAB],
];
for (const [n, id] of boxed) {
  const d = BLOCKS[id];
  ok(`${n}: registered with a box shape`, d?.shape === 'box' && !!d.box, d ? `shape=${d.shape}` : 'missing');
  ok(`${n}: not fully opaque (sees through / lights correctly)`, d?.opaque === false);
}
ok('stairs are half-height (walkable step)', BLOCKS[B.OAK_STAIRS].box![4] === 0.5);
ok('walls are full height (block movement)', BLOCKS[B.COBBLE_WALL].box![4] === 1);

// toggle pairs
ok('gate shut is solid', BLOCKS[B.OAK_GATE].solid !== false);
ok('gate open is walk-through', BLOCKS[B.OAK_GATE_OPEN].solid === false);
ok('trapdoor shut is solid', BLOCKS[B.OAK_TRAPDOOR].solid !== false);
ok('trapdoor open is walk-through', BLOCKS[B.OAK_TRAPDOOR_OPEN].solid === false);
ok('open gate drops the shut item', BLOCKS[B.OAK_GATE_OPEN].drops?.[0]?.item === 'oak_gate');
ok('open trapdoor drops the shut item', BLOCKS[B.OAK_TRAPDOOR_OPEN].drops?.[0]?.item === 'oak_trapdoor');
ok('open variants are not separately craftable clutter', BLOCKS[B.OAK_GATE_OPEN].hasItem === false && BLOCKS[B.OAK_TRAPDOOR_OPEN].hasItem === false);

// The recipe matcher must actually produce them from a real grid. matchRecipe reads `cell.id`, so
// the grid holds ItemStacks -- passing bare id strings silently matches nothing.
const g = (cells: (string | null)[]) => cells.map((c) => (c ? { id: c, count: 1 } : null));
const m1 = matchRecipe(g(['cobblestone', null, null, 'cobblestone', 'cobblestone', null, 'cobblestone', 'cobblestone', 'cobblestone']), 3);
ok('matcher yields cobblestone stairs from the staircase pattern', m1?.result.id === 'cobblestone_stairs', m1 ? m1.result.id : 'no match');
const m2 = matchRecipe(g(['cobblestone','cobblestone','cobblestone','cobblestone','cobblestone','cobblestone', null,null,null]), 3);
ok('matcher yields a cobblestone wall from two rows', m2?.result.id === 'cobblestone_wall', m2 ? m2.result.id : 'no match');
const m3 = matchRecipe(g(['stick','oak_planks','stick','stick','oak_planks','stick', null,null,null]), 3);
ok('matcher yields an oak fence gate', m3?.result.id === 'oak_gate', m3 ? m3.result.id : 'no match');
const m4 = matchRecipe(g(['oak_planks','oak_planks','oak_planks','oak_planks','oak_planks','oak_planks', null,null,null]), 3);
ok('matcher yields a trapdoor from two plank rows', m4?.result.id === 'oak_trapdoor', m4 ? m4.result.id : 'no match');

// Log placement now preserves its axis, while the original IDs remain the Y-axis save format.
ok('log placement resolves Y, X and Z variants',
  orientLog(B.OAK_LOG, 'y') === B.OAK_LOG && orientLog(B.OAK_LOG, 'x') === B.OAK_LOG_X && orientLog(B.OAK_LOG, 'z') === B.OAK_LOG_Z);
ok('horizontal X log puts end grain on the +/-X faces',
  BLOCKS[B.OAK_LOG_X].tiles[4] === T.oak_log_top && BLOCKS[B.OAK_LOG_X].tiles[5] === T.oak_log_top && BLOCKS[B.OAK_LOG_X].tiles[2] === T.oak_log);
ok('horizontal Z log puts end grain on the +/-Z faces',
  BLOCKS[B.OAK_LOG_Z].tiles[2] === T.oak_log_top && BLOCKS[B.OAK_LOG_Z].tiles[3] === T.oak_log_top && BLOCKS[B.OAK_LOG_Z].tiles[4] === T.oak_log);
ok('axis variants do not create separate inventory items',
  !BLOCKS[B.OAK_LOG_X].hasItem && !BLOCKS[B.BIRCH_LOG_Z].hasItem && !BLOCKS[B.STRIPPED_LOG_X].hasItem);
ok('horizontal logs drop their ordinary item',
  BLOCKS[B.OAK_LOG_X].drops?.[0]?.item === 'oak_log' && ITEMS.has(BLOCKS[B.OAK_LOG_X].drops![0].item));
ok('log axis and stripping preserve X/Z',
  isLog(B.SPRUCE_LOG_X) && logAxis(B.SPRUCE_LOG_X) === 'x' && toStrippedLog(B.SPRUCE_LOG_X) === B.STRIPPED_LOG_X && toStrippedLog(B.BIRCH_LOG_Z) === B.STRIPPED_LOG_Z);
ok('stripped log variants are recognized and are not stripped twice',
  isStrippedLog(B.STRIPPED_LOG) && isStrippedLog(B.STRIPPED_LOG_Z) && !isStrippedLog(B.OAK_LOG_X));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
