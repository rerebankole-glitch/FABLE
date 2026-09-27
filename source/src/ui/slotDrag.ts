import type { Game } from '../game/core/Game';
import type { Container } from '../game/inventory/Inventory';
import { canStack, maxStack } from '../game/items/Items';
import { clickSlot } from '../game/inventory/Inventory';

/**
 * Minecraft-Java-style click & drag for inventory slots. Every action fires EXACTLY ONCE:
 *
 *  - A left press with an EMPTY cursor picks the item up on PRESS (like Java): pick-up can never
 *    be lost to a missed mouseup. A left press while carrying places on RELEASE (a click is a
 *    press+release on the same slot; the release commits to the slot that was PRESSED).
 *  - Pressing on a slot and releasing over ANOTHER slot after crossing a few pixels drops the
 *    carried stack there (merge or swap), like dragging in Java.
 *  - Commit is guaranteed by geometry: the window-level release handler hit-tests the current
 *    pointer position, so a place-click always lands on the slot under the cursor even if that
 *    slot missed the mouseup event itself.
 *  - The hovered slot is derived from the CURRENT pointer position on every window mousemove
 *    (geometric hit-test against the slot registry), never from mouseenter/mouseleave alone:
 *    real browsers can miss enter/leave when a re-render replaces the node under a stationary
 *    cursor, which made the hover highlight missing or stuck. Position-driven hover cannot lag,
 *    flicker or stick, at any movement speed.
 *  - Releasing where there is no slot returns a stack picked from a slot back to that slot
 *    instead of losing it (a stack already on the cursor before the press simply stays there).
 *  - Right press alone (no drag) takes half / places one ON RELEASE, so a right-click and a
 *    right-drag are distinguishable.
 *  - Right-drag (Java "divide"): the source stack lends itself to the cursor, every slot entered
 *    receives one item, and the remainder goes back to the source slot on release.
 */
interface Session {
  game: Game;
  btn: 0 | 2;
  x: number;
  y: number;
  shift: boolean;
  moved: boolean;
  /** true when the cursor was empty when the drag started (the source stack is "borrowed"). */
  borrowed: boolean;
  /** true once this gesture's action has run (pickup on drag-start, click on release) - guards
   * against the browser firing both mouseup and a synthetic click, which used to act twice. */
  acted: boolean;
  origin: { c: Container; i: number } | null;
  hover: { c: Container; i: number } | null;
  spread: { c: Container; set: Set<number> };
}

const DRAG_PX = 6; // pointer travel that turns a click into a drag

let session: Session | null = null;

/**
 * Would dropping the carried cursor stack into this slot actually do something?
 * Mirrors clickSlot's rules exactly: empty slot accepts (unless the container rejects the item,
 * e.g. armor type / furnace fuel), a partial same-type stack merges, a different item swaps only
 * when the container accepts it. Used for the always-on drop-target highlight.
 */
export function cursorCanDrop(game: Game, c: Container, i: number): boolean {
  const cur = game.player.inventory.cursor;
  if (!cur || c.outputOnly) return false;
  const slot = c.get(i);
  if (!slot) return !c.accepts || c.accepts(i, cur);
  if (canStack(slot, cur)) return slot.count < maxStack(cur.id);
  return !c.accepts || c.accepts(i, cur); // occupied by something else: a click would swap
}

export function isDragging(): boolean {
  return !!session && session.moved;
}

/** Called on press. A left press with an EMPTY cursor acts immediately (pick-up / take output /
 * shift quick-move) exactly like Minecraft Java, so a pick-up can never be lost to a missed
 * mouseup. A left press while CARRYING just records the session (release places it), so the
 * carried stack can still be dragged. Right presses always act on release (split / place-one),
 * which keeps a right-click distinct from a right-drag. */
export function slotDragDown(game: Game, c: Container, i: number, btn: 0 | 2, x: number, y: number, shift: boolean): void {
  session = {
    game, btn, x, y, shift, moved: false, acted: false,
    borrowed: game.player.inventory.cursor === null,
    origin: { c, i }, hover: null, spread: { c, set: new Set() },
  };
  if (btn === 0 && game.player.inventory.cursor === null) {
    // Java acts a left click on press: pick the stack up (or take the output, or shift-move).
    session.acted = true;
    game.slotClick(c, i, 0, shift);
  }
}

/** Tracks pointer travel (window-level listener): crossing the threshold turns the press into a
 * drag (Java right-drag "divide" borrows half here; a left drag was already picked up on press). */
