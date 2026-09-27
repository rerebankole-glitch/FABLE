// Inventory interaction checks (run: npx esbuild tests/inventory.test.ts --bundle --platform=node --format=esm --outfile=dist/inventory.test.mjs --log-level=error && node dist/inventory.test.mjs)
// Verifies every "pick an item up on the cursor and move it somewhere" flow at the logic layer
// (clickSlot) and through the real drag session state machine (slotDrag) with the exact event
// sequences the DOM handlers produce.
import { PlayerInventory, ArrayContainer, clickSlot } from '../src/game/inventory/Inventory';
import type { Container } from '../src/game/inventory/Inventory';
import type { Game } from '../src/game/core/Game';
import { makeStack } from '../src/game/items/Items';
import { slotDragDown, slotDragMove, slotDragHover, slotDragLeave, slotDragUp, slotDragUpWindow, abortDragSafe, cursorCanDrop } from '../src/ui/slotDrag';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = '') => {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : ''));
  if (cond) pass++; else fail++;
};
const cobble = (n = 10) => makeStack('cobblestone', n)!;
const oak = () => makeStack('oak_log', 5)!;

// ------------------------------------------------------------------ click logic (clickSlot)
{
  const inv = new PlayerInventory();
  inv.main.set(0, cobble());
  clickSlot(inv, inv.main, 0, 0, false);
  ok('click: pickup holds the stack', inv.cursor?.id === 'cobblestone' && inv.cursor.count === 10 && inv.main.get(0) === null);
  clickSlot(inv, inv.main, 5, 0, false);
  ok('click: placed into another slot', inv.main.get(5)?.id === 'cobblestone' && inv.main.get(5)!.count === 10 && inv.cursor === null);
}
{
  const inv = new PlayerInventory();
  inv.main.set(0, cobble()); inv.main.set(1, oak());
  clickSlot(inv, inv.main, 0, 0, false);
  clickSlot(inv, inv.main, 1, 0, false);
  ok('click: swaps with a different item', inv.main.get(1)?.id === 'cobblestone' && inv.cursor?.id === 'oak_log');
}
{
  const inv = new PlayerInventory();
  inv.main.set(0, makeStack('cobblestone', 30)!); inv.main.set(3, cobble());
  clickSlot(inv, inv.main, 0, 0, false);
  clickSlot(inv, inv.main, 3, 0, false);
  ok('click: merges onto partial same-type stack', inv.main.get(3)?.count === 40 && inv.cursor === null);
}
{
  const inv = new PlayerInventory();
  inv.main.set(0, cobble());
  clickSlot(inv, inv.main, 0, 2, false);
  ok('right-click splits half onto cursor', inv.cursor?.count === 5 && inv.main.get(0)?.count === 5);
  clickSlot(inv, inv.main, 7, 2, false);
  ok('right-click places one', inv.main.get(7)?.count === 1 && inv.cursor?.count === 4);
}
{
  const inv = new PlayerInventory();
  inv.main.set(0, makeStack('iron_helmet', 1)!);
  clickSlot(inv, inv.main, 0, 0, false);
  clickSlot(inv, inv.armor, 0, 0, false);
  ok('armor slot accepts the matching piece', inv.armor.get(0)?.id === 'iron_helmet' && inv.cursor === null);
  inv.main.set(1, cobble());
  clickSlot(inv, inv.main, 1, 0, false);
  clickSlot(inv, inv.armor, 0, 0, false);
  ok('armor slot rejects a block (Minecraft rule)', inv.armor.get(0)?.id === 'iron_helmet' && inv.cursor?.id === 'cobblestone');
}
{
  const inv = new PlayerInventory();
  const chest = new ArrayContainer(27);
  chest.set(3, makeStack('diamond', 2)!);
  clickSlot(inv, chest, 3, 0, false);
  clickSlot(inv, inv.main, 0, 0, false);
  ok('chest -> player inventory', inv.cursor === null && inv.main.get(0)?.id === 'diamond' && chest.get(3) === null);
  clickSlot(inv, inv.main, 0, 0, false);
  clickSlot(inv, chest, 3, 0, false);
  ok('player inventory -> chest', inv.cursor === null && chest.get(3)?.id === 'diamond' && inv.main.get(0) === null);
}
{
  const inv = new PlayerInventory();
  inv.main.set(2, oak());
  clickSlot(inv, inv.main, 2, 0, false);
  clickSlot(inv, inv.main, 20, 0, false);
  ok('hotbar -> bag', inv.main.get(20)?.id === 'oak_log' && inv.main.get(2) === null && inv.cursor === null);
}
{
  const inv = new PlayerInventory();
  inv.cursor = makeStack('grass_block', 1);
  clickSlot(inv, inv.main, 4, 0, true);
  ok('creative cursor -> slot', inv.main.get(4)?.id === 'grass_block' && inv.cursor === null);
}

