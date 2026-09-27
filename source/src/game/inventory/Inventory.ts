import type { ItemStack } from '../core/types';
import { canStack, itemDef, maxStack } from '../items/Items';

export interface Container {
  size: number;
  get(i: number): ItemStack | null;
  set(i: number, s: ItemStack | null): void;
  /** Whether a stack may be placed into this slot */
  accepts?(i: number, s: ItemStack): boolean;
  /** Called when the player takes from an output-only slot; return false to prevent placing */
  outputOnly?: boolean;
  onTake?(i: number, taken: ItemStack): void;
  onChange?(): void;
}

export class ArrayContainer implements Container {
  items: (ItemStack | null)[];
  constructor(public size: number, items?: (ItemStack | null)[]) {
    this.items = items ? items.slice(0, size) : new Array(size).fill(null);
    while (this.items.length < size) this.items.push(null);
  }
  get(i: number) { return this.items[i] ?? null; }
  set(i: number, s: ItemStack | null) { this.items[i] = s && s.count > 0 ? s : null; this.onChange?.(); }
  onChange?: () => void;
  accepts?: (i: number, s: ItemStack) => boolean;
  outputOnly?: boolean;
  onTake?: (i: number, taken: ItemStack) => void;

  /** Add a stack, returns the amount that did not fit. */
  add(stack: ItemStack): number {
    let remaining = stack.count;
    const max = maxStack(stack.id);
    if (stack.durability === undefined && !stack.ench) {
      for (let i = 0; i < this.size && remaining > 0; i++) {
        const s = this.items[i];
        if (s && canStack(s, stack) && s.count < max) {
          const n = Math.min(max - s.count, remaining);
          s.count += n; remaining -= n;
        }
      }
    }
    for (let i = 0; i < this.size && remaining > 0; i++) {
      if (!this.items[i]) {
        const n = Math.min(max, remaining);
        this.items[i] = { ...stack, count: n };
        remaining -= n;
      }
    }
    this.onChange?.();
    return remaining;
  }

  count(id: string): number {
    let n = 0;
    for (const s of this.items) if (s && s.id === id) n += s.count;
    return n;
  }

  remove(id: string, count: number): number {
    let left = count;
    for (let i = 0; i < this.size && left > 0; i++) {
      const s = this.items[i];
      if (s && s.id === id) {
        const n = Math.min(s.count, left);
        s.count -= n; left -= n;
        if (s.count <= 0) this.items[i] = null;
      }
    }
    this.onChange?.();
    return count - left;
  }

  findSlot(pred: (s: ItemStack) => boolean): number {
    return this.items.findIndex((s) => s && pred(s));
  }

  isEmpty(): boolean {
    return this.items.every((s) => !s);
  }

  clear(): void {
    this.items.fill(null);
    this.onChange?.();
  }
}

export class PlayerInventory {
  main = new ArrayContainer(36);
  armor: ArrayContainer;
  /** single off-hand slot (shield, torch, food...) */
  offhand: ArrayContainer;
  cursor: ItemStack | null = null;
  selected = 0;
  onChange?: () => void;
  /**
   * Every item id the player has ever obtained. Drives the getting-started checklist so that
   * spending a crafting table (or burning the coal) does not un-tick a completed step. Persisted
   * with the world save.
   */
  seen = new Set<string>();

  constructor() {
    this.armor = new ArrayContainer(4);
    this.armor.accepts = (i, s) => itemDef(s.id)?.armor?.slot === i;
    this.offhand = new ArrayContainer(1);
    this.main.onChange = () => this.onChange?.();
    this.armor.onChange = () => this.onChange?.();
    this.offhand.onChange = () => this.onChange?.();
  }

  /** The stack in the off-hand slot (null when empty). */
  get offhandItem(): ItemStack | null {
    return this.offhand.get(0);
  }

  get held(): ItemStack | null {
    return this.main.get(this.selected);
  }

  setHeld(s: ItemStack | null): void {
    this.main.set(this.selected, s);
  }

  add(stack: ItemStack): number {
    this.seen.add(stack.id);
    return this.main.add(stack);
  }

  armorValue(): number {
    let v = 0;
    for (const s of this.armor.items) if (s) v += itemDef(s.id)?.armor?.defense ?? 0;
    return v;
  }

  damageArmor(amount: number): void {
    for (let i = 0; i < 4; i++) {
      const s = this.armor.items[i];
      if (!s || s.durability === undefined) continue;
      const unb = s.ench?.endurance ?? 0;
      if (unb > 0 && Math.random() < unb / (unb + 1)) continue;
      s.durability -= amount;
      if (s.durability <= 0) this.armor.items[i] = null;
    }
    this.onChange?.();
  }

