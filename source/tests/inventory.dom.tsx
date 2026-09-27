// Real-DOM inventory suite: mounts the actual Slot component (the one every inventory grid uses)
// against a VIRTUAL LAYOUT (each slot gets a real bounding box, document.elementsFromPoint is
// polyfilled from those boxes) and drives interactions with real mouse events at real screen
// coordinates - exactly like a browser. Hover is asserted purely from window mousemove events at
// the pointer position (no mouseenter/mouseleave involved), which is the architecture the game
// now uses, and which reproduces the old "highlight missing on normal mouse movement" bug.
// Run:  node tools/build-dom-test.mjs && node run-dom.mjs
import { readFileSync } from 'fs';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Slot } from '../src/ui/HUD';
import { slotDragMove, slotDragUpWindow, pointerMoved, syncHoverAfterUnlock } from '../src/ui/slotDrag';
import { PlayerInventory, ArrayContainer, clickSlot } from '../src/game/inventory/Inventory';
import type { Container } from '../src/game/inventory/Inventory';
import { makeStack } from '../src/game/items/Items';
import type { ItemStack } from '../src/game/core/types';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = '') => {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : ''));
  if (cond) pass++; else fail++;
};

interface FakeGame {
  player: { inventory: PlayerInventory };
  craftGrid: ArrayContainer;
  craftOutput: Container;
  slotClick(c: Container, i: number, b: 0 | 2, shift: boolean): void;
}

function mkGame(): FakeGame {
  const inv = new PlayerInventory();
  const craftGrid = new ArrayContainer(9);
  let outSlot: ItemStack | null = null;
  const craftOutput: Container = {
    size: 1, outputOnly: true,
    get: () => outSlot,
    set: () => { /* output set only through onTake */ },
    onTake: () => { outSlot = null; for (let i = 0; i < 9; i++) craftGrid.set(i, null); },
  };
  return {
    player: { inventory: inv }, craftGrid, craftOutput,
    slotClick(c: Container, i: number, b: 0 | 2, shift: boolean) {
      clickSlot(inv, c, i, b, false);
    },
  };
}

const CELL = 44;