// ------------------------------------------------- drag session state machine (slotDrag.ts)
// NOTE: these flows mirror a REAL browser: a press never acts; the action runs on mouseup (plain
// click) or when the pointer crosses the drag threshold (left/right drag pickups). A later DOM
// suite adds the browser's synthetic click after mouseup to prove nothing doubles.
interface FakeGame { player: { inventory: PlayerInventory }; slotClick(c: Container, i: number, b: 0 | 2, shift: boolean): void; dropCursor(): void; dropped: boolean }
function mkGame(): FakeGame & Game {
  const inv = new PlayerInventory();
  const g = {
    player: { inventory: inv }, dropped: false,
    slotClick(c: Container, i: number, b: 0 | 2, shift: boolean) { clickSlot(inv, c, i, b, false); },
    dropCursor() { g.dropped = true; inv.cursor = null; },
  } as FakeGame;
  // The drag handler only uses this narrow facade; the rest of Game is never accessed.
  return g as FakeGame & Game;
}
{
  const g = mkGame(); const inv = g.player.inventory;
  inv.main.set(0, cobble());
  slotDragDown(g, inv.main, 0, 0, 100, 100, false);
  ok('click: pickup happens ON PRESS (Java)', inv.cursor?.count === 10 && inv.main.get(0) === null);
  slotDragUp(g, inv.main, 0, 0, false);          // mouseup on origin must never undo it
  ok('click: release on the origin keeps the stack on the cursor', inv.cursor?.count === 10 && inv.main.get(0) === null);
  slotDragDown(g, inv.main, 5, 0, 120, 100, false);
  ok('click: pressing the target while carrying moves nothing yet', inv.main.get(5) === null && inv.cursor?.count === 10);
  slotDragUp(g, inv.main, 5, 0, false);
  ok('click: release on the pressed slot places it there', inv.main.get(5)?.count === 10 && inv.cursor === null);
}
{
  // Symptom-1 regression: the release event only reached the window (slot missed its mouseup),
  // yet the place-click must still land on the slot that was pressed.
  const g = mkGame(); const inv = g.player.inventory;
  inv.main.set(0, cobble());
  slotDragDown(g, inv.main, 0, 0, 100, 100, false);   // pickup on press
  ok('fallback: carried after press', inv.cursor?.count === 10);
  slotDragDown(g, inv.main, 6, 0, 300, 100, false);   // press the destination while carrying
  ok('fallback: pressing the destination moves nothing yet', inv.main.get(6) === null && inv.cursor?.count === 10);
  slotDragUpWindow({ target: null });                 // only the window sees the mouseup
  ok('fallback: window release commits the place to the pressed slot', inv.main.get(6)?.count === 10 && inv.cursor === null);
}
{
  const g = mkGame(); const inv = g.player.inventory;
  inv.main.set(0, cobble());
  slotDragDown(g, inv.main, 0, 0, 100, 100, false);
  ok('drag: press already picked the stack up (Java)', inv.cursor?.count === 10 && inv.main.get(0) === null);
  slotDragMove(130, 140);                        // window mousemove crosses the drag threshold
  slotDragHover(g, inv.main, 5);                 // pointer enters the target slot
  slotDragUp(g, inv.main, 5, 0, false);          // release over it: drop
  ok('drag: real drag drops on the release slot', inv.main.get(5)?.count === 10 && inv.cursor === null);
}
{
  const g = mkGame(); const inv = g.player.inventory;
  inv.main.set(0, cobble());
  slotDragDown(g, inv.main, 0, 0, 100, 100, false);
  ok('drag: pickup on press is immediate', inv.cursor?.count === 10 && inv.main.get(0) === null);
  slotDragMove(104, 102);                        // <= 6px: still a click
  slotDragUp(g, inv.main, 0, 0, false);
  ok('drag: <6px jitter never undoes the press pickup', inv.cursor?.count === 10 && inv.main.get(0) === null);
  slotDragUp(g, inv.main, 0, 0, false);          // a second release event can never act twice
  ok('drag: a repeated release never acts twice', inv.cursor?.count === 10 && inv.main.get(0) === null);
}
{
  const g = mkGame(); const inv = g.player.inventory;
  inv.main.set(0, cobble());
  slotDragDown(g, inv.main, 0, 0, 100, 100, false);
  ok('drag-out: carried straight after the press', inv.cursor?.count === 10);
  slotDragMove(200, 240);                        // crosses the threshold
  slotDragHover(g, inv.main, 1); slotDragLeave(inv.main, 1);
  slotDragUpWindow({ target: null });            // released where there is no slot
  ok('drag-out: release outside returns the stack to its origin', inv.cursor === null && inv.main.get(0)?.count === 10 && !g.dropped);
}
{
  const g = mkGame(); const inv = g.player.inventory;
  inv.main.set(3, cobble());
  slotDragDown(g, inv.main, 3, 0, 100, 100, false);
  slotDragMove(200, 240);                        // pickup
  ok('abort: carried mid-drag', inv.cursor?.count === 10 && inv.main.get(3) === null);
  abortDragSafe();                               // window blurred / left mid-drag
  ok('abort: mid-drag interruption returns the stack (never lost)', inv.main.get(3)?.count === 10 && inv.cursor === null);
}
{
  const g = mkGame(); const inv = g.player.inventory;
  inv.main.set(0, cobble());
  slotDragDown(g, inv.main, 0, 0, 100, 100, false);
  slotDragUpWindow({ target: null });            // press+release with no movement = a click, acted once
  ok('abort: click with no movement still acts once', inv.cursor?.count === 10 && inv.main.get(0) === null);
}
{
  const g = mkGame(); const inv = g.player.inventory;
  inv.main.set(0, cobble(10));
  slotDragDown(g, inv.main, 0, 2, 100, 100, false);
  slotDragMove(150, 130);                        // right-drag: borrow half
  ok('right-drag: borrows half', inv.cursor?.count === 5 && inv.main.get(0)?.count === 5);
  slotDragHover(g, inv.main, 1);
  ok('right-drag: one into slot 1', inv.main.get(1)?.count === 1);
  slotDragHover(g, inv.main, 2);
  ok('right-drag: one into slot 2', inv.main.get(2)?.count === 1);
  slotDragUp(g, inv.main, 2, 2, false);
  ok('right-drag: remainder returns to the source', inv.cursor === null && inv.main.get(0)?.count === 8);
}
{
  const g = mkGame(); const inv = g.player.inventory;
  const chest = new ArrayContainer(27);
  inv.main.set(0, cobble());
  slotDragDown(g, inv.main, 0, 0, 100, 100, false);
  slotDragMove(160, 180);                        // drag start: pickup
  slotDragHover(g, chest, 12);
  slotDragUp(g, chest, 12, 0, false);
  ok('drag: carries the stack into a chest slot', chest.get(12)?.count === 10 && inv.cursor === null);
}