  serialize(): { inventory: (ItemStack | null)[]; armor: (ItemStack | null)[]; offhand: ItemStack | null; seen?: string[] } {
    const off = this.offhand.get(0);
    return { inventory: this.main.items.map((s) => (s ? { ...s } : null)), armor: this.armor.items.map((s) => (s ? { ...s } : null)), offhand: off ? { ...off } : null, seen: [...this.seen] };
  }

  load(inv: (ItemStack | null)[], armor: (ItemStack | null)[], offhand?: ItemStack | null, seen?: string[]): void {
    this.main = new ArrayContainer(36, inv.map((s) => (s ? { ...s } : null)));
    this.main.onChange = () => this.onChange?.();
    const a = new ArrayContainer(4, armor.map((s) => (s ? { ...s } : null)));
    a.accepts = (i, s) => itemDef(s.id)?.armor?.slot === i;
    a.onChange = () => this.onChange?.();
    this.armor = a;
    this.offhand = new ArrayContainer(1, [offhand ? { ...offhand } : null]);
    this.offhand.onChange = () => this.onChange?.();
    if (seen) this.seen = new Set(seen);
  }
}

/** Classic slot click behaviour: left = take/place all, right = take half / place one. */
export function clickSlot(inv: PlayerInventory, c: Container, i: number, button: 0 | 2, creative = false): void {
  const slot = c.get(i);
  const cur = inv.cursor;
  if (c.outputOnly) {
    if (!slot) return;
    if (cur && !(canStack(cur, slot) && cur.count + slot.count <= maxStack(cur.id))) return;
    const taken = { ...slot };
    c.onTake?.(i, taken);
    inv.cursor = cur ? { ...cur, count: cur.count + taken.count } : taken;
    return;
  }
  if (button === 0) {
    if (!cur) {
      if (slot) { inv.cursor = slot; c.set(i, null); }
    } else if (!slot) {
      if (!c.accepts || c.accepts(i, cur)) { c.set(i, cur); inv.cursor = null; }
    } else if (canStack(slot, cur)) {
      const max = maxStack(slot.id);
      const n = Math.min(max - slot.count, cur.count);
      slot.count += n; cur.count -= n;
      c.set(i, slot);
      if (cur.count <= 0) inv.cursor = null;
    } else if (!c.accepts || c.accepts(i, cur)) {
      c.set(i, cur); inv.cursor = slot;
    }
  } else {
    if (!cur) {
      if (slot) {
        const half = Math.ceil(slot.count / 2);
        inv.cursor = { ...slot, count: half };
        slot.count -= half;
        c.set(i, slot.count > 0 ? slot : null);
      }
    } else if (!slot) {
      if (!c.accepts || c.accepts(i, cur)) {
        c.set(i, { ...cur, count: 1 });
        cur.count--;
        if (cur.count <= 0 || creative) inv.cursor = creative ? cur : null;
        if (creative) cur.count++;
      }
    } else if (canStack(slot, cur) && slot.count < maxStack(slot.id)) {
      slot.count++; cur.count--;
      c.set(i, slot);
      if (cur.count <= 0) inv.cursor = null;
    } else if (!c.accepts || c.accepts(i, cur)) {
      // Java behaviour: a right-click on a slot holding something else (or a full stack of the same
      // item) swaps the slot content with the cursor stack.
      c.set(i, cur); inv.cursor = slot;
    }
  }
}

/** Shift-click: move a stack between the player's inventory and another container. */
export function quickMove(inv: PlayerInventory, from: Container, i: number, to: Container[]): void {
  const s = from.get(i);
  if (!s) return;
  if (from.outputOnly) {
    // craft as many as possible into inventory
    let guard = 0;
    while (guard++ < 64) {
      const cur = from.get(i);
      if (!cur) break;
      const taken = { ...cur };
      const left = inv.main.add(taken);
      if (left > 0) { taken.count = left; break; }
      from.onTake?.(i, taken);
    }
    return;
  }
  const remaining = { ...s };
  for (const t of to) {
    if (t.outputOnly) continue;
    if (t.accepts) {
      for (let k = 0; k < t.size; k++) {
        if (!t.get(k) && t.accepts(k, remaining)) { t.set(k, { ...remaining }); remaining.count = 0; break; }
      }
    } else {
      const max = maxStack(remaining.id);
      if (remaining.durability === undefined && !remaining.ench) {
        for (let k = 0; k < t.size && remaining.count > 0; k++) {
          const cur = t.get(k);
          if (cur && canStack(cur, remaining) && cur.count < max) {
            const n = Math.min(max - cur.count, remaining.count);
            cur.count += n; remaining.count -= n; t.set(k, cur);
          }
        }
      }
      for (let k = 0; k < t.size && remaining.count > 0; k++) {
        if (!t.get(k)) { const n = Math.min(max, remaining.count); t.set(k, { ...remaining, count: n }); remaining.count -= n; }
      }
    }
    if (remaining.count <= 0) break;
  }
  from.set(i, remaining.count > 0 ? remaining : null);
}