export function slotDragMove(x: number, y: number): void {
  if (!session || session.moved) return;
  if (Math.abs(x - session.x) + Math.abs(y - session.y) <= DRAG_PX) return;
  session.moved = true;
  if (session.btn !== 2 || !session.borrowed || session.acted) return;
  const { game, origin } = session;
  if (!origin || origin.c.outputOnly) return;
  const s = origin.c.get(origin.i);
  if (!s || s.count <= 0) return;
  // Divide drag: borrow half the stack (the whole single item) onto the cursor so entering
  // slots can receive one each.
  session.acted = true;
  game.slotClick(origin.c, origin.i, 2, false);
}

/** Called when the pointer enters / moves over a slot while a button may be held. */
export function slotDragHover(game: Game, c: Container, i: number): void {
  if (!session) return;
  session.hover = { c, i };
  if (session.btn !== 2) return; // left drags act on release
  const isOrigin = session.origin !== null && session.origin.c === c && session.origin.i === i;
  if (isOrigin) return;
  const cur = game.player.inventory.cursor;
  if (!cur || c.outputOnly) return;
  const set = session.spread.c === c ? session.spread.set : new Set<number>();
  session.spread = { c, set };
  if (set.has(i)) return; // one item per slot per drag, like Java
  const slot = c.get(i);
  const ok = !slot
    ? (!c.accepts || c.accepts(i, cur))
    : canStack(slot, cur) && slot.count < maxStack(cur.id);
  if (!ok) return;
  set.add(i);
  game.slotClick(c, i, 2, false); // places exactly one (or merges one onto a partial stack)
}

/** Called when the pointer leaves a slot. */
export function slotDragLeave(c: Container, i: number): void {
  if (session && session.hover && session.hover.c === c && session.hover.i === i) session.hover = null;
}

/** Release over a slot. A click (no drag, or a jitter that stayed on the press slot) commits to
 * the ORIGIN slot - the one that was pressed - so a place-click always lands exactly where you
 * clicked even if the pointer drifted a few pixels or the mouseup landed on a child. A real drag
 * (past the threshold, released over a different slot) drops the carried stack there. */
export function slotDragUp(game: Game, c: Container, i: number, btn: 0 | 2, shift: boolean): void {
  if (!session) return;
  const s = session;
  session = null;
  if (!s.moved) {
    // A plain click: act exactly once. A left press with an empty cursor already acted on press
    // (pick-up); a left press while carrying acts now (place/merge/swap); a right click acts now.
    if (!s.acted) {
      s.acted = true;
      s.game.slotClick(s.origin!.c, s.origin!.i, s.btn, s.shift);
    }
    return;
  }
  if (s.btn === 2) {
    // Divide drag: give the unspread remainder back to the source slot.
    if (s.borrowed && s.game.player.inventory.cursor && s.origin && !s.origin.c.outputOnly) {
      s.game.slotClick(s.origin.c, s.origin.i, 0, false);
    }
    return;
  }
  const sameSlot = s.origin !== null && s.origin.c === c && s.origin.i === i;
  if (sameSlot) {
    // A jittery release that stayed on the press slot is still a click.
    if (!s.acted) {
      s.acted = true;
      s.game.slotClick(s.origin!.c, s.origin!.i, 0, s.shift);
    }
    return; // the pick-up click keeps the stack on the cursor (Java click semantics)
  }
  // A real drag: drop the carried stack on the release slot (merge or swap).
  if (!s.game.player.inventory.cursor) return;
  s.game.slotClick(c, i, 0, false);
}

/** Release anywhere (window-level): commit the release geometrically. This is the guaranteed
 * fallback: if the slot under the pointer did not receive the mouseup itself, the session is
 * committed from the CURRENT pointer position - so a place-click can never silently do nothing.
 *
 * Extra safety net: a release with NO active session at all means the press never reached a slot
 * (an overlay swallowed it). While carrying a stack and releasing over a real slot whose press we
 * never saw, place the stack there (the release itself is the user's click). Only when the release
 * target is outside the inventory panels, so ordinary UI presses never place accidentally. */