// -------------------------------- always-on drop-target highlight (cursorCanDrop)
{
  const inv = new PlayerInventory();
  const game = { player: { inventory: inv } } as Parameters<typeof cursorCanDrop>[0];
  inv.main.set(0, cobble());
  ok('highlight helper: nothing while not carrying', cursorCanDrop(game, inv.main, 4) === false);
  clickSlot(inv, inv.main, 0, 0, false);
  ok('highlight helper: empty ordinary slot is a target', cursorCanDrop(game, inv.main, 4) === true);
  ok('highlight helper: output-only container is never a target', cursorCanDrop(game, { size: 1, outputOnly: true, get: () => null, set: () => undefined } as never, 0) === false);
  inv.main.set(4, makeStack('oak_log', 1)!);
  ok('highlight helper: occupied different slot is a target (swap)', cursorCanDrop(game, inv.main, 4) === true);
  inv.main.set(4, makeStack('cobblestone', 64)!);
  ok('highlight helper: full same-type stack is not a target', cursorCanDrop(game, inv.main, 4) === false);
  inv.main.set(4, makeStack('cobblestone', 60)!);
  ok('highlight helper: partial same-type stack is a target (merge)', cursorCanDrop(game, inv.main, 4) === true);
  inv.cursor = makeStack('cobblestone', 1);
  ok('highlight helper: block is not a target for armor slots', cursorCanDrop(game, inv.armor, 0) === false);
  inv.cursor = makeStack('iron_helmet', 1);
  ok('highlight helper: matching armor piece is a target', cursorCanDrop(game, inv.armor, 0) === true);
  const furnace = new ArrayContainer(3);
  furnace.accepts = (i, s) => i === 0 ? true : false;
  inv.cursor = makeStack('cobblestone', 1);
  ok('highlight helper: rejected container slot is not a target', cursorCanDrop(game, furnace, 1) === false);
  ok('highlight helper: accepted container slot is a target', cursorCanDrop(game, furnace, 0) === true);
}