export function run(doc: Document): void {
  const game = mkGame();
  const inv = game.player.inventory;
  const main = inv.main;
  const win = doc.defaultView as unknown as EventTarget;
  const M = (doc.defaultView as unknown as { MouseEvent?: typeof MouseEvent }).MouseEvent ?? MouseEvent;

  let tick: () => void = () => {};
  let bump: () => void = () => {};
  const ptr = { x: 0, y: 0 };

  function App() {
    const [, setN] = React.useState(0);
    tick = () => setN((n) => n + 1);
    bump = () => setN((n) => n + 1);
    const grid = (c: Container, count: number, from = 0, tag: string) =>
      Array.from({ length: count }, (_, k) => {
        const i = from + k;
        return (
          <div key={tag + (from + k)}>
            <Slot stack={c.get(i)} drag={{ game: game as never, c, i }}
              onClick={(e) => game.slotClick(c, i, 0, e.shiftKey)}
              onContext={(e) => game.slotClick(c, i, 2, e.shiftKey)} />
          </div>
        );
      });
    return (
      <div className="inv-panel">
        <div className="inv-main">{grid(main, 9, 0, 'm')}</div>
        <div className="craft-area">{grid(game.craftGrid, 4, 0, 'c')}</div>
        <div className="craft-out">{grid(game.craftOutput, 1, 0, 'o')}</div>
        {/* The real InventoryScreen renders the carried stack as a fixed ghost under the cursor.
            Its .slot-cursor must be click-through (pointer-events:none) or it swallows every
            press/release while an item is carried - the root cause of "can't place items". */}
        {inv.cursor && (
          <div className="cursor-stack" style={{ left: ptr.x - 20, top: ptr.y - 20 }}>
            <Slot stack={inv.cursor} size={40} className="slot-cursor" />
          </div>
        )}
      </div>
    );
  }

  let root: Root;
  act(() => {
    root = createRoot(doc.getElementById('root')!);
    root.render(<App />);
  });

  // ---- virtual layout: every mounted .slot gets a bounding box -----------------------------
  // main: one row of 9 at y=0; craft: 2x2 at y=220; output: single at (396, 220)
  const slotEls = (): Element[] => Array.from(doc.querySelectorAll('.slot'));
  const rectOf = (el: Element): { x: number; y: number; w: number; h: number } | null => {
    const all = slotEls();
    const idx = all.indexOf(el);
    if (idx < 0) return null;
    if (idx < 9) return { x: idx * CELL, y: 0, w: CELL, h: CELL };
    if (idx < 13) { const k = idx - 9; return { x: (k % 2) * CELL, y: 220 + Math.floor(k / 2) * CELL, w: CELL, h: CELL }; }
    if (idx === 13) return { x: 396, y: 220, w: CELL, h: CELL };
    return null;
  };
  const m = (i: number) => slotEls()[i];
  const cEl = (i: number) => slotEls()[9 + i];
  const outEl = () => slotEls()[13];
  // polyfill the native hit test from the virtual boxes (jsdom has no layout)
  (doc as unknown as { elementsFromPoint?: (x: number, y: number) => Element[] }).elementsFromPoint = (x: number, y: number) => {
    // Real browsers skip pointer-events:none elements (the .cursor-stack ghost). jsdom cannot
    // evaluate the stylesheet, so the polyfill mirrors the FIXED behavior by skipping .slot-cursor.
    let top: Element | null = null;
    for (const el of slotEls()) {
      if (el.classList.contains('slot-cursor')) continue; // click-through ghost
      const r = rectOf(el);
      if (r && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h && !top) top = el;
    }
    if (!top) return [];
    const chain: Element[] = [top];
    let n = top.parentElement;
    while (n) { chain.push(n); n = n.parentElement; }
    return chain;
  };

  // ---- events (mirror the real inventory screen's window listeners) ------------------------
  const onMove = (e: Event) => { pointerMoved((e as MouseEvent).clientX, (e as MouseEvent).clientY); slotDragMove((e as MouseEvent).clientX, (e as MouseEvent).clientY); };
  const onUp = (e: Event) => slotDragUpWindow({ target: e.target as EventTarget | null });
  win.addEventListener('mousemove', onMove);
  win.addEventListener('mouseup', onUp);

  const fireOn = (el: Element, type: string, x: number, y: number) => {
    const Ctor = M;
    const e = new Ctor(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y });
    act(() => { el.dispatchEvent(e); });
  };
  const fireWindow = (type: string, x: number, y: number) => {
    const Ctor = M;
    const e = new Ctor(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y });
    act(() => { win.dispatchEvent(e); });
  };
  const cx = (el: Element) => rectOf(el)!.x + CELL / 2;
  const cy = (el: Element) => rectOf(el)!.y + CELL / 2;
  const moveTo = (x: number, y: number) => { ptr.x = x; ptr.y = y; fireWindow('mousemove', x, y); };
  const moveToEl = (el: Element) => moveTo(cx(el), cy(el));
  const pressEl = (el: Element) => fireOn(el, 'mousedown', cx(el), cy(el));
  const releaseEl = (el: Element) => fireOn(el, 'mouseup', cx(el), cy(el));
  const clickEl = (el: Element) => { pressEl(el); releaseEl(el); };
  const clear = () => { for (const s of ['slot-hover', 'slot-drop-ok']) for (const el of slotEls()) if (el.classList.contains(s)) return false; return true; };
  const has = (el: Element, cls: string) => el.classList.contains(cls);
  const hoveredCount = () => slotEls().filter((el) => has(el, 'slot-hover')).length;

  // =================================================================== hover reliability
  // H1: a single window mousemove (no mouseenter at all) must light the exact slot under the pointer.
  moveToEl(m(3));
  ok('H1a mousemove to slot 3 lights slot 3', has(m(3), 'slot-hover') && hoveredCount() === 1);
  moveToEl(m(4));
  ok('H1b move to slot 4: slot 4 lit, slot 3 cleared', has(m(4), 'slot-hover') && !has(m(3), 'slot-hover') && hoveredCount() === 1);

  // H2: 1px stepping across the whole row: the lit slot always equals the slot under the cursor.
  moveToEl(m(1));
  let x = cx(m(1));
  let okSteps = true;
  while (x < cx(m(4))) {
    x += 1;
    moveTo(x, cy(m(1)));
    const expected = Math.min(8, Math.floor(x / CELL));
    if (!has(m(expected), 'slot-hover') || hoveredCount() !== 1) { okSteps = false; break; }
  }
  ok('H2 1px stepping: highlight follows the pointer every pixel', okSteps && has(m(4), 'slot-hover'));

  // H3: pointer rests over a slot -> highlight stays (no flicker), even across re-renders.
  moveToEl(m(2));
  act(() => bump());
  ok('H3 highlight survives a re-render while resting', has(m(2), 'slot-hover') && hoveredCount() === 1);

  // H4: pointer leaves the slots -> nothing stays lit.
  moveTo(900, 600);
  ok('H4 moving away clears every highlight', clear());

  // H5: borders/edges: points inside the slot near each edge still light that slot.
  const r0 = rectOf(m(0))!;
  const edge = (dx: number, dy: number) => { moveTo(r0.x + dx, r0.y + dy); return has(m(0), 'slot-hover') && hoveredCount() === 1; };
  ok('H5a 1px from top-left corner', edge(1, 1));
  ok('H5b 1px from bottom edge', edge(r0.w - 1, r0.h - 1));

  // H6: fast jump across many slots in one move lights the destination only.
  moveToEl(m(0));
  moveToEl(m(8));
  ok('H6 fast jump lights the destination slot only', has(m(8), 'slot-hover') && hoveredCount() === 1);

  // H7: hover works with an empty cursor too (always-on, not only while carrying).
  moveToEl(m(5));
  ok('H7 hover lit with an empty cursor', has(m(5), 'slot-hover') && !has(m(5), 'slot-drop-ok'));

  // H8 (regression): pointer lock releases ASYNCHRONOUSLY when an overlay opens. For a frame or
  // two afterwards the browser still delivers locked-mode mouse events, whose clientX/clientY are
  // frozen at the lock point while only movementX/Y change. Acting on those coordinates pinned the
  // hover hit-test to one stale spot, so the highlight looked stuck and only appeared to work
  // after a big fast sweep that landed once the unlock had completed -- the reported
  // "hover only works if I move the mouse fast" bug.
  {
    moveToEl(m(3));
    ok('H8a baseline: slot 3 lit before the lock', has(m(3), 'slot-hover'));
    // simulate the browser still being locked: frozen coords aimed at a different slot
    Object.defineProperty(doc, 'pointerLockElement', { value: doc.body, configurable: true });
    moveToEl(m(7));
    ok('H8b locked-mode coordinates are ignored (no false highlight)', !has(m(7), 'slot-hover'));
    // the lock releases; hover must not keep a stale highlight from the locked period
    Object.defineProperty(doc, 'pointerLockElement', { value: null, configurable: true });
    // wrapped in act(): syncHoverAfterUnlock drives React state, and the commit must flush before
    // the class list is read (every other helper here dispatches inside act() for the same reason)
    act(() => { syncHoverAfterUnlock(); });
    ok('H8c stale highlight cleared once the lock releases', clear());
    // and a genuine post-unlock move works normally again
    moveToEl(m(7));
    ok('H8d real movement after unlock highlights correctly', has(m(7), 'slot-hover') && hoveredCount() === 1);
  }

  // =================================================================== click to move
  main.set(0, makeStack('cobblestone', 10));
  moveToEl(m(0));
  clickEl(m(0));
  act(() => bump());
  ok('C1 click picks the stack up once', inv.cursor?.id === 'cobblestone' && inv.cursor.count === 10 && main.get(0) === null);
  moveToEl(m(6));
  ok('C2 carrying: valid target shows the bright drop cue', has(m(6), 'slot-drop-ok'));
  clickEl(m(6));
  act(() => bump());
  ok('C3 click drops it in slot 6', main.get(6)?.id === 'cobblestone' && main.get(6)!.count === 10 && inv.cursor === null && !has(m(6), 'slot-drop-ok'));

  // =================================================================== drag to move
  // D1: press picks up (Java), drag to a distant slot, release places it there.
  main.set(0, makeStack('cobblestone', 7));
  act(() => bump());
  moveToEl(m(0));
  pressEl(m(0));
  ok('D1a press picks the stack up immediately', inv.cursor?.count === 7 && main.get(0) === null);
  moveToEl(m(8));                       // crosses the drag threshold on the way
  ok('D1b carried over the destination with the drop cue', inv.cursor?.count === 7 && has(m(8), 'slot-drop-ok'));
  releaseEl(m(8));
  act(() => bump());
  ok('D1c release places it in slot 8', main.get(8)?.count === 7 && main.get(0) === null && inv.cursor === null);

  // D1x: symptom-1 regression - press the destination while carrying, and the mouseup ONLY
  // reaches the window (the slot never gets its own mouseup). The place must still commit.
  main.set(0, makeStack('cobblestone', 3));
  act(() => bump());
  moveToEl(m(0)); clickEl(m(0)); act(() => bump());          // carry cobble x3
  moveToEl(m(7)); pressEl(m(7));                             // press destination while carrying
  ok('D1x pressing the destination while carrying moves nothing yet', inv.cursor?.count === 3 && main.get(7) === null);
  fireWindow('mouseup', cx(m(7)), cy(m(7)));                 // slot misses the mouseup; window catches it
  act(() => bump());
  ok('D1x window-only release commits the place to the pressed slot', main.get(7)?.id === 'cobblestone' && main.get(7)!.count === 3 && inv.cursor === null);

  // D2: drag into a crafting cell.
  main.set(1, makeStack('oak_log', 4));
  act(() => bump());
  moveToEl(m(1));
  pressEl(m(1));
  moveToEl(cEl(1));
  ok('D2a drag hovers the craft cell (drop cue)', has(cEl(1), 'slot-drop-ok'));
  releaseEl(cEl(1));
  act(() => bump());
  ok('D2b dragged oak into craft cell 1', game.craftGrid.get(1)?.id === 'oak_log' && game.craftGrid.get(1)!.count === 4 && inv.cursor === null);

  // D3: drag it back out of the craft grid into the bag (slot 7 is empty here).
  main.set(7, null);
  act(() => bump());
  pressEl(cEl(1));
  moveToEl(m(7));
  releaseEl(m(7));
  act(() => bump());
  ok('D3 dragged ingredient back to slot 7', main.get(7)?.id === 'oak_log' && game.craftGrid.get(1) === null && inv.cursor === null);

  // D4: stacking merge: cobble x10 over cobble x5 -> x15.
  main.set(0, makeStack('cobblestone', 10));
  main.set(3, makeStack('cobblestone', 5));
  act(() => bump());
  moveToEl(m(0));
  pressEl(m(0));
  moveToEl(m(3));
  releaseEl(m(3));
  act(() => bump());
  ok('D4 stackable merge on release', main.get(3)?.count === 15 && main.get(0) === null && inv.cursor === null);

  // D5: non-stackable swap: drop oak x1 onto cobble -> slot holds oak, cursor holds cobble.
  main.set(0, makeStack('oak_log', 1));
  act(() => bump());
  moveToEl(m(0));
  pressEl(m(0));
  moveToEl(m(3));
  releaseEl(m(3));
  act(() => bump());
  ok('D5 non-stackable swap', main.get(3)?.id === 'oak_log' && inv.cursor?.id === 'cobblestone' && inv.cursor.count === 15);
  // put the swapped cobble back on slot 0 so the world is tidy for the next test
  moveToEl(m(0));
  clickEl(m(0));
  act(() => bump());
  ok('D5b swapped stack placed back', main.get(0)?.id === 'cobblestone' && inv.cursor === null);

  // D6: release outside a slot returns the item to its original slot (never lost).
  main.set(4, makeStack('dirt', 2));
  act(() => bump());
  moveToEl(m(4));
  pressEl(m(4));                        // press picks it up (Java)
  ok('D6a picked up on press', inv.cursor?.id === 'dirt' && inv.cursor.count === 2);
  moveTo(950, 700);                     // far outside any slot: drag active
  ok('D6b carried after leaving the slots', inv.cursor?.id === 'dirt' && inv.cursor.count === 2);
  {
    const e = new M('mouseup', { bubbles: true, cancelable: true, button: 0, clientX: 950, clientY: 700 });
    act(() => { (doc as unknown as EventTarget).dispatchEvent(e); });
  }
  act(() => bump());
  ok('D6c released outside: dirt returned to slot 4', main.get(4)?.id === 'dirt' && main.get(4)!.count === 2 && inv.cursor === null);

  // D7: dragging from an empty slot does nothing.
  moveToEl(m(2));
  pressEl(m(2));                        // press on an empty slot with an empty cursor: no-op
  moveToEl(cEl(2));
  ok('D7 empty-slot drag creates nothing', inv.cursor === null && game.craftGrid.get(2) === null);
  releaseEl(cEl(2));
  act(() => bump());
  ok('D7b release over craft cell after empty drag does nothing', game.craftGrid.get(2) === null && inv.cursor === null);

  // D8: dragging an item back and forth between two slots keeps it safe.
  main.set(5, makeStack('gravel', 3));
  act(() => bump());
  moveToEl(m(5)); pressEl(m(5)); moveToEl(m(1)); releaseEl(m(1)); act(() => bump());
  moveToEl(m(1)); pressEl(m(1)); moveToEl(m(5)); releaseEl(m(5)); act(() => bump());
  ok('D8 back-and-forth drag round-trips', main.get(5)?.id === 'gravel' && main.get(5)!.count === 3 && main.get(1) === null && inv.cursor === null);

  // =================================================================== drop-cue rules
  // E1: output slot never gets the drop cue; craft cells always can.
  main.set(0, makeStack('oak_log', 2));
  act(() => bump());
  moveToEl(m(0)); clickEl(m(0)); act(() => bump());   // carry oak x2
  moveToEl(outEl());
  ok('E1a output slot hovered but never a drop cue', has(outEl(), 'slot-hover') && !has(outEl(), 'slot-drop-ok'));
  moveToEl(cEl(3));
  ok('E1b empty craft cell shows the drop cue while carrying', has(cEl(3), 'slot-drop-ok'));
  clickEl(cEl(3)); act(() => bump());
  ok('E1c click places it in the craft cell', game.craftGrid.get(3)?.id === 'oak_log' && inv.cursor === null);

  // ================================================================== cursor-ghost regression
  // T1: the carried stack renders as a ghost that follows the cursor (like the real screen).
  main.set(0, makeStack('oak_log', 3));
  act(() => bump());
  moveToEl(m(0));
  clickEl(m(0));                       // pickup -> ghost must mount
  act(() => bump());
  ok('T1 ghost slot mounts while carrying', !!doc.querySelector('.cursor-stack .slot-cursor'));
  // T2: symptom-1 regression - with the ghost mounted right under the cursor, a click on a real
  // slot must still place the item (before the fix the ghost swallowed the press AND the release,
  // so placing did nothing while the item stayed glued to the cursor).
  main.set(4, null);                       // make slot 4 empty (earlier scenarios left dirt in it)
  act(() => bump());
  moveToEl(m(4));                      // pointer over slot 4 (ghost covers it)
  ok('T2a hover still resolves the real slot under the ghost', has(m(4), 'slot-hover') && hoveredCount() === 1);
  pressEl(m(4));
  releaseEl(m(4));
  act(() => bump());
  ok('T2b click places the carried stack despite the ghost on top', main.get(4)?.id === 'oak_log' && main.get(4)!.count === 3 && inv.cursor === null);
  ok('T2c ghost unmounts once the cursor is empty', !doc.querySelector('.cursor-stack .slot-cursor'));
  // T3: drag while carrying another stack, with the ghost mounted the whole time.
  main.set(0, makeStack('cobblestone', 6));
  act(() => bump());
  moveToEl(m(0));
  clickEl(m(0));                       // carry cobble (ghost mounts)
  act(() => bump());
  ok('T3a carrying cobble with ghost mounted', inv.cursor?.id === 'cobblestone');
  main.set(7, null); main.set(8, null); // earlier scenarios left items here
  act(() => bump());
  moveToEl(m(7)); pressEl(m(7));       // press destination through the ghost
  moveToEl(m(8)); releaseEl(m(8));     // drag to slot 8, release
  act(() => bump());
  ok('T3b drag-drop works with the ghost mounted', main.get(8)?.id === 'cobblestone' && main.get(8)!.count === 6 && inv.cursor === null);

  // ================================================================== CSS source regression
  // T4: the ghost slot's stylesheet must keep it click-through, AFTER the base .slot rule (which
  // sets pointer-events:auto) so the rule wins at equal specificity. Guards the root cause.
  {
    const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
    const slotRule = css.indexOf('.slot {');
    const cursorRule = css.indexOf('.slot-cursor {');
    const hasFix = /\.slot\.slot-cursor\s*\{\s*pointer-events\s*:\s*none/.test(css) ||
      /\.slot-cursor\s*\{[^}]*pointer-events\s*:\s*none/s.test(css);
    ok('T4a .slot-cursor stylesheet rule is click-through', hasFix);
    ok('T4b click-through rule sits after the .slot rule (wins at equal specificity)', slotRule !== -1 && cursorRule > slotRule);
    ok('T4c .cursor-stack container is click-through', /\.cursor-stack\s*\{[^}]*pointer-events\s*:\s*none/s.test(css));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}