export function slotDragUpWindow(e: { target: EventTarget | null }): void {
  const t = e.target as Element | null;
  if (!session) {
    if (t && t.closest && t.closest('.inv-panel, .inv-side')) return; // normal UI: nothing pending
    const hov = hoveredSlot();
    if (!hov) return;
    const g = hov.game;
    const cur = g.player.inventory.cursor;
    if (!cur) return;
    g.slotClick(hov.c, hov.i, 0, false); // release acts as the click to place
    return;
  }
  const s = session;
  // Geometric commit: the release point's slot is whatever is under the pointer RIGHT NOW.
  const hov = hoveredSlot();
  if (hov) {
    slotDragUp(s.game, hov.c, hov.i, s.btn, s.shift);
    return;
  }
  session = null;
  if (!s.moved) {
    // Click whose release drifted off the slot (a few pixels of jitter): still a click on the
    // pressed slot - commit it once. A pick-up already acted on press and stays on the cursor.
    if (!s.acted) {
      s.acted = true;
      s.game.slotClick(s.origin!.c, s.origin!.i, s.btn, s.shift);
    }
    return;
  }
  if (s.btn === 2) {
    // Divide drag: give the unspread remainder back to the source slot.
    if (s.borrowed && s.game.player.inventory.cursor && s.origin && !s.origin.c.outputOnly) {
      s.game.slotClick(s.origin.c, s.origin.i, 0, false);
    }
    return;
  }
  if (!s.borrowed) return; // was already carrying before this press: the stack stays on the cursor
  // Left drag released where there is no slot: return the carried stack to its original slot
  // instead of dropping/losing it.
  returnCursorToOrigin(s.game, s.origin);
}

/** Put the carried stack back where the gesture started (or into the bag) rather than losing it. */
function returnCursorToOrigin(game: Game, origin: { c: Container; i: number } | null): void {
  const inv = game.player.inventory;
  const cur = inv.cursor;
  if (!cur) return;
  if (origin && !origin.c.outputOnly) {
    const slot = origin.c.get(origin.i);
    const fitsEmpty = !slot && (!origin.c.accepts || origin.c.accepts(origin.i, cur));
    const fitsMerge = !!slot && canStack(slot, cur) && slot.count < maxStack(cur.id);
    if (fitsEmpty || fitsMerge) {
      clickSlot(inv, origin.c, origin.i, 0, false); // places or merges back
      return;
    }
  }
  if (inv.add(cur) === 0) { inv.cursor = null; return; } // bag has room: keep the stack safe
  // nowhere to put it: it stays on the cursor rather than being lost
}

/** The pointer left the window / the app blurred mid-gesture: never lose a carried stack. */
export function abortDragSafe(): void {
  if (!session) return;
  const s = session;
  session = null;
  if (!s.moved) return; // a bare press: just cancel (press pick-ups already acted and stay safe)
  if (s.btn === 2) {
    if (s.borrowed && s.game.player.inventory.cursor && s.origin && !s.origin.c.outputOnly) {
      s.game.slotClick(s.origin.c, s.origin.i, 0, false);
    }
    return;
  }
  if (s.borrowed) returnCursorToOrigin(s.game, s.origin);
}


// ------------------------------------------------------------------ hover (mouse)
// The hovered slot is derived from the CURRENT pointer position on every window mousemove by
// hit-testing the slot registry (elementsFromPoint, exactly like the touch path) - never from
// mouseenter/mouseleave alone, which browsers can miss or mis-order (a re-render replacing the
// node under a stationary cursor drops the enter; a fast sweep can skip elements). Position-driven
// hover means: pointer position -> exact slot -> highlight, updated on EVERY pointer move, with no
// flicker, no sticking and no dependence on movement speed. rAF re-checks after re-renders keep
// the highlight consistent even when the DOM under a resting cursor is replaced.

interface SlotRef { game: Game; c: Container; i: number; hover?: (hovering: boolean) => void }
const slotRegistry = new Map<Element, SlotRef>();

let hoverEl: Element | null = null;
let pointerX = 0, pointerY = 0, hasPointer = false;

export function registerSlot(el: Element, game: Game, c: Container, i: number, onHover?: (hovering: boolean) => void): void {
  slotRegistry.set(el, { game, c, i, hover: onHover });
  // Adopt instantly when this slot mounts under the resting pointer (no move needed).
  if (hasPointer && !hoverEl && slotAt(pointerX, pointerY)?.el === el) setHovered(el);
}

export function unregisterSlot(el: Element): void {
  if (hoverEl === el) {
    slotRegistry.get(el)?.hover?.(false);
    hoverEl = null;
  }
  slotRegistry.delete(el);
}

/**
 * Feed the current pointer position (window mousemove). Updates the hovered slot immediately.
 *
 * Coordinates are IGNORED while the pointer is still locked. exitPointerLock() is asynchronous:
 * when an overlay opens, the inventory mounts immediately but the browser keeps delivering
 * locked-mode mouse events for a frame or two afterwards. In locked mode clientX/clientY are
 * frozen at the lock position and only movementX/Y change, so those events would pin the hover
 * hit-test to one stale point. The highlight then appeared stuck (or only seemed to work after a
 * large, fast sweep that happened to land after the unlock completed) -- which is exactly the
 * "hover only works if the mouse moves fast" symptom. Once the lock really releases the browser
 * sends a normal mousemove with true coordinates, and syncHoverAfterUnlock() re-runs the test.
 */