// --------------------------------- built-in skin sheets (pixel art, not recolours)
{
  const { SKIN_PRESETS, builtinSkinPixels, presetById } = await import('../src/game/core/Skins');
  const alpha = (b: Uint8ClampedArray, x: number, y: number) => b[(y * 64 + x) * 4 + 3];
  const rgb = (b: Uint8ClampedArray, x: number, y: number) => { const i = (y * 64 + x) * 4; return [b[i], b[i + 1], b[i + 2]].join(','); };
  const sheets = new Map<string, Uint8ClampedArray>();
  for (const p of SKIN_PRESETS) sheets.set(p.id, builtinSkinPixels(p));

  // every base face of every net is painted: no transparent pixel inside a face that the model uses
  const baseFaces: [number, number, number, number][] = [
    [8, 8, 16, 16], [8, 0, 16, 8], [16, 0, 24, 8], [24, 8, 32, 16], [0, 8, 8, 16], [16, 8, 24, 16], // head
    [20, 20, 28, 32], [16, 20, 20, 32], [28, 20, 32, 32], [20, 16, 28, 20],                           // body
    [4, 20, 8, 32], [0, 20, 4, 32], [8, 20, 12, 32], [12, 20, 16, 32],                                // right leg
    [20, 52, 24, 64], [16, 52, 20, 64], [24, 52, 28, 64], [28, 52, 32, 64],                           // left leg
  ];
  let holey = '';
  for (const [id, b] of sheets) {
    const armWidth = SKIN_PRESETS.find(p => p.id === id)!.slim ? 3 : 4;
    const armFaces: [number, number, number, number][] = [];
    for (const u of [40, 32]) {
      let x = u;
      for (const w of [4, armWidth, 4, armWidth]) {
        armFaces.push([x, u === 40 ? 20 : 52, x + w, u === 40 ? 32 : 64]); x += w;
      }
    }
    for (const [x0, y0, x1, y1] of [...baseFaces, ...armFaces]) {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (alpha(b, x, y) < 255) holey = `${id}@${x},${y}`;
  }
  }
  ok('builtin skins: every model face is fully painted (no holes)', holey === '', holey);
  for (const p of SKIN_PRESETS.filter(p => p.slim)) {
    const b = sheets.get(p.id)!;
    // The trailing two columns of the 16px-wide arm area are not part of a slim net.
    ok(`${p.name}: slim right arm does not spill into unused UV columns`, alpha(b, 54, 25) === 0 && alpha(b, 55, 25) === 0);
  }

  // each preset is its own artwork, not a recolour of one silhouette
  let minDiff = Infinity, closest = '';
  const ids = [...sheets.keys()];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const A = sheets.get(ids[i])!, B = sheets.get(ids[j])!;
    let d = 0;
    for (let k = 0; k < 64 * 64; k++) { const o = k * 4; if (A[o] !== B[o] || A[o + 1] !== B[o + 1] || A[o + 2] !== B[o + 2]) d++; }
    if (d < minDiff) { minDiff = d; closest = ids[i] + '/' + ids[j]; }
  }
  ok('builtin skins: all sheets differ from each other', sheets.size === SKIN_PRESETS.length && minDiff > 300, `closest ${closest} ${minDiff}px`);

  // per-preset signature features (hair, headwear, outfit) are actually present
  const steve = sheets.get('steve')!, digger = sheets.get('digger')!, knight = sheets.get('knight')!;
  const rose = sheets.get('rose')!, frost = sheets.get('frost')!;
  ok('builtin skins: steve has hair above the brow', rgb(steve, 12, 9) === rgb(steve, 12, 8) && alpha(steve, 12, 8) === 255);
  ok('builtin skins: digger wears a cap overlay above the head', alpha(digger, 44, 9) === 255 || alpha(digger, 44, 10) === 255);
  ok('builtin skins: knight has a helm band across the head overlay', alpha(knight, 40, 8) === 255 && alpha(knight, 50, 8) === 255);
  ok('builtin skins: rose has a skirt on the leg overlays', alpha(rose, 5, 54) === 255 && alpha(rose, 21, 54) === 255);
  ok('builtin skins: frost has a light zip/trim column on the torso', rgb(frost, 23, 24) !== rgb(frost, 21, 24));
  ok('builtin skins: sleeve overlays carry cloth (shoulder cap painted)', alpha(rose, 46, 33) === 255 && alpha(digger, 46, 33) === 255);

  // slim/classic flags survive the resolver contract
  ok('builtin skins: presetById resolves every id', SKIN_PRESETS.every((p) => presetById(p.id).id === p.id));
  ok('builtin skins: at least one slim and one classic preset exist', SKIN_PRESETS.some((p) => p.slim) && SKIN_PRESETS.some((p) => !p.slim));
}

// --------------------------------- content integrity (every recipe/drop resolves to a real item)
{
  const { BLOCKS } = await import('../src/game/blocks/Blocks');
  const { ITEMS } = await import('../src/game/items/Items');
  const { RECIPES, SMELTING } = await import('../src/game/crafting/Recipes');
  const { MOBS } = await import('../src/game/entities/Entities');

  const blockItems = BLOCKS.filter((b) => b && b.hasItem).map((b) => b.name);
  const missingBlockItems = blockItems.filter((n) => !ITEMS.has(n));
  ok('content: every block that has an item form exists in ITEMS', missingBlockItems.length === 0, missingBlockItems.join(','));

  const badDrops: string[] = [];
  for (const b of BLOCKS) if (b?.drops) for (const d of b.drops) if (!ITEMS.has(d.item)) badDrops.push(`${b.name}->${d.item}`);
  ok('content: every block drop resolves to an item', badDrops.length === 0, badDrops.join(','));

  // This is the check that would have caught the fern bug: the mossy-cobblestone recipe needed an
  // item that could never exist, so it was uncraftable dead content.
  const badRecipes: string[] = [];
  for (const r of RECIPES) {
    if (!ITEMS.has(r.result.id)) badRecipes.push(`result:${r.result.id}`);
    const ings = r.ingredients ?? Object.entries(r.key ?? {}).map(([, v]) => v);
    for (const ing of ings) {
      if (ing.startsWith('tag:')) continue;
      if (!ITEMS.has(ing)) badRecipes.push(`${r.result.id}<-${ing}`);
    }
  }
  ok('content: every recipe ingredient is a real, obtainable item', badRecipes.length === 0, [...new Set(badRecipes)].join(','));

  const badSmelt = Object.entries(SMELTING).filter(([from, to]) => !ITEMS.has(from) || !ITEMS.has(to.result)).map(([from, to]) => `${from}->${to.result}`);
  ok('content: every smelting entry resolves to items', badSmelt.length === 0, badSmelt.join(','));

  const badMobDrops: string[] = [];
  for (const m of Object.values(MOBS)) for (const d of m.drops) if (!ITEMS.has(d.item)) badMobDrops.push(`${m.type}->${d.item}`);
  ok('content: every mob drop resolves to an item', badMobDrops.length === 0, badMobDrops.join(','));

  // every tool the recipe book advertises can actually be produced from gather-able materials
  const toolIds = ['wood_pickaxe', 'stone_pickaxe', 'iron_pickaxe', 'crystal_pickaxe', 'wood_axe', 'stone_axe', 'iron_axe', 'wood_sword', 'stone_sword', 'iron_sword', 'wood_shovel', 'stone_shovel', 'iron_shovel', 'wood_hoe'];
  const missingTools = toolIds.filter((t) => !ITEMS.has(t) || !RECIPES.some((r) => r.result.id === t));
  ok('content: every tool has an item and a recipe', missingTools.length === 0, missingTools.join(','));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