export function pointerMoved(x: number, y: number): void {
  if (typeof document !== 'undefined' && document.pointerLockElement) return;
  pointerX = x; pointerY = y; hasPointer = true;
  setHovered(slotAt(x, y)?.el ?? null);
}

/**
 * Called on pointerlockchange once the lock has actually released. Any coordinates captured while
 * locked were meaningless, so hover is cleared until the next real mousemove supplies a true
 * position (a stale highlight is worse than none).
 */
export function syncHoverAfterUnlock(): void {
  hasPointer = false;
  setHovered(null);
}

/** The pointer left the window: no slot can be hovered. */
export function pointerLeftWindow(): void {
  hasPointer = false;
  setHovered(null);
}

/** Re-run the hit test at the last known pointer position (call after re-renders / layout changes). */
export function recheckHover(): void {
  if (hasPointer) setHovered(slotAt(pointerX, pointerY)?.el ?? null);
}

/** The slot currently under the pointer (registry entry), if any. */
export function hoveredSlot(): SlotRef | null {
  return hoverEl ? slotRegistry.get(hoverEl) ?? null : null;
}

function setHovered(el: Element | null): void {
  if (el === hoverEl) return;
  if (hoverEl) slotRegistry.get(hoverEl)?.hover?.(false);
  hoverEl = el;
  if (hoverEl) slotRegistry.get(hoverEl)?.hover?.(true);
}

function slotAt(x: number, y: number): { ref: SlotRef; el: Element } | null {
  const els = (document.elementsFromPoint ? document.elementsFromPoint(x, y) : []) as Element[];
  if (els.length === 0 && document.elementFromPoint) {
    const e = document.elementFromPoint(x, y);
    if (e) els.push(e);
  }
  for (const e of els) {
    let n: Element | null = e;
    while (n && n !== document.body) {
      const r = slotRegistry.get(n);
      if (r) return { ref: r, el: n };
      n = n.parentElement;
    }
  }
  // Native hit-test found elements but none was a registered slot (e.g. an unregistered overlay is
  // on top) or returned nothing (jsdom, exotic engines): fall back to the registered slots' actual
  // bounding boxes so the slot under the pointer is still found.
  for (const [el, ref] of slotRegistry) {
    const r = el.getBoundingClientRect?.();
    if (r && r.width > 0 && x >= r.left && x < r.right && y >= r.top && y < r.bottom) return { ref, el };
  }
  return null;
}

let touch: { ref: SlotRef; x0: number; y0: number; moved: boolean; shift: boolean; acted: boolean } | null = null;

/** A finger/pen press: remember the slot under the finger (taps act on release, drags on drag-start). */
export function touchDown(x: number, y: number, shift: boolean): Element | null {
  const hit = slotAt(x, y);
  if (!hit) return null;
  touch = { ref: hit.ref, x0: x, y0: y, moved: false, shift, acted: false };
  return hit.el;
}

export function touchMove(x: number, y: number): void {
  if (!touch) return;
  if (!touch.moved && Math.abs(x - touch.x0) + Math.abs(y - touch.y0) > DRAG_PX) {
    touch.moved = true;
    // The gesture is now a drag, not a tap: perform the pick-up (Java acts on press for clicks,
    // so a drag must pick up the moment it becomes a drag, before the finger reaches another slot).
    if (!touch.acted) {
      touch.acted = true;
      touch.ref.game.slotClick(touch.ref.c, touch.ref.i, 0, touch.shift);
    }
  }
}

/** Release: a tap acts once like a left click; a drag drops on the slot under release (or outside). */
export function touchUp(x: number, y: number): void {
  if (!touch) return;
  const t = touch;
  touch = null;
  const target = slotAt(x, y);
  const same = target !== null && target.ref.c === t.ref.c && target.ref.i === t.ref.i;
  if (!t.moved) {
    if (!t.acted) t.ref.game.slotClick(t.ref.c, t.ref.i, 0, t.shift); // tap = one left click
    return;
  }
  if (!t.acted) {
    // dragged from an empty/effectless slot: the release slot is the click target
    if (target && !same) t.ref.game.slotClick(target.ref.c, target.ref.i, 0, false);
    return;
  }
  if (target && !same) {
    t.ref.game.slotClick(target.ref.c, target.ref.i, 0, false); // drop the carried stack there
  } else if (!target && t.ref.game.player.inventory.cursor) {
    t.ref.game.dropCursor(); // dragged out of the window
  }
  // releasing back on the origin keeps the Java click semantics (press acted at drag-start)
}

/** Ends any drag session (used when the inventory closes). */
export function slotDragEnd(): void {
  session = null;
}
